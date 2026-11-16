"""Acceso de clientes: registro, inicio de sesión con correo o con Google y sesiones (D62).

Una sesión es un par de JWT: el access (10 min) va en el cuerpo de la respuesta y el
refresh (7 días) en una cookie que pone la vista. Este módulo decide quién entra; la
vista solo traduce a HTTP.
"""
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import get_md5_hash_password

from config.security import login_allowed, record_failed_login

from ..repositories import user_repo
from . import google_identity
from .audit import audit_operation
from .errors import DomainValidationError

if TYPE_CHECKING:
    from ..models import User

EMAIL_TAKEN = "Ya hay una cuenta con este correo."

# Un refresh rotado hace menos de esto pudo rotarlo otra pestaña del mismo navegador: la
# cookie que tiene ya es la nueva y no se borra. Más viejo, es un refresh robado o
# perdido, y la cookie se borra.
RECENT_ROTATION = timedelta(seconds=60)

# Mensajes de la pantalla de registro por código de los validadores de Django.
PASSWORD_MESSAGES = {
    "password_too_short": "Te faltan caracteres: el mínimo es {min_length}.",
    "password_too_common": "Esa contraseña es muy común. Elige otra.",
    "password_entirely_numeric": "Usa también letras, no solo números.",
    "password_too_similar": "Se parece mucho a tu correo o a tu nombre. Elige otra.",
}


class AuthError(Exception):
    """Un acceso rechazado por una regla. `status` y `code` los usa la API."""

    status = 400
    code = "auth_error"
    message = ""

    def __init__(self, message: str | None = None):
        super().__init__(message or self.message)
        self.message = message or self.message


class InvalidCredentials(AuthError):
    status = 401
    code = "invalid_credentials"
    message = "El correo o la contraseña no coinciden."


class LockedOut(AuthError):
    """django-axes bloqueó el intento; la respuesta la arma `config.security.lockout_response`."""

    status = 429
    code = "locked_out"


class SessionExpired(AuthError):
    status = 401
    code = "session_expired"
    message = "Tu sesión terminó. Vuelve a entrar."

    def __init__(self, *, keep_cookie: bool = False):
        super().__init__()
        # Un refresh que otra pestaña acaba de rotar: la cookie del navegador ya es la nueva.
        # Su código propio deja que el sitio reintente una vez (sin `navigator.locks`).
        self.keep_cookie = keep_cookie
        if keep_cookie:
            self.code = "session_rotated"


class AccountExists(AuthError):
    status = 409
    code = "account_exists"
    message = "Ya hay una cuenta con este correo. Entra con tu correo y contraseña."


class GoogleConflict(AuthError):
    status = 409
    code = "google_conflict"
    message = "Este correo ya está ligado a otra cuenta de Google."


class InactiveAccount(AuthError):
    status = 403
    code = "inactive"
    message = "Esta cuenta está desactivada. Escríbenos por WhatsApp."


class RegistrationError(DomainValidationError):
    """Errores por campo del registro, con su código (`email_taken`, `password_too_short`...)."""

    def __init__(self, errors: dict[str, list[str]], codes: dict[str, list[str]]):
        super().__init__(errors)
        self.codes = codes


class PasswordChangeError(RegistrationError):
    """Errores por campo del cambio de contraseña (D72): `wrong_password` y los códigos de los validadores."""


WRONG_CURRENT_PASSWORD = "Tu contraseña actual no coincide."


@dataclass(frozen=True)
class Session:
    user: "User"
    refresh: str
    access: str
    access_expires_in: int
    # Solo con Google: la cuenta ya tenía contraseña y dejó de servir al ligarla.
    password_removed: bool = False


def start_session(user, *, password_removed: bool = False) -> Session:
    refresh = RefreshToken.for_user(user)
    return Session(
        user=user,
        refresh=str(refresh),
        access=str(refresh.access_token),
        access_expires_in=int(jwt_settings.ACCESS_TOKEN_LIFETIME.total_seconds()),
        password_removed=password_removed,
    )


def _password_errors(password: str, *, email: str, full_name: str) -> tuple[list[str], list[str]]:
    """Los validadores de `AUTH_PASSWORD_VALIDATORS`, con los mensajes de la pantalla."""
    candidate = get_user_model()(email=email, full_name=full_name)
    try:
        validate_password(password, user=candidate)
    except ValidationError as error:
        messages, codes = [], []
        for item in error.error_list:
            template = PASSWORD_MESSAGES.get(item.code)
            messages.append(template.format(**(item.params or {})) if template else item.messages[0])
            codes.append(item.code or "invalid")
        return messages, codes
    return [], []


