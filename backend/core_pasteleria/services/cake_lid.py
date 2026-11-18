"""La tapa del último piso y la oblea sobre ella (regla 6.3; pendiente 3 de la auditoría de D55).

Es el mismo cálculo que la vista previa (`frontend/src/viewmodels/cakeMolds.ts`, `cakeLid.ts` y `lidGeometry.ts`): el
tamaño de cada piso sale de los moldes de la pastelería (`CakeMold`, D52) por sus kilos, con el reparto "molde
descendente" de los pisos, y la tapa es la del último piso sin su canto redondeado. Así el servidor rechaza una oblea
que se sale de la tapa y acepta la que el editor ya ajustó (el carrito guarda lo ajustado, D55). Si cambia la regla de
un lado, cambia en los dos. Todo va en centímetros, con el origen en el centro de la tapa.
"""
import math
from collections.abc import Sequence
from dataclasses import dataclass

from ..models import CakeShape, WaferShape
from ..repositories.records import CakeMoldRecord
from .design_layout import WaferLayout

# Cada piso pesa esto respecto del de abajo en el reparto ideal; su área no pasa de `MAX_AREA_STEP` de la del de abajo.
TIER_WEIGHT_RATIO = 0.7
MAX_AREA_STEP = 0.9
# El canto redondeado del piso: `TIER_EDGE_UNITS / UNITS_PER_CM` del frontend (unos 0.88 cm).
EDGE_CM = 0.06 / 0.068
# Medidas plausibles de un piso y el tamaño de respaldo sin moldes de esa forma (no son datos de la pastelería).
MIN_CM, MAX_CM = 15.0, 150.0
FALLBACK_CM = {CakeShape.ROUND: (38.0, 38.0), CakeShape.RECTANGULAR: (44.0, 29.0)}
FALLBACK_STEP = 0.8
# Holgura de la revisión: una décima de milímetro absorbe el redondeo de los dos lados.
TOLERANCE_CM = 0.01


@dataclass(frozen=True)
class Lid:
    """La parte plana de la tapa: en redondo, `half_x` y `half_y` son el radio; en rectangular, la mitad del largo y del
    ancho, y el radio de las posiciones relativas es la mitad del ancho."""

    form: str
    half_x: float
    half_y: float
    radius: float


Footprint = tuple[float, float]


def _area(size: Footprint) -> float:
    return size[0] * size[1]


def _measures(mold: CakeMoldRecord) -> Footprint:
    length = float(mold.length_cm)
    return length, float(mold.width_cm) if mold.width_cm is not None else length


def mold_footprint(molds: Sequence[CakeMoldRecord], form: str, kg: float) -> Footprint | None:
    """Largo y ancho para esos kilos: interpolados entre dos moldes; fuera del rango, el área crece con los kilos."""
    ordered = sorted((mold for mold in molds if mold.form == form), key=lambda mold: mold.kg)
    if not ordered or not kg > 0:
        return None
    first, last = ordered[0], ordered[-1]
    if kg <= float(first.kg) or kg >= float(last.kg):
        edge = first if kg <= float(first.kg) else last
        scale = math.sqrt(kg / float(edge.kg))
        length, width = _measures(edge)
        return length * scale, width * scale
    upper = next(index for index, mold in enumerate(ordered) if float(mold.kg) >= kg)
    low, high = ordered[upper - 1], ordered[upper]
    t = (kg - float(low.kg)) / (float(high.kg) - float(low.kg))
    (a_length, a_width), (b_length, b_width) = _measures(low), _measures(high)
    return a_length + (b_length - a_length) * t, a_width + (b_width - a_width) * t


def _ideal_kilos(kg: float, count: int) -> list[float]:
    weights = [TIER_WEIGHT_RATIO ** index for index in range(count)]
    total = sum(weights)
    return [kg * weight / total for weight in weights]


def tier_kilos(molds: Sequence[CakeMoldRecord], form: str, kg: float, tiers: int) -> list[float]:
    """Los kilos de cada piso, de abajo hacia arriba: suman `kg` y cada piso es más chico que el de abajo."""
    count = max(1, int(tiers))
    ideal = _ideal_kilos(kg, count)
    if count == 1:
        return [kg]
    rungs = sorted((float(mold.kg) for mold in molds if mold.form == form), reverse=True)
    if not rungs:
        return ideal

    def size_at(share: float) -> Footprint | None:
        return mold_footprint(molds, form, share)

    upper: list[float] = []
    for index in range(1, count):
        nearest = rungs[0]
        for rung in rungs:
            if abs(rung - ideal[index]) < abs(nearest - ideal[index]):
                nearest = rung
        lower = upper[index - 2] if index >= 2 else None

        def fits(share: float, lower=lower) -> bool:
            size = size_at(share)
            under = None if lower is None else size_at(lower)
            return size is not None and (under is None or _area(size) <= _area(under) * MAX_AREA_STEP)

        candidates = [nearest, *(rung for rung in rungs if rung < nearest), ideal[index]]
        pick = next((candidate for candidate in candidates if fits(candidate)), None)
        shrink = ideal[index]
        while pick is None:
            if fits(shrink):
                pick = shrink
            shrink *= 0.8
        upper.append(pick)
    bottom = kg - sum(upper)
    below, first = size_at(bottom), size_at(upper[0])
    if bottom > 0 and below and first and _area(first) <= _area(below) * MAX_AREA_STEP:
        return [bottom, *upper]
    return ideal


