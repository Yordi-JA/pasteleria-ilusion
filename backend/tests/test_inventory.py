"""Inventario por día: restricciones, descuento atómico, día local y proxies del admin."""
import threading
from datetime import date, datetime, timezone as utc_timezone
from decimal import Decimal
from unittest import mock

import pytest
from django.contrib.auth.models import Permission
from django.core.exceptions import NON_FIELD_ERRORS, ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.models import F
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from core_pasteleria.models import (
    Bread,
    BreadInventory,
    CatalogPrice,
    Inventory,
    Product,
    ProductOffering,
    ShowcaseInventory,
)
from core_pasteleria.repositories import product_repo

TODAY = date(2026, 11, 3)
TOMORROW = date(2026, 11, 4)


def rejected(operation):
    with pytest.raises(IntegrityError), transaction.atomic():
        operation()


def make_offering(slug="prueba", channel="showcase_and_order"):
    """Presentación propia de la prueba, para no depender de la semilla."""
    product = Product.objects.create(
        name=f"Producto {slug}", slug=slug, category="cake", summary="x", sales_channel=channel
    )
    price, _ = CatalogPrice.objects.get_or_create(name="Precio de prueba", defaults={"amount": Decimal("10")})
    return ProductOffering.objects.create(product=product, presentation="whole", price=price)


@pytest.fixture
def offering(db):
    # El mini, no el completo: el completo de un pastel lleva como mucho 1 pieza al día (D60)
    # y estas pruebas cargan varias.
    return ProductOffering.objects.get(product__slug="tres-leches-de-fresa", presentation="mini")


@pytest.fixture
def bread(db):
    return Bread.objects.get(slug="vainilla")


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(
        django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123")
    )
    return client


# --- Restricciones de la base ---


@pytest.mark.django_db
def test_showcase_row_with_offering_is_accepted(offering):
    Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=3).full_clean()


@pytest.mark.django_db
def test_bread_row_with_bread_is_accepted(bread):
    Inventory.objects.create(kind="bread", bread=bread, stock_date=TODAY, quantity=3).full_clean()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "kind, with_offering, with_bread",
    [
        ("showcase", True, True),
        ("showcase", False, False),
        ("showcase", False, True),
        ("bread", True, True),
        ("bread", False, False),
        ("bread", True, False),
    ],
)
def test_one_of_two_is_enforced_by_the_database(offering, bread, kind, with_offering, with_bread):
    rejected(
        lambda: Inventory.objects.create(
            kind=kind,
            offering=offering if with_offering else None,
            bread=bread if with_bread else None,
            stock_date=TODAY,
            quantity=1,
        )
    )


@pytest.mark.django_db
def test_second_row_for_the_same_offering_and_day_is_rejected(offering):
    Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=1)
    rejected(
        lambda: Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=2)
    )


@pytest.mark.django_db
def test_same_offering_on_another_day_is_accepted(offering):
    Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=1)
    Inventory.objects.create(kind="showcase", offering=offering, stock_date=date(2026, 11, 4), quantity=1)


@pytest.mark.django_db
def test_second_row_for_the_same_bread_and_day_is_rejected(bread):
    Inventory.objects.create(kind="bread", bread=bread, stock_date=TODAY, quantity=1)
    rejected(lambda: Inventory.objects.create(kind="bread", bread=bread, stock_date=TODAY, quantity=2))


@pytest.mark.django_db
def test_two_offerings_may_share_a_day(offering):
    other = ProductOffering.objects.get(product__slug="tres-leches-de-durazno", presentation="whole")
    Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=1)
    Inventory.objects.create(kind="showcase", offering=other, stock_date=TODAY, quantity=1)


@pytest.mark.django_db
def test_negative_quantity_is_rejected(offering):
    rejected(lambda: Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=-1))


@pytest.mark.django_db
def test_zero_quantity_means_sold_out_and_is_accepted(offering):
    Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=0).full_clean()


@pytest.mark.django_db
def test_decrement_below_zero_is_rejected_by_the_database(offering):
    row = Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=1)
    rejected(lambda: Inventory.objects.filter(pk=row.pk).update(quantity=F("quantity") - 2))


# Transaccional: los hilos necesitan filas confirmadas. `tests/conftest.py` vuelve
# a sembrar al terminar, así que no importa el orden de las pruebas.
@pytest.mark.django_db(transaction=True)
def test_with_one_piece_only_one_of_two_concurrent_decrements_succeeds():
    row = Inventory.objects.create(
        kind="showcase", offering=make_offering(), stock_date=TODAY, quantity=1
    )
    barrier = threading.Barrier(2)
    results = []

    def decrement():
        try:
            barrier.wait()
            results.append(product_repo.decrement_showcase_stock(row.offering_id, TODAY, 1))
        finally:
            connection.close()

    threads = [threading.Thread(target=decrement) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results) == [False, True]
    row.refresh_from_db()
    assert row.quantity == 0


