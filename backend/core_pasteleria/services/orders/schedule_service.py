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
y un diseño no caben en el mismo pedido. Además, el lapso empieza por lo menos `payment_window_minutes` después de ahora
(D63, ronda 2): el plazo para pagar nunca queda recortado por el inicio del lapso, así que siempre hay tiempo de pagar.

Ocupan un lapso los pedidos en `HOLDING_STATUSES` y los apartados (`awaiting_payment`) que aún no vencen: un apartado
vencido deja de ocupar lugar aunque la tarea que lo cancela todavía no haya corrido. Un pedido en pausa por cotización
no ocupa lapso (lo decidió el usuario el 14 de noviembre de 2026): el cupo se revisa al ponerle precio.

El calendario (`calendar_schedule`, D66) da un rango de hasta `MAX_CALENDAR_DAYS` días, cada uno con sus lapsos y su motivo:
`too_soon`, `full` ("Lleno") o `too_far` (después del último día que se reserva para el pedido).

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
)
UNPAID_STATUS = OrderStatus.AWAITING_PAYMENT

TOO_SOON = "too_soon"
FULL = "full"
# Un día del calendario después del último que se reserva para el pedido (D66).
TOO_FAR = "too_far"

# Días por consulta del calendario: un mes visible con sus semanas (6 x 7). Tope técnico, no regla de negocio.
MAX_CALENDAR_DAYS = 42
BACKWARDS_RANGE_MESSAGE = "La fecha final va después de la inicial."
TOO_LONG_RANGE_MESSAGE = f"Pide como mucho {MAX_CALENDAR_DAYS} días a la vez."

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


def lead_rule(
    kinds: Collection[str], now: datetime, store: StoreSettingsRecord, policy, field: str = "kind"
) -> LeadRule:
    """La regla del pedido: la más estricta de sus tipos de línea, y nunca antes de que se cumpla el plazo para pagar.
    `field` es el campo del error."""
    if not kinds:
        raise DomainValidationError({field: [NO_ITEMS_MESSAGE]})
    rules = [LEAD_RULES[kind](now, store) for kind in kinds]
    latest = [rule.latest_date for rule in rules if rule.latest_date is not None]
    time_to_pay = now + timedelta(minutes=policy.payment_window_minutes)
    combined = LeadRule(max(time_to_pay, *(rule.earliest for rule in rules)), min(latest, default=None))
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
class CalendarDay:
    date: date
    # Si tiene algún lapso que se puede elegir; si no, `reason`: `too_soon`, `full` o `too_far`.
    available: bool
    reason: str | None
    # Vacío en los días `too_soon` y `too_far`: ninguno de sus lapsos se puede elegir y no hace falta mandarlos.
    slots: tuple[DaySlot, ...]


@dataclass(frozen=True)
class CalendarSchedule:
    start: date
    end: date
    earliest_date: date | None
    # El último día que se reserva para este pedido: `max_days_ahead`, o hoy si lleva la vitrina de hoy.
    latest_date: date
    days: tuple[CalendarDay, ...]


def holding_filter(now: datetime) -> dict:
    """Los argumentos de conteo de `order_repo`: qué pedidos ocupan un lapso en este momento."""
    return {"holding_statuses": HOLDING_STATUSES, "unpaid_status": UNPAID_STATUS, "now": now}


def bakery_now() -> datetime:
    """La hora de la pastelería (Ciudad de México, por `TIME_ZONE`)."""
    return timezone.localtime()


def _day_slots(on_date: date, rule: LeadRule, grid: list[Slot], counts: dict, limit: int) -> tuple[DaySlot, ...]:
    """Los lapsos de un día con su disponibilidad: primero la anticipación, después el cupo."""
    slots = []
    for slot in grid:
        reasons = [
            reason
            for reason, applies in (
                (TOO_SOON, not rule.allows(on_date, slot.starts_at)),
                (FULL, counts.get((on_date, slot.starts_at), 0) >= limit),
            )
            if applies
        ]
        slots.append(DaySlot(slot.starts_at, slot.ends_at, not reasons, reasons[0] if reasons else None))
    return tuple(slots)


def _calendar_day(on_date: date, latest: date, slots: tuple[DaySlot, ...]) -> CalendarDay:
    """Un día del calendario: elegible si algún lapso lo es; si no, el motivo que lo explica."""
    if on_date > latest:
        return CalendarDay(on_date, False, TOO_FAR, ())
    if any(slot.available for slot in slots):
        return CalendarDay(on_date, True, None, slots)
    if all(slot.reason == TOO_SOON for slot in slots):
        return CalendarDay(on_date, False, TOO_SOON, ())
    return CalendarDay(on_date, False, FULL, slots)


def calendar_schedule(
    start: date,
    end: date,
    kinds: Collection[str],
    *,
    now: datetime | None = None,
    settings=settings_repo,
    orders=order_repo,
) -> CalendarSchedule:
    """El calendario de un pedido con esos tipos de línea (D66, decisión C del usuario): cada día de `start` a `end`
    con sus lapsos y su disponibilidad, contando los pedidos de todo el rango en una sola consulta. Como mucho
    `MAX_CALENDAR_DAYS` días por consulta."""
    if end < start:
        raise DomainValidationError({"end": [BACKWARDS_RANGE_MESSAGE]})
    if (end - start).days + 1 > MAX_CALENDAR_DAYS:
        raise DomainValidationError({"end": [TOO_LONG_RANGE_MESSAGE]})
    now = now or bakery_now()
    store = settings.get_store_settings()
    policy = settings.get_policy_settings()
    rule = lead_rule(kinds, now, store, policy)
    latest = min(filter(None, (latest_booking_date(now, policy), rule.latest_date)))
    grid = slot_grid(store)
    counts = orders.count_orders_by_date_and_slot(start, end, **holding_filter(now))
    days = []
    for offset in range((end - start).days + 1):
        on_date = start + timedelta(days=offset)
        slots = _day_slots(on_date, rule, grid, counts, store.max_orders_per_slot) if on_date <= latest else ()
        days.append(_calendar_day(on_date, latest, slots))
    # Si el admin deja reservar menos días que la anticipación del pedido, no hay fecha más cercana.
    earliest = earliest_date(rule, store)
    return CalendarSchedule(start, end, earliest if earliest is not None and earliest <= latest else None, latest, tuple(days))


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


def starts_at(on_date: date, start: time, now: datetime) -> datetime:
    """El momento en que empieza un lapso, en la zona de `now` (la de la pastelería)."""
    return datetime.combine(on_date, start, tzinfo=now.tzinfo)


def slot_start(on_date: date, slot: Slot, now: datetime) -> datetime:
    return starts_at(on_date, slot.starts_at, now)


def payment_due_at(now: datetime, starts: datetime, policy) -> datetime:
    """Hasta cuándo se puede pagar un pedido sin pagar: `payment_window_minutes` desde ahora, nunca después de que
    empieza su lapso (D63, decisión del usuario del 14 de noviembre de 2026)."""
    return min(now + timedelta(minutes=policy.payment_window_minutes), starts)


def cash_payment_due_at(now: datetime, starts: datetime, store: StoreSettingsRecord) -> datetime:
    """El cierre del día (regla 10), el de mañana si ya cerró, sin pasar del inicio del lapso. Ya fija el plazo de una
    cotización con precio (`quote_service`, decisión del usuario de la revisión de la ronda 2); en la tanda 2 también
    extenderá el de un apartado al elegir efectivo."""
    closing = datetime.combine(now.date(), store.store_closes_at, tzinfo=now.tzinfo)
    return min(closing if now < closing else closing + timedelta(days=1), starts)
