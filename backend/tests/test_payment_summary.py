"""Anticipo y lo que se paga hoy (regla 10) con repositorios en memoria, sin PostgreSQL."""
import dataclasses
from decimal import Decimal

import pytest

from core_pasteleria.repositories.memory import MemorySettingsRepo
from core_pasteleria.services import payment_summary as service
from core_pasteleria.services.pricing_service import PriceBreakdown
from core_pasteleria.services.warranty_service import StandDeposit
from tests import memory_cake_design as data


def settings_with(percent):
    base = data.settings_repo()
    return MemorySettingsRepo(
        base.get_store_settings(),
        base.get_cake_design_settings(),
        dataclasses.replace(base.get_policy_settings(), advance_percent=percent),
        base.get_upload_settings(),
        base.list_stand_sizes(active_only=False),
    )


def test_rule_10_example_pays_700_today_with_the_base_and_delivery():
    # Pedido $1,000 + base $150 + envío $80: hoy $730 (500 + 150 + 80); el día de la entrega, $500.
    summary = service.payment_summary(Decimal("1000"), Decimal("150"), Decimal("80"), settings=data.settings_repo())
    assert (summary.advance, summary.pay_today, summary.pay_on_delivery) == (Decimal("500.00"), Decimal("730.00"), Decimal("500.00"))


def test_the_base_and_the_delivery_do_not_enter_the_advance():
    summary = service.payment_summary(Decimal("1000"), Decimal("200"), settings=data.settings_repo())
    assert summary.advance == Decimal("500.00")
    assert summary.pay_today == Decimal("700.00")
    assert summary.pay_on_delivery == Decimal("500.00")


def test_the_advance_rounds_half_up_to_the_cent_and_the_rest_completes_the_order():
    summary = service.payment_summary(Decimal("1000.01"), settings=data.settings_repo())
    assert summary.advance == Decimal("500.01")
    assert summary.advance + summary.pay_on_delivery == Decimal("1000.01")
    odd = service.payment_summary(Decimal("0.05"), settings=settings_with(50))
    assert odd.advance == Decimal("0.03")


@pytest.mark.parametrize("percent, advance", [(30, "300.00"), (100, "1000.00"), (1, "10.00")])
def test_the_percent_comes_from_the_settings_not_from_the_code(percent, advance):
    summary = service.payment_summary(Decimal("1000"), settings=settings_with(percent))
    assert (summary.advance_percent, summary.advance) == (percent, Decimal(advance))
    assert summary.pay_on_delivery == Decimal("1000") - Decimal(advance)


def breakdown(requires_quote):
    total = Decimal("3825.00")
    return PriceBreakdown(Decimal("255.00"), 15, total, Decimal("0.00"), Decimal("0.00"), total, requires_quote)


def test_a_design_that_waits_for_a_quote_charges_nothing():
    stand = StandDeposit(stand=None, deposit=Decimal("200.00"), return_days=15)
    assert service.payment_for_design(breakdown(True), stand, settings=data.settings_repo()) is None


def test_a_design_pays_its_advance_plus_the_stand_deposit():
    stand = StandDeposit(stand=None, deposit=Decimal("200.00"), return_days=15)
    summary = service.payment_for_design(breakdown(False), stand, settings=data.settings_repo())
    assert (summary.advance, summary.base_deposit, summary.pay_today, summary.pay_on_delivery) == (
        Decimal("1912.50"), Decimal("200.00"), Decimal("2112.50"), Decimal("1912.50"),
    )
