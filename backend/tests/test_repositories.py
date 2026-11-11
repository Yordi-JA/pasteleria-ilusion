"""Repositorios de catálogo, opciones de "Diseña tu pastel" y configuración.

Consultas contra PostgreSQL y paridad con los repositorios en memoria.
"""
import ast
import dataclasses
import inspect
import threading
from datetime import date, time
from decimal import Decimal

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.db import connection

from core_pasteleria.models import (
    Bread,
    CakeStand,
    DecorationOption,
    FillingFlavor,
    Inventory,
    PolicySettings,
    Product,
    ProductOffering,
    StoreSettings,
)
from core_pasteleria.repositories import (
    cake_option_repo,
    memory,
    product_repo,
    records,
    settings_repo,
)
from tests.test_cake_options import RULE_TABLE_4_5

TODAY = date(2026, 11, 3)
TOMORROW = date(2026, 11, 4)

pytestmark = pytest.mark.django_db


def offering_of(slug, presentation):
    return ProductOffering.objects.get(product__slug=slug, presentation=presentation)


def load_stock(slug, presentation, quantity, on_date=TODAY):
    return Inventory.objects.create(
        kind="showcase", offering=offering_of(slug, presentation), stock_date=on_date, quantity=quantity
    )


def slugs(items):
    return [getattr(item, "slug", None) or item.product_slug for item in items]


# --- Catálogo ---


def test_catalog_lists_every_active_product_in_order():
    catalog = product_repo.list_catalog(on_date=TODAY)
    assert len(catalog) == 22
    assert catalog[0].slug == "tres-leches-de-durazno"
    assert catalog[-1].slug == "gelatina-de-duvalin"
    assert [p.slug for p in catalog] == list(
        Product.objects.order_by("sort_order", "name").values_list("slug", flat=True)
    )


def test_catalog_filters_by_category():
    assert len(product_repo.list_catalog(on_date=TODAY, category="cake")) == 14
    assert len(product_repo.list_catalog(on_date=TODAY, category="dessert")) == 8


def test_catalog_search_ignores_case_and_looks_in_name_and_summary():
    queso = product_repo.list_catalog(on_date=TODAY, search="  QUESO ")
    assert slugs(queso) == ["tres-leches-con-queso-y-chocolate", "tres-leches-con-queso-y-zarzamora"]
    # "flan" está en el nombre (Flan napolitano) y en la descripción corta (Imposible, Posible).
    flan = set(slugs(product_repo.list_catalog(on_date=TODAY, search="flan")))
    assert {"flan-napolitano", "imposible", "posible", "tres-leches-con-flan-y-cajeta"} <= flan
    assert len(product_repo.list_catalog(on_date=TODAY, search="   ")) == 22
    assert product_repo.list_catalog(on_date=TODAY, search="no existe") == []


def test_catalog_search_combines_with_category():
    result = product_repo.list_catalog(on_date=TODAY, category="dessert", search="flan")
    assert all(product.category == "dessert" for product in result)
    assert "tres-leches-con-flan-y-cajeta" not in slugs(result)


@pytest.mark.parametrize("term", ["pinguino", "PINGÜINO", "pingüino", "Pinguïno"])
def test_catalog_search_ignores_accents_in_the_name_and_in_the_term(term):
    assert slugs(product_repo.list_catalog(on_date=TODAY, search=term)) == ["choco-pinguino"]


def test_catalog_search_ignores_accents_in_the_summary():
    Product.objects.filter(slug="tarta-de-frutas").update(summary="Con crema de limón.")
    for term in ("limon", "LIMÓN", "limón"):
        assert slugs(product_repo.list_catalog(on_date=TODAY, search=term)) == ["tarta-de-frutas"], term
    assert slugs(product_repo.list_catalog(on_date=TODAY, search="duvalin")) == ["gelatina-de-duvalin"]


def test_catalog_hides_inactive_products_and_offerings():
    Product.objects.filter(slug="posible").update(is_active=False)
    ProductOffering.objects.filter(product__slug="imposible", presentation="slice").update(is_active=False)
    catalog = {p.slug: p for p in product_repo.list_catalog(on_date=TODAY)}
    assert "posible" not in catalog
    assert [o.presentation for o in catalog["imposible"].offerings] == ["whole"]


def test_catalog_offerings_carry_price_weight_servings_and_order():
    durazno = next(p for p in product_repo.list_catalog(on_date=TODAY) if p.slug == "tres-leches-de-durazno")
    assert [(o.presentation, o.price) for o in durazno.offerings] == [
        ("whole", Decimal("350.00")), ("slice", Decimal("35.00")), ("mini", Decimal("130.00")),
    ]
    whole, _, mini = durazno.offerings
    assert (whole.approx_weight_kg, whole.servings) == (Decimal("2.7"), 19)
    assert (mini.approx_weight_kg, mini.servings) == (None, 3)
    assert (durazno.cake_type, durazno.filling_base_slug, durazno.filling_flavor_slug) == (
        "tres_leches", "normal", "durazno",
    )
    assert durazno.bread_id is None and durazno.bread_slug is None


