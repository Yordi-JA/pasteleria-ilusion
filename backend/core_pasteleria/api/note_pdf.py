"""La nota del pedido en PDF, tamaño carta, con su QR (regla 11, mockup `NotaPDF`).

Es la representación de `note_service.OrderNote`, como un serializador: no decide nada del negocio. Usa `reportlab`
(su QR, `reportlab.graphics.barcode.qr`, no pide otra dependencia). Las fuentes de la marca solo están en `woff2`, que
reportlab no lee: la nota usa las fuentes base del PDF (Times para los títulos, Helvetica para el texto), que no se
incrustan. Los colores son los tokens de `design/tokens.css`; la página va en blanco para imprimirla sin gastar tinta.

Lo que la pastelería no ha definido (dirección, WhatsApp) sale con su marcador visible, como en el sitio, nunca con un
valor supuesto. El texto que escribió el cliente (el mensaje del pastel) se limpia a lo que las fuentes base pueden
dibujar.
"""
import io
from datetime import date, datetime, time
from decimal import Decimal

from django.utils import timezone
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

from ..models import CakeShape, CakeType, Fulfillment, OrderLineKind, PaymentMethod, Presentation, StandLoanStatus
from ..repositories.records import OrderItemRecord
from ..services import pricing_service
from ..services.orders.note_service import OrderNote, OrderStand

# Tokens de la paleta Fresa y mermelada (`design/tokens.css`).
MERMELADA = HexColor("#5e1921")
MERMELADA_SUAVE = HexColor("#664243")
FRESA = HexColor("#f9c1c1")
HARINA = HexColor("#fbecec")
CAJETA = HexColor("#8f5413")

TITLE_FONT = "Times-Bold"
BODY_FONT = "Helvetica"
BOLD_FONT = "Helvetica-Bold"

PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 0.75 * inch
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
QR_SIZE = 1.15 * inch
# Relleno interior del recuadro de la base, a cada lado.
STAND_PADDING = 14
STAND_TOP_SPACE = 16
# Lo que separa un texto del que tiene al lado en el mismo renglón (las columnas, una etiqueta y su importe).
GAP = 12

STORE_NAME = "Pastelería Ilusión"
TAGLINE = "Pide un deseo. Del pastel nos encargamos."
ADDRESS_PENDING = "[Dirección por confirmar]"
WHATSAPP_PENDING = "[WhatsApp por confirmar]"

WEEKDAYS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
MONTHS = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


def _drawable(text: str) -> str:
    """Solo lo que las fuentes base dibujan (Windows-1252): lo demás, como un emoji, sale como "?"."""
    return text.encode("cp1252", errors="replace").decode("cp1252")


def _break_word(line: str, font: str, size: float, width: float) -> list[str]:
    """Un renglón que sigue sin caber (un correo o una palabra sin espacios), partido letra por letra."""
    pieces: list[str] = []
    current = ""
    for letter in line:
        # Cada pedazo lleva al menos una letra, aunque la caja sea más angosta que ella.
        if current and stringWidth(current + letter, font, size) > width:
            pieces.append(current)
            current = ""
        current += letter
    pieces.append(current)
    return pieces


def fit_lines(text: str, font: str, size: float, width: float) -> list[str]:
    """Los renglones en que se dibuja `text` (ya limpio para las fuentes base) dentro de una caja de `width` puntos.

    Parte en los espacios (`simpleSplit`) y en cada `\\n`; lo que aun así no cabe se parte letra por letra. Ningún
    renglón mide más que `width` con `stringWidth`.
    """
    lines: list[str] = []
    for line in simpleSplit(_drawable(text), font, size, width):
        lines.extend([line] if stringWidth(line, font, size) <= width else _break_word(line, font, size, width))
    return lines


def _money(amount: Decimal) -> str:
    return f"${amount:,.2f}"


