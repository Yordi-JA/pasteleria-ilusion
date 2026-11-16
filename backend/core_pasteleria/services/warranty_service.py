"""Préstamo de bases: depósito, retención y reembolso.

La base se presta al entregar el pedido (`StandLoanObserver`, D69) y vuelve cuando el personal con permiso registra la
devolución en el admin (D64): `register_stand_return` es lo único que emite el evento "base devuelta".
"""
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from ..models import StandLoanStatus, StandOrigin
from ..repositories import settings_repo, stand_loan_repo
from ..repositories.records import CakeDesignSettingsRecord, StandSizeRecord
from .audit import audit_operation
from .errors import DomainValidationError
# Importa el módulo, no sus nombres: `order_observer` también importa este módulo para la fecha límite.
from .orders import order_observer

RETURN_PERMISSION = "core_pasteleria.register_stand_return"
NOT_ALLOWED_MESSAGE = "No tienes permiso para registrar la devolución de una base."
NOT_FOUND_MESSAGE = "Esa base prestada no existe."

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


def _stand_from_kg(stands: list[StandSizeRecord]) -> int | None:
    """Desde cuántos kilos un pedido lleva base: el `min_kg` más chico de toda la tabla, activas o no.

    `None` sin ningún tamaño de base. Lo comparten el depósito y las condiciones de `/bases`, así los dos dicen lo mismo.
    """
    return min((stand.min_kg for stand in stands), default=None)


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
    from_kg = _stand_from_kg(stands)
    # Kilos de 0 o negativos también quedan "por debajo": el precio los
    # rechaza con su propio mensaje, y aquí no se inventa un error más.
    if from_kg is not None and kg < from_kg:
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


# --- Condiciones del préstamo para `/bases` ---


@dataclass(frozen=True)
class DepositsBeyond:
    """Los depósitos que se cobran por arriba de la base más grande de la pastelería, hasta el máximo en línea.

    Son filas "Aprobada" (de 26 a 50 kg en la semilla): no son una base física, pero un pastel de esos kilos paga su
    depósito, así que `/bases` los dice en un renglón aparte para no callar lo que se cobra.
    """

    from_kg: int
    to_kg: int
    min_deposit: Decimal
    max_deposit: Decimal


@dataclass(frozen=True)
class StandLoanTerms:
    """Lo que muestra "Bases en préstamo" (`/bases`, regla 7), tal como está en el admin."""

    # Las bases reales de la pastelería (origen "Pastelería", activas), de menos a más kilos, en el orden del
    # repositorio. Los rangos "Aprobada" intermedios no son una base física: los cubre la siguiente base más grande.
    stands: tuple[StandSizeRecord, ...]
    # Días para devolver la base y recuperar el depósito (`PolicySettings.stand_return_days`).
    return_days: int
    # Desde cuántos kilos un pedido lleva base: el mismo umbral del depósito, o `None` si no hay ninguna base activa.
    from_kg: int | None
    # Qué pasa si la base regresa dañada (`PolicySettings.damaged_stand_policy`); `None` es PENDIENTE.
    damaged_policy: str | None
    # Lo que se cobra arriba de la base más grande de la pastelería; `None` si no hay nada que pedir en línea ahí.
    beyond: DepositsBeyond | None


def _deposits_beyond(bakery: list[StandSizeRecord], active: list[StandSizeRecord], max_online_kg: int):
    """Las filas activas que empiezan arriba de la base más grande de la pastelería y se alcanzan en línea.

    Empieza en el kilo siguiente a esa base (un hueco antes de la primera fila lo cubre esa fila, la siguiente más
    grande) y llega al máximo en línea efectivo. Sin bases de la pastelería no hay de dónde medir: `None`.
    """
    if not bakery:
        return None
    from_kg = max(stand.max_kg for stand in bakery) + 1
    reachable = [stand for stand in active if from_kg <= stand.min_kg <= max_online_kg]
    if not reachable:
        return None
    deposits = [stand.deposit for stand in reachable]
    return DepositsBeyond(from_kg=from_kg, to_kg=max_online_kg, min_deposit=min(deposits), max_deposit=max(deposits))


