"""Adapter de Stripe: es el único módulo que importa el SDK `stripe` (D68).

El servidor crea un PaymentIntent en MXN (en centavos) con métodos automáticos y sin redirecciones (el Dashboard decide
cuáles; el Card Element no los necesita), con el id del pedido en `metadata` y una llave de idempotencia; el navegador
lo confirma con Stripe Elements y los datos de la tarjeta nunca pasan por aquí. El
webhook se verifica con `stripe.Webhook.construct_event` sobre el cuerpo crudo y `Stripe-Signature` (tolerancia de
300 s del SDK). Usa un `StripeClient` propio, no `stripe.api_key`: nada de estado global. Cuando el pedido se cancela,
`cancel` cancela el PaymentIntent para que ya no se pueda confirmar (`StripeCheckoutObserver`).
"""
from decimal import Decimal

import stripe
from django.conf import settings

from ...models import PaymentMethod, PaymentStatus
from .errors import InvalidNotification, PaymentGatewayError, PaymentNotConfigured, SignatureRejection
from .results import CENT, ChargeRequest, PaymentNotice, PaymentResult, WebhookRequest

TIMEOUT_SECONDS = 10
MAX_NETWORK_RETRIES = 1
# Stripe ya no acepta `payment_method_types`: los métodos salen del Dashboard. Sin redirecciones, para que solo queden
# los que el Card Element confirma con `confirmCardPayment` sin `return_url`.
AUTOMATIC_PAYMENT_METHODS = {"enabled": True, "allow_redirects": "never"}
EVENT_OUTCOMES = {
    "payment_intent.succeeded": PaymentStatus.SUCCEEDED,
    "payment_intent.payment_failed": PaymentStatus.FAILED,
}
METHOD = PaymentMethod.STRIPE
# El pedido venció sin pagarse o lo canceló el personal: uno de los motivos que acepta Stripe.
CANCELLATION_REASON = "abandoned"


def to_cents(amount: Decimal) -> int:
    return int((amount / CENT).to_integral_value())


def from_cents(cents) -> Decimal | None:
    return (Decimal(cents) * CENT).quantize(CENT) if isinstance(cents, int) else None


def _well_formed(header: str) -> bool:
    """`t=<entero>,v1=<firma>`, como lo lee el SDK."""
    parts = [item.split("=", 1) for item in header.split(",") if "=" in item]
    timestamps = [value for key, value in parts if key == "t"]
    return bool(timestamps) and timestamps[0].isdigit() and any(key == "v1" for key, _ in parts)


def _rejection(body: bytes, header: str | None, secret: str) -> SignatureRejection:
    """Por qué `construct_event` rechazó la firma, sin leer el mensaje del SDK (trae la firma y el cuerpo): una firma
    bien formada que coincide sin revisar la hora solo pudo fallar por la ventana de 300 s."""
    if not header:
        return SignatureRejection.MISSING
    if not _well_formed(header):
        return SignatureRejection.MALFORMED
    try:
        stripe.WebhookSignature.verify_header(body, header, secret, tolerance=None)
    except stripe.SignatureVerificationError:
        return SignatureRejection.MISMATCH
    return SignatureRejection.STALE


class StripeAdapter:
    def __init__(self, secret_key: str, webhook_secret: str, client=None):
        self._webhook_secret = webhook_secret
        self._client = client or stripe.StripeClient(
            secret_key,
            max_network_retries=MAX_NETWORK_RETRIES,
            http_client=stripe.RequestsClient(timeout=TIMEOUT_SECONDS),
        )

    @staticmethod
    def configured() -> bool:
        """El cobro y su webhook necesitan las dos llaves: sin el secreto del webhook, ningún pago se confirmaría."""
        return bool(settings.STRIPE_SECRET_KEY and settings.STRIPE_WEBHOOK_SECRET)

    @classmethod
    def from_settings(cls) -> "StripeAdapter":
        if not cls.configured():
            raise PaymentNotConfigured(METHOD)
        return cls(settings.STRIPE_SECRET_KEY, settings.STRIPE_WEBHOOK_SECRET)

    def _result(self, order_id: int, intent) -> PaymentResult:
        return PaymentResult(
            order_id=order_id,
            method=METHOD,
            status=PaymentStatus.PENDING,
            amount=from_cents(intent["amount"]),
            currency=str(intent["currency"]).upper(),
            checkout_id=intent["id"],
            client_secret=intent["client_secret"],
        )

    def create_checkout(self, amount: Decimal, request: ChargeRequest) -> PaymentResult:
        params = {
            "amount": to_cents(amount),
            "currency": request.currency.lower(),
            "automatic_payment_methods": AUTOMATIC_PAYMENT_METHODS,
            "metadata": {"order_id": str(request.order_id)},
            "description": request.description,
        }
        try:
            intent = self._client.v1.payment_intents.create(
                params=params, options={"idempotency_key": request.provider_idempotency_key}
            )
        except stripe.StripeError as error:
            raise PaymentGatewayError(METHOD) from error
        return self._result(request.order_id, intent)

    def resume(self, order_id: int, checkout_id: str) -> PaymentResult:
        """El PaymentIntent que ya existe, con su `client_secret` (que no se guarda)."""
        try:
            intent = self._client.v1.payment_intents.retrieve(checkout_id)
        except stripe.StripeError as error:
            raise PaymentGatewayError(METHOD) from error
        return self._result(order_id, intent)

    def cancel(self, checkout_id: str) -> None:
        """Cancela el PaymentIntent: ya no se puede confirmar. Si ya se cobró o ya estaba cancelado, Stripe responde
        con un error y es `PaymentGatewayError`.

        No lleva la llave de idempotencia derivada del cobro: esa ya se usó para crear el PaymentIntent y Stripe la
        rechazaría en otra petición. El SDK pone una propia a cada POST, la misma en su reintento.
        """
        try:
            self._client.v1.payment_intents.cancel(checkout_id, params={"cancellation_reason": CANCELLATION_REASON})
        except stripe.StripeError as error:
            raise PaymentGatewayError(METHOD) from error

    def read_notification(self, request: WebhookRequest) -> PaymentNotice | None:
        """El pago del evento, si es uno de los que se atienden; `None` para los demás. Firma inválida, ausente o
        vieja: `InvalidNotification`, con el motivo y el `id` del evento (sin confiar en él) para el registro."""
        header = request.headers.get("stripe-signature")
        try:
            event = stripe.Webhook.construct_event(request.body, header, self._webhook_secret)
        except stripe.SignatureVerificationError as error:
            reason = _rejection(request.body, header, self._webhook_secret)
            raise InvalidNotification(reason, request.json().get("id")) from error
        except ValueError as error:
            # El cuerpo no es UTF-8 o, con la firma válida, no es JSON.
            raise InvalidNotification(SignatureRejection.BAD_BODY) from error
        # Ya verificado: se lee como diccionario (los `StripeObject` de la versión 17 no tienen `.get`).
        event = event.to_dict()
        outcome = EVENT_OUTCOMES.get(event.get("type"))
        if outcome is None:
            return None
        intent = event["data"]["object"]
        reference = str((intent.get("metadata") or {}).get("order_id") or "")
        return PaymentNotice(
            method=METHOD,
            outcome=outcome,
            order_id=int(reference) if reference.isdigit() else None,
            provider_payment_id=intent["id"],
            checkout_id=intent["id"],
            amount=from_cents(intent.get("amount")),
            currency=str(intent.get("currency") or "").upper(),
        )
