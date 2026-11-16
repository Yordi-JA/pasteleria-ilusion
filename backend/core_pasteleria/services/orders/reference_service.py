"""Envío de referencia y su cotización (regla 9; D70, decisiones del usuario del 15 de noviembre de 2026).

El cliente manda hasta `UploadSettings.max_reference_images` fotos (las sube antes por `customer-images/` con el uso
`reference`), qué quiere tomar de ellas, la ocasión, las personas, el sabor, la fecha del evento y un presupuesto
opcional. La fecha sigue la anticipación de "Diseña tu pastel" (`StoreSettings.custom_lead_days`, 2 días) y no pasa de
los días que se reservan. No se cobra nada: la solicitud nace `in_review` y no ocupa lapso.

Sabor y base (decisiones del usuario del 15 de noviembre de 2026): el tipo de pastel, el pan y el relleno se revisan con
las reglas de los pasos 2 a 4 (`pricing_service.check_size_and_flavor`, regla 4.7), y la base sale sola de los kilos de
las personas (reglas 3.1 y 7, `warranty_service.get_stand_deposit`), como en un diseño. Más personas de las que se piden
en línea se rechazan con el mismo mensaje que "Diseña tu pastel". El depósito se guarda con la solicitud: va aparte del
precio cotizado y se paga completo al aceptar (regla 10), y el pedido que nace lo lleva para la nota y el préstamo.

El personal con `core_pasteleria.set_reference_quote` pone el precio y su nota en el admin (D64, sin pantallas nuevas):
la solicitud pasa a `quote_ready` (también si ya estaba lista: el precio corregido vuelve a avisarse). Al aceptarla, el
cliente elige el lapso de ese día y quién recoge, y el servidor crea, en una transacción, un pedido normal en
`awaiting_payment` con una línea del precio cotizado (`OrderLineKind.REFERENCE`), revisando la agenda en ese momento.
El pago es el de D68, con el anticipo de siempre (`payment_summary`, con el depósito de la base y sin envío).

Vigencia: `PolicySettings.reference_quote_valid_hours`, PENDIENTE. Sin valor, la cotización no vence; con valor, se
puede aceptar hasta esas horas después de `quoted_at`. No se cancela sola: vencida, solo deja de poder aceptarse.

Los correos "Recibimos tu solicitud" y "Tu cotización está lista" salen por el sujeto del pedido (`ReferenceReceived` y
`QuoteReady`), después del commit.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID

from ...models import CustomerImagePurpose, Fulfillment, OrderLineKind, OrderStatus, ReferenceRequestStatus
from ...repositories import cake_option_repo, customer_image_repo, order_repo, reference_repo, settings_repo
from ...repositories.records import NewOrder, NewOrderItem, NewReferenceRequest, OrderRecord, ReferenceRequestRecord
from .. import pricing_service, warranty_service
from ..audit import audit_operation
from ..errors import DomainValidationError, attempt
from ..payment_summary import payment_summary
from . import schedule_service
from .order_lines import IMAGE_UNAVAILABLE_MESSAGE, remap_kg_to_people
from .order_observer import OrderSubject, QuoteReady, ReferenceReceived, build_order_subject
from .order_service import MAX_ORDER_AMOUNT, SLOT_FULL_MESSAGE, TOO_EXPENSIVE_MESSAGE, too_many_unpaid_message

QUOTE_PERMISSION = "core_pasteleria.set_reference_quote"
ZERO = Decimal("0.00")
# El nombre de la línea del pedido que nace de la cotización (vocabulario: "Cotización" es del pedido con foto).
REFERENCE_LINE_NAME = "Pastel según tu referencia"

NO_IMAGES_MESSAGE = "Sube al menos una foto de referencia."
REPEATED_IMAGE_MESSAGE = "Esa foto ya está en tu solicitud."
NOT_ALLOWED_MESSAGE = "No tienes permiso para poner el precio de un envío de referencia."
NOT_POSITIVE_MESSAGE = "Escribe un precio mayor que $0."
NOT_QUOTABLE_MESSAGE = "Esta solicitud ya se aceptó o se canceló: ya no se le puede poner precio."
OTHER_DAY_MESSAGE = "La cotización es para el día de tu evento: elige un horario de ese día."


def too_many_images_message(limit: int) -> str:
    return f"Puedes mandar hasta {limit} fotos." if limit > 1 else "Puedes mandar 1 foto."


def too_soon_message(days: int) -> str:
    return f"Los pedidos se hacen con al menos {days} días de anticipación. Elige otra fecha."


def too_many_open_message(limit: int) -> str:
    return (
        f"Ya tienes {limit} solicitudes en revisión. Espera su cotización para mandar otra."
        if limit > 1
        else "Ya tienes una solicitud en revisión. Espera su cotización para mandar otra."
    )


class ReferenceValidationError(DomainValidationError):
    """La solicitud o la aceptación no cumplen las reglas; los errores van por campo (400)."""


class ReferenceConflict(Exception):
    """La solicitud no está en un estado que lo permita (409). `code` y `message` los usa la API."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(code)