def get_loan_terms(settings=settings_repo) -> StandLoanTerms:
    """Las bases de la pastelería con su depósito y las condiciones del préstamo, vigentes en el admin.

    El orden de las bases es el del repositorio (de menos a más kilos). "Desde" es el umbral de `get_stand_deposit`
    (activas o no, de cualquier origen); sin ninguna base activa no se presta ninguna, y sale `None`.
    """
    policy = settings.get_policy_settings()
    all_stands = settings.list_stand_sizes(active_only=False)
    active = [stand for stand in all_stands if stand.is_active]
    bakery = [stand for stand in active if stand.origin == StandOrigin.BAKERY]
    max_online_kg = effective_cake_design_limits(settings).max_online_kg
    return StandLoanTerms(
        stands=tuple(bakery),
        return_days=policy.stand_return_days,
        from_kg=_stand_from_kg(all_stands) if active else None,
        damaged_policy=policy.damaged_stand_policy.strip() or None,
        beyond=_deposits_beyond(bakery, active, max_online_kg),
    )


# --- Préstamo y devolución (D69) ---


class StandReturnError(DomainValidationError):
    """La devolución no se puede registrar: sin permiso o sin esa base."""


@dataclass(frozen=True)
class StandReturn:
    """Lo que hizo `register_stand_return`: `registered` es `False` si la base ya estaba devuelta (no se reembolsa dos
    veces)."""

    loan_id: int
    order_id: int
    actor_id: int
    registered: bool


def stand_return_days(settings=settings_repo) -> int:
    """Cuántos días hay para devolver la base (`PolicySettings.stand_return_days`, 15 hoy)."""
    return settings.get_policy_settings().stand_return_days


def return_deadline(delivered_on: date, return_days: int) -> date:
    """Hasta cuándo se devuelve la base (regla 12): el día de la entrega más los días para devolverla."""
    return delivered_on + timedelta(days=return_days)


def _describe_return(result: StandReturn) -> dict:
    return {
        "loan_id": result.loan_id,
        "order_id": result.order_id,
        "actor_id": result.actor_id,
        "registered": result.registered,
    }


@audit_operation(expected_errors=(StandReturnError,), describe=_describe_return)
def register_stand_return(
    loan_id: int,
    *,
    actor,
    loans=stand_loan_repo,
    now: datetime | None = None,
    events: "order_observer.OrderSubject | None" = None,
) -> StandReturn:
    """Registra que la base volvió y emite "base devuelta" por el sujeto del pedido; el Observer la marca devuelta y
    el depósito reembolsado (D64).

    Vuelve a revisar que `actor` sea personal con `core_pasteleria.register_stand_return` (el admin ya lo pide). Bloquea
    la base antes de mirarla: dos registros a la vez se esperan y el segundo la ve devuelta, sin evento ni reembolso.
    La auditoría deja el id de la base, del pedido y de quien la recibió, nunca datos personales.
    """
    if not (actor.is_active and actor.is_staff and actor.has_perm(RETURN_PERMISSION)):
        raise StandReturnError({"status": [NOT_ALLOWED_MESSAGE]})
    events = events or order_observer.build_order_subject()
    with loans.atomic():
        loan = loans.lock_loan(loan_id)
        if loan is None:
            raise StandReturnError({"status": [NOT_FOUND_MESSAGE]})
        if loan.status != StandLoanStatus.ON_LOAN:
            return StandReturn(loan.id, loan.order_id, actor.pk, registered=False)
        events.notify(order_observer.StandReturned(loan.order_id, loan.id, actor.pk, now or timezone.now()))
    return StandReturn(loan.id, loan.order_id, actor.pk, registered=True)


class CustomerStandLoans:
    """Las bases de un cliente para el paginador de la API: cuenta en la base y lee solo la página que se pide."""

    def __init__(self, customer_id: int, loans=stand_loan_repo):
        self._customer_id = customer_id
        self._loans = loans

    def count(self) -> int:
        return self._loans.count_customer_loans(self._customer_id)

    def __len__(self) -> int:
        return self.count()

    def __getitem__(self, page: slice):
        start, stop = page.start or 0, page.stop
        return self._loans.list_customer_loans(self._customer_id, offset=start, limit=stop - start)


def list_customer_loans(customer_id: int, loans=stand_loan_repo) -> CustomerStandLoans:
    """Las bases que el cliente tiene o tuvo prestadas; nunca las de otro (IDOR)."""
    return CustomerStandLoans(customer_id, loans)
