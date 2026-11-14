"""Agenda de entregas (regla 1): lapsos, anticipación, cupo por lapso y caducidad del pedido apartado.

Todo sale de `StoreSettings` (editable en el admin): los lapsos van del primer horario al último, de
`slot_minutes` en `slot_minutes`, con cupo de `max_orders_per_slot` pedidos que lo ocupan.

Anticipación por tipo de línea (`OrderLineKind`), una regla por tipo en un registro, sin `if/elif`:
- `design` ("Diseña tu pastel"): desde el día de hoy más `custom_lead_days` (2), cualquier lapso de ese día.
- `order` (encargo del catálogo, "encargado tal cual"): cualquier fecha; para hoy, desde la hora actual más
  `same_day_showcase_lead_hours` (2), es decir, el primer lapso que empieza después de esa hora. El pan del día lo
  revisa la creación del pedido.
- `showcase` (vitrina de hoy): solo hoy, desde el siguiente lapso.
Un pedido sigue la regla más estricta de sus líneas: el inicio más tarde y el último día más temprano. La vitrina de hoy
y un diseño no caben en el mismo pedido.

Ocupan un lapso los pedidos en `HOLDING_STATUSES` y los apartados (`awaiting_payment`) que aún no vencen: un apartado
vencido deja de ocupar lugar aunque la tarea que lo cancela todavía no haya corrido.

Se reserva hasta `PolicySettings.max_days_ahead` días adelante (60 propuestos; lo decidió el usuario el 14 de
noviembre de 2026). Un pedido sin pagar vence a los `PolicySettings.payment_window_minutes` (30 propuestos), y nunca
después de que empieza su lapso; con efectivo (tanda 2) el plazo se extenderá al cierre del día con
`cash_payment_due_at`.

Cambiar la cuadrícula (`slot_minutes`, el primer o el último horario) con pedidos futuros exige revisarlos: un pedido
conserva el lapso con que se creó, y un lapso que ya no está en la cuadrícula no se puede volver a elegir.
"""
from collections.abc import Collection
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from django.utils import timezone

from ...models import OrderLineKind, OrderStatus
from ...repositories import order_repo, settings_repo
from ...repositories.records import StoreSettingsRecord
from ..errors import DomainValidationError

HOLDING_STATUSES = (
    OrderStatus.RECEIVED,
    OrderStatus.IN_PREPARATION,
    OrderStatus.READY_FOR_DELIVERY,
    OrderStatus.AWAITING_QUOTE,
)
UNPAID_STATUS = OrderStatus.AWAITING_PAYMENT

TOO_SOON = "too_soon"
FULL = "full"

MIXED_MESSAGE = (
    "Lo de la vitrina de hoy se recoge hoy y lo demás de tu pedido no se puede entregar hoy. "
    "Haz un pedido para cada uno."
)
NO_ITEMS_MESSAGE = "Indica qué lleva tu pedido."


def too_far_message(days: int) -> str:
    return f"Por ahora tomamos pedidos hasta con {days} días de anticipación. Elige una fecha más cercana."


def latest_booking_date(now: datetime, policy) -> date:
    """El último día que se puede reservar."""
    return now.date() + timedelta(days=policy.max_days_ahead)


@dataclass(frozen=True)
class Slot:
    starts_at: time
    ends_at: time


def _add_minutes(moment: time, minutes: int) -> time:
    return (datetime.combine(date.min, moment) + timedelta(minutes=minutes)).time()


def slot_grid(store: StoreSettingsRecord) -> list[Slot]:
    """Los lapsos de un día, del primer horario al último (el último empieza a `last_slot_starts_at`)."""
    slots, start = [], store.first_slot_starts_at
    while start <= store.last_slot_starts_at:
        slots.append(Slot(start, _add_minutes(start, store.slot_minutes)))
        next_start = _add_minutes(start, store.slot_minutes)
        if next_start <= start:  # Pasaría la medianoche: el día ya no tiene más lapsos.
            break
        start = next_start
    return slots


@dataclass(frozen=True)
class LeadRule:
    """Desde qué momento se puede entregar y hasta qué día (`None`: sin límite)."""

    earliest: datetime
    latest_date: date | None

    def allows(self, on_date: date, starts_at: time) -> bool:
        start = datetime.combine(on_date, starts_at, tzinfo=self.earliest.tzinfo)
        return start >= self.earliest and (self.latest_date is None or on_date <= self.latest_date)


def _design_rule(now: datetime, store: StoreSettingsRecord) -> LeadRule:
    first_day = now.date() + timedelta(days=store.custom_lead_days)
    return LeadRule(datetime.combine(first_day, time.min, tzinfo=now.tzinfo), None)


def _order_rule(now: datetime, store: StoreSettingsRecord) -> LeadRule:
    return LeadRule(now + timedelta(hours=store.same_day_showcase_lead_hours), None)


def _showcase_rule(now: datetime, store: StoreSettingsRecord) -> LeadRule:
    return LeadRule(now, now.date())


LEAD_RULES = {
    OrderLineKind.DESIGN.value: _design_rule,
    OrderLineKind.ORDER.value: _order_rule,
    OrderLineKind.SHOWCASE.value: _showcase_rule,
}


