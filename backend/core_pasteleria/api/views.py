"""Capa de controladores: recibe HTTP, llama a servicios y responde."""
from dataclasses import fields

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView

from ..services import (
    cake_options_service,
    catalog_service,
    payment_summary,
    pricing_service,
    store_info_service,
    warranty_service,
)
from ..services.errors import DomainValidationError, attempt, raise_all
from .serializers import (
    CakeDesignOptionsSerializer,
    CakeDesignPriceRequestSerializer,
    CakeDesignPriceSerializer,
    CatalogQuerySerializer,
    PeopleSizeSerializer,
    ProductCardSerializer,
    ProductDetailSerializer,
    ShowcaseQuerySerializer,
    ShowcaseSerializer,
    StoreInfoSerializer,
    TodayStockSerializer,
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
