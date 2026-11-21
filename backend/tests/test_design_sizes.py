"""Tamaños de "Diseña tu pastel" (tanda 2 de correcciones): pastel por kilos, de vitrina y mini.

- Vitrina armada desde "Diseña tu pastel": el precio del grupo de catálogo de su relleno (o de su pan de relleno incluido)
  más la diferencia por kilo contra la referencia (tres leches, pan de vainilla, un sabor sin precio propio) por el peso
  de vitrina. Desde la ficha: el precio del producto, sin cambiar su tipo, pan ni relleno.
- Mini: siempre el precio de "Pastel mini" del catálogo, sin oblea, solo relleno Normal, sin panes de relleno incluido y
  con las decoraciones marcadas para el mini; Rosas lleva su precio de mini (PENDIENTE).
- Letra mínima del mensaje (`CakeDesignSettings.message_min_letter_cm`) en todos los tamaños.
- Datos nuevos: Blueberry (solo Normal), "Tres leches de blueberry" y "Tres leches de nuez" (precio PENDIENTE).
"""
import importlib
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from django.apps import apps
from django.urls import reverse
from rest_framework.test import APIClient

from core_pasteleria.models import (
    Bread,
    CakeDesign,
    CakeDesignSize,
    CatalogPrice,
    DecorationOption,
    DesignSize,
    FillingBase,
    FillingFlavor,
    Order,
    PolicySettings,
    Product,
    ProductOffering,
)
from core_pasteleria.services import pricing_service, warranty_service
from core_pasteleria.services.orders import schedule_service

pytestmark = pytest.mark.django_db

PRICE = "/api/v1/cake-designs/price/"
OPTIONS = "/api/v1/cake-designs/options/"
ORDERS = "/api/v1/orders/"
CDMX = ZoneInfo("America/Mexico_City")
NOW = datetime(2026, 11, 13, 12, 0, tzinfo=CDMX)
IN_TWO_DAYS = NOW.date() + timedelta(days=2)


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def customer_api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


@pytest.fixture
def bakery_clock(monkeypatch):
    monkeypatch.setattr(schedule_service, "bakery_now", lambda: NOW)
    PolicySettings.objects.update(max_unpaid_orders_per_customer=50)


def price(client, **choice):
    return client.post(PRICE, choice, format="json")


def message(scale, **changes):
    return {
        "text": "Feliz día", "color_mode": "auto", "color": None, "arrangement": "straight",
        "curve": 0, "scale": scale, "rotation_deg": 0, "x": 0, "y": 0, **changes,
    }


# --- Vitrina armada desde "Diseña tu pastel" ---

SHOWCASE_FIGURES = [
    ("tres_leches", "chocolate", "normal", ["durazno"], "363.50"),
    ("envinado", "vainilla", "normal", ["durazno"], "404.00"),
    ("tres_leches", "vainilla", "normal", ["nuez", "fresa"], "390.50"),
    ("seco", "vainilla", "normal", ["durazno"], "350.00"),
    ("tres_leches", "vainilla", "queso", ["zarzamora"], "420.00"),
    ("tres_leches", "vainilla", "normal", ["nuez"], "377.00"),
    ("seco", "red_velvet", None, [], "450.00"),
]


@pytest.mark.parametrize("cake_type, bread, base, flavors, expected", SHOWCASE_FIGURES)
def test_showcase_size_is_its_group_price_plus_the_difference_per_kilo(api, cake_type, bread, base, flavors, expected):
    response = price(
        api, cake_size="showcase", cake_type=cake_type, bread=bread, filling_base=base, filling_flavors=flavors,
        decoration="ninguna",
    )
    assert response.status_code == 200, response.json()
    data = response.json()
    assert (data["cake_size"], data["cake_subtotal"], data["total"]) == ("showcase", expected, expected)
    # Sin kilos, sin precio por kilo y sin base: pesa menos de 4 kg.
    assert (data["kg"], data["price_per_kg"], data["stand"]) == (None, None, None)
    assert data["payment"]["base_deposit"] == "0.00"
    assert data["payment"]["advance"] == str((Decimal(expected) / 2).quantize(Decimal("0.01")))


