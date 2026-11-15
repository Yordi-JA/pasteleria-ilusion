"""Capa de controladores: recibe HTTP, llama a servicios y responde."""
import re
from dataclasses import fields

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from ..services import (
    cake_options_service,
    catalog_service,
    customer_image_service,
    payment_summary,
    pricing_service,
    store_info_service,
    warranty_service,
)
from ..services.errors import DomainValidationError, attempt, raise_all
from ..services.orders import order_service, schedule_service
from .parsers import MULTIPART_OVERHEAD_BYTES, BoundedImageUploadParser, declared_length
from .serializers import (
    CakeDesignOptionsSerializer,
    CakeDesignPriceRequestSerializer,
    CakeDesignPriceSerializer,
    CatalogQuerySerializer,
    CustomerImageSerializer,
    CustomerImageUploadSerializer,
    DayScheduleSerializer,
    DeliverySlotQuerySerializer,
    OrderCreateSerializer,
    OrderSerializer,
    PeopleSizeSerializer,
    ProductCardSerializer,
    ProductDetailSerializer,
    ShowcaseQuerySerializer,
    ShowcaseSerializer,
    StoreInfoSerializer,
    TodayStockSerializer,
)
from .throttles import (
    CustomerImageIPThrottle,
    CustomerImageUserThrottle,
    OrderCreateIPThrottle,
    OrderCreateUserThrottle,
    OrderRetryUserThrottle,
)


