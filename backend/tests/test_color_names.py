"""El "parecido a" de un color lo calcula el servidor (D57, pendiente 10 de la auditoría de D55).

Mismo criterio que `frontend/src/viewmodels/colors.ts`: distancia en OKLab, umbral de 0.25 y un gris no se
compara con colores. Los casos son los que documenta ese archivo con la lista de la semilla.
"""
import pytest

from core_pasteleria.repositories.records import CoverageColorRecord
from core_pasteleria.services.color_names import color_distance, nearest_color_name

# La semilla de `CoverageColor` (reglas de negocio, sección 5).
SEED = [
    CoverageColorRecord(slug=name.lower(), name=name, preview_color=hex_color)
    for name, hex_color in [
        ("Amarillo", "#FAE496"), ("Blanco", "#FFFBFB"), ("Azul fuerte", "#4A70BA"), ("Azul claro", "#B0D0EC"),
        ("Verde", "#A6CE98"), ("Naranja", "#F6B06C"), ("Café", "#9C6E50"), ("Turquesa", "#6ECAC6"),
        ("Rojo", "#D44C48"), ("Rosa", "#F6B8CA"), ("Lila", "#CCBAE4"),
    ]
]


@pytest.mark.parametrize("reference", SEED, ids=lambda r: r.name)
def test_each_reference_names_itself(reference):
    assert nearest_color_name(reference.preview_color.lower(), SEED) == reference.name


@pytest.mark.parametrize(
    "color, name",
    [("#ff0000", "Rojo"), ("#4dc707", "Verde"), ("#8a2be2", "Azul fuerte"), ("#0000ff", "Azul fuerte")],
)
def test_vivid_colors_get_the_closest_name(color, name):
    assert nearest_color_name(color, SEED) == name


@pytest.mark.parametrize("color", ["#000000", "#333333"])
def test_dark_colors_have_no_name_with_the_seed(color):
    assert nearest_color_name(color, SEED) is None


def test_a_light_gray_is_like_white_but_never_like_a_color():
    assert nearest_color_name("#bdbdbd", SEED) == "Blanco"
    # Sin blanco en la lista, el gris no se nombra con el color más cercano.
    assert nearest_color_name("#bdbdbd", [r for r in SEED if r.name != "Blanco"]) is None


def test_no_references_no_name():
    assert nearest_color_name("#f6b8ca", []) is None


def test_distance_matches_the_documented_values():
    assert color_distance("#ff0000", "#d44c48") == pytest.approx(0.09, abs=0.01)
    assert color_distance("#000000", "#4a70ba") == pytest.approx(0.57, abs=0.01)
