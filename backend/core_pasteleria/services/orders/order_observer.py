"""Notifica a los observadores cada cambio de estado del pedido (Observer, D68).

`OrderSubject` mantiene los observadores (`subscribe`) y les avisa cada evento (`notify`) sin depender de ellos.
`order_status` lo notifica dentro de la misma transacción que el `UPDATE` condicional del estado (nota de D63): si un
observador falla, el cambio de estado tampoco se guarda.

Observadores de hoy:
- `InventoryObserver`: al entrar en `cancelled`, devuelve las piezas de la vitrina y el pan del día que apartó el pedido
  y borra las imágenes de sus diseños (antes, `EFFECTS_AFTER` de `order_status`). El descuento sigue al crear el pedido
  (`order_service._reserve`), porque decide si el pedido puede existir (D63): el pedido nace `awaiting_payment` con lo
  apartado, así que "lo que ocurra primero" de la arquitectura es siempre la creación.
- `CustomerNotificationObserver`: registra el aviso de cada cambio de estado, después de confirmarse la transacción.
  El correo va aparte (`CustomerEmailObserver`); el registro deja el id del pedido y los dos estados, nunca datos
  personales.
- `StripeCheckoutObserver`: al entrar en `cancelled`, cancela en Stripe los PaymentIntent abiertos del pedido, después
  de confirmarse la transacción (revisión única de D68). La preferencia de Mercado Pago vence sola
  (`expiration_date_to`) y el efectivo no abre nada en una pasarela.

- `StandLoanObserver` (D69): al entrar en `delivered`, presta cada base con depósito del pedido (`StandLoan` `on_loan`,
  fecha límite = día de la entrega + `PolicySettings.stand_return_days`). Con el evento "base devuelta"
  (`StandReturned`), que emite solo `warranty_service.register_stand_return`, la marca `returned` con el depósito
  reembolsado.

- `CustomerEmailObserver` (D70): manda al cliente, después del commit y como mejor esfuerzo, "Recibimos tu pago" al
  entrar en `received`, "Tu pedido está listo" al entrar en `ready_for_delivery`, "Recibimos tu solicitud" con un envío
  de referencia nuevo y "Tu cotización está lista" cuando la pastelería le pone precio. Va aparte de
  `CustomerNotificationObserver`, que solo registra, para que ninguno de los dos acumule los correos, sus plantillas y
  sus fallas.

Cuatro eventos: "estado cambiado" (`StatusChanged`), "base devuelta" (`StandReturned`) y, del envío de referencia que se
vuelve pedido (D70), "referencia recibida" (`ReferenceReceived`) y "cotización lista" (`QuoteReady`). `OrderObserver.update`
los reparte por su tipo a `status_changed`, `stand_returned`, `reference_received` y `quote_ready`, y cada observador
escribe solo los que le importan.

Sin estado global: cada operación arma su sujeto con los repositorios que recibió (`build_order_subject`), así las
pruebas inyectan otros.
"""
import logging
from abc import ABC
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from django.utils import timezone

from ...models import OrderLineKind, OrderStatus
from ...repositories import order_repo, payment_repo, product_repo, settings_repo, stand_loan_repo
# Importa el módulo, no sus nombres: `warranty_service` también importa este módulo para emitir "base devuelta".
from .. import email_service, warranty_service
from ..payments.errors import PaymentError
from ..payments.payment_factory import OPEN_STATUSES, StripePayment

logger = logging.getLogger(__name__)
notification_logger = logging.getLogger("core_pasteleria.notifications")


@dataclass(frozen=True)
class StatusChanged:
    """El pedido pasó de `previous_status` a `new_status`. `actor_id` es quien lo cambió (`None`: el sistema, como un
    webhook verificado o la cancelación de lo vencido)."""

    order_id: int
    previous_status: str
    new_status: str
    actor_id: int | None
    changed_at: datetime


@dataclass(frozen=True)
class StandReturned:
    """El personal `actor_id` registró que la base del préstamo `loan_id` volvió (D64, D69)."""

    order_id: int
    loan_id: int
    actor_id: int
    returned_at: datetime


@dataclass(frozen=True)
class ReferenceReceived:
    """El cliente mandó el envío de referencia `request_id`; queda `in_review` (D70)."""

    request_id: int
    received_at: datetime


@dataclass(frozen=True)
class QuoteReady:
    """El personal `actor_id` le puso precio al envío de referencia `request_id` (`quote_ready`, D70)."""

    request_id: int
    actor_id: int
    quoted_at: datetime


