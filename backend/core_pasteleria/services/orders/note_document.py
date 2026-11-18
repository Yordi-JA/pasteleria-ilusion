"""El PDF de la nota de un pedido: lo que descarga el cliente y lo que va adjunto al correo "Recibimos tu pago" (D69).

Los dos caminos arman el archivo aquí, con la misma nota y el mismo enlace del QR (`SITE_URL` + `/nota/<token>`), para
que nunca se desvíen. El dibujo del PDF es de `api/note_pdf.py`.
"""
from ...api import note_pdf
from .. import email_service
from .note_service import OrderNote

CONTENT_TYPE = "application/pdf"


def filename(order_id: int) -> str:
    return f"nota-pedido-{order_id}.pdf"


def render_pdf(note: OrderNote) -> bytes:
    url = email_service.site_url(f"/nota/{note.order.note_token}")
    return note_pdf.render_note(note, url)
