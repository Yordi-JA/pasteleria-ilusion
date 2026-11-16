"""Vistas del acceso de clientes (D62): registro, inicio de sesión, Google, renovación y salida.

El access token va en el cuerpo; el refresh, en la cookie HttpOnly `REFRESH_COOKIE_NAME`,
limitada a `/api/v1/auth/`. Toda vista que pone o lee esa cookie exige CSRF de forma
explícita: las `APIView` de DRF están exentas y estas no autentican con sesión.
"""
from django.conf import settings
from django.middleware.csrf import get_token
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.authentication import CSRFCheck
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.settings import api_settings as jwt_settings

from config.security import lockout_response

from ..services import auth_service, google_identity
from .account_serializers import PasswordChangeRequestSerializer
from .auth_serializers import (
    AuthErrorSerializer,
    GoogleLoginRequestSerializer,
    GoogleSessionSerializer,
    LoginRequestSerializer,
    RegisterRequestSerializer,
    SessionSerializer,
)
from .throttles import PasswordChangeIPThrottle, PasswordChangeUserThrottle, SecurityScopedRateThrottle

TAG = "Acceso"
# Cookie legible por el sitio que solo dice "hay sesión" (ver `_set_refresh_cookie`).
SESSION_HINT_COOKIE = "ilusion_session"
CSRF_FAILED = "Falta la verificación de seguridad (CSRF). Recarga la página e inténtalo de nuevo."


def _error(code: str, description: str, message: str) -> OpenApiResponse:
    return OpenApiResponse(
        response=AuthErrorSerializer,
        description=description,
        examples=[OpenApiExample(code, value={"detail": message, "code": code})],
    )


CSRF_RESPONSE = OpenApiResponse(
    description="Sin el token CSRF (cookie `csrftoken` y encabezado `X-CSRFToken`).",
    examples=[OpenApiExample("Sin CSRF", value={"detail": CSRF_FAILED})],
)
THROTTLED = OpenApiResponse(description="Demasiadas peticiones desde esta IP; `Retry-After` dice cuántos segundos esperar.")


def _enforce_csrf(request) -> None:
    """La misma revisión que `SessionAuthentication`: origen y token CSRF."""
    check = CSRFCheck(lambda _request: None)
    check.process_request(request._request)
    if check.process_view(request._request, None, (), {}):
        raise PermissionDenied(CSRF_FAILED)


def _set_refresh_cookie(response: Response, refresh: str) -> None:
    """El refresh (HttpOnly, solo en `/api/v1/auth/`) y la pista que el sitio sí puede leer.

    La pista (`SESSION_HINT_COOKIE`, "1") no da acceso a nada: solo le dice al sitio que
    vale la pena pedir `refresh` al cargar. Sin ella, cada visita anónima gastaría una
    petición y el cupo `session` de su IP.
    """
    max_age = int(jwt_settings.REFRESH_TOKEN_LIFETIME.total_seconds())
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh,
        max_age=max_age,
        path=settings.REFRESH_COOKIE_PATH,
        secure=settings.REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite="Lax",
    )
    response.set_cookie(
        SESSION_HINT_COOKIE, "1", max_age=max_age, path="/", secure=settings.REFRESH_COOKIE_SECURE, samesite="Lax"
    )


def _delete_refresh_cookie(response: Response) -> None:
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH, samesite="Lax")
    response.delete_cookie(SESSION_HINT_COOKIE, path="/", samesite="Lax")


def _session_response(session: auth_service.Session, serializer_class=SessionSerializer, status_code=status.HTTP_200_OK):
    response = Response(serializer_class(session).data, status=status_code)
    _set_refresh_cookie(response, session.refresh)
    return response


def _new_session_response(request, session: auth_service.Session, serializer_class=SessionSerializer, status_code=status.HTTP_200_OK):
    """Una sesión nueva (entrar, registrarse, Google): el refresh que ya traía la cookie va a la lista negra.

    Si alguien más tenía una copia de ese refresh, deja de servir al abrir otra sesión.
    """
    auth_service.end_session(request.COOKIES.get(settings.REFRESH_COOKIE_NAME))
    return _session_response(session, serializer_class, status_code)


def _auth_error(error) -> Response:
    return Response({"detail": error.message, "code": error.code}, status=error.status)