def _long_date(day: date) -> str:
    return f"{WEEKDAYS[day.weekday()]} {day.day} de {MONTHS[day.month - 1]} de {day.year}"


def _short_date(day: date) -> str:
    return f"{day.day} de {MONTHS[day.month - 1]} de {day.year}"


def _hh_mm(moment: time) -> str:
    return moment.strftime("%H:%M")


def _local(moment: datetime) -> datetime:
    return timezone.localtime(moment)


class _Page:
    """Un cursor sobre el lienzo que salta de página cuando el bloque que sigue no cabe."""

    def __init__(self, canvas: Canvas, footer_height: float):
        self.canvas = canvas
        self.footer_height = footer_height
        self.y = PAGE_HEIGHT - MARGIN

    def ensure(self, height: float) -> None:
        if self.y - height < MARGIN + self.footer_height:
            self.canvas.showPage()
            self.y = PAGE_HEIGHT - MARGIN

    def text(self, x: float, value: str, *, font=BODY_FONT, size=10, color=MERMELADA, right=False) -> None:
        self.canvas.setFont(font, size)
        self.canvas.setFillColor(color)
        draw = self.canvas.drawRightString if right else self.canvas.drawString
        draw(x, self.y, _drawable(value))

    def lines(self, x: float, value: str, width: float, *, font=BODY_FONT, size=10, color=MERMELADA) -> None:
        for line in fit_lines(value, font, size, width):
            self.ensure(size + 4)
            self.text(x, line, font=font, size=size, color=color)
            self.y -= size + 4

    def rule(self, color=FRESA, width=1) -> None:
        self.canvas.setStrokeColor(color)
        self.canvas.setLineWidth(width)
        self.canvas.line(MARGIN, self.y, PAGE_WIDTH - MARGIN, self.y)


def _header(page: _Page, note: OrderNote) -> None:
    order = note.order
    created = _local(order.created_at)
    page.text(MARGIN, STORE_NAME, font=TITLE_FONT, size=22)
    page.text(PAGE_WIDTH - MARGIN, "Nota de pedido", font=TITLE_FONT, size=20, right=True)
    page.y -= 18
    page.text(MARGIN, TAGLINE, size=9, color=MERMELADA_SUAVE)
    page.text(PAGE_WIDTH - MARGIN, f"Pedido #{order.id}", font=BOLD_FONT, size=12, right=True)
    page.y -= 14
    page.text(
        PAGE_WIDTH - MARGIN,
        f"Hecha el {_short_date(created.date())} a las {created:%H:%M}",
        size=8,
        color=MERMELADA_SUAVE,
        right=True,
    )
    page.y -= 12
    page.rule(width=2)
    page.y -= 26


def _field(page: _Page, x: float, width: float, label: str, value: str) -> None:
    """Una etiqueta y su valor; un valor que no cabe en su columna sigue en otro renglón."""
    page.text(x, label, size=8, color=MERMELADA_SUAVE)
    page.y -= 13
    page.lines(x, value, width, font=BOLD_FONT, size=10)
    page.y -= 4


def _customer_and_delivery(page: _Page, note: OrderNote) -> None:
    order = note.order
    column = MARGIN + CONTENT_WIDTH / 2
    left_width = CONTENT_WIDTH / 2 - GAP
    right_width = CONTENT_WIDTH / 2
    top = page.y
    page.text(MARGIN, "Cliente", font=TITLE_FONT, size=13)
    page.y -= 20
    _field(page, MARGIN, left_width, "Nombre", order.customer_name or order.pickup_name)
    _field(page, MARGIN, left_width, "Teléfono", order.pickup_phone)
    _field(page, MARGIN, left_width, "Correo", order.customer_email)
    left_bottom = page.y
    page.y = top
    page.text(column, "Entrega", font=TITLE_FONT, size=13)
    page.y -= 20
    when = f"{_long_date(order.delivery_date).capitalize()}, de {_hh_mm(order.slot_starts_at)} a {_hh_mm(order.slot_ends_at)}"
    _field(page, column, right_width, "Fecha y hora", when)
    _field(page, column, right_width, "Forma", Fulfillment(order.fulfillment).label)
    if order.fulfillment == Fulfillment.PICKUP:
        _field(page, column, right_width, "Recoge", order.pickup_name)
    page.y = min(page.y, left_bottom) - 4


