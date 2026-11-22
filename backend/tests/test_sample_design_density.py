"""Lo tupido de la fruta y de las chispas en la imagen del catálogo, y los tulipanes cerrados (tanda 4b, segunda vuelta).

El usuario pidió que la fruta de choco vainilla, cajeta y capuchino se vea concentrada como en la foto, sin el centro vacío, y más
chispas en choco vainilla. Son campos de la muestra del modelo, solo para la imagen; con 1, la imagen de siempre. La `0054` los
siembra en esos tres pasteles y pasa las conchas de capuchino a tulipanes cerrados.
"""
import importlib

import pytest
from django.apps import apps
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from core_pasteleria.models import OBSERVED_IN_PHOTO, DecorationOption, Product, ProductSampleDesign, SampleShells

density_seed = importlib.import_module("core_pasteleria.migrations.0054_seed_sample_density")
new_cakes = importlib.import_module("core_pasteleria.migrations.0064_seed_blueberry_pinguino_zarzamora_samples")

pytestmark = pytest.mark.django_db

PRODUCTS_URL = "/api/v1/products/"
DENSE = {"tres-leches-de-choco-vainilla", "tres-leches-de-cajeta", "tres-leches-de-capuchino"}


def sample_of(slug):
    return ProductSampleDesign.objects.get(product__slug=slug)


def new_sample(**fields):
    return ProductSampleDesign(
        product=Product.objects.get(slug="tres-leches-de-zarzamora"),
        coverage_color="#F2EDE7",
        decoration=DecorationOption.objects.get(slug="rosetones"),
        **fields,
    )


def errors_of(sample):
    with pytest.raises(ValidationError) as caught:
        sample.full_clean()
    return caught.value.message_dict


def test_by_default_the_fruit_and_the_sprinkles_draw_as_before():
    sample = new_sample()
    sample.full_clean()
    assert (sample.fruit_density, sample.sprinkle_density) == (1.0, 1.0)


@pytest.mark.parametrize(("field", "value"), [("fruit_density", 0.9), ("fruit_density", 3.1), ("sprinkle_density", 0.5), ("sprinkle_density", 10.5)])
def test_the_densities_stay_in_their_range(field, value):
    assert field in errors_of(new_sample(**{field: value}))


def test_the_densities_say_they_were_observed_and_only_draw_in_the_image():
    for name in ("fruit_density", "sprinkle_density"):
        help_text = ProductSampleDesign._meta.get_field(name).help_text
        assert OBSERVED_IN_PHOTO in help_text
        assert "Solo en la imagen del catálogo." in help_text


def test_closed_tulips_are_a_kind_of_shells():
    assert "tulips" in SampleShells.values
    new_sample(shells="tulips", shell_color="#E2D3B5").full_clean()


def test_the_seed_makes_the_fruit_dense_on_the_three_cakes_and_leaves_the_other_five():
    # La `0058` sube capuchino a 3 y llena también queso y chocolate y flan y cajeta.
    later = {"tres-leches-de-capuchino": 3.0, "tres-leches-con-queso-y-chocolate": 2.0, "tres-leches-con-flan-y-cajeta": 2.0}
    # Los cuatro pasteles de la `0064` llegan con su fruta tupida ya sembrada.
    later.update({slug: new_cakes.seeded(slug)["fruit_density"] for slug in new_cakes.SAMPLES})
    for sample in ProductSampleDesign.objects.select_related("product"):
        expected = later.get(sample.product.slug, 2.0 if sample.product.slug in DENSE else 1.0)
        assert sample.fruit_density == expected, sample.product.slug
    assert sample_of("tres-leches-de-choco-vainilla").sprinkle_density == 8.0
    assert sample_of("tres-leches-de-galleta").sprinkle_density == 1.0
    assert sample_of("tres-leches-de-capuchino").shells == "tulips"
    assert sample_of("tres-leches-de-choco-vainilla").shells == "edge"


def test_the_density_seed_does_not_overwrite_the_admin_and_runs_twice_the_same():
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-cajeta").update(fruit_density=1.4)
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-capuchino").update(shells="edge")
    density_seed.unseed(apps, None)
    density_seed.seed(apps, None)
    density_seed.seed(apps, None)
    assert sample_of("tres-leches-de-cajeta").fruit_density == 1.4
    # Capuchino volvió a su valor de antes con la reversa y la semilla lo pasa otra vez a tulipanes.
    assert sample_of("tres-leches-de-capuchino").shells == "tulips"
    assert sample_of("tres-leches-de-choco-vainilla").fruit_density == 2.0


def test_the_density_reverse_restores_only_what_is_still_as_seeded():
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-choco-vainilla").update(sprinkle_density=5.0)
    density_seed.unseed(apps, None)
    vanilla = sample_of("tres-leches-de-choco-vainilla")
    assert (vanilla.fruit_density, vanilla.sprinkle_density) == (1.0, 5.0)
    assert sample_of("tres-leches-de-capuchino").shells == "edge"
    assert sample_of("tres-leches-de-cajeta").fruit_density == 1.0


def test_the_detail_gives_the_densities():
    sample = APIClient().get(f"{PRODUCTS_URL}tres-leches-de-choco-vainilla/").json()["sample_design"]
    assert (sample["fruit_density"], sample["sprinkle_density"]) == (2.0, 8.0)
    fresa = APIClient().get(f"{PRODUCTS_URL}tres-leches-de-fresa/").json()["sample_design"]
    assert (fresa["fruit_density"], fresa["sprinkle_density"]) == (1.0, 1.0)