def test_catalog_stock_is_none_without_a_row_and_zero_when_sold_out():
    load_stock("tres-leches-de-fresa", "whole", 4)
    load_stock("tres-leches-de-durazno", "whole", 0)
    load_stock("tres-leches-de-fresa", "whole", 9, on_date=TOMORROW)
    catalog = {p.slug: p for p in product_repo.list_catalog(on_date=TODAY)}
    stocks = {s: {o.presentation: o.stock for o in catalog[s].offerings} for s in catalog}
    assert stocks["tres-leches-de-fresa"] == {"whole": 4, "slice": None, "mini": None}
    assert stocks["tres-leches-de-durazno"]["whole"] == 0
    assert stocks["imposible"] == {"whole": None, "slice": None}


def test_catalog_uses_two_queries(django_assert_num_queries):
    with django_assert_num_queries(2):
        product_repo.list_catalog(on_date=TODAY, category="cake", search="tres")


def test_photo_of_the_offering_replaces_the_one_of_the_product():
    Product.objects.filter(slug="imposible").update(photo="imposible.webp")
    ProductOffering.objects.filter(product__slug="imposible", presentation="slice").update(
        photo="imposible-rebanada.webp"
    )
    product = product_repo.get_product_by_slug("imposible", TODAY)
    assert {o.presentation: o.photo for o in product.offerings} == {
        "whole": "imposible.webp", "slice": "imposible-rebanada.webp",
    }
    assert product.photo == "imposible.webp"
    assert next(p for p in product_repo.list_catalog(on_date=TODAY) if p.slug == "posible").photo == ""


# --- Ficha ---


def test_product_detail_by_slug_with_stock_of_the_day():
    load_stock("tres-leches-de-durazno", "whole", 3)
    product = product_repo.get_product_by_slug("tres-leches-de-durazno", TODAY)
    assert product.name == "Tres leches de durazno"
    assert product.summary == "Relleno de durazno y cobertura de crema pastelera."
    assert (product.storage_notes, product.transport_notes) == ("", "")
    assert [o.stock for o in product.offerings] == [3, None, None]
    assert all(o.product_slug == "tres-leches-de-durazno" for o in product.offerings)


def test_product_detail_is_none_when_missing_or_inactive():
    assert product_repo.get_product_by_slug("no-existe", TODAY) is None
    Product.objects.filter(slug="posible").update(is_active=False)
    assert product_repo.get_product_by_slug("posible", TODAY) is None


def test_product_detail_uses_two_queries(django_assert_num_queries):
    with django_assert_num_queries(2):
        product_repo.get_product_by_slug("choco-pinguino", TODAY)


def test_red_velvet_detail_is_order_only_with_one_offering():
    product = product_repo.get_product_by_slug("red-velvet", TODAY)
    assert product.sales_channel == "order_only"
    assert [(o.presentation, o.price, o.approx_weight_kg) for o in product.offerings] == [
        ("whole", Decimal("450.00"), None)
    ]


def test_inactive_design_options_are_not_offered_as_presets():
    """"Personalizar este pastel" no debe preelegir lo que "Diseña tu pastel" ya no ofrece."""
    from core_pasteleria.models import FillingBase

    Bread.objects.filter(slug="choco_pinguino").update(is_active=False)
    FillingBase.objects.filter(slug="queso").update(is_active=False)
    FillingFlavor.objects.filter(slug="zarzamora").update(is_active=False)
    choco = product_repo.get_product_by_slug("choco-pinguino", TODAY)
    assert choco.bread_slug is None
    # El id del pan se conserva: el pan de hoy del inventario lo sigue usando.
    assert choco.bread_id == Bread.objects.get(slug="choco_pinguino").id
    queso = product_repo.get_product_by_slug("tres-leches-con-queso-y-zarzamora", TODAY)
    assert (queso.filling_base_slug, queso.filling_flavor_slug) == (None, None)
    durazno = product_repo.get_product_by_slug("tres-leches-de-durazno", TODAY)
    assert (durazno.filling_base_slug, durazno.filling_flavor_slug) == ("normal", "durazno")
    red_velvet = product_repo.get_product_by_slug("red-velvet", TODAY)
    assert red_velvet.bread_slug == "red_velvet"


def test_presets_do_not_add_queries(django_assert_num_queries):
    with django_assert_num_queries(2):
        product_repo.list_catalog(on_date=TODAY)


# --- Vitrina y rebanadas ---


def test_showcase_is_empty_when_nothing_was_loaded_for_the_day():
    load_stock("tres-leches-de-fresa", "whole", 4, on_date=TOMORROW)
    assert product_repo.list_showcase(TODAY) == []
    assert product_repo.list_slices(TODAY) == []


