"""Capa de controladores: recibe HTTP, llama a servicios y responde."""
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView

from ..services import cake_options_service, pricing_service, store_info_service, warranty_service
from ..services.errors import DomainValidationError, attempt, raise_all
from .serializers import (
    CakeDesignOptionsSerializer,
    CakeDesignPriceRequestSerializer,
    CakeDesignPriceSerializer,
    StoreInfoSerializer,
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
            "Tipos de pastel, panes, bases de relleno con sus sabores, colores de cobertura, "
            "decoraciones, límites y pisos recomendados, con los precios por kilo vigentes. "
            "Las opciones que no se pueden elegir no desaparecen. Panes, bases y sabores traen "
            "`allowed_cake_types` y `unavailable_reasons` (motivo por tipo de pastel); las "
            "decoraciones, `available` y `unavailable_reason`."
        ),
        responses=CakeDesignOptionsSerializer,
        tags=["Diseña tu pastel"],
    )
    def get(self, request):
        options = cake_options_service.get_cake_design_options()
        return Response(CakeDesignOptionsSerializer(options).data)


class CakeDesignPriceView(PublicReadOnlyView):
    @extend_schema(
        operation_id="cake_design_price",
        summary='Precio de un diseño de "Diseña tu pastel"',
        description=(
            "Calcula el desglose con las cifras vigentes y el depósito de la base, que va aparte "
            "del total. No guarda nada. Ignora cualquier monto que mande el cliente; forma y "
            "pisos no cambian el precio."
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
        choice = serializer.to_choice()
        # El precio y la base se revisan los dos, para devolver todos los
        # errores en una sola respuesta.
        failures: list[DomainValidationError] = []
        breakdown = attempt(failures, pricing_service.calculate_price, choice)
        stand_deposit = attempt(failures, warranty_service.get_stand_deposit, choice.kg)
        try:
            raise_all(failures)
        except DomainValidationError as error:
            raise ValidationError(error.errors) from error
        return Response(
            CakeDesignPriceSerializer({"breakdown": breakdown, "stand_deposit": stand_deposit}).data
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