@audit_operation(expected_errors=(RegistrationError,))
def register_customer(*, full_name: str, email: str, phone: str, password: str, users=user_repo) -> Session:
    """Crea la cuenta de un cliente con correo y contraseña y abre su sesión.

    Revisa el correo y la contraseña juntos, para devolver los dos errores a la vez.
    Decirle a alguien que el correo ya tiene cuenta lo pidió el usuario (D61); el
    throttle `register` acota cuántos correos se pueden revisar así.
    """
    errors: dict[str, list[str]] = {}
    codes: dict[str, list[str]] = {}
    if users.email_exists(email):
        errors["email"], codes["email"] = [EMAIL_TAKEN], ["email_taken"]
    password_messages, password_codes = _password_errors(password, email=email, full_name=full_name)
    if password_messages:
        errors["password"], codes["password"] = password_messages, password_codes
    if errors:
        raise RegistrationError(errors, codes)
    try:
        user = users.create_customer(email=email, password=password, full_name=full_name, phone=phone)
    except users.EmailTakenError as error:
        raise RegistrationError({"email": [EMAIL_TAKEN]}, {"email": ["email_taken"]}) from error
    return start_session(user)


@audit_operation(expected_errors=(AuthError,))
def login_with_password(request, *, email: str, password: str, users=user_repo) -> Session:
    """Inicio de sesión con correo. `request` es el `HttpRequest`: django-axes lo necesita.

    axes cuenta el fallo y, si con él se llega al límite, marca la petición
    (`axes_locked_out`); su middleware cambia entonces la respuesta por el 429.
    """
    existing = users.get_by_email(email)
    if existing is not None and _is_staff(existing):
        _reject_staff(request, email=existing.email, password=password)
    user = authenticate(request, email=email, password=password)
    if user is None:
        if getattr(request, "axes_locked_out", False):
            raise LockedOut
        raise InvalidCredentials
    users.touch_last_login(user)
    return start_session(user)


def _reject_staff(request, *, email: str, password: str):
    """La sesión del sitio es solo de clientes: el personal entra por el admin, con su bloqueo por IP.

    Nunca se revisa la contraseña de una cuenta del personal por esta vía, así la API no
    sirve para adivinarla. Responde como una contraseña equivocada, tarda lo mismo (un
    hash de relleno con el mismo algoritmo) y django-axes cuenta el intento como fallo:
    5 intentos, aciertos incluidos, bloquean ese correo desde esa IP.
    """
    credentials = {get_user_model().USERNAME_FIELD: email}
    if not login_allowed(request, credentials):
        raise LockedOut
    make_password(password)
    record_failed_login(request, credentials)
    if getattr(request, "axes_locked_out", False):
        raise LockedOut
    raise InvalidCredentials


def _is_staff(user) -> bool:
    return user.is_staff or user.is_superuser


def _check_active(user) -> None:
    if not user.is_active:
        raise InactiveAccount


@audit_operation(expected_errors=(AuthError, google_identity.GoogleSignInError))
def login_with_google(credential: str, *, users=user_repo, verify=None) -> Session:
    """Entra o crea la cuenta con el ID token de Google (ver D62 para cómo se liga).

    1. La cuenta ya ligada a ese `sub` entra, aunque su correo de Google haya cambiado.
    2. Sin cuenta con ese correo, se crea una sin contraseña.
    3. Con una cuenta de correo existente, se liga solo si Google es la autoridad del
       correo (Gmail o Workspace) y la cuenta no es del personal. La contraseña, que
       nadie verificó, deja de servir y se cierran sus sesiones: así quien registró
       antes ese correo con contraseña (cuenta pre-secuestrada) no conserva el acceso.
    """
    verify = verify or google_identity.verify_credential
    identity = verify(credential, client_id=settings.GOOGLE_CLIENT_ID)

    user = users.get_by_google_sub(identity.sub)
    if user is not None:
        if _is_staff(user):
            # Una cuenta de Google que luego pasó a ser del personal ya no abre sesión en el sitio.
            raise AccountExists
        _check_active(user)
        users.touch_last_login(user)
        return start_session(user)

    user = users.get_by_email(identity.email)
    if user is None:
        try:
            user = users.create_customer(
                email=identity.email, password=None, full_name=identity.name, google_sub=identity.sub
            )
        except users.EmailTakenError:
            # Otra petición la creó al mismo tiempo: se busca otra vez por `sub`.
            user = users.get_by_google_sub(identity.sub)
            if user is None:
                raise AccountExists from None
        users.touch_last_login(user)
        return start_session(user)

    if user.google_sub:
        raise GoogleConflict
    if _is_staff(user) or not identity.authoritative:
        raise AccountExists
    _check_active(user)
    had_password = user.has_usable_password()
    # Ligar y cerrar las sesiones anteriores van en una sola transacción.
    users.link_google(user, sub=identity.sub, full_name=identity.name, remove_password=had_password)
    users.touch_last_login(user)
    return start_session(user, password_removed=had_password)