# --- clean() ---


@pytest.mark.django_db
def test_clean_rejects_showcase_stock_for_an_order_only_product():
    red_velvet = ProductOffering.objects.get(product__slug="red-velvet")
    row = Inventory(kind="showcase", offering=red_velvet, stock_date=TODAY, quantity=1)
    with pytest.raises(ValidationError) as error:
        row.full_clean()
    assert "solo por encargo" in error.value.message_dict["offering"][0]


@pytest.mark.django_db
def test_clean_requires_the_subject_of_each_kind(offering, bread):
    with pytest.raises(ValidationError) as showcase:
        Inventory(kind="showcase", stock_date=TODAY, quantity=1).full_clean()
    assert "offering" in showcase.value.message_dict
    with pytest.raises(ValidationError) as bread_error:
        Inventory(kind="bread", stock_date=TODAY, quantity=1).full_clean()
    assert "bread" in bread_error.value.message_dict
    with pytest.raises(ValidationError):
        Inventory(kind="showcase", offering=offering, bread=bread, stock_date=TODAY, quantity=1).full_clean()
    with pytest.raises(ValidationError):
        Inventory(kind="bread", offering=offering, bread=bread, stock_date=TODAY, quantity=1).full_clean()


@pytest.mark.django_db
def test_product_cannot_become_order_only_while_it_has_showcase_stock(offering):
    product = offering.product
    Inventory.objects.create(kind="showcase", offering=offering, quantity=2)
    product.sales_channel = "order_only"
    with pytest.raises(ValidationError) as error:
        product.full_clean()
    assert "sales_channel" in error.value.message_dict


@pytest.mark.django_db
def test_product_can_become_order_only_when_the_stock_is_in_the_past(offering):
    product = offering.product
    Inventory.objects.create(kind="showcase", offering=offering, stock_date=date(2026, 1, 1), quantity=2)
    product.sales_channel = "order_only"
    product.full_clean()


# --- Día local ---

# 23:30 del 3 de noviembre en Ciudad de México (UTC-6) ya es 4 de noviembre en UTC.
LATE_NIGHT = datetime(2026, 11, 4, 5, 30, tzinfo=utc_timezone.utc)
AFTER_MIDNIGHT = datetime(2026, 11, 4, 6, 30, tzinfo=utc_timezone.utc)


@pytest.mark.django_db
def test_default_day_is_the_mexico_city_day_at_23_30(offering):
    with mock.patch("django.utils.timezone.now", return_value=LATE_NIGHT):
        assert LATE_NIGHT.date() == date(2026, 11, 4)
        row = Inventory.objects.create(kind="showcase", offering=offering, quantity=1)
    assert row.stock_date == TODAY


@pytest.mark.django_db
def test_default_day_changes_after_midnight_in_mexico_city(offering):
    with mock.patch("django.utils.timezone.now", return_value=AFTER_MIDNIGHT):
        row = Inventory.objects.create(kind="showcase", offering=offering, quantity=1)
    assert row.stock_date == date(2026, 11, 4)


@pytest.mark.django_db
def test_admin_list_shows_today_in_mexico_city_at_23_30(superuser_client, offering):
    Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=4)
    url = reverse("admin:core_pasteleria_showcaseinventory_changelist")
    with mock.patch("django.utils.timezone.now", return_value=LATE_NIGHT):
        assert len(superuser_client.get(url).context["cl"].result_list) == 1
    with mock.patch("django.utils.timezone.now", return_value=AFTER_MIDNIGHT):
        assert len(superuser_client.get(url).context["cl"].result_list) == 0


# --- Proxies del admin ---


@pytest.mark.django_db
def test_proxies_only_see_their_own_kind(offering, bread):
    Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=1)
    Inventory.objects.create(kind="bread", bread=bread, stock_date=TODAY, quantity=1)
    assert ShowcaseInventory.objects.count() == 1
    assert BreadInventory.objects.count() == 1
    assert Inventory.objects.count() == 2


@pytest.mark.django_db
def test_proxies_fix_the_kind_when_saving(offering, bread):
    showcase = ShowcaseInventory.objects.create(offering=offering, stock_date=TODAY, quantity=1)
    pan = BreadInventory.objects.create(bread=bread, stock_date=TODAY, quantity=1)
    assert (showcase.kind, pan.kind) == ("showcase", "bread")


