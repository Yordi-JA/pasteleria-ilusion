"""Creación y consulta de pedidos (D63).

El servidor crea el pedido y recalcula todo: cada línea con su estrategia (`order_lines`), la fecha y el lapso con la
agenda (`schedule_service`), el anticipo con `payment_summary` (base y envío aparte) y el estado inicial. Del cliente
solo se leen sus elecciones, campo por campo.

Estado inicial (sección 12): un pedido con precio nace `awaiting_payment` ("Apartado, falta tu pago"), se pague en
efectivo o en línea; el pago verificado (tanda 2) lo pasa a `received`. Vence a los `payment_window_minutes` (30
propuestos), nunca después del inicio de su lapso; al elegir efectivo (tanda 2) se extenderá al cierre del día
(`schedule_service.cash_payment_due_at`). Un pedido con "Otra decoración" nace `awaiting_quote`, sin montos de pago: no
se cobra nada hasta que la pastelería ponga el precio en el admin (`quote_service`). Solo vence si la pastelería fija
`PolicySettings.quote_expiry_hours`, que sigue PENDIENTE. Lo de la vitrina de hoy se paga completo; el anticipo de
`PolicySettings.advance_percent` queda para los encargos y los diseños (lo decidió el usuario el 14 de noviembre de
2026).

Lo que se aparta se aparta al crear el pedido, en la misma transacción que revisa el cupo: el lapso (salvo en un pedido
en pausa por cotización, que no lo ocupa: su cupo se revisa al ponerle precio, `quote_service`), las piezas de la
vitrina de hoy y el pan de un encargo para hoy. Así dos pedidos a la vez nunca pasan del cupo ni venden la misma pieza.
Los candados van siempre en el mismo orden (cliente, lapso, vitrina por id, pan por id, imágenes por id) para que dos
creaciones no se esperen en cruz. Si algo falla adentro, la transacción deshace todo. Con el cliente bloqueado se
revisan sus topes, uno por el estado en que nace el pedido (`STATUS_CAPS`, D63 ronda 2; lo decidió el usuario):
- apartado: `max_unpaid_orders_per_customer` pedidos sin pagar (2 propuestos) y `max_unpaid_showcase_pieces` piezas de
  la vitrina de hoy sin pagar entre todos sus pedidos (10 propuestas). Para ese tope cuentan también, durante
  `expired_showcase_cooldown_hours` (24, propuestas por el equipo), las piezas de sus pedidos cancelados por vencidos (no
  los que canceló el personal): una cuenta no mantiene apartada la vitrina dejando vencer pedido tras pedido (lo decidió
  el usuario en la re-auditoría de la ronda 2);
- en pausa por cotización: `max_quote_orders_per_customer` a la vez (1 propuesto), aparte del tope de los apartados.
Un pedido lleva una sola decoración por cotizar.

Antes de crear, se cancelan los vencidos del cliente con su reintegro (`order_status.cancel_customer_expired_orders`,
revisión de la ronda 2). Cada uno va en su propia transacción y antes de la de creación: dentro de ella, devolver vitrina
y pan antes de bloquear el lapso rompería el orden de los candados. Se usa el mismo `now` que los topes, así que cada
apartado del cliente está cancelado o cuenta para el tope; uno que no se pudo cancelar (un error de la base) sigue
contando, con sus piezas, para los topes de este pedido.

El encabezado `Idempotency-Key` evita pedidos dobles: con la misma llave, el mismo cliente recibe el pedido que ya
existe, aunque mande otro cuerpo.
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from ...models import CancellationReason, Fulfillment, OrderLineKind, OrderStatus
from ...repositories import cake_option_repo, customer_image_repo, order_repo, product_repo, settings_repo
from ...repositories.records import NewOrder, OrderRecord
from ..errors import DomainValidationError
from ..payment_summary import payment_summary
from . import order_status, schedule_service
from .order_lines import (
    IMAGE_UNAVAILABLE_MESSAGE,
    LINE_HANDLERS,
    NO_BREAD_TODAY_MESSAGE,
    LineContext,
    LineError,
    LineRequest,
    PreparedLine,
    stock_message,
)

ZERO = Decimal("0.00")
# Lo más que cabe en un monto del pedido (`DecimalField(max_digits=10, decimal_places=2)`): más que eso no se pide en
# línea, y nunca llega a la base como un error de desbordamiento.
MAX_ORDER_AMOUNT = Decimal("99999999.99")

DELIVERY_BY_WHATSAPP_MESSAGE = (
    "Por ahora solo puedes recoger tu pedido en la pastelería. Para entrega a domicilio, escríbenos por WhatsApp."
)
DUPLICATE_LINE_MESSAGE = "Esta presentación ya está en tu pedido: cambia la cantidad de la otra línea."
SLOT_FULL_MESSAGE = "Ese horario se acaba de llenar. Elige otro."
TOO_EXPENSIVE_MESSAGE = "Tu pedido pasa de lo que se puede pagar en línea. Escríbenos por WhatsApp."
SINGLE_QUOTE_MESSAGE = "Un pedido lleva una sola decoración por cotizar."
IMAGE_FIELDS = {"decoration": "decoration_image_id", "wafer": "wafer_image_id"}


def too_many_unpaid_message(limit: int) -> str:
    return (
        f"Ya tienes {limit} pedidos sin pagar. Paga uno o espera a que venza para hacer otro."
        if limit > 1
        else "Ya tienes un pedido sin pagar. Págalo o espera a que venza para hacer otro."
    )


def too_many_pieces_message(pieces: int, limit: int) -> str:
    return f"Tu pedido lleva {pieces} piezas; en línea el máximo es {limit}."


def too_many_quotes_message(limit: int) -> str:
    return (
        f"Ya tienes {limit} pedidos esperando cotización. Espera a que la pastelería les ponga precio para pedir otra."
        if limit > 1
        else "Ya tienes un pedido esperando cotización. Espera a que la pastelería le ponga precio para pedir otro."
    )


def too_many_showcase_pieces_message(limit: int) -> str:
    return (
        f"Puedes apartar hasta {limit} piezas de la vitrina sin pagar, sumando tus pedidos. "
        "Paga el que ya tienes o pide menos."
    )


class OrderValidationError(Exception):
    """El pedido no se puede crear. `errors` tiene la forma de los errores de DRF: por campo, `non_field_errors` y, en
    `items`, solo las líneas con error, por su posición (desde 0)."""

    def __init__(self, errors: dict):
        self.errors = errors
        super().__init__(str(errors))


@dataclass(frozen=True)
class OrderRequest:
    idempotency_key: str
    fulfillment: str
    delivery_date: date
    slot_starts_at: time
    items: tuple[LineRequest, ...]


class _ReadOnce:
    """Un repositorio de solo lectura que responde cada consulta una vez por pedido.

    Un pedido con varios diseños pregunta lo mismo en cada uno (opciones, moldes, colores, configuración); así se lee
    una vez y todas las líneas usan las mismas cifras.
    """

    def __init__(self, repo):
        self._repo = repo
        self._answers: dict = {}

    def __getattr__(self, name):
        method = getattr(self._repo, name)

        def cached(*args, **kwargs):
            key = (name, args, tuple(sorted(kwargs.items())))
            if key not in self._answers:
                self._answers[key] = method(*args, **kwargs)
            return self._answers[key]

        return cached


def _item_errors(by_index: dict[int, dict]) -> dict[str, dict]:
    """Como DRF con una lista de serializadores: solo las líneas con error, por su posición."""
    return {str(index): errors for index, errors in sorted(by_index.items())}


def _repeated_images(prepared: list[PreparedLine | None], errors: dict[int, dict]) -> None:
    """Una imagen va en una sola línea: en la segunda que la usa es error (y no un 500 al guardar)."""
    seen: set = set()
    for index, line in enumerate(prepared):
        if line is None:
            continue
        for image_id, purpose in line.images:
            if image_id in seen:
                errors.setdefault(index, {}).setdefault("design", {})[IMAGE_FIELDS[purpose]] = [
                    IMAGE_UNAVAILABLE_MESSAGE
                ]
            seen.add(image_id)


def _prepare_lines(request: OrderRequest, context: LineContext) -> tuple[list[PreparedLine | None], dict[int, dict]]:
    prepared: list[PreparedLine | None] = []
    errors: dict[int, dict] = {}
    seen: set[tuple[str, int]] = set()
    for index, line in enumerate(request.items):
        key = (line.kind, line.offering_id)
        if line.offering_id is not None and key in seen:
            errors[index] = {"offering_id": [DUPLICATE_LINE_MESSAGE]}
            prepared.append(None)
            continue
        seen.add(key)
        try:
            prepared.append(LINE_HANDLERS[line.kind].prepare(line, context))
        except LineError as error:
            errors[index] = error.errors
            prepared.append(None)
    _repeated_images(prepared, errors)
    _repeated_quotes(prepared, errors)
    return prepared, errors


def _repeated_quotes(prepared: list[PreparedLine | None], errors: dict[int, dict]) -> None:
    """Una sola decoración por cotizar por pedido: la pastelería cotiza una imagen a la vez (D63, ronda 2)."""
    quoted = [index for index, line in enumerate(prepared) if line is not None and line.requires_quote]
    for index in quoted[1:]:
        errors.setdefault(index, {}).setdefault("design", {})["decoration"] = [SINGLE_QUOTE_MESSAGE]


def _check_totals(request: OrderRequest, lines: list[PreparedLine | None], policy) -> list[str]:
    """Las piezas del pedido y su monto, contra los topes; los errores van sin campo."""
    problems = []
    pieces = sum(line.quantity for line in request.items)
    if pieces > policy.max_pieces_per_order:
        problems.append(too_many_pieces_message(pieces, policy.max_pieces_per_order))
    amount = sum((line.item.line_total + line.stand_deposit for line in lines if line is not None), ZERO)
    if amount > MAX_ORDER_AMOUNT:
        problems.append(TOO_EXPENSIVE_MESSAGE)
    return problems


def _check_schedule(request: OrderRequest, now: datetime, store, policy) -> schedule_service.Slot:
    """El lapso elegido, revisado contra la anticipación de las líneas y los días que se reservan."""
    kinds = {line.kind for line in request.items}
    rule = schedule_service.lead_rule(kinds, now, store, policy, field="delivery_date")
    latest = schedule_service.latest_booking_date(now, policy)
    return schedule_service.find_slot(request.delivery_date, request.slot_starts_at, rule, store, latest, policy)


def _reserve(lines: list[PreparedLine], context: LineContext) -> None:
    """Aparta, en orden fijo, las piezas de la vitrina, el pan de hoy y las imágenes. Falla con el error de la línea."""
    errors: dict[int, dict] = {}
    showcase = sorted(
        (line.showcase_offering_id, index, line) for index, line in enumerate(lines) if line.showcase_offering_id
    )
    for offering_id, index, line in showcase:
        if not context.products.decrement_showcase_stock(offering_id, context.today, line.item.quantity):
            stock = context.products.get_showcase_stock(offering_id, context.today) or 0
            errors[index] = {"quantity": [stock_message(stock)]}
    bread: dict[int, list[int]] = defaultdict(list)
    for index, line in enumerate(lines):
        if line.bread_id:
            bread[line.bread_id].append(index)
    for bread_id in sorted(bread):
        quantity = sum(lines[index].item.quantity for index in bread[bread_id])
        if not context.products.consume_bread(bread_id, context.today, quantity):
            for index in bread[bread_id]:
                errors.setdefault(index, {"offering_id": [NO_BREAD_TODAY_MESSAGE]})
    images = sorted((image_id, purpose, index) for index, line in enumerate(lines) for image_id, purpose in line.images)
    for image_id, purpose, index in images:
        if not context.images.is_attachable(image_id, context.customer_id, purpose, lock=True):
            errors.setdefault(index, {}).setdefault("design", {})[IMAGE_FIELDS[purpose]] = [IMAGE_UNAVAILABLE_MESSAGE]
    if errors:
        raise OrderValidationError({"items": _item_errors(errors)})


def _new_order(
    customer_id: int,
    request: OrderRequest,
    lines: list[PreparedLine],
    slot: schedule_service.Slot,
    slot_id: int,
    now: datetime,
    settings,
) -> NewOrder:
    subtotal = sum((line.item.line_total for line in lines), ZERO)
    stand_deposit = sum((line.stand_deposit for line in lines), ZERO)
    delivery_fee = ZERO
    requires_quote = any(line.requires_quote for line in lines)
    # Lo de la vitrina de hoy se paga completo (decisión C del usuario).
    showcase = sum((line.item.line_total for line in lines if line.item.kind == OrderLineKind.SHOWCASE), ZERO)
    payment = (
        None if requires_quote else payment_summary(subtotal, stand_deposit, delivery_fee, settings, paid_in_full=showcase)
    )
    starts = schedule_service.slot_start(request.delivery_date, slot, now)
    due = None if requires_quote else schedule_service.payment_due_at(now, starts, settings.get_policy_settings())
    return NewOrder(
        customer_id=customer_id,
        idempotency_key=request.idempotency_key,
        status=_initial_status(lines),
        status_changed_at=now,
        fulfillment=request.fulfillment,
        delivery_slot_id=slot_id,
        subtotal=subtotal,
        stand_deposit=stand_deposit,
        delivery_fee=delivery_fee,
        advance_percent=payment.advance_percent if payment else None,
        advance=payment.advance if payment else None,
        pay_today=payment.pay_today if payment else None,
        pay_on_delivery=payment.pay_on_delivery if payment else None,
        payment_due_at=due,
        items=tuple(line.item for line in lines),
        paid_in_full=showcase if payment else None,
    )


def _initial_status(lines: list[PreparedLine]) -> str:
    """En pausa por cotización si alguna línea lleva una decoración por cotizar; si no, apartado."""
    return OrderStatus.AWAITING_QUOTE if any(line.requires_quote for line in lines) else OrderStatus.AWAITING_PAYMENT


def _check_unpaid_caps(
    customer_id: int, lines: list[PreparedLine], now: datetime, policy, orders, still_held: tuple[int, ...]
) -> None:
    """Topes de un pedido que nace apartado: pedidos sin pagar y piezas de la vitrina de hoy sin pagar. `still_held`
    son los vencidos del cliente que no se pudieron cancelar: siguen contando."""
    unpaid = orders.count_unpaid_orders(
        customer_id, unpaid_status=schedule_service.UNPAID_STATUS, now=now, also_order_ids=still_held
    )
    if unpaid >= policy.max_unpaid_orders_per_customer:
        raise OrderValidationError({"non_field_errors": [too_many_unpaid_message(policy.max_unpaid_orders_per_customer)]})
    pieces = sum(line.item.quantity for line in lines if line.showcase_offering_id)
    if not pieces:
        return
    held = orders.count_unpaid_showcase_pieces(
        customer_id,
        unpaid_status=schedule_service.UNPAID_STATUS,
        showcase_kind=OrderLineKind.SHOWCASE,
        now=now,
        also_order_ids=still_held,
    )
    # La pausa: lo que dejó vencer en las últimas horas sigue contando aunque ya volvió a la vitrina.
    cooling = orders.count_recently_cancelled_showcase_pieces(
        customer_id,
        cancelled_status=OrderStatus.CANCELLED,
        reason=CancellationReason.EXPIRED,
        showcase_kind=OrderLineKind.SHOWCASE,
        since=now - timedelta(hours=policy.expired_showcase_cooldown_hours),
    )
    if held + cooling + pieces > policy.max_unpaid_showcase_pieces:
        raise OrderValidationError(
            {"non_field_errors": [too_many_showcase_pieces_message(policy.max_unpaid_showcase_pieces)]}
        )


def _check_quote_cap(
    customer_id: int, lines: list[PreparedLine], now: datetime, policy, orders, still_held: tuple[int, ...]
) -> None:
    """Tope de un pedido que nace en pausa por cotización, aparte del de los apartados."""
    waiting = orders.count_customer_orders_in_status(customer_id, OrderStatus.AWAITING_QUOTE)
    if waiting >= policy.max_quote_orders_per_customer:
        raise OrderValidationError({"non_field_errors": [too_many_quotes_message(policy.max_quote_orders_per_customer)]})


# Los topes del cliente, por el estado en que nace el pedido.
STATUS_CAPS = {
    OrderStatus.AWAITING_PAYMENT: _check_unpaid_caps,
    OrderStatus.AWAITING_QUOTE: _check_quote_cap,
}


def create_order(
    customer_id: int,
    request: OrderRequest,
    *,
    now: datetime | None = None,
    products=product_repo,
    cake_options=cake_option_repo,
    settings=settings_repo,
    orders=order_repo,
    images=customer_image_repo,
) -> tuple[OrderRecord, bool]:
    """Crea el pedido, o devuelve el que ya existe con esa llave. El segundo valor dice si se creó."""
    existing = orders.find_order_by_idempotency_key(customer_id, request.idempotency_key)
    if existing is not None:
        return existing, False
    now = now or schedule_service.bakery_now()
    # Sus piezas y su pan vencidos vuelven antes de revisar las existencias y los topes.
    cleanup = order_status.cancel_customer_expired_orders(
        customer_id, now=now, orders=orders, products=products, settings=settings
    )
    cake_options, settings = _ReadOnce(cake_options), _ReadOnce(settings)
    store, policy = settings.get_store_settings(), settings.get_policy_settings()
    context = LineContext(
        customer_id=customer_id,
        delivery_date=request.delivery_date,
        today=now.date(),
        products=products,
        cake_options=cake_options,
        settings=settings,
        images=images,
    )
    errors: dict = {}
    if request.fulfillment != Fulfillment.PICKUP:
        errors["fulfillment"] = [DELIVERY_BY_WHATSAPP_MESSAGE]
    lines, line_errors = _prepare_lines(request, context)
    if line_errors:
        errors["items"] = _item_errors(line_errors)
    totals = _check_totals(request, lines, policy)
    if totals:
        errors["non_field_errors"] = totals
    slot = None
    try:
        slot = _check_schedule(request, now, store, policy)
    except DomainValidationError as error:
        errors.update(error.errors)
    if errors:
        raise OrderValidationError(errors)
    with orders.atomic():
        orders.lock_customer(customer_id)
        existing = orders.find_order_by_idempotency_key(customer_id, request.idempotency_key)
        if existing is not None:
            return existing, False
        STATUS_CAPS[_initial_status(lines)](customer_id, lines, now, policy, orders, cleanup.failed)
        latest = schedule_service.latest_booking_date(now, policy)
        if request.delivery_date > latest:
            # `_check_schedule` ya lo revisó; aquí se repite para que nunca llegue al repositorio como un 500.
            raise OrderValidationError({"delivery_date": [schedule_service.too_far_message(policy.max_days_ahead)]})
        slot_id = orders.lock_slot(request.delivery_date, slot.starts_at, slot.ends_at, latest_date=latest)
        taken = orders.count_orders_in_slot(slot_id, **schedule_service.holding_filter(now))
        if taken >= store.max_orders_per_slot:
            raise OrderValidationError({"slot_starts_at": [SLOT_FULL_MESSAGE]})
        _reserve(lines, context)
        record = orders.create_order(_new_order(customer_id, request, lines, slot, slot_id, now, settings))
    return record, True


def has_order_with_key(customer_id: int, idempotency_key: str, orders=order_repo) -> bool:
    """Si la petición es un reintento: el cliente ya tiene un pedido con esa llave."""
    return orders.has_order_with_key(customer_id, idempotency_key)


def find_order_by_key(customer_id: int, idempotency_key: str, orders=order_repo) -> OrderRecord | None:
    """El pedido que el cliente ya hizo con esa llave; con él, un reintento no es un pedido nuevo."""
    return orders.find_order_by_idempotency_key(customer_id, idempotency_key)


def get_order(customer_id: int, order_id: int, orders=order_repo) -> OrderRecord | None:
    """Un pedido del cliente; uno ajeno es `None`."""
    return orders.get_customer_order(customer_id, order_id)


class CustomerOrders:
    """Los pedidos de un cliente para el paginador de la API: cuenta en la base y lee solo la página que se pide."""

    def __init__(self, customer_id: int, orders=order_repo):
        self._customer_id = customer_id
        self._orders = orders

    def count(self) -> int:
        return self._orders.count_customer_orders(self._customer_id)

    def __len__(self) -> int:
        return self.count()

    def __getitem__(self, page: slice) -> list[OrderRecord]:
        start, stop = page.start or 0, page.stop
        return self._orders.list_customer_orders(self._customer_id, offset=start, limit=stop - start)


def list_orders(customer_id: int, orders=order_repo) -> CustomerOrders:
    return CustomerOrders(customer_id, orders)