def _user_context(user, *args, **kwargs) -> dict:
    """Solo el id de la cuenta para la auditoría: ni el correo ni las contraseñas."""
    return {"user_id": user.pk}


def _wrong_current_password() -> PasswordChangeError:
    return PasswordChangeError({"current_password": [WRONG_CURRENT_PASSWORD]}, {"current_password": ["wrong_password"]})


@audit_operation(expected_errors=(PasswordChangeError,), context=_user_context)
def change_password(user, *, current_password: str, new_password: str, users=user_repo) -> Session:
    """Cambia la contraseña desde "Datos y avisos" y deja abierta solo la sesión de quien la cambió (D72).

    La contraseña nueva sigue las reglas del registro (`AUTH_PASSWORD_VALIDATORS`, con el correo y el nombre de la
    cuenta). Una cuenta sin contraseña usable (solo de Google) o del personal responde lo mismo que una contraseña
    actual equivocada y tarda lo mismo (un hash de relleno): la API no dice si hay contraseña, y nunca revisa la de
    una cuenta del personal, que entra por el admin. Al cambiarla se cierran todas las sesiones de la cuenta y se
    abre una nueva para quien la cambió.
    """
    errors: dict[str, list[str]] = {}
    codes: dict[str, list[str]] = {}
    if _is_staff(user) or not user.has_usable_password():
        make_password(current_password)
        matches = False
    else:
        matches = user.check_password(current_password)
    if not matches:
        errors["current_password"], codes["current_password"] = [WRONG_CURRENT_PASSWORD], ["wrong_password"]
    password_messages, password_codes = _password_errors(new_password, email=user.email, full_name=user.full_name)
    if password_messages:
        errors["new_password"], codes["new_password"] = password_messages, password_codes
    if errors:
        raise PasswordChangeError(errors, codes)
    # El repositorio la revisa otra vez bajo el candado de la cuenta: otra petición pudo cambiarla mientras tanto.
    if not users.change_password(user, current_password=current_password, new_password=new_password):
        raise _wrong_current_password()
    return start_session(user)


class _UncheckedBlacklistRefresh(RefreshToken):
    """Verifica firma, tipo y expiración, pero deja la lista negra a `renew_session`.

    Así distingue un refresh ya rotado (no se borra la cookie) de uno inválido.
    """

    def check_blacklist(self) -> None:
        return None


def renew_session(raw_refresh: str | None, *, users=user_repo) -> Session:
    """Rota el refresh: el anterior queda en la lista negra y sale un par nuevo.

    Rechaza de forma explícita un refresh emitido antes de un cambio de contraseña
    (pendiente de D28): SimpleJWT lo renovaba, aunque el access que entregaba ya no
    servía. También el de una cuenta borrada o desactivada.
    """
    if not raw_refresh:
        raise SessionExpired
    try:
        refresh = _UncheckedBlacklistRefresh(raw_refresh)
    except TokenError as error:
        # Firma, tipo o expiración inválidos: la cookie ya no sirve.
        raise SessionExpired from error
    # Se reclama bajo candado: dos renovaciones simultáneas del mismo refresh no dan dos sesiones.
    rotated_at = users.claim_refresh(refresh)
    if rotated_at is not None:
        # Rotado hace un momento, quizá en otra pestaña: la cookie del navegador puede ser la nueva.
        raise SessionExpired(keep_cookie=timezone.now() - rotated_at < RECENT_ROTATION)

    user = users.get_by_id(refresh.payload.get(jwt_settings.USER_ID_CLAIM))
    stale = (
        user is None
        or not user.is_active
        or _is_staff(user)
        or refresh.payload.get(jwt_settings.REVOKE_TOKEN_CLAIM) != get_md5_hash_password(user.password)
    )
    if stale:
        raise SessionExpired
    return start_session(user)


def end_session(raw_refresh: str | None) -> None:
    """Salir: el refresh queda en la lista negra. Sin refresh válido no hay nada que cerrar."""
    if not raw_refresh:
        return
    try:
        RefreshToken(raw_refresh).blacklist()
    except TokenError:
        return