QUOTE_NOT_READY = ReferenceConflict(
    "quote_not_ready", "Esta solicitud todavía no tiene cotización, o ya se canceló."
)
QUOTE_EXPIRED = ReferenceConflict(
    "quote_expired", "Esta cotización ya venció. Escríbenos por WhatsApp para que la revisemos otra vez."
)
ALREADY_ACCEPTED = ReferenceConflict(
    "already_accepted", "Esta cotización ya se aceptó: cancela el pedido desde su detalle."
)
KEY_IN_USE = ReferenceConflict(
    "idempotency_conflict", "Esa llave ya se usó en otro pedido. Usa una llave nueva para aceptar la cotización."
)


@dataclass(frozen=True)
class ReferenceSubmission:
    idempotency_key: str
    description: str
    occasion: str
    people: int
    event_date: date
    budget: Decimal | None
    image_ids: tuple[UUID, ...]
    cake_type: str
    bread: str
    filling_base: str | None
    filling_flavors: tuple[str, ...]


@dataclass(frozen=True)
class QuoteAcceptance:
    idempotency_key: str
    slot_starts_at: time
    pickup_name: str
    pickup_phone: str
    # Opcional: si llega, debe ser el día del evento (la pantalla de entrega lo manda fijo).
    delivery_date: date | None = None


@dataclass(frozen=True)
class ReferenceView:
    """La solicitud con lo que la pantalla necesita de su cotización, calculado ahora."""

    request: ReferenceRequestRecord
    expires_at: datetime | None
    expired: bool
    # Sin `reference_quote_valid_hours` (PENDIENTE): la cotización no vence y la pantalla muestra el marcador.
    validity_pending: bool
    advance_percent: int | None
    pay_today: Decimal | None
    pay_on_delivery: Decimal | None
    # El anticipo del precio cotizado y el depósito de la base, que se paga completo aparte (regla 10, D70).
    advance: Decimal | None = None
    stand_deposit: Decimal = ZERO


def _stand_deposit(request: ReferenceRequestRecord) -> Decimal:
    return request.cake.stand_deposit if request.cake is not None else ZERO


def _expires_at(request: ReferenceRequestRecord, hours: int | None) -> datetime | None:
    return request.quoted_at + timedelta(hours=hours) if hours and request.quoted_at else None


def _is_expired(request: ReferenceRequestRecord, hours: int | None, now: datetime) -> bool:
    expires = _expires_at(request, hours)
    return request.status == ReferenceRequestStatus.QUOTE_READY and expires is not None and expires <= now


def _view(request: ReferenceRequestRecord, now: datetime, settings) -> ReferenceView:
    hours = settings.get_policy_settings().reference_quote_valid_hours
    deposit = _stand_deposit(request)
    payment = payment_summary(request.quoted_price, deposit, settings=settings) if request.quoted_price else None
    return ReferenceView(
        request=request,
        expires_at=_expires_at(request, hours),
        expired=_is_expired(request, hours, now),
        validity_pending=hours is None,
        advance_percent=payment.advance_percent if payment else None,
        pay_today=payment.pay_today if payment else None,
        pay_on_delivery=payment.pay_on_delivery if payment else None,
        advance=payment.advance if payment else None,
        stand_deposit=deposit,
    )


