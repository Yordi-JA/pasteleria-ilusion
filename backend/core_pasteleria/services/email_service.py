"""Correos al cliente (D70): arma cada correo con sus plantillas y lo envía como mejor esfuerzo.

Cuatro correos, cada uno en texto plano y en HTML de correo (tablas, CSS en línea y los colores de la marca, D71):
- "Recibimos tu solicitud": el envío de referencia entra `in_review`.
- "Tu cotización está lista": la pastelería le pone precio (`quote_ready`).
- "Recibimos tu pago": el pedido entra en `received` (webhook verificado o efectivo en el admin).
- "Tu pedido está listo": el pedido entra en `ready_for_delivery`.

Los dispara `order_observer.CustomerEmailObserver` después de confirmarse la transacción. Nunca deshacen nada: si el
SMTP falla, o el correo no se puede armar, queda un WARNING con el correo y el id y la operación sigue igual. Sin
`EMAIL_HOST` (`settings.EMAIL_ENABLED` apagado, solo en producción) no se envía nada y queda un INFO. Los registros
llevan el tipo de correo y el id del pedido o de la solicitud, nunca el correo ni el nombre del cliente.

Los enlaces van al dominio de `settings.SITE_URL`, nunca al de la petición: un correo sale después del commit, a veces
desde un webhook que no viene del navegador del cliente. El logo es un PNG del sitio (`frontend/public/correo/`), porque
Gmail no muestra SVG. La dirección y el WhatsApp salen de `StoreSettings`: con la dirección va "Cómo llegar" (Google Maps,
sin llave) y con el WhatsApp su enlace `wa.me`; si faltan, su marcador y ningún enlace.

Ningún texto libre del cliente (nombre de la cuenta, descripción, quien recoge) llega a un correo: el correo del registro
con contraseña no se verifica, y quien registre el de otra persona haría que la pastelería le mande a la víctima un
correo legítimo con su texto. El saludo es fijo. La nota de la pastelería sí puede ir: la escribe el personal.
"""
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.conf import settings as django_settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from ..models import Occasion, OrderStatus, ReferenceRequestStatus
from ..repositories import order_repo, reference_repo, settings_repo
from .store_info_service import directions_url

logger = logging.getLogger("core_pasteleria.emails")

ADDRESS_PENDING = "[Dirección por confirmar]"
WHATSAPP_PENDING = "[WhatsApp por confirmar]"
VALIDITY_PENDING = "[Vigencia por confirmar]"
TEMPLATE_DIR = "core_pasteleria/emails"
# El logo de `frontend/public/correo/`, en 2x (320 x 140); el correo lo muestra a 160 x 70.
LOGO_PATH = "/correo/ilusion-logo.png"
WEEKDAYS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
MONTHS = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


@dataclass(frozen=True)
class EmailKind:
    """Un correo: sus plantillas (`.txt` y `.html`), su asunto y el título de su tarjeta (con `{number}`) y su estado.

    El estado es el que anuncia el correo, con la misma etiqueta del sitio y del admin, no el que tenga el pedido al
    enviarse: el correo sale después del commit y el personal pudo moverlo otra vez.
    """

    template: str
    subject: str
    card: str
    status: str


REFERENCE_RECEIVED = EmailKind(
    "reference_received", "Recibimos tu solicitud #{number}", "Solicitud #{number}", ReferenceRequestStatus.IN_REVIEW.label
)
QUOTE_READY = EmailKind(
    "quote_ready", "Tu cotización #{number} está lista", "Cotización #{number}", ReferenceRequestStatus.QUOTE_READY.label
)
PAYMENT_RECEIVED = EmailKind(
    "payment_received", "Recibimos tu pago del pedido #{number}", "Pedido #{number}", OrderStatus.RECEIVED.label
)
ORDER_READY = EmailKind(
    "order_ready", "Tu pedido #{number} está listo", "Pedido #{number}", OrderStatus.READY_FOR_DELIVERY.label
)


@dataclass(frozen=True)
class Email:
    to: str
    number: int
    context: dict


def _money(amount: Decimal | None) -> str:
    return f"${amount:,.2f}" if amount is not None else ""


def _long_date(day: date) -> str:
    return f"{WEEKDAYS[day.weekday()]} {day.day} de {MONTHS[day.month - 1]} de {day.year}"


def _valid_until(quoted_at: datetime | None, hours: int | None) -> str:
    """Hasta cuándo vale la cotización; sin `reference_quote_valid_hours`, el marcador PENDIENTE (no vence)."""
    if quoted_at is None or hours is None:
        return VALIDITY_PENDING
    until = timezone.localtime(quoted_at + timedelta(hours=hours))
    return f"{_long_date(until.date())}, {until:%H:%M}"


