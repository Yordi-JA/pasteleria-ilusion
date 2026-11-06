"""API pública del catálogo: productos, ficha, pasteles de la casa, vitrina y rebanadas de hoy.

Contra la semilla de PostgreSQL (22 productos y 47 presentaciones, ninguno
destacado en la portada). "Hoy" es la fecha local de la pastelería
(America/Mexico_City): las pruebas fijan `timezone.now` para no depender del reloj.
"""
import json
from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone

import pytest
from django.contrib import admin as django_admin
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from core_pasteleria.models import Inventory, Product, ProductOffering

TODAY = date(2026, 11, 6)
# Mediodía en la Ciudad de México (UTC-6, sin horario de verano desde 2022).
NOON_TODAY = datetime(2026, 11, 6, 18, 0, tzinfo=dt_timezone.utc)

PRODUCTS_URL = "/api/v1/products/"
FEATURED_URL = "/api/v1/featured-products/"
SHOWCASE_URL = "/api/v1/showcase/"
SLICES_URL = "/api/v1/slices/"
PRICE_URL = "/api/v1/cake-designs/price/"
STORE_INFO_URL = "/api/v1/store/info/"


def product_url(slug):
    return f"{PRODUCTS_URL}{slug}/"


PUBLIC_URLS = [PRODUCTS_URL, product_url("tres-leches-de-durazno"), FEATURED_URL, SHOWCASE_URL, SLICES_URL]

CARD_FIELDS = {
    "slug", "name", "category", "sales_channel", "cake_type", "bread", "filling_base",
    "summary", "photo", "in_showcase_today", "offerings",
}
CARD_OFFERING_FIELDS = {"id", "presentation", "price"}
DETAIL_FIELDS = CARD_FIELDS | {
    "description", "filling_flavor", "storage_notes", "transport_notes", "related",
}
DETAIL_OFFERING_FIELDS = {"id", "presentation", "price", "approx_weight_kg", "servings", "photo", "stock"}
STOCK_ITEM_FIELDS = {
    "offering_id", "product_slug", "product_name", "category", "presentation",
    "price", "photo", "stock", "sold_out",
}
FIRST_FOUR_CAKES = ["tres-leches-de-durazno", "tres-leches-de-fresa", "tres-leches-de-zarzamora", "tres-leches-de-cajeta"]
PRICE_REQUEST = {
    "kg": 15,
    "cake_type": "tres_leches",
    "bread": "chocolate",
    "filling_base": "queso",
    "filling_flavors": ["zarzamora"],
}

pytestmark = pytest.mark.django_db


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture(autouse=True)
def bakery_clock(monkeypatch):
    """Fija la hora; `set(datetime)` la cambia dentro de una prueba."""

    class Clock:
        def set(self, moment):
            monkeypatch.setattr(timezone, "now", lambda: moment)

    clock = Clock()
    clock.set(NOON_TODAY)
    return clock


def offering_of(slug, presentation):
    return ProductOffering.objects.get(product__slug=slug, presentation=presentation)


def load_stock(slug, presentation, quantity, on_date=TODAY):
    return Inventory.objects.create(
        kind="showcase", offering=offering_of(slug, presentation), stock_date=on_date, quantity=quantity
    )


def write_stock_outside_the_admin(slug, presentation, quantity, on_date=TODAY):
    """Existencias que saltan `Inventory.clean()` (SQL directo, `bulk_create`)."""
    Inventory.objects.bulk_create(
        [Inventory(kind="showcase", offering=offering_of(slug, presentation), stock_date=on_date, quantity=quantity)]
    )


def slugs(cards):
    return [card["slug"] for card in cards]


def items(body):
    return [(item["product_slug"], item["presentation"], item["stock"], item["sold_out"]) for item in body["items"]]


# --- Catálogo ---


def test_catalog_lists_every_active_product_as_a_card_in_admin_order(api):
    response = api.get(PRODUCTS_URL)
    assert response.status_code == 200
    cards = response.json()
    assert slugs(cards) == list(Product.objects.order_by("sort_order", "name").values_list("slug", flat=True))
    assert len(cards) == 22
    assert all(set(card) == CARD_FIELDS for card in cards)
    assert all(set(offering) == CARD_OFFERING_FIELDS for card in cards for offering in card["offerings"])


