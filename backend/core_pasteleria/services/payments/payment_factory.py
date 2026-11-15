"""Fábrica de procesadores de pago con registro (Factory Method + Adapter, D68).

`create_payment_processor(payment_type)` busca la clase en `PAYMENT_GATEWAY_REGISTRY` y devuelve una instancia de
`BasePayment`; nunca elige la pasarela con `if/elif` (Patrón Cosmético). El registro es una constante de solo lectura
(`MappingProxyType`): no es estado global. Agregar una pasarela es agregar una clase y una entrada.

`MercadoPagoPayment` y `StripePayment` delegan en `MercadoPagoAdapter` y `StripeAdapter`, los únicos módulos que
importan los SDK. `CashPayment` no tiene adaptador: no cobra nada y el pedido sigue apartado hasta que el personal
registra el cobro en el admin (`payment_service.register_cash_payment`).

`charge(amount, payload)` es el mismo para todas, auditado con `@audit_operation` (el id del pedido, el método y el
estado; nunca el monto, la llave, el `client_secret` ni datos personales), y llama al `_charge` de cada una. El monto
siempre lo calcula el servidor (`Order.pay_today`); el `payload` es un `ChargeRequest`.
"""
from abc import ABC, abstractmethod
from dataclasses import replace
from decimal import Decimal
from types import MappingProxyType

from ...models import PaymentMethod, PaymentStatus
from ...repositories.records import PaymentRecord
from ..audit import audit_operation
from .errors import InvalidNotification, PaymentNotConfigured, UnknownPaymentMethod
from .mercadopago_adapter import MercadoPagoAdapter
from .results import ChargeRequest, PaymentNotice, PaymentResult, WebhookRequest
from .stripe_adapter import StripeAdapter

# Un intento que todavía puede pagarse; `succeeded` y `refund_required` ya no cambian. Vive aquí y no en
# `payment_service` porque también lo usa `order_observer`, que `payment_service` importa por `order_status`.
OPEN_STATUSES = (PaymentStatus.PENDING, PaymentStatus.FAILED)


def _describe_charge(result: PaymentResult) -> dict:
    return {"order_id": result.order_id, "method": result.method, "status": result.status}


class BasePayment(ABC):
    method: str
    # Se paga en la pastelería: el plazo para pagar se extiende al cierre del día (regla 10).
    pays_at_the_store = False

    @classmethod
    def is_available(cls) -> bool:
        """Si este método se puede ofrecer (sus llaves están en el entorno)."""
        return True

    @audit_operation(expected_errors=(PaymentNotConfigured,), describe=_describe_charge)
    def charge(self, amount: Decimal, payload: ChargeRequest) -> PaymentResult:
        """Inicia el cobro de `amount` (calculado por el servidor) para el pedido de `payload`."""
        return self._charge(amount, payload)

    @abstractmethod
    def _charge(self, amount: Decimal, payload: ChargeRequest) -> PaymentResult:
        """El cobro de cada pasarela."""

    def resume(self, payment: PaymentRecord) -> PaymentResult:
        """El cobro que ya se inició con la misma llave, sin cobrar otra vez: lo que quedó guardado."""
        return PaymentResult(
            order_id=payment.order_id,
            method=payment.method,
            status=payment.status,
            amount=payment.amount,
            currency=payment.currency,
            checkout_id=payment.checkout_id,
            redirect_url=payment.redirect_url,
        )

    def read_notification(self, request: WebhookRequest) -> PaymentNotice | None:
        """El pago que confirma un webhook ya verificado; `None` si el evento no es de un pago que se atiende."""
        raise InvalidNotification


class CashPayment(BasePayment):
    """Efectivo en la pastelería: sin pasarela ni adaptador. El pedido queda apartado (`awaiting_payment`)."""

    method = PaymentMethod.CASH
    pays_at_the_store = True

    def _charge(self, amount: Decimal, payload: ChargeRequest) -> PaymentResult:
        return PaymentResult(
            order_id=payload.order_id, method=self.method, status=PaymentStatus.PENDING, amount=amount,
            currency=payload.currency,
        )


class MercadoPagoPayment(BasePayment):
    """Checkout Pro: el servidor crea la preferencia y el cliente paga en la página de Mercado Pago."""

    method = PaymentMethod.MERCADOPAGO

    def __init__(self, adapter: MercadoPagoAdapter | None = None):
        self._adapter = adapter or MercadoPagoAdapter.from_settings()

    @classmethod
    def is_available(cls) -> bool:
        return MercadoPagoAdapter.configured()

    def _charge(self, amount: Decimal, payload: ChargeRequest) -> PaymentResult:
        return self._adapter.create_checkout(amount, payload)

    def read_notification(self, request: WebhookRequest) -> PaymentNotice | None:
        payment_id = self._adapter.verify_notification(request)
        return self._adapter.fetch_payment(payment_id) if payment_id else None


class StripePayment(BasePayment):
    """Tarjeta con Stripe Elements: el servidor crea el PaymentIntent y el navegador lo confirma con Stripe."""

    method = PaymentMethod.STRIPE

    def __init__(self, adapter: StripeAdapter | None = None):
        self._adapter = adapter or StripeAdapter.from_settings()

    @classmethod
    def is_available(cls) -> bool:
        return StripeAdapter.configured()

    def _charge(self, amount: Decimal, payload: ChargeRequest) -> PaymentResult:
        return self._adapter.create_checkout(amount, payload)

    def resume(self, payment: PaymentRecord) -> PaymentResult:
        # El `client_secret` no se guarda: se vuelve a pedir el mismo PaymentIntent.
        resumed = self._adapter.resume(payment.order_id, payment.checkout_id)
        return replace(resumed, status=payment.status)

    def read_notification(self, request: WebhookRequest) -> PaymentNotice | None:
        return self._adapter.read_notification(request)

    def cancel_checkout(self, checkout_id: str) -> None:
        """Cancela el PaymentIntent de un pedido cancelado; si Stripe no puede, `PaymentGatewayError`."""
        self._adapter.cancel(checkout_id)


PAYMENT_GATEWAY_REGISTRY: MappingProxyType[str, type[BasePayment]] = MappingProxyType(
    {
        PaymentMethod.MERCADOPAGO: MercadoPagoPayment,
        PaymentMethod.STRIPE: StripePayment,
        PaymentMethod.CASH: CashPayment,
    }
)


def create_payment_processor(payment_type: str) -> BasePayment:
    """La instancia del procesador registrado para `payment_type`. Sin sus llaves en el entorno,
    `PaymentNotConfigured`; un tipo que no está en el registro, `UnknownPaymentMethod`."""
    try:
        processor_class = PAYMENT_GATEWAY_REGISTRY[payment_type]
    except KeyError:
        raise UnknownPaymentMethod from None
    return processor_class()
