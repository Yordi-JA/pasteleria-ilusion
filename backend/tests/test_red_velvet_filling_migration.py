"""El relleno del pan Red velvet con su nombre (`0065_seed_red_velvet_filling`, 21 de noviembre de 2026).

El pan `red_velvet` trae «Betún de queso crema» como relleno incluido (la opción ya no dice «Relleno de relleno típico de red
velvet») y el producto `red-velvet`, aunque esté inactivo, su descripción corta nueva. La semilla no pisa lo que cambió el admin,
corre otra vez sin cambios y se revierte solo donde sigue su texto.
"""
import importlib

import pytest
from django.apps import apps
from rest_framework.test import APIClient

from core_pasteleria.models import Bread, Product

migration = importlib.import_module("core_pasteleria.migrations.0065_seed_red_velvet_filling")

pytestmark = pytest.mark.django_db


def filling():
    return Bread.objects.get(slug="red_velvet").included_filling


def summary():
    return Product.objects.get(slug="red-velvet").summary


def test_the_designer_offers_red_velvet_with_its_cream_cheese_frosting():
    options = APIClient().get("/api/v1/cake-designs/options/").json()
    red = next(entry for entry in options["breads"] if entry["slug"] == "red_velvet")
    assert red["included_filling"] == "Betún de queso crema"
    assert "típico" not in red["included_filling"].lower()


def test_the_inactive_product_carries_the_new_summary():
    product = Product.objects.get(slug="red-velvet")
    assert not product.is_active
    assert product.summary == "Pan red velvet con su betún de queso crema."


def test_the_catalog_card_shows_the_new_summary_when_the_product_is_reactivated(red_velvet_on_sale):
    cards = {card["slug"]: card for card in APIClient().get("/api/v1/products/").json()}
    assert cards["red-velvet"]["summary"] == "Pan red velvet con su betún de queso crema."


def test_running_it_again_changes_nothing():
    migration.seed(apps, None)
    assert filling() == "Betún de queso crema"
    assert summary() == "Pan red velvet con su betún de queso crema."


def test_it_does_not_overwrite_what_the_admin_edited():
    Bread.objects.filter(slug="red_velvet").update(included_filling="Relleno de la casa")
    Product.objects.filter(slug="red-velvet").update(summary="Nuestro red velvet.")
    migration.unseed(apps, None)
    migration.seed(apps, None)
    assert filling() == "Relleno de la casa"
    assert summary() == "Nuestro red velvet."


def test_the_reverse_brings_back_the_seeded_text_and_the_seed_fixes_it_again():
    migration.unseed(apps, None)
    assert filling() == "Relleno típico de red velvet"
    assert summary() == "Con su relleno típico de red velvet."
    migration.seed(apps, None)
    assert filling() == "Betún de queso crema"
    assert summary() == "Pan red velvet con su betún de queso crema."
