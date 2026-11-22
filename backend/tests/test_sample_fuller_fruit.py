"""Más fruta en queso y chocolate, capuchino y flan y cajeta (tanda 4b, cuarta vuelta).

La fruta tupida llega hasta 3 (más alta y con piezas más grandes); con 1, la imagen de siempre. La `0058` la siembra en esos tres
pasteles y mete un poco las conchas de queso y chocolate y los tulipanes de capuchino.
"""
import importlib

import pytest
from django.apps import apps
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from core_pasteleria.models import DecorationOption, Product, ProductSampleDesign

fuller_seed = importlib.import_module("core_pasteleria.migrations.0058_seed_fuller_fruit")
new_cakes = importlib.import_module("core_pasteleria.migrations.0064_seed_blueberry_pinguino_zarzamora_samples")

pytestmark = pytest.mark.django_db


# La `0067` rediseña después las 8 muestras y la `0069` cambia otra vez fresa y cajeta y agrega zarzamora y chocolate; estas pruebas
# revisan las semillas de antes, así que cada una parte de lo que ellas dejaron (las reversas lo devuelven tal cual).
redesign = importlib.import_module("core_pasteleria.migrations.0067_seed_redesigned_samples")
new_designs = importlib.import_module("core_pasteleria.migrations.0069_seed_new_flavor_samples")


@pytest.fixture(autouse=True)
def _before_the_redesign():
    new_designs.unseed(apps, None)
    redesign.unseed(apps, None)

# Lo que dejan todas las semillas: (fruta tupida, piezas del borde más adentro).
FINAL = {
    "tres-leches-de-choco-vainilla": (2.0, 0.14),
    "tres-leches-de-cajeta": (2.0, 0.08),
    "tres-leches-de-capuchino": (3.0, 0.08),
    "tres-leches-con-queso-y-chocolate": (2.0, 0.06),
    "tres-leches-con-flan-y-cajeta": (2.0, 0.0),
    # Los cuatro pasteles de la `0064`, con lo que siembra.
    **{slug: (new_cakes.seeded(slug)["fruit_density"], new_cakes.seeded(slug)["edge_inset"]) for slug in new_cakes.SAMPLES},
}


def sample_of(slug):
    return ProductSampleDesign.objects.get(product__slug=slug)


def new_sample(**fields):
    return ProductSampleDesign(
        product=Product.objects.get(slug="tres-leches-de-zarzamora"),
        coverage_color="#F2EDE7",
        decoration=DecorationOption.objects.get(slug="rosetones"),
        **fields,
    )


def test_the_fruit_density_reaches_three_and_no_further():
    new_sample(fruit_density=3.0).full_clean()
    with pytest.raises(ValidationError) as caught:
        new_sample(fruit_density=3.1).full_clean()
    assert "fruit_density" in caught.value.message_dict


def test_the_seeds_leave_each_cake_its_fruit_and_edge():
    for sample in ProductSampleDesign.objects.select_related("product"):
        assert (sample.fruit_density, sample.edge_inset) == FINAL.get(sample.product.slug, (1.0, 0.0)), sample.product.slug


def test_the_fuller_seed_does_not_overwrite_the_admin_runs_twice_the_same_and_reverses():
    ProductSampleDesign.objects.filter(product__slug="tres-leches-con-flan-y-cajeta").update(fruit_density=1.5)
    fuller_seed.seed(apps, None)
    assert sample_of("tres-leches-con-flan-y-cajeta").fruit_density == 1.5
    assert sample_of("tres-leches-de-capuchino").fruit_density == 3.0
    fuller_seed.unseed(apps, None)
    assert sample_of("tres-leches-con-flan-y-cajeta").fruit_density == 1.5
    capuchino = sample_of("tres-leches-de-capuchino")
    assert (capuchino.fruit_density, capuchino.edge_inset) == (2.0, 0.12)
    queso = sample_of("tres-leches-con-queso-y-chocolate")
    assert (queso.fruit_density, queso.edge_inset) == (1.0, 0.0)


def test_the_detail_gives_the_fuller_fruit():
    sample = APIClient().get("/api/v1/products/tres-leches-de-capuchino/").json()["sample_design"]
    assert (sample["fruit_density"], sample["edge_inset"]) == (3.0, 0.08)
