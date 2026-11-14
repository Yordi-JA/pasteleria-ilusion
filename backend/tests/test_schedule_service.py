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


def at(hour, minute=0, day=TODAY):
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=CDMX)


class Counts:
    """Conteos de pedidos por lapso, como los daría `order_repo.count_orders_by_slot`."""

    def __init__(self, counts=None):
        self.counts = counts or {}
        self.asked = None

    def count_orders_by_slot(self, on_date, **kwargs):
        self.asked = (on_date, kwargs)
        return self.counts


def test_the_grid_has_30_minute_slots_from_the_first_to_the_last():
    grid = schedule_service.slot_grid(STORE)
    assert len(grid) == 24
    assert (grid[0].starts_at, grid[0].ends_at) == (time(10, 30), time(11, 0))
    assert (grid[-1].starts_at, grid[-1].ends_at) == (time(22, 0), time(22, 30))


def test_a_design_needs_two_days():
    rule = schedule_service.lead_rule({"design"}, at(15, 10), STORE)
    assert not rule.allows(date(2026, 11, 14), time(22, 0))
    assert rule.allows(date(2026, 11, 15), time(10, 30))


@pytest.mark.parametrize(
    "now, first_today",
    [(at(15, 10), time(17, 30)), (at(15, 0), time(17, 0)), (at(10, 0), time(12, 0))],
)
def test_a_catalog_order_for_today_is_now_plus_two_hours_rounded_up_to_the_next_slot(now, first_today):
    rule = schedule_service.lead_rule({"order"}, now, STORE)
    grid = schedule_service.slot_grid(STORE)
    allowed = [slot.starts_at for slot in grid if rule.allows(TODAY, slot.starts_at)]
    assert allowed[0] == first_today
    assert rule.allows(date(2026, 11, 14), time(10, 30))


def test_the_showcase_is_only_today_from_the_next_slot():
    rule = schedule_service.lead_rule({"showcase"}, at(15, 10), STORE)
    assert not rule.allows(TODAY, time(15, 0))
    assert rule.allows(TODAY, time(15, 30))
    assert not rule.allows(date(2026, 11, 14), time(10, 30))


def test_a_mixed_order_follows_its_strictest_line():
    rule = schedule_service.lead_rule({"showcase", "order"}, at(15, 10), STORE)
    assert not rule.allows(TODAY, time(17, 0))
    assert rule.allows(TODAY, time(17, 30))
    assert schedule_service.lead_rule({"order", "design"}, at(15, 10), STORE).allows(date(2026, 11, 15), time(10, 30))


def test_showcase_and_design_cannot_share_an_order():
    with pytest.raises(DomainValidationError) as error:
        schedule_service.lead_rule({"showcase", "design"}, at(15, 10), STORE, field="items")
    assert "hoy" in error.value.errors["items"][0]


def test_without_kinds_there_is_no_rule():
    with pytest.raises(DomainValidationError):
        schedule_service.lead_rule(set(), at(15, 10), STORE)


def test_the_day_schedule_marks_too_soon_and_full_slots():
    counts = Counts({time(17, 30): 3, time(18, 0): 2})
    schedule = schedule_service.day_schedule(
        TODAY, {"order"}, now=at(15, 10), settings=data.settings_repo(), orders=counts
    )
    by_start = {slot.starts_at: slot for slot in schedule.slots}
    assert (by_start[time(17, 0)].available, by_start[time(17, 0)].reason) == (False, "too_soon")
    assert (by_start[time(17, 30)].available, by_start[time(17, 30)].reason) == (False, "full")
    assert (by_start[time(18, 0)].available, by_start[time(18, 0)].reason) == (True, None)
    assert schedule.earliest_date == TODAY
    # Cuenta como ocupado lo activo y lo apartado que aún no vence.
    assert counts.asked[0] == TODAY
    assert counts.asked[1]["unpaid_status"] == "awaiting_payment"
    assert "received" in counts.asked[1]["holding_statuses"]
    assert "cancelled" not in counts.asked[1]["holding_statuses"]


def test_the_earliest_date_skips_a_day_without_slots_left():
    late = schedule_service.day_schedule(TODAY, {"order"}, now=at(21, 0), settings=data.settings_repo(), orders=Counts())
    assert late.earliest_date == date(2026, 11, 14)
    showcase = schedule_service.day_schedule(
        TODAY, {"showcase"}, now=at(22, 10), settings=data.settings_repo(), orders=Counts()
    )
    assert showcase.earliest_date is None
    assert not any(slot.available for slot in showcase.slots)


def test_find_slot_rejects_a_time_outside_the_grid_and_one_too_soon():
    rule = schedule_service.lead_rule({"design"}, at(15, 10), STORE)
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


def test_a_date_past_the_booking_window_is_refused():
    schedule = schedule_service.day_schedule(
        date(2027, 1, 12), {"design"}, now=at(15, 10), settings=data.settings_repo(), orders=Counts()
    )
    assert schedule.slots
    with pytest.raises(DomainValidationError) as error:
        schedule_service.day_schedule(
            date(2027, 1, 13), {"design"}, now=at(15, 10), settings=data.settings_repo(), orders=Counts()
        )
    assert "60 días" in error.value.errors["date"][0]