# --- Enviar ---


def _check_submission(submission: ReferenceSubmission, now: datetime, settings) -> None:
    errors: dict[str, list[str]] = {}
    limit = settings.get_upload_settings().max_reference_images
    ids = submission.image_ids
    if not ids:
        errors["image_ids"] = [NO_IMAGES_MESSAGE]
    elif len(ids) > limit:
        errors["image_ids"] = [too_many_images_message(limit)]
    elif len(set(ids)) != len(ids):
        errors["image_ids"] = [REPEATED_IMAGE_MESSAGE]
    store, policy = settings.get_store_settings(), settings.get_policy_settings()
    if submission.event_date < now.date() + timedelta(days=store.custom_lead_days):
        errors["event_date"] = [too_soon_message(store.custom_lead_days)]
    elif submission.event_date > schedule_service.latest_booking_date(now, policy):
        errors["event_date"] = [schedule_service.too_far_message(policy.max_days_ahead)]
    if errors:
        raise ReferenceValidationError(errors)


@dataclass(frozen=True)
class _Cake:
    kg: int
    stand: warranty_service.StandDeposit


def _check_cake(submission: ReferenceSubmission, settings, cake_options) -> tuple[_Cake | None, dict]:
    """Los kilos de las personas, el sabor (regla 4.7) y la base (regla 7), como en `order_lines.DesignLine`.

    Devuelve el pastel o los errores por campo; un error de los kilos va en `people`, que es lo que manda el cliente.
    """
    size = pricing_service.size_for_people(submission.people, settings, cake_options)
    choice = pricing_service.CakeDesignChoice(
        kg=size.kg,
        cake_type=submission.cake_type,
        bread=submission.bread,
        filling_base=submission.filling_base,
        filling_flavors=submission.filling_flavors,
    )
    failures: list[DomainValidationError] = []
    attempt(failures, pricing_service.check_size_and_flavor, choice, cake_options, settings)
    stand = attempt(failures, warranty_service.get_stand_deposit, size.kg, settings)
    errors: dict = {}
    for failure in failures:
        for field, messages in remap_kg_to_people(failure.errors).items():
            errors.setdefault(field, messages)
    return (None, errors) if errors else (_Cake(size.kg, stand), {})


def _describe_submission(result: tuple[ReferenceRequestRecord, bool]) -> dict:
    request, created = result
    return {"request_id": request.id, "is_new": created, "images": len(request.images)}


@audit_operation(expected_errors=(DomainValidationError,), describe=_describe_submission)
def submit_request(
    customer_id: int,
    submission: ReferenceSubmission,
    *,
    now: datetime | None = None,
    references=reference_repo,
    images=customer_image_repo,
    settings=settings_repo,
    cake_options=cake_option_repo,
    events: OrderSubject | None = None,
) -> tuple[ReferenceRequestRecord, bool]:
    """Guarda la solicitud con sus fotos, o devuelve la que ya existe con esa llave. El segundo valor dice si se creó."""
    now = now or schedule_service.bakery_now()
    existing = references.find_by_key(customer_id, submission.idempotency_key)
    if existing is not None:
        return existing, False
    cake, cake_errors = _check_cake(submission, settings, cake_options)
    try:
        _check_submission(submission, now, settings)
    except ReferenceValidationError as error:
        raise ReferenceValidationError({**cake_errors, **error.errors}) from error
    if cake_errors:
        raise ReferenceValidationError(cake_errors)
    events = events or build_order_subject()
    limit = settings.get_policy_settings().max_quote_orders_per_customer
    with references.atomic():
        references.lock_customer(customer_id)
        existing = references.find_by_key(customer_id, submission.idempotency_key)
        if existing is not None:
            return existing, False
        # El mismo tope que un pedido en pausa por cotización (1 a la vez, propuesto): la pastelería cotiza una a una.
        if references.count_customer_requests_in_status(customer_id, ReferenceRequestStatus.IN_REVIEW) >= limit:
            raise ReferenceValidationError({"non_field_errors": [too_many_open_message(limit)]})
        for image_id in sorted(submission.image_ids):
            if not images.is_attachable(image_id, customer_id, CustomerImagePurpose.REFERENCE, lock=True):
                raise ReferenceValidationError({"image_ids": [IMAGE_UNAVAILABLE_MESSAGE]})
        record = references.create(
            NewReferenceRequest(
                customer_id=customer_id,
                idempotency_key=submission.idempotency_key,
                status=ReferenceRequestStatus.IN_REVIEW,
                status_changed_at=now,
                description=submission.description,
                occasion=submission.occasion,
                people=submission.people,
                event_date=submission.event_date,
                budget=submission.budget,
                image_ids=submission.image_ids,
                cake_type=submission.cake_type,
                bread=submission.bread,
                filling_base=submission.filling_base,
                filling_flavors=submission.filling_flavors,
                kg=cake.kg,
                stand_max_kg=cake.stand.stand.max_kg if cake.stand.stand else None,
                stand_deposit=cake.stand.deposit,
            )
        )
        events.notify(ReferenceReceived(record.id, now))
    return record, True