# Ronda 2: si lo armado es un pastel de la vitrina (mismo tipo, pan, base y un solo sabor), se cobra su precio.
SHOWCASE_PRODUCT_MATCHES = [
    ("tres_leches", "chocolate", "normal", ["chocolate"], "350.00"),
    ("tres_leches", "choco_vainilla", "normal", ["choco_vainilla"], "350.00"),
    ("tres_leches", "chocolate", "queso", ["chocolate"], "420.00"),
    ("tres_leches", "chocolate", "normal", ["durazno"], "363.50"),
    ("tres_leches", "vainilla", "normal", ["chocolate"], "350.00"),
]


@pytest.mark.parametrize("cake_type, bread, base, flavors, expected", SHOWCASE_PRODUCT_MATCHES)
def test_a_showcase_cake_that_matches_a_product_costs_what_the_product_costs(
    api, cake_type, bread, base, flavors, expected
):
    response = price(
        api, cake_size="showcase", cake_type=cake_type, bread=bread, filling_base=base, filling_flavors=flavors,
        decoration="flores",
    )
    assert response.status_code == 200, response.json()
    data = response.json()
    assert (data["cake_subtotal"], data["total"]) == (expected, str(Decimal(expected) + 120))


def test_a_product_with_its_price_pending_is_not_a_match(api):
    # Sin precio (PENDIENTE), "Tres leches de chocolate" no cuenta: sale la fórmula del grupo.
    pending = CatalogPrice.objects.create(name="Chocolate por confirmar", amount=None)
    ProductOffering.objects.filter(product__slug="tres-leches-de-chocolate", presentation="whole").update(price=pending)
    response = price(
        api, cake_size="showcase", cake_type="tres_leches", bread="chocolate", filling_base="normal",
        filling_flavors=["chocolate"],
    )
    assert response.status_code == 200, response.json()
    assert response.json()["cake_subtotal"] == "363.50"


def test_an_inactive_or_order_only_product_is_not_a_match(api):
    Product.objects.filter(slug="tres-leches-de-chocolate").update(is_active=False)
    Product.objects.filter(slug="tres-leches-con-queso-y-chocolate").update(sales_channel="order_only")
    common = dict(cake_size="showcase", cake_type="tres_leches", bread="chocolate", filling_base="normal")
    assert price(api, **common, filling_flavors=["chocolate"]).json()["cake_subtotal"] == "363.50"
    cheese = price(api, **{**common, "filling_base": "queso"}, filling_flavors=["chocolate"])
    assert cheese.json()["cake_subtotal"] == "433.50"


def test_showcase_size_adds_decoration_and_wafer_like_any_design(api):
    response = price(
        api, cake_size="showcase", cake_type="seco", bread="vainilla", filling_base="normal",
        filling_flavors=["durazno"], decoration="flores", wafer=True,
    )
    assert response.status_code == 200, response.json()
    assert response.json()["total"] == "595.00"  # 350 + 120 + 125


def test_showcase_size_is_round_and_one_tier(api):
    response = price(
        api, cake_size="showcase", cake_type="seco", bread="vainilla", filling_base="normal",
        filling_flavors=["durazno"], form="rectangular", tiers=2,
    )
    assert response.status_code == 400
    assert set(response.json()) >= {"form", "tiers"}


def test_showcase_and_mini_take_no_people_or_kilos(api):
    response = price(
        api, cake_size="mini", people=3, cake_type="seco", bread="vainilla", filling_base="normal",
        filling_flavors=["durazno"],
    )
    assert response.status_code == 400
    assert "people" in response.json()


# --- Vitrina desde la ficha ("Personalizar este pastel") ---


# El pan de cada pastel de vitrina (respuesta del usuario, ronda 2 de la tanda 2): vainilla en los de sabor normal y en
# los de queso o flan con zarzamora o cajeta; chocolate en los de chocolate; choco-vainilla en el de choco vainilla.
SEEDED_BREADS = {
    "tres-leches-de-durazno": "vainilla",
    "tres-leches-de-fresa": "vainilla",
    "tres-leches-de-zarzamora": "vainilla",
    "tres-leches-de-cajeta": "vainilla",
    "tres-leches-de-galleta": "vainilla",
    "tres-leches-de-chocolate": "chocolate",
    "tres-leches-de-choco-vainilla": "choco_vainilla",
    "tres-leches-de-capuchino": "vainilla",
    "tres-leches-de-blueberry": "vainilla",
    "tres-leches-de-nuez": "vainilla",
    "tres-leches-con-queso-y-chocolate": "chocolate",
    "tres-leches-con-queso-y-zarzamora": "vainilla",
    "tres-leches-con-flan-y-cajeta": "vainilla",
    "tres-leches-con-flan-y-zarzamora": "vainilla",
    "choco-pinguino": "choco_pinguino",
    "red-velvet": "red_velvet",
}


