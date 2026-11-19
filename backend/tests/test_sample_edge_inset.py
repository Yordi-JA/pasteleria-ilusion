"""Las piezas del borde de arriba más adentro de la tapa en la imagen del catálogo (tanda 4b, tercera vuelta).

El usuario pidió acercar al centro las conchas de choco vainilla, los copos de cajeta y los tulipanes de capuchino, para que abracen
la fruta como en la foto. Es un campo de la muestra del modelo, solo para la imagen; con 0, la imagen de siempre. La `0056` lo
siembra en esos tres pasteles.
"""
import importlib

import pytest
from django.apps import apps
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from core_pasteleria.models import OBSERVED_IN_PHOTO, DecorationOption, Product, ProductSampleDesign

inset_seed = importlib.import_module("core_pasteleria.migrations.0056_seed_sample_edge_inset")

pytestmark = pytest.mark.django_db

SEEDED = {"tres-leches-de-choco-vainilla": 0.14, "tres-leches-de-capuchino": 0.12, "tres-leches-de-cajeta": 0.08}


def sample_of(slug):
    return ProductSampleDesign.objects.get(product__slug=slug)


def new_sample(**fields):
    return ProductSampleDesign(
        product=Product.objects.get(slug="tres-leches-de-zarzamora"),
        coverage_color="#F2EDE7",
        decoration=DecorationOption.objects.get(slug="rosetones"),
        **fields,
    )


def test_by_default_the_edge_stays_on_the_rim():
    sample = new_sample()
    sample.full_clean()
    assert sample.edge_inset == 0.0


@pytest.mark.parametrize("value", [-0.01, 0.31])
def test_the_inset_stays_in_its_range(value):
    with pytest.raises(ValidationError) as caught:
        new_sample(edge_inset=value).full_clean()
    assert "edge_inset" in caught.value.message_dict


def test_the_inset_says_it_was_observed_and_only_draws_in_the_image():
    help_text = ProductSampleDesign._meta.get_field("edge_inset").help_text
    assert OBSERVED_IN_PHOTO in help_text
    assert "Solo en la imagen del catálogo." in help_text


def test_the_seed_moves_in_only_the_three_cakes():
    # La `0058` acerca después los tulipanes de capuchino a 0.08 y mete las conchas de queso y chocolate.
    later = {"tres-leches-de-capuchino": 0.08, "tres-leches-con-queso-y-chocolate": 0.06}
    for sample in ProductSampleDesign.objects.select_related("product"):
        assert sample.edge_inset == later.get(sample.product.slug, SEEDED.get(sample.product.slug, 0.0)), sample.product.slug


def test_the_inset_seed_does_not_overwrite_the_admin_runs_twice_the_same_and_reverses():
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-cajeta").update(edge_inset=0.2)
    inset_seed.seed(apps, None)
    assert sample_of("tres-leches-de-cajeta").edge_inset == 0.2
    assert sample_of("tres-leches-de-choco-vainilla").edge_inset == 0.14
    inset_seed.unseed(apps, None)
    assert sample_of("tres-leches-de-cajeta").edge_inset == 0.2
    assert sample_of("tres-leches-de-choco-vainilla").edge_inset == 0.0
    # Capuchino ya no está como lo sembró la `0056` (la `0058` lo pasó a 0.08): se queda.
    assert sample_of("tres-leches-de-capuchino").edge_inset == 0.08


def test_the_detail_gives_the_inset():
    sample = APIClient().get("/api/v1/products/tres-leches-de-choco-vainilla/").json()["sample_design"]
    assert sample["edge_inset"] == 0.14
    assert APIClient().get("/api/v1/products/tres-leches-de-fresa/").json()["sample_design"]["edge_inset"] == 0.0