def has_request_with_key(customer_id: int, idempotency_key: str, references=reference_repo) -> bool:
    return references.has_request_with_key(customer_id, idempotency_key)


def find_request_by_key(
    customer_id: int, idempotency_key: str, *, now: datetime | None = None, references=reference_repo,
    settings=settings_repo,
) -> ReferenceView | None:
    request = references.find_by_key(customer_id, idempotency_key)
    return _view(request, now or schedule_service.bakery_now(), settings) if request else None


# --- Consultar ---


def view(request: ReferenceRequestRecord, *, now: datetime | None = None, settings=settings_repo) -> ReferenceView:
    return _view(request, now or schedule_service.bakery_now(), settings)


def get_request(
    customer_id: int, request_id: int, *, now: datetime | None = None, references=reference_repo, settings=settings_repo
) -> ReferenceView | None:
    """Una solicitud del cliente; una ajena es `None`."""
    request = references.get_customer_request(customer_id, request_id)
    return _view(request, now or schedule_service.bakery_now(), settings) if request else None


class CustomerReferenceRequests:
    """Las solicitudes de un cliente para el paginador de la API: cuenta en la base y lee solo la página."""

    def __init__(self, customer_id: int, references=reference_repo, settings=settings_repo):
        self._customer_id = customer_id
        self._references = references
        self._settings = settings

    def count(self) -> int:
        return self._references.count_customer_requests(self._customer_id)

    def __len__(self) -> int:
        return self.count()

    def __getitem__(self, page: slice) -> list[ReferenceView]:
        start, stop = page.start or 0, page.stop
        requests = self._references.list_customer_requests(self._customer_id, offset=start, limit=stop - start)
        now = schedule_service.bakery_now()
        return [_view(request, now, self._settings) for request in requests]


def list_requests(customer_id: int, references=reference_repo) -> CustomerReferenceRequests:
    return CustomerReferenceRequests(customer_id, references)


# --- Cotizar (el personal, en el admin) ---


def can_quote(actor) -> bool:
    """Personal activo con `core_pasteleria.set_reference_quote`."""
    return actor.is_active and actor.is_staff and actor.has_perm(QUOTE_PERMISSION)


def get_photo_for_staff(request_id: int, image_id: UUID, *, actor, images=customer_image_repo):
    """Una foto de la solicitud para quien cotiza (D70, aprobado por el usuario el 15 de noviembre de 2026).

    Solo con el permiso de cotizar y solo una foto de referencia ligada a esa solicitud: ni las de "Otra decoración" ni
    las de la oblea, ni la de otra solicitud. `None` en cualquier otro caso (el admin responde 403).
    """
    if not can_quote(actor):
        return None
    return images.get_reference_photo(request_id, image_id)


@dataclass(frozen=True)
class QuotedReference:
    request_id: int
    actor_id: int
    price: Decimal