def test_showcase_lists_loaded_presentations_without_slices_and_keeps_sold_out():
    load_stock("tres-leches-de-fresa", "whole", 4)
    load_stock("tres-leches-de-fresa", "slice", 6)
    load_stock("tres-leches-de-durazno", "mini", 0)
    load_stock("flan-napolitano", "large", 2)
    load_stock("mosaico-con-crema", "cup", 12)
    showcase = product_repo.list_showcase(TODAY)
    assert [(o.product_slug, o.presentation, o.stock) for o in showcase] == [
        ("tres-leches-de-durazno", "mini", 0),
        ("tres-leches-de-fresa", "whole", 4),
        ("flan-napolitano", "large", 2),
        ("mosaico-con-crema", "cup", 12),
    ]
    assert showcase[0].price == Decimal("130.00")


def test_showcase_filters_by_category():
    load_stock("tres-leches-de-fresa", "whole", 4)
    load_stock("imposible", "whole", 2)
    assert slugs(product_repo.list_showcase(TODAY, category="dessert")) == ["imposible"]
    assert slugs(product_repo.list_showcase(TODAY, category="cake")) == ["tres-leches-de-fresa"]


def test_showcase_skips_inactive_products_and_offerings():
    load_stock("posible", "whole", 2)
    load_stock("imposible", "whole", 2)
    Product.objects.filter(slug="posible").update(is_active=False)
    ProductOffering.objects.filter(product__slug="imposible", presentation="whole").update(is_active=False)
    assert product_repo.list_showcase(TODAY) == []


def test_slices_list_only_slices_with_their_price_and_sold_out_state():
    load_stock("tres-leches-de-fresa", "slice", 6)
    load_stock("tres-leches-con-queso-y-zarzamora", "slice", 0)
    load_stock("tres-leches-de-fresa", "whole", 1)
    load_stock("tarta-de-frutas", "mini", 3)
    slices = product_repo.list_slices(TODAY)
    assert [(o.product_slug, o.price, o.stock) for o in slices] == [
        ("tres-leches-de-fresa", Decimal("35.00"), 6),
        ("tres-leches-con-queso-y-zarzamora", Decimal("40.00"), 0),
    ]


def test_showcase_uses_one_query(django_assert_num_queries):
    load_stock("tres-leches-de-fresa", "whole", 4)
    with django_assert_num_queries(1):
        product_repo.list_showcase(TODAY)


def write_stock_outside_the_admin(slug, presentation, quantity):
    """Existencias que saltan `Inventory.clean()` (SQL directo, `bulk_create`)."""
    Inventory.objects.bulk_create(
        [Inventory(kind="showcase", offering=offering_of(slug, presentation), stock_date=TODAY, quantity=quantity)]
    )


def test_order_only_products_never_show_up_in_the_showcase_even_with_stock_written_outside_the_admin():
    write_stock_outside_the_admin("red-velvet", "whole", 5)
    load_stock("tres-leches-de-fresa", "whole", 4)
    assert slugs(product_repo.list_showcase(TODAY)) == ["tres-leches-de-fresa"]
    assert product_repo.list_slices(TODAY) == []
    assert slugs(product_repo.list_showcase(TODAY, category="cake")) == ["tres-leches-de-fresa"]


def test_order_only_products_report_no_stock_in_the_catalog_and_the_detail():
    write_stock_outside_the_admin("red-velvet", "whole", 5)
    catalog = {p.slug: p for p in product_repo.list_catalog(on_date=TODAY)}
    assert [o.stock for o in catalog["red-velvet"].offerings] == [None]
    assert [o.stock for o in product_repo.get_product_by_slug("red-velvet", TODAY).offerings] == [None]


# --- Relacionados y presentación ---


def test_related_are_other_products_of_the_same_category_without_stock():
    durazno = Product.objects.get(slug="tres-leches-de-durazno")
    load_stock("tres-leches-de-fresa", "whole", 4)
    related = product_repo.list_related(durazno.id, limit=3)
    assert slugs(related) == ["tres-leches-de-fresa", "tres-leches-de-zarzamora", "tres-leches-de-cajeta"]
    assert all(p.category == "cake" for p in related)
    assert all(o.stock is None for p in related for o in p.offerings)


def test_related_respects_the_limit_and_the_category():
    imposible = Product.objects.get(slug="imposible")
    assert slugs(product_repo.list_related(imposible.id, limit=2)) == ["posible", "flan-napolitano"]
    assert product_repo.list_related(imposible.id, limit=0) == []
    assert product_repo.list_related(-1, limit=3) == []


def test_related_skips_inactive_products():
    Product.objects.filter(slug="tres-leches-de-fresa").update(is_active=False)
    durazno = Product.objects.get(slug="tres-leches-de-durazno")
    assert "tres-leches-de-fresa" not in slugs(product_repo.list_related(durazno.id, limit=3))