@pytest.mark.django_db
def test_admin_list_defaults_to_today_and_can_show_every_day(superuser_client, offering):
    other = ProductOffering.objects.get(product__slug="tres-leches-de-durazno", presentation="whole")
    ShowcaseInventory.objects.create(offering=offering, quantity=4)
    ShowcaseInventory.objects.create(offering=other, stock_date=date(2026, 1, 1), quantity=1)
    url = reverse("admin:core_pasteleria_showcaseinventory_changelist")
    assert len(superuser_client.get(url).context["cl"].result_list) == 1
    assert len(superuser_client.get(url, {"day": "all"}).context["cl"].result_list) == 2


@pytest.mark.django_db
def test_admin_adds_showcase_stock_for_today_by_default(superuser_client, offering):
    url = reverse("admin:core_pasteleria_showcaseinventory_add")
    form = superuser_client.get(url).context["adminform"].form
    assert form["stock_date"].value() == timezone.localdate()
    response = superuser_client.post(
        url, {"offering": offering.pk, "stock_date": TODAY.isoformat(), "quantity": 5}
    )
    assert response.status_code == 302
    row = Inventory.objects.get(offering=offering)
    assert (row.kind, row.quantity) == ("showcase", 5)


@pytest.mark.django_db
def test_admin_adds_bread_stock(superuser_client, bread):
    response = superuser_client.post(
        reverse("admin:core_pasteleria_breadinventory_add"),
        {"bread": bread.pk, "stock_date": TODAY.isoformat(), "quantity": 2},
    )
    assert response.status_code == 302
    assert Inventory.objects.get(bread=bread).kind == "bread"


@pytest.mark.django_db
def test_admin_does_not_offer_order_only_products_in_the_showcase(superuser_client):
    form = superuser_client.get(reverse("admin:core_pasteleria_showcaseinventory_add")).context["adminform"].form
    offered = form.fields["offering"].queryset
    assert not offered.filter(product__slug="red-velvet").exists()
    assert offered.filter(product__slug="tres-leches-de-fresa").exists()


@pytest.mark.django_db
def test_admin_rejects_a_second_row_for_the_same_day(superuser_client, offering):
    ShowcaseInventory.objects.create(offering=offering, stock_date=TODAY, quantity=1)
    response = superuser_client.post(
        reverse("admin:core_pasteleria_showcaseinventory_add"),
        {"offering": offering.pk, "stock_date": TODAY.isoformat(), "quantity": 5},
    )
    assert response.status_code == 200
    assert Inventory.objects.filter(offering=offering).count() == 1


@pytest.mark.django_db
def test_counter_staff_with_only_showcase_permissions_can_use_the_showcase(client, django_user_model, offering):
    staff = django_user_model.objects.create_user("mostrador@pasteleria.test", "clave-123-segura", is_staff=True)
    staff.user_permissions.add(
        *Permission.objects.filter(
            content_type__model="showcaseinventory",
            codename__in=["view_showcaseinventory", "change_showcaseinventory"],
        )
    )
    client.force_login(staff)
    assert client.get(reverse("admin:core_pasteleria_showcaseinventory_changelist")).status_code == 200
    assert client.get(reverse("admin:core_pasteleria_breadinventory_changelist")).status_code == 403
    assert client.get(reverse("admin:core_pasteleria_product_changelist")).status_code == 403


# --- Bloqueo optimista: nadie pisa un cambio que no vio ---


def change_url(row):
    return reverse("admin:core_pasteleria_showcaseinventory_change", args=[row.pk])


def list_page(client):
    """Carga la lista y devuelve (formulario de la primera fila, token de carga)."""
    response = client.get(reverse("admin:core_pasteleria_showcaseinventory_changelist"))
    form = response.context["cl"].formset.forms[0]
    return form["loaded_at"].value()


def list_post(client, row, token, quantity):
    return client.post(
        reverse("admin:core_pasteleria_showcaseinventory_changelist"),
        {
            "form-TOTAL_FORMS": 1, "form-INITIAL_FORMS": 1, "form-MIN_NUM_FORMS": 0,
            "form-MAX_NUM_FORMS": 1000, "form-0-id": row.pk, "form-0-quantity": quantity,
            "form-0-loaded_at": token, "_save": "Guardar",
        },
    )


STALE_MESSAGE = "Las existencias cambiaron mientras editabas; recarga la página"


@pytest.mark.django_db
def test_list_save_fails_when_the_row_changed_after_the_page_loaded(superuser_client, offering):
    row = ShowcaseInventory.objects.create(offering=offering, quantity=4)
    token = list_page(superuser_client)
    assert product_repo.decrement_showcase_stock(offering.id, timezone.localdate(), 1)
    response = list_post(superuser_client, row, token, 9)
    assert response.status_code == 200
    assert STALE_MESSAGE in response.content.decode()
    row.refresh_from_db()
    assert row.quantity == 3


