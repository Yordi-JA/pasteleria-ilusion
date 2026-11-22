"""Los diseños nuevos de fresa y cajeta y la foto y la muestra de zarzamora y de chocolate (`0068` y `0069`).

La `0068` agrega lo que piden las fotos nuevas (cereza, uva negra, pera tallada en flor, la corona, los dibujos de toda la tapa, las
placas de chocolate, las conchas de la orilla, las lajas del costado y los escurridos) y la `0069` siembra. Cubre que lo sembrado pasa
la validación del admin, que la API lo entrega, que correrla otra vez no cambia nada, que no pisa lo editado en el admin y que las
reversas devuelven lo de antes.
"""
import importlib

import pytest
from django.apps import apps
from rest_framework.test import APIClient

from core_pasteleria.models import (
    FruitKind,
    FruitLayout,
    Product,
    ProductSampleDesign,
    SampleDrizzle,
    SampleShells,
    SampleSideBits,
)

pytestmark = pytest.mark.django_db

redesign = importlib.import_module("core_pasteleria.migrations.0067_seed_redesigned_samples")
migration = importlib.import_module("core_pasteleria.migrations.0069_seed_new_flavor_samples")
choices = importlib.import_module("core_pasteleria.migrations.0068_sample_new_flavor_choices")

CHANGED = ("tres-leches-de-fresa", "tres-leches-de-cajeta")
CREATED = ("tres-leches-de-zarzamora", "tres-leches-de-chocolate")


def sample_of(slug):
    return ProductSampleDesign.objects.select_related("decoration", "product").get(product__slug=slug)


def test_the_new_options_are_the_ones_the_photos_need():
    assert {"cherry", "black_grape", "pear_flower", "black_grapes", "mint"} <= set(FruitKind.values)
    assert "crown" in FruitLayout.values
    assert {"web", "feathers", "marble"} <= set(SampleDrizzle.values)
    assert {"plaques", "rim"} <= set(SampleShells.values)
    assert {"plates", "drips"} <= set(SampleSideBits.values)


def test_fresa_and_cajeta_get_their_new_design_and_pass_the_admin_validation():
    for slug in CHANGED:
        sample = sample_of(slug)
        assert redesign.fields_of(sample) == migration.after(slug), slug
        sample.full_clean()
    fresa = sample_of("tres-leches-de-fresa")
    assert (fresa.fruit_layout, fresa.fruits, fresa.drizzle, fresa.side_bits) == ("crown", ["strawberry", "cherry"], "web", "plates")
    assert fresa.top_glossy and fresa.top_ring_width is None
    cajeta = sample_of("tres-leches-de-cajeta")
    assert (cajeta.drizzle, cajeta.shells, cajeta.side_bits) == ("feathers", "plaques", "plates")
    assert {"black_grape", "pear_flower"} <= set(cajeta.fruits)


def test_zarzamora_and_chocolate_get_their_photo_and_their_sample():
    for slug in CREATED:
        sample = sample_of(slug)
        assert sample.product.photo == f"{slug}.webp"
        assert sample.decoration.slug == migration.NEW_SAMPLES[slug][0]
        for field, value in migration.seeded(slug).items():
            assert getattr(sample, field) == value, (slug, field)
        sample.full_clean()
    zarzamora = sample_of("tres-leches-de-zarzamora")
    assert (zarzamora.drizzle, zarzamora.side_bits, zarzamora.shells) == ("marble", "drips", "plaques")
    chocolate = sample_of("tres-leches-de-chocolate")
    assert (chocolate.shells, chocolate.fruit_layout) == ("rim", "cover")
    assert chocolate.dusting_color