def test_catalog_card_carries_what_the_card_shows_with_money_as_a_string(api):
    durazno = api.get(PRODUCTS_URL).json()[0]
    assert durazno == {
        "slug": "tres-leches-de-durazno",
        "name": "Tres leches de durazno",
        "category": "cake",
        "sales_channel": "showcase_and_order",
        "cake_type": "tres_leches",
        "bread": None,
        "filling_base": "normal",
        "summary": "Relleno de durazno y cobertura de crema pastelera.",
        "photo": None,
        "in_showcase_today": False,
        "offerings": [
            {"id": offering_of("tres-leches-de-durazno", "whole").id, "presentation": "whole", "price": "350.00"},
            {"id": offering_of("tres-leches-de-durazno", "slice").id, "presentation": "slice", "price": "35.00"},
            {"id": offering_of("tres-leches-de-durazno", "mini").id, "presentation": "mini", "price": "130.00"},
        ],
    }


def test_catalog_card_of_a_dessert_has_no_cake_fields(api):
    cards = {card["slug"]: card for card in api.get(PRODUCTS_URL).json()}
    mosaico = cards["mosaico-con-crema"]
    assert (mosaico["category"], mosaico["sales_channel"]) == ("dessert", "showcase_only")
    assert (mosaico["cake_type"], mosaico["bread"], mosaico["filling_base"]) == (None, None, None)
    # El pan del Red velvet permite mostrar su precio por kilo de "Diseña tu pastel".
    assert (cards["red-velvet"]["sales_channel"], cards["red-velvet"]["bread"]) == ("order_only", "red_velvet")


def test_catalog_filters_by_category(api):
    cakes = api.get(PRODUCTS_URL, {"category": "cake"}).json()
    desserts = api.get(PRODUCTS_URL, {"category": "dessert"}).json()
    assert (len(cakes), len(desserts)) == (14, 8)
    assert {card["category"] for card in cakes} == {"cake"}
    assert {card["category"] for card in desserts} == {"dessert"}


def test_catalog_search_ignores_case_and_spaces_and_combines_with_the_category(api):
    queso = api.get(PRODUCTS_URL, {"search": "  QUESO "}).json()
    assert slugs(queso) == ["tres-leches-con-queso-y-chocolate", "tres-leches-con-queso-y-zarzamora"]
    flan = slugs(api.get(PRODUCTS_URL, {"category": "dessert", "search": "flan"}).json())
    assert {"flan-napolitano", "imposible", "posible"} <= set(flan)
    assert "tres-leches-con-flan-y-cajeta" not in flan
    assert len(api.get(PRODUCTS_URL, {"search": "   "}).json()) == 22
    assert api.get(PRODUCTS_URL, {"search": "no-hay-un-pastel-asi"}).json() == []


@pytest.mark.parametrize("params", [{"category": "gelatina"}, {"category": "CAKE"}, {"category": " cake"}])
def test_catalog_rejects_an_unknown_category(api, params):
    response = api.get(PRODUCTS_URL, params)
    assert response.status_code == 400
    assert set(response.json()) == {"category"}


def test_catalog_with_an_empty_category_lists_everything_like_the_all_filter(api):
    assert len(api.get(PRODUCTS_URL, {"category": ""}).json()) == 22


def test_catalog_rejects_a_search_longer_than_a_product_name(api):
    limit = Product._meta.get_field("name").max_length
    assert api.get(PRODUCTS_URL, {"search": "a" * limit}).status_code == 200
    response = api.get(PRODUCTS_URL, {"search": "a" * (limit + 1)})
    assert response.status_code == 400
    assert set(response.json()) == {"search"}


def test_catalog_rejects_a_null_character_in_the_search_instead_of_failing(api):
    """PostgreSQL no acepta NUL en un texto: sin la validación, sería un 500."""
    response = api.get(PRODUCTS_URL, {"search": "fresa\x00"})
    assert response.status_code == 400
    assert set(response.json()) == {"search"}


def test_catalog_search_treats_sql_wildcards_as_plain_text(api):
    assert api.get(PRODUCTS_URL, {"search": "%"}).json() == []
    assert api.get(PRODUCTS_URL, {"search": "_"}).json() == []


def test_catalog_marks_in_showcase_today_only_with_stock_of_today_outside_the_slices(api):
    load_stock("tres-leches-de-fresa", "whole", 4)
    load_stock("tres-leches-de-durazno", "whole", 0)
    load_stock("tres-leches-de-zarzamora", "slice", 5)
    load_stock("tres-leches-de-cajeta", "whole", 3, on_date=TODAY + timedelta(days=1))
    load_stock("tarta-de-frutas", "mini", 2)
    shown = {card["slug"]: card["in_showcase_today"] for card in api.get(PRODUCTS_URL).json()}
    assert shown["tres-leches-de-fresa"] is True
    assert shown["tarta-de-frutas"] is True
    # Agotado, solo rebanadas o cargado para otro día: no está en la vitrina de hoy.
    assert shown["tres-leches-de-durazno"] is False
    assert shown["tres-leches-de-zarzamora"] is False
    assert shown["tres-leches-de-cajeta"] is False
    assert sum(shown.values()) == 2