def test_related_of_an_inactive_product_is_empty():
    Product.objects.filter(slug="posible").update(is_active=False)
    posible = Product.objects.get(slug="posible")
    assert product_repo.list_related(posible.id, limit=3) == []


@pytest.mark.parametrize("repo", [product_repo.list_related, memory.MemoryProductRepo().list_related])
def test_related_limit_is_a_required_keyword(repo):
    limit = inspect.signature(repo).parameters["limit"]
    assert limit.kind is inspect.Parameter.KEYWORD_ONLY
    assert limit.default is inspect.Parameter.empty


def test_related_with_a_date_carries_the_stock_of_that_day():
    durazno = Product.objects.get(slug="tres-leches-de-durazno")
    load_stock("tres-leches-de-fresa", "whole", 4)
    load_stock("tres-leches-de-zarzamora", "whole", 1, on_date=TOMORROW)
    related = product_repo.list_related(durazno.id, limit=3, on_date=TODAY)
    assert [[o.stock for o in p.offerings] for p in related] == [[4, None, None], [None, None, None], [None, None, None]]


# --- Pasteles de la casa ---


def test_the_seed_marks_no_product_for_the_home_page():
    assert product_repo.list_featured(on_date=TODAY, limit=4) == []
    assert not any(p.featured_on_home for p in product_repo.list_catalog(on_date=TODAY))


def test_featured_lists_only_marked_active_products_in_order_up_to_the_limit():
    Product.objects.filter(slug__in=["imposible", "tres-leches-de-fresa", "posible"]).update(featured_on_home=True)
    Product.objects.filter(slug="posible").update(is_active=False)
    load_stock("imposible", "whole", 2)
    featured = product_repo.list_featured(on_date=TODAY, limit=4)
    assert slugs(featured) == ["tres-leches-de-fresa", "imposible"]
    assert all(p.featured_on_home for p in featured)
    assert [o.stock for o in featured[1].offerings] == [2, None]
    assert slugs(product_repo.list_featured(on_date=TODAY, limit=1)) == ["tres-leches-de-fresa"]
    assert product_repo.list_featured(on_date=TODAY, limit=0) == []


def test_featured_uses_two_queries(django_assert_num_queries):
    Product.objects.filter(slug__in=["imposible", "tres-leches-de-fresa"]).update(featured_on_home=True)
    with django_assert_num_queries(2):
        product_repo.list_featured(on_date=TODAY, limit=4)


def test_get_offering_returns_the_active_offering_with_its_product():
    offering = offering_of("choco-pinguino", "slice")
    record = product_repo.get_offering(offering.id)
    assert (record.product_name, record.presentation, record.price) == (
        "Choco-pingüino", "slice", Decimal("35.00"),
    )
    assert record.stock is None


def test_get_offering_is_none_when_missing_or_inactive():
    offering = offering_of("choco-pinguino", "slice")
    assert product_repo.get_offering(-1) is None
    ProductOffering.objects.filter(pk=offering.pk).update(is_active=False)
    assert product_repo.get_offering(offering.pk) is None
    ProductOffering.objects.filter(pk=offering.pk).update(is_active=True)
    Product.objects.filter(slug="choco-pinguino").update(is_active=False)
    assert product_repo.get_offering(offering.pk) is None


# --- Existencias ---


def test_showcase_stock_reads_the_day_and_none_without_a_row():
    offering = offering_of("tres-leches-de-fresa", "whole")
    assert product_repo.get_showcase_stock(offering.id, TODAY) is None
    load_stock("tres-leches-de-fresa", "whole", 4)
    assert product_repo.get_showcase_stock(offering.id, TODAY) == 4
    assert product_repo.get_showcase_stock(offering.id, TOMORROW) is None


def test_decrement_showcase_stock():
    offering = offering_of("tres-leches-de-fresa", "whole")
    load_stock("tres-leches-de-fresa", "whole", 3)
    assert product_repo.decrement_showcase_stock(offering.id, TODAY, 2) is True
    assert product_repo.get_showcase_stock(offering.id, TODAY) == 1
    assert product_repo.decrement_showcase_stock(offering.id, TODAY, 2) is False
    assert product_repo.get_showcase_stock(offering.id, TODAY) == 1
    assert product_repo.decrement_showcase_stock(offering.id, TODAY, 1) is True
    assert product_repo.decrement_showcase_stock(offering.id, TODAY, 1) is False
    assert product_repo.get_showcase_stock(offering.id, TODAY) == 0


def test_decrement_without_a_row_for_that_day_is_refused():
    offering = offering_of("tres-leches-de-fresa", "whole")
    assert product_repo.decrement_showcase_stock(offering.id, TODAY, 1) is False
    assert not Inventory.objects.filter(offering=offering).exists()


