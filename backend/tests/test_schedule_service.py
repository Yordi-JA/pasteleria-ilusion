"""Agenda de entregas (regla 1): lapsos, anticipación por tipo de línea, cupo y caducidad del apartado.

Sin PostgreSQL: la configuración y los conteos llegan por parámetro.
"""
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest

from core_pasteleria.services.errors import DomainValidationError
from core_pasteleria.services.orders import schedule_service
from tests import memory_cake_design as data

CDMX = ZoneInfo("America/Mexico_City")
TODAY = date(2026, 11, 13)
STORE = data.STORE_SETTINGS
POLICY = data.settings_repo().get_policy_settings()


def at(hour, minute=0, day=TODAY):
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=CDMX)


def test_the_grid_has_30_minute_slots_from_the_first_to_the_last():
    grid = schedule_service.slot_grid(STORE)
    assert len(grid) == 24
    assert (grid[0].starts_at, grid[0].ends_at) == (time(10, 30), time(11, 0))
    assert (grid[-1].starts_at, grid[-1].ends_at) == (time(22, 0), time(22, 30))


def test_a_design_needs_two_days():
    rule = schedule_service.lead_rule({"design"}, at(15, 10), STORE, POLICY)
    assert not rule.allows(date(2026, 11, 14), time(22, 0))
    assert rule.allows(date(2026, 11, 15), time(10, 30))


@pytest.mark.parametrize(
    "now, first_today",
    [(at(15, 10), time(17, 30)), (at(15, 0), time(17, 0)), (at(10, 0), time(12, 0))],
)
def test_a_catalog_order_for_today_is_now_plus_two_hours_rounded_up_to_the_next_slot(now, first_today):
    rule = schedule_service.lead_rule({"order"}, now, STORE, POLICY)
    grid = schedule_service.slot_grid(STORE)
    allowed = [slot.starts_at for slot in grid if rule.allows(TODAY, slot.starts_at)]
    assert allowed[0] == first_today
    assert rule.allows(date(2026, 11, 14), time(10, 30))


def test_the_showcase_is_only_today_from_the_first_slot_that_leaves_time_to_pay():
    # Ronda 2: el lapso empieza por lo menos `payment_window_minutes` (30) después de ahora; antes era el siguiente.
    rule = schedule_service.lead_rule({"showcase"}, at(15, 10), STORE, POLICY)
    assert not rule.allows(TODAY, time(15, 30))
    assert rule.allows(TODAY, time(16, 0))
    assert not rule.allows(date(2026, 11, 14), time(10, 30))


def test_a_mixed_order_follows_its_strictest_line():
    rule = schedule_service.lead_rule({"showcase", "order"}, at(15, 10), STORE, POLICY)
    assert not rule.allows(TODAY, time(17, 0))
    assert rule.allows(TODAY, time(17, 30))
    mixed = schedule_service.lead_rule({"order", "design"}, at(15, 10), STORE, POLICY)
    assert mixed.allows(date(2026, 11, 15), time(10, 30))


def test_showcase_and_design_cannot_share_an_order():
    with pytest.raises(DomainValidationError) as error:
        schedule_service.lead_rule({"showcase", "design"}, at(15, 10), STORE, POLICY, field="items")
    assert "hoy" in error.value.errors["items"][0]


def test_without_kinds_there_is_no_rule():
    with pytest.raises(DomainValidationError):
        schedule_service.lead_rule(set(), at(15, 10), STORE, POLICY)


def test_find_slot_rejects_a_time_outside_the_grid_and_one_too_soon():
    rule = schedule_service.lead_rule({"design"}, at(15, 10), STORE, POLICY)
    assert schedule_service.find_slot(date(2026, 11, 15), time(10, 30), rule, STORE).ends_at == time(11, 0)
    with pytest.raises(DomainValidationError) as outside:
        schedule_service.find_slot(date(2026, 11, 15), time(10, 45), rule, STORE)
    assert "slot_starts_at" in outside.value.errors
    with pytest.raises(DomainValidationError) as soon:
        schedule_service.find_slot(date(2026, 11, 14), time(10, 30), rule, STORE)
    assert "delivery_date" in soon.value.errors


def test_an_unpaid_order_is_due_in_30_minutes_but_never_after_its_slot():
    policy = data.settings_repo().get_policy_settings()
    assert policy.payment_window_minutes == 30
    assert schedule_service.payment_due_at(at(15, 10), at(15, 0, day=date(2026, 11, 15)), policy) == at(15, 40)
    assert schedule_service.payment_due_at(at(15, 10), at(15, 30), policy) == at(15, 30)


def test_cash_will_be_due_at_closing_today_or_tomorrow():
    tomorrow = date(2026, 11, 14)
    far = at(15, 0, day=date(2026, 11, 20))
    assert schedule_service.cash_payment_due_at(at(15, 10), far, STORE) == at(22, 30)
    assert schedule_service.cash_payment_due_at(at(22, 40), far, STORE) == at(22, 30, day=tomorrow)


# --- Calendario: un rango de días con sus lapsos (D66, decisión C del usuario) ---


class DayCounts:
    """Conteos por día y lapso, como los daría `order_repo.count_orders_by_date_and_slot`."""

    def __init__(self, counts=None):
        self.counts = counts or {}
        self.asked = []

    def count_orders_by_date_and_slot(self, start, end, **kwargs):
        self.asked.append((start, end, kwargs))
        return self.counts


def calendar(start, end, kinds, now=None, counts=None):
    return schedule_service.calendar_schedule(
        start, end, kinds, now=now or at(15, 10), settings=data.settings_repo(), orders=counts or DayCounts()
    )