def test_catalog_never_marks_an_order_only_product_in_the_showcase(api):
    write_stock_outside_the_admin("red-velvet", "whole", 5)
    cards = {card["slug"]: card for card in api.get(PRODUCTS_URL).json()}
    assert cards["red-velvet"]["in_showcase_today"] is False


@pytest.mark.parametrize("term", ["pinguino", "PINGÜINO"])
def test_catalog_search_ignores_accents(api, term):
    assert slugs(api.get(PRODUCTS_URL, {"search": term}).json()) == ["choco-pinguino"]


def test_catalog_search_finds_an_accented_summary_without_the_accent(api):
    Product.objects.filter(slug="tarta-de-frutas").update(summary="Con crema de limón.")
    assert slugs(api.get(PRODUCTS_URL, {"search": "limon"}).json()) == ["tarta-de-frutas"]


def test_catalog_hides_inactive_products_and_offerings(api):
    Product.objects.filter(slug="posible").update(is_active=False)
    ProductOffering.objects.filter(product__slug="imposible", presentation="slice").update(is_active=False)
    cards = {card["slug"]: card for card in api.get(PRODUCTS_URL).json()}
    assert "posible" not in cards
    assert [o["presentation"] for o in cards["imposible"]["offerings"]] == ["whole"]


def test_catalog_gives_the_photo_file_once_the_bakery_loads_it(api):
    Product.objects.filter(slug="imposible").update(photo="imposible.webp")
    cards = {card["slug"]: card for card in api.get(PRODUCTS_URL).json()}
    assert cards["imposible"]["photo"] == "imposible.webp"
    assert cards["posible"]["photo"] is None


def test_catalog_uses_two_queries(api, django_assert_num_queries):
    with django_assert_num_queries(2):
        api.get(PRODUCTS_URL, {"category": "cake", "search": "tres"})


# --- Ficha ---


def test_product_detail_has_its_offerings_with_the_stock_of_today_and_its_related(api):
    load_stock("tres-leches-de-durazno", "whole", 3)
    load_stock("tres-leches-de-fresa", "whole", 4)
    response = api.get(product_url("tres-leches-de-durazno"))
    assert response.status_code == 200
    detail = response.json()
    assert set(detail) == DETAIL_FIELDS
    assert detail["description"] == ""
    assert (detail["bread"], detail["filling_base"], detail["filling_flavor"]) == (None, "normal", "durazno")
    assert (detail["storage_notes"], detail["transport_notes"]) == (None, None)
    assert detail["in_showcase_today"] is True
    assert detail["offerings"] == [
        {
            "id": offering_of("tres-leches-de-durazno", "whole").id, "presentation": "whole", "price": "350.00",
            "approx_weight_kg": "2.7", "servings": 19, "photo": None, "stock": 3,
        },
        {
            "id": offering_of("tres-leches-de-durazno", "slice").id, "presentation": "slice", "price": "35.00",
            "approx_weight_kg": None, "servings": None, "photo": None, "stock": None,
        },
        {
            "id": offering_of("tres-leches-de-durazno", "mini").id, "presentation": "mini", "price": "130.00",
            "approx_weight_kg": None, "servings": 3, "photo": None, "stock": None,
        },
    ]
    related = detail["related"]
    assert slugs(related) == ["tres-leches-de-fresa", "tres-leches-de-zarzamora", "tres-leches-de-cajeta"]
    assert all(set(card) == CARD_FIELDS for card in related)
    # Los relacionados también leen la vitrina de hoy.
    assert [card["in_showcase_today"] for card in related] == [True, False, False]


def test_product_detail_tells_sold_out_from_not_loaded(api):
    load_stock("imposible", "whole", 0)
    offerings = api.get(product_url("imposible")).json()["offerings"]
    assert [(o["presentation"], o["stock"]) for o in offerings] == [("whole", 0), ("slice", None)]


