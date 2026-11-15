"""Iniciar, confirmar y registrar el pago de un pedido (D68; reglas de negocio, secciones 10 y 12).

Iniciar (`start_payment`, `POST orders/<id>/payment/`): solo el dueño, solo un pedido `awaiting_payment` que no ha
vencido. El monto es siempre `Order.pay_today`, que el servidor calculó al crear el pedido (anticipo de
`PolicySettings.advance_percent`, lo de la vitrina de hoy completo, más el depósito de la base completo). La pasarela
sale de `create_payment_processor`. Con la misma `Idempotency-Key` se devuelve el mismo intento sin volver a cobrar;
con otro método es un conflicto. Al elegir efectivo, el plazo para pagar se extiende al cierre del día, sin pasar del
inicio del lapso y sin acortarlo nunca.

Confirmar (`apply_notice`, los webhooks): la pasarela ya verificó la firma y dijo qué pasó con el pago. Un pago
aprobado pasa el pedido a `received` solo si su monto es `pay_today`, su moneda MXN y el pedido sigue apartado, por la
misma transición y los mismos observadores que el cobro en efectivo (`order_status.apply_transition`). Es idempotente:
el mismo pago dos veces no cambia nada la segunda. Un pago aprobado que no se puede aplicar (el pedido ya se canceló,
ya estaba pagado, su lapso se llenó, o el monto o la moneda no coinciden) no resucita el pedido: queda como
`refund_required` con su motivo, visible en el admin, para que el personal lo reembolse desde la pasarela.

Registrar el efectivo (`register_cash_payment`, el admin): el personal con `core_pasteleria.register_cash_payment`
cambia el estado a `received`; pasa por la misma transición y los mismos observadores, y queda el pago `succeeded`.
"""
from dataclasses import dataclass
from datetime import datetime

from ...models import OrderStatus, PaymentMethod, PaymentRefundReason, PaymentStatus
from ...repositories import order_repo, payment_repo, product_repo, settings_repo
from ...repositories.payment_repo import DuplicatePayment
from ...repositories.records import NewPayment, OrderRecord, PaymentRecord
from ..audit import audit_operation
from ..orders import order_status, schedule_service
from ..orders.order_status import StatusChangeError
from .errors import KeyReusedWithAnotherMethod, OrderExpired, OrderNotFound, OrderNotPayable, PaymentError
from .payment_factory import OPEN_STATUSES, PAYMENT_GATEWAY_REGISTRY, create_payment_processor
from .results import CURRENCY, ChargeRequest, PaymentNotice, PaymentResult

CASH_PERMISSION = "core_pasteleria.register_cash_payment"
NO_CASH_PERMISSION_MESSAGE = "No tienes permiso para registrar cobros en efectivo."


@dataclass(frozen=True)
class CheckoutUrls:
    """Las URL del sitio que arma la vista: a dónde vuelve el cliente y a dónde avisa la pasarela."""

    back_url: str
    notification_url: str


@dataclass(frozen=True)
class StartedPayment:
    payment: PaymentRecord
    result: PaymentResult
    order: OrderRecord
    created: bool


@dataclass(frozen=True)
class MethodAvailability:
    method: str
    available: bool


@dataclass(frozen=True)
class PaymentState:
    order: OrderRecord
    methods: tuple[MethodAvailability, ...]
    latest: PaymentRecord | None


@dataclass(frozen=True)
class NoticeOutcome:
    order_id: int | None
    method: str
    result: str


def _describe_start(started: StartedPayment) -> dict:
    return {
        "order_id": started.order.id,
        "method": started.payment.method,
        "payment_id": started.payment.id,
        "new_attempt": started.created,
    }


def _order_of(customer_id: int, order_id: int, orders) -> OrderRecord:
    order = orders.get_customer_order(customer_id, order_id)
    if order is None:
        raise OrderNotFound
    return order


def _check_payable(order: OrderRecord, now: datetime, orders, products, settings) -> None:
    if order.status != OrderStatus.AWAITING_PAYMENT or order.pay_today is None:
        raise OrderNotPayable
    if order.payment_due_at is not None and order.payment_due_at <= now:
        # Vencido aunque el comando todavía no corra: se cancela ya, con su reintegro, como en `find_order_by_key`.
        order_status.cancel_customer_expired_orders(
            order.customer_id, now=now, orders=orders, products=products, settings=settings
        )
        raise OrderExpired


def _extend_for_cash(order: OrderRecord, now: datetime, orders, settings) -> None:
    """El cierre del día (regla 10), sin pasar del inicio del lapso ni acortar el plazo que ya tenía. Si venció entre
    la revisión y el `UPDATE` (o el comando ya lo canceló), `OrderExpired`."""
    starts = schedule_service.starts_at(order.delivery_date, order.slot_starts_at, now)
    closing = schedule_service.cash_payment_due_at(now, starts, settings.get_store_settings())
    due = min(max(order.payment_due_at or closing, closing), starts)
    if not orders.extend_payment_due_at(order.id, due, unpaid_status=OrderStatus.AWAITING_PAYMENT, now=now):
        raise OrderExpired