def lead_rule(kinds: Collection[str], now: datetime, store: StoreSettingsRecord, field: str = "kind") -> LeadRule:
    """La regla del pedido: la más estricta de sus tipos de línea. `field` es el campo del error."""
    if not kinds:
        raise DomainValidationError({field: [NO_ITEMS_MESSAGE]})
    rules = [LEAD_RULES[kind](now, store) for kind in kinds]
    latest = [rule.latest_date for rule in rules if rule.latest_date is not None]
    combined = LeadRule(max(rule.earliest for rule in rules), min(latest, default=None))
    if combined.latest_date is not None and combined.earliest.date() > combined.latest_date:
        raise DomainValidationError({field: [MIXED_MESSAGE]})
    return combined


def earliest_date(rule: LeadRule, store: StoreSettingsRecord) -> date | None:
    """El primer día con algún lapso que la regla permite (sin contar el cupo); `None` si ya no hay."""
    grid = slot_grid(store)
    day = rule.earliest.date()
    if not any(rule.allows(day, slot.starts_at) for slot in grid):
        day += timedelta(days=1)
    return day if grid and (rule.latest_date is None or day <= rule.latest_date) else None


@dataclass(frozen=True)
class DaySlot:
    starts_at: time
    ends_at: time
    available: bool
    # `too_soon` (no alcanza la anticipación o ya pasó) o `full` ("Lleno"); `None` si se puede elegir.
    reason: str | None


@dataclass(frozen=True)
class DaySchedule:
    date: date
    earliest_date: date | None
    slots: tuple[DaySlot, ...]


def holding_filter(now: datetime) -> dict:
    """Los argumentos de conteo de `order_repo`: qué pedidos ocupan un lapso en este momento."""
    return {"holding_statuses": HOLDING_STATUSES, "unpaid_status": UNPAID_STATUS, "now": now}


def bakery_now() -> datetime:
    """La hora de la pastelería (Ciudad de México, por `TIME_ZONE`)."""
    return timezone.localtime()


def day_schedule(
    on_date: date,
    kinds: Collection[str],
    *,
    now: datetime | None = None,
    settings=settings_repo,
    orders=order_repo,
) -> DaySchedule:
    """Los lapsos de un día para un pedido con esos tipos de línea, con su disponibilidad."""
    now = now or bakery_now()
    store = settings.get_store_settings()
    policy = settings.get_policy_settings()
    if on_date > latest_booking_date(now, policy):
        raise DomainValidationError({"date": [too_far_message(policy.max_days_ahead)]})
    rule = lead_rule(kinds, now, store)
    counts = orders.count_orders_by_slot(on_date, **holding_filter(now))
    slots = []
    for slot in slot_grid(store):
        reasons = [
            reason
            for reason, applies in (
                (TOO_SOON, not rule.allows(on_date, slot.starts_at)),
                (FULL, counts.get(slot.starts_at, 0) >= store.max_orders_per_slot),
            )
            if applies
        ]
        slots.append(DaySlot(slot.starts_at, slot.ends_at, not reasons, reasons[0] if reasons else None))
    return DaySchedule(on_date, earliest_date(rule, store), tuple(slots))


def find_slot(
    on_date: date, starts_at: time, rule: LeadRule, store: StoreSettingsRecord, latest: date | None = None, policy=None
) -> Slot:
    """El lapso elegido si existe, la anticipación lo permite y no pasa del último día que se reserva (`latest`)."""
    if latest is not None and on_date > latest:
        raise DomainValidationError({"delivery_date": [too_far_message(policy.max_days_ahead)]})
    slot = next((slot for slot in slot_grid(store) if slot.starts_at == starts_at), None)
    if slot is None:
        raise DomainValidationError({"slot_starts_at": ["Ese horario no existe. Elige uno de la lista."]})
    if not rule.allows(on_date, starts_at):
        raise DomainValidationError(
            {"delivery_date": ["Tu pedido no alcanza la anticipación para esa fecha y hora. Elige otra."]}
        )
    return slot


def slot_start(on_date: date, slot: Slot, now: datetime) -> datetime:
    return datetime.combine(on_date, slot.starts_at, tzinfo=now.tzinfo)


def payment_due_at(now: datetime, starts: datetime, policy) -> datetime:
    """Hasta cuándo se puede pagar un pedido sin pagar: `payment_window_minutes` desde ahora, nunca después de que
    empieza su lapso (D63, decisión del usuario del 14 de noviembre de 2026)."""
    return min(now + timedelta(minutes=policy.payment_window_minutes), starts)


def cash_payment_due_at(now: datetime, starts: datetime, store: StoreSettingsRecord) -> datetime:
    """Para la tanda 2: al elegir efectivo, el plazo se extiende al cierre del día (regla 10), el de mañana si ya
    cerró, y tampoco pasa del inicio del lapso."""
    closing = datetime.combine(now.date(), store.store_closes_at, tzinfo=now.tzinfo)
    return min(closing if now < closing else closing + timedelta(days=1), starts)