def test_product_detail_gives_the_presets_for_customizing_it(api):
    red_velvet = api.get(product_url("red-velvet")).json()
    assert (red_velvet["cake_type"], red_velvet["bread"], red_velvet["filling_base"]) == ("seco", "red_velvet", None)
    assert red_velvet["sales_channel"] == "order_only"
    assert [o["presentation"] for o in red_velvet["offerings"]] == ["whole"]
    imposible = api.get(product_url("imposible")).json()
    assert (imposible["cake_type"], imposible["bread"], imposible["filling_flavor"]) == (None, None, None)


def test_product_detail_does_not_preset_options_that_design_your_cake_no_longer_offers(api):
    from core_pasteleria.models import Bread, FillingBase

    Bread.objects.filter(slug="red_velvet").update(is_active=False)
    FillingBase.objects.filter(slug="flan").update(is_active=False)
    red_velvet = api.get(product_url("red-velvet")).json()
    assert (red_velvet["cake_type"], red_velvet["bread"]) == ("seco", None)
    flan = api.get(product_url("tres-leches-con-flan-y-cajeta")).json()
    assert (flan["filling_base"], flan["filling_flavor"]) == (None, "cajeta")
    cards = {card["slug"]: card for card in api.get(PRODUCTS_URL).json()}
    assert cards["red-velvet"]["bread"] is None
    assert cards["choco-pinguino"]["bread"] == "choco_pinguino"


def test_product_detail_gives_the_notes_and_photos_once_the_bakery_loads_them(api):
    Product.objects.filter(slug="posible").update(
        description="Flan sobre pan de vainilla.",
        storage_notes="En refrigeración, hasta 3 días.",
        transport_notes="   ",
        photo="posible.webp",
    )
    ProductOffering.objects.filter(product__slug="posible", presentation="slice").update(photo="posible-rebanada.webp")
    detail = api.get(product_url("posible")).json()
    assert detail["description"] == "Flan sobre pan de vainilla."
    assert detail["storage_notes"] == "En refrigeración, hasta 3 días."
    assert detail["transport_notes"] is None
    assert detail["photo"] == "posible.webp"
    assert [o["photo"] for o in detail["offerings"]] == ["posible.webp", "posible-rebanada.webp"]


@pytest.mark.parametrize("slug", ["no-existe", "posible"])
def test_product_detail_is_a_json_404_when_missing_or_inactive(api, slug):
    # La ruta existe: un producto activo responde.
    assert api.get(product_url("imposible")).status_code == 200
    Product.objects.filter(slug="posible").update(is_active=False)
    response = api.get(product_url(slug))
    assert response.status_code == 404
    assert response.json() == {"detail": "No encontrado."}


def test_product_detail_with_a_slug_the_route_does_not_accept_is_a_json_404(api):
    response = api.get(f"{PRODUCTS_URL}pastel%20de%20fresa/")
    assert response.status_code == 404
    assert response.json() == {"detail": "No encontrado."}


def test_product_detail_url_has_its_name():
    assert reverse("product-detail", args=["imposible"]) == product_url("imposible")
    assert reverse("product-list") == PRODUCTS_URL


def test_product_detail_uses_at_most_five_queries(api, django_assert_max_num_queries):
    with django_assert_max_num_queries(5):
        assert api.get(product_url("tres-leches-de-durazno")).status_code == 200


# --- Pasteles de la casa ---


def test_featured_falls_back_to_the_first_four_cakes_when_none_is_marked(api):
    assert not Product.objects.filter(featured_on_home=True).exists()
    response = api.get(FEATURED_URL)
    assert response.status_code == 200
    cards = response.json()
    assert slugs(cards) == FIRST_FOUR_CAKES
    assert all(set(card) == CARD_FIELDS for card in cards)


def test_featured_fallback_uses_three_queries(api, django_assert_num_queries):
    # Los destacados (vacío, sin prefetch) y el catálogo de pasteles (dos).
    with django_assert_num_queries(3):
        assert len(api.get(FEATURED_URL).json()) == 4


def test_featured_fallback_skips_inactive_cakes_and_never_takes_desserts(api):
    Product.objects.filter(slug__in=["tres-leches-de-fresa", "tres-leches-de-cajeta"]).update(is_active=False)
    cards = api.get(FEATURED_URL).json()
    assert slugs(cards) == [
        "tres-leches-de-durazno", "tres-leches-de-zarzamora", "tres-leches-de-galleta", "tres-leches-de-chocolate",
    ]
    assert {card["category"] for card in cards} == {"cake"}