def _replay(existing: PaymentRecord, method: str, order: OrderRecord) -> StartedPayment:
    if existing.method != method:
        raise KeyReusedWithAnotherMethod
    processor = create_payment_processor(existing.method)
    return StartedPayment(existing, processor.resume(existing), order, created=False)


@audit_operation(expected_errors=(PaymentError,), describe=_describe_start)
def start_payment(
    customer_id: int,
    order_id: int,
    method: str,
    idempotency_key: str,
    urls: CheckoutUrls,
    *,
    now: datetime | None = None,
    orders=order_repo,
    payments=payment_repo,
    products=product_repo,
    settings=settings_repo,
) -> StartedPayment:
    """Inicia el cobro de lo que el pedido paga hoy con `method`, o devuelve el que ya se inició con esa llave."""
    now = now or schedule_service.bakery_now()
    order = _order_of(customer_id, order_id, orders)
    existing = payments.find_by_key(order.id, idempotency_key)
    if existing is not None:
        if existing.status in OPEN_STATUSES:
            # Un intento abierto vuelve a entregar su cobro: solo si el pedido todavía se puede pagar.
            _check_payable(order, now, orders, products, settings)
        return _replay(existing, method, order)
    _check_payable(order, now, orders, products, settings)
    processor = create_payment_processor(method)
    result = processor.charge(
        order.pay_today,
        ChargeRequest(
            order_id=order.id,
            idempotency_key=idempotency_key,
            description=f"Pedido {order.id} de Pastelería Ilusión",
            back_url=urls.back_url,
            notification_url=urls.notification_url,
            expires_at=order.payment_due_at,
        ),
    )
    try:
        with payments.atomic():
            # El efectivo extiende el plazo en la misma transacción que guarda el intento: si ya venció, ninguno queda.
            if processor.pays_at_the_store:
                _extend_for_cash(order, now, orders, settings)
            payment = payments.create_payment(
                NewPayment(
                    order_id=order.id,
                    method=result.method,
                    status=result.status,
                    amount=result.amount,
                    currency=result.currency,
                    idempotency_key=idempotency_key,
                    checkout_id=result.checkout_id,
                    redirect_url=result.redirect_url,
                )
            )
    except DuplicatePayment:
        # Otra petición con la misma llave ganó la carrera: se responde la suya.
        return _replay(payments.find_by_key(order.id, idempotency_key), method, order)
    return StartedPayment(payment, result, orders.get_customer_order(customer_id, order.id), created=True)


def payment_state(customer_id: int, order_id: int, *, orders=order_repo, payments=payment_repo) -> PaymentState:
    """Lo que la pantalla de pago necesita: el pedido con su desglose, los métodos que se ofrecen y el último intento."""
    order = _order_of(customer_id, order_id, orders)
    methods = tuple(MethodAvailability(method, processor.is_available()) for method, processor in PAYMENT_GATEWAY_REGISTRY.items())
    return PaymentState(order, methods, payments.latest_for_order(order.id))


# --- Confirmación por webhook ---


def _mismatch(notice: PaymentNotice, expected) -> str:
    """El motivo por el que un pago aprobado no corresponde a lo que el pedido paga hoy; vacío si corresponde."""
    if notice.currency != CURRENCY:
        return PaymentRefundReason.CURRENCY_MISMATCH
    if expected is None or notice.amount != expected:
        return PaymentRefundReason.AMOUNT_MISMATCH
    return ""


def _receive(order_id: int, now: datetime, actor_id: int | None, orders, products, settings) -> bool:
    """`awaiting_payment` -> `received` por la transición de siempre; `False` si el pedido ya no se puede recibir."""
    try:
        return order_status.apply_transition(
            order_id, OrderStatus.AWAITING_PAYMENT, OrderStatus.RECEIVED, now,
            actor_id=actor_id, orders=orders, products=products, settings=settings,
        )
    except StatusChangeError:
        # Venció y otro pedido llenó su lapso (D63, ronda 2).
        return False


def _save_notice(payment: PaymentRecord | None, notice: PaymentNotice, status: str, reason: str, payments) -> None:
    fields = {
        "status": status,
        "refund_reason": reason,
        "provider_payment_id": notice.provider_payment_id,
    }
    if notice.amount is not None:
        fields.update(amount=notice.amount, currency=notice.currency or CURRENCY)
    if payment is not None:
        payments.update_payment(payment.id, **fields)
        return
    payments.create_payment(
        NewPayment(
            order_id=notice.order_id,
            method=notice.method,
            checkout_id=notice.checkout_id,
            amount=fields.pop("amount", 0),
            currency=fields.pop("currency", CURRENCY),
            **fields,
        )
    )