@pytest.mark.django_db
def test_list_save_succeeds_when_nothing_changed_since_the_page_loaded(superuser_client, offering):
    row = ShowcaseInventory.objects.create(offering=offering, quantity=4)
    token = list_page(superuser_client)
    response = list_post(superuser_client, row, token, 9)
    assert response.status_code == 302
    row.refresh_from_db()
    assert row.quantity == 9


def two_rows(offering):
    """Existencias de hoy para dos presentaciones distintas: (A, B)."""
    other = ProductOffering.objects.get(product__slug="tres-leches-de-durazno", presentation="mini")
    row_a = ShowcaseInventory.objects.create(offering=offering, quantity=4)
    row_b = ShowcaseInventory.objects.create(offering=other, quantity=4)
    return row_a, row_b


def load_list(client):
    """Carga la lista y devuelve sus formularios por llave de fila, como los ve quien edita."""
    response = client.get(reverse("admin:core_pasteleria_showcaseinventory_changelist"))
    return {form.instance.pk: form for form in response.context["cl"].formset.forms}


def save_list(client, loaded, edits):
    """Guarda la lista como lo haría el navegador: lo no editado se reenvía como se cargó."""
    data = {
        "form-TOTAL_FORMS": len(loaded), "form-INITIAL_FORMS": len(loaded),
        "form-MIN_NUM_FORMS": 0, "form-MAX_NUM_FORMS": 1000, "_save": "Guardar",
    }
    for index, (pk, form) in enumerate(loaded.items()):
        data[f"form-{index}-id"] = pk
        data[f"form-{index}-quantity"] = edits.get(pk, form.initial["quantity"])
        data[f"form-{index}-loaded_at"] = form["loaded_at"].value()
        data[f"initial-form-{index}-quantity"] = form.initial["quantity"]
    return client.post(reverse("admin:core_pasteleria_showcaseinventory_changelist"), data)


@pytest.mark.django_db
def test_a_sale_on_a_row_the_clerk_did_not_edit_does_not_block_the_save(superuser_client, offering):
    row_a, row_b = two_rows(offering)
    loaded = load_list(superuser_client)
    assert product_repo.decrement_showcase_stock(row_b.offering_id, timezone.localdate(), 1)
    response = save_list(superuser_client, loaded, {row_a.pk: 9})
    assert response.status_code == 302
    row_a.refresh_from_db()
    row_b.refresh_from_db()
    assert (row_a.quantity, row_b.quantity) == (9, 3)


@pytest.mark.django_db
def test_a_sale_on_the_row_the_clerk_edited_fails_the_save_and_writes_nothing(superuser_client, offering):
    row_a, row_b = two_rows(offering)
    loaded = load_list(superuser_client)
    assert product_repo.decrement_showcase_stock(row_a.offering_id, timezone.localdate(), 1)
    response = save_list(superuser_client, loaded, {row_a.pk: 9})
    assert response.status_code == 200
    assert STALE_MESSAGE in response.content.decode()
    row_a.refresh_from_db()
    row_b.refresh_from_db()
    assert (row_a.quantity, row_b.quantity) == (3, 4)


@pytest.mark.django_db
def test_with_two_edited_rows_and_one_stale_neither_is_written(superuser_client, offering):
    row_a, row_b = two_rows(offering)
    loaded = load_list(superuser_client)
    assert product_repo.decrement_showcase_stock(row_b.offering_id, timezone.localdate(), 1)
    response = save_list(superuser_client, loaded, {row_a.pk: 9, row_b.pk: 8})
    assert response.status_code == 200
    assert STALE_MESSAGE in response.content.decode()
    row_a.refresh_from_db()
    row_b.refresh_from_db()
    assert (row_a.quantity, row_b.quantity) == (4, 3)


@pytest.mark.django_db
def test_with_two_edited_rows_and_none_stale_both_are_written(superuser_client, offering):
    row_a, row_b = two_rows(offering)
    loaded = load_list(superuser_client)
    assert save_list(superuser_client, loaded, {row_a.pk: 9, row_b.pk: 8}).status_code == 302
    row_a.refresh_from_db()
    row_b.refresh_from_db()
    assert (row_a.quantity, row_b.quantity) == (9, 8)


@pytest.mark.django_db
def test_only_edited_rows_are_locked(superuser_client, offering):
    row_a, _ = two_rows(offering)
    loaded = load_list(superuser_client)
    with CaptureQueriesContext(connection) as queries:
        assert save_list(superuser_client, loaded, {row_a.pk: 9}).status_code == 302
    locking = [q["sql"] for q in queries if "FOR UPDATE" in q["sql"]]
    assert len(locking) == 1