def test_featured_gives_the_marked_products_in_their_order_up_to_four(api):
    marked = ["imposible", "choco-pinguino", "tres-leches-con-queso-y-zarzamora", "tres-leches-de-durazno", "posible"]
    Product.objects.filter(slug__in=marked).update(featured_on_home=True)
    expected = list(
        Product.objects.filter(slug__in=marked).order_by("sort_order", "name").values_list("slug", flat=True)[:4]
    )
    assert slugs(api.get(FEATURED_URL).json()) == expected
    assert expected == ["tres-leches-de-durazno", "tres-leches-con-queso-y-zarzamora", "choco-pinguino", "imposible"]


def test_featured_follows_the_sort_order_the_bakery_sets(api):
    Product.objects.filter(slug__in=["imposible", "tres-leches-de-fresa"]).update(featured_on_home=True)
    Product.objects.filter(slug="imposible").update(sort_order=0)
    assert slugs(api.get(FEATURED_URL).json()) == ["imposible", "tres-leches-de-fresa"]


def test_featured_does_not_fill_up_with_cakes_when_fewer_than_four_are_marked(api):
    Product.objects.filter(slug="imposible").update(featured_on_home=True)
    assert slugs(api.get(FEATURED_URL).json()) == ["imposible"]


def test_featured_ignores_inactive_marked_products(api):
    Product.objects.filter(slug="imposible").update(featured_on_home=True, is_active=False)
    assert slugs(api.get(FEATURED_URL).json()) == FIRST_FOUR_CAKES


def test_featured_cards_read_the_showcase_of_today(api):
    load_stock("tres-leches-de-zarzamora", "whole", 2)
    shown = {card["slug"]: card["in_showcase_today"] for card in api.get(FEATURED_URL).json()}
    assert shown == {slug: slug == "tres-leches-de-zarzamora" for slug in FIRST_FOUR_CAKES}


# --- Vitrina de hoy ---


def test_showcase_is_empty_when_nothing_was_loaded_for_today(api):
    load_stock("tres-leches-de-fresa", "whole", 4, on_date=TODAY - timedelta(days=1))
    load_stock("tres-leches-de-fresa", "mini", 4, on_date=TODAY + timedelta(days=1))
    response = api.get(SHOWCASE_URL)
    assert response.status_code == 200
    assert response.json() == {"date": "2026-11-06", "items": []}


def test_showcase_lists_what_was_loaded_today_and_tells_sold_out_from_available(api):
    load_stock("tres-leches-de-fresa", "whole", 4)
    load_stock("tres-leches-de-fresa", "slice", 6)
    load_stock("tres-leches-de-durazno", "mini", 0)
    load_stock("flan-napolitano", "large", 2)
    write_stock_outside_the_admin("red-velvet", "whole", 5)
    body = api.get(SHOWCASE_URL).json()
    assert body["date"] == "2026-11-06"
    # Sin rebanadas, sin Red velvet y sin lo que no se cargó hoy; la agotada sigue en la lista.
    assert items(body) == [
        ("tres-leches-de-durazno", "mini", 0, True),
        ("tres-leches-de-fresa", "whole", 4, False),
        ("flan-napolitano", "large", 2, False),
    ]
    assert body["items"][1] == {
        "offering_id": offering_of("tres-leches-de-fresa", "whole").id,
        "product_slug": "tres-leches-de-fresa",
        "product_name": "Tres leches de fresa",
        "category": "cake",
        "presentation": "whole",
        "price": "350.00",
        "photo": None,
        "stock": 4,
        "sold_out": False,
    }


@pytest.mark.parametrize(("category", "expected"), [("cake", ["tres-leches-de-fresa"]), ("dessert", ["imposible"])])
def test_showcase_filters_by_category(api, category, expected):
    load_stock("tres-leches-de-fresa", "whole", 4)
    load_stock("imposible", "whole", 2)
    body = api.get(SHOWCASE_URL, {"category": category}).json()
    assert [item["product_slug"] for item in body["items"]] == expected


def test_showcase_rejects_an_unknown_category(api):
    response = api.get(SHOWCASE_URL, {"category": "rebanadas"})
    assert response.status_code == 400
    assert set(response.json()) == {"category"}


def test_showcase_everything_sold_out_still_lists_the_items(api):
    """La vista "Vitrina agotada" sale cuando todo lo cargado hoy está en 0."""
    load_stock("tres-leches-de-fresa", "whole", 0)
    load_stock("imposible", "whole", 0)
    body = api.get(SHOWCASE_URL).json()
    assert [item["sold_out"] for item in body["items"]] == [True, True]


