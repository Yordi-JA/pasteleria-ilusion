"""Las cinco gelatinas en vaso (`0059_seed_cup_gelatins`, 20 de noviembre de 2026).

El yogurt de fresa conserva su producto, su presentación y su precio (solo cambian el `slug` y los nombres), nacen el mosaico
normal y el de yogurt de durazno, y la semilla no pisa lo que cambió el admin, corre otra vez sin cambios y se revierte.
"""
import importlib
from decimal import Decimal

import pytest
from django.apps import apps
from django.utils import timezone
from rest_framework.test import APIClient

from core_pasteleria.models import CatalogPrice, Inventory, Product, ProductOffering

catalog_seed = importlib.import_module("core_pasteleria.migrations.0009_seed_catalog")
migration = importlib.import_module("core_pasteleria.migrations.0059_seed_cup_gelatins")

pytestmark = pytest.mark.django_db

# (slug, nombre, descripción corta, precio del vaso), en el orden del catálogo.
CUPS = [
    ("gelatina-mosaico", "Mosaico normal", "Gelatina en vaso, cuadritos de sabores.", "20.00"),
    ("mosaico-con-crema", "Mosaico con crema", "Gelatina en vaso, cuadritos de sabores con crema.", "20.00"),
    (
        "mosaico-con-yogurt-de-durazno", "Mosaico con yogurt de durazno",
        "Gelatina en vaso, cuadritos de sabores con yogurt de durazno.", "20.00",
    ),
    (
        "mosaico-con-yogurt-de-fresa", "Mosaico con yogurt de fresa",
        "Gelatina en vaso, cuadritos de sabores con yogurt de fresa.", "20.00",
    ),
    ("gelatina-de-duvalin", "Gelatina de Duvalín", "Gelatina en vaso en tres secciones, como el dulce.", "25.00"),
]
NEW_SLUGS = ["gelatina-mosaico", "mosaico-con-yogurt-de-durazno"]


def catalog_counts():
    return Product.objects.count(), CatalogPrice.objects.count(), ProductOffering.objects.count()


def strawberry_offering():
    return ProductOffering.objects.select_related("product", "price").get(product__slug="mosaico-con-yogurt-de-fresa")


def load_stock(slug):
    Inventory.objects.create(
        kind="showcase", offering=ProductOffering.objects.get(product__slug=slug), stock_date=timezone.localdate(), quantity=3
    )


def test_the_catalog_lists_the_five_cups_showcase_only_in_order():
    desserts = APIClient().get("/api/v1/products/", {"category": "dessert"}).json()
    cups = [card for card in desserts if any(offering["presentation"] == "cup" for offering in card["offerings"])]
    assert [(card["slug"], card["name"], card["summary"], card["offerings"][0]["price"]) for card in cups] == CUPS
    assert {card["sales_channel"] for card in cups} == {"showcase_only"}
    assert all([offering["presentation"] for offering in card["offerings"]] == ["cup"] for card in cups)
    # Los vasos van juntos, después de la gelatina de molde.
    slugs = [card["slug"] for card in desserts]
    assert slugs[slugs.index("gelatina-de-molde") + 1:] == [cup[0] for cup in CUPS]


def test_each_cup_detail_answers_by_its_slug_and_the_old_slug_is_gone():
    api = APIClient()
    for slug, name, _summary, _price in CUPS:
        detail = api.get(f"/api/v1/products/{slug}/")
        assert detail.status_code == 200, slug
        assert (detail.json()["name"], detail.json()["category"]) == (name, "dessert")
    assert api.get("/api/v1/products/mosaico-con-yogurt/").status_code == 404
    assert not CatalogPrice.objects.filter(name="Gelatina Mosaico con yogurt (vaso)").exists()


def test_each_new_cup_has_its_own_price():
    prices = dict(ProductOffering.objects.filter(product__slug__in=[*NEW_SLUGS, "mosaico-con-yogurt-de-fresa"])
                  .values_list("product__slug", "price__name"))
    assert prices == {
        "gelatina-mosaico": "Gelatina Mosaico normal (vaso)",
        "mosaico-con-yogurt-de-durazno": "Gelatina Mosaico con yogurt de durazno (vaso)",
        "mosaico-con-yogurt-de-fresa": "Gelatina Mosaico con yogurt de fresa (vaso)",
    }
    assert set(CatalogPrice.objects.filter(name__in=prices.values()).values_list("amount", flat=True)) == {Decimal("20.00")}


