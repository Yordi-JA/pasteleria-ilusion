"""Cancelación de un pedido por el cliente desde su cuenta (regla 10; D70).

Lo decidió el usuario el 15 de noviembre de 2026:
- El cliente cancela en cualquier momento antes de la entrega: desde `awaiting_payment`, `awaiting_quote`, `received`,
  `in_preparation` y `ready_for_delivery` (`CUSTOMER_CANCELLABLE`). Un pedido entregado o ya cancelado, no. No hay corte
  de horas.
- Sin pagar (`awaiting_payment` o `awaiting_quote`) se cancela sin cobro, con el mismo reintegro de vitrina, pan, lapso
  e imágenes que hace el admin (`InventoryObserver`).
- Pagado, la pastelería retiene `PolicySettings.customer_cancel_retention_percent` (50 en la semilla) del total del
  pedido sin el depósito de la base (`subtotal` + envío). Se devuelve lo pagado menos lo retenido, nunca menos de 0: en
  un pedido normal, cuyo anticipo ya es el 50%, se devuelve el depósito; en la vitrina, pagada al 100%, la mitad. La
  devolución queda como un pago `refund_required` con el motivo `customer_cancelled` y el personal la hace a mano, como
  en D68.

Estas transiciones a `cancelled` son solo de esta ruta: `order_status.ALLOWED_TRANSITIONS`, la del personal en el admin,
sigue cancelando solo antes del pago.

La transición pasa por `order_status.apply_transition` (el mismo `UPDATE` condicional y los mismos observadores: el
reintegro y la cancelación en Stripe de lo abierto), con el motivo `customer`, en la misma transacción que la fila del
reembolso y con el pedido bloqueado antes de calcular.
"""
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from ...models import CancellationReason, OrderStatus, PaymentRefundReason, PaymentStatus
from ...repositories import order_repo, payment_repo, product_repo, settings_repo
from ...repositories.records import CancellationTerms, NewPayment, OrderRecord
from ..audit import audit_operation
from . import order_status, schedule_service

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
UNPAID_STATUSES = (OrderStatus.AWAITING_PAYMENT, OrderStatus.AWAITING_QUOTE)
# Desde dónde cancela el cliente: todo lo que todavía no se entrega.
CUSTOMER_CANCELLABLE = (
    *UNPAID_STATUSES,
    OrderStatus.RECEIVED,
    OrderStatus.IN_PREPARATION,
    OrderStatus.READY_FOR_DELIVERY,
)

NOT_CANCELLABLE = "not_cancellable"
ALREADY_CANCELLED = "already_cancelled"

MESSAGES = {
    NOT_CANCELLABLE: "Este pedido ya se entregó: ya no se puede cancelar.",
    ALREADY_CANCELLED: "Este pedido ya está cancelado.",
}
# Los estados en que ya no se cancela, con su motivo; lo que no está aquí ni en `CUSTOMER_CANCELLABLE` tampoco se cancela.
REFUSALS = {
    OrderStatus.DELIVERED: NOT_CANCELLABLE,
    OrderStatus.CANCELLED: ALREADY_CANCELLED,
}
STALE_PREVIEW = "stale_preview"
STALE_PREVIEW_MESSAGE = "El pedido cambió mientras lo revisabas. Revisa otra vez antes de cancelar."
STALE_MESSAGE = "Tu pedido cambió mientras lo cancelabas. Vuelve a abrirlo."