@pytest.mark.django_db
def test_the_list_renders_the_quantity_the_page_was_loaded_with(superuser_client, offering):
    two_rows(offering)
    response = superuser_client.get(reverse("admin:core_pasteleria_showcaseinventory_changelist"))
    content = response.content.decode()
    assert 'name="initial-form-0-quantity"' in content
    assert 'name="initial-form-1-quantity"' in content


@pytest.mark.django_db
def test_list_save_fails_after_another_clerk_saved_first(superuser_client, offering):
    row = ShowcaseInventory.objects.create(offering=offering, quantity=4)
    token = list_page(superuser_client)
    assert list_post(superuser_client, row, token, 7).status_code == 302
    second = list_post(superuser_client, row, token, 9)
    assert second.status_code == 200
    assert STALE_MESSAGE in second.content.decode()
    row.refresh_from_db()
    assert row.quantity == 7


@pytest.mark.django_db
def test_list_save_without_a_token_is_refused(superuser_client, offering):
    row = ShowcaseInventory.objects.create(offering=offering, quantity=4)
    for token in ("", "no-es-una-fecha"):
        response = list_post(superuser_client, row, token, 9)
        assert response.status_code == 200
        assert STALE_MESSAGE in response.content.decode()
    row.refresh_from_db()
    assert row.quantity == 4


@pytest.mark.django_db
def test_change_form_save_fails_when_the_row_changed_after_the_form_loaded(superuser_client, offering):
    row = ShowcaseInventory.objects.create(offering=offering, quantity=4)
    token = superuser_client.get(change_url(row)).context["adminform"].form["loaded_at"].value()
    assert product_repo.restock_showcase(offering.id, timezone.localdate(), 5)
    data = {
        "offering": offering.pk, "stock_date": row.stock_date.isoformat(), "quantity": 1,
        "loaded_at": token,
    }
    response = superuser_client.post(change_url(row), data)
    assert response.status_code == 200
    assert STALE_MESSAGE in response.content.decode()
    row.refresh_from_db()
    assert row.quantity == 9


@pytest.mark.django_db
def test_change_form_saved_without_edits_still_fails_if_the_row_changed(superuser_client, offering):
    """El formulario de cambio siempre escribe la fila: guardarlo sin tocar nada pisaría una venta."""
    row = ShowcaseInventory.objects.create(offering=offering, quantity=4)
    form = superuser_client.get(change_url(row)).context["adminform"].form
    assert product_repo.decrement_showcase_stock(offering.id, timezone.localdate(), 1)
    data = {
        "offering": offering.pk, "stock_date": row.stock_date.isoformat(), "quantity": 4,
        "initial-quantity": 4, "loaded_at": form["loaded_at"].value(),
    }
    response = superuser_client.post(change_url(row), data)
    assert response.status_code == 200
    assert STALE_MESSAGE in response.content.decode()
    row.refresh_from_db()
    assert row.quantity == 3


@pytest.mark.django_db
def test_change_form_save_succeeds_when_nothing_changed(superuser_client, offering):
    row = ShowcaseInventory.objects.create(offering=offering, quantity=4)
    token = superuser_client.get(change_url(row)).context["adminform"].form["loaded_at"].value()
    data = {
        "offering": offering.pk, "stock_date": row.stock_date.isoformat(), "quantity": 1,
        "loaded_at": token,
    }
    assert superuser_client.post(change_url(row), data).status_code == 302
    row.refresh_from_db()
    assert row.quantity == 1


@pytest.mark.django_db
def test_bread_change_form_is_protected_too(superuser_client, bread):
    row = BreadInventory.objects.create(bread=bread, quantity=4)
    url = reverse("admin:core_pasteleria_breadinventory_change", args=[row.pk])
    token = superuser_client.get(url).context["adminform"].form["loaded_at"].value()
    assert product_repo.consume_bread(bread.id, timezone.localdate(), 1)
    data = {"bread": bread.pk, "stock_date": row.stock_date.isoformat(), "quantity": 9, "loaded_at": token}
    response = superuser_client.post(url, data)
    assert response.status_code == 200
    assert STALE_MESSAGE in response.content.decode()
    row.refresh_from_db()
    assert row.quantity == 3


@pytest.mark.django_db
def test_adding_stock_needs_no_token(superuser_client, offering):
    response = superuser_client.post(
        reverse("admin:core_pasteleria_showcaseinventory_add"),
        {"offering": offering.pk, "stock_date": timezone.localdate().isoformat(), "quantity": 5},
    )
    assert response.status_code == 302


