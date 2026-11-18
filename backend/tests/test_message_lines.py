"""Saltos de línea en el mensaje del pastel (paso 7, tanda 4): hasta 3 renglones, centrados, rectos o en arcos paralelos.

- El texto admite solo `\\n` como salto; `\\r\\n` y `\\r` se cambian por `\\n`. Los demás separadores y caracteres de
  control siguen fuera, como antes.
- Los saltos del principio y del final, y los espacios junto a un salto, se recortan (como DRF ya recortaba los espacios
  de las orillas). Un renglón vacío en medio se rechaza.
- 80 caracteres como máximo, con el salto contando como 1.
- El bloque de renglones cabe en la tapa: su alto con la letra elegida no pasa del espacio de la tapa en la dirección
  del texto (`cake_lid.message_room_cm`). Es la misma cuenta que el contorno del editor (`messageGeometry.ts`).
"""
import dataclasses
import re
from pathlib import Path

import pytest
from rest_framework.test import APIClient

from core_pasteleria.admin import design_lines, message_line
from core_pasteleria.api.serializers import MessageLayoutSerializer
from core_pasteleria.models import Order
from core_pasteleria.services import design_layout
from core_pasteleria.services.cake_lid import Lid, message_room_cm, round_lid
from core_pasteleria.services.design_layout import MessageLayout, check_message_layout, message_lines
from core_pasteleria.services.errors import DomainValidationError
from tests.test_order_note import note_url, pay, pdf_text
from tests.test_orders_api import bakery_clock, many_unpaid_orders  # noqa: F401 - fijan la hora y el tope de pedidos
from tests.test_orders_api import body, design_line, post

PRICE = "/api/v1/cake-designs/price/"
FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "src"
THREE_LINES = "Feliz\ncumpleaños\nAna"
MESSAGE = MessageLayout(THREE_LINES, "auto", None, "straight", 0.0, 0.2, 0.0, 0.0, 0.0)


def message(text=THREE_LINES, **changes):
    return {
        "text": text, "color_mode": "auto", "color": None, "arrangement": "straight",
        "curve": 0, "scale": 0.3, "rotation_deg": 0, "x": 0, "y": 0, **changes,
    }


def validated(text):
    serializer = MessageLayoutSerializer(data=message(text))
    assert serializer.is_valid(), serializer.errors
    return serializer.validated_data["text"]


def text_errors(text):
    serializer = MessageLayoutSerializer(data=message(text))
    assert not serializer.is_valid()
    return serializer.errors["text"]


# --- El texto ---


def test_a_line_break_is_kept():
    assert validated(THREE_LINES) == THREE_LINES


@pytest.mark.parametrize("text", ["Feliz\r\ncumpleaños\r\nAna", "Feliz\rcumpleaños\rAna", "Feliz\r\ncumpleaños\rAna"])
def test_windows_and_old_mac_breaks_become_a_single_line_feed(text):
    assert validated(text) == THREE_LINES


def test_leading_and_trailing_breaks_and_the_spaces_beside_a_break_are_trimmed():
    assert validated("\n\nFeliz \n  cumpleaños  \n Ana\n\n") == THREE_LINES
    assert validated("\r\n Ana \r\n") == "Ana"


def test_more_than_three_lines_is_rejected():
    assert text_errors("Feliz\ncumpleaños\nquerida\nAna") == ["El mensaje lleva hasta 3 renglones."]


@pytest.mark.parametrize("text", ["Feliz\n\nAna", "Feliz\n   \nAna", "Feliz\r\n\r\nAna"])
def test_an_empty_line_in_the_middle_is_rejected(text):
    assert text_errors(text) == ["El mensaje no lleva renglones vacíos."]


@pytest.mark.parametrize(
    "separator",
    ["\u2028", "\u2029", "\u0085", "\u000b", "\u000c", "\u001c", "\u001d", "\u001e", "\t", "\u001f"],
)
def test_any_other_line_separator_or_control_character_is_still_rejected(separator):
    assert text_errors(f"Feliz{separator}Ana") == ["El mensaje lleva caracteres que no se pueden imprimir."]


