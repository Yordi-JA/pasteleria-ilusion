"""La foto real del Imposible (`0060_seed_imposible_photo`, 20 de noviembre de 2026).

El catálogo y la ficha dan el archivo, la semilla no pisa una foto que puso la pastelería, corre otra vez sin cambios y se
revierte sin borrar lo que no es suyo.
"""
import importlib

import pytest
from django.apps import apps
from rest_framework.test import APIClient

from core_pasteleria.models import Product

migration = importlib.import_module("core_pasteleria.migrations.0060_seed_imposible_photo")
new_cakes = importlib.import_module("core_pasteleria.migrations.0064_seed_blueberry_pinguino_zarzamora_samples")

pytestmark = pytest.mark.django_db


def imposible_photo():
    return Product.objects.get(slug="imposible").photo


def test_the_catalog_and_the_detail_give_the_imposible_photo_and_the_posible_keeps_its_slot():
    api = APIClient()
    cards = {card["slug"]: card for card in api.get("/api/v1/products/").json()}
    assert cards["imposible"]["photo"] == "imposible.webp"
    assert cards["posible"]["photo"] is None
    assert api.get("/api/v1/products/imposible/").json()["photo"] == "imposible.webp"


def test_running_it_again_changes_nothing():
    migration.seed(apps, None)
    assert imposible_photo() == "imposible.webp"
    # Las únicas otras fotos sembradas son las de los cuatro pasteles de la `0064`.
    assert set(Product.objects.exclude(photo="").values_list("slug", flat=True)) == {"imposible", *new_cakes.SAMPLES}


def test_it_does_not_overwrite_a_photo_set_in_the_admin():
    Product.objects.filter(slug="imposible").update(photo="imposible-nuevo.webp")
    migration.seed(apps, None)
    assert imposible_photo() == "imposible-nuevo.webp"
    # La reversa tampoco la quita: no es la suya.
    migration.unseed(apps, None)
    assert imposible_photo() == "imposible-nuevo.webp"


def test_the_reverse_clears_its_photo_and_the_seed_puts_it_back():
    migration.unseed(apps, None)
    assert imposible_photo() == ""
    migration.seed(apps, None)
    assert imposible_photo() == "imposible.webp"