@pytest.mark.django_db
@pytest.mark.parametrize(
    "operation",
    ["decrement_showcase_stock", "restock_showcase"],
)
def test_showcase_repository_writes_change_updated_at(offering, operation):
    row = Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=4)
    before = Inventory.objects.get(pk=row.pk).updated_at
    assert getattr(product_repo, operation)(offering.id, TODAY, 1) is True
    assert Inventory.objects.get(pk=row.pk).updated_at != before


@pytest.mark.django_db
@pytest.mark.parametrize("operation", ["consume_bread", "release_bread"])
def test_bread_repository_writes_change_updated_at(bread, operation):
    row = Inventory.objects.create(kind="bread", bread=bread, stock_date=TODAY, quantity=4)
    before = Inventory.objects.get(pk=row.pk).updated_at
    assert getattr(product_repo, operation)(bread.id, TODAY, 1) is True
    assert Inventory.objects.get(pk=row.pk).updated_at != before


@pytest.mark.django_db
def test_a_refused_decrement_does_not_touch_updated_at(offering):
    row = Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=1)
    before = Inventory.objects.get(pk=row.pk).updated_at
    assert product_repo.decrement_showcase_stock(offering.id, TODAY, 2) is False
    assert Inventory.objects.get(pk=row.pk).updated_at == before


@pytest.mark.django_db
def test_inventory_list_does_not_query_per_row(superuser_client, django_assert_num_queries):
    """Cuántas consultas hace la lista no depende de cuántas filas tenga."""
    url = reverse("admin:core_pasteleria_showcaseinventory_changelist")
    offerings = list(ProductOffering.objects.filter(presentation="whole")[:5])
    ShowcaseInventory.objects.create(offering=offerings[0], quantity=1)
    with CaptureQueriesContext(connection) as one_row:
        superuser_client.get(url)
    for extra in offerings[1:]:
        ShowcaseInventory.objects.create(offering=extra, quantity=1)
    with django_assert_num_queries(len(one_row)):
        superuser_client.get(url)


# --- Un pastel por sabor en la vitrina (D60) ---
#
# Aplica a los productos que se venden en rebanadas (pasteles, Posible e Imposible):
# como mucho un completo por día y nunca completo y rebanadas el mismo día. El mini
# y lo que no tiene rebanada quedan fuera.

ONE_WHOLE_CAKE = "un solo pastel completo"
WHOLE_AND_SLICES = "completo y en rebanadas"


def showcase_row(slug, presentation, quantity=1, day=TODAY):
    offering = ProductOffering.objects.get(product__slug=slug, presentation=presentation)
    return Inventory(kind="showcase", offering=offering, stock_date=day, quantity=quantity)


@pytest.mark.django_db
@pytest.mark.parametrize("slug", ["tres-leches-de-fresa", "choco-pinguino", "posible", "imposible"])
def test_clean_rejects_two_whole_cakes_of_a_flavor_sold_in_slices(slug):
    with pytest.raises(ValidationError) as error:
        showcase_row(slug, "whole", quantity=2).full_clean()
    assert ONE_WHOLE_CAKE in error.value.message_dict["quantity"][0]


@pytest.mark.django_db
@pytest.mark.parametrize("quantity", [0, 1])
def test_clean_accepts_one_whole_cake_or_the_one_already_sold(quantity):
    showcase_row("posible", "whole", quantity=quantity).full_clean()


@pytest.mark.django_db
@pytest.mark.parametrize("slug", ["tres-leches-de-fresa", "posible", "imposible"])
@pytest.mark.parametrize(("loaded", "added"), [("slice", "whole"), ("whole", "slice")])
def test_clean_rejects_whole_and_slices_of_one_product_the_same_day(slug, loaded, added):
    showcase_row(slug, loaded, quantity=1 if loaded == "whole" else 10).save()
    with pytest.raises(ValidationError) as error:
        showcase_row(slug, added).full_clean()
    assert WHOLE_AND_SLICES in error.value.message_dict[NON_FIELD_ERRORS][0]


@pytest.mark.django_db
def test_a_sold_out_slice_row_still_counts_as_the_sliced_cake_of_that_day():
    showcase_row("imposible", "slice", quantity=0).save()
    with pytest.raises(ValidationError):
        showcase_row("imposible", "whole").full_clean()


@pytest.mark.django_db
def test_clean_accepts_the_same_product_whole_one_day_and_sliced_another():
    showcase_row("tres-leches-de-durazno", "whole", day=TODAY).save()
    showcase_row("tres-leches-de-durazno", "slice", quantity=10, day=TOMORROW).full_clean()
    showcase_row("tres-leches-de-durazno", "whole", day=TOMORROW).full_clean()


@pytest.mark.django_db
def test_a_mini_may_share_its_flavor_with_the_whole_cake_or_the_sliced_one():
    showcase_row("tres-leches-de-cajeta", "whole").save()
    showcase_row("tres-leches-de-cajeta", "mini", quantity=2).full_clean()
    showcase_row("tres-leches-de-fresa", "slice", quantity=10).save()
    showcase_row("tres-leches-de-fresa", "mini", quantity=2).full_clean()