def test_decrement_ignores_bread_rows_with_the_same_id():
    bread = Bread.objects.get(slug="vainilla")
    Inventory.objects.create(kind="bread", bread=bread, stock_date=TODAY, quantity=5)
    assert product_repo.decrement_showcase_stock(bread.id, TODAY, 1) is False
    assert product_repo.get_bread_availability(bread.id, TODAY) == 5


def test_restock_adds_to_an_existing_row_and_never_creates_one():
    offering = offering_of("tres-leches-de-fresa", "whole")
    assert product_repo.restock_showcase(offering.id, TODAY, 2) is False
    assert product_repo.get_showcase_stock(offering.id, TODAY) is None
    load_stock("tres-leches-de-fresa", "whole", 1)
    assert product_repo.restock_showcase(offering.id, TODAY, 2) is True
    assert product_repo.get_showcase_stock(offering.id, TODAY) == 3


@pytest.mark.parametrize("quantity", [0, -1])
def test_stock_operations_reject_a_quantity_below_one(quantity):
    for operation in (
        product_repo.decrement_showcase_stock,
        product_repo.restock_showcase,
        product_repo.consume_bread,
        product_repo.release_bread,
    ):
        with pytest.raises(ValueError):
            operation(1, TODAY, quantity)


def test_bread_availability_consume_and_release():
    bread = Bread.objects.get(slug="chocolate")
    assert product_repo.get_bread_availability(bread.id, TODAY) is None
    assert product_repo.consume_bread(bread.id, TODAY, 1) is False
    assert product_repo.release_bread(bread.id, TODAY, 1) is False
    Inventory.objects.create(kind="bread", bread=bread, stock_date=TODAY, quantity=2)
    assert product_repo.get_bread_availability(bread.id, TODAY) == 2
    assert product_repo.consume_bread(bread.id, TODAY, 2) is True
    assert product_repo.consume_bread(bread.id, TODAY, 1) is False
    assert product_repo.release_bread(bread.id, TODAY, 1) is True
    assert product_repo.get_bread_availability(bread.id, TODAY) == 1
    assert product_repo.get_bread_availability(bread.id, TOMORROW) is None


def run_in_two_threads(operation):
    """Corre `operation` en dos hilos a la vez (cada uno con su conexión) y junta los resultados."""
    barrier = threading.Barrier(2)
    results = []

    def worker():
        try:
            barrier.wait()
            results.append(operation())
        finally:
            connection.close()

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return results


# Transaccional: los hilos necesitan filas confirmadas. `tests/conftest.py` vuelve a
# sembrar al terminar, así que no importa el orden de las pruebas.
@pytest.mark.django_db(transaction=True)
def test_concurrent_bread_consumption_never_oversells():
    bread = Bread.objects.create(
        name="Pan concurrente", slug="pan_concurrente", pricing_mode="extra_per_kg", price_per_kg=Decimal("0")
    )
    Inventory.objects.create(kind="bread", bread=bread, stock_date=TODAY, quantity=5)
    results = run_in_two_threads(lambda: product_repo.consume_bread(bread.id, TODAY, 3))
    assert sorted(results) == [False, True]
    assert product_repo.get_bread_availability(bread.id, TODAY) == 2


@pytest.mark.django_db(transaction=True)
def test_concurrent_consumption_that_fits_both_succeeds():
    bread = Bread.objects.create(
        name="Pan holgado", slug="pan_holgado", pricing_mode="extra_per_kg", price_per_kg=Decimal("0")
    )
    Inventory.objects.create(kind="bread", bread=bread, stock_date=TODAY, quantity=5)
    results = run_in_two_threads(lambda: product_repo.consume_bread(bread.id, TODAY, 2))
    assert results == [True, True]
    assert product_repo.get_bread_availability(bread.id, TODAY) == 1


# --- Opciones de "Diseña tu pastel" ---


def test_filling_price_table_equals_table_4_5():
    assert cake_option_repo.get_filling_price_table() == {
        key: Decimal(value) for key, value in RULE_TABLE_4_5.items()
    }


def test_breads_come_in_order_with_their_rules():
    breads = {b.slug: b for b in cake_option_repo.list_breads()}
    assert [b.slug for b in cake_option_repo.list_breads()] == [
        "vainilla", "chocolate", "choco_vainilla", "choco_pinguino", "red_velvet",
    ]
    assert breads["red_velvet"].allowed_cake_types == ("seco",)
    assert breads["red_velvet"].pricing_mode == "full_price_per_kg"
    assert breads["red_velvet"].price_per_kg == Decimal("280.00")
    assert breads["chocolate"].price_per_kg == Decimal("5.00")


def test_inactive_breads_are_not_listed():
    Bread.objects.filter(slug="vainilla").update(is_active=False)
    assert "vainilla" not in [b.slug for b in cake_option_repo.list_breads()]


