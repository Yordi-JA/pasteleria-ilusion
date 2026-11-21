"""«Red velvet» fuera del catálogo (`0062_seed_hide_red_velvet_cake`, 20 de noviembre de 2026).

La tarjeta y la ficha dejan de salir, pero la fila, su oferta y su precio se quedan: el diseñador sigue ofreciendo el pan
Red velvet, con su relleno incluido y su vista previa. La semilla corre otra vez sin cambios y se revierte sin tocar lo demás.
"""
import importlib

import pytest
from django.apps import apps
from rest_framework.test import APIClient

from core_pasteleria.models import Bread, CatalogPrice, Product, ProductOffering

migration = importlib.import_module("core_pasteleria.migrations.0062_seed_hide_red_velvet_cake")

pytestmark = pytest.mark.django_db
SLUG = "red-velvet"


def red_velvet():
    return Product.objects.get(slug=SLUG)


def test_the_catalog_and_the_detail_no_longer_show_red_velvet_but_choco_pinguino_stays():
    api = APIClient()
    slugs = {card["slug"] for card in api.get("/api/v1/products/").json()}
    assert SLUG not in slugs and "choco-pinguino" in slugs
    assert api.get(f"/api/v1/products/{SLUG}/").status_code == 404


def test_the_row_its_offering_and_its_price_stay():
    assert not red_velvet().is_active
    offering = ProductOffering.objects.get(product__slug=SLUG)
    assert (offering.presentation, str(offering.price.amount)) == ("whole", "450.00")
    assert CatalogPrice.objects.filter(name="Red velvet, completo").exists()


def test_the_designer_still_offers_the_red_velvet_bread_with_its_included_filling():
    assert Bread.objects.get(slug="red_velvet").is_active
    options = APIClient().get("/api/v1/cake-designs/options/").json()
    red = next(entry for entry in options["breads"] if entry["slug"] == "red_velvet")
    assert red["allowed_cake_types"] == ["seco"]
    assert red["included_filling_preview_style"]


def test_running_it_again_changes_nothing():
    migration.seed(apps, None)
    assert not red_velvet().is_active


def test_the_reverse_reactivates_it_and_the_seed_hides_it_again():
    migration.unseed(apps, None)
    assert red_velvet().is_active
    assert SLUG in {card["slug"] for card in APIClient().get("/api/v1/products/").json()}
    migration.seed(apps, None)
    assert not red_velvet().is_active
