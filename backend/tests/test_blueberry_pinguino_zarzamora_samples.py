"""Las fotos y las muestras del modelo de blueberry, choco-pingüino, queso y zarzamora y flan y zarzamora (`0063` y `0064`).

La `0063` agrega las opciones que piden esas fotos (piña, manzana en rodajas, franjas, filas diagonales, garabato, huevos grandes de
la mitad de atrás, conchas que cubren la tapa, virutas grandes y semillas de la mermelada) y la `0064` pone las fotos y siembra las
muestras. Cubre lo que entregan el catálogo y la ficha, que la semilla corre otra vez sin cambios, que no pisa lo editado en el
admin y que la reversa solo quita lo que sigue como se sembró.
"""
import importlib

import pytest
from django.apps import apps
from rest_framework.test import APIClient

from core_pasteleria.models import (
    DecorationOption,
    FruitKind,
    FruitLayout,
    Product,
    ProductSampleDesign,
    SampleDrizzle,
    SampleShells,
    SampleSideBits,
)

migration = importlib.import_module("core_pasteleria.migrations.0064_seed_blueberry_pinguino_zarzamora_samples")

pytestmark = pytest.mark.django_db

SLUGS = tuple(migration.SAMPLES)


@pytest.fixture
def api():
    return APIClient()


def sample_of(slug):
    return ProductSampleDesign.objects.select_related("decoration", "product").get(product__slug=slug)


def test_the_new_options_are_the_ones_the_photos_need():
    assert {"pineapple", "apple_slice"} <= set(FruitKind.values)
    assert {"stripes", "diagonal"} <= set(FruitLayout.values)
    assert "scribble" in SampleDrizzle.values
    assert {"back", "full"} <= set(SampleShells.values)
    assert {"shavings", "seeds"} <= set(SampleSideBits.values)


def test_the_four_cakes_get_their_photo_and_their_observed_sample():
    assert set(SLUGS) == {
        "tres-leches-de-blueberry",
        "choco-pinguino",
        "tres-leches-con-queso-y-zarzamora",
        "tres-leches-con-flan-y-zarzamora",
    }
    for slug, (decoration_slug, _) in migration.SAMPLES.items():
        sample = sample_of(slug)
        assert sample.product.photo == f"{slug}.webp"
        assert sample.decoration.slug == decoration_slug
        for field, value in migration.seeded(slug).items():
            assert getattr(sample, field) == value, (slug, field)
        # Lo sembrado pasa la validación del admin (las parejas de detalles, la fruta con su acomodo, la imagen para el catálogo).
        sample.full_clean()


def test_what_each_photo_shows_is_in_its_sample():
    blueberry = sample_of("tres-leches-de-blueberry")
    assert (blueberry.fruit_layout, blueberry.fruits) == ("stripes", ["pineapple", "kiwi", "strawberry", "peach"])
    assert (blueberry.decoration.slug, blueberry.side_glossy, blueberry.top_glossy) == ("rosetones", True, True)
    pinguino = sample_of("choco-pinguino")
    assert (pinguino.shells, pinguino.side_bits, pinguino.side_texture, pinguino.fruit_layout) == ("full", "shavings", "spatula", "")
    assert pinguino.dusting_color
    queso = sample_of("tres-leches-con-queso-y-zarzamora")
    assert (queso.shells, queso.drizzle, queso.side_bits, queso.fruit_layout) == ("back", "scribble", "seeds", "mound")
    flan = sample_of("tres-leches-con-flan-y-zarzamora")
    assert (flan.fruit_layout, flan.side_band_color != "", flan.top_glossy) == ("diagonal", True, True)
    assert "apple_slice" in flan.fruits


def test_the_catalog_shows_their_model_image_and_the_detail_their_photo_and_sample(api):
    cards = {card["slug"]: card for card in api.get("/api/v1/products/").json()}
    for slug in SLUGS:
        assert cards[slug]["photo"] == f"{slug}.webp"
        assert cards[slug]["model_image"] == f"{slug}-modelo.webp"
        detail = api.get(f"/api/v1/products/{slug}/").json()
        assert detail["photo"] == f"{slug}.webp"
        assert detail["sample_design"]["model_image"] == f"{slug}-modelo.webp"
        assert detail["sample_design"]["show_model_in_catalog"] is True
    queso = api.get("/api/v1/products/tres-leches-con-queso-y-zarzamora/").json()["sample_design"]
    assert (queso["shells"], queso["drizzle"], queso["side_bits"]) == ("back", "scribble", "seeds")
    assert api.get("/api/v1/products/tres-leches-de-blueberry/").json()["sample_design"]["fruits"][0] == "pineapple"


def test_running_it_again_changes_nothing():
    before = {slug: (sample_of(slug).pk, sample_of(slug).product.photo) for slug in SLUGS}
    migration.seed(apps, None)
    assert {slug: (sample_of(slug).pk, sample_of(slug).product.photo) for slug in SLUGS} == before
    assert ProductSampleDesign.objects.filter(product__slug__in=SLUGS).count() == len(SLUGS)


def test_it_does_not_overwrite_what_the_admin_changed():
    Product.objects.filter(slug="choco-pinguino").update(photo="choco-pinguino-nueva.webp")
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-blueberry").update(coverage_color="#FFFFFF", fruit_density=1.0)
    migration.seed(apps, None)
    assert Product.objects.get(slug="choco-pinguino").photo == "choco-pinguino-nueva.webp"
    blueberry = sample_of("tres-leches-de-blueberry")
    assert (blueberry.coverage_color, blueberry.fruit_density) == ("#FFFFFF", 1.0)
    # La reversa tampoco quita lo que ya no es suyo.
    migration.unseed(apps, None)
    assert Product.objects.get(slug="choco-pinguino").photo == "choco-pinguino-nueva.webp"
    assert ProductSampleDesign.objects.filter(product__slug="tres-leches-de-blueberry").exists()


def test_it_fills_in_a_missing_sample_and_skips_a_missing_decoration():
    ProductSampleDesign.objects.filter(product__slug__in=SLUGS).delete()
    DecorationOption.objects.filter(slug="duya").update(slug="duya-renombrada")
    migration.seed(apps, None)
    seeded = set(ProductSampleDesign.objects.filter(product__slug__in=SLUGS).values_list("product__slug", flat=True))
    assert seeded == set(SLUGS) - {"choco-pinguino"}


def test_the_reverse_removes_only_what_is_still_as_seeded():
    ProductSampleDesign.objects.filter(product__slug="tres-leches-con-flan-y-zarzamora").update(edge_size=1.5)
    migration.unseed(apps, None)
    left = set(ProductSampleDesign.objects.filter(product__slug__in=SLUGS).values_list("product__slug", flat=True))
    assert left == {"tres-leches-con-flan-y-zarzamora"}
    assert not Product.objects.filter(slug__in=SLUGS).exclude(photo="").exists()
    # Las muestras de los otros pasteles no son suyas: se quedan.
    assert ProductSampleDesign.objects.filter(product__slug="tres-leches-de-fresa").exists()
    migration.seed(apps, None)
    assert ProductSampleDesign.objects.filter(product__slug__in=SLUGS).count() == len(SLUGS)