def _design_description(item: OrderItemRecord) -> tuple[str, str]:
    design = item.design
    title = pricing_service.describe_cake_size(design.cake_size, design.kg, design.people)
    tiers = "1 piso" if design.tiers == 1 else f"{design.tiers} pisos"
    if design.filling_base_name:
        flavors = " y ".join(design.filling_flavor_names)
        filling = f"relleno {design.filling_base_name.lower()}" + (f" de {flavors.lower()}" if flavors else "")
    else:
        filling = "relleno incluido"
    parts = [
        f"{CakeShape(design.form).label} de {tiers}.",
        f"{CakeType(design.cake_type).label}, pan {design.bread_name.lower()}, {filling}.",
        f"Decoración: {design.decoration_name}.",
        # Tanda 4: la pastelería tiene que saber si peina los costados de la cobertura.
        "Con peinado lateral." if design.side_comb else "Sin peinado lateral.",
    ]
    message = design.message.get("text") if design.message else None
    wafer = ["Con oblea."] if design.wafer else []
    if message and "\n" in message:
        # Un mensaje de varios renglones empieza en su propio renglón de la nota y cada uno de sus renglones va en el
        # suyo (`_Page.lines` parte en cada `\n`); lo que sigue, en otro.
        return title, "\n".join([" ".join(parts), f"Mensaje: «{message}».", *wafer])
    if message:
        parts.append(f"Mensaje: «{message}».")
    return title, " ".join([*parts, *wafer])


def _item_description(item: OrderItemRecord) -> tuple[str, str]:
    if item.kind == OrderLineKind.DESIGN:
        return _design_description(item)
    presentation = Presentation(item.presentation).label if item.presentation else ""
    return item.product_name, f"{presentation}, {OrderLineKind(item.kind).label.lower()}".strip(", ")


def _items(page: _Page, note: OrderNote) -> None:
    description_x = MARGIN + 0.45 * inch
    description_width = CONTENT_WIDTH - 0.45 * inch - 1.1 * inch
    page.ensure(60)
    page.text(MARGIN, "Detalle", font=TITLE_FONT, size=13)
    page.y -= 20
    page.text(MARGIN, "Cant.", font=BOLD_FONT, size=8)
    page.text(description_x, "Descripción", font=BOLD_FONT, size=8)
    page.text(PAGE_WIDTH - MARGIN, "Importe", font=BOLD_FONT, size=8, right=True)
    page.y -= 6
    page.rule(color=MERMELADA, width=0.75)
    page.y -= 16
    for item in note.order.items:
        title, detail = _item_description(item)
        page.ensure(40)
        page.text(MARGIN, str(item.quantity))
        page.text(PAGE_WIDTH - MARGIN, _money(item.line_total), right=True)
        page.lines(description_x, title, description_width, font=BOLD_FONT)
        page.lines(description_x, detail, description_width, size=9, color=MERMELADA_SUAVE)
        page.y -= 4
        page.rule(color=HARINA)
        page.y -= 16