def test_filling_bases_come_with_their_flavors():
    bases = {b.slug: b for b in cake_option_repo.list_filling_bases_with_flavors()}
    assert list(bases) == ["normal", "queso", "flan"]
    assert (bases["normal"].max_flavors, bases["normal"].combined_extra_per_kg) == (2, Decimal("5.00"))
    assert len(bases["normal"].flavors) == 10
    assert {f.slug for f in bases["queso"].flavors} == {"chocolate", "zarzamora"}
    assert {f.slug for f in bases["flan"].flavors} == {"cajeta", "zarzamora"}
    yogurt = next(f for f in bases["normal"].flavors if f.slug == "fresa_yogurt")
    assert yogurt.is_combinable is False
    assert yogurt.allowed_cake_types == ("tres_leches", "seco")


def test_filling_bases_use_three_queries_and_skip_inactive_flavors(django_assert_num_queries):
    FillingFlavor.objects.filter(slug="nuez").update(is_active=False)
    with django_assert_num_queries(3):
        bases = cake_option_repo.list_filling_bases_with_flavors()
    assert "nuez" not in {f.slug for f in bases[0].flavors}


def test_coverage_colors_decorations_and_tiers():
    assert len(cake_option_repo.list_coverage_colors()) == 11
    decorations = {d.slug: d for d in cake_option_repo.list_decorations()}
    assert [d.slug for d in cake_option_repo.list_decorations()] == [
        "ninguna", "duya", "rosetones", "festones", "olanes", "flores", "chispas", "chispas-chocolate", "chispas-choco-vainilla", "otra",
    ]
    # Rosas lleva su precio fijo; lo incluido llega sin precio, nunca con 0 (regla 6.1).
    assert decorations["flores"].price == Decimal("120.00")
    assert [decorations[s].price for s in ("duya", "rosetones", "festones", "olanes", "chispas")] == [None] * 5
    assert (decorations["chispas"].preview_flavor, decorations["chispas-chocolate"].preview_bread) == ("capuchino", "choco_pinguino")
    DecorationOption.objects.filter(slug="flores").update(price=Decimal("90"))
    assert next(d for d in cake_option_repo.list_decorations() if d.slug == "flores").price == Decimal("90.00")
    tiers = cake_option_repo.list_tier_recommendations()
    assert [(t.tiers, t.recommended_min_kg) for t in tiers] == [(1, 0), (2, 15), (3, 18), (4, 25), (5, 30)]
    assert max(t.tiers for t in tiers) == 5


# --- Configuración, bases y envío ---


def test_settings_records_carry_the_seeded_values():
    store = settings_repo.get_store_settings()
    assert (store.store_opens_at, store.store_closes_at) == (time(10, 0), time(22, 30))
    assert store.max_orders_per_slot == 3
    assert settings_repo.get_cake_design_settings().people_per_kg == 7
    assert settings_repo.get_cake_design_settings().wafer_price == Decimal("125.00")
    policy = settings_repo.get_policy_settings()
    assert (policy.stand_return_days, policy.damaged_stand_policy) == (15, "")
    uploads = settings_repo.get_upload_settings()
    assert (uploads.max_upload_mb, uploads.max_reference_images) == (5, 3)


def test_settings_reflect_edits_without_keeping_state_between_calls():
    PolicySettings.objects.filter(pk=1).update(stand_return_days=20)
    assert settings_repo.get_policy_settings().stand_return_days == 20
    PolicySettings.objects.filter(pk=1).update(stand_return_days=15)
    assert settings_repo.get_policy_settings().stand_return_days == 15


def test_missing_settings_row_raises_a_clear_error():
    StoreSettings.objects.all().delete()
    with pytest.raises(ImproperlyConfigured, match="horarios y entregas"):
        settings_repo.get_store_settings()


def test_stand_sizes_are_ordered_and_can_include_inactive_ones():
    CakeStand.objects.filter(max_kg=12).update(is_active=False)
    active = settings_repo.list_stand_sizes()
    assert [s.max_kg for s in active][:4] == [5, 8, 15, 25]
    assert len(active) == 9
    everything = settings_repo.list_stand_sizes(active_only=False)
    assert len(everything) == 10
    assert next(s for s in everything if s.max_kg == 12).is_active is False


def test_delivery_bands_are_ordered_by_distance():
    assert [(b.max_km, b.fee) for b in settings_repo.list_delivery_bands()] == [
        (Decimal("3.0"), Decimal("50.00")),
        (Decimal("6.0"), Decimal("80.00")),
        (Decimal("10.0"), Decimal("130.00")),
        (Decimal("15.0"), Decimal("190.00")),
    ]


# --- Registros y repositorios en memoria ---