def test_every_cake_has_its_bread_in_the_seed():
    breads = dict(Product.objects.filter(category="cake").values_list("slug", "bread__slug"))
    assert breads == SEEDED_BREADS


def test_the_seed_does_not_overwrite_a_bread_chosen_in_the_admin():
    seed_module = importlib.import_module("core_pasteleria.migrations.0045_seed_design_sizes")
    Product.objects.filter(slug="tres-leches-de-fresa").update(bread=Bread.objects.get(slug="chocolate"))
    Product.objects.filter(slug="tres-leches-de-cajeta").update(bread=None)
    seed_module.seed(apps, None)
    assert Product.objects.get(slug="tres-leches-de-fresa").bread.slug == "chocolate"
    assert Product.objects.get(slug="tres-leches-de-cajeta").bread.slug == "vainilla"


def test_every_showcase_cake_sold_whole_can_be_customized(api):
    cards = {card["slug"]: card for card in api.get("/api/v1/products/", {"category": "cake"}).json()}
    for slug, card in cards.items():
        sold_whole = any(offering["presentation"] == "whole" for offering in card["offerings"])
        expected = card["sales_channel"] != "order_only" and sold_whole
        assert card["showcase_design"]["available"] is expected, slug


def test_a_showcase_product_keeps_its_price_and_adds_the_decoration(api):
    response = price(
        api, cake_size="showcase", source_product="tres-leches-de-durazno", cake_type="tres_leches",
        bread="vainilla", filling_base="normal", filling_flavors=["durazno"], decoration="flores",
    )
    assert response.status_code == 200, response.json()
    assert (response.json()["cake_subtotal"], response.json()["total"]) == ("350.00", "470.00")


def test_a_showcase_product_with_another_flavor_is_rejected(api):
    response = price(
        api, cake_size="showcase", source_product="tres-leches-de-durazno", cake_type="tres_leches",
        bread="vainilla", filling_base="normal", filling_flavors=["fresa"],
    )
    assert response.status_code == 400
    assert "filling_flavors" in response.json()


def test_a_showcase_product_with_another_bread_or_type_is_rejected(api):
    response = price(
        api, cake_size="showcase", source_product="tres-leches-de-durazno", cake_type="envinado",
        bread="chocolate", filling_base="normal", filling_flavors=["durazno"],
    )
    assert response.status_code == 400
    assert {"cake_type", "bread"} <= set(response.json())


@pytest.mark.parametrize("slug", ["red-velvet", "tres-leches-de-nuez"])
def test_order_only_products_cannot_be_customized_as_showcase(api, slug):
    product = Product.objects.get(slug=slug)
    response = price(
        api, cake_size="showcase", source_product=slug, cake_type=product.cake_type,
        bread=product.bread.slug if product.bread else "vainilla",
        filling_base=product.filling_base.slug if product.filling_base else None,
        filling_flavors=[product.filling_flavor.slug] if product.filling_flavor else [],
    )
    assert response.status_code == 400
    assert "source_product" in response.json()


def test_a_showcase_product_without_its_bread_cannot_be_customized(api):
    # Si la pastelería le quita el pan en el admin, el producto ya no se personaliza como pastel de vitrina.
    Product.objects.filter(slug="tres-leches-de-fresa").update(bread=None)
    response = price(
        api, cake_size="showcase", source_product="tres-leches-de-fresa", cake_type="tres_leches",
        bread="vainilla", filling_base="normal", filling_flavors=["fresa"],
    )
    assert response.status_code == 400
    assert response.json()["source_product"] == ["El pan de este pastel está por confirmar."]


def test_the_source_product_only_goes_with_the_showcase_size(api):
    response = price(
        api, cake_size="mini", source_product="tres-leches-de-durazno", cake_type="tres_leches",
        bread="vainilla", filling_base="normal", filling_flavors=["durazno"],
    )
    assert response.status_code == 400
    assert "source_product" in response.json()