def test_the_rename_keeps_the_same_product_offering_and_price_rows():
    """Los pedidos y los carritos guardan el id de la presentación: el renombre no lo cambia."""
    offering = strawberry_offering()
    migration.unseed(apps, None)
    old = ProductOffering.objects.select_related("product", "price").get(product__slug="mosaico-con-yogurt")
    assert (old.id, old.product_id, old.price_id) == (offering.id, offering.product_id, offering.price_id)
    assert (old.product.name, old.price.name) == ("Mosaico con yogurt", "Gelatina Mosaico con yogurt (vaso)")
    migration.seed(apps, None)
    again = strawberry_offering()
    assert (again.id, again.product_id, again.price_id) == (offering.id, offering.product_id, offering.price_id)


def test_running_it_again_changes_nothing():
    before = catalog_counts()
    names = list(Product.objects.order_by("id").values_list("slug", "name", "summary", "sort_order"))
    migration.seed(apps, None)
    assert catalog_counts() == before
    assert list(Product.objects.order_by("id").values_list("slug", "name", "summary", "sort_order")) == names


def test_it_removes_the_old_cup_that_the_0009_seeds_again_while_it_is_untouched():
    before = catalog_counts()
    catalog_seed.seed_catalog(apps, None)
    assert Product.objects.filter(slug="mosaico-con-yogurt").exists()
    migration.seed(apps, None)
    assert not Product.objects.filter(slug="mosaico-con-yogurt").exists()
    assert not CatalogPrice.objects.filter(name="Gelatina Mosaico con yogurt (vaso)").exists()
    assert catalog_counts() == before


def test_it_keeps_an_old_cup_that_already_has_stock():
    catalog_seed.seed_catalog(apps, None)
    load_stock("mosaico-con-yogurt")
    migration.seed(apps, None)
    assert Product.objects.filter(slug="mosaico-con-yogurt").exists()
    assert CatalogPrice.objects.filter(name="Gelatina Mosaico con yogurt (vaso)").exists()


def test_it_does_not_overwrite_what_the_admin_changed():
    migration.unseed(apps, None)
    Product.objects.filter(slug="mosaico-con-yogurt").update(name="Mosaico de yogurt casero", summary="La de la casa.")
    Product.objects.filter(slug="mosaico-con-crema").update(summary="Editada por la pastelería.")
    CatalogPrice.objects.filter(name="Gelatina Mosaico con yogurt (vaso)").update(amount=Decimal("22.00"))
    migration.seed(apps, None)
    strawberry = strawberry_offering()
    # El `slug` sí cambia (el admin no lo edita); el nombre, la descripción y el precio que capturó la pastelería, no.
    assert (strawberry.product.name, strawberry.product.summary) == ("Mosaico de yogurt casero", "La de la casa.")
    assert (strawberry.price.name, strawberry.price.amount) == ("Gelatina Mosaico con yogurt de fresa (vaso)", Decimal("22.00"))
    assert Product.objects.get(slug="mosaico-con-crema").summary == "Editada por la pastelería."


def test_it_does_not_overwrite_a_new_cup_that_already_exists():
    migration.unseed(apps, None)
    Product.objects.create(
        slug="gelatina-mosaico", name="Mosaico de la casa", summary="Otra.", category="dessert", sales_channel="showcase_only"
    )
    migration.seed(apps, None)
    mosaic = Product.objects.get(slug="gelatina-mosaico")
    assert (mosaic.name, mosaic.summary) == ("Mosaico de la casa", "Otra.")
    assert mosaic.offerings.get().price.name == "Gelatina Mosaico normal (vaso)"


def test_the_reverse_leaves_the_catalog_as_the_0009_seeded_it():
    migration.unseed(apps, None)
    old = Product.objects.get(slug="mosaico-con-yogurt")
    assert (old.name, old.summary) == ("Mosaico con yogurt", "Gelatina en vaso, con yogurt de fresa o durazno.")
    assert Product.objects.get(slug="mosaico-con-crema").summary == "Gelatina en vaso, cuadritos de sabores."
    assert not Product.objects.filter(slug__in=[*NEW_SLUGS, "mosaico-con-yogurt-de-fresa"]).exists()
    assert not CatalogPrice.objects.filter(name__startswith="Gelatina Mosaico normal").exists()
    assert not CatalogPrice.objects.filter(name__contains="durazno").exists()
    # Los 24 productos, 21 precios y 51 presentaciones de la `0009` y la `0045`.
    assert catalog_counts() == (24, 21, 51)


def test_the_reverse_keeps_a_new_cup_that_already_has_stock():
    load_stock("gelatina-mosaico")
    migration.unseed(apps, None)
    assert Product.objects.filter(slug="gelatina-mosaico").exists()
    assert CatalogPrice.objects.filter(name="Gelatina Mosaico normal (vaso)").exists()
    assert not Product.objects.filter(slug="mosaico-con-yogurt-de-durazno").exists()
