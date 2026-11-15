"""Transiciones del estado del pedido y cancelación de lo vencido (sección 12; D63, rondas 1 y 2).

El personal cambia el estado desde el registro básico del pedido en el admin, sin pantallas nuevas (D64): así registra
el cobro en efectivo (`awaiting_payment` -> `received`), avanza el pedido hasta entregarlo y cancela uno que todavía no
se paga. Solo se permiten las transiciones de `ALLOWED_TRANSITIONS`. La salida de `awaiting_quote` hacia
`awaiting_payment` no es un cambio de estado a mano: la hace `quote_service` al poner el precio.

Cada transición puede llevar una revisión antes y un efecto después (`CHECKS_BEFORE` y `EFFECTS_AFTER`, por estado de
destino), dentro de la misma transacción que el `UPDATE` condicional:
- `received`: un apartado vencido dejó de ocupar su lapso; antes de cobrarlo se vuelve a revisar que el lapso tenga cupo.
- `cancelled`: se devuelven las piezas de la vitrina (`restock_showcase`) y el pan del día (`release_bread`), y se
  borran las imágenes de sus diseños. Los candados van en el orden de la creación a partir de la vitrina (D63): toda la
  vitrina por id de la presentación, después todo el pan por id y al final las imágenes. Así cancelar y crear la misma
  combinación a la vez no se esperan en cruz.

Cancelar solo antes del pago (lo decidió el usuario el 14 de noviembre de 2026): un pedido pagado no se cancela aquí,
porque falta el reembolso (tanda 2). `cancel_expired_orders` cancela, con el mismo reintegro, los apartados con el plazo
cumplido y, si la pastelería fijó `PolicySettings.quote_expiry_hours` (PENDIENTE), las cotizaciones sin precio. Lo corre
el comando `cancel_expired_orders` y, para su cliente, la creación de un pedido (`cancel_customer_expired_orders`). Cada
pedido va en su propia transacción: dos corridas a la vez lo cancelan y reintegran una sola vez, y un error en uno se
registra sin cortar la corrida. El Observer de la tanda 2 reaccionará a estos cambios.
"""
import logging
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone

from ...models import CancellationReason, OrderLineKind, OrderStatus
from ...repositories import order_repo, product_repo, settings_repo
from ..audit import audit_operation
from ..errors import DomainValidationError
from . import schedule_service

logger = logging.getLogger(__name__)

ALLOWED_TRANSITIONS: dict[str, tuple[str, ...]] = {
    OrderStatus.AWAITING_PAYMENT: (OrderStatus.RECEIVED, OrderStatus.CANCELLED),
    OrderStatus.RECEIVED: (OrderStatus.IN_PREPARATION,),
    OrderStatus.IN_PREPARATION: (OrderStatus.READY_FOR_DELIVERY,),
    OrderStatus.READY_FOR_DELIVERY: (OrderStatus.DELIVERED,),
    OrderStatus.DELIVERED: (),
    OrderStatus.CANCELLED: (),
    OrderStatus.AWAITING_QUOTE: (OrderStatus.CANCELLED,),
}

NOT_ALLOWED_MESSAGE = "Ese cambio de estado no se puede hacer desde aquí."
STALE_MESSAGE = "El pedido cambió mientras lo editabas. Vuelve a abrirlo."
SLOT_TAKEN_MESSAGE = (
    "El horario de este pedido ya está lleno: venció sin pagarse y otro pedido ocupó su lugar. No se puede registrar el "
    "cobro; cancélalo y pide al cliente que haga otro."
)


class StatusChangeError(DomainValidationError):
    """El cambio de estado no se permite o el pedido ya cambió."""


@dataclass(frozen=True)
class StatusChange:
    order_id: int
    actor_id: int | None
    previous_status: str
    new_status: str


def next_statuses(current: str) -> tuple[str, ...]:
    """Los estados a los que puede pasar un pedido desde `current`."""
    return ALLOWED_TRANSITIONS.get(current, ())


def _describe(change: StatusChange) -> dict:
    return {
        "order_id": change.order_id,
        "actor_id": change.actor_id,
        "previous_status": change.previous_status,
        "new_status": change.new_status,
    }


# --- Revisiones y efectos por estado de destino ---


def _nothing(*args, **kwargs) -> None:
    return None


def _slot_still_has_room(order_id: int, now: datetime, orders, settings) -> None:
    """Un apartado vencido ya no ocupaba su lapso: si otro lo llenó, no se puede cobrar."""
    held = orders.lock_order_slot(order_id)
    if held is None or (held.payment_due_at is not None and held.payment_due_at > now):
        return
    taken = orders.count_orders_in_slot(held.delivery_slot_id, **schedule_service.holding_filter(now))
    if taken >= settings.get_store_settings().max_orders_per_slot:
        raise StatusChangeError({"status": [SLOT_TAKEN_MESSAGE]})


def _give_back(order_id: int, orders, products) -> None:
    """Devuelve lo que el pedido apartó y borra las imágenes de sus diseños (ya nada las protege).

    En el orden de los candados de la creación: la vitrina por id, el pan por id (sumado, como lo consume la creación)
    y las imágenes.
    """
    lines = orders.list_reserved_lines(order_id, showcase_kind=OrderLineKind.SHOWCASE)
    for line in sorted((line for line in lines if line.offering_id is not None), key=lambda line: line.offering_id):
        products.restock_showcase(line.offering_id, line.on_date, line.quantity)
    bread: dict[tuple, int] = defaultdict(int)
    for line in lines:
        if line.bread_id is not None:
            bread[(line.bread_id, line.on_date)] += line.quantity
    for (bread_id, on_date), quantity in sorted(bread.items()):
        products.release_bread(bread_id, on_date, quantity)
    orders.delete_order_images(order_id)