def _totals(page: _Page, note: OrderNote) -> None:
    order = note.order
    label_x = MARGIN + CONTENT_WIDTH * 0.5
    rows = [("Total del pedido", order.subtotal, True)]
    if order.advance is not None:
        rows.append((f"Anticipo pagado ({order.advance_percent}%)", order.advance, False))
    if order.stand_deposit > 0:
        rows.append(("Depósito de la base pagado", order.stand_deposit, False))
    if order.delivery_fee > 0:
        rows.append(("Envío pagado", order.delivery_fee, False))
    if order.pay_on_delivery is not None:
        rows.append(("Resto, el día de la entrega", order.pay_on_delivery, True))
    column_width = PAGE_WIDTH - MARGIN - label_x
    page.ensure(20 * len(rows) + 30)
    for label, amount, strong in rows:
        font = BOLD_FONT if strong else BODY_FONT
        size = 11 if strong else 10
        shown = _money(amount)
        # El importe va en el primer renglón; la etiqueta se parte antes de llegar a él.
        page.text(PAGE_WIDTH - MARGIN, shown, font=font, size=size, right=True)
        page.lines(label_x, label, column_width - stringWidth(shown, font, size) - GAP, font=font, size=size)
        page.y -= 18 - (size + 4)
    if order.paid_with and order.paid_at:
        paid_on = _short_date(_local(order.paid_at).date())
        page.lines(label_x, f"Pagado con {PaymentMethod(order.paid_with).label} el {paid_on}.", column_width, size=8)
        page.y -= 2
    page.y -= 10


def _stand(page: _Page, stand: OrderStand) -> None:
    """El recuadro de la base. Su texto se parte dentro del relleno y el recuadro crece con los renglones que lleva."""
    inner = MARGIN + STAND_PADDING
    inner_width = CONTENT_WIDTH - 2 * STAND_PADDING
    deposit = f"Depósito pagado: {_money(stand.deposit)}"
    title = fit_lines(f"Base para {stand.kg} kg", TITLE_FONT, 13, inner_width - stringWidth(deposit, BOLD_FONT, 10) - GAP)
    returned = stand.status == StandLoanStatus.RETURNED
    if returned:
        returned_on = _short_date(_local(stand.returned_at).date())
        body_size = 10
        body_text = f"Devuelta el {returned_on}. El depósito ya se reembolsó."
    else:
        body_size = 9
        body_text = (
            f"Regrésala antes del {_short_date(stand.return_by)} ({stand.return_days} días después de la entrega) "
            "junto con esta nota y te devolvemos el importe."
        )
    body = fit_lines(body_text, BODY_FONT, body_size, inner_width)
    height = 78 + (len(title) - 1) * 17 + (len(body) - 1) * (body_size + 4)
    # Aire sobre el recuadro, para que no quede pegado a la línea "Pagado con…" de los totales; si con ese aire ya
    # no cabe en la hoja, se queda sin él antes que mandar el recuadro solo a otra hoja.
    if page.y - (STAND_TOP_SPACE + height + 12) >= MARGIN + page.footer_height:
        page.y -= STAND_TOP_SPACE
    page.ensure(height + 12)
    top = page.y
    page.canvas.setStrokeColor(CAJETA)
    page.canvas.setLineWidth(0.75)
    page.canvas.roundRect(MARGIN, top - height + 12, CONTENT_WIDTH, height, 8, stroke=1, fill=0)
    page.y = top - 6
    page.text(PAGE_WIDTH - MARGIN - STAND_PADDING, deposit, font=BOLD_FONT, size=10, right=True)
    for line in title:
        page.text(inner, line, font=TITLE_FONT, size=13)
        page.y -= 17
    page.y -= 3
    for line in body:
        page.text(inner, line, size=body_size)
        page.y -= body_size + 4
    if returned:
        page.y = top - height - 4
        return
    page.y -= 26 - (body_size + 4)
    third = (CONTENT_WIDTH - 2 * STAND_PADDING) / 3
    for index, label in enumerate(("Base recibida el", "Recibió", "Importe devuelto")):
        x = inner + index * third
        page.text(x, label, size=8, color=MERMELADA_SUAVE)
        width = page.canvas.stringWidth(label, BODY_FONT, 8) + 4
        page.canvas.setStrokeColor(MERMELADA)
        page.canvas.line(x + width, page.y - 2, x + third - 10, page.y - 2)
    page.y = top - height - 4


