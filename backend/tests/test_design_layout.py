"""Acomodo de la oblea y del mensaje (paso 7): cotas con repositorios en memoria, sin PostgreSQL."""
import dataclasses
from decimal import Decimal

import pytest

from core_pasteleria.services.design_layout import MessageLayout, WaferLayout
from core_pasteleria.services.pricing_service import CakeDesignChoice, CakeDesignError, calculate_price
from tests import memory_cake_design as data

WAFER = WaferLayout("sheet", 20.0, 25.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0)
MESSAGE = MessageLayout("Feliz cumpleaños Ana", "auto", None, "straight", 0.0, 0.2, 0.0, 0.0, 0.0)


def price(**choice):
    values = {"kg": 10, "cake_type": "tres_leches", "bread": "vainilla", "filling_base": "normal",
              "filling_flavors": ("durazno",)}
    values.update(choice)
    return calculate_price(CakeDesignChoice(**values), cake_options=data.cake_option_repo(), settings=data.settings_repo())


def errors_of(**choice):
    with pytest.raises(CakeDesignError) as raised:
        price(**choice)
    return raised.value.errors


def test_layouts_do_not_change_the_price():
    assert price(wafer=True, wafer_layout=WAFER, message_layout=MESSAGE) == price(wafer=True)


def test_a_wafer_layout_without_the_wafer_is_rejected():
    assert errors_of(wafer_layout=WAFER) == {"wafer_layout": ["Elige la oblea para acomodarla."]}


@pytest.mark.parametrize(
    "layout, fits",
    [
        (dataclasses.replace(WAFER, width_cm=21.6, height_cm=27.9), True),
        (dataclasses.replace(WAFER, width_cm=27.9, height_cm=21.6), True),
        (dataclasses.replace(WAFER, width_cm=27.9, height_cm=21.7), False),
        (dataclasses.replace(WAFER, width_cm=28.0, height_cm=10.0), False),
        (dataclasses.replace(WAFER, shape="circle", width_cm=21.6, height_cm=21.6), True),
        (dataclasses.replace(WAFER, shape="circle", width_cm=21.7, height_cm=21.7), False),
        (dataclasses.replace(WAFER, width_cm=1.9, height_cm=10.0), False),
    ],
)
def test_the_wafer_fits_the_letter_sheet_in_either_orientation(layout, fits):
    if fits:
        assert price(wafer=True, wafer_layout=layout).wafer == Decimal("125.00")
    else:
        assert set(errors_of(wafer=True, wafer_layout=layout)) == {"wafer_layout"}


def test_a_circle_has_one_diameter():
    layout = dataclasses.replace(WAFER, shape="circle", width_cm=10.0, height_cm=12.0)
    assert errors_of(wafer=True, wafer_layout=layout) == {"wafer_layout": ["El círculo lleva un solo diámetro."]}


@pytest.mark.parametrize(
    "changes",
    [
        {"color_mode": "auto", "color": "deep"},
        {"color_mode": "tones", "color": None},
        {"color_mode": "tones", "color": "lila"},
        {"color_mode": "custom", "color": "no-existe"},
        {"color_mode": "custom", "color": "#fff"},
        {"color_mode": "custom", "color": None},
        {"arrangement": "arc", "curve": 0.01},
    ],
)
def test_a_message_that_contradicts_itself_is_rejected(changes):
    assert set(errors_of(message_layout=dataclasses.replace(MESSAGE, **changes))) == {"message_layout"}


@pytest.mark.parametrize("color", ["#f6b8ca", "#F6B8CA", "#000000", "#ffffff", "#7f7f7f"])
def test_a_custom_message_color_is_any_full_hex_code(color):
    assert price(message_layout=dataclasses.replace(MESSAGE, color_mode="custom", color=color)).total > 0


def test_check_message_layout_returns_the_custom_color_in_lowercase():
    from core_pasteleria.services.design_layout import check_message_layout

    checked = check_message_layout(dataclasses.replace(MESSAGE, color_mode="custom", color="#F6B8CA"))
    assert checked.color == "#f6b8ca"
    assert check_message_layout(MESSAGE) is MESSAGE
