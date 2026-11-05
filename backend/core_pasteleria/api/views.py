"""Capa de controladores: recibe HTTP, llama a servicios y responde."""
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from ..services import cake_options_service, pricing_service, warranty_service
from ..services.errors import DomainValidationError, attempt, raise_all
from .serializers import (
    CakeDesignOptionsSerializer,
    CakeDesignPriceRequestSerializer,
    CakeDesignPriceSerializer,
)


class PublicReadOnlyView(APIView):
    """Vista pública que no lee la sesión ni guarda nada.

    Solo para operaciones sin efectos; lo que persista usa autenticación y
    CSRF. Sin autenticación, un token vencido no la vuelve 401, y todos cuentan
    con la tasa de anónimos. Iniciar sesión se pide al hacer el pedido.
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