@pytest.mark.django_db
@pytest.mark.parametrize(("slug", "presentation"), [("gelatina-de-molde", "whole"), ("tarta-de-frutas", "large")])
def test_products_not_sold_in_slices_are_outside_the_rule(slug, presentation):
    showcase_row(slug, presentation, quantity=3).full_clean()


@pytest.mark.django_db
def test_a_row_is_never_compared_with_itself():
    """La fila guardada sigue siendo el completo en la base; sin excluirla, la rebanada chocaría con ella."""
    row = showcase_row("posible", "whole")
    row.save()
    row.offering = ProductOffering.objects.get(product__slug="posible", presentation="slice")
    row.quantity = 10
    row.full_clean()


# --- "Dejar rebanarlo" (decisión de la dueña, D60): un completo vendido no bloquea las rebanadas ---


@pytest.mark.django_db
def test_slices_may_be_loaded_once_the_whole_cake_of_that_day_is_sold():
    showcase_row("tres-leches-de-fresa", "whole", quantity=0).save()
    showcase_row("tres-leches-de-fresa", "slice", quantity=10).full_clean()


@pytest.mark.django_db
def test_slices_are_rejected_while_the_whole_cake_is_still_there():
    showcase_row("tres-leches-de-fresa", "whole", quantity=1).save()
    with pytest.raises(ValidationError) as error:
        showcase_row("tres-leches-de-fresa", "slice", quantity=10).full_clean()
    assert WHOLE_AND_SLICES in error.value.message_dict[NON_FIELD_ERRORS][0]


@pytest.mark.django_db
def test_a_whole_cake_cannot_come_back_once_the_product_was_sliced_that_day():
    showcase_row("imposible", "slice", quantity=0).save()
    with pytest.raises(ValidationError):
        showcase_row("imposible", "whole", quantity=1).full_clean()


@pytest.mark.django_db
def test_raising_the_sold_whole_cake_to_one_after_slicing_it_is_rejected():
    whole = showcase_row("posible", "whole", quantity=0)
    whole.save()
    showcase_row("posible", "slice", quantity=10).save()
    whole.full_clean()
    whole.quantity = 1
    with pytest.raises(ValidationError) as error:
        whole.full_clean()
    assert WHOLE_AND_SLICES in error.value.message_dict[NON_FIELD_ERRORS][0]


@pytest.mark.django_db
def test_the_rule_locks_the_product_while_it_validates():
    """Dos altas a la vez del completo y de las rebanadas de un producto se esperan una a la otra."""
    with CaptureQueriesContext(connection) as queries:
        showcase_row("posible", "slice", quantity=10).full_clean()
    lock = first_query(queries, Product, for_update=True)
    assert lock is not None
    # El candado va antes de buscar el par en el inventario.
    assert lock < first_query(queries, Inventory)


def first_query(queries, model, *, for_update=False):
    """Índice de la primera consulta a la tabla del modelo (solo las `FOR UPDATE` si se pide), o `None`."""
    table = f'FROM "{model._meta.db_table}"'
    return next(
        (i for i, q in enumerate(queries) if table in q["sql"] and (not for_update or "FOR UPDATE" in q["sql"])),
        None,
    )


@pytest.mark.django_db
def test_the_list_locks_the_product_before_the_inventory_row(superuser_client):
    """Siempre el mismo orden de candados (producto, luego inventario): dos guardados no se bloquean en cruz."""
    whole = ShowcaseInventory.objects.create(
        offering=ProductOffering.objects.get(product__slug="posible", presentation="whole"), quantity=1
    )
    with CaptureQueriesContext(connection) as queries:
        response = save_one_row(superuser_client, "today", whole.pk, 0)
    assert response.status_code == 302
    product_lock = first_query(queries, Product, for_update=True)
    inventory_lock = first_query(queries, Inventory, for_update=True)
    assert product_lock is not None and inventory_lock is not None
    assert product_lock < inventory_lock


def add_showcase_row(client, offering, quantity):
    return client.post(
        reverse("admin:core_pasteleria_showcaseinventory_add"),
        {"offering": offering.pk, "stock_date": TODAY.isoformat(), "quantity": quantity},
    )


@pytest.mark.django_db
def test_admin_add_form_rejects_a_second_whole_cake_with_the_message(superuser_client):
    whole = ProductOffering.objects.get(product__slug="imposible", presentation="whole")
    response = add_showcase_row(superuser_client, whole, 2)
    assert response.status_code == 200
    assert ONE_WHOLE_CAKE in response.content.decode()
    assert not Inventory.objects.filter(offering=whole).exists()


