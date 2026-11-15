"""Precio de una decoración por cotizar (regla 6.1; D63, ronda 2; lo decidió el usuario el 14 de noviembre de 2026).

El personal escribe el precio en el registro básico del pedido en el admin, sin pantallas nuevas (D64), y solo mientras
el pedido está en `awaiting_quote`. El servidor suma la decoración al diseño y al pedido, recalcula el pago con
`payment_summary` (la base y el envío aparte; la vitrina de hoy no cabe junto a un diseño) y pasa el pedido a
`awaiting_payment`.

Decisiones del usuario de la revisión de la ronda 2 (14 de noviembre de 2026):
- Un pedido en pausa por cotización no ocupa lapso; al ponerle precio se bloquea su lapso y se revisa el cupo, como al
  cobrar un apartado vencido. Sin lugar, el precio no se guarda y la pastelería acuerda otro horario por WhatsApp.
- Con precio, el pedido se paga hasta el cierre del día y nunca después del inicio de su lapso
  (`schedule_service.cash_payment_due_at`): hasta el Observer de la tanda 2 nadie le avisa al cliente, y la pastelería
  le escribe por WhatsApp.
- No se revisa el tope de pedidos sin pagar del cliente: ese tope es de la creación.

Todo va en una transacción, con el lapso y después el pedido bloqueados (el orden de `order_status` al cobrar): dos
personas que cotizan a la vez lo cotizan una sola vez.
"""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from ...models import OrderStatus
from ...repositories import order_repo, settings_repo
from ...repositories.records import QuotePrice
from ..audit import audit_operation
from ..errors import DomainValidationError
from ..payment_summary import payment_summary
from . import schedule_service
from .order_service import MAX_ORDER_AMOUNT, TOO_EXPENSIVE_MESSAGE
from .order_status import STALE_MESSAGE

FIELD = "quoted_decoration_price"
NOT_POSITIVE_MESSAGE = "Escribe un precio mayor que $0."
SLOT_PASSED_MESSAGE = "El horario de este pedido ya pasó: no se le puede poner precio. Cancélalo."
SLOT_FULL_MESSAGE = (
    "El horario de este pedido ya no tiene lugar: otros pedidos lo ocuparon mientras esperaba su precio. Acuerda otro "
    "horario con el cliente por WhatsApp."
)


class QuoteError(DomainValidationError):
    """La cotización no se puede guardar; los errores van en `quoted_decoration_price`."""


@dataclass(frozen=True)
class QuotedOrder:
    order_id: int
    actor_id: int
    decoration_price: Decimal
    pay_today: Decimal


def _describe(quoted: QuotedOrder) -> dict:
    # Montos, nunca datos del cliente.
    return {
        "order_id": quoted.order_id,
        "actor_id": quoted.actor_id,
        "decoration_price": str(quoted.decoration_price),
        "pay_today": str(quoted.pay_today),
    }


@audit_operation(expected_errors=(DomainValidationError,), describe=_describe)
def price_quote(
    order_id: int,
    decoration_price: Decimal,
    *,
    actor_id: int,
    orders=order_repo,
    settings=settings_repo,
    now: datetime | None = None,
) -> QuotedOrder:
    """Pone el precio de la decoración y deja el pedido apartado, listo para pagarse."""
    if decoration_price is None or decoration_price <= 0:
        raise QuoteError({FIELD: [NOT_POSITIVE_MESSAGE]})
    now = now or schedule_service.bakery_now()
    store = settings.get_store_settings()
    with orders.atomic():
        held = orders.lock_order_slot(order_id)
        quote = orders.lock_quote(order_id, status=OrderStatus.AWAITING_QUOTE) if held is not None else None
        if quote is None:
            raise QuoteError({FIELD: [STALE_MESSAGE]})
        starts = schedule_service.starts_at(quote.delivery_date, quote.slot_starts_at, now)
        if starts <= now:
            raise QuoteError({FIELD: [SLOT_PASSED_MESSAGE]})
        taken = orders.count_orders_in_slot(held.delivery_slot_id, **schedule_service.holding_filter(now))
        if taken >= store.max_orders_per_slot:
            raise QuoteError({FIELD: [SLOT_FULL_MESSAGE]})
        subtotal = quote.subtotal + decoration_price
        if subtotal + quote.stand_deposit + quote.delivery_fee > MAX_ORDER_AMOUNT:
            raise QuoteError({FIELD: [TOO_EXPENSIVE_MESSAGE]})
        payment = payment_summary(
            subtotal, quote.stand_deposit, quote.delivery_fee, settings, paid_in_full=quote.paid_in_full
        )
        orders.apply_quote(
            order_id,
            quote.design_id,
            QuotePrice(
                decoration_price=decoration_price,
                design_total=quote.design_total + decoration_price,
                subtotal=subtotal,
                advance_percent=payment.advance_percent,
                advance=payment.advance,
                pay_today=payment.pay_today,
                pay_on_delivery=payment.pay_on_delivery,
                paid_in_full=quote.paid_in_full,
                payment_due_at=schedule_service.cash_payment_due_at(now, starts, store),
                status=OrderStatus.AWAITING_PAYMENT,
                status_changed_at=now,
            ),
        )
    return QuotedOrder(order_id, actor_id, decoration_price, payment.pay_today)
