"""La oblea no sale de la tapa real del último piso (regla 6.3; pendiente 3 de la auditoría de D55).

La tapa sale de los moldes de la pastelería con el mismo reparto de pisos que la vista previa
(`frontend/src/viewmodels/cakeMolds.ts` y `cakeLid.ts`), así el servidor acepta lo que el editor dibujó.
"""
from decimal import Decimal

import pytest

from core_pasteleria.repositories.records import CakeMoldRecord
from core_pasteleria.services.cake_lid import lid_for, tier_kilos, wafer_fits
from core_pasteleria.services.design_layout import WaferLayout

# La semilla de la `0019`.
MOLDS = [
    *(CakeMoldRecord("round", Decimal(kg), Decimal(cm), None)
      for kg, cm in [("2.7", "28"), ("4", "34"), ("6", "37"), ("8", "41"), ("10", "47"), ("12", "51.5")]),
    *(CakeMoldRecord("rectangular", Decimal(kg), Decimal(length), Decimal(width))
      for kg, length, width in [("4", "41", "26"), ("5", "42", "28"), ("6", "45.4", "29.5"), ("7", "48", "33"),
                                ("8", "50", "33"), ("9", "53.5", "41"), ("10", "60", "44")]),
]
# El canto redondeado del piso: `TIER_EDGE_UNITS / UNITS_PER_CM` del frontend.
EDGE_CM = 0.06 / 0.068


def wafer(shape="circle", width=21.6, height=21.6, rotation=0.0, x=0.0, y=0.0):
    return WaferLayout(shape, width, height, rotation, x, y, 1.0, 0.0, 0.0)


@pytest.mark.parametrize("form", ["round", "rectangular"])
def test_18_kg_in_3_tiers_is_8_6_4_like_the_preview(form):
    assert tier_kilos(MOLDS, form, 18, 3) == pytest.approx([8, 6, 4])


def test_without_molds_the_tiers_follow_the_ideal_split():
    assert tier_kilos([], "round", 18, 3) == pytest.approx([18 / 2.19, 18 * 0.7 / 2.19, 18 * 0.49 / 2.19])


def test_one_tier_takes_all_the_kilos():
    assert tier_kilos(MOLDS, "round", 7, 1) == [7]


def test_the_lid_is_the_top_tier_without_its_rounded_edge():
    lid = lid_for(MOLDS, "round", 4, 1)
    assert lid.radius == pytest.approx(34 / 2 - EDGE_CM)
    rectangular = lid_for(MOLDS, "rectangular", 4, 1)
    assert (rectangular.half_x, rectangular.half_y) == pytest.approx((41 / 2 - EDGE_CM, 26 / 2 - EDGE_CM))
    assert rectangular.radius == rectangular.half_y
    # Con 3 pisos, la tapa es la del molde de 4 kg de arriba.
    assert lid_for(MOLDS, "round", 18, 3).radius == pytest.approx(34 / 2 - EDGE_CM)


def test_a_round_wafer_fits_centred_but_not_pushed_to_the_edge():
    lid = lid_for(MOLDS, "round", 4, 1)
    assert wafer_fits(wafer(), lid)
    assert not wafer_fits(wafer(x=0.5), lid)


def test_a_sheet_fits_lengthwise_on_a_rectangular_lid_but_not_turned():
    lid = lid_for(MOLDS, "rectangular", 4, 1)
    assert wafer_fits(wafer("sheet", 27.9, 21.6), lid)
    assert not wafer_fits(wafer("sheet", 27.9, 21.6, rotation=90), lid)


def test_a_turned_sheet_is_checked_by_its_corners_on_a_round_lid():
    lid = lid_for(MOLDS, "round", 12, 1)
    # Diagonal de la carta: 35.3 cm; el radio de la tapa de 12 kg, unos 24.9 cm.
    assert wafer_fits(wafer("sheet", 27.9, 21.6, rotation=37), lid)
    assert not wafer_fits(wafer("sheet", 27.9, 21.6, rotation=37, x=0.4), lid)
