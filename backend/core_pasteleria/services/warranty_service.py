"""Préstamo de bases: depósito, retención y reembolso."""
from dataclasses import dataclass, replace
from decimal import Decimal

from ..repositories import settings_repo
from ..repositories.records import CakeDesignSettingsRecord, StandSizeRecord
from .errors import DomainValidationError

NO_DEPOSIT = Decimal("0.00")


class StandNotFoundError(DomainValidationError):
    """Ningún tamaño de base activo cubre esos kilos."""


@dataclass(frozen=True)
class StandDeposit:
    """Base que toca a un pedido y su depósito. Sin base, `stand` es `None` y el depósito $0."""

    stand: StandSizeRecord | None
    deposit: Decimal
    # Días para devolver la base y recuperar el depósito (`PolicySettings.stand_return_days`).
    return_days: int


def get_stand_deposit(kg: int, settings=settings_repo) -> StandDeposit:
    """Depósito de la base para `kg` kilos (regla 7).

    Toca el tamaño activo con el `max_kg` más chico que alcance los kilos: un
    pastel entre dos rangos usa la siguiente base más grande, nunca una más
    chica. Por debajo del `min_kg` más chico de toda la tabla (4 kg en la
    semilla) no hay base ni depósito; se cuentan también los tamaños inactivos,
    para que desactivar la base más chica no deje sin depósito a un pastel de
    esos kilos. Si ningún tamaño activo alcanza los kilos, falla: nunca se
    inventa un depósito.
    """
    if isinstance(kg, bool) or not isinstance(kg, int):
        raise ValueError("Los kilos deben ser un número entero.")
    return_days = settings.get_policy_settings().stand_return_days
    stands = settings.list_stand_sizes(active_only=False)
    # Kilos de 0 o negativos también quedan "por debajo": el precio los
    # rechaza con su propio mensaje, y aquí no se inventa un error más.
    if stands and kg < min(stand.min_kg for stand in stands):
        return StandDeposit(stand=None, deposit=NO_DEPOSIT, return_days=return_days)
    stand = next((s for s in stands if s.is_active and s.max_kg >= kg), None)
    if stand is None:
        raise StandNotFoundError(
            {"kg": [f"No hay una base para {kg} kg. Escríbenos por WhatsApp."]}
        )
    return StandDeposit(stand=stand, deposit=stand.deposit, return_days=return_days)


def largest_stand_kg(settings=settings_repo) -> int:
    """Kilos que cubre la base activa más grande; 0 si no hay bases activas.

    Más kilos que esto no tienen depósito y `get_stand_deposit` los rechaza.
    """
    return max((stand.max_kg for stand in settings.list_stand_sizes()), default=0)


def effective_cake_design_limits(settings=settings_repo) -> CakeDesignSettingsRecord:
    """Los límites de "Diseña tu pastel" con el máximo en línea que de verdad se puede pedir.

    `max_online_kg` es el menor entre el de la configuración y lo que cubre la
    base activa más grande (sin bases activas, 0: ningún kilo tiene base). Lo
    usan las opciones, los kilos por personas y la revisión de kilos del precio,
    así los tres anuncian y rechazan lo mismo.
    """
    limits = settings.get_cake_design_settings()
    return replace(limits, max_online_kg=min(limits.max_online_kg, largest_stand_kg(settings)))