def test_the_catalog_and_the_detail_give_the_new_samples():
    api = APIClient()
    cards = {card["slug"]: card for card in api.get("/api/v1/products/").json()}
    for slug in CREATED:
        assert cards[slug]["photo"] == f"{slug}.webp"
    for slug in CREATED + CHANGED:
        assert cards[slug]["model_image"] == f"{slug}-modelo.webp"
    fresa = api.get("/api/v1/products/tres-leches-de-fresa/").json()["sample_design"]
    assert (fresa["fruit_layout"], fresa["drizzle"], fresa["side_bits"]) == ("crown", "web", "plates")
    chocolate = api.get("/api/v1/products/tres-leches-de-chocolate/").json()["sample_design"]
    assert (chocolate["shells"], chocolate["fruits"][2]) == ("rim", "black_grapes")


def test_running_it_again_changes_nothing():
    snapshot = {slug: redesign.fields_of(sample_of(slug)) for slug in CHANGED + CREATED}
    migration.seed(apps, None)
    assert {slug: redesign.fields_of(sample_of(slug)) for slug in CHANGED + CREATED} == snapshot
    assert ProductSampleDesign.objects.filter(product__slug__in=CREATED).count() == len(CREATED)


def test_the_reverse_gives_back_the_redesign_and_removes_the_new_samples_and_photos():
    migration.unseed(apps, None)
    for slug in CHANGED:
        assert redesign.fields_of(sample_of(slug)) == redesign.after(slug), slug
    assert not ProductSampleDesign.objects.filter(product__slug__in=CREATED).exists()
    assert not Product.objects.filter(slug__in=CREATED).exclude(photo="").exists()
    migration.seed(apps, None)
    for slug in CHANGED:
        assert redesign.fields_of(sample_of(slug)) == migration.after(slug), slug
    assert ProductSampleDesign.objects.filter(product__slug__in=CREATED).count() == len(CREATED)


def test_it_does_not_overwrite_what_the_admin_changed():
    # Una muestra editada después de la `0069`: la reversa no la toca.
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-cajeta").update(coverage_color="#FFFFFF")
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-zarzamora").update(edge_size=1.5)
    Product.objects.filter(slug="tres-leches-de-chocolate").update(photo="chocolate-nueva.webp")
    migration.unseed(apps, None)
    assert sample_of("tres-leches-de-cajeta").drizzle == "feathers"
    assert ProductSampleDesign.objects.filter(product__slug="tres-leches-de-zarzamora").exists()
    assert Product.objects.get(slug="tres-leches-de-chocolate").photo == "chocolate-nueva.webp"
    # Una muestra editada antes de la `0069`: la ida tampoco la toca, ni crea una muestra donde ya hay.
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-fresa").update(edge_size=1.3)
    migration.seed(apps, None)
    fresa = sample_of("tres-leches-de-fresa")
    assert (fresa.edge_size, fresa.fruit_layout) == (1.3, "cover")
    assert sample_of("tres-leches-de-zarzamora").edge_size == 1.5
    assert Product.objects.get(slug="tres-leches-de-chocolate").photo == "chocolate-nueva.webp"


def test_reverting_the_choices_strips_only_the_new_fruits_of_an_edited_sample():
    ProductSampleDesign.objects.filter(product__slug__in=["tres-leches-de-chocolate", "tres-leches-de-zarzamora"]).update(coverage_color="#FFFFFF")
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-fresa").update(coverage_color="#FFFFFF", fruits=["cherry"])
    migration.unseed(apps, None)
    choices.strip_new_fruits(apps, None)
    chocolate = sample_of("tres-leches-de-chocolate")
    assert (chocolate.fruits, chocolate.fruit_layout) == (["pear", "strawberry", "kiwi", "peach"], "cover")
    zarzamora = sample_of("tres-leches-de-zarzamora")
    assert not {"black_grapes", "mint", "pear_flower"} & set(zarzamora.fruits)
    fresa = sample_of("tres-leches-de-fresa")
    assert (fresa.fruits, fresa.fruit_layout) == ([], "")
    for sample in ProductSampleDesign.objects.all():
        assert not set(sample.fruits) & set(choices.NEW_FRUITS), sample.product.slug
        assert bool(sample.fruits) == bool(sample.fruit_layout), sample.product.slug
