"""El rediseño de las muestras del modelo de los 8 pasteles de antes (`0066` y `0067`).

La `0066` agrega lo que piden sus fotos y no existía (la manzana roja en láminas grandes y el limón en rodajas; la fruta que cubre
la tapa, la de la mitad de atrás y las filas de atrás hacia el frente; los tulipanes abiertos, los rizos en media tapa y el rizo de
listón; la celosía de garabatos y las pinceladas diagonales del costado) y la `0067` cambia las 8 muestras. Cubre que lo sembrado
pasa la validación del admin, que la API lo entrega, que correrla otra vez no cambia nada, que no pisa lo editado en el admin y que
la reversa devuelve solo lo que sigue como se sembró. Las muestras de blueberry, choco-pingüino y las dos de zarzamora no se tocan.
"""
import importlib

import pytest
from django.apps import apps
from rest_framework.test import APIClient

from core_pasteleria.models import FruitKind, FruitLayout, ProductSampleDesign, SampleDrizzle, SampleShells, SampleSideTexture

pytestmark = pytest.mark.django_db

MIGRATION = "core_pasteleria.migrations.0067_seed_redesigned_samples"

EIGHT = {
    "tres-leches-de-durazno",
    "tres-leches-de-fresa",
    "tres-leches-de-cajeta",
    "tres-leches-de-galleta",
    "tres-leches-de-choco-vainilla",
    "tres-leches-de-capuchino",
    "tres-leches-con-queso-y-chocolate",
    "tres-leches-con-flan-y-cajeta",
}
LAST_NIGHT = ("tres-leches-de-blueberry", "choco-pinguino", "tres-leches-con-queso-y-zarzamora", "tres-leches-con-flan-y-zarzamora")


def migration():
    return importlib.import_module(MIGRATION)


def sample_of(slug):
    return ProductSampleDesign.objects.select_related("decoration", "product").get(product__slug=slug)


def snapshot(slug):
    sample = sample_of(slug)
    return {**migration().fields_of(sample)}


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture(autouse=True)
def _before_the_new_designs():
    """La `0069` cambia después fresa y cajeta: estas pruebas revisan la `0067`, así que parten de lo que ella dejó."""
    importlib.import_module("core_pasteleria.migrations.0069_seed_new_flavor_samples").unseed(apps, None)


def test_the_new_options_are_the_ones_the_photos_need():
    assert {"apple_wedge", "apple_sheet", "citrus"} <= set(FruitKind.values)
    assert {"cover", "back", "columns"} <= set(FruitLayout.values)
    assert {"open", "half", "curl"} <= set(SampleShells.values)
    assert "lattice" in SampleDrizzle.values
    assert "brushed" in SampleSideTexture.values


def test_the_eight_cakes_end_as_redesigned_and_pass_the_admin_validation():
    module = migration()
    assert set(module.REDESIGN) == EIGHT
    for slug in EIGHT:
        sample = sample_of(slug)
        assert module.fields_of(sample) == module.after(slug), slug
        sample.full_clean()


def test_what_each_photo_shows_is_in_its_sample():
    durazno = sample_of("tres-leches-de-durazno")
    assert (durazno.fruit_layout, durazno.drizzle, durazno.side_texture) == ("back", "lattice", "brushed")
    fresa = sample_of("tres-leches-de-fresa")
    # El anillo de mermelada deja más de la mitad de la tapa blanca, con la fruta al centro.
    assert fresa.top_ring_width <= 0.3
    assert fresa.fruit_layout == "cover"
    cajeta = sample_of("tres-leches-de-cajeta")
    assert (cajeta.fruit_layout, cajeta.shells, cajeta.fruits[:2]) == ("cover", "curl", ["apple_wedge", "grape"])
    galleta = sample_of("tres-leches-de-galleta")
    # Mandan las láminas finas de manzana, luego el abanico; la fresa y el kiwi son pocos.
    assert (galleta.fruit_layout, galleta.fruits[:2]) == ("cover", ["apple_sheet", "apple"])
    choco = sample_of("tres-leches-de-choco-vainilla")
    assert choco.fruit_layout == "cover"
    assert len(choco.fruits) >= 6
    capuchino = sample_of("tres-leches-de-capuchino")
    assert (capuchino.shells, capuchino.fruit_layout, capuchino.fruits[0]) == ("open", "cover", "pineapple")
    assert capuchino.dusting_color
    queso = sample_of("tres-leches-con-queso-y-chocolate")
    assert (queso.shells, queso.fruit_layout, queso.fruits[0]) == ("half", "cover", "apple_wedge")
    flan = sample_of("tres-leches-con-flan-y-cajeta")
    # El borde de crema pegado a la orilla: rosetones chicos y juntos, no los grandes y separados de antes.
    assert (flan.decoration.slug, flan.fruit_layout) == ("rosetones", "columns")
    assert flan.edge_size < 1.4
    assert "citrus" in flan.fruits and "starfruit" not in flan.fruits