def test_the_product_card_says_if_it_can_be_customized_as_a_showcase_cake(api, red_velvet_on_sale):
    Product.objects.filter(slug="tres-leches-de-fresa").update(bread=None)
    durazno = api.get("/api/v1/products/tres-leches-de-durazno/").json()
    fresa = api.get("/api/v1/products/tres-leches-de-fresa/").json()
    red_velvet = api.get("/api/v1/products/red-velvet/").json()
    assert durazno["showcase_design"] == {"available": True, "unavailable_reason": None}
    assert fresa["showcase_design"]["available"] is False and fresa["showcase_design"]["unavailable_reason"]
    assert red_velvet["showcase_design"]["available"] is False


# --- Mini ---


@pytest.mark.parametrize(
    "cake_type, bread, flavors",
    [("tres_leches", "vainilla", ["durazno"]), ("envinado", "chocolate", ["nuez", "fresa"])],
)
def test_mini_is_always_the_catalog_mini_price_without_surcharges(api, cake_type, bread, flavors):
    response = price(
        api, cake_size="mini", cake_type=cake_type, bread=bread, filling_base="normal", filling_flavors=flavors,
        decoration="duya",
    )
    assert response.status_code == 200, response.json()
    data = response.json()
    assert (data["cake_size"], data["cake_subtotal"], data["total"], data["stand"]) == ("mini", "130.00", "130.00", None)


@pytest.mark.parametrize("base", ["queso", "flan"])
def test_mini_has_no_cheese_or_flan(api, base):
    response = price(api, cake_size="mini", cake_type="tres_leches", bread="vainilla", filling_base=base, filling_flavors=["zarzamora"])
    assert response.status_code == 400
    assert "mini" in response.json()["filling_base"][0]


@pytest.mark.parametrize("bread", ["choco_pinguino", "red_velvet"])
def test_mini_has_no_bread_with_included_filling(api, bread):
    response = price(api, cake_size="mini", cake_type="seco", bread=bread)
    assert response.status_code == 400
    assert "mini" in response.json()["bread"][0]


def test_mini_has_no_wafer(api):
    response = price(
        api, cake_size="mini", cake_type="seco", bread="vainilla", filling_base="normal", filling_flavors=["durazno"],
        wafer=True,
    )
    assert response.status_code == 400
    assert "mini" in response.json()["wafer"][0]


@pytest.mark.parametrize("slug", ["rosetones", "olanes", "otra"])
def test_mini_refuses_the_decorations_it_does_not_take(api, slug):
    response = price(
        api, cake_size="mini", cake_type="seco", bread="vainilla", filling_base="normal", filling_flavors=["durazno"],
        decoration=slug,
    )
    assert response.status_code == 400
    assert "mini" in response.json()["decoration"][0]


@pytest.mark.parametrize("slug", ["ninguna", "duya", "festones", "chispas", "chispas-chocolate", "chispas-choco-vainilla"])
def test_mini_takes_its_included_decorations(api, slug):
    response = price(
        api, cake_size="mini", cake_type="seco", bread="vainilla", filling_base="normal", filling_flavors=["durazno"],
        decoration=slug,
    )
    assert response.status_code == 200, response.json()
    assert response.json()["total"] == "130.00"


def test_roses_on_a_mini_wait_for_their_own_price(api):
    pending = price(
        api, cake_size="mini", cake_type="seco", bread="vainilla", filling_base="normal", filling_flavors=["durazno"],
        decoration="flores",
    )
    assert pending.status_code == 400
    assert pending.json()["decoration"] == ["Precio por confirmar"]
    DecorationOption.objects.filter(slug="flores").update(mini_price=Decimal("60.00"))
    priced = price(
        api, cake_size="mini", cake_type="seco", bread="vainilla", filling_base="normal", filling_flavors=["durazno"],
        decoration="flores",
    )
    assert priced.status_code == 200, priced.json()
    assert priced.json()["total"] == "190.00"


def test_options_say_the_decoration_price_each_size_charges(api):
    """Las opciones dicen lo que cobra cada tamaño por una decoración de precio fijo: la interfaz no puede adivinar el del mini."""
    sizes = {size["code"]: size for size in api.get(OPTIONS).json()["sizes"]}
    # Rosas en el mini es PENDIENTE: no tiene precio en ese tamaño (se ve desactivada con su motivo).
    assert "flores" not in sizes["mini"]["decoration_prices"]
    assert sizes["showcase"]["decoration_prices"]["flores"] == "120.00"
    assert sizes["by_weight"]["decoration_prices"]["flores"] == "120.00"

    DecorationOption.objects.filter(slug="flores").update(mini_price=Decimal("60.00"))
    mini = next(size for size in api.get(OPTIONS).json()["sizes"] if size["code"] == "mini")
    assert mini["decoration_prices"]["flores"] == "60.00"
    assert "flores" not in mini["unavailable_decorations"]
    # Lo que anuncian las opciones es lo que cobra el precio.
    charged = price(
        api, cake_size="mini", cake_type="seco", bread="vainilla", filling_base="normal", filling_flavors=["durazno"],
        decoration="flores",
    )
    assert charged.json()["decoration"] == mini["decoration_prices"]["flores"]