OrderEvent = StatusChanged | StandReturned | ReferenceReceived | QuoteReady


class OrderObserver(ABC):
    """Recibe cada evento del pedido en `update`, dentro de la transacción que lo produjo: un error la deshace.

    `update` lo reparte por su tipo; un observador escribe `status_changed`, `stand_returned` o los dos, y el otro no
    hace nada.
    """

    def update(self, event: OrderEvent) -> None:
        handlers = {
            StatusChanged: self.status_changed,
            StandReturned: self.stand_returned,
            ReferenceReceived: self.reference_received,
            QuoteReady: self.quote_ready,
        }
        handlers[type(event)](event)

    def status_changed(self, event: StatusChanged) -> None:
        return None

    def stand_returned(self, event: StandReturned) -> None:
        return None

    def reference_received(self, event: ReferenceReceived) -> None:
        return None

    def quote_ready(self, event: QuoteReady) -> None:
        return None


class OrderSubject:
    def __init__(self):
        self._observers: list[OrderObserver] = []

    def subscribe(self, observer: OrderObserver) -> None:
        self._observers.append(observer)

    def notify(self, event: OrderEvent) -> None:
        for observer in self._observers:
            observer.update(event)


def _nothing(order_id: int) -> None:
    return None


class InventoryObserver(OrderObserver):
    """Devuelve lo apartado cuando el pedido se cancela (D14, D30 y D63, ronda 2)."""

    def __init__(self, orders=order_repo, products=product_repo):
        self._orders = orders
        self._products = products
        self._effects: dict[str, Callable[[int], None]] = {OrderStatus.CANCELLED: self._give_back}

    def status_changed(self, event: StatusChanged) -> None:
        self._effects.get(event.new_status, _nothing)(event.order_id)

    def _give_back(self, order_id: int) -> None:
        """Devuelve lo que el pedido apartó y borra las imágenes de sus diseños (ya nada las protege).

        En el orden de los candados de la creación: la vitrina por id, el pan por id (sumado, como lo consume la
        creación) y las imágenes.
        """
        lines = self._orders.list_reserved_lines(order_id, showcase_kind=OrderLineKind.SHOWCASE)
        for line in sorted((line for line in lines if line.offering_id is not None), key=lambda line: line.offering_id):
            self._products.restock_showcase(line.offering_id, line.on_date, line.quantity)
        bread: dict[tuple, int] = defaultdict(int)
        for line in lines:
            if line.bread_id is not None:
                bread[(line.bread_id, line.on_date)] += line.quantity
        for (bread_id, on_date), quantity in sorted(bread.items()):
            self._products.release_bread(bread_id, on_date, quantity)
        self._orders.delete_order_images(order_id)


class CustomerNotificationObserver(OrderObserver):
    """Registra el aviso al cliente de cada cambio de estado, solo si la transacción se confirma."""

    def __init__(self, orders=order_repo):
        self._orders = orders

    def status_changed(self, event: StatusChanged) -> None:
        self._orders.on_commit(lambda: self._announce(event))

    @staticmethod
    def _announce(event: StatusChanged) -> None:
        notification_logger.info(
            "Aviso al cliente: el pedido %s pasó de %s a %s",
            event.order_id,
            event.previous_status,
            event.new_status,
            extra={"order_id": event.order_id, "new_status": event.new_status},
        )