class CancellationRefused(Exception):
    """El pedido no se puede cancelar (409). `code` y `message` los usa la API."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(code)


@dataclass(frozen=True)
class CancellationQuote:
    """Lo que pasaría al cancelar ahora: si se puede y, si no, por qué; lo pagado, lo retenido y lo que se devuelve."""

    order_id: int
    status: str
    cancellable: bool
    reason: str | None
    message: str | None
    paid: Decimal
    paid_with: str
    order_total: Decimal
    retention_percent: int
    retained: Decimal
    refund: Decimal


@dataclass(frozen=True)
class CancelledOrder:
    order: OrderRecord
    quote: CancellationQuote


def _refusal(terms: CancellationTerms) -> str | None:
    if terms.status in CUSTOMER_CANCELLABLE:
        return None
    return REFUSALS.get(terms.status, NOT_CANCELLABLE)


def _quote(terms: CancellationTerms, payment, policy) -> CancellationQuote:
    # Un pedido pagado tiene su pago `succeeded` (D68); uno sin pagar no retiene nada.
    paid_order = payment is not None and terms.status not in UNPAID_STATUSES
    paid = payment.amount if payment is not None and paid_order else ZERO
    total = terms.subtotal + terms.delivery_fee
    percent = policy.customer_cancel_retention_percent if paid_order else 0
    retained = min((total * percent / 100).quantize(CENT, rounding=ROUND_HALF_UP), paid)
    reason = _refusal(terms)
    return CancellationQuote(
        order_id=terms.order_id,
        status=terms.status,
        cancellable=reason is None,
        reason=reason,
        message=MESSAGES.get(reason),
        paid=paid,
        paid_with=payment.method if payment is not None and paid_order else "",
        order_total=total,
        retention_percent=percent,
        retained=retained,
        refund=max(paid - retained, ZERO),
    )


def preview(
    customer_id: int,
    order_id: int,
    *,
    orders=order_repo,
    payments=payment_repo,
    settings=settings_repo,
) -> CancellationQuote | None:
    """Cuánto se retiene y cuánto se devuelve si el cliente cancela ahora. `None` si el pedido no es suyo."""
    terms = orders.get_cancellation_terms(customer_id, order_id)
    if terms is None:
        return None
    return _quote(terms, payments.succeeded_for_order(order_id), settings.get_policy_settings())


def _describe(result: CancelledOrder | None) -> dict:
    if result is None:
        return {"found": False}
    quote = result.quote
    return {
        "order_id": quote.order_id,
        "previous_status": quote.status,
        "paid": str(quote.paid),
        "retained": str(quote.retained),
        "refund": str(quote.refund),
    }


@audit_operation(expected_errors=(CancellationRefused,), describe=_describe)
def cancel_order(
    customer_id: int,
    order_id: int,
    expected_status: str,
    *,
    now: datetime | None = None,
    orders=order_repo,
    payments=payment_repo,
    products=product_repo,
    settings=settings_repo,
    events=None,
) -> CancelledOrder | None:
    """Cancela el pedido del cliente con su reintegro y, si se pagó, deja la devolución para el personal. `None` si el
    pedido no es suyo. `expected_status` es el estado de la vista previa que vio el cliente: si ya cambió (llegó el
    pago), no cancela, porque lo retenido que vio ya no es el de ahora."""
    now = now or schedule_service.bakery_now()
    policy = settings.get_policy_settings()
    with orders.atomic():
        terms = orders.get_cancellation_terms(customer_id, order_id, lock=True)
        if terms is None:
            return None
        if terms.status != expected_status:
            raise CancellationRefused(STALE_PREVIEW, STALE_PREVIEW_MESSAGE)
        payment = payments.succeeded_for_order(order_id)
        quote = _quote(terms, payment, policy)
        if not quote.cancellable:
            raise CancellationRefused(quote.reason, quote.message)
        moved = order_status.apply_transition(
            order_id, terms.status, OrderStatus.CANCELLED, now, actor_id=customer_id, orders=orders,
            products=products, settings=settings, events=events, reason=CancellationReason.CUSTOMER,
        )
        if not moved:
            raise CancellationRefused(NOT_CANCELLABLE, STALE_MESSAGE)
        if quote.refund > ZERO:
            payments.create_payment(
                NewPayment(
                    order_id=order_id,
                    method=payment.method,
                    status=PaymentStatus.REFUND_REQUIRED,
                    amount=quote.refund,
                    currency=payment.currency,
                    refund_reason=PaymentRefundReason.CUSTOMER_CANCELLED,
                )
            )
    return CancelledOrder(orders.get_customer_order(customer_id, order_id), quote)