def test_showcase_gives_the_photo_of_the_presentation(api):
    Product.objects.filter(slug="tarta-de-frutas").update(photo="tarta.webp")
    ProductOffering.objects.filter(product__slug="tarta-de-frutas", presentation="mini").update(photo="tarta-mini.webp")
    load_stock("tarta-de-frutas", "large", 1)
    load_stock("tarta-de-frutas", "mini", 1)
    body = api.get(SHOWCASE_URL).json()
    assert [item["photo"] for item in body["items"]] == ["tarta.webp", "tarta-mini.webp"]


def test_showcase_uses_one_query(api, django_assert_num_queries):
    load_stock("tres-leches-de-fresa", "whole", 4)
    with django_assert_num_queries(1):
        api.get(SHOWCASE_URL)


# --- Rebanadas de hoy ---


def test_slices_list_only_the_slices_loaded_today_with_their_sold_out_state(api):
    load_stock("tres-leches-de-fresa", "slice", 6)
    load_stock("tres-leches-de-cajeta", "slice", 0)
    load_stock("tres-leches-de-fresa", "whole", 1)
    load_stock("imposible", "slice", 2, on_date=TODAY + timedelta(days=1))
    response = api.get(SLICES_URL)
    assert response.status_code == 200
    body = response.json()
    assert body["date"] == "2026-11-06"
    assert items(body) == [
        ("tres-leches-de-fresa", "slice", 6, False),
        ("tres-leches-de-cajeta", "slice", 0, True),
    ]
    assert all(set(item) == STOCK_ITEM_FIELDS for item in body["items"])
    assert body["items"][0]["price"] == "35.00"


def test_slices_are_empty_without_slices_for_today(api):
    assert api.get(SLICES_URL).json() == {"date": "2026-11-06", "items": []}


# --- "Hoy" es la fecha de la pastelería ---


def test_today_is_the_local_date_of_the_bakery_not_the_utc_date(api, bakery_clock):
    # 21:30 del 6 en la Ciudad de México ya es el 7 en UTC.
    bakery_clock.set(datetime(2026, 11, 7, 3, 30, tzinfo=dt_timezone.utc))
    load_stock("tres-leches-de-fresa", "whole", 4)
    load_stock("tres-leches-de-fresa", "slice", 3)
    load_stock("imposible", "whole", 9, on_date=date(2026, 11, 7))
    showcase = api.get(SHOWCASE_URL).json()
    assert showcase["date"] == "2026-11-06"
    assert [item["product_slug"] for item in showcase["items"]] == ["tres-leches-de-fresa"]
    assert api.get(SLICES_URL).json()["date"] == "2026-11-06"
    cards = {card["slug"]: card["in_showcase_today"] for card in api.get(PRODUCTS_URL).json()}
    assert (cards["tres-leches-de-fresa"], cards["imposible"]) == (True, False)


def test_today_changes_at_local_midnight(api, bakery_clock):
    load_stock("imposible", "whole", 9, on_date=date(2026, 11, 7))
    bakery_clock.set(datetime(2026, 11, 7, 5, 59, tzinfo=dt_timezone.utc))
    assert api.get(SHOWCASE_URL).json()["items"] == []
    bakery_clock.set(datetime(2026, 11, 7, 6, 0, tzinfo=dt_timezone.utc))
    body = api.get(SHOWCASE_URL).json()
    assert (body["date"], [item["product_slug"] for item in body["items"]]) == ("2026-11-07", ["imposible"])


# --- Públicas, de solo lectura y con su propio throttle ---


@pytest.mark.parametrize("url", PUBLIC_URLS)
def test_catalog_endpoints_ignore_an_invalid_token(api, url):
    api.credentials(HTTP_AUTHORIZATION="Bearer no-es-un-token")
    assert api.get(url).status_code == 200


@pytest.mark.parametrize("url", PUBLIC_URLS)
def test_catalog_endpoints_do_not_read_the_session_or_the_token(url, customer_user):
    api = APIClient(enforce_csrf_checks=True)
    api.force_login(customer_user)
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(customer_user).access_token}")
    response = api.get(url)
    assert response.status_code == 200
    assert response.renderer_context["request"].user.is_anonymous


@pytest.mark.parametrize("url", PUBLIC_URLS)
@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_catalog_endpoints_only_answer_get(api, url, method):
    response = getattr(api, method)(url, {"featured_on_home": True}, format="json")
    assert response.status_code == 405
    assert not Product.objects.filter(featured_on_home=True).exists()


