"""Datos y avisos de la cuenta (D72): `GET` y `PATCH account/`, con JWT y solo de la cuenta que inició sesión.

No hay id en la ruta: cada cuenta lee y cambia la suya (`request.user`). Como los demás endpoints con JWT, no pide CSRF:
el access viaja en `Authorization`, no solo como una cookie. El cambio de contraseña está en `auth_views` porque pone la
cookie del refresh.
"""
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services import account_service
from ..services.errors import DomainValidationError
from .account_serializers import AccountSerializer, AccountUpdateSerializer

ACCOUNT_TAG = "Cuenta"


class AccountView(APIView):
    @extend_schema(
        operation_id="account_detail",
        summary="Mis datos y avisos",
        description=(
            "Nombre, teléfono, correo, si la cuenta tiene contraseña, si está ligada a Google y si quiere avisos por "
            "WhatsApp. Solo la cuenta que inició sesión."
        ),
        responses={200: AccountSerializer},
        tags=[ACCOUNT_TAG],
    )
    def get(self, request):
        return Response(AccountSerializer(account_service.get_account(request.user)).data)

    @extend_schema(
        operation_id="account_update",
        summary="Cambiar mis datos y avisos",
        description=(
            "Cambia `full_name`, `phone` o `notify_whatsapp` (cualquiera puede faltar). El correo y los demás datos no "
            "se cambian aquí: mandarlos es un 400 por campo. Marcar WhatsApp sin teléfono, o quitar el teléfono con "
            "WhatsApp marcado, es un 400 en `notify_whatsapp`. Responde la cuenta ya cambiada."
        ),
        request=AccountUpdateSerializer,
        responses={
            200: AccountSerializer,
            400: OpenApiResponse(
                description="Errores por campo, en español.",
                examples=[
                    OpenApiExample(
                        "WhatsApp sin teléfono y el correo",
                        value={
                            "notify_whatsapp": ["Para avisarte por WhatsApp, escribe tu teléfono en tus datos personales."],
                        },
                    ),
                    OpenApiExample("Un dato que no se cambia", value={"email": ["Este dato no se cambia desde aquí."]}),
                ],
            ),
        },
        tags=[ACCOUNT_TAG],
    )
    def patch(self, request):
        serializer = AccountUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            account = account_service.update_account(request.user, serializer.validated_data)
        except DomainValidationError as error:
            return Response(error.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(AccountSerializer(account).data)