FOOTER_TEXT_X = MARGIN + QR_SIZE + 16

# Un renglón del pie: fuente, tamaño, color y texto.
FooterLine = tuple[str, int, HexColor, str]


def _footer_lines(note: OrderNote, verification_url: str) -> list[FooterLine]:
    """Los datos de la pastelería junto al QR, ya partidos al ancho que les queda."""
    store = note.store
    whatsapp = f"WhatsApp +{store.whatsapp}" if store.whatsapp else WHATSAPP_PENDING
    values = [
        (BOLD_FONT, 10, MERMELADA, STORE_NAME),
        (BODY_FONT, 9, MERMELADA_SUAVE, store.address or ADDRESS_PENDING),
        (
            BODY_FONT, 9, MERMELADA_SUAVE,
            f"Todos los días, de {_hh_mm(store.opens_at)} a {_hh_mm(store.closes_at)}. {whatsapp}",
        ),
        (BODY_FONT, 9, MERMELADA_SUAVE, "Escanea el código para verificar esta nota."),
        (BODY_FONT, 6, MERMELADA_SUAVE, verification_url),
    ]
    width = PAGE_WIDTH - MARGIN - FOOTER_TEXT_X
    return [(font, size, color, line) for font, size, color, value in values for line in fit_lines(value, font, size, width)]


def _footer_text_top(lines: list[FooterLine]) -> float:
    """La altura del primer renglón del pie: junto al borde de arriba del QR o, si los renglones son más, lo bastante
    alto para que el último no baje del margen."""
    drop = sum(size + 6 for _, size, _, _ in lines[:-1])
    return MARGIN + max(QR_SIZE - 12, drop)


def _footer_height(lines: list[FooterLine]) -> float:
    """Lo que ocupa el pie sobre el margen de abajo, con su raya."""
    return _footer_text_top(lines) + 36 - MARGIN


def _footer(canvas: Canvas, verification_url: str, lines: list[FooterLine]) -> None:
    """El QR y los datos de la pastelería, al pie de la última página."""
    bottom = MARGIN
    rule = _footer_text_top(lines) + 24
    canvas.setStrokeColor(FRESA)
    canvas.setLineWidth(1)
    canvas.line(MARGIN, rule, PAGE_WIDTH - MARGIN, rule)
    widget = QrCodeWidget(verification_url, barLevel="M")
    widget.barFillColor = MERMELADA
    x0, y0, x1, y1 = widget.getBounds()
    drawing = Drawing(QR_SIZE, QR_SIZE, transform=[QR_SIZE / (x1 - x0), 0, 0, QR_SIZE / (y1 - y0), 0, 0])
    drawing.add(widget)
    renderPDF.draw(drawing, canvas, MARGIN, bottom)
    canvas.linkURL(verification_url, (MARGIN, bottom, MARGIN + QR_SIZE, bottom + QR_SIZE), relative=0)
    y = _footer_text_top(lines)
    for font, size, color, value in lines:
        canvas.setFont(font, size)
        canvas.setFillColor(color)
        canvas.drawString(FOOTER_TEXT_X, y, value)
        y -= size + 6


def render_note(note: OrderNote, verification_url: str) -> bytes:
    """Los bytes del PDF de la nota; el QR lleva `verification_url` (la página `/nota/<token>`)."""
    buffer = io.BytesIO()
    canvas = Canvas(buffer, pagesize=letter, pageCompression=1)
    canvas.setTitle(f"Nota del pedido {note.order.id}")
    canvas.setAuthor(STORE_NAME)
    footer = _footer_lines(note, verification_url)
    page = _Page(canvas, footer_height=_footer_height(footer))
    _header(page, note)
    _customer_and_delivery(page, note)
    _items(page, note)
    _totals(page, note)
    for stand in note.stands:
        _stand(page, stand)
    _footer(canvas, verification_url, footer)
    canvas.showPage()
    canvas.save()
    return buffer.getvalue()