# --- Letra mínima del mensaje ---


@pytest.mark.parametrize("cake_size, small, enough", [("mini", 0.2, 0.25), ("showcase", 0.1, 0.12)])
def test_the_message_letter_cannot_go_below_the_minimum(api, cake_size, small, enough):
    choice = dict(
        cake_size=cake_size, cake_type="seco", bread="vainilla", filling_base="normal", filling_flavors=["durazno"]
    )
    too_small = price(api, **choice, message_layout=message(small))
    assert too_small.status_code == 400
    assert "1.5 cm" in too_small.json()["message_layout"][0]
    assert price(api, **choice, message_layout=message(enough)).status_code == 200


def test_the_minimum_letter_also_applies_to_a_cake_by_kilos(api):
    # 4 kg redondo: molde de 34 cm, la parte plana mide unos 16.1 cm de radio.
    choice = dict(
        people=28, form="round", tiers=1, cake_type="seco", bread="vainilla", filling_base="normal",
        filling_flavors=["durazno"],
    )
    assert price(api, **choice, message_layout=message(0.08)).status_code == 400
    assert price(api, **choice, message_layout=message(0.1)).status_code == 200


# --- Opciones ---


def test_options_list_the_three_sizes_with_their_mold_and_limits(api):
    data = api.get(OPTIONS).json()
    assert data["limits"]["message_min_letter_cm"] == "1.5"
    sizes = {size["code"]: size for size in data["sizes"]}
    assert set(sizes) == {"by_weight", "showcase", "mini"}
    mini, showcase = sizes["mini"], sizes["showcase"]
    assert (mini["name"], mini["servings"], mini["approx_weight_kg"], mini["price_from"]) == ("Pastel mini", 3, None, "130.00")
    assert (mini["diameter_cm"], mini["height_cm"], mini["form"], mini["tiers"]) == ("14.0", "4.5", "round", 1)
    assert (showcase["servings"], showcase["approx_weight_kg"], showcase["price_from"]) == (19, "2.7", "350.00")
    assert (showcase["diameter_cm"], showcase["height_cm"]) == ("28.0", "6.7")
    assert mini["wafer_unavailable_reason"] and showcase["wafer_unavailable_reason"] is None
    assert set(mini["unavailable_filling_bases"]) == {"queso", "flan"}
    assert set(mini["unavailable_breads"]) == {"choco_pinguino", "red_velvet"}
    assert set(mini["unavailable_decorations"]) == {"rosetones", "olanes", "otra", "flores"}
    assert mini["unavailable_decorations"]["flores"] == "Precio por confirmar"
    assert showcase["unavailable_decorations"] == {}
    assert sizes["by_weight"]["min_kg"] == 4 and sizes["by_weight"]["form"] is None
    assert Decimal(mini["lid_radius_cm"]) < Decimal("7") < Decimal(showcase["lid_radius_cm"])


# --- Datos nuevos ---


def test_blueberry_is_a_normal_flavor_priced_like_zarzamora(api):
    normal = price(api, people=28, cake_type="envinado", bread="vainilla", filling_base="normal", filling_flavors=["blueberry"])
    assert normal.status_code == 200, normal.json()
    assert normal.json()["total"] == "800.00"  # 4 x $200, el precio general de Normal en envinado
    cheese = price(api, people=28, cake_type="tres_leches", bread="vainilla", filling_base="queso", filling_flavors=["blueberry"])
    assert cheese.status_code == 400
    assert "filling_flavors" in cheese.json()


