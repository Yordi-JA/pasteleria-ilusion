"""Envío de referencia, su cotización y la cancelación por el cliente (D70). Todas exigen sesión (JWT) y son del dueño:
una solicitud o un pedido ajeno responden 404."""
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services.errors import DomainValidationError
from ..services.orders import cancellation_service, reference_service
from .reference_serializers import (
    CancellationSerializer,
    CancelledOrderSerializer,
    OrderCancelSerializer,
    QuoteAcceptSerializer,
    ReferenceRequestCreateSerializer,
    ReferenceRequestSerializer,
)
from .serializers import OrderSerializer
from .throttles import (
    OrderCancelUserThrottle,
    OrderRetryUserThrottle,
    ReferenceAcceptUserThrottle,
    ReferenceCreateUserThrottle,
)
from .views import IDEMPOTENCY_HEADER, IDEMPOTENCY_KEY, NOT_FOUND, ORDERS_TAG

REFERENCES_TAG = "Envío de referencia"
MISSING_KEY = {"idempotency_key": ["Falta el encabezado Idempotency-Key o no es válido."]}


def _key(request) -> str:
    key = request.headers.get("Idempotency-Key", "")
    if not IDEMPOTENCY_KEY.fullmatch(key):
        raise ValidationError(MISSING_KEY)
    return key


def _conflict(error) -> Response:
    return Response({"detail": error.message, "code": error.code}, status=status.HTTP_409_CONFLICT)


def _example(code: str, detail: str) -> OpenApiExample:
    return OpenApiExample(code, value={"detail": detail, "code": code})


FIELD_ERRORS = OpenApiResponse(description="Errores por campo, en español (como `POST orders/`).")


