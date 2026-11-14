"""Transiciones del estado del pedido (sección 12; D63, ronda 1).

El personal cambia el estado desde el registro básico del pedido en el admin, sin pantallas nuevas (decisión del
usuario del 14 de noviembre de 2026): así registra el cobro en efectivo (`awaiting_payment` -> `received`) y avanza el
pedido hasta entregarlo. Solo se permiten las transiciones de `ALLOWED_TRANSITIONS`. El Observer de la tanda 2
reaccionará a cada cambio.

Faltan a propósito:
- `cancelled`: cancelar debe reintegrar la vitrina y el pan (`InventoryObserver`, tanda 2); hasta entonces no se
  cancela desde el admin.
- La salida de `awaiting_quote`: las reglas no la definen (sección 14).
"""
from dataclasses import dataclass
from datetime import datetime

from django.utils import timezone

from ...models import OrderStatus
from ...repositories import order_repo
from ..audit import audit_operation
from ..errors import DomainValidationError

ALLOWED_TRANSITIONS: dict[str, tuple[str, ...]] = {
    OrderStatus.AWAITING_PAYMENT: (OrderStatus.RECEIVED,),
    OrderStatus.RECEIVED: (OrderStatus.IN_PREPARATION,),
    OrderStatus.IN_PREPARATION: (OrderStatus.READY_FOR_DELIVERY,),
    OrderStatus.READY_FOR_DELIVERY: (OrderStatus.DELIVERED,),
    OrderStatus.DELIVERED: (),
    OrderStatus.CANCELLED: (),
    OrderStatus.AWAITING_QUOTE: (),
}

NOT_ALLOWED_MESSAGE = "Ese cambio de estado no se puede hacer desde aquí."
STALE_MESSAGE = "El pedido cambió mientras lo editabas. Vuelve a abrirlo."


class StatusChangeError(DomainValidationError):
    """El cambio de estado no se permite o el pedido ya cambió."""


@dataclass(frozen=True)
class StatusChange:
    order_id: int
    actor_id: int
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


@audit_operation(expected_errors=(DomainValidationError,), describe=_describe)
def change_status(
    order_id: int, current: str, new: str, *, actor_id: int, orders=order_repo, now: datetime | None = None
) -> StatusChange:
    """Pasa el pedido de `current` a `new` si la transición se permite y nadie lo cambió antes."""
    if new not in next_statuses(current):
        raise StatusChangeError({"status": [NOT_ALLOWED_MESSAGE]})
    if not orders.change_status(order_id, current, new, now or timezone.now()):
        raise StatusChangeError({"status": [STALE_MESSAGE]})
    return StatusChange(order_id, actor_id, current, new)