class AuthView(APIView):
    """Base del acceso: sin autenticación (un access vencido no da 401), contadores por IP."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [SecurityScopedRateThrottle]


class CsrfView(AuthView):
    throttle_scope = "session"

    @extend_schema(
        operation_id="auth_csrf",
        summary="Cookie CSRF",
        description=(
            "Pone la cookie `csrftoken`. El sitio la lee y manda su valor en `X-CSRFToken` en cada "
            "petición que pone o lee la cookie del refresh."
        ),
        responses={204: None},
        tags=[TAG],
    )
    def get(self, request):
        get_token(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(AuthView):
    throttle_scope = "register"

    @extend_schema(
        operation_id="auth_register",
        summary="Crear cuenta con correo",
        description=(
            "Crea la cuenta de un cliente y abre su sesión: el access en el cuerpo y el refresh en la "
            "cookie HttpOnly. Los errores van por campo, en español, con su código en `codes` "
            "(`email_taken` cuando el correo ya tiene cuenta). Limitado por IP (`register`)."
        ),
        request=RegisterRequestSerializer,
        responses={
            201: SessionSerializer,
            400: OpenApiResponse(
                description="Errores por campo y sus códigos.",
                examples=[
                    OpenApiExample(
                        "Correo con cuenta y contraseña corta",
                        value={
                            "email": ["Ya hay una cuenta con este correo."],
                            "password": ["Te faltan caracteres: el mínimo es 8."],
                            "codes": {"email": ["email_taken"], "password": ["password_too_short"]},
                        },
                    )
                ],
            ),
            403: CSRF_RESPONSE,
            429: THROTTLED,
        },
        tags=[TAG],
    )
    def post(self, request):
        _enforce_csrf(request)
        serializer = RegisterRequestSerializer(data=request.data)
        if not serializer.is_valid():
            codes = {field: [detail.code for detail in details] for field, details in serializer.errors.items()}
            return Response({**serializer.errors, "codes": codes}, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        try:
            session = auth_service.register_customer(
                full_name=data["full_name"], email=data["email"], phone=data["phone"], password=data["password"]
            )
        except auth_service.RegistrationError as error:
            return Response({**error.errors, "codes": error.codes}, status=status.HTTP_400_BAD_REQUEST)
        return _new_session_response(request, session, status_code=status.HTTP_201_CREATED)


class LoginView(AuthView):
    throttle_scope = "login"

    @extend_schema(
        operation_id="auth_login",
        summary="Iniciar sesión con correo",
        description=(
            "Abre la sesión con correo y contraseña. Un correo que no existe y una contraseña "
            "equivocada responden igual. Tras 5 fallos desde una IP con el mismo correo, ese correo "
            "queda bloqueado desde esa IP 1 hora (429 con `Retry-After`); además hay un límite por IP "
            "(`login`, compartido con Google)."
        ),
        request=LoginRequestSerializer,
        responses={
            200: SessionSerializer,
            401: _error("invalid_credentials", "Correo o contraseña equivocados.", auth_service.InvalidCredentials.message),
            403: CSRF_RESPONSE,
            429: _error("locked_out", "Bloqueado por intentos fallidos, o límite de la IP.", "Demasiados intentos fallidos. Intenta de nuevo más tarde."),
        },
        tags=[TAG],
    )
    def post(self, request):
        _enforce_csrf(request)
        serializer = LoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            session = auth_service.login_with_password(
                request._request, email=serializer.validated_data["email"], password=serializer.validated_data["password"]
            )
        except auth_service.LockedOut:
            return lockout_response(request._request)
        except auth_service.AuthError as error:
            return _auth_error(error)
        return _new_session_response(request, session)


class GoogleLoginView(AuthView):
    throttle_scope = "login"

    @extend_schema(
        operation_id="auth_google",
        summary="Entrar con Google",
        description=(
            "Recibe el `credential` (ID token) de Google Identity Services, lo verifica con las "
            "llaves de Google (audiencia, emisor, expiración y `email_verified`) y entra o crea la "
            "cuenta. Una cuenta de correo existente se liga solo si Google es la autoridad del correo "
            "(Gmail o Workspace) y no es del personal; su contraseña deja de servir "
            "(`password_removed`) y sus sesiones anteriores se cierran."
        ),
        request=GoogleLoginRequestSerializer,
        responses={
            200: GoogleSessionSerializer,
            400: _error("google_invalid", "Token inválido o correo sin verificar.", google_identity.GoogleTokenInvalid.message),
            403: _error("inactive", "Cuenta desactivada (o sin CSRF).", auth_service.InactiveAccount.message),
            409: _error("account_exists", "El correo ya tiene una cuenta que no se liga.", auth_service.AccountExists.message),
            429: THROTTLED,
            503: _error("google_disabled", "Google no está configurado o no responde.", google_identity.GoogleSignInDisabled.message),
        },
        tags=[TAG],
    )
    def post(self, request):
        _enforce_csrf(request)
        serializer = GoogleLoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            session = auth_service.login_with_google(serializer.validated_data["credential"])
        except (auth_service.AuthError, google_identity.GoogleSignInError) as error:
            return _auth_error(error)
        return _new_session_response(request, session, GoogleSessionSerializer)


class RefreshView(AuthView):
    throttle_scope = "session"

    @extend_schema(
        operation_id="auth_refresh",
        summary="Renovar la sesión",
        description=(
            "Lee el refresh de la cookie, lo pone en la lista negra y entrega un access nuevo y una "
            "cookie nueva (rotación). Rechaza un refresh de antes de un cambio de contraseña, de una "
            "cuenta desactivada o ya usado. Sin cuerpo."
        ),
        request=None,
        responses={
            200: SessionSerializer,
            401: _error(
                "session_expired",
                "Sin sesión, o la sesión ya no vale. `session_rotated`: otra pestaña lo acaba de rotar; la cookie se conserva y se puede reintentar una vez.",
                auth_service.SessionExpired.message,
            ),
            403: CSRF_RESPONSE,
            429: THROTTLED,
        },
        tags=[TAG],
    )
    def post(self, request):
        _enforce_csrf(request)
        try:
            session = auth_service.renew_session(request.COOKIES.get(settings.REFRESH_COOKIE_NAME))
        except auth_service.SessionExpired as error:
            response = _auth_error(error)
            if not error.keep_cookie:
                _delete_refresh_cookie(response)
            return response
        return _session_response(session)


class PasswordChangeView(APIView):
    """Cambiar la contraseña desde "Datos y avisos" (D72).

    A diferencia de las demás vistas del acceso, exige sesión (JWT): es de la cuenta que inició sesión. Vive bajo
    `auth/` porque pone la cookie del refresh (que solo existe en esa ruta) y, como toda vista que la pone, exige CSRF.
    """

    throttle_classes = [PasswordChangeUserThrottle, PasswordChangeIPThrottle]

    @extend_schema(
        operation_id="auth_password_change",
        summary="Cambiar mi contraseña",
        description=(
            "Exige sesión (JWT) y CSRF. Revisa la contraseña actual y que la nueva cumpla las reglas del registro. Al "
            "cambiarla se cierran todas las sesiones de la cuenta (los access de antes dejan de valer y los refresh "
            "van a la lista negra) y se abre una nueva para quien la cambió: el access en el cuerpo y el refresh en la "
            "cookie. Una cuenta sin contraseña (solo de Google) responde lo mismo que una contraseña actual "
            "equivocada. Limitado por cuenta (`password_change_user`) y por IP (`password_change_ip`)."
        ),
        request=PasswordChangeRequestSerializer,
        responses={
            200: SessionSerializer,
            400: OpenApiResponse(
                description="Errores por campo y sus códigos (`wrong_password` y los de las reglas de la contraseña).",
                examples=[
                    OpenApiExample(
                        "Contraseña actual equivocada",
                        value={
                            "current_password": [auth_service.WRONG_CURRENT_PASSWORD],
                            "codes": {"current_password": ["wrong_password"]},
                        },
                    )
                ],
            ),
            401: OpenApiResponse(description="Sin sesión o con un access que ya no vale."),
            403: CSRF_RESPONSE,
            429: THROTTLED,
        },
        tags=[TAG],
    )
    def post(self, request):
        _enforce_csrf(request)
        serializer = PasswordChangeRequestSerializer(data=request.data)
        if not serializer.is_valid():
            codes = {field: [detail.code for detail in details] for field, details in serializer.errors.items()}
            return Response({**serializer.errors, "codes": codes}, status=status.HTTP_400_BAD_REQUEST)
        try:
            session = auth_service.change_password(
                request.user,
                current_password=serializer.validated_data["current_password"],
                new_password=serializer.validated_data["new_password"],
            )
        except auth_service.PasswordChangeError as error:
            return Response({**error.errors, "codes": error.codes}, status=status.HTTP_400_BAD_REQUEST)
        return _session_response(session)


class LogoutView(AuthView):
    throttle_scope = "session"

    @extend_schema(
        operation_id="auth_logout",
        summary="Salir",
        description="Pone el refresh de la cookie en la lista negra y borra la cookie. Responde 204 aunque no haya sesión.",
        request=None,
        responses={204: None, 403: CSRF_RESPONSE, 429: THROTTLED},
        tags=[TAG],
    )
    def post(self, request):
        _enforce_csrf(request)
        auth_service.end_session(request.COOKIES.get(settings.REFRESH_COOKIE_NAME))
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _delete_refresh_cookie(response)
        return response