class ReferenceRequestListCreateView(ListAPIView):
    serializer_class = ReferenceRequestSerializer

    def get_queryset(self):
        return reference_service.list_requests(self.request.user.pk)

    def get_throttles(self):
        # Enviar tiene su cupo por cuenta; un reintento con una llave que ya tiene solicitud usa el de los reintentos.
        if self.request.method != "POST":
            return super().get_throttles()
        key = self.request.headers.get("Idempotency-Key", "")
        if (
            self.request.user.is_authenticated
            and IDEMPOTENCY_KEY.fullmatch(key)
            and reference_service.has_request_with_key(self.request.user.pk, key)
        ):
            return [OrderRetryUserThrottle()]
        return [ReferenceCreateUserThrottle()]

    @extend_schema(
        operation_id="reference_requests_list",
        summary="Mis solicitudes de cotización",
        description="Los envíos de referencia de quien inició sesión, del más nuevo al más viejo, paginados.",
        tags=[REFERENCES_TAG],
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        operation_id="reference_requests_create",
        summary="Enviar una referencia",
        description=(
            "Exige sesión (JWT) y `Idempotency-Key`. Las fotos se suben antes con `POST customer-images/` y "
            "`purpose=reference`: de 1 a `UploadSettings.max_reference_images` (hoy 3), del cliente y sin usar. La "
            "fecha del evento lleva la anticipación de 2 días (`custom_lead_days`) y no pasa de `max_days_ahead`. No "
            "se cobra nada: nace `in_review` y el cliente recibe \"Recibimos tu solicitud\". Un cliente tiene como "
            "mucho `max_quote_orders_per_customer` (1) solicitudes en revisión. Con la misma llave responde la que ya "
            "existe (200), aunque traiga otro cuerpo."
        ),
        parameters=[IDEMPOTENCY_HEADER],
        request=ReferenceRequestCreateSerializer,
        responses={
            201: ReferenceRequestSerializer,
            200: OpenApiResponse(ReferenceRequestSerializer, description="Ya existía una solicitud con esa llave."),
            400: FIELD_ERRORS,
        },
        tags=[REFERENCES_TAG],
    )
    def post(self, request):
        key = _key(request)
        existing = reference_service.find_request_by_key(request.user.pk, key)
        if existing is not None:
            return Response(ReferenceRequestSerializer(existing).data, status=status.HTTP_200_OK)
        serializer = ReferenceRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            record, created = reference_service.submit_request(request.user.pk, serializer.to_submission(key))
        except DomainValidationError as error:
            raise ValidationError(error.errors) from error
        return Response(
            ReferenceRequestSerializer(reference_service.view(record)).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ReferenceRequestDetailView(APIView):
    @extend_schema(
        operation_id="reference_requests_detail",
        summary="Una solicitud de cotización",
        description="La solicitud, con su cotización si ya la tiene (`/cuenta/cotizaciones/:id`); una ajena responde 404.",
        responses={200: ReferenceRequestSerializer, 404: NOT_FOUND},
        tags=[REFERENCES_TAG],
    )
    def get(self, request, request_id):
        view = reference_service.get_request(request.user.pk, request_id)
        if view is None:
            raise NotFound("No encontrado.")
        return Response(ReferenceRequestSerializer(view).data)


class ReferenceQuoteAcceptView(APIView):
    throttle_classes = [ReferenceAcceptUserThrottle]

    @extend_schema(
        operation_id="reference_requests_accept",
        summary="Aceptar la cotización (\"Aceptar y pagar\")",
        description=(
            "Exige `Idempotency-Key`. El día es el del evento (fijo): el cliente elige el lapso de ese día (de "
            "`GET delivery-slots/?start=<día>&end=<día>&kind=reference`) y quién recoge. El servidor revisa la agenda "
            "en ese momento y crea un pedido normal en `awaiting_payment` con una línea `reference` del precio "
            "cotizado; se paga con `POST orders/<id>/payment/` y el anticipo de siempre. Con la solicitud ya aceptada "
            "responde su pedido (200). La llave queda como la del pedido."
        ),
        parameters=[IDEMPOTENCY_HEADER],
        request=QuoteAcceptSerializer,
        responses={
            201: OrderSerializer,
            200: OpenApiResponse(OrderSerializer, description="La cotización ya se había aceptado: es su pedido."),
            400: FIELD_ERRORS,
            404: NOT_FOUND,
            409: OpenApiResponse(
                description="La solicitud no tiene cotización, ya venció o la llave es de otro pedido.",
                examples=[
                    _example(reference_service.QUOTE_NOT_READY.code, reference_service.QUOTE_NOT_READY.message),
                    _example(reference_service.QUOTE_EXPIRED.code, reference_service.QUOTE_EXPIRED.message),
                    _example(reference_service.KEY_IN_USE.code, reference_service.KEY_IN_USE.message),
                ],
            ),
        },
        tags=[REFERENCES_TAG],
    )
    def post(self, request, request_id):
        key = _key(request)
        serializer = QuoteAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = reference_service.accept_quote(request.user.pk, request_id, serializer.to_acceptance(key))
        except reference_service.ReferenceConflict as error:
            return _conflict(error)
        except DomainValidationError as error:
            raise ValidationError(error.errors) from error
        if result is None:
            raise NotFound("No encontrado.")
        order, created = result
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ReferenceRequestCancelView(APIView):
    throttle_classes = [OrderCancelUserThrottle]

    @extend_schema(
        operation_id="reference_requests_cancel",
        summary="Cancelar una solicitud de cotización",
        description=(
            "Sin cobro, en revisión o con cotización; sus fotos se borran. Una ya cancelada responde igual (200). Una "
            "aceptada ya es un pedido: se cancela con `POST orders/<id>/cancel/` (409)."
        ),
        request=None,
        responses={
            200: ReferenceRequestSerializer,
            404: NOT_FOUND,
            409: OpenApiResponse(
                examples=[
                    _example(
                        reference_service.CANNOT_CANCEL_ACCEPTED.code, reference_service.CANNOT_CANCEL_ACCEPTED.message
                    )
                ]
            ),
        },
        tags=[REFERENCES_TAG],
    )
    def post(self, request, request_id):
        try:
            view = reference_service.cancel_request(request.user.pk, request_id)
        except reference_service.ReferenceConflict as error:
            return _conflict(error)
        if view is None:
            raise NotFound("No encontrado.")
        return Response(ReferenceRequestSerializer(view).data)


class OrderCancelView(APIView):
    def get_throttles(self):
        # Ver la vista previa usa el cupo general; cancelar, el suyo.
        return [OrderCancelUserThrottle()] if self.request.method == "POST" else super().get_throttles()

    @extend_schema(
        operation_id="orders_cancel_preview",
        summary="Qué pasa si cancelo mi pedido",
        description=(
            "Antes de confirmar: si se puede cancelar y cuánto se retiene y se devuelve. Se cancela en cualquier "
            "momento antes de la entrega (D70). Sin pagar no cuesta nada. Pagado (`received`, `in_preparation` o "
            "`ready_for_delivery`), la pastelería retiene `customer_cancel_retention_percent` (50%) del total sin el "
            "depósito de la base y devuelve lo demás que se pagó. Entregado o ya cancelado, no se cancela."
        ),
        responses={200: CancellationSerializer, 404: NOT_FOUND},
        tags=[ORDERS_TAG],
    )
    def get(self, request, order_id):
        quote = cancellation_service.preview(request.user.pk, order_id)
        if quote is None:
            raise NotFound("No encontrado.")
        return Response(CancellationSerializer(quote).data)

    @extend_schema(
        operation_id="orders_cancel",
        summary="Cancelar mi pedido",
        description=(
            "Lo cancela con el reintegro de siempre (vitrina, pan, lapso e imágenes). Si se pagó y hay algo que "
            "devolver, queda un pago `refund_required` (`customer_cancelled`) con ese monto, que la pastelería devuelve "
            "a mano. Responde el pedido y lo que se retuvo y se devuelve. El cuerpo lleva `expected_status`, el estado "
            "que se vio en la vista previa: si el pedido ya cambió (por ejemplo, llegó el pago), no se cancela y "
            "responde 409 `stale_preview`."
        ),
        request=OrderCancelSerializer,
        responses={
            200: CancelledOrderSerializer,
            400: FIELD_ERRORS,
            404: NOT_FOUND,
            409: OpenApiResponse(
                description="Ya no se puede cancelar, o el pedido cambió desde la vista previa.",
                examples=[
                    _example(cancellation_service.STALE_PREVIEW, cancellation_service.STALE_PREVIEW_MESSAGE),
                    _example(cancellation_service.NOT_CANCELLABLE, cancellation_service.MESSAGES["not_cancellable"]),
                    _example(cancellation_service.ALREADY_CANCELLED, cancellation_service.MESSAGES["already_cancelled"]),
                ],
            ),
        },
        tags=[ORDERS_TAG],
    )
    def post(self, request, order_id):
        data = OrderCancelSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            cancelled = cancellation_service.cancel_order(request.user.pk, order_id, data.validated_data["expected_status"])
        except cancellation_service.CancellationRefused as error:
            return _conflict(error)
        if cancelled is None:
            raise NotFound("No encontrado.")
        return Response(CancelledOrderSerializer(cancelled).data)
