"""Vistas del acceso de clientes (D62): registro, inicio de sesión, Google, renovación y salida; y los enlaces por
correo (D76): confirmar la cuenta, reenviar la confirmación y recuperar la contraseña.

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

from ..services import account_link_service, auth_service, google_identity
from .account_serializers import PasswordChangeRequestSerializer
from .auth_serializers import (
    AuthErrorSerializer,
    EmailRequestSerializer,
    EmailVerifiedSerializer,
    GoogleLoginRequestSerializer,
    GoogleSessionSerializer,
    LinkSentSerializer,
    LoginRequestSerializer,
    PasswordResetConfirmRequestSerializer,
    RegisterRequestSerializer,
    RegistrationSerializer,
    SessionSerializer,
    VerifyEmailRequestSerializer,
)
from .throttles import (
    PasswordChangeIPThrottle,
    PasswordChangeUserThrottle,
    PasswordResetEmailThrottle,
    PasswordResetIPThrottle,
    SecurityScopedRateThrottle,
    VerificationResendEmailThrottle,
    VerificationResendIPThrottle,
)

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


def _field_errors(serializer) -> Response:
    """Los errores de formato por campo, con sus códigos en `codes`, como los del registro (D62)."""
    codes = {field: [detail.code for detail in details] for field, details in serializer.errors.items()}
    return Response({**serializer.errors, "codes": codes}, status=status.HTTP_400_BAD_REQUEST)


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
            "Crea la cuenta de un cliente sin confirmar y le manda el correo \"Confirma tu cuenta\" con el enlace a "
            "`/verificar#<token>` (D76). No abre sesión ni pone cookies: responde el correo y las horas que vale el "
            "enlace. Los errores van por campo, en español, con su código en `codes` (`email_taken` cuando el correo "
            "ya tiene cuenta). Limitado por IP (`register`)."
        ),
        request=RegisterRequestSerializer,
        responses={
            201: RegistrationSerializer,
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
            return _field_errors(serializer)
        data = serializer.validated_data
        try:
            registration = account_link_service.register(
                full_name=data["full_name"], email=data["email"], phone=data["phone"], password=data["password"]
            )
        except auth_service.RegistrationError as error:
            return Response({**error.errors, "codes": error.codes}, status=status.HTTP_400_BAD_REQUEST)
        return Response(RegistrationSerializer(registration).data, status=status.HTTP_201_CREATED)


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
            403: _error(
                "email_unverified",
                "La contraseña es correcta pero la cuenta no confirmó su correo (D76); o falta el CSRF.",
                auth_service.EmailUnverified.message,
            ),
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
            return _field_errors(serializer)
        try:
            session = auth_service.change_password(
                request.user,
                current_password=serializer.validated_data["current_password"],
                new_password=serializer.validated_data["new_password"],
            )
        except auth_service.PasswordChangeError as error:
            return Response({**error.errors, "codes": error.codes}, status=status.HTTP_400_BAD_REQUEST)
        return _session_response(session)


INVALID_LINK = _error("invalid_link", "El enlace venció, ya se usó o está incompleto.", account_link_service.InvalidLink.message)
RESEND_ANSWER = "Si tu cuenta está pendiente de confirmar, te enviamos otro enlace."
RESET_ANSWER = "Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva."


class VerifyEmailView(AuthView):
    throttle_scope = "email_verify"

    @extend_schema(
        operation_id="auth_verify",
        summary="Confirmar la cuenta con el enlace del correo",
        description=(
            "Recibe el token del enlace `/verificar#<token>` (el sitio lo lee del fragmento y lo quita de la URL) y "
            "confirma la cuenta. No abre sesión ni toca la cookie del refresh que ya traiga el navegador: después se "
            "entra con la contraseña. El enlace vence en 24 horas y sirve una vez; vencido, usado, incompleto o de una "
            "cuenta que no puede usarlo responde 400 `invalid_link`. Limitado por IP (`email_verify`)."
        ),
        request=VerifyEmailRequestSerializer,
        responses={
            200: OpenApiResponse(
                response=EmailVerifiedSerializer,
                examples=[OpenApiExample("Confirmada", value={"email_verified": True})],
            ),
            400: INVALID_LINK,
            403: CSRF_RESPONSE,
            429: THROTTLED,
        },
        tags=[TAG],
    )
    def post(self, request):
        _enforce_csrf(request)
        serializer = VerifyEmailRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _field_errors(serializer)
        try:
            account_link_service.verify_email(serializer.validated_data["token"])
        except account_link_service.InvalidLink as error:
            return _auth_error(error)
        return Response(EmailVerifiedSerializer({"email_verified": True}).data)


class VerificationResendView(AuthView):
    throttle_classes = [VerificationResendEmailThrottle, VerificationResendIPThrottle]

    @extend_schema(
        operation_id="auth_verify_resend",
        summary="Reenviar el enlace para confirmar la cuenta",
        description=(
            "Responde siempre lo mismo, exista o no la cuenta y esté o no confirmada. Solo una cuenta de cliente "
            "activa sin confirmar recibe otro enlace. El correo sale fuera de la petición. Limitado por correo "
            "(`verify_resend_email`) y por IP (`verify_resend_ip`)."
        ),
        request=EmailRequestSerializer,
        responses={
            200: OpenApiResponse(
                response=LinkSentSerializer,
                examples=[OpenApiExample("Siempre igual", value={"detail": RESEND_ANSWER, "expires_in_hours": 24})],
            ),
            400: OpenApiResponse(description="El correo no tiene forma de correo."),
            403: CSRF_RESPONSE,
            429: THROTTLED,
        },
        tags=[TAG],
    )
    def post(self, request):
        _enforce_csrf(request)
        serializer = EmailRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _field_errors(serializer)
        account_link_service.resend_confirmation(serializer.validated_data["email"])
        return Response({"detail": RESEND_ANSWER, "expires_in_hours": account_link_service.confirmation_hours()})


class PasswordResetView(AuthView):
    throttle_classes = [PasswordResetEmailThrottle, PasswordResetIPThrottle]

    @extend_schema(
        operation_id="auth_password_reset",
        summary="Pedir el enlace para recuperar la contraseña",
        description=(
            "Responde siempre lo mismo. Un cliente activo con contraseña recibe un enlace a `/recuperar#<token>` que "
            "vence en 1 hora y sirve una vez; uno que solo entra con Google, un correo que le dice que use \"Continuar "
            "con Google\"; el personal y los correos sin cuenta, nada. El correo sale fuera de la petición, para que "
            "la respuesta tarde lo mismo. Limitado por correo (`password_reset_email`) y por IP (`password_reset_ip`)."
        ),
        request=EmailRequestSerializer,
        responses={
            200: OpenApiResponse(
                response=LinkSentSerializer,
                examples=[OpenApiExample("Siempre igual", value={"detail": RESET_ANSWER, "expires_in_hours": 1})],
            ),
            400: OpenApiResponse(description="El correo no tiene forma de correo."),
            403: CSRF_RESPONSE,
            429: THROTTLED,
        },
        tags=[TAG],
    )
    def post(self, request):
        _enforce_csrf(request)
        serializer = EmailRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _field_errors(serializer)
        account_link_service.request_password_reset(serializer.validated_data["email"])
        return Response({"detail": RESET_ANSWER, "expires_in_hours": account_link_service.reset_hours()})


class PasswordResetConfirmView(AuthView):
    throttle_scope = "password_reset_confirm"

    @extend_schema(
        operation_id="auth_password_reset_confirm",
        summary="Crear la contraseña nueva con el enlace del correo",
        description=(
            "Recibe el token del enlace `/recuperar#<token>` y la contraseña nueva, que sigue las reglas del registro. "
            "Guarda la contraseña, confirma el correo, cierra todas las sesiones de la cuenta y abre una nueva: el "
            "access en el cuerpo y el refresh en la cookie. Un error de la contraseña no gasta el enlace. Limitado por "
            "IP (`password_reset_confirm`)."
        ),
        request=PasswordResetConfirmRequestSerializer,
        responses={
            200: SessionSerializer,
            400: OpenApiResponse(
                description="`invalid_link`, o errores por campo de la contraseña nueva con sus códigos.",
                examples=[
                    OpenApiExample("Enlace", value={"detail": account_link_service.InvalidLink.message, "code": "invalid_link"}),
                    OpenApiExample(
                        "Contraseña corta",
                        value={
                            "new_password": ["Te faltan caracteres: el mínimo es 8."],
                            "codes": {"new_password": ["password_too_short"]},
                        },
                    ),
                ],
            ),
            403: CSRF_RESPONSE,
            429: THROTTLED,
        },
        tags=[TAG],
    )
    def post(self, request):
        _enforce_csrf(request)
        serializer = PasswordResetConfirmRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _field_errors(serializer)
        try:
            session = account_link_service.reset_password(
                serializer.validated_data["token"], new_password=serializer.validated_data["new_password"]
            )
        except account_link_service.InvalidLink as error:
            return _auth_error(error)
        except account_link_service.PasswordResetError as error:
            return Response({**error.errors, "codes": error.codes}, status=status.HTTP_400_BAD_REQUEST)
        return _new_session_response(request, session)


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
