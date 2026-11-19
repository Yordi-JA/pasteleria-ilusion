"""Los detalles de la imagen del catálogo en la muestra del modelo (tanda 4b): cara de arriba, anillo, franja, textura del
costado, hilos, piezas del borde, conchas de chocolate, espolvoreado y piezas pegadas al costado.

Solo los dibuja la imagen fija del catálogo (`/muestra/modelo/:slug`); "Diseña tu pastel" no los ofrece. Cubre el modelo y su
validación, la migración de datos que los siembra en los 8 pasteles con foto y lo que la ficha entrega en `sample_design`.
"""
import importlib
import re
from pathlib import Path

import pytest
from django.apps import apps
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from core_pasteleria.models import (
    OBSERVED_IN_PHOTO,
    DecorationOption,
    FruitKind,
    Product,
    ProductSampleDesign,
    SampleDrizzle,
    SampleShells,
    SampleSideBits,
    SampleSideTexture,
)

seed_details = importlib.import_module("core_pasteleria.migrations.0052_seed_sample_design_details")

pytestmark = pytest.mark.django_db

PRODUCTS_URL = "/api/v1/products/"

DETAIL_FIELDS = (
    "top_color",
    "top_glossy",
    "side_glossy",
    "side_texture",
    "top_ring_color",
    "top_ring_width",
    "side_band_color",
    "side_band_height",
    "drizzle",
    "drizzle_color",
    "edge_size",
    "shells",
    "shell_color",
    "shell_second_color",
    "dusting_color",
    "side_bits",
    "side_bits_color",
)

# Lo que más se ve en cada foto y que la semilla tiene que dejar (`muestras.md`, 18 de noviembre de 2026).
EXPECTED = {
    "tres-leches-de-fresa": {"top_ring_color": "#B3312F", "side_texture": "lace", "top_glossy": False},
    "tres-leches-de-durazno": {"top_color": "#E2B21C", "top_glossy": True, "side_band_color": "#D9B52E", "drizzle": "lace"},
    "tres-leches-de-cajeta": {"top_color": "#F7EFE6", "side_glossy": True, "drizzle": "threads", "side_texture": "ridges"},
    "tres-leches-con-flan-y-cajeta": {"side_glossy": True, "side_band_color": "#F1E8DC"},
    # La `0054` pasa sus conchas a tulipanes cerrados, como en la foto.
    "tres-leches-de-capuchino": {"shells": "tulips", "dusting_color": "#A8875E", "side_bits": "flakes"},
    "tres-leches-de-choco-vainilla": {"shells": "edge", "shell_color": "#E6DFCC", "shell_second_color": "#3B2A25"},
    "tres-leches-de-galleta": {"side_bits": "crumbs", "side_bits_color": "#2E2422"},
    "tres-leches-con-queso-y-chocolate": {"shells": "top", "dusting_color": "#F4F0EA", "side_bits": "flakes"},
}


@pytest.fixture
def api():
    return APIClient()


def sample_of(slug):
    return ProductSampleDesign.objects.select_related("decoration").get(product__slug=slug)


def new_sample(**fields):
    """Una muestra sin guardar de un pastel que la semilla no toca, válida salvo lo que se cambie."""
    values = {
        "product": Product.objects.get(slug="tres-leches-de-zarzamora"),
        "coverage_color": "#F2EDE7",
        "decoration": DecorationOption.objects.get(slug="rosetones"),
        **fields,
    }
    return ProductSampleDesign(**values)


def errors_of(sample):
    with pytest.raises(ValidationError) as caught:
        sample.full_clean()
    return caught.value.message_dict


def frontend_union(name):
    """Los valores de un tipo unión de `frontend/src/three/cakeShape.ts` (`export type X = 'a' | 'b'`)."""
    source = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "three" / "cakeShape.ts").read_text(encoding="utf-8")
    union = re.search(rf"export type {name} = ([^\n]+)", source).group(1)
    return set(re.findall(r"'([a-z_]+)'", union))


# --- Modelo ---


def test_without_details_a_sample_draws_as_before():
    sample = new_sample()
    sample.full_clean()
    assert (sample.top_color, sample.side_texture, sample.drizzle, sample.shells, sample.side_bits) == ("", "", "", "", "")
    assert (sample.top_glossy, sample.side_glossy, sample.edge_size) == (False, False, 1.0)
    assert (sample.top_ring_width, sample.side_band_height) == (None, None)