def test_the_blueberry_cake_is_in_the_catalog(api):
    data = api.get("/api/v1/products/tres-leches-de-blueberry/").json()
    assert (data["cake_type"], data["filling_base"], data["filling_flavor"]) == ("tres_leches", "normal", "blueberry")
    assert data["sales_channel"] == "showcase_and_order" and data["photo"] is None
    assert data["summary"] == "Relleno de blueberry y cobertura de crema pastelera."
    prices = {offering["presentation"]: offering["price"] for offering in data["offerings"]}
    # Como los demás sabores normales, también en mini (ronda 2).
    assert prices == {"whole": "350.00", "slice": "35.00", "mini": "130.00"}


def test_the_walnut_cake_is_order_only_with_its_price_pending_and_hidden_from_the_catalog(api):
    # Desde la `0061` la fila sigue (order_only, precio PENDIENTE) pero no sale en el catálogo ni tiene ficha.
    walnut = Product.objects.get(slug="tres-leches-de-nuez")
    assert (walnut.sales_channel, walnut.filling_flavor.slug, walnut.is_active) == ("order_only", "nuez", False)
    whole = walnut.offerings.get()
    assert (whole.presentation, whole.price.amount) == ("whole", None)
    assert api.get("/api/v1/products/tres-leches-de-nuez/").status_code == 404
    assert all(card["slug"] != "tres-leches-de-nuez" for card in api.get("/api/v1/products/").json())


