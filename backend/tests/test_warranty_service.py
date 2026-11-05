"""Depósito de la base por kilos (regla 7) con repositorios en memoria, sin PostgreSQL."""
from decimal import Decimal

import pytest

from core_pasteleria.services.warranty_service import StandNotFoundError, get_stand_deposit
from tests import memory_cake_design as data


def deposit(kg, stands=None):
    return get_stand_deposit(kg, settings=data.settings_repo(stands=stands))


# Cada tramo de la tabla 7 y sus bordes; la regla de "la siguiente base más
# grande" cubre 9, 13 a 14 y 16 a 19 kg.
@pytest.mark.parametrize(
    ("kg", "amount", "stand_range"),
    [
        (4, "70", (4, 5)), (5, "70", (4, 5)),
        (6, "90", (6, 8)), (8, "90", (6, 8)),
        (9, "150", (10, 12)),
        (10, "150", (10, 12)), (12, "150", (10, 12)),
        (13, "200", (15, 15)), (14, "200", (15, 15)), (15, "200", (15, 15)),
        (16, "250", (20, 25)), (19, "250", (20, 25)),
        (20, "250", (20, 25)), (25, "250", (20, 25)),
        (26, "300", (26, 30)), (30, "300", (26, 30)),
        (31, "350", (31, 35)), (35, "350", (31, 35)),
        (36, "400", (36, 40)), (40, "400", (36, 40)),
        (41, "450", (41, 45)), (45, "450", (41, 45)),
        (46, "500", (46, 50)), (50, "500", (46, 50)),
    ],
)
def test_deposit_by_kilos_follows_rule_7(kg, amount, stand_range):
    result = deposit(kg)
    assert result.deposit == Decimal(amount)
    assert (result.stand.min_kg, result.stand.max_kg) == stand_range


@pytest.mark.parametrize("kg", [-5, 0, 1, 3])
def test_below_the_smallest_stand_there_is_no_stand_and_no_deposit(kg):
    # El precio rechaza esos kilos con su propio mensaje; aquí solo no hay base.
    result = deposit(kg)
    assert result.stand is None
    assert result.deposit == Decimal("0.00")


def test_kilos_beyond_the_table_raise_an_explicit_error():
    with pytest.raises(StandNotFoundError) as raised:
        deposit(51)
    assert raised.value.errors == {"kg": ["No hay una base para 51 kg. Escríbenos por WhatsApp."]}


def test_an_inactive_stand_is_skipped_for_the_next_bigger_one():
    stands = [s if s.max_kg != 12 else data.stand(10, 12, "150", active=False) for s in data.STANDS]
    assert deposit(10, stands).deposit == Decimal("200")
    assert deposit(9, stands).stand.max_kg == 15


def test_an_inactive_smallest_stand_does_not_drop_the_deposit():
    """4 kg sigue llevando base aunque se desactive la de 4 a 5: toca la siguiente."""
    stands = [s if s.max_kg != 5 else data.stand(4, 5, "70", active=False) for s in data.STANDS]
    assert deposit(4, stands).deposit == Decimal("90")
    assert deposit(3, stands).stand is None


def test_without_stands_any_order_with_kilos_raises():
    with pytest.raises(StandNotFoundError):
        deposit(10, stands=[])


@pytest.mark.parametrize("kg", [Decimal("4.5"), 4.0, True, "10"])
def test_kilos_must_be_a_whole_number(kg):
    with pytest.raises(ValueError):
        deposit(kg)