def _describe_quote(quoted: QuotedReference) -> dict:
    # El precio y los ids, nunca la nota ni datos del cliente.
    return {"request_id": quoted.request_id, "actor_id": quoted.actor_id, "price": str(quoted.price)}


@audit_operation(expected_errors=(DomainValidationError,), describe=_describe_quote)
def set_quote(
    request_id: int,
    price: Decimal | None,
    note: str,
    *,
    actor,
    now: datetime | None = None,
    references=reference_repo,
    events: OrderSubject | None = None,
) -> QuotedReference:
    """Pone el precio y la nota y deja la solicitud en `quote_ready`; el cliente recibe "Tu cotización está lista".

    Vuelve a revisar que `actor` sea personal activo con `core_pasteleria.set_reference_quote` (el admin ya lo pide).
    """
    if not can_quote(actor):
        raise ReferenceValidationError({"quoted_price": [NOT_ALLOWED_MESSAGE]})
    if price is None or price <= 0:
        raise ReferenceValidationError({"quoted_price": [NOT_POSITIVE_MESSAGE]})
    if price > MAX_ORDER_AMOUNT:
        raise ReferenceValidationError({"quoted_price": [TOO_EXPENSIVE_MESSAGE]})
    now = now or schedule_service.bakery_now()
    events = events or build_order_subject()
    with references.atomic():
        request = references.lock(request_id)
        if request is None or request.status not in (ReferenceRequestStatus.IN_REVIEW, ReferenceRequestStatus.QUOTE_READY):
            raise ReferenceValidationError({"quoted_price": [NOT_QUOTABLE_MESSAGE]})
        references.set_quote(
            request_id,
            price=price,
            note=note.strip(),
            quoted_at=now,
            quoted_by_id=actor.pk,
            status=ReferenceRequestStatus.QUOTE_READY,
        )
        events.notify(QuoteReady(request_id, actor.pk, now))
    return QuotedReference(request_id, actor.pk, price)


# --- Aceptar ---


def _describe_acceptance(result: tuple[OrderRecord, bool] | None) -> dict:
    # `None`: la solicitud no es del cliente (la API responde 404).
    if result is None:
        return {"found": False}
    order, created = result
    return {"order_id": order.id, "is_new": created}