def test_a_sample_with_every_detail_is_valid():
    new_sample(
        top_color="#E2B21C",
        top_glossy=True,
        side_glossy=True,
        side_texture="spatula",
        top_ring_color="#B3312F",
        top_ring_width=0.5,
        side_band_color="#D9B52E",
        side_band_height=0.5,
        drizzle="lace",
        drizzle_color="#432517",
        edge_size=1.8,
        shells="edge",
        shell_color="#E6DFCC",
        shell_second_color="#3B2A25",
        dusting_color="#A8875E",
        side_bits="crumbs",
        side_bits_color="#2E2422",
    ).full_clean()


@pytest.mark.parametrize(
    "field", ["top_color", "top_ring_color", "side_band_color", "drizzle_color", "shell_color", "shell_second_color", "dusting_color", "side_bits_color"]
)
def test_every_detail_color_is_a_hex_color(field):
    assert field in errors_of(new_sample(**{field: "rojo"}))


@pytest.mark.parametrize(
    ("fields", "field"),
    [
        ({"top_ring_color": "#B3312F"}, "top_ring_width"),
        ({"top_ring_width": 0.5}, "top_ring_color"),
        ({"side_band_color": "#D9B52E"}, "side_band_height"),
        ({"side_band_height": 0.5}, "side_band_color"),
        ({"drizzle": "lace"}, "drizzle_color"),
        ({"drizzle_color": "#432517"}, "drizzle"),
        ({"shells": "edge"}, "shell_color"),
        ({"shell_color": "#E6DFCC"}, "shells"),
        ({"side_bits": "crumbs"}, "side_bits_color"),
        ({"side_bits_color": "#2E2422"}, "side_bits"),
    ],
)
def test_each_detail_goes_with_its_pair(fields, field):
    assert field in errors_of(new_sample(**fields))


def test_a_second_shell_color_needs_shells():
    assert "shell_second_color" in errors_of(new_sample(shell_second_color="#3B2A25"))


@pytest.mark.parametrize(("field", "value"), [("top_ring_width", 0.05), ("top_ring_width", 0.95), ("side_band_height", 0.0), ("side_band_height", 1.1), ("edge_size", 0.4), ("edge_size", 2.6)])
def test_the_sizes_stay_in_their_range(field, value):
    pair = {"top_ring_width": {"top_ring_color": "#B3312F"}, "side_band_height": {"side_band_color": "#D9B52E"}}.get(field, {})
    assert field in errors_of(new_sample(**{field: value, **pair}))


def test_the_help_text_says_the_seed_was_observed_in_the_photo_and_only_draws_in_the_catalog_image():
    for name in DETAIL_FIELDS:
        help_text = ProductSampleDesign._meta.get_field(name).help_text
        assert OBSERVED_IN_PHOTO in help_text, name


def test_the_detail_choices_are_the_ones_the_model_draws():
    assert set(SampleDrizzle.values) == frontend_union("DrizzleKind")
    assert set(SampleShells.values) == frontend_union("ShellPlace")
    assert set(SampleSideBits.values) == frontend_union("SideBitsKind")
    assert set(SampleSideTexture.values) == frontend_union("SideTextureKind")


def test_banana_is_a_fruit_the_model_draws():
    """Choco vainilla lleva plátano en la foto."""
    assert "banana" in FruitKind.values
    new_sample(fruit_layout="mound", fruits=["banana", "kiwi"]).full_clean()


def test_the_admin_groups_the_details_of_the_catalog_image():
    from core_pasteleria.admin import ProductSampleDesignInline

    titles = [title for title, _ in ProductSampleDesignInline.fieldsets]
    assert "Detalles de la imagen del catálogo" in titles
    fields = dict(ProductSampleDesignInline.fieldsets)["Detalles de la imagen del catálogo"]["fields"]
    flat = {name for entry in fields for name in (entry if isinstance(entry, tuple) else (entry,))}
    assert flat == set(DETAIL_FIELDS) | {"fruit_density", "sprinkle_density", "edge_inset"}


# --- Semilla ---


def test_the_seed_gives_each_photo_its_details():
    for slug, expected in EXPECTED.items():
        sample = sample_of(slug)
        assert {key: getattr(sample, key) for key in expected} == expected, slug
        sample.full_clean()


