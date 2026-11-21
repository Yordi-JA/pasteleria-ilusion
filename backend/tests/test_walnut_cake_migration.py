"""«Tres leches de nuez» fuera del catálogo (`0061_seed_hide_walnut_cake`, 20 de noviembre de 2026).

La tarjeta y la ficha dejan de salir, pero la fila, sus ofertas y el sabor `nuez` se quedan: el diseñador sigue ofreciendo
Nuez, la semilla corre otra vez sin cambios y se revierte sin tocar lo demás.
"""
import importlib

import pytest
from django.apps import apps
from rest_framework.test import APIClient

from core_pasteleria.models import FillingFlavor, Product, ProductOffering

migration = importlib.import_module("core_pasteleria.migrations.0061_seed_hide_walnut_cake")

pytestmark = pytest.mark.django_db
SLUG = "tres-leches-de-nuez"


def walnut():
    return Product.objects.get(slug=SLUG)


def test_the_catalog_and_the_detail_no_longer_show_the_walnut_cake():
    api = APIClient()
    slugs = {card["slug"] for card in api.get("/api/v1/products/").json()}
    assert SLUG not in slugs
    assert api.get(f"/api/v1/products/{SLUG}/").status_code == 404


def test_the_row_and_the_walnut_flavor_stay_and_the_designer_still_offers_nuez():
    assert not walnut().is_active
    assert ProductOffering.objects.filter(product__slug=SLUG).exists()
    assert FillingFlavor.objects.get(slug="nuez").is_active
    options = APIClient().get("/api/v1/cake-designs/options/").json()
    flavors = {flavor["slug"] for base in options["filling_bases"] for flavor in base["flavors"]}
    assert "nuez" in flavors


def test_running_it_again_changes_nothing():
    migration.seed(apps, None)
    assert not walnut().is_active
    assert set(Product.objects.filter(is_active=False).values_list("slug", flat=True)) == {SLUG, "red-velvet"}


def test_the_reverse_reactivates_it_and_the_seed_hides_it_again():
    migration.unseed(apps, None)
    assert walnut().is_active
    assert SLUG in {card["slug"] for card in APIClient().get("/api/v1/products/").json()}
    migration.seed(apps, None)
    assert not walnut().is_active