def test_records_are_immutable():
    record = settings_repo.list_delivery_bands()[0]
    with pytest.raises(dataclasses.FrozenInstanceError):
        record.fee = Decimal("0")
    product = product_repo.get_product_by_slug("posible", TODAY)
    with pytest.raises(dataclasses.FrozenInstanceError):
        product.name = "Otro"
    assert isinstance(product.offerings, tuple)


def test_records_and_memory_repos_do_not_import_django():
    for module in (records, memory):
        imported = set()
        for node in ast.walk(ast.parse(inspect.getsource(module))):
            if isinstance(node, ast.Import):
                imported.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                imported.add(node.module)
        assert not [name for name in imported if name.split(".")[0] == "django"], module.__name__


def memory_product_repo(on_date):
    """Repositorio en memoria con el catálogo (sin existencias) y las existencias del día."""
    products = [
        dataclasses.replace(
            product, offerings=tuple(dataclasses.replace(o, stock=None) for o in product.offerings)
        )
        for product in product_repo.list_catalog(on_date=on_date)
    ]
    stock = {(row.offering_id, row.stock_date): row.quantity for row in Inventory.objects.filter(kind="showcase")}
    bread = {(row.bread_id, row.stock_date): row.quantity for row in Inventory.objects.filter(kind="bread")}
    return memory.MemoryProductRepo(products, stock, bread)


def test_memory_product_repo_answers_like_postgres():
    load_stock("tres-leches-de-fresa", "whole", 4)
    load_stock("tres-leches-de-fresa", "slice", 6)
    load_stock("tres-leches-de-durazno", "mini", 0)
    load_stock("tres-leches-de-fresa", "whole", 9, on_date=TOMORROW)
    load_stock("imposible", "slice", 1)
    load_stock("mosaico-con-crema", "cup", 12)
    in_memory = memory_product_repo(TODAY)
    fresa = Product.objects.get(slug="tres-leches-de-fresa")
    for call in (
        lambda r: r.list_catalog(on_date=TODAY),
        lambda r: r.list_catalog(on_date=TOMORROW),
        lambda r: r.list_catalog(on_date=TODAY, category="dessert"),
        lambda r: r.list_catalog(on_date=TODAY, search="QUESO"),
        lambda r: r.list_catalog(on_date=TODAY, search="pinguino"),
        lambda r: r.list_catalog(on_date=TODAY, search="PINGÜINO"),
        lambda r: r.list_catalog(on_date=TODAY, search="duvalin"),
        lambda r: r.list_catalog(on_date=TODAY, category="cake", search="flan"),
        lambda r: r.get_product_by_slug("tres-leches-de-fresa", TODAY),
        lambda r: r.get_product_by_slug("no-existe", TODAY),
        lambda r: r.list_showcase(TODAY),
        lambda r: r.list_showcase(TODAY, category="cake"),
        lambda r: r.list_showcase(TOMORROW),
        lambda r: r.list_slices(TODAY),
        lambda r: r.list_related(fresa.id, limit=3),
        lambda r: r.list_related(fresa.id, limit=1),
        lambda r: r.list_related(-1, limit=3),
        lambda r: r.get_offering(offering_of("imposible", "slice").id),
        lambda r: r.get_offering(-1),
        lambda r: r.get_showcase_stock(offering_of("tres-leches-de-fresa", "whole").id, TODAY),
        lambda r: r.get_showcase_stock(offering_of("tres-leches-de-fresa", "mini").id, TODAY),
    ):
        assert call(product_repo) == call(in_memory)


def test_memory_repo_matches_postgres_with_inactive_products_and_offerings():
    """El repositorio en memoria espera datos ya filtrados: con lo que devuelve el real, no hay inactivos."""
    load_stock("posible", "whole", 2)
    load_stock("imposible", "whole", 2)
    load_stock("imposible", "slice", 2)
    load_stock("tres-leches-de-fresa", "whole", 3)
    Product.objects.filter(slug="posible").update(is_active=False)
    ProductOffering.objects.filter(product__slug="imposible", presentation="slice").update(is_active=False)
    in_memory = memory_product_repo(TODAY)
    for call in (
        lambda r: r.list_catalog(on_date=TODAY),
        lambda r: r.list_catalog(on_date=TODAY, category="dessert"),
        lambda r: r.get_product_by_slug("posible", TODAY),
        lambda r: r.get_product_by_slug("imposible", TODAY),
        lambda r: r.list_showcase(TODAY),
        lambda r: r.list_slices(TODAY),
        lambda r: r.get_offering(offering_of("posible", "whole").id),
        lambda r: r.get_offering(offering_of("imposible", "slice").id),
        lambda r: r.list_related(Product.objects.get(slug="imposible").id, limit=3),
    ):
        assert call(product_repo) == call(in_memory)
    assert "posible" not in slugs(in_memory.list_catalog(on_date=TODAY))
    assert in_memory.get_product_by_slug("posible", TODAY) is None
    assert [o.presentation for o in in_memory.get_product_by_slug("imposible", TODAY).offerings] == ["whole"]


