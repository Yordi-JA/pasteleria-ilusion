"""Pagos de los pedidos (D68): iniciar el pago, su estado para la pantalla y los webhooks de Mercado Pago y Stripe.

Las vistas solo coordinan HTTP: la regla vive en `services/payments/payment_service.py` y la pasarela sale de la
fábrica (`create_payment_processor`). Los webhooks no tienen sesión ni CSRF: la firma sobre el cuerpo crudo es la
autenticación, y se verifica antes de leer el JSON. Una firma rechazada deja un WARNING con el método, el motivo y el
`x-request-id` o el `id` del evento (nunca la firma, el secreto ni el cuerpo): un secreto mal configurado se ve en
`heroku logs`.
"""
import logging

from django.urls import reverse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import PaymentMethod
from ..services.payments import payment_service
from ..services.payments.errors import InvalidNotification, PaymentError
from ..services.payments.payment_factory import create_payment_processor
from ..services.payments.results import WebhookRequest
from .parsers import declared_length
from .payment_serializers import (
    PaymentStartSerializer,
    PaymentStateSerializer,
    StartedPaymentSerializer,
    WebhookAckSerializer,
)
from .throttles import PaymentStartUserThrottle, SecurityScopedRateThrottle
from .views import IDEMPOTENCY_KEY, NOT_FOUND, ORDERS_TAG

logger = logging.getLogger(__name__)

PAYMENTS_TAG = "Pagos"
# Las notificaciones de las pasarelas pesan unos cientos de bytes.
WEBHOOK_MAX_BYTES = 64 * 1024
# Ruta del sitio a la que vuelve el cliente desde Checkout Pro (el frontend lee `pedido`).
PAYMENT_PAGE = "/pedido/pago"
WEBHOOK_ROUTES = {
    PaymentMethod.MERCADOPAGO: "payment-webhook-mercadopago",
    PaymentMethod.STRIPE: "payment-webhook-stripe",
}


def _error(error: PaymentError) -> Response:
    return Response({"detail": error.message, "code": error.code}, status=error.status)


def _example(code: str, detail: str, title: str | None = None) -> OpenApiExample:
    return OpenApiExample(title or code, value={"detail": detail, "code": code})


PAYMENT_ERRORS = {
    404: OpenApiResponse(description="El pedido no existe o es de otra cuenta.", examples=[_example("not_found", "No encontrado.")]),
    409: OpenApiResponse(
        description="El pedido ya no espera pago, ya venció (y se canceló) o la llave se usó con otro método.",
        examples=[
            _example("order_not_payable", "Este pedido ya no espera pago."),
            _example("order_expired", "Este pedido venció sin pagarse. Vuelve a hacer tu pedido."),
            _example(
                "idempotency_conflict",
                "Esa llave ya se usó con otro método de pago. Usa una llave nueva para cambiar de método.",
            ),
        ],
    ),
    502: OpenApiResponse(
        description="La pasarela no respondió o respondió con un error. No se guardó nada: se puede reintentar.",
        examples=[_example("gateway_error", "No pudimos conectar con Mercado Pago. Inténtalo de nuevo en unos minutos.")],
    ),
    503: OpenApiResponse(
        description="Faltan las llaves de esa pasarela en el servidor: ese método no se ofrece.",
        examples=[
            _example("method_unavailable", "Por ahora no podemos cobrar con Tarjeta (Stripe). Elige otro método de pago.")
        ],
    ),
}


class OrderPaymentView(APIView):
    def get_throttles(self):
        # Iniciar un pago tiene su cupo por cuenta; consultar el estado (la pantalla lo pide al volver) usa el general.
        if self.request.method == "POST":
            return [PaymentStartUserThrottle()]
        return super().get_throttles()

    @extend_schema(
        operation_id="orders_payment_state",
        summary="Estado del pago de un pedido",
        description=(
            "Lo que necesita la pantalla de pago: el pedido con su desglose (`order.payment`: anticipo, depósito de la "
            "base, lo que se paga hoy y el resto), su estado y su plazo (`order.payment_due_at`), los métodos con su "
            "disponibilidad y el último intento de pago. La pantalla lo vuelve a pedir al regresar de Mercado Pago o "
            "después de confirmar con Stripe: el pedido pasa a `received` solo por el webhook verificado, nunca por la "
            "URL de regreso."
        ),
        responses={200: PaymentStateSerializer, 404: NOT_FOUND},
        tags=[PAYMENTS_TAG, ORDERS_TAG],
    )
    def get(self, request, order_id):
        try:
            state = payment_service.payment_state(request.user.pk, order_id)
        except PaymentError as error:
            return _error(error)
        return Response(PaymentStateSerializer(state).data)

    @extend_schema(
        operation_id="orders_payment_start",
        summary="Pagar un pedido",
        description=(
            "Exige sesión (JWT) y `Idempotency-Key` (una llave nueva por intento de pago y método). Solo el dueño, solo "
            "un pedido `awaiting_payment` que no ha vencido. El monto es siempre `pay_today` del servidor; cualquier "
            "monto del cuerpo se ignora. `mercadopago` devuelve `redirect_url` (Checkout Pro); `stripe`, el "
            "`client_secret` del PaymentIntent para Stripe Elements; `cash` deja el pedido apartado y extiende "
            "`payment_due_at` al cierre del día, sin pasar del inicio del lapso. Con la misma llave responde el mismo "
            "intento (200) sin volver a cobrar. Throttle propio por cuenta (`payments_user`)."
        ),
        request=PaymentStartSerializer,
        responses={
            201: StartedPaymentSerializer,
            200: OpenApiResponse(StartedPaymentSerializer, description="Ya existía un intento con esa llave: es ese."),
            400: OpenApiResponse(
                description="Falta la llave o el método no existe.",
                examples=[
                    OpenApiExample("Sin llave", value={"idempotency_key": ["Falta el encabezado Idempotency-Key o no es válido."]}),
                    OpenApiExample("Método desconocido", value={"method": ['"bitcoin" no es una elección válida.']}),
                ],
            ),
            **PAYMENT_ERRORS,
        },
        tags=[PAYMENTS_TAG, ORDERS_TAG],
    )
    def post(self, request, order_id):
        key = request.headers.get("Idempotency-Key", "")
        if not IDEMPOTENCY_KEY.fullmatch(key):
            raise ValidationError({"idempotency_key": ["Falta el encabezado Idempotency-Key o no es válido."]})
        serializer = PaymentStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data["method"]
        route = WEBHOOK_ROUTES.get(method)
        urls = payment_service.CheckoutUrls(
            back_url=request.build_absolute_uri(f"{PAYMENT_PAGE}?pedido={order_id}"),
            notification_url=request.build_absolute_uri(reverse(route)) if route else "",
        )
        try:
            started = payment_service.start_payment(request.user.pk, order_id, method, key, urls)
        except PaymentError as error:
            return _error(error)
        code = status.HTTP_201_CREATED if started.created else status.HTTP_200_OK
        return Response(StartedPaymentSerializer(started).data, status=code)


