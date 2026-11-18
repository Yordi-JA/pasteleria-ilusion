"""Que el texto de la nota en PDF quepa en su caja (tanda 4: el recuadro de la base se salía por la derecha).

Se dibuja la nota en un lienzo que anota cada texto y cada recuadro, y se mide cada renglón con `stringWidth`: nada se
sale de los márgenes de la página ni del relleno del recuadro de la base, y dos textos del mismo renglón no se
encimen (el nombre largo del cliente no se mete en la columna de la entrega). Los datos son a propósito los peores:
un nombre largo, un correo sin espacios, un depósito enorme, una base de relleno de nombre largo y el mensaje de
varios renglones de D83. Son registros falsos (`SimpleNamespace`): la nota solo lee sus atributos, sin base de datos.
"""
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from types import SimpleNamespace

import pytest
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

from core_pasteleria.api import note_pdf
from core_pasteleria.services.orders.note_service import OrderNote, OrderStand
from core_pasteleria.services.store_info_service import StoreInfo
from tests.test_orders_api import CDMX

LONG_NAME = "María Guadalupe Hernández de la Concepción Fernández y Rodríguez del Valle"
LONG_EMAIL = "maria.guadalupe.hernandez.de.la.concepcion@un-dominio-de-correo-muy-largo.example.com"
LONG_BASE = "Queso crema con un nombre de base de relleno larguísimo que escribió la pastelería"
LONG_ADDRESS = (
    "Avenida de los Insurgentes Sur 1234, interior 5, colonia del Valle Centro, alcaldía Benito Juárez, 03100, "
    "Ciudad de México"
)
# D83: hasta 3 renglones; el último es una palabra de 20 letras sin espacios.
MULTILINE_MESSAGE = "Feliz cumpleaños\nMaría Guadalupe Hernández\nAAAAAAAAAAAAAAAAAAAA"
HUGE = Decimal("99999999.99")


def _design(**overrides):
    values = dict(
        cake_size="by_weight", kg=50, people=400, tiers=5, form="rectangular", cake_type="tres_leches",
        bread_name="Chocolate", filling_base_name=LONG_BASE, filling_flavor_names=["Zarzamora", "Durazno"],
        decoration_name="Borde de conchas", wafer=True, message={"text": MULTILINE_MESSAGE},
        # Tanda 4: la frase más larga del peinado lateral.
        side_comb=False,
    )
    return SimpleNamespace(**(values | overrides))


def _order(**overrides):
    item = SimpleNamespace(kind="design", quantity=1, line_total=HUGE, design=_design(), presentation=None, product_name=None)
    values = dict(
        id=99999999, created_at=datetime(2026, 9, 30, 18, 0, tzinfo=CDMX), customer_name=LONG_NAME,
        pickup_name=LONG_NAME, pickup_phone="5512345678", customer_email=LONG_EMAIL,
        # Miércoles y septiembre: el día y el mes más largos.
        delivery_date=date(2026, 9, 30), slot_starts_at=time(18, 30), slot_ends_at=time(19, 0), fulfillment="pickup",
        items=[item], subtotal=HUGE, advance=HUGE, advance_percent=100, stand_deposit=HUGE, delivery_fee=HUGE,
        pay_on_delivery=HUGE, paid_with="cash", paid_at=datetime(2026, 9, 30, 18, 0, tzinfo=CDMX),
    )
    return SimpleNamespace(**(values | overrides))


def _stand(**overrides):
    values = dict(kg=50, deposit=HUGE, return_days=15, return_by=date(2027, 9, 30), status=None, returned_at=None)
    return OrderStand(**(values | overrides))


def _store(**overrides):
    values = dict(address=LONG_ADDRESS, whatsapp="525512345678", opens_at=time(9), closes_at=time(22, 30), custom_lead_days=2)
    return StoreInfo(**(values | overrides))


def worst_case_note() -> OrderNote:
    return OrderNote(order=_order(), stands=(_stand(), _stand(status="returned", returned_at=datetime(2027, 9, 30, 12, tzinfo=CDMX))), store=_store())