def test_the_walnut_cake_without_price_is_never_charged(customer_api, bakery_clock):
    # Aun reactivado en el admin (la `0061` lo desactiva), el precio PENDIENTE no se cobra como $0.
    Product.objects.filter(slug="tres-leches-de-nuez").update(is_active=True)
    walnut = ProductOffering.objects.get(product__slug="tres-leches-de-nuez", presentation="whole")
    response = customer_api.post(
        ORDERS,
        {
            "fulfillment": "pickup", "delivery_date": IN_TWO_DAYS.isoformat(), "slot_starts_at": "15:00",
            "pickup_name": "Ana López", "pickup_phone": "5512345678",
            "items": [{"kind": "order", "offering_id": walnut.id}],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=uuid.uuid4().hex,
    )
    assert response.status_code == 400
    assert response.json()["items"]["0"]["offering_id"] == ["Precio por confirmar: este producto todavía no se puede pedir."]


# --- Pedido ---


def order_body(design):
    return {
        "fulfillment": "pickup", "delivery_date": IN_TWO_DAYS.isoformat(), "slot_starts_at": "15:00",
        "pickup_name": "Ana López", "pickup_phone": "5512345678",
        "items": [{"kind": "design", "design": design}],
    }


def post_order(client, design):
    return client.post(ORDERS, order_body(design), format="json", HTTP_IDEMPOTENCY_KEY=uuid.uuid4().hex)


MINI = {
    "cake_size": "mini", "cake_type": "envinado", "bread": "chocolate", "filling_base": "normal",
    "filling_flavors": ["durazno"], "coverage_color": "#F6B8CA", "decoration": "festones",
}


def test_a_mini_order_has_no_kilos_and_no_stand(customer_api, bakery_clock):
    response = post_order(customer_api, MINI)
    assert response.status_code == 201, response.json()
    order = response.json()
    design = order["items"][0]["design"]
    assert (design["cake_size"], design["kg"], design["people"], design["stand"]) == ("mini", None, 3, None)
    assert design["cake_size_label"] == "Pastel mini, ~3 personas"
    assert (design["form"], design["tiers"], design["total"]) == ("round", 1, "130.00")
    assert (order["subtotal"], order["stand_deposit"], order["payment"]["advance"]) == ("130.00", "0.00", "65.00")
    saved = CakeDesign.objects.get()
    assert (saved.cake_size, saved.kg, saved.stand_id, saved.source_product_id) == ("mini", None, None, None)


def test_a_showcase_order_from_its_product_keeps_the_product(customer_api, bakery_clock):
    design = {
        **MINI, "cake_size": "showcase", "source_product": "tres-leches-de-durazno", "cake_type": "tres_leches",
        "bread": "vainilla", "decoration": "olanes",
    }
    response = post_order(customer_api, design)
    assert response.status_code == 201, response.json()
    out = response.json()["items"][0]["design"]
    assert (out["cake_size"], out["source_product"], out["total"]) == ("showcase", "tres-leches-de-durazno", "350.00")
    assert out["cake_size_label"] == "Pastel de vitrina, ~19 personas"
    assert CakeDesign.objects.get().source_product.slug == "tres-leches-de-durazno"


def test_a_showcase_order_must_be_round_and_one_tier(customer_api, bakery_clock):
    design = {**MINI, "cake_size": "showcase", "form": "rectangular", "tiers": 1}
    response = post_order(customer_api, design)
    assert response.status_code == 400
    assert "form" in response.json()["items"]["0"]["design"]


def test_a_by_weight_order_still_says_its_kilos(customer_api, bakery_clock):
    design = {**MINI, "cake_size": "by_weight", "people": 30, "form": "round", "tiers": 1}
    response = post_order(customer_api, design)
    assert response.status_code == 201, response.json()
    out = response.json()["items"][0]["design"]
    assert (out["cake_size"], out["kg"], out["cake_size_label"]) == ("by_weight", 4, "Pastel de 4 kg, 30 personas")


def test_a_mini_order_refuses_the_wafer(customer_api, bakery_clock):
    response = post_order(customer_api, {**MINI, "wafer": True})
    assert response.status_code == 400
    assert "wafer" in response.json()["items"]["0"]["design"]


def test_below_four_kilos_there_is_no_stand_deposit():
    deposit = warranty_service.get_stand_deposit(3)
    assert (deposit.stand, deposit.deposit) == (None, Decimal("0.00"))


# --- Estrategias, semilla y admin ---


def test_the_size_registry_covers_every_size():
    assert set(pricing_service.SIZE_PRICING_STRATEGIES) == set(CakeDesignSize.values)


def test_the_seed_can_run_again_without_overwriting_the_admin():
    seed_module = importlib.import_module("core_pasteleria.migrations.0045_seed_design_sizes")
    cheese = CatalogPrice.objects.get(name="Pastel con queso o con flan, completo")
    FillingBase.objects.filter(slug="normal").update(showcase_price=cheese)
    DesignSize.objects.filter(code="mini").update(diameter_cm=Decimal("15.0"))
    seed_module.seed(apps, None)
    assert FillingBase.objects.get(slug="normal").showcase_price == cheese
    assert DesignSize.objects.get(code="mini").diameter_cm == Decimal("15.0")
    new_cakes = Product.objects.filter(slug__in=["tres-leches-de-blueberry", "tres-leches-de-nuez"])
    assert (DesignSize.objects.count(), new_cakes.count()) == (2, 2)
    assert CatalogPrice.objects.filter(name="Pastel de nuez, completo").count() == 1


def test_every_seeded_size_row_passes_full_validation():
    for row in DesignSize.objects.all():
        row.full_clean()
    FillingFlavor.objects.get(slug="blueberry").full_clean()


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    return client


def test_admin_shows_the_sizes_and_the_pending_prices(superuser_client):
    sizes = superuser_client.get(reverse("admin:core_pasteleria_designsize_changelist"))
    assert sizes.status_code == 200
    assert "Pastel mini" in sizes.content.decode() and "PENDIENTE" in sizes.content.decode()
    prices = superuser_client.get(reverse("admin:core_pasteleria_catalogprice_changelist")).content.decode()
    assert "Pastel de nuez, completo" in prices and "PENDIENTE" in prices
    decorations = superuser_client.get(reverse("admin:core_pasteleria_decorationoption_changelist")).content.decode()
    assert "No va en el mini" in decorations
    # Con las dos filas, no se agrega otra ni se borra ninguna.
    assert superuser_client.get(reverse("admin:core_pasteleria_designsize_add")).status_code == 403


def test_admin_says_the_size_of_a_mini_order(customer_api, bakery_clock, superuser_client):
    response = post_order(customer_api, MINI)
    order = Order.objects.get(pk=response.json()["id"])
    page = superuser_client.get(reverse("admin:core_pasteleria_order_change", args=[order.pk])).content.decode()
    assert "Pastel mini, ~3 personas, redondo, 1 piso" in page


def test_admin_names_the_showcase_product_of_origin(customer_api, bakery_clock, superuser_client):
    design = {
        **MINI, "cake_size": "showcase", "source_product": "tres-leches-de-durazno", "cake_type": "tres_leches",
        "bread": "vainilla",
    }
    order = Order.objects.get(pk=post_order(customer_api, design).json()["id"])
    page = superuser_client.get(reverse("admin:core_pasteleria_order_change", args=[order.pk])).content.decode()
    assert "Pastel de vitrina, ~19 personas" in page
    assert "Pastel de vitrina de origen: Tres leches de durazno" in page