def test_the_calendar_gives_each_day_with_its_slots_in_one_query():
    counts = DayCounts({(date(2026, 11, 16), time(15, 0)): 3})
    month = calendar(date(2026, 11, 1), date(2026, 11, 30), {"design"}, counts=counts)
    assert [day.date for day in month.days] == [date(2026, 11, d) for d in range(1, 31)]
    assert len(counts.asked) == 1 and counts.asked[0][:2] == (date(2026, 11, 1), date(2026, 11, 30))
    by_date = {day.date: day for day in month.days}
    # Antes de hoy más dos días: no alcanza la anticipación, sin lapsos que mostrar.
    assert (by_date[date(2026, 11, 14)].available, by_date[date(2026, 11, 14)].reason) == (False, "too_soon")
    assert by_date[date(2026, 11, 14)].slots == ()
    first = by_date[date(2026, 11, 15)]
    assert (first.available, first.reason, len(first.slots)) == (True, None, 24)
    slot = {s.starts_at: s for s in by_date[date(2026, 11, 16)].slots}[time(15, 0)]
    assert (slot.available, slot.reason) == (False, "full")
    assert month.earliest_date == date(2026, 11, 15)
    assert month.latest_date == date(2027, 1, 12)


def test_a_day_with_every_slot_full_is_full():
    full_day = {(date(2026, 11, 20), slot.starts_at): 3 for slot in schedule_service.slot_grid(STORE)}
    month = calendar(date(2026, 11, 19), date(2026, 11, 21), {"design"}, counts=DayCounts(full_day))
    by_date = {day.date: day for day in month.days}
    assert (by_date[date(2026, 11, 20)].available, by_date[date(2026, 11, 20)].reason) == (False, "full")
    assert all(slot.reason == "full" for slot in by_date[date(2026, 11, 20)].slots)
    assert by_date[date(2026, 11, 21)].available


def test_today_with_some_slots_too_soon_and_the_rest_full_is_full():
    # Un encargo para hoy a las 15:10 empieza a las 17:30; de ahí al cierre, todo lleno.
    rest = {(TODAY, slot.starts_at): 3 for slot in schedule_service.slot_grid(STORE) if slot.starts_at >= time(17, 30)}
    today = calendar(TODAY, TODAY, {"order"}, counts=DayCounts(rest)).days[0]
    assert (today.available, today.reason) == (False, "full")
    reasons = {slot.starts_at: slot.reason for slot in today.slots}
    assert (reasons[time(17, 0)], reasons[time(17, 30)]) == ("too_soon", "full")


def test_days_past_the_booking_window_are_too_far():
    month = calendar(date(2027, 1, 1), date(2027, 1, 31), {"order"})
    by_date = {day.date: day for day in month.days}
    assert by_date[date(2027, 1, 12)].available
    assert (by_date[date(2027, 1, 13)].available, by_date[date(2027, 1, 13)].reason) == (False, "too_far")
    assert by_date[date(2027, 1, 13)].slots == ()


def test_the_showcase_calendar_only_offers_today():
    week = calendar(TODAY, date(2026, 11, 15), {"showcase"})
    assert [(day.available, day.reason) for day in week.days] == [(True, None), (False, "too_far"), (False, "too_far")]
    assert week.earliest_date == TODAY


def test_the_calendar_takes_at_most_42_days_in_order():
    assert len(calendar(date(2026, 11, 1), date(2026, 12, 12), {"order"}).days) == 42
    with pytest.raises(DomainValidationError) as too_long:
        calendar(date(2026, 11, 1), date(2026, 12, 13), {"order"})
    assert too_long.value.errors == {"end": ["Pide como mucho 42 días a la vez."]}
    with pytest.raises(DomainValidationError) as backwards:
        calendar(date(2026, 11, 2), date(2026, 11, 1), {"order"})
    assert backwards.value.errors == {"end": ["La fecha final va después de la inicial."]}


def test_the_calendar_refuses_showcase_with_design():
    with pytest.raises(DomainValidationError) as error:
        calendar(TODAY, TODAY, {"showcase", "design"})
    assert error.value.errors == {"kind": [schedule_service.MIXED_MESSAGE]}


def test_the_calendar_marks_too_soon_and_full_slots():
    counts = DayCounts({(TODAY, time(17, 30)): 3, (TODAY, time(18, 0)): 2})
    today = calendar(TODAY, TODAY, {"order"}, counts=counts)
    by_start = {slot.starts_at: slot for slot in today.days[0].slots}
    assert (by_start[time(17, 0)].available, by_start[time(17, 0)].reason) == (False, "too_soon")
    assert (by_start[time(17, 30)].available, by_start[time(17, 30)].reason) == (False, "full")
    assert (by_start[time(18, 0)].available, by_start[time(18, 0)].reason) == (True, None)
    assert today.earliest_date == TODAY
    # Cuenta como ocupado lo activo y lo apartado que aún no vence.
    kwargs = counts.asked[0][2]
    assert kwargs["unpaid_status"] == "awaiting_payment"
    assert "received" in kwargs["holding_statuses"]
    assert "cancelled" not in kwargs["holding_statuses"]
    assert "awaiting_quote" not in kwargs["holding_statuses"]


def test_the_earliest_date_skips_a_day_without_slots_left():
    late = calendar(TODAY, TODAY, {"order"}, now=at(21, 0))
    assert late.earliest_date == date(2026, 11, 14)
    assert (late.days[0].available, late.days[0].reason) == (False, "too_soon")
    showcase = calendar(TODAY, TODAY, {"showcase"}, now=at(22, 10))
    assert showcase.earliest_date is None
    assert not showcase.days[0].available