@audit_operation(expected_errors=(DomainValidationError, ReferenceConflict), describe=_describe_acceptance)
def accept_quote(
    customer_id: int,
    request_id: int,
    acceptance: QuoteAcceptance,
    *,
    now: datetime | None = None,
    references=reference_repo,
    orders=order_repo,
    settings=settings_repo,
) -> tuple[OrderRecord, bool] | None:
    """Crea el pedido de la cotización y deja la solicitud `accepted`. `None` si la solicitud no es del cliente.

    Con la solicitud ya aceptada devuelve su pedido (un reintento o un doble clic no crean otro). El lapso se revisa en
    este momento: la anticipación de `reference` (que no haya pasado y deje el plazo para pagar), el día que se reserva
    y el cupo, con el lapso bloqueado como en la creación de un pedido.
    """
    now = now or schedule_service.bakery_now()
    request = references.get_customer_request(customer_id, request_id)
    if request is None:
        return None
    if request.status == ReferenceRequestStatus.ACCEPTED:
        return orders.get_customer_order(customer_id, request.order_id), False
    store, policy = settings.get_store_settings(), settings.get_policy_settings()
    if request.status != ReferenceRequestStatus.QUOTE_READY:
        raise QUOTE_NOT_READY
    if _is_expired(request, policy.reference_quote_valid_hours, now):
        raise QUOTE_EXPIRED
    if acceptance.delivery_date is not None and acceptance.delivery_date != request.event_date:
        raise ReferenceValidationError({"delivery_date": [OTHER_DAY_MESSAGE]})
    rule = schedule_service.lead_rule({OrderLineKind.REFERENCE}, now, store, policy, field="delivery_date")
    latest = schedule_service.latest_booking_date(now, policy)
    slot = schedule_service.find_slot(request.event_date, acceptance.slot_starts_at, rule, store, latest, policy)
    with orders.atomic():
        orders.lock_customer(customer_id)
        locked = references.lock(request_id)
        if locked.status == ReferenceRequestStatus.ACCEPTED:
            return orders.get_customer_order(customer_id, locked.order_id), False
        if locked.status != ReferenceRequestStatus.QUOTE_READY:
            raise QUOTE_NOT_READY
        if orders.has_order_with_key(customer_id, acceptance.idempotency_key):
            raise KEY_IN_USE
        unpaid = orders.count_unpaid_orders(customer_id, unpaid_status=schedule_service.UNPAID_STATUS, now=now)
        if unpaid >= policy.max_unpaid_orders_per_customer:
            raise ReferenceValidationError(
                {"non_field_errors": [too_many_unpaid_message(policy.max_unpaid_orders_per_customer)]}
            )
        slot_id = orders.lock_slot(request.event_date, slot.starts_at, slot.ends_at, latest_date=latest)
        if orders.count_orders_in_slot(slot_id, **schedule_service.holding_filter(now)) >= store.max_orders_per_slot:
            raise ReferenceValidationError({"slot_starts_at": [SLOT_FULL_MESSAGE]})
        price = locked.quoted_price
        # La base se fijó al enviar (D70): su depósito va completo hoy, aparte del anticipo, como en todo pedido.
        deposit = _stand_deposit(locked)
        payment = payment_summary(price, deposit, ZERO, settings)
        starts = schedule_service.slot_start(request.event_date, slot, now)
        order = orders.create_order(
            NewOrder(
                customer_id=customer_id,
                idempotency_key=acceptance.idempotency_key,
                status=OrderStatus.AWAITING_PAYMENT,
                status_changed_at=now,
                fulfillment=Fulfillment.PICKUP,
                delivery_slot_id=slot_id,
                pickup_name=acceptance.pickup_name,
                pickup_phone=acceptance.pickup_phone,
                subtotal=price,
                stand_deposit=deposit,
                delivery_fee=ZERO,
                advance_percent=payment.advance_percent,
                advance=payment.advance,
                pay_today=payment.pay_today,
                pay_on_delivery=payment.pay_on_delivery,
                payment_due_at=schedule_service.payment_due_at(now, starts, policy),
                paid_in_full=ZERO,
                items=(
                    NewOrderItem(
                        kind=OrderLineKind.REFERENCE,
                        offering_id=None,
                        product_name=REFERENCE_LINE_NAME,
                        presentation="",
                        quantity=1,
                        unit_price=price,
                        line_total=price,
                        design=None,
                    ),
                ),
            )
        )
        references.mark_accepted(request_id, order_id=order.id, status=ReferenceRequestStatus.ACCEPTED, changed_at=now)
    # Se vuelve a leer ya ligado a la solicitud: así la respuesta trae el pastel de la línea y su base.
    return orders.get_customer_order(customer_id, order.id), True


# --- Cancelar ---


CANNOT_CANCEL_ACCEPTED = ReferenceConflict(
    "already_accepted", "Esta cotización ya es un pedido: cancélalo desde el detalle del pedido."
)


@audit_operation(
    expected_errors=(ReferenceConflict,),
    describe=lambda view_: {"request_id": view_.request.id} if view_ is not None else {"found": False},
)
def cancel_request(
    customer_id: int,
    request_id: int,
    *,
    now: datetime | None = None,
    references=reference_repo,
    settings=settings_repo,
) -> ReferenceView | None:
    """Cancela una solicitud en revisión o con cotización, sin cobro, y borra sus fotos. Una ya cancelada se devuelve
    igual. `None` si no es del cliente."""
    now = now or schedule_service.bakery_now()
    if references.get_customer_request(customer_id, request_id) is None:
        return None
    with references.atomic():
        locked = references.lock(request_id)
        if locked.status == ReferenceRequestStatus.ACCEPTED:
            raise CANNOT_CANCEL_ACCEPTED
        if locked.status != ReferenceRequestStatus.CANCELLED:
            references.cancel(request_id, status=ReferenceRequestStatus.CANCELLED, changed_at=now)
    return _view(references.get_customer_request(customer_id, request_id), now, settings)