def typical_note() -> OrderNote:
    """La nota de un pedido común con base: el caso que vio el usuario (la frase de la devolución se salía)."""
    order = _order(
        customer_name="Mariana Pérez Soto", pickup_name="Mariana Pérez Soto", customer_email="mariana@example.com",
        items=[SimpleNamespace(kind="design", quantity=1, line_total=Decimal("1650.00"), design=_design(filling_base_name="Queso", message=None), presentation=None, product_name=None)],
        subtotal=Decimal("1650.00"), advance=Decimal("825.00"), advance_percent=50, stand_deposit=Decimal("250.00"),
        delivery_fee=Decimal("0"), pay_on_delivery=Decimal("825.00"), paid_with="stripe",
    )
    return OrderNote(order=order, stands=(_stand(kg=6, deposit=Decimal("250.00"), return_by=date(2026, 10, 15)),), store=_store(address=None, whatsapp=None))


@dataclass(frozen=True)
class Drawn:
    page: int
    text: str
    left: float
    right: float
    baseline: float
    size: float


@dataclass(frozen=True)
class Box:
    page: int
    left: float
    bottom: float
    right: float
    top: float


class RecordingCanvas(Canvas):
    """Un lienzo de reportlab que, además de dibujar, anota cada texto con su ancho medido y cada recuadro."""

    last = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.page = 0
        # Cada texto con el recuadro que se dibujó antes que él en la misma página (o `None`).
        self.drawn: list[tuple[Drawn, Box | None]] = []
        self.boxes: list[Box] = []
        self._box: Box | None = None
        RecordingCanvas.last = self

    def _record(self, x, y, text, right_aligned):
        width = stringWidth(text, self._fontname, self._fontsize)
        left = x - width if right_aligned else x
        self.drawn.append((Drawn(self.page, text, left, left + width, y, self._fontsize), self._box))

    def drawString(self, x, y, text, *args, **kwargs):
        self._record(x, y, text, right_aligned=False)
        return super().drawString(x, y, text, *args, **kwargs)

    def drawRightString(self, x, y, text, *args, **kwargs):
        self._record(x, y, text, right_aligned=True)
        return super().drawRightString(x, y, text, *args, **kwargs)

    def roundRect(self, x, y, width, height, radius, *args, **kwargs):
        self._box = Box(self.page, x, y, x + width, y + height)
        self.boxes.append(self._box)
        return super().roundRect(x, y, width, height, radius, *args, **kwargs)

    def showPage(self):
        self.page += 1
        self._box = None
        return super().showPage()


def draw(note: OrderNote, monkeypatch) -> RecordingCanvas:
    monkeypatch.setattr(note_pdf, "Canvas", RecordingCanvas)
    note_pdf.render_note(note, "https://pasteleriailusion.me/nota/" + "x" * 43)
    return RecordingCanvas.last


# El pie (el QR y los datos de la pastelería) va debajo de su raya, a esta altura; arriba de ella, el cuerpo de la nota.
FOOTER_TOP = note_pdf.MARGIN + note_pdf.QR_SIZE + 12
TOLERANCE = 0.01

NOTES = [pytest.param(typical_note, id="pedido-comun"), pytest.param(worst_case_note, id="peor-caso")]


@pytest.mark.parametrize("make_note", NOTES)
def test_no_text_leaves_the_page_margins(make_note, monkeypatch):
    canvas = draw(make_note(), monkeypatch)
    outside = [d.text for d, _ in canvas.drawn if d.left < note_pdf.MARGIN - TOLERANCE or d.right > note_pdf.PAGE_WIDTH - note_pdf.MARGIN + TOLERANCE]
    assert outside == []


