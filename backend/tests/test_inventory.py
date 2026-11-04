"""Inventario por día: restricciones, descuento atómico, día local y proxies del admin."""
import threading
from datetime import date, datetime, timezone as utc_timezone
from decimal import Decimal
from unittest import mock

import pytest
from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError
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
    return ProductOffering.objects.get(product__slug="tres-leches-de-fresa", presentation="whole")


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
    other = ProductOffering.objects.get(product__slug="tres-leches-de-durazno", presentation="whole")
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