def test_eighty_characters_count_a_break_as_one():
    assert validated("a" * 40 + "\n" + "a" * 39) == "a" * 40 + "\n" + "a" * 39
    # Con `\r\n` también cuenta como 1: se cambia antes de medir.
    assert validated("a" * 40 + "\r\n" + "a" * 39) == "a" * 40 + "\n" + "a" * 39
    assert text_errors("a" * 40 + "\n" + "a" * 40)


def test_the_service_rejects_lines_that_skip_the_serializer():
    for text, error in [("a\nb\nc\nd", "El mensaje lleva hasta 3 renglones."), ("a\n\nb", "El mensaje no lleva renglones vacíos.")]:
        with pytest.raises(DomainValidationError) as raised:
            check_message_layout(dataclasses.replace(MESSAGE, text=text))
        assert raised.value.errors == {"message_layout": [error]}


def test_message_lines_splits_on_the_line_feed_only():
    assert message_lines(THREE_LINES) == ["Feliz", "cumpleaños", "Ana"]
    assert message_lines("Ana") == ["Ana"]


# --- El bloque cabe en la tapa ---


def test_the_room_for_the_block_follows_the_lid_and_the_turn_of_the_text():
    assert message_room_cm(round_lid(14), 37) == pytest.approx(2 * (7 - 0.06 / 0.068))
    rectangle = Lid("rectangular", 19.0, 12.0, 12.0)
    assert message_room_cm(rectangle, 0) == pytest.approx(24.0)
    assert message_room_cm(rectangle, 90) == pytest.approx(38.0)
    assert message_room_cm(rectangle, -90) == pytest.approx(38.0)
    # A 45°, la cuerda más corta de las dos paredes.
    assert message_room_cm(rectangle, 45) == pytest.approx(24.0 / (2 ** 0.5 / 2))


def test_the_block_height_is_the_line_box_plus_one_line_height_per_extra_line():
    one = design_layout.message_block_cm(dataclasses.replace(MESSAGE, text="Ana"), 10.0)
    three = design_layout.message_block_cm(MESSAGE, 10.0)
    assert one == pytest.approx(0.2 * 10 * design_layout.LINE_BOX_EM)
    assert three == pytest.approx(0.2 * 10 * (design_layout.LINE_BOX_EM + 2 * design_layout.LINE_HEIGHT_EM))


BY_KILOS = dict(people=28, form="round", tiers=1, cake_type="seco", bread="vainilla", filling_base="normal",
                filling_flavors=["durazno"])
MINI = dict(cake_size="mini", cake_type="seco", bread="vainilla", filling_base="normal", filling_flavors=["durazno"])
SHOWCASE = dict(cake_size="showcase", cake_type="seco", bread="vainilla", filling_base="normal",
                filling_flavors=["durazno"])
RECTANGULAR = {**BY_KILOS, "form": "rectangular"}


def price(client, **choice):
    return client.post(PRICE, choice, format="json")


@pytest.mark.django_db
@pytest.mark.parametrize("arrangement, curve", [("straight", 0), ("arc", 0.5), ("arc", -0.5)])
@pytest.mark.parametrize(
    "choice, fits, too_tall",
    [
        # 4 kg redondo: la parte plana mide unos 16.1 cm de radio; 3 renglones (3.35 em) caben hasta 0.597 del radio.
        (BY_KILOS, 0.55, 0.65),
        # Mini (6.12 cm de radio): la letra mínima de 1.5 cm es 0.245 del radio (0.25 la pasa) y los 3 renglones caben con ella.
        (MINI, 0.25, 0.65),
        # Vitrina (13.12 cm de radio).
        (SHOWCASE, 0.12, 0.65),
    ],
)
def test_three_lines_fit_up_to_the_lid_in_every_mold_and_arrangement(choice, fits, too_tall, arrangement, curve):
    client = APIClient()
    layout = dict(arrangement=arrangement, curve=curve)
    assert price(client, **choice, message_layout=message(scale=fits, **layout)).status_code == 200
    rejected = price(client, **choice, message_layout=message(scale=too_tall, **layout))
    assert rejected.status_code == 400
    assert rejected.json()["message_layout"] == ["Tu mensaje no cabe en el pastel: haz la letra más chica."]