@pytest.mark.parametrize("make_note", NOTES)
def test_the_stand_box_holds_its_text_inside_its_padding(make_note, monkeypatch):
    canvas = draw(make_note(), monkeypatch)
    assert canvas.boxes, "la nota de prueba lleva base: debe dibujar su recuadro"
    padding = note_pdf.STAND_PADDING
    for drawn, box in canvas.drawn:
        if box is None or drawn.page != box.page or drawn.baseline < FOOTER_TOP:
            continue
        assert drawn.left >= box.left + padding - TOLERANCE, drawn.text
        assert drawn.right <= box.right - padding + TOLERANCE, drawn.text
        # Ni arriba ni abajo del recuadro: el recuadro crece con los renglones que lleva.
        assert box.bottom + drawn.size / 2 <= drawn.baseline <= box.top - drawn.size, drawn.text


@pytest.mark.parametrize("make_note", NOTES)
def test_no_two_texts_overlap_on_the_same_line(make_note, monkeypatch):
    canvas = draw(make_note(), monkeypatch)
    drawn = sorted((d for d, _ in canvas.drawn), key=lambda d: (d.page, round(d.baseline, 2), d.left))
    overlaps = [
        (a.text, b.text)
        for a, b in zip(drawn, drawn[1:])
        if a.page == b.page and round(a.baseline, 2) == round(b.baseline, 2) and b.left < a.right - TOLERANCE
    ]
    assert overlaps == []


def test_the_worst_case_note_still_says_everything(monkeypatch):
    """Partir los renglones no pierde nada: el nombre, el correo, la base, el mensaje y la dirección siguen completos."""
    canvas = draw(worst_case_note(), monkeypatch)
    text = " ".join(d.text for d, _ in canvas.drawn)
    joined = "".join(d.text for d, _ in canvas.drawn)
    for words in (LONG_NAME, LONG_BASE.lower(), LONG_ADDRESS, "María Guadalupe Hernández", "Feliz cumpleaños"):
        assert words in text
    # Un correo y una palabra sin espacios se parten letra por letra: juntos, siguen enteros.
    assert LONG_EMAIL in joined
    assert "A" * 20 in joined
    assert "$99,999,999.99" in text


# --- `fit_lines`: los renglones que la nota decide dibujar en una caja ---

FIT_CASES = [
    pytest.param(LONG_NAME, note_pdf.BOLD_FONT, 10, 240, id="nombre-largo"),
    pytest.param(LONG_EMAIL, note_pdf.BOLD_FONT, 10, 240, id="correo-sin-espacios"),
    pytest.param(f"Depósito pagado: ${HUGE:,.2f}", note_pdf.BOLD_FONT, 10, 120, id="deposito-enorme"),
    pytest.param(f"Relleno {LONG_BASE.lower()} de zarzamora y durazno.", note_pdf.BODY_FONT, 9, 300, id="base-de-nombre-largo"),
    pytest.param(f"Mensaje: «{MULTILINE_MESSAGE}».", note_pdf.BODY_FONT, 9, 120, id="mensaje-de-tres-renglones"),
]


@pytest.mark.parametrize(("text", "font", "size", "width"), FIT_CASES)
def test_every_fitted_line_measures_at_most_its_box(text, font, size, width):
    lines = note_pdf.fit_lines(text, font, size, width)
    assert lines
    assert [line for line in lines if stringWidth(line, font, size) > width] == []


@pytest.mark.parametrize(("text", "font", "size", "width"), FIT_CASES)
def test_fitting_loses_no_letter(text, font, size, width):
    lines = note_pdf.fit_lines(text, font, size, width)
    drawable = note_pdf._drawable(text)
    assert "".join(lines).replace(" ", "") == drawable.replace(" ", "").replace("\n", "")


def test_a_message_keeps_its_own_lines():
    """D83: cada renglón del mensaje empieza su propio renglón en la nota, aunque quepan juntos."""
    assert note_pdf.fit_lines("Feliz\ncumpleaños\nMaría", note_pdf.BODY_FONT, 9, 400) == ["Feliz", "cumpleaños", "María"]


def test_a_line_that_fits_is_drawn_as_is():
    assert note_pdf.fit_lines("Recoger en la pastelería", note_pdf.BOLD_FONT, 10, 240) == ["Recoger en la pastelería"]