def test_the_seed_moves_the_two_part_coverage_and_the_shells_out_of_the_decoration():
    """Durazno: el costado es crema blanca y lo amarillo es la tapa. Capuchino: las conchas sustituyen a los rosetones."""
    assert sample_of("tres-leches-de-durazno").coverage_color == "#EFE9E3"
    assert sample_of("tres-leches-de-capuchino").decoration.slug == "ninguna"
    assert sample_of("tres-leches-de-choco-vainilla").fruits[-1] == "banana"
    # Cajeta: la foto tiene crestas diagonales, no surcos horizontales.
    assert sample_of("tres-leches-de-cajeta").side_comb is False


def test_running_the_detail_seed_again_changes_nothing():
    before = {slug: tuple(getattr(sample_of(slug), name) for name in DETAIL_FIELDS) for slug in EXPECTED}
    seed_details.seed(apps, None)
    assert {slug: tuple(getattr(sample_of(slug), name) for name in DETAIL_FIELDS) for slug in EXPECTED} == before


def test_the_detail_seed_does_not_overwrite_what_the_admin_changed():
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-fresa").update(top_ring_color="#FF0000", top_ring_width=0.3)
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-durazno").update(coverage_color="#FFFFFF")
    seed_details.unseed(apps, None)
    seed_details.seed(apps, None)
    fresa = sample_of("tres-leches-de-fresa")
    assert (fresa.top_ring_color, fresa.top_ring_width) == ("#FF0000", 0.3)
    assert sample_of("tres-leches-de-durazno").coverage_color == "#FFFFFF"


def test_the_detail_seed_leaves_an_edited_coverage_and_decoration_alone():
    ProductSampleDesign.objects.all().delete()
    importlib.import_module("core_pasteleria.migrations.0050_seed_product_sample_designs").seed(apps, None)
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-capuchino").update(decoration=DecorationOption.objects.get(slug="duya"))
    seed_details.seed(apps, None)
    capuchino = sample_of("tres-leches-de-capuchino")
    assert capuchino.decoration.slug == "duya"
    assert capuchino.shells == "edge"


def test_the_reverse_clears_only_the_details_still_as_seeded_and_restores_the_coverage():
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-galleta").update(side_bits_color="#000000")
    seed_details.unseed(apps, None)
    assert sample_of("tres-leches-de-galleta").side_bits_color == "#000000"
    fresa = sample_of("tres-leches-de-fresa")
    assert (fresa.top_ring_color, fresa.top_ring_width, fresa.side_texture) == ("", None, "")
    assert sample_of("tres-leches-de-durazno").coverage_color == "#E2B21C"
    assert sample_of("tres-leches-de-capuchino").decoration.slug == "rosetones"
    assert "banana" not in sample_of("tres-leches-de-choco-vainilla").fruits
    assert sample_of("tres-leches-de-cajeta").side_comb is True


# --- API ---


def test_the_detail_gives_the_render_details_of_its_sample(api):
    sample = api.get(f"{PRODUCTS_URL}tres-leches-de-fresa/").json()["sample_design"]
    assert sample["top_ring_color"] == "#B3312F"
    assert sample["top_ring_width"] == pytest.approx(0.5)
    assert sample["side_texture"] == "lace"
    assert (sample["top_color"], sample["drizzle"], sample["shells"], sample["side_bits"]) == (None, None, None, None)
    assert (sample["top_glossy"], sample["side_glossy"], sample["edge_size"]) == (False, False, 1.0)
    assert set(DETAIL_FIELDS) <= set(sample)


def test_the_detail_gives_shells_drizzle_and_bits_with_their_colors(api):
    vanilla = api.get(f"{PRODUCTS_URL}tres-leches-de-choco-vainilla/").json()["sample_design"]
    assert (vanilla["shells"], vanilla["shell_color"], vanilla["shell_second_color"]) == ("edge", "#E6DFCC", "#3B2A25")
    durazno = api.get(f"{PRODUCTS_URL}tres-leches-de-durazno/").json()["sample_design"]
    assert (durazno["drizzle"], durazno["drizzle_color"], durazno["top_glossy"]) == ("lace", "#432517", True)
    assert durazno["side_band_height"] == pytest.approx(0.5)


def test_the_cards_still_do_not_carry_the_sample(api):
    assert all("sample_design" not in card for card in api.get(PRODUCTS_URL).json())