def _clamp_cm(cm: float) -> float:
    return min(MAX_CM, max(MIN_CM, cm))


def tier_sizes(molds: Sequence[CakeMoldRecord], form: str, kg: float, tiers: int) -> list[Footprint]:
    """El tamaño de cada piso; sin moldes de esa forma, el tamaño de respaldo, escalonado igual que la vista previa."""
    sizes = [mold_footprint(molds, form, share) for share in tier_kilos(molds, form, kg, tiers)]
    if all(size is not None for size in sizes):
        return sizes
    length, width = FALLBACK_CM[form]
    return [(length * FALLBACK_STEP ** index, width * FALLBACK_STEP ** index) for index in range(max(1, int(tiers)))]


def lid_for(molds: Sequence[CakeMoldRecord], form: str, kg: int, tiers: int) -> Lid:
    """La parte plana de la tapa del último piso para ese pastel."""
    length, width = tier_sizes(molds, form, kg, tiers)[-1]
    half_x, half_y = _clamp_cm(length) / 2 - EDGE_CM, _clamp_cm(width) / 2 - EDGE_CM
    if form == CakeShape.ROUND:
        return Lid(form, half_x, half_x, half_x)
    return Lid(form, half_x, half_y, half_y)


def round_lid(diameter_cm: float) -> Lid:
    """La parte plana de la tapa de un pastel redondo de 1 piso con ese diámetro (vitrina y mini, tanda 2): sin el
    acotado de `MIN_CM`, que es para los pisos que salen de los kilos, porque el mini mide 14 cm."""
    radius = float(diameter_cm) / 2 - EDGE_CM
    return Lid(CakeShape.ROUND, radius, radius, radius)


def _inside(lid: Lid, x: float, y: float) -> bool:
    if lid.form == CakeShape.ROUND:
        return math.hypot(x, y) <= lid.radius + TOLERANCE_CM
    return abs(x) <= lid.half_x + TOLERANCE_CM and abs(y) <= lid.half_y + TOLERANCE_CM


def _sheet_corners(width: float, height: float, rotation_deg: float) -> list[tuple[float, float]]:
    """Las esquinas de una hoja respecto a su centro, con su giro (hacia la derecha) aplicado."""
    angle = -math.radians(rotation_deg)
    cos, sin = math.cos(angle), math.sin(angle)
    corners = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, y = sx * width / 2, sy * height / 2
        corners.append((x * cos - y * sin, x * sin + y * cos))
    return corners


def wafer_fits(layout: WaferLayout, lid: Lid) -> bool:
    """Si la oblea, con su giro y su posición (relativa al radio de la tapa), queda dentro de la tapa."""
    cx, cy = layout.x * lid.radius, layout.y * lid.radius
    if layout.shape == WaferShape.CIRCLE:
        r = layout.width_cm / 2
        if lid.form == CakeShape.ROUND:
            return math.hypot(cx, cy) + r <= lid.radius + TOLERANCE_CM
        return abs(cx) + r <= lid.half_x + TOLERANCE_CM and abs(cy) + r <= lid.half_y + TOLERANCE_CM
    corners = _sheet_corners(layout.width_cm, layout.height_cm, layout.rotation_deg)
    return all(_inside(lid, cx + px, cy + py) for px, py in corners)


def message_room_cm(lid: Lid, rotation_deg: float) -> float:
    """Lo más largo que cabe en la tapa en la dirección que apilan los renglones del mensaje (de arriba abajo del texto,
    con su giro hacia la derecha): en redondo, el diámetro; en rectangular, la cuerda más corta entre las dos paredes que
    cruza esa dirección. El bloque de renglones no puede medir más que esto (`design_layout.check_message_block`)."""
    if lid.form == CakeShape.ROUND:
        return 2 * lid.radius
    angle = math.radians(rotation_deg)
    across, along = abs(math.sin(angle)), abs(math.cos(angle))
    chords = [2 * half / part for half, part in ((lid.half_x, across), (lid.half_y, along)) if part > 1e-9]
    return min(chords)