CHECKS_BEFORE: dict[str, Callable] = {OrderStatus.RECEIVED: _slot_still_has_room}
EFFECTS_AFTER: dict[str, Callable] = {OrderStatus.CANCELLED: _give_back}
# El motivo que guarda un cambio del personal; lo vencido guarda `expired` (la pausa de la vitrina solo cuenta esos).
STAFF_REASONS: dict[str, str] = {OrderStatus.CANCELLED: CancellationReason.STAFF}


@dataclass(frozen=True)
class CancelRun:
    """Lo que hizo una corrida: los que canceló y los que fallaron (siguen vencidos, con sus piezas apartadas)."""

    cancelled: tuple[int, ...]
    failed: tuple[int, ...]


def _apply(order_id: int, current: str, new: str, now: datetime, orders, products, settings, reason: str = "") -> bool:
    """La transición completa en una transacción: revisión, `UPDATE` condicional y efecto. `False` si ya cambió."""
    with orders.atomic():
        CHECKS_BEFORE.get(new, _nothing)(order_id, now, orders, settings)
        if not orders.change_status(order_id, current, new, now, cancellation_reason=reason):
            return False
        EFFECTS_AFTER.get(new, _nothing)(order_id, orders, products)
    return True


@audit_operation(expected_errors=(DomainValidationError,), describe=_describe)
def change_status(
    order_id: int,
    current: str,
    new: str,
    *,
    actor_id: int,
    orders=order_repo,
    products=product_repo,
    settings=settings_repo,
    now: datetime | None = None,
) -> StatusChange:
    """Pasa el pedido de `current` a `new` si la transición se permite y nadie lo cambió antes."""
    if new not in next_statuses(current):
        raise StatusChangeError({"status": [NOT_ALLOWED_MESSAGE]})
    if not _apply(order_id, current, new, now or timezone.now(), orders, products, settings, STAFF_REASONS.get(new, "")):
        raise StatusChangeError({"status": [STALE_MESSAGE]})
    return StatusChange(order_id, actor_id, current, new)


# --- Lo vencido ---


def _quoted_before(now: datetime, policy) -> datetime | None:
    """Desde cuándo vence una cotización sin precio; `None` mientras `quote_expiry_hours` siga PENDIENTE."""
    hours = policy.quote_expiry_hours
    return now - timedelta(hours=hours) if hours else None


def _cancel_each(expired: list[tuple[int, str]], now: datetime, orders, products, settings) -> CancelRun:
    """Cancela cada pedido en su transacción, con el motivo `expired`. Devuelve los que canceló y los que fallaron.

    Otra corrida, o el personal, pudo cambiarlo después de la lista: el `UPDATE` condicional lo deja pasar una vez. Un
    error en un pedido se registra con su id y el nombre del error (sin mensaje ni traza, como la auditoría) y la
    corrida sigue con el siguiente.
    """
    cancelled, failed = [], []
    for order_id, status in expired:
        try:
            if _apply(order_id, status, OrderStatus.CANCELLED, now, orders, products, settings, CancellationReason.EXPIRED):
                cancelled.append(order_id)
        except Exception as error:
            logger.error("No se pudo cancelar el pedido %s: %s", order_id, type(error).__name__)
            failed.append(order_id)
    return CancelRun(tuple(cancelled), tuple(failed))


def _expired(now: datetime, settings, orders, customer_id: int | None = None) -> list[tuple[int, str]]:
    return orders.list_expired_orders(
        unpaid_status=schedule_service.UNPAID_STATUS,
        now=now,
        quote_status=OrderStatus.AWAITING_QUOTE,
        quoted_before=_quoted_before(now, settings.get_policy_settings()),
        customer_id=customer_id,
    )


@audit_operation(describe=lambda ids: {"cancelled": len(ids), "order_ids": list(ids)})
def cancel_expired_order_ids(
    *, now: datetime | None = None, orders=order_repo, products=product_repo, settings=settings_repo
) -> tuple[int, ...]:
    """Cancela, con su reintegro, lo vencido. Devuelve los ids que canceló esta corrida (la auditoría los registra)."""
    now = now or schedule_service.bakery_now()
    return _cancel_each(_expired(now, settings, orders), now, orders, products, settings).cancelled


def cancel_expired_orders(**kwargs) -> int:
    """Lo que corre el comando: cuántos pedidos canceló esta corrida."""
    return len(cancel_expired_order_ids(**kwargs))


@audit_operation(describe=lambda run: {"cancelled": len(run.cancelled), "order_ids": list(run.cancelled)})
def _cancel_customer_listed(expired: list[tuple[int, str]], now: datetime, orders, products, settings) -> CancelRun:
    return _cancel_each(expired, now, orders, products, settings)


def cancel_customer_expired_orders(
    customer_id: int, *, now: datetime, orders=order_repo, products=product_repo, settings=settings_repo
) -> CancelRun:
    """Lo vencido de un cliente, antes de crearle un pedido: sus piezas vuelven antes de que aparte otras.

    Sin vencidos no hace nada ni escribe en la auditoría (corre en cada pedido). Los que fallan siguen vencidos y con
    sus piezas apartadas: `order_service` los cuenta para los topes.
    """
    expired = _expired(now, settings, orders, customer_id)
    return _cancel_customer_listed(expired, now, orders, products, settings) if expired else CancelRun((), ())