class StripeCheckoutObserver(OrderObserver):
    """Cancela en Stripe los PaymentIntent abiertos de un pedido cancelado, para que nadie pueda pagarlo después.

    Dentro de la transacción solo lee qué PaymentIntent quedaron abiertos (`pending` o `failed`); la llamada a Stripe va
    después del commit, sin candados tomados. Es de mejor esfuerzo: si Stripe falla o el PaymentIntent ya se cobró,
    queda un WARNING con el id del pedido y del PaymentIntent y el pedido sigue cancelado (un cobro que ya entró lo deja
    el webhook en `refund_required`). Sin las llaves de Stripe no hace nada.

    La fila `Payment` no cambia de estado: `pending` o `failed` sigue diciendo lo que pasó con el cobro, el pedido
    cancelado ya dice que no se puede pagar, y así un cobro que alcanzó a entrar todavía encuentra su fila abierta.
    """

    def __init__(self, orders=order_repo, payments=payment_repo, processor=StripePayment):
        self._orders = orders
        self._payments = payments
        self._processor = processor
        self._effects: dict[str, Callable[[int], None]] = {OrderStatus.CANCELLED: self._cancel_open_checkouts}

    def status_changed(self, event: StatusChanged) -> None:
        self._effects.get(event.new_status, _nothing)(event.order_id)

    def _cancel_open_checkouts(self, order_id: int) -> None:
        if not self._processor.is_available():
            return
        checkouts = self._payments.list_open_checkouts(order_id, self._processor.method, open_statuses=OPEN_STATUSES)
        if checkouts:
            self._orders.on_commit(lambda: self._cancel_in_stripe(order_id, checkouts))

    def _cancel_in_stripe(self, order_id: int, checkouts: list[str]) -> None:
        for checkout_id in checkouts:
            try:
                self._processor().cancel_checkout(checkout_id)
            except PaymentError as error:
                logger.warning(
                    "No se pudo cancelar en Stripe el PaymentIntent %s del pedido cancelado %s: %s",
                    checkout_id,
                    order_id,
                    error.code,
                    extra={"order_id": order_id, "checkout_id": checkout_id, "method": self._processor.method},
                )


class StandLoanObserver(OrderObserver):
    """Presta las bases al entregar el pedido y las cierra con el evento "base devuelta" (regla 12, D69).

    Solo los diseños con base y depósito (los kilos que llevan base, regla 7) tienen préstamo; un pedido del catálogo
    no. El día de la entrega es el de la pastelería (Ciudad de México) en que el pedido pasó a `delivered`.
    """

    def __init__(self, loans=stand_loan_repo, settings=settings_repo):
        self._loans = loans
        self._settings = settings
        self._effects: dict[str, Callable[[StatusChanged], None]] = {OrderStatus.DELIVERED: self._lend}

    def status_changed(self, event: StatusChanged) -> None:
        self._effects.get(event.new_status, _nothing)(event)

    def _lend(self, event: StatusChanged) -> None:
        stands = self._loans.list_order_stands(event.order_id)
        if not stands:
            return
        delivered_on = timezone.localdate(event.changed_at)
        due_date = warranty_service.return_deadline(delivered_on, warranty_service.stand_return_days(self._settings))
        self._loans.create_loans(event.order_id, stands, delivered_on=delivered_on, due_date=due_date)

    def stand_returned(self, event: StandReturned) -> None:
        # `register_stand_return` ya bloqueó la base y vio que seguía prestada: si el `UPDATE` no la encuentra así, algo
        # la cambió por fuera y la transacción se deshace en vez de reembolsar a ciegas.
        if not self._loans.mark_returned(event.loan_id, returned_at=event.returned_at, actor_id=event.actor_id):
            raise RuntimeError(f"La base {event.loan_id} ya no estaba prestada.")


class CustomerEmailObserver(OrderObserver):
    """Manda los correos al cliente después del commit (D70); si la transacción se deshace, no sale ninguno.

    El correo es de mejor esfuerzo (`email_service`): una falla del SMTP queda en un WARNING y no toca el pedido.
    """

    ORDER_EMAILS = {
        OrderStatus.RECEIVED: email_service.PAYMENT_RECEIVED,
        OrderStatus.READY_FOR_DELIVERY: email_service.ORDER_READY,
    }

    def __init__(self, orders=order_repo, mailer=email_service):
        self._orders = orders
        self._mailer = mailer

    def status_changed(self, event: StatusChanged) -> None:
        kind = self.ORDER_EMAILS.get(event.new_status)
        if kind is not None:
            self._orders.on_commit(lambda: self._mailer.send_order_email(kind, event.order_id))

    def reference_received(self, event: ReferenceReceived) -> None:
        self._orders.on_commit(
            lambda: self._mailer.send_reference_email(email_service.REFERENCE_RECEIVED, event.request_id)
        )

    def quote_ready(self, event: QuoteReady) -> None:
        self._orders.on_commit(lambda: self._mailer.send_reference_email(email_service.QUOTE_READY, event.request_id))


def build_order_subject(orders=order_repo, products=product_repo) -> OrderSubject:
    """El sujeto con los observadores del pedido, sobre los repositorios de quien cambia el estado."""
    subject = OrderSubject()
    subject.subscribe(InventoryObserver(orders, products))
    subject.subscribe(CustomerNotificationObserver(orders))
    subject.subscribe(StripeCheckoutObserver(orders))
    subject.subscribe(StandLoanObserver())
    subject.subscribe(CustomerEmailObserver(orders))
    return subject