def test_the_api_gives_the_redesigned_samples(api):
    detail = api.get("/api/v1/products/tres-leches-con-queso-y-chocolate/").json()["sample_design"]
    assert (detail["shells"], detail["fruit_layout"], detail["fruits"][0]) == ("half", "cover", "apple_wedge")
    flan = api.get("/api/v1/products/tres-leches-con-flan-y-cajeta/").json()["sample_design"]
    assert (flan["decoration"], flan["fruit_layout"], flan["fruits"]) == ("rosetones", "columns", ["strawberry", "citrus", "apple_sheet", "kiwi"])
    durazno = api.get("/api/v1/products/tres-leches-de-durazno/").json()["sample_design"]
    assert (durazno["drizzle"], durazno["side_texture"]) == ("lattice", "brushed")


def test_the_samples_of_last_night_are_not_touched():
    module = importlib.import_module("core_pasteleria.migrations.0064_seed_blueberry_pinguino_zarzamora_samples")
    for slug in LAST_NIGHT:
        sample = sample_of(slug)
        for field, value in module.seeded(slug).items():
            assert getattr(sample, field) == value, (slug, field)


def test_running_it_again_changes_nothing():
    before = {slug: snapshot(slug) for slug in EIGHT}
    migration().seed(apps, None)
    assert {slug: snapshot(slug) for slug in EIGHT} == before


def test_the_reverse_gives_back_the_previous_samples_and_forward_again():
    module = migration()
    module.unseed(apps, None)
    for slug in EIGHT:
        assert module.fields_of(sample_of(slug)) == module.before(slug), slug
    module.seed(apps, None)
    for slug in EIGHT:
        assert module.fields_of(sample_of(slug)) == module.after(slug), slug


def test_it_does_not_overwrite_what_the_admin_changed():
    module = migration()
    # Una muestra que la pastelería editó después de la `0067`: la reversa no la toca.
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-galleta").update(coverage_color="#FFFFFF")
    module.unseed(apps, None)
    galleta = sample_of("tres-leches-de-galleta")
    assert (galleta.coverage_color, galleta.fruit_layout) == ("#FFFFFF", "cover")
    assert sample_of("tres-leches-de-fresa").fruit_layout == "mound"
    # Una muestra que la pastelería editó antes de la `0067`: la ida tampoco la toca.
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-fresa").update(edge_size=1.3)
    module.seed(apps, None)
    fresa = sample_of("tres-leches-de-fresa")
    assert (fresa.edge_size, fresa.fruit_layout, fresa.top_ring_width) == (1.3, "mound", 0.5)
    assert sample_of("tres-leches-de-durazno").fruit_layout == "back"


def test_it_skips_a_missing_sample_and_one_whose_decoration_changed():
    module = migration()
    module.unseed(apps, None)
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-fresa").delete()
    from core_pasteleria.models import DecorationOption

    DecorationOption.objects.filter(slug="duya").update(slug="duya-renombrada")
    module.seed(apps, None)
    assert not ProductSampleDesign.objects.filter(product__slug="tres-leches-de-fresa").exists()
    # Sin la decoración que tenía, queso y chocolate ya no sigue como se sembró: se queda como estaba.
    assert sample_of("tres-leches-con-queso-y-chocolate").fruit_layout == "mound"
    assert sample_of("tres-leches-de-galleta").fruit_layout == "cover"


def test_reverting_the_choices_strips_only_the_new_fruits_of_an_edited_sample():
    """Una muestra editada en el admin se queda con las frutas nuevas al revertir la `0067`; la reversa de la `0066` las quita."""
    choices = importlib.import_module("core_pasteleria.migrations.0066_sample_redesign_choices")
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-galleta").update(coverage_color="#FFFFFF")
    ProductSampleDesign.objects.filter(product__slug="tres-leches-con-flan-y-cajeta").update(
        coverage_color="#FFFFFF", fruits=["apple_sheet", "citrus"]
    )
    migration().unseed(apps, None)
    assert "apple_sheet" in sample_of("tres-leches-de-galleta").fruits
    choices.strip_new_fruits(apps, None)
    galleta = sample_of("tres-leches-de-galleta")
    assert (galleta.fruits, galleta.fruit_layout) == (["apple", "strawberry", "kiwi"], "cover")
    # Sin fruta, sin acomodo.
    flan = sample_of("tres-leches-con-flan-y-cajeta")
    assert (flan.fruits, flan.fruit_layout) == ([], "")
    old_fruits = {"strawberry", "apple", "kiwi", "grape", "peach", "pear", "starfruit", "physalis", "banana", "pineapple", "apple_slice"}
    for sample in ProductSampleDesign.objects.all():
        assert set(sample.fruits) <= old_fruits, sample.product.slug
        assert bool(sample.fruits) == bool(sample.fruit_layout), sample.product.slug
