"""El "parecido a" de un color libre de "Diseña tu pastel" (D57), calculado en el servidor.

Mismo criterio que la interfaz (`frontend/src/viewmodels/colors.ts`): el nombre de la lista de referencia
(`CoverageColor`, editable en el admin) más cercano en OKLab, solo si está a `MAX_NAME_DISTANCE` o menos; un
gris no se compara con un color de la lista (un gris no se parece a un café aunque sea lo más cercano). El
pedido guarda este nombre y nunca el texto que arma el cliente. Son colores de comida, no de la interfaz.
"""
import math
from collections.abc import Iterable

from ..repositories.records import CoverageColorRecord
from .design_layout import normalize_hex_color

# Los mismos valores que `colors.ts`; si cambian, cambian en los dos lados.
MAX_NAME_DISTANCE = 0.25
# Croma en OKLab por debajo del cual un color es gris, y por encima del cual uno de la lista no se parece a un gris.
ACHROMATIC_CHROMA = 0.03
CHROMATIC_CHROMA = 0.05


def _to_linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_to_oklab(hex_color: str) -> tuple[float, float, float]:
    """Un `#rrggbb` en OKLab (L, a, b), con las matrices de Björn Ottosson que usa la interfaz."""
    r, g, b = (_to_linear(int(hex_color[i:i + 2], 16) / 255) for i in (1, 3, 5))
    l_ = math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m_ = math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s_ = math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return (
        0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    )


def color_distance(a: str, b: str) -> float:
    """ΔE en OKLab: cuánto se parecen dos colores a la vista."""
    return math.dist(hex_to_oklab(a), hex_to_oklab(b))


def _chroma(hex_color: str) -> float:
    _, a, b = hex_to_oklab(hex_color)
    return math.hypot(a, b)


def nearest_color_name(hex_color: str, references: Iterable[CoverageColorRecord]) -> str | None:
    """El nombre más cercano a `hex_color` (el primero si empatan), o `None` si ninguno se parece."""
    gray = _chroma(hex_color) < ACHROMATIC_CHROMA
    best: tuple[float, str] | None = None
    for reference in references:
        color = normalize_hex_color(reference.preview_color)
        if color is None or (gray and _chroma(color) > CHROMATIC_CHROMA):
            continue
        distance = color_distance(hex_color, color)
        if best is None or distance < best[0]:
            best = (distance, reference.name)
    return best[1] if best is not None and best[0] <= MAX_NAME_DISTANCE else None
