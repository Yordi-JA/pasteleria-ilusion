"""Adapter de Mercado Pago (Checkout Pro): es el único módulo que importa el SDK `mercadopago` (D68).

Crea la preferencia con lo que el servidor calculó y traduce las respuestas del SDK a `PaymentResult` y
`PaymentNotice`. La firma del webhook la revisa `WebhookSignatureValidator` del propio SDK (HMAC-SHA256 del manifiesto
`id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con la clave secreta y `hmac.compare_digest`, confirmado en
`mercadopago/webhook/validator.py` de la versión instalada). La antigüedad de `ts` se revisa aquí: el validador la
calcula como segundos aunque su docstring dice milisegundos, así que se aceptan las dos formas.

Después de la firma se consulta el pago en la API: el cuerpo del webhook no se cree, solo el id firmado.
"""
import time
from decimal import Decimal, InvalidOperation

import mercadopago
import requests
from django.conf import settings
from mercadopago.config import RequestOptions
from mercadopago.webhook import InvalidWebhookSignatureError, SignatureFailureReason, WebhookSignatureValidator

from ...models import PaymentMethod, PaymentStatus
from .errors import InvalidNotification, PaymentGatewayError, PaymentNotConfigured, SignatureRejection
from .results import CENT, ChargeRequest, PaymentNotice, PaymentResult, WebhookRequest

# Un Mercado Pago lento no debe ocupar un worker; el webhook tiene 22 s para responder.
TIMEOUT_SECONDS = 10.0
MAX_RETRIES = 1
# Una notificación firmada hace más de 5 minutos (o con el reloj adelantado) se rechaza.
SIGNATURE_TOLERANCE_SECONDS = 300
# Un `ts` con 13 dígitos o más está en milisegundos.
MILLISECONDS_FROM = 10**12
# Lo que se da por bueno o por rechazado; lo demás (pendiente, en proceso) se ignora hasta otra notificación.
PAYMENT_OUTCOMES = {
    "approved": PaymentStatus.SUCCEEDED,
    "rejected": PaymentStatus.FAILED,
    "cancelled": PaymentStatus.FAILED,
}
# El pedido vence en minutos: sin pagos que se acreditan días después (OXXO, cajeros).
EXCLUDED_PAYMENT_TYPES = ({"id": "ticket"}, {"id": "atm"})
METHOD = PaymentMethod.MERCADOPAGO
# Cada motivo del validador del SDK, como lo registra `payment_views` al rechazar la firma.
SIGNATURE_REJECTIONS = {
    SignatureFailureReason.MISSING_SIGNATURE_HEADER: SignatureRejection.MISSING,
    SignatureFailureReason.MALFORMED_SIGNATURE_HEADER: SignatureRejection.MALFORMED,
    SignatureFailureReason.MISSING_TIMESTAMP: SignatureRejection.MALFORMED,
    SignatureFailureReason.MISSING_HASH: SignatureRejection.MALFORMED,
    SignatureFailureReason.SIGNATURE_MISMATCH: SignatureRejection.MISMATCH,
    SignatureFailureReason.TIMESTAMP_OUT_OF_TOLERANCE: SignatureRejection.STALE,
}


def _decimal(value) -> Decimal | None:
    try:
        return Decimal(str(value)).quantize(CENT)
    except (InvalidOperation, TypeError, ValueError):
        return None


def _signature_parts(header: str) -> dict[str, str]:
    """`ts=...,v1=...` en un diccionario, con las llaves en minúsculas como las lee el validador del SDK."""
    pairs = (part.split("=", 1) for part in header.split(",") if "=" in part)
    return {key.strip().lower(): value.strip() for key, value in pairs}


def _seconds(ts: str) -> float:
    value = int(ts)
    return value / 1000 if value >= MILLISECONDS_FROM else value


