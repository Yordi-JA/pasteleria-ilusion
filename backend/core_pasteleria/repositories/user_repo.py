"""Cuentas de clientes y sus sesiones (D62).

A diferencia del catálogo, devuelve instancias de `User`: el acceso las entrega a
Django (`authenticate`, permisos) y a SimpleJWT (`RefreshToken.for_user`), que
trabajan con el modelo de usuario. La API nunca las serializa tal cual: pasan por
`SessionUserSerializer`.
"""
from datetime import datetime

from django.contrib.auth import get_user_model
from django.contrib.auth.models import update_last_login
from django.db import IntegrityError, transaction
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

# Restricciones cuyo choque quiere decir "ese correo (o esa cuenta de Google) ya tiene
# cuenta". Las de `unique=True` las nombra Django como `<tabla>_<campo>_key`.
ACCOUNT_TAKEN_CONSTRAINTS = frozenset(
    {"user_email_ci_unique", "core_pasteleria_user_email_key", "core_pasteleria_user_google_sub_key"}
)


class EmailTakenError(Exception):
    """El correo o la cuenta de Google ya tiene cuenta (la restricción de la base lo detectó)."""


def _users():
    return get_user_model().objects


def get_by_id(user_id):
    return _users().filter(pk=user_id).first()


def get_by_email(email: str):
    return _users().filter(email=_users().normalize_email(email)).first()


def get_by_google_sub(sub: str):
    return _users().filter(google_sub=sub).first()


def email_exists(email: str) -> bool:
    return _users().filter(email=_users().normalize_email(email)).exists()


def _constraint_name(error: IntegrityError) -> str | None:
    diag = getattr(error.__cause__, "diag", None)
    return getattr(diag, "constraint_name", None)


def create_customer(*, email: str, password: str | None, full_name: str, phone: str = "", google_sub: str | None = None):
    """Crea un cliente (nunca personal). Sin contraseña queda sin contraseña usable.

    Si otra petición creó el mismo correo o la misma cuenta de Google al mismo tiempo,
    la restricción de la base lo detecta y lanza `EmailTakenError`. Cualquier otro
    choque (por ejemplo, un teléfono que no son 10 dígitos) se relanza tal cual: no es
    "ya hay una cuenta".
    """
    try:
        with transaction.atomic():
            return _users().create_user(email, password, full_name=full_name, phone=phone, google_sub=google_sub)
    except IntegrityError as error:
        if _constraint_name(error) in ACCOUNT_TAKEN_CONSTRAINTS:
            raise EmailTakenError from error
        raise


def link_google(user, *, sub: str, full_name: str, remove_password: bool) -> None:
    """Liga la cuenta de Google y cierra todas sus sesiones, en una sola transacción.

    Con `remove_password`, la contraseña deja de servir. Si cerrar las sesiones falla,
    la cuenta no queda ligada.
    """
    user.google_sub = sub
    fields = ["google_sub"]
    if not user.full_name and full_name:
        user.full_name = full_name
        fields.append("full_name")
    if remove_password:
        user.set_unusable_password()
        fields.append("password")
    with transaction.atomic():
        user.save(update_fields=fields)
        _revoke_all_sessions(user)


def touch_last_login(user) -> None:
    update_last_login(None, user)


def _revoke_all_sessions(user) -> None:
    pending = OutstandingToken.objects.filter(user=user, blacklistedtoken__isnull=True)
    BlacklistedToken.objects.bulk_create([BlacklistedToken(token=token) for token in pending], ignore_conflicts=True)


def claim_refresh(refresh) -> datetime | None:
    """Pone un refresh (ya verificado) en la lista negra bajo candado, para rotarlo una sola vez.

    Devuelve `None` si esta llamada lo reclamó. Si ya estaba en la lista negra (otra
    pestaña o una petición simultánea lo rotó), devuelve cuándo entró. El candado sobre
    `OutstandingToken` ordena dos renovaciones simultáneas del mismo refresh; la
    restricción única de `BlacklistedToken` es la última defensa.
    """
    # `outstand()` registra el refresh si no estaba (get_or_create) y devuelve la tupla.
    outstanding_id = refresh.outstand()[0].pk
    with transaction.atomic():
        outstanding = OutstandingToken.objects.select_for_update().get(pk=outstanding_id)
        existing = BlacklistedToken.objects.filter(token=outstanding).first()
        if existing is not None:
            return existing.blacklisted_at
        try:
            with transaction.atomic():
                BlacklistedToken.objects.create(token=outstanding)
        except IntegrityError:
            return BlacklistedToken.objects.get(token=outstanding).blacklisted_at
        return None