def _apply_success(notice, payment, now, orders, payments, products, settings) -> str:
    terms = payments.get_payment_terms(notice.order_id)
    if terms is None:
        return "unknown_order"
    reason = _mismatch(notice, terms.pay_today)
    if not reason and not _receive(notice.order_id, now, None, orders, products, settings):
        reason = PaymentRefundReason.ORDER_NOT_PAYABLE
    status = PaymentStatus.REFUND_REQUIRED if reason else PaymentStatus.SUCCEEDED
    _save_notice(payment, notice, status, reason, payments)
    return status


def _apply_failure(notice, payment, now, orders, payments, products, settings) -> str:
    """Un pago rechazado deja el intento en `failed`: el pedido sigue apartado y el cliente puede volver a intentar."""
    if payment is None:
        return "ignored"
    _save_notice(payment, notice, PaymentStatus.FAILED, "", payments)
    return PaymentStatus.FAILED


NOTICE_HANDLERS = {PaymentStatus.SUCCEEDED: _apply_success, PaymentStatus.FAILED: _apply_failure}


@audit_operation(describe=lambda outcome: {"order_id": outcome.order_id, "method": outcome.method, "outcome": outcome.result})
def apply_notice(
    notice: PaymentNotice | None,
    *,
    now: datetime | None = None,
    orders=order_repo,
    payments=payment_repo,
    products=product_repo,
    settings=settings_repo,
) -> NoticeOutcome:
    """Aplica lo que confirmó la pasarela. Idempotente: un pago ya resuelto (`succeeded` o `refund_required`) no
    cambia; dos notificaciones a la vez del mismo pago chocan con una restricción única y la segunda no cambia nada."""
    if notice is None or notice.order_id is None:
        return NoticeOutcome(None, notice.method if notice else "", "ignored")
    now = now or schedule_service.bakery_now()
    try:
        with payments.atomic():
            payment = payments.lock_for_confirmation(
                notice.method,
                notice.order_id,
                provider_payment_id=notice.provider_payment_id,
                checkout_id=notice.checkout_id,
                open_statuses=OPEN_STATUSES,
            )
            if payment is not None and payment.status not in OPEN_STATUSES:
                return NoticeOutcome(notice.order_id, notice.method, "duplicate")
            if payment is not None and payment.order_id != notice.order_id:
                # El cobro que creó el servidor es de otro pedido: no se aplica a ninguno (queda en la auditoría).
                return NoticeOutcome(notice.order_id, notice.method, "order_mismatch")
            handler = NOTICE_HANDLERS[notice.outcome]
            result = handler(notice, payment, now, orders, payments, products, settings)
    except DuplicatePayment:
        return NoticeOutcome(notice.order_id, notice.method, "duplicate")
    return NoticeOutcome(notice.order_id, notice.method, result)


# --- Efectivo desde el admin ---


@audit_operation(
    expected_errors=(StatusChangeError,),
    describe=lambda change: {"order_id": change.order_id, "actor_id": change.actor_id, "method": PaymentMethod.CASH},
)
def register_cash_payment(
    order_id: int,
    *,
    actor,
    now: datetime | None = None,
    orders=order_repo,
    payments=payment_repo,
    products=product_repo,
    settings=settings_repo,
) -> order_status.StatusChange:
    """El personal cobró en la pastelería: el pedido pasa a `received` y queda el pago en efectivo `succeeded`.

    Vuelve a revisar el permiso aunque el admin ya lo filtre. En una sola transacción: el cambio de estado de siempre
    (`order_status.change_status`, que bloquea el lapso y el pedido, avisa a los observadores y queda en la auditoría
    con los dos estados) y después la fila del efectivo (la que eligió el cliente, o una nueva si pagó sin elegirlo en
    el sitio).
    """
    if not actor.has_perm(CASH_PERMISSION):
        raise StatusChangeError({"status": [NO_CASH_PERMISSION_MESSAGE]})
    with orders.atomic():
        change = order_status.change_status(
            order_id, OrderStatus.AWAITING_PAYMENT, OrderStatus.RECEIVED,
            actor_id=actor.pk, orders=orders, products=products, settings=settings, now=now,
        )
        terms = payments.get_payment_terms(order_id)
        chosen = payments.lock_open_payment(order_id, PaymentMethod.CASH, open_statuses=OPEN_STATUSES)
        if chosen is not None:
            payments.update_payment(
                chosen.id, status=PaymentStatus.SUCCEEDED, amount=terms.pay_today, recorded_by_id=actor.pk
            )
        else:
            payments.create_payment(
                NewPayment(
                    order_id=order_id, method=PaymentMethod.CASH, status=PaymentStatus.SUCCEEDED,
                    amount=terms.pay_today, currency=CURRENCY, recorded_by_id=actor.pk,
                )
            )
    return change