@pytest.mark.django_db
def test_admin_add_form_rejects_the_whole_cake_of_the_sliced_one_with_the_message(superuser_client):
    showcase_row("tres-leches-de-durazno", "slice", quantity=10).save()
    whole = ProductOffering.objects.get(product__slug="tres-leches-de-durazno", presentation="whole")
    response = add_showcase_row(superuser_client, whole, 1)
    assert response.status_code == 200
    assert WHOLE_AND_SLICES in response.content.decode()
    assert not Inventory.objects.filter(offering=whole).exists()


@pytest.mark.django_db
def test_admin_list_rejects_raising_a_whole_cake_above_one(superuser_client):
    whole = ProductOffering.objects.get(product__slug="tres-leches-de-fresa", presentation="whole")
    row = ShowcaseInventory.objects.create(offering=whole, quantity=1)
    response = list_post(superuser_client, row, list_page(superuser_client), 2)
    assert response.status_code == 200
    assert ONE_WHOLE_CAKE in response.content.decode()
    row.refresh_from_db()
    assert row.quantity == 1


@pytest.mark.django_db
def test_admin_list_saves_the_edited_row_despite_an_old_row_that_breaks_the_rule(superuser_client):
    """Una fila que nadie editó no se guarda, así que no se valida: no bloquea el resto de la lista."""
    old = ShowcaseInventory.objects.create(
        offering=ProductOffering.objects.get(product__slug="tres-leches-de-fresa", presentation="whole"), quantity=3
    )
    mini = ShowcaseInventory.objects.create(
        offering=ProductOffering.objects.get(product__slug="tres-leches-de-durazno", presentation="mini"), quantity=2
    )
    loaded = load_list(superuser_client)
    assert save_list(superuser_client, loaded, {mini.pk: 4}).status_code == 302
    mini.refresh_from_db()
    old.refresh_from_db()
    assert (mini.quantity, old.quantity) == (4, 3)


def changelist(day="today"):
    return f"{reverse('admin:core_pasteleria_showcaseinventory_changelist')}?day={day}"


def save_one_row(client, day, row_pk, quantity):
    """Carga la lista de ese filtro y guarda solo la fila `row_pk` con la cantidad dada."""
    forms = {form.instance.pk: form for form in client.get(changelist(day)).context["cl"].formset.forms}
    data = {
        "form-TOTAL_FORMS": len(forms), "form-INITIAL_FORMS": len(forms),
        "form-MIN_NUM_FORMS": 0, "form-MAX_NUM_FORMS": 1000, "_save": "Guardar",
    }
    for index, (pk, form) in enumerate(forms.items()):
        data[f"form-{index}-id"] = pk
        data[f"form-{index}-quantity"] = quantity if pk == row_pk else form.initial["quantity"]
        data[f"form-{index}-loaded_at"] = form["loaded_at"].value()
        data[f"initial-form-{index}-quantity"] = form.initial["quantity"]
    return client.post(changelist(day), data)


@pytest.mark.django_db
def test_admin_list_shows_the_whole_and_slices_error_on_its_row(superuser_client):
    """Un par que saltó la validación (sembrado sin `clean()`): al editar la rebanada, el error sale en su fila."""
    ShowcaseInventory.objects.create(
        offering=ProductOffering.objects.get(product__slug="tres-leches-de-fresa", presentation="whole"), quantity=1
    )
    slice_row = ShowcaseInventory.objects.create(
        offering=ProductOffering.objects.get(product__slug="tres-leches-de-fresa", presentation="slice"), quantity=10
    )
    response = save_one_row(superuser_client, "today", slice_row.pk, 8)
    assert response.status_code == 200
    errors = [form.non_field_errors() for form in response.context["cl"].formset.forms if form.instance.pk == slice_row.pk]
    assert WHOLE_AND_SLICES in str(errors[0])
    slice_row.refresh_from_db()
    assert slice_row.quantity == 10


@pytest.mark.django_db
def test_admin_list_shows_the_order_only_error_instead_of_failing(superuser_client):
    """Una fila pasada de un producto que luego pasó a "solo por encargo": su error no tiene campo en la lista."""
    offering = make_offering("ya-por-encargo")
    old = ShowcaseInventory.objects.create(offering=offering, stock_date=date(2026, 1, 1), quantity=2)
    Product.objects.filter(pk=offering.product_id).update(sales_channel="order_only")
    response = save_one_row(superuser_client, "all", old.pk, 3)
    assert response.status_code == 200
    assert "solo por encargo no tiene existencias de vitrina" in response.content.decode()
    old.refresh_from_db()
    assert old.quantity == 2
