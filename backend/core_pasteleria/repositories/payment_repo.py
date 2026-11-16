"""Consultas de los pagos de los pedidos (D68).

Las restricciones únicas de `Payment` impiden el doble registro aunque dos peticiones lleguen a la vez: la llave de
idempotencia por pedido, el id de la pasarela por método y un solo pago `succeeded` por pedido. Quien choca con una
recibe `DuplicatePayment` y vuelve a leer lo que ya quedó.

Orden de los candados al confirmar un pago (webhook): la fila del pago y después lo que bloquea el cambio de estado del
pedido (su lapso y el pedido, `order_status`). El cobro en efectivo bloquea el lapso, el pedido y al final escribe su
propia fila de efectivo: nunca la de un pago en línea, así que no se esperan en cruz.
"""
from collections.abc import Iterable

from django.db import IntegrityError, transaction
from django.utils import timezone

from ..models import Order, Payment, PaymentStatus
from .records import NewPayment, PaymentRecord, PaymentTerms


class DuplicatePayment(Exception):
    """Otra petición ya registró ese pago (misma llave o mismo id de la pasarela)."""


def atomic():
    return transaction.atomic()


def _record(payment: Payment) -> PaymentRecord:
    return PaymentRecord(
        id=payment.pk,
        order_id=payment.order_id,
        method=payment.method,
        status=payment.status,
        refund_reason=payment.refund_reason,
        amount=payment.amount,
        currency=payment.currency,
        idempotency_key=payment.idempotency_key,
        checkout_id=payment.checkout_id,
        provider_payment_id=payment.provider_payment_id,
        redirect_url=payment.redirect_url,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
    )


def find_by_key(order_id: int, key: str) -> PaymentRecord | None:
    payment = Payment.objects.filter(order_id=order_id, idempotency_key=key).first()
    return _record(payment) if payment else None


def succeeded_for_order(order_id: int) -> PaymentRecord | None:
    """El pago que pagó el pedido (uno solo por pedido, D68); `None` si no se pagó."""
    payment = Payment.objects.filter(order_id=order_id, status=PaymentStatus.SUCCEEDED).first()
    return _record(payment) if payment else None


def latest_for_order(order_id: int) -> PaymentRecord | None:
    payment = Payment.objects.filter(order_id=order_id).order_by("-created_at", "-pk").first()
    return _record(payment) if payment else None


def create_payment(new: NewPayment) -> PaymentRecord:
    """Guarda el pago. Si una restricción única ya lo tiene, `DuplicatePayment` (en su propio punto de guardado, así la
    transacción de quien llama sigue viva)."""
    try:
        with transaction.atomic():
            payment = Payment.objects.create(
                order_id=new.order_id,
                method=new.method,
                status=new.status,
                amount=new.amount,
                currency=new.currency,
                idempotency_key=new.idempotency_key,
                checkout_id=new.checkout_id,
                provider_payment_id=new.provider_payment_id,
                redirect_url=new.redirect_url,
                refund_reason=new.refund_reason,
                recorded_by_id=new.recorded_by_id,
            )
    except IntegrityError as error:
        raise DuplicatePayment from error
    return _record(payment)


def lock_for_confirmation(
    method: str, order_id: int, *, provider_payment_id: str, checkout_id: str, open_statuses: Iterable[str]
) -> PaymentRecord | None:
    """Bloquea el pago que la pasarela confirma, hasta el fin de la transacción; `None` si no hay ninguno.

    En este orden: el que ya tiene ese id de pago (una notificación repetida), el del cobro que creó el servidor
    (`checkout_id`, el PaymentIntent de Stripe) y, si no, el intento abierto más reciente del pedido con ese método que
    todavía no tiene pago de la pasarela (Mercado Pago no dice de qué preferencia viene el pago).
    """
    payments = Payment.objects.select_for_update().filter(method=method)
    payment = payments.filter(provider_payment_id=provider_payment_id).first() if provider_payment_id else None
    if payment is None and checkout_id:
        payment = payments.filter(checkout_id=checkout_id).first()
    if payment is None:
        payment = (
            payments.filter(order_id=order_id, provider_payment_id="", status__in=list(open_statuses))
            .order_by("-created_at", "-pk")
            .first()
        )
    return _record(payment) if payment else None


def lock_open_payment(order_id: int, method: str, *, open_statuses: Iterable[str]) -> PaymentRecord | None:
    """Bloquea el intento abierto más reciente del pedido con ese método (el efectivo que eligió el cliente)."""
    payment = (
        Payment.objects.select_for_update()
        .filter(order_id=order_id, method=method, status__in=list(open_statuses))
        .order_by("-created_at", "-pk")
        .first()
    )
    return _record(payment) if payment else None


def update_payment(payment_id: int, **fields) -> None:
    """Cambia el estado y lo que confirmó la pasarela. Va dentro de `atomic()`, tras bloquear la fila. Un id de pago o
    un segundo `succeeded` que ya existen son `DuplicatePayment`."""
    allowed = {"status", "refund_reason", "amount", "currency", "provider_payment_id", "recorded_by_id"}
    unknown = set(fields) - allowed
    if unknown:
        raise ValueError(f"Campos que no se cambian aquí: {sorted(unknown)}")
    try:
        with transaction.atomic():
            # `update()` no toca `auto_now`: la hora del cambio va explícita.
            Payment.objects.filter(pk=payment_id).update(**fields, updated_at=timezone.now())
    except IntegrityError as error:
        raise DuplicatePayment from error


def list_open_checkouts(order_id: int, method: str, *, open_statuses: Iterable[str]) -> list[str]:
    """Lo que el servidor abrió en la pasarela (`checkout_id`) para los intentos abiertos del pedido con ese método,
    del más viejo al más nuevo."""
    return list(
        Payment.objects.filter(order_id=order_id, method=method, status__in=list(open_statuses))
        .exclude(checkout_id="")
        .order_by("created_at", "pk")
        .values_list("checkout_id", flat=True)
    )


def get_payment_terms(order_id: int) -> PaymentTerms | None:
    row = Order.objects.filter(pk=order_id).values("status", "pay_today").first()
    return PaymentTerms(order_id=order_id, status=row["status"], pay_today=row["pay_today"]) if row else None