@pytest.mark.django_db
def test_a_single_line_still_takes_the_largest_letter():
    for choice in (BY_KILOS, MINI, SHOWCASE, RECTANGULAR):
        assert price(APIClient(), **choice, message_layout=message("Ana", scale=1.5)).status_code == 200


@pytest.mark.django_db
def test_on_a_rectangular_lid_the_block_fits_lengthwise_when_turned():
    # 4 kg rectangular: 41 x 26 cm, la parte plana mide unos 39.2 x 24.2 cm.
    client = APIClient()
    assert price(client, **RECTANGULAR, message_layout=message(scale=0.7)).status_code == 400
    assert price(client, **RECTANGULAR, message_layout=message(scale=0.7, rotation_deg=90)).status_code == 200


@pytest.mark.django_db
def test_the_minimum_letter_still_applies_to_each_line():
    rejected = price(APIClient(), **MINI, message_layout=message(scale=0.2))
    assert rejected.status_code == 400
    assert "1.5 cm" in str(rejected.json().get("message_layout")), rejected.json()


def test_when_not_even_the_minimum_letter_fits_the_block_asks_to_shorten_it():
    tiny = round_lid(6)
    with pytest.raises(DomainValidationError) as raised:
        design_layout.check_message_block(dataclasses.replace(MESSAGE, scale=1.5 / tiny.radius), tiny.radius,
                                          message_room_cm(tiny, 0), 1.5)
    assert raised.value.errors == {
        "message_layout": ["Acorta tu mensaje: con letra de al menos 1.5 cm no cabe en el pastel."]
    }


# --- El frontend usa los mismos números ---


def frontend_number(path: str, pattern: str) -> float:
    match = re.search(pattern, (FRONTEND / path).read_text(encoding="utf-8"))
    assert match, f"{path} no tiene {pattern}"
    return float(match.group(1))


def test_the_editor_uses_the_same_line_box_line_height_and_line_limit():
    geometry = "viewmodels/messageGeometry.ts"
    assert frontend_number(geometry, r"export const LINE_BOX = ([\d.]+)") == design_layout.LINE_BOX_EM
    assert frontend_number(geometry, r"export const LINE_HEIGHT = ([\d.]+)") == design_layout.LINE_HEIGHT_EM
    layout = "models/cakeDesignLayout.ts"
    assert frontend_number(layout, r"messageMaxLines: (\d+)") == design_layout.MAX_MESSAGE_LINES
    assert frontend_number(layout, r"messageMaxLength: (\d+)") == design_layout.MAX_MESSAGE_LENGTH


# --- Donde se muestra ---


@pytest.fixture
def ordered(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    response = post(client, body(design_line(message_layout=message("Feliz\r\ncumpleaños\nAna", scale=0.2))))
    assert response.status_code == 201, response.json()
    return client, Order.objects.get(pk=response.json()["id"])


@pytest.mark.django_db
def test_the_order_keeps_the_breaks_and_returns_them(ordered):
    client, order = ordered
    design = order.items.get().design
    assert design.message["text"] == THREE_LINES
    data = client.get(f"/api/v1/orders/{order.pk}/").json()
    assert data["items"][0]["design"]["message_layout"]["text"] == THREE_LINES


@pytest.mark.django_db
def test_the_admin_shows_one_line_per_row(ordered):
    _, order = ordered
    shown = next(line for line in design_lines(order.items.get().design) if "Mensaje" in line)
    assert "Mensaje: «Feliz<br>cumpleaños<br>Ana»" in shown


def test_the_admin_escapes_each_line():
    assert message_line({"text": "<b>Ana</b>\nTe quiero", "color_mode": "auto"}) == (
        "Mensaje: «&lt;b&gt;Ana&lt;/b&gt;<br>Te quiero», auto"
    )


@pytest.mark.django_db
def test_the_pdf_note_draws_each_line_on_its_own_row(ordered):
    client, order = ordered
    text = pdf_text(client.get(note_url(pay(order))).content)
    # Cada renglón es su propio texto en el PDF, y el mensaje empieza en su propio renglón.
    assert re.search(rb"\(Mensaje: \\253Feliz\) Tj", text), text
    assert b"(cumplea\\361os) Tj" in text
    assert b"(Ana\\273.) Tj" in text
