"""La nota del pedido en PDF y su verificación pública (regla 11, D64 y D69).

La nota existe desde que el pedido está pagado (`NOTE_STATUSES`): sustituye la nota de papel que la pastelería entrega
al cobrar el anticipo, y la confirmación llega después del pago. Antes (apartado, en pausa por cotización) no hay nada
que presentar, y un pedido cancelado nunca se pagó (D63, ronda 2).

El QR de la nota abre `/nota/<token>`. El token es `Order.note_token` (`secrets.token_urlsafe(32)`, 43 caracteres,
guardado y único): no sale del id ni se puede adivinar. La verificación muestra solo lo que fija la regla 11: número,
fecha, cliente con la inicial del apellido, entrega, la base con su estado y fecha límite, y el depósito. Nunca el
teléfono, el correo ni la dirección. Un token que no existe, o de un pedido sin nota, es `None` (404 genérico).
"""
import re
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal

from ...models import OrderStatus
from ...repositories import order_repo, settings_repo
from ...repositories.records import OrderRecord
from .. import store_info_service, warranty_service
from ..store_info_service import StoreInfo

NOTE_STATUSES = (
    OrderStatus.RECEIVED,
    OrderStatus.IN_PREPARATION,
    OrderStatus.READY_FOR_DELIVERY,
    OrderStatus.DELIVERED,
)
# `secrets.token_urlsafe(32)`: 32 bytes en base64 para URL, sin relleno.
NOTE_TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")


@dataclass(frozen=True)
class OrderStand:
    """La base de un diseño del pedido y en qué va su préstamo.

    Antes de la entrega no hay préstamo (`status` `None`) y `return_by` es la fecha prevista: el día de entrega del
    pedido más los días para devolverla. Desde la entrega, la fecha límite guardada en el préstamo.
    """

    kg: int
    deposit: Decimal
    return_days: int
    return_by: date
    status: str | None
    returned_at: datetime | None


@dataclass(frozen=True)
class NoteVerification:
    order_id: int
    created_at: datetime
    customer: str
    fulfillment: str
    delivery_date: date
    starts_at: time
    ends_at: time
    stands: tuple[OrderStand, ...]


@dataclass(frozen=True)
class OrderNote:
    """Lo que lleva la nota en PDF: el pedido, sus bases y los datos de la pastelería (o sus marcadores)."""

    order: OrderRecord
    stands: tuple[OrderStand, ...]
    store: StoreInfo


def has_note(status: str) -> bool:
    return status in NOTE_STATUSES


def order_stands(order: OrderRecord, return_days: int) -> tuple[OrderStand, ...]:
    """Las bases del pedido, una por pastel que lleva base con depósito, en el orden de sus líneas: un diseño o el
    pastel de un envío de referencia aceptado (D70), que tienen la base con los mismos nombres."""
    projected = warranty_service.return_deadline(order.delivery_date, return_days)
    stands = []
    for item in order.items:
        cake = item.design or item.reference
        if cake is None or cake.stand_max_kg is None or cake.stand_deposit <= 0:
            continue
        loan = cake.loan
        stands.append(
            OrderStand(
                kg=cake.kg,
                deposit=cake.stand_deposit,
                return_days=return_days,
                return_by=loan.due_date if loan else projected,
                status=loan.status if loan else None,
                returned_at=loan.returned_at if loan else None,
            )
        )
    return tuple(stands)


def public_name(full_name: str) -> str:
    """El nombre y la inicial del apellido ("Mariana Pérez Soto" -> "Mariana P."), como pide la regla 11.

    Toma la primera palabra y la inicial de la segunda: con dos nombres de pila ("Ana María López") sale "Ana M.",
    que tampoco revela el apellido.
    """
    words = full_name.split()
    if len(words) < 2:
        return words[0] if words else ""
    return f"{words[0]} {words[1][0]}."


def get_note(customer_id: int, order_id: int, *, orders=order_repo, settings=settings_repo) -> OrderNote | None:
    """La nota de un pedido del cliente; `None` si es ajeno, no existe o todavía no tiene nota."""
    order = orders.get_customer_order(customer_id, order_id)
    return note_for_order(order, settings=settings) if order is not None else None


def note_for_order(order: OrderRecord, *, settings=settings_repo) -> OrderNote | None:
    """La nota de un pedido ya leído; `None` si todavía no tiene nota. Sin filtrar por dueño: quien llama ya lo hizo."""
    if not has_note(order.status):
        return None
    return OrderNote(
        order=order,
        stands=order_stands(order, warranty_service.stand_return_days(settings)),
        store=store_info_service.get_store_info(settings),
    )


def verify_note(token: str, *, orders=order_repo, settings=settings_repo) -> NoteVerification | None:
    """Lo público de la nota de ese token; `None` si el token no tiene la forma, no existe o el pedido no tiene nota."""
    if not NOTE_TOKEN.fullmatch(token):
        return None
    order = orders.find_order_by_note_token(token, statuses=NOTE_STATUSES)
    if order is None:
        return None
    return NoteVerification(
        order_id=order.id,
        created_at=order.created_at,
        customer=public_name(order.customer_name or order.pickup_name),
        fulfillment=order.fulfillment,
        delivery_date=order.delivery_date,
        starts_at=order.slot_starts_at,
        ends_at=order.slot_ends_at,
        stands=order_stands(order, warranty_service.stand_return_days(settings)),
    )