class PaymentWebhookView(APIView):
    """Base de los dos webhooks. Sin autenticación ni CSRF: la firma es la autenticación."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [SecurityScopedRateThrottle]
    throttle_scope = "payment_webhooks"
    method = ""

    def post(self, request):
        length = declared_length(request)
        if length is not None and length > WEBHOOK_MAX_BYTES:
            return Response({"detail": "La petición es demasiado grande."}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        webhook = WebhookRequest(
            body=request.body,
            headers={name.lower(): value for name, value in request.headers.items()},
            query={name: request.query_params.get(name) for name in request.query_params},
        )
        try:
            notice = create_payment_processor(self.method).read_notification(webhook)
        except InvalidNotification as error:
            logger.warning(
                "Firma de webhook rechazada: %s, motivo %s, referencia %s",
                self.method,
                error.reason,
                error.reference or "-",
                extra={"method": self.method, "reason": error.reason, "reference": error.reference},
            )
            return _error(error)
        except PaymentError as error:
            return _error(error)
        payment_service.apply_notice(notice)
        return Response({"received": True})


WEBHOOK_RESPONSES = {
    200: OpenApiResponse(
        WebhookAckSerializer,
        description=(
            "Firma válida: la notificación se procesó, se ignoró (otro evento o un pago pendiente) o ya se había "
            "procesado. Un pago que no se puede aplicar queda para reembolso; siempre 200, para que la pasarela no "
            "reintente."
        ),
    ),
    400: OpenApiResponse(
        description="Firma ausente, inválida o con `ts` viejo: no se cambió nada.",
        examples=[_example("invalid_signature", "La firma de la notificación no es válida.")],
    ),
    502: OpenApiResponse(description="No se pudo consultar el pago en la pasarela; la pasarela reintenta."),
    503: OpenApiResponse(description="Faltan las llaves de esa pasarela en el servidor."),
}


class MercadoPagoWebhookView(PaymentWebhookView):
    method = PaymentMethod.MERCADOPAGO

    @extend_schema(
        operation_id="payments_webhook_mercadopago",
        summary="Webhook de Mercado Pago",
        description=(
            "Notificaciones de Webhooks (no IPN) de Mercado Pago. Verifica `x-signature` (`ts` y `v1`) con HMAC-SHA256 "
            "del manifiesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` y la clave secreta, en tiempo constante, "
            "y rechaza un `ts` de hace más de 5 minutos. Después consulta el pago en la API y solo lo da por bueno si "
            "está aprobado, su `external_reference` es el pedido y el monto y la moneda (MXN) son los esperados."
        ),
        request=OpenApiTypes.OBJECT,
        responses=WEBHOOK_RESPONSES,
        tags=[PAYMENTS_TAG],
    )
    def post(self, request):
        return super().post(request)


class StripeWebhookView(PaymentWebhookView):
    method = PaymentMethod.STRIPE

    @extend_schema(
        operation_id="payments_webhook_stripe",
        summary="Webhook de Stripe",
        description=(
            "Eventos `payment_intent.succeeded` y `payment_intent.payment_failed`, verificados con "
            "`stripe.Webhook.construct_event` sobre el cuerpo crudo y `Stripe-Signature` (tolerancia de 300 s). Revisa "
            "el monto, la moneda y el pedido de `metadata.order_id`. Los demás eventos se ignoran con 200."
        ),
        request=OpenApiTypes.OBJECT,
        responses=WEBHOOK_RESPONSES,
        tags=[PAYMENTS_TAG],
    )
    def post(self, request):
        return super().post(request)