class MercadoPagoAdapter:
    def __init__(self, access_token: str, webhook_secret: str, sdk=None):
        self._access_token = access_token
        self._webhook_secret = webhook_secret
        self._sdk = sdk or mercadopago.SDK(access_token)

    @staticmethod
    def configured() -> bool:
        """El cobro y su webhook necesitan las dos llaves: sin la clave secreta, ningún pago se confirmaría."""
        return bool(settings.MERCADOPAGO_ACCESS_TOKEN and settings.MERCADOPAGO_WEBHOOK_SECRET)

    @classmethod
    def from_settings(cls) -> "MercadoPagoAdapter":
        if not cls.configured():
            raise PaymentNotConfigured(METHOD)
        return cls(settings.MERCADOPAGO_ACCESS_TOKEN, settings.MERCADOPAGO_WEBHOOK_SECRET)

    def _options(self, idempotency_key: str | None = None) -> RequestOptions:
        headers = {"x-idempotency-key": idempotency_key} if idempotency_key else None
        return RequestOptions(
            access_token=self._access_token,
            connection_timeout=TIMEOUT_SECONDS,
            max_retries=MAX_RETRIES,
            custom_headers=headers,
        )

    def _call(self, request):
        """Una llamada al SDK; un error de red o una respuesta que no es 2xx es `PaymentGatewayError`."""
        try:
            answer = request()
        except (requests.RequestException, mercadopago.MercadoPagoError) as error:
            raise PaymentGatewayError(METHOD) from error
        if not isinstance(answer, dict) or not 200 <= answer.get("status", 0) < 300 or not answer.get("response"):
            raise PaymentGatewayError(METHOD)
        return answer["response"]

    def create_checkout(self, amount: Decimal, request: ChargeRequest) -> PaymentResult:
        preference = {
            "items": [
                {
                    "id": f"pedido-{request.order_id}",
                    "title": request.description,
                    "quantity": 1,
                    "unit_price": float(amount),
                    "currency_id": request.currency,
                }
            ],
            "external_reference": str(request.order_id),
            "back_urls": {"success": request.back_url, "failure": request.back_url, "pending": request.back_url},
            "auto_return": "approved",
            # `source_news=webhooks`: solo notificaciones de Webhooks (firmadas), no las de IPN.
            "notification_url": f"{request.notification_url}?source_news=webhooks",
            "binary_mode": True,
            "payment_methods": {"excluded_payment_types": list(EXCLUDED_PAYMENT_TYPES), "installments": 1},
        }
        if request.expires_at is not None:
            preference.update(expires=True, expiration_date_to=request.expires_at.isoformat(timespec="milliseconds"))
        options = self._options(request.provider_idempotency_key)
        response = self._call(lambda: self._sdk.preference().create(preference, options))
        if not response.get("id") or not response.get("init_point"):
            raise PaymentGatewayError(METHOD)
        return PaymentResult(
            order_id=request.order_id,
            method=METHOD,
            status=PaymentStatus.PENDING,
            amount=amount,
            currency=request.currency,
            checkout_id=str(response["id"]),
            redirect_url=response["init_point"],
        )

    def verify_notification(self, request: WebhookRequest, *, now: float | None = None) -> str | None:
        """El id del pago que hay que consultar, si la notificación es de un pago; `None` si es de otra cosa.

        Firma ausente, mal formada, que no coincide o con `ts` fuera de la tolerancia: `InvalidNotification`.
        """
        data_id = request.query.get("data.id")
        request_id = request.headers.get("x-request-id")
        try:
            WebhookSignatureValidator.validate(
                request.headers.get("x-signature"),
                request_id,
                data_id,
                self._webhook_secret,
            )
        except InvalidWebhookSignatureError as error:
            reason = SIGNATURE_REJECTIONS.get(error.reason, SignatureRejection.UNKNOWN)
            raise InvalidNotification(reason, request_id) from error
        ts = _signature_parts(request.headers["x-signature"]).get("ts", "")
        now = time.time() if now is None else now
        if abs(now - _seconds(ts)) > SIGNATURE_TOLERANCE_SECONDS:
            raise InvalidNotification(SignatureRejection.STALE, request_id)
        topic = request.query.get("type") or request.json().get("type")
        return data_id if topic == "payment" and data_id else None

    def fetch_payment(self, payment_id: str) -> PaymentNotice | None:
        """Lo que la API de Mercado Pago dice del pago; `None` si no está aprobado ni rechazado todavía."""
        payment = self._call(lambda: self._sdk.payment().get(payment_id, self._options()))
        outcome = PAYMENT_OUTCOMES.get(payment.get("status"))
        if outcome is None:
            return None
        reference = str(payment.get("external_reference") or "")
        return PaymentNotice(
            method=METHOD,
            outcome=outcome,
            order_id=int(reference) if reference.isdigit() else None,
            provider_payment_id=str(payment.get("id") or payment_id),
            checkout_id="",
            amount=_decimal(payment.get("transaction_amount")),
            currency=str(payment.get("currency_id") or ""),
        )