def test_memory_repo_answers_featured_and_dated_related_like_postgres():
    Product.objects.filter(slug__in=["imposible", "choco-pinguino", "tres-leches-de-fresa"]).update(featured_on_home=True)
    load_stock("tres-leches-de-fresa", "whole", 4)
    load_stock("imposible", "whole", 0)
    load_stock("tres-leches-de-zarzamora", "whole", 2, on_date=TOMORROW)
    in_memory = memory_product_repo(TODAY)
    durazno = Product.objects.get(slug="tres-leches-de-durazno")
    for call in (
        lambda r: r.list_featured(on_date=TODAY, limit=4),
        lambda r: r.list_featured(on_date=TOMORROW, limit=2),
        lambda r: r.list_featured(on_date=TODAY, limit=0),
        lambda r: r.list_related(durazno.id, limit=3, on_date=TODAY),
        lambda r: r.list_related(durazno.id, limit=2, on_date=TOMORROW),
        lambda r: r.list_related(durazno.id, limit=3),
    ):
        assert call(product_repo) == call(in_memory)


def test_memory_repo_never_lists_order_only_products_in_the_showcase():
    write_stock_outside_the_admin("red-velvet", "whole", 5)
    load_stock("tres-leches-de-fresa", "whole", 4)
    in_memory = memory_product_repo(TODAY)
    assert slugs(in_memory.list_showcase(TODAY)) == ["tres-leches-de-fresa"]
    assert slugs(in_memory.list_showcase(TODAY)) == slugs(product_repo.list_showcase(TODAY))
    assert [o.stock for o in in_memory.get_product_by_slug("red-velvet", TODAY).offerings] == [None]


def test_memory_stock_operations_behave_like_postgres():
    bread = Bread.objects.get(slug="vainilla")
    offering = offering_of("tres-leches-de-fresa", "whole")
    load_stock("tres-leches-de-fresa", "whole", 3)
    Inventory.objects.create(kind="bread", bread=bread, stock_date=TODAY, quantity=2)
    in_memory = memory_product_repo(TODAY)
    script = [
        ("decrement_showcase_stock", (offering.id, TODAY, 2)),
        ("decrement_showcase_stock", (offering.id, TODAY, 2)),
        ("restock_showcase", (offering.id, TODAY, 5)),
        ("restock_showcase", (offering.id, TOMORROW, 1)),
        ("decrement_showcase_stock", (offering.id, TOMORROW, 1)),
        ("get_showcase_stock", (offering.id, TODAY)),
        ("consume_bread", (bread.id, TODAY, 2)),
        ("consume_bread", (bread.id, TODAY, 1)),
        ("release_bread", (bread.id, TODAY, 1)),
        ("release_bread", (bread.id, TOMORROW, 1)),
        ("get_bread_availability", (bread.id, TODAY)),
    ]
    for name, args in script:
        assert getattr(product_repo, name)(*args) == getattr(in_memory, name)(*args), name
    for repo in (product_repo, in_memory):
        with pytest.raises(ValueError):
            repo.decrement_showcase_stock(offering.id, TODAY, 0)


def test_memory_cake_option_and_settings_repos_return_the_same_records():
    options = memory.MemoryCakeOptionRepo(
        cake_option_repo.list_breads(),
        cake_option_repo.list_filling_bases_with_flavors(),
        cake_option_repo.get_filling_price_table(),
        cake_option_repo.list_coverage_colors(),
        cake_option_repo.list_decorations(),
        cake_option_repo.list_tier_recommendations(),
        cake_option_repo.list_cake_molds(),
    )
    for name in (
        "list_breads", "list_filling_bases_with_flavors", "get_filling_price_table",
        "list_coverage_colors", "list_decorations", "list_tier_recommendations", "list_cake_molds",
    ):
        assert getattr(options, name)() == getattr(cake_option_repo, name)(), name
    CakeStand.objects.filter(max_kg=12).update(is_active=False)
    in_memory = memory.MemorySettingsRepo(
        settings_repo.get_store_settings(),
        settings_repo.get_cake_design_settings(),
        settings_repo.get_policy_settings(),
        settings_repo.get_upload_settings(),
        settings_repo.list_stand_sizes(active_only=False),
        settings_repo.list_delivery_bands(),
    )
    for name in (
        "get_store_settings", "get_cake_design_settings", "get_policy_settings",
        "get_upload_settings", "list_delivery_bands",
    ):
        assert getattr(in_memory, name)() == getattr(settings_repo, name)(), name
    assert in_memory.list_stand_sizes() == settings_repo.list_stand_sizes()
    assert in_memory.list_stand_sizes(active_only=False) == settings_repo.list_stand_sizes(active_only=False)