def _whatsapp_display(digits: str) -> str:
    """El número como se lee en México ("55 1234 5678"); uno de otro país, completo y con "+"."""
    if len(digits) == 12 and digits.startswith("52"):
        return f"{digits[2:4]} {digits[4:8]} {digits[8:]}"
    return f"+{digits}"


def site_url(path: str) -> str:
    """Un enlace del sitio con el dominio de la configuración (`SITE_URL`), nunca el de la petición."""
    return f"{django_settings.SITE_URL.rstrip('/')}{path}"


def _store_context(settings) -> dict:
    """El pie: dirección con "Cómo llegar", horario y WhatsApp; lo que falte lleva su marcador y ningún enlace."""
    store = settings.get_store_settings()
    address = store.address.strip()
    whatsapp = store.whatsapp.strip()
    return {
        "address": address or ADDRESS_PENDING,
        "directions_url": directions_url(address) or "",
        "whatsapp": _whatsapp_display(whatsapp) if whatsapp else WHATSAPP_PENDING,
        "whatsapp_url": f"https://wa.me/{whatsapp}" if whatsapp else "",
        "opens_at": store.store_opens_at,
        "closes_at": store.store_closes_at,
        "logo_url": site_url(LOGO_PATH),
        "home_url": site_url("/"),
    }


def _order_email(order_id: int, orders, settings) -> Email | None:
    order = orders.get_order(order_id)
    if order is None:
        return None
    context = {
        "order": order,
        "pickup_day": _long_date(order.delivery_date),
        "pickup": f"{_long_date(order.delivery_date)}, de {order.slot_starts_at:%H:%M} a {order.slot_ends_at:%H:%M}",
        "pay_today": _money(order.pay_today),
        "pay_on_delivery": _money(order.pay_on_delivery),
        "owes_on_delivery": bool(order.pay_on_delivery),
        "stand_deposit": _money(order.stand_deposit) if order.stand_deposit else "",
        "url": site_url(f"/cuenta/pedidos/{order.id}"),
        **_store_context(settings),
    }
    return Email(order.customer_email, order.id, context)


def _reference_email(request_id: int, references, settings) -> Email | None:
    request = references.get(request_id)
    if request is None:
        return None
    # La vigencia que se muestra es la de ahora; sin valor, el marcador PENDIENTE (la cotización no vence).
    hours = settings.get_policy_settings().reference_quote_valid_hours
    context = {
        "request": request,
        "occasion": Occasion(request.occasion).label if request.occasion else "",
        "event_day": _long_date(request.event_date),
        "price": _money(request.quoted_price),
        "valid_until": _valid_until(request.quoted_at, hours),
        "url": site_url(f"/cuenta/cotizaciones/{request.id}"),
        **_store_context(settings),
    }
    return Email(request.customer_email, request.id, context)


def _send(kind: EmailKind, what: str, subject_id: int, build: Callable[[], Email | None]) -> bool:
    """Arma y envía el correo; `True` si salió. Mejor esfuerzo: un error queda en un WARNING y no se propaga."""
    if not django_settings.EMAIL_ENABLED:
        logger.info(
            "Correo %s del %s %s sin enviar: falta EMAIL_HOST",
            kind.template,
            what,
            subject_id,
            extra={"email_kind": kind.template, "subject_id": subject_id},
        )
        return False
    try:
        email = build()
        if email is None:
            logger.warning("Correo %s sin enviar: el %s %s no existe", kind.template, what, subject_id)
            return False
        context = {
            **email.context,
            "number": email.number,
            "card": kind.card.format(number=email.number),
            "status": kind.status,
        }
        message = EmailMultiAlternatives(
            subject=kind.subject.format(number=email.number),
            body=render_to_string(f"{TEMPLATE_DIR}/{kind.template}.txt", context),
            to=[email.to],
        )
        message.attach_alternative(render_to_string(f"{TEMPLATE_DIR}/{kind.template}.html", context), "text/html")
        message.send()
    except Exception as error:
        # Después del commit nada se puede deshacer: el correo es un aviso, no parte de la operación (D70).
        logger.warning(
            "No se pudo enviar el correo %s del %s %s: %s",
            kind.template,
            what,
            subject_id,
            type(error).__name__,
            extra={"email_kind": kind.template, "subject_id": subject_id},
        )
        return False
    logger.info(
        "Correo %s del %s %s enviado",
        kind.template,
        what,
        subject_id,
        extra={"email_kind": kind.template, "subject_id": subject_id},
    )
    return True


def send_order_email(kind: EmailKind, order_id: int, *, orders=order_repo, settings=settings_repo) -> bool:
    return _send(kind, "pedido", order_id, lambda: _order_email(order_id, orders, settings))


def send_reference_email(
    kind: EmailKind, request_id: int, *, references=reference_repo, settings=settings_repo
) -> bool:
    return _send(kind, "envío de referencia", request_id, lambda: _reference_email(request_id, references, settings))