class PublicReadOnlyView(APIView):
    """Vista pública que no lee la sesión ni guarda nada.

    Solo para operaciones sin efectos; lo que persista usa autenticación y
    CSRF. Sin autenticación, un token vencido no la vuelve 401. Por omisión, la
    tasa de anónimos; una subclase puede fijar su propio alcance con
    `ScopedRateThrottle`. Iniciar sesión se pide al hacer el pedido.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]


class CakeDesignOptionsView(PublicReadOnlyView):
    @extend_schema(
        operation_id="cake_design_options",
        summary='Opciones de "Diseña tu pastel"',
        description=(
            "Tipos de pastel, panes, bases de relleno con sus sabores, nombres de color de referencia, "
            "decoraciones, límites y pisos recomendados, con los precios por kilo vigentes. "
            "Las opciones que no se pueden elegir no desaparecen. Panes, bases y sabores traen "
            "`allowed_cake_types` y `unavailable_reasons` (motivo por tipo de pastel); las "
            "decoraciones, `available` y `unavailable_reason`. `smaller_alternatives` trae el peso y "
            "las personas del pastel de vitrina y del mini, para quien pide menos del mínimo."
        ),
        responses=CakeDesignOptionsSerializer,
        tags=["Diseña tu pastel"],
    )
    def get(self, request):
        options = cake_options_service.get_cake_design_options()
        # Las alternativas más chicas salen del catálogo, no de las opciones: se juntan aquí.
        payload = {field.name: getattr(options, field.name) for field in fields(options)}
        payload["smaller_alternatives"] = catalog_service.get_smaller_alternatives()
        return Response(CakeDesignOptionsSerializer(payload).data)


class CakeDesignPriceView(PublicReadOnlyView):
    @extend_schema(
        operation_id="cake_design_price",
        summary='Precio de un diseño de "Diseña tu pastel"',
        description=(
            "Calcula el desglose con las cifras vigentes, el depósito de la base, que va aparte "
            "del total, y lo que se paga hoy y el día de la entrega (`payment`). No guarda nada. Ignora cualquier monto que mande el cliente; forma y "
            "pisos no cambian el precio. El tamaño va como `people` (el servidor calcula los "
            "kilos y los devuelve en `size`, con el mínimo y el máximo en línea) o como `kg`. "
            "Con más personas de las que se piden en línea responde 200 con los montos en `null` "
            "y `size.above_maximum`; en ese caso solo se valida el formato de la petición, no el resto "
            "de la elección. Con `people`, un 400 por la elección trae también `size`, para que la "
            "interfaz muestre los kilos. Con `estimate`, la base del relleno puede ir sin sabores y "
            "`is_estimate` sale en `true`: ningún pedido acepta ese desglose."
        ),
        request=CakeDesignPriceRequestSerializer,
        responses={
            200: CakeDesignPriceSerializer,
            400: OpenApiResponse(
                description="Errores por campo, en español.",
                examples=[
                    OpenApiExample(
                        "Decoración sin precio",
                        value={"decoration": ["Precio por confirmar"]},
                    ),
                    OpenApiExample(
                        "Pan que ya no se ofrece, con los kilos por personas",
                        value={
                            "bread": ["Ese pan no existe o no está disponible."],
                            "size": {
                                "people": 40, "rounded_kg": 6, "kg": 6, "below_minimum": False,
                                "above_maximum": False, "minimum_people": 28, "max_online_people": 350, "max_tiers": 1,
                            },
                        },
                    ),
                ],
            ),
        },
        examples=[
            OpenApiExample(
                "Regla 4.6: 15 kg, tres leches, pan de chocolate, con queso y zarzamora",
                value={
                    "kg": 15,
                    "cake_type": "tres_leches",
                    "bread": "chocolate",
                    "filling_base": "queso",
                    "filling_flavors": ["zarzamora"],
                },
                request_only=True,
            ),
        ],
        tags=["Diseña tu pastel"],
    )
    def post(self, request):
        serializer = CakeDesignPriceRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        size = None
        if data.get("people") is not None:
            # Los kilos por personas los calcula el servidor (regla 3.1) antes que el precio, así llegan también
            # cuando el resto de la elección no vale.
            size = pricing_service.size_for_people(data["people"])
            if size.above_maximum:
                # Solo se validó el formato: con más personas de las que se piden en línea no hay precio que revisar.
                return Response(
                    CakeDesignPriceSerializer({"breakdown": None, "stand_deposit": None, "payment": None, "size": size}).data
                )
        choice = serializer.to_choice(size.kg if size else data["kg"])
        price = pricing_service.estimate_price if data["estimate"] else pricing_service.calculate_price
        # El precio y la base se revisan los dos, para devolver todos los
        # errores en una sola respuesta.
        failures: list[DomainValidationError] = []
        breakdown = attempt(failures, price, choice)
        stand_deposit = attempt(failures, warranty_service.get_stand_deposit, choice.kg)
        try:
            raise_all(failures)
        except DomainValidationError as error:
            if size is None:
                raise ValidationError(error.errors) from error
            # Los errores por campo y, aparte, los kilos ya calculados (no son un error: van tal cual).
            return Response({**error.errors, "size": PeopleSizeSerializer(size).data}, status=status.HTTP_400_BAD_REQUEST)
        payment = payment_summary.payment_for_design(breakdown, stand_deposit)
        return Response(
            CakeDesignPriceSerializer(
                {"breakdown": breakdown, "stand_deposit": stand_deposit, "payment": payment, "size": size}
            ).data
        )


class StoreInfoView(PublicReadOnlyView):
    # Tasa propia: el pie se pide en cada visita y no debe gastar el cupo
    # anónimo de "Diseña tu pastel". Sin autenticación, cuenta siempre por IP.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "store_info"

    @extend_schema(
        operation_id="store_info",
        summary="Datos del negocio",
        description=(
            "Dirección, WhatsApp, horario y días de anticipación de un pedido, para el pie y la "
            "franja superior del sitio. `address` y `whatsapp` salen como `null` mientras la "
            "pastelería no los define (PENDIENTE); la interfaz los muestra como pendientes, sin "
            "inventar un valor. `whatsapp` lleva solo dígitos, con la lada del país y sin \"+\". "
            "Las horas van en HH:MM de 24 horas. Los cambios del admin se ven en la siguiente "
            "petición."
        ),
        responses={
            200: OpenApiResponse(
                response=StoreInfoSerializer,
                examples=[
                    OpenApiExample(
                        "Dirección y WhatsApp pendientes",
                        value={
                            "address": None,
                            "whatsapp": None,
                            "opens_at": "10:00",
                            "closes_at": "22:30",
                            "custom_lead_days": 2,
                        },
                    ),
                    OpenApiExample(
                        "Con todos los datos (valores ilustrativos)",
                        value={
                            "address": "Calle, número, colonia, alcaldía, código postal",
                            "whatsapp": "520000000000",
                            "opens_at": "10:00",
                            "closes_at": "22:30",
                            "custom_lead_days": 2,
                        },
                    ),
                ],
            ),
        },
        tags=["Datos del negocio"],
    )
    def get(self, request):
        return Response(StoreInfoSerializer(store_info_service.get_store_info()).data)


# --- Catálogo público ---

CATALOG_TAG = "Catálogo"
# Valores ilustrativos de la semilla; los ids cambian de una base a otra.
CARD_EXAMPLE = {
    "slug": "tres-leches-de-durazno",
    "name": "Tres leches de durazno",
    "category": "cake",
    "sales_channel": "showcase_and_order",
    "cake_type": "tres_leches",
    "bread": None,
    "filling_base": "normal",
    "summary": "Relleno de durazno y cobertura de crema pastelera.",
    "photo": None,
    "in_showcase_today": True,
    "sliced_today": False,
    "offerings": [
        {"id": 1, "presentation": "whole", "price": "350.00"},
        {"id": 2, "presentation": "slice", "price": "35.00"},
        {"id": 3, "presentation": "mini", "price": "130.00"},
    ],
}
TODAY_STOCK_EXAMPLE = {
    "date": "2026-11-06",
    "items": [
        {
            "offering_id": 1, "product_slug": "tres-leches-de-durazno", "product_name": "Tres leches de durazno",
            "category": "cake", "presentation": "whole", "price": "350.00", "photo": None,
            "stock": 2, "sold_out": False,
        },
        {
            "offering_id": 3, "product_slug": "tres-leches-de-durazno", "product_name": "Tres leches de durazno",
            "category": "cake", "presentation": "mini", "price": "130.00", "photo": None,
            "stock": 0, "sold_out": True,
        },
    ],
}
SHOWCASE_EXAMPLE = {
    "date": "2026-11-06",
    "items": [
        {**TODAY_STOCK_EXAMPLE["items"][1], "sliced": False},
        {
            "offering_id": 5, "product_slug": "tres-leches-de-fresa", "product_name": "Tres leches de fresa",
            "category": "cake", "presentation": "slice", "price": "35.00", "photo": None,
            "stock": 6, "sold_out": False, "sliced": True,
        },
    ],
}
NOT_FOUND = OpenApiResponse(
    description="No existe o la pastelería lo desactivó.",
    examples=[OpenApiExample("No encontrado", value={"detail": "No encontrado."})],
)
INVALID_QUERY = OpenApiResponse(
    description="Parámetro inválido, con el error por campo.",
    examples=[OpenApiExample("Categoría desconocida", value={"category": ["\"gelatina\" no es una elección válida."]})],
)


class PublicCatalogView(PublicReadOnlyView):
    # Tasa propia y compartida por los cinco endpoints del catálogo: la portada
    # pide tres a la vez y no debe gastar el cupo anónimo de "Diseña tu pastel"
    # ni el del pie. Sin autenticación, cuenta siempre por IP.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "catalog"

    @staticmethod
    def validated_query(serializer_class, request) -> dict:
        query = serializer_class(data=request.query_params)
        query.is_valid(raise_exception=True)
        return query.validated_data


class ProductListView(PublicCatalogView):
    @extend_schema(
        operation_id="catalog_products",
        summary="Catálogo",
        description=(
            "Productos activos en el orden del admin, con sus presentaciones y precios. Sin "
            "paginar: el catálogo es corto y la pantalla lo muestra completo, con el número de "
            "pasteles y de postres. `in_showcase_today` lee la vitrina de hoy en la pastelería."
        ),
        parameters=[CatalogQuerySerializer],
        responses={
            200: OpenApiResponse(
                response=ProductCardSerializer(many=True),
                examples=[OpenApiExample("Un pastel", value=[CARD_EXAMPLE])],
            ),
            400: INVALID_QUERY,
        },
        tags=[CATALOG_TAG],
    )
    def get(self, request):
        query = self.validated_query(CatalogQuerySerializer, request)
        cards = catalog_service.list_catalog(category=query.get("category"), search=query.get("search"))
        return Response(ProductCardSerializer(cards, many=True).data)


class ProductDetailView(PublicCatalogView):
    @extend_schema(
        operation_id="catalog_product_detail",
        summary="Ficha de producto",
        description=(
            "Producto activo con sus presentaciones, las existencias de hoy de cada una "
            "(`stock`: `null` si no se cargó, `0` si se agotó) y hasta tres productos de la "
            "misma categoría para \"También te puede gustar\". Conservación, transporte y fotos "
            "salen `null` mientras sean PENDIENTE."
        ),
        responses={200: ProductDetailSerializer, 404: NOT_FOUND},
        tags=[CATALOG_TAG],
    )
    def get(self, request, slug):
        detail = catalog_service.get_product(slug)
        if detail is None:
            raise NotFound("No encontrado.")
        return Response(ProductDetailSerializer(detail).data)


class FeaturedProductListView(PublicCatalogView):
    @extend_schema(
        operation_id="catalog_featured_products",
        summary="Pasteles de la casa",
        description=(
            "Para la portada: hasta 4 productos que la pastelería marcó como destacados en el "
            "admin, en su orden; si marcó menos, salen esos. Si no marcó ninguno, salen los "
            "primeros 4 pasteles activos del catálogo."
        ),
        responses={
            200: OpenApiResponse(
                response=ProductCardSerializer(many=True),
                examples=[OpenApiExample("Un pastel", value=[CARD_EXAMPLE])],
            ),
        },
        tags=[CATALOG_TAG],
    )
    def get(self, request):
        return Response(ProductCardSerializer(catalog_service.list_home_featured(), many=True).data)


class ShowcaseView(PublicCatalogView):
    @extend_schema(
        operation_id="catalog_showcase",
        summary="Vitrina de hoy",
        description=(
            "Presentaciones cargadas hoy en la vitrina, en el orden del catálogo. Un producto con "
            "rebanadas cargadas hoy es el rebanado: sale una vez, con `sliced: true`, como su "
            "rebanada (se ve completo, pero completo solo se encarga). Con `stock` en 0 salen con "
            "`sold_out: true` (\"Agotada por hoy\"); lo que no se cargó hoy no sale. Red velvet "
            "nunca sale. `date` es la fecha de hoy en la pastelería."
        ),
        parameters=[ShowcaseQuerySerializer],
        responses={
            200: OpenApiResponse(
                response=ShowcaseSerializer,
                examples=[OpenApiExample("Una agotada y el rebanado", value=SHOWCASE_EXAMPLE)],
            ),
            400: INVALID_QUERY,
        },
        tags=[CATALOG_TAG],
    )
    def get(self, request):
        query = self.validated_query(ShowcaseQuerySerializer, request)
        showcase = catalog_service.get_showcase(category=query.get("category"))
        return Response(ShowcaseSerializer(showcase).data)


class SliceListView(PublicCatalogView):
    @extend_schema(
        operation_id="catalog_slices",
        summary="Rebanadas de hoy",
        description=(
            "Rebanadas cargadas hoy, en el orden del catálogo, con \"Quedan [n]\" en `stock` y "
            "`sold_out: true` en las agotadas. `date` es la fecha de hoy en la pastelería."
        ),
        responses={200: TodayStockSerializer},
        tags=[CATALOG_TAG],
    )
    def get(self, request):
        return Response(TodayStockSerializer(catalog_service.get_slices()).data)


# --- Imágenes de clientes ---

IMAGES_TAG = "Imágenes de clientes"
IMAGE_TOO_LARGE = OpenApiResponse(
    description="El archivo pasa del tamaño máximo; se revisa antes de leer el cuerpo.",
    examples=[OpenApiExample("Muy grande", value={"image": ["La imagen pasa de 5 MB. Usa una más ligera."]})],
)


def _too_large(message: str) -> Response:
    return Response({"image": [message]}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)


class CustomerImageUploadView(APIView):
    """Sube una imagen del cliente: solo multipart, con el tope duro en el parser y el del admin antes de leer."""

    parser_classes = [BoundedImageUploadParser]
    # Por usuario y por IP (auditorías de D53 y D55), en lugar de las tasas generales.
    throttle_classes = [CustomerImageUserThrottle, CustomerImageIPThrottle]

    @extend_schema(
        operation_id="customer_image_upload",
        summary="Subir una imagen (oblea u \"Otra decoración\")",
        description=(
            "Exige sesión (JWT). El servidor abre la imagen con Pillow, la vuelve a codificar sin metadatos y la "
            "guarda con un id `uuid4`; ese id va en la línea del pedido (`wafer_image_id` o `decoration_image_id`). "
            "Un cuerpo declarado más grande que el máximo del admin responde 413 sin leerse."
        ),
        request={"multipart/form-data": CustomerImageUploadSerializer},
        responses={
            201: CustomerImageSerializer,
            400: OpenApiResponse(
                description=(
                    "No es una imagen JPG, PNG o WebP que se pueda abrir, pasa de los megapíxeles del admin, el cliente ya "
                    "tiene el máximo de imágenes sin pedido o, vuelta a codificar, pasa del tamaño máximo."
                ),
                examples=[OpenApiExample("No es imagen", value={"image": [customer_image_service.INVALID_MESSAGE]})],
            ),
            413: IMAGE_TOO_LARGE,
        },
        tags=[IMAGES_TAG],
    )
    def post(self, request):
        limit = customer_image_service.max_upload_bytes()
        declared = declared_length(request)
        if declared is not None and declared > limit + MULTIPART_OVERHEAD_BYTES:
            return _too_large(customer_image_service.too_large_message())
        serializer = CustomerImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["image"]
        if upload.size > limit:
            return _too_large(customer_image_service.too_large_message())
        try:
            record = customer_image_service.store_image(
                request.user.pk, upload.read(), upload.name or "", serializer.validated_data["purpose"]
            )
        except customer_image_service.ImageTooLargeError as error:
            return Response(error.errors, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        except DomainValidationError as error:
            raise ValidationError(error.errors) from error
        return Response(CustomerImageSerializer(record).data, status=status.HTTP_201_CREATED)


class CustomerImageView(APIView):
    """Entrega una imagen a su dueño o al superusuario; a cualquier otro, 404."""

    # El superusuario la abre desde el admin con su sesión; el cliente, con su JWT. Sin vistas nuevas para el
    # personal (decisión del usuario del 14 de noviembre, D63).
    authentication_classes = [JWTAuthentication, SessionAuthentication]

    @extend_schema(
        operation_id="customer_image",
        summary="Ver una imagen del cliente",
        description=(
            "Solo para el dueño de la imagen o el superusuario (desde el admin); una ajena responde 404. Lleva `Content-Disposition` con "
            "el id como nombre, `X-Content-Type-Options: nosniff` y una CSP que no deja cargar nada más."
        ),
        responses={
            (200, "image/jpeg"): OpenApiTypes.BINARY,
            (200, "image/png"): OpenApiTypes.BINARY,
            (200, "image/webp"): OpenApiTypes.BINARY,
            404: NOT_FOUND,
        },
        tags=[IMAGES_TAG],
    )
    def get(self, request, image_id):
        image = customer_image_service.get_image(image_id, request.user.pk, request.user.is_superuser)
        if image is None:
            raise NotFound("No encontrado.")
        response = HttpResponse(image.content, content_type=image.content_type)
        response["Content-Disposition"] = f'inline; filename="{customer_image_service.file_name(image)}"'
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        response["Cache-Control"] = "private, no-store"
        return response


# --- Agenda y pedidos ---

ORDERS_TAG = "Pedidos"
# Una llave por intento de pedido, como un UUID: el doble clic o el reintento devuelven el mismo pedido.
IDEMPOTENCY_KEY = re.compile(r"[A-Za-z0-9_-]{8,64}")
IDEMPOTENCY_HEADER = OpenApiParameter(
    "Idempotency-Key",
    OpenApiTypes.STR,
    OpenApiParameter.HEADER,
    required=True,
    description=(
        "Una llave nueva por pedido (8 a 64 letras, dígitos, `-` o `_`; por ejemplo un UUID). Con la misma llave, "
        "la API devuelve el pedido que ya existe (200) en lugar de crear otro."
    ),
)
ORDER_ERRORS = OpenApiResponse(
    description=(
        "Errores por campo, en español. `items` trae solo las líneas con error, por su posición (desde \"0\"); "
        "los del diseño van dentro de `design`."
    ),
    examples=[
        OpenApiExample(
            "Rebanada encargada en la segunda línea",
            value={"items": {"1": {"offering_id": ["Las rebanadas son solo de la vitrina de hoy: no se encargan."]}}},
        ),
        OpenApiExample(
            "Entrega a domicilio",
            value={"fulfillment": [order_service.DELIVERY_BY_WHATSAPP_MESSAGE]},
        ),
        OpenApiExample("Lapso lleno", value={"slot_starts_at": [order_service.SLOT_FULL_MESSAGE]}),
    ],
)


class DeliverySlotListView(APIView):
    @extend_schema(
        operation_id="delivery_slots",
        summary="Lapsos para recoger un pedido",
        description=(
            "Los lapsos de un día (de `StoreSettings`), con `available` y su motivo: `too_soon` (no alcanza la "
            "anticipación del pedido o ya pasó) o `full` (ya tiene el máximo de pedidos). La anticipación depende de "
            "los tipos de línea del carrito (`kind`). La creación del pedido vuelve a revisar el lapso."
        ),
        parameters=[DeliverySlotQuerySerializer],
        responses={
            200: DayScheduleSerializer,
            400: OpenApiResponse(
                description="Parámetro inválido o un pedido que junta la vitrina de hoy con un diseño.",
                examples=[OpenApiExample("Vitrina y diseño", value={"kind": [schedule_service.MIXED_MESSAGE]})],
            ),
        },
        tags=[ORDERS_TAG],
    )
    def get(self, request):
        query = DeliverySlotQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        try:
            schedule = schedule_service.day_schedule(query.validated_data["date"], query.validated_data["kind"])
        except DomainValidationError as error:
            raise ValidationError(error.errors) from error
        return Response(DayScheduleSerializer(schedule).data)


class OrderListCreateView(ListAPIView):
    serializer_class = OrderSerializer

    def get_queryset(self):
        # Paginado en el repositorio: el paginador cuenta y lee solo la página.
        return order_service.list_orders(self.request.user.pk)

    def get_throttles(self):
        # Crear pedidos tiene su propio cupo, por cuenta y por IP; leerlos usa el general. Un reintento con una llave
        # que ya tiene pedido no crea nada: no gasta el cupo de creación, pero tiene el suyo.
        if self.request.method != "POST":
            return super().get_throttles()
        if self._is_retry(self.request):
            return [OrderRetryUserThrottle()]
        return [OrderCreateUserThrottle(), OrderCreateIPThrottle()]

    @staticmethod
    def _is_retry(request) -> bool:
        key = request.headers.get("Idempotency-Key", "")
        return (
            request.user.is_authenticated
            and IDEMPOTENCY_KEY.fullmatch(key) is not None
            and order_service.has_order_with_key(request.user.pk, key)
        )

    @extend_schema(
        operation_id="orders_list",
        summary="Mis pedidos",
        description="Los pedidos de quien inició sesión, del más nuevo al más viejo, paginados.",
        tags=[ORDERS_TAG],
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        operation_id="orders_create",
        summary="Hacer un pedido",
        description=(
            "Exige sesión (JWT) y `Idempotency-Key`. El servidor revalida y recalcula todo: precio de cada línea, "
            "base y su depósito, anticipo (`PolicySettings.advance_percent`; la base y el envío van aparte) y estado. "
            "Nunca lee montos, `requiresQuote` ni el id del diseño del cliente. Aparta en ese momento, de forma "
            "atómica, el lapso (máximo de pedidos por lapso), las piezas de la vitrina de hoy y el pan de un encargo "
            "para hoy; un pedido en pausa por cotización no ocupa el lapso, y su cupo se revisa cuando la pastelería "
            "le pone precio. Antes, cancela con su reintegro los pedidos vencidos de la misma cuenta. Nace "
            "`awaiting_payment` con `payment_due_at` a los 30 minutos (`PolicySettings`), nunca después del inicio del "
            "lapso (el primer lapso que se puede elegir deja ese plazo completo), o `awaiting_quote` con \"Otra "
            "decoración\" (sin montos de pago; la pastelería pone el precio en el admin y entonces se paga hasta el "
            "cierre del día). Lo de la vitrina de hoy se paga completo (`payment.paid_in_full`). Topes del admin: "
            "pedidos sin pagar por cliente, piezas de la vitrina sin pagar por cliente (con las de sus pedidos "
            "vencidos de las últimas `expired_showcase_cooldown_hours`), pedidos esperando cotización por cliente, una "
            "decoración por cotizar por pedido, días a futuro y piezas por línea y por pedido. Throttle propio, por "
            "cuenta y por IP. Un reintento "
            "con la misma `Idempotency-Key` responde el pedido que ya existe (200), aunque traiga otro cuerpo, sin "
            "gastar ese cupo: tiene el suyo (`orders_retry_user`). Por ahora solo se recoge en la pastelería."
        ),
        parameters=[IDEMPOTENCY_HEADER],
        request=OrderCreateSerializer,
        responses={
            201: OrderSerializer,
            200: OpenApiResponse(OrderSerializer, description="Ya existía un pedido con esa llave: es ese."),
            400: ORDER_ERRORS,
        },
        tags=[ORDERS_TAG],
    )
    def post(self, request):
        key = request.headers.get("Idempotency-Key", "")
        if not IDEMPOTENCY_KEY.fullmatch(key):
            raise ValidationError({"idempotency_key": ["Falta el encabezado Idempotency-Key o no es válido."]})
        # Con la misma llave, el pedido que ya existe, aunque llegue otro cuerpo: no se vuelve a validar.
        existing = order_service.find_order_by_key(request.user.pk, key)
        if existing is not None:
            return Response(OrderSerializer(existing).data, status=status.HTTP_200_OK)
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order, created = order_service.create_order(request.user.pk, serializer.to_request(key))
        except order_service.OrderValidationError as error:
            return Response(error.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class OrderDetailView(APIView):
    @extend_schema(
        operation_id="orders_detail",
        summary="Un pedido",
        description="Un pedido de quien inició sesión; uno ajeno responde 404.",
        responses={200: OrderSerializer, 404: NOT_FOUND},
        tags=[ORDERS_TAG],
    )
    def get(self, request, order_id):
        order = order_service.get_order(request.user.pk, order_id)
        if order is None:
            raise NotFound("No encontrado.")
        return Response(OrderSerializer(order).data)