def test_catalog_endpoints_use_their_own_rate(api, monkeypatch):
    # Con la anónima en 1/min, solo la propia (2/min) debe contar.
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"catalog": "2/min"})
    monkeypatch.setattr(AnonRateThrottle, "THROTTLE_RATES", {"anon": "1/min"})
    assert [api.get(PRODUCTS_URL).status_code for _ in range(3)] == [200, 200, 429]


def test_the_catalog_endpoints_share_one_quota(api, monkeypatch):
    """La portada pide tres (pasteles de la casa, vitrina y rebanadas): cuentan juntas."""
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"catalog": "3/min"})
    assert [api.get(url).status_code for url in (FEATURED_URL, SHOWCASE_URL, SLICES_URL)] == [200, 200, 200]
    assert api.get(PRODUCTS_URL).status_code == 429
    assert api.get(product_url("imposible")).status_code == 429


def test_the_catalog_does_not_share_its_quota_with_the_price_or_the_footer(api, monkeypatch):
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"catalog": "2/min", "store_info": "2/min"})
    monkeypatch.setattr(AnonRateThrottle, "THROTTLE_RATES", {"anon": "2/min"})

    def price():
        return api.generic("POST", PRICE_URL, json.dumps(PRICE_REQUEST), content_type="application/json").status_code

    def catalog():
        return api.get(PRODUCTS_URL).status_code

    def store_info():
        return api.get(STORE_INFO_URL).status_code

    assert [catalog(), catalog(), catalog()] == [200, 200, 429]
    assert [price(), price(), price()] == [200, 200, 429]
    assert [store_info(), store_info(), store_info()] == [200, 200, 429]
    cache.clear()
    assert [price(), price(), price()] == [200, 200, 429]
    assert [catalog(), catalog(), catalog()] == [200, 200, 429]


def test_catalog_rate_is_configured_and_covers_more_than_the_footer(settings):
    """La portada gasta tres peticiones del catálogo por cada una del pie."""
    rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    catalog_requests, catalog_seconds = ScopedRateThrottle().parse_rate(rates["catalog"])
    footer_requests, footer_seconds = ScopedRateThrottle().parse_rate(rates["store_info"])
    assert catalog_seconds == footer_seconds
    assert catalog_requests >= 3 * footer_requests


# --- Contrato OpenAPI ---


OPERATIONS = {
    PRODUCTS_URL: "catalog_products",
    f"{PRODUCTS_URL}{{slug}}/": "catalog_product_detail",
    FEATURED_URL: "catalog_featured_products",
    SHOWCASE_URL: "catalog_showcase",
    SLICES_URL: "catalog_slices",
}


@pytest.fixture
def schema(api, staff_user):
    api.force_login(staff_user)
    return api.get("/api/v1/schema/", {"format": "json"}).json()


def test_catalog_endpoints_are_in_the_openapi_schema_as_public_gets(schema):
    for path, operation_id in OPERATIONS.items():
        operations = schema["paths"][path]
        assert set(operations) == {"get"}, path
        assert operations["get"]["operationId"] == operation_id
        assert operations["get"].get("security") in (None, [], [{}])


def test_schema_documents_the_query_parameters_and_the_404(schema):
    list_params = {p["name"]: p for p in schema["paths"][PRODUCTS_URL]["get"]["parameters"]}
    assert set(list_params) == {"category", "search"}
    assert list_params["search"]["schema"]["maxLength"] == Product._meta.get_field("name").max_length
    showcase_params = {p["name"] for p in schema["paths"][SHOWCASE_URL]["get"]["parameters"]}
    assert showcase_params == {"category"}
    assert "parameters" not in schema["paths"][SLICES_URL]["get"]
    assert "404" in schema["paths"][f"{PRODUCTS_URL}{{slug}}/"]["get"]["responses"]


def test_schema_marks_money_as_strings_and_only_the_pending_fields_as_nullable(schema):
    components = schema["components"]["schemas"]
    card = components["ProductCard"]
    assert set(card["properties"]) == set(card["required"]) == CARD_FIELDS
    nullable = {name for name, prop in card["properties"].items() if prop.get("nullable") or "oneOf" in prop}
    assert nullable == {"cake_type", "bread", "filling_base", "photo"}
    stock_item = components["StockItem"]
    assert set(stock_item["properties"]) == STOCK_ITEM_FIELDS
    assert stock_item["properties"]["price"]["type"] == "string"
    assert components["TodayStock"]["properties"]["date"]["format"] == "date"


# --- Campo "destacado en la portada" ---


def test_featured_on_home_is_off_by_default_and_explains_who_picks():
    from core_pasteleria.services import catalog_service

    field = Product._meta.get_field("featured_on_home")
    assert field.get_default() is False
    assert field.verbose_name == "destacado en la portada"
    assert "pastelería" in str(field.help_text)
    assert str(catalog_service.HOME_FEATURED_LIMIT) in str(field.help_text)


def test_the_seed_marks_no_product_as_featured():
    assert Product.objects.count() == 22
    assert not Product.objects.filter(featured_on_home=True).exists()


def test_featured_on_home_is_editable_from_the_product_list_but_is_active_is_not():
    """Activar o desactivar va en el formulario del producto: una lista vieja no lo republica."""
    model_admin = django_admin.site._registry[Product]
    assert "featured_on_home" in model_admin.list_display
    assert "featured_on_home" in model_admin.list_editable
    assert "featured_on_home" in model_admin.list_filter
    assert "is_active" not in model_admin.list_editable


CHANGELIST_URL = "admin:core_pasteleria_product_changelist"


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    return client


def changelist_post(products, featured=(), **extra):
    """Datos de "Guardar" en la lista de productos, con `featured` marcados."""
    data = {"form-TOTAL_FORMS": len(products), "form-INITIAL_FORMS": len(products), "_save": "Guardar"}
    for index, product in enumerate(products):
        data[f"form-{index}-id"] = product.pk
        data[f"form-{index}-sort_order"] = product.sort_order
        if product.slug in featured:
            data[f"form-{index}-featured_on_home"] = "on"
    return {**data, **extra}


def test_admin_product_list_marks_featured_products(superuser_client):
    products = list(Product.objects.order_by("sort_order", "name"))
    url = reverse(CHANGELIST_URL)
    response = superuser_client.post(url, changelist_post(products, {"imposible", "choco-pinguino"}))
    assert response.status_code == 302
    assert set(Product.objects.filter(featured_on_home=True).values_list("slug", flat=True)) == {
        "imposible", "choco-pinguino",
    }
    page = superuser_client.get(url, {"featured_on_home__exact": "1"}).content.decode()
    assert "destacado en la portada" in page.lower()


def test_saving_a_stale_product_list_does_not_republish_a_deactivated_product(superuser_client):
    products = list(Product.objects.order_by("sort_order", "name"))
    # La lista se cargó con "posible" activo; mientras tanto, alguien lo desactivó.
    stale = {f"form-{i}-is_active": "on" for i in range(len(products))}
    Product.objects.filter(slug="posible").update(is_active=False)
    response = superuser_client.post(reverse(CHANGELIST_URL), changelist_post(products, {"imposible"}, **stale))
    assert response.status_code == 302
    assert Product.objects.get(slug="posible").is_active is False
    assert Product.objects.get(slug="imposible").featured_on_home is True


def test_staff_who_can_only_view_products_cannot_save_the_list(client, staff_user):
    from django.contrib.auth.models import Permission

    staff_user.user_permissions.add(Permission.objects.get(codename="view_product"))
    client.force_login(staff_user)
    url = reverse(CHANGELIST_URL)
    assert client.get(url).status_code == 200
    products = list(Product.objects.order_by("sort_order", "name"))
    response = client.post(url, changelist_post(products, {"imposible"}))
    assert response.status_code == 403
    assert not Product.objects.filter(featured_on_home=True).exists()


def warnings_on_the_product_list(client):
    from django.contrib.messages import WARNING

    response = client.get(reverse(CHANGELIST_URL))
    return [str(message) for message in response.context["messages"] if message.level == WARNING]


def test_admin_warns_when_more_products_are_marked_than_the_home_page_shows(superuser_client):
    marked = ["imposible", "posible", "choco-pinguino", "tres-leches-de-fresa", "tres-leches-de-durazno"]
    Product.objects.filter(slug__in=marked).update(featured_on_home=True)
    assert warnings_on_the_product_list(superuser_client) == [
        "Hay 5 productos activos destacados en la portada, y la portada muestra solo los primeros 4, "
        "en el orden de la lista."
    ]


def test_admin_does_not_warn_up_to_the_limit_or_for_inactive_marked_products(superuser_client):
    marked = ["imposible", "posible", "choco-pinguino", "tres-leches-de-fresa", "tres-leches-de-durazno"]
    Product.objects.filter(slug__in=marked).update(featured_on_home=True)
    Product.objects.filter(slug="posible").update(is_active=False)
    assert warnings_on_the_product_list(superuser_client) == []
