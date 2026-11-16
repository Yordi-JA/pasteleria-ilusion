"""Los enlaces por correo de la cuenta (D76): confirmar el correo al registrarse y recuperar la contraseña.

- Registrarse crea la cuenta sin confirmar (`auth_service.register_customer`) y manda "Confirma tu cuenta", con un
  enlace a `/verificar#<token>` que vale `EMAIL_VERIFICATION_TIMEOUT` (24 h) y una sola vez.
- Abrir ese enlace (`verify_email`) confirma la cuenta y no abre sesión: quien abre un enlace no queda dentro de esa
  cuenta (contra el inicio de sesión forzado y la cuenta tomada antes de existir). Después se entra con la contraseña.
- Reenviarlo (`resend_confirmation`) y pedir uno para recuperar la contraseña (`request_password_reset`) no dicen nada
  de la cuenta: la vista responde siempre lo mismo. Solo deciden si sale un correo, y el correo sale fuera de la
  petición (`email_service.send_account_email`), así la respuesta tarda lo mismo haya o no correo.
- Abrir el enlace de recuperación (`reset_password`, `PASSWORD_RESET_TIMEOUT`, 1 h) pone la contraseña nueva con las
  reglas del registro, confirma el correo, cierra todas las sesiones y abre una nueva.

La sesión del sitio es solo de clientes (D62): una cuenta del personal no recibe enlaces y sus tokens no sirven. La
auditoría registra solo el id de la cuenta, nunca el correo ni el token.
"""
from dataclasses import dataclass

from ..repositories import user_repo
from . import email_service
from .account_tokens import AccountLinkTokens, email_verification_tokens, password_reset_tokens
from .audit import audit_operation
from .auth_service import (
    AuthError,
    RegistrationError,
    Session,
    _is_staff,
    _password_errors,
    register_customer,
    start_session,
)


class InvalidLink(AuthError):
    """El enlace venció, ya se usó, está incompleto o no es de una cuenta que pueda usarlo. Una sola respuesta."""

    status = 400
    code = "invalid_link"
    message = "Este enlace ya no sirve: venció, ya se usó o está incompleto."


class PasswordResetError(RegistrationError):
    """La contraseña nueva no cumple las reglas del registro; el enlace sigue sirviendo."""


@dataclass(frozen=True)
class Registration:
    """Lo que `/verificar` dice después de registrarse: a qué correo se mandó el enlace y en cuántas horas vence."""

    email: str
    expires_in_hours: int


def confirmation_hours() -> int:
    return email_verification_tokens.hours


def reset_hours() -> int:
    return password_reset_tokens.hours


def _is_customer(user) -> bool:
    return user is not None and user.is_active and not _is_staff(user)


def _send_confirmation(user) -> None:
    email_service.send_account_email(
        email_service.ACCOUNT_CONFIRMATION,
        user_id=user.pk,
        to=user.email,
        url=email_service.site_url(f"/verificar#{email_verification_tokens.make(user)}"),
        hours=confirmation_hours(),
    )


def register(*, full_name: str, email: str, phone: str, password: str, users=user_repo) -> Registration:
    """Crea la cuenta sin confirmar y le manda el enlace. Los errores por campo son los del registro (D62)."""
    user = register_customer(full_name=full_name, email=email, phone=phone, password=password, users=users)
    _send_confirmation(user)
    return Registration(email=user.email, expires_in_hours=confirmation_hours())


def _account_from(token: str, users):
    """La cuenta que nombra el token (sin verificarlo todavía), o `None`."""
    user_id = AccountLinkTokens.user_id(token)
    return users.get_by_id(user_id) if user_id is not None else None


def _session_user_id(session: Session) -> dict:
    return {"user_id": session.user.pk}


def _user_id(user) -> dict:
    return {"user_id": user.pk}


def _confirmation_link_valid(user, token: str) -> bool:
    return _is_customer(user) and user.email_verified_at is None and email_verification_tokens.check(user, token)


@audit_operation(expected_errors=(InvalidLink,), describe=_user_id)
def verify_email(token: str, *, users=user_repo):
    """Confirma la cuenta con el enlace del correo. No abre sesión ni toca la que tenga el navegador.

    Abrir sesión aquí dejaría que un atacante mande su propio enlace y deje a la víctima dentro de la cuenta del
    atacante, o que registre el correo de la víctima con su contraseña y la víctima, al confirmar, use esa cuenta. El
    token firma `email_verified_at`: al confirmarse, deja de valer. `user_repo.confirm_email` lo revisa otra vez con la
    fila bloqueada, así dos peticiones con el mismo enlace confirman una sola vez.
    """
    user = _account_from(token, users)
    if not _confirmation_link_valid(user, token):
        raise InvalidLink
    if not users.confirm_email(user, still_valid=lambda locked: _confirmation_link_valid(locked, token)):
        raise InvalidLink
    return user


@audit_operation
def resend_confirmation(email: str, *, users=user_repo) -> None:
    """Manda otro enlace solo a una cuenta de cliente activa sin confirmar. No dice si lo mandó."""
    user = users.get_by_email(email)
    if _is_customer(user) and user.email_verified_at is None:
        _send_confirmation(user)


@audit_operation
def request_password_reset(email: str, *, users=user_repo) -> None:
    """Manda el enlace para crear una contraseña nueva, o el aviso de entrar con Google. No dice qué pasó.

    - Cliente activo con contraseña: el enlace a `/recuperar#<token>`.
    - Cliente activo solo de Google (sin contraseña usable): "Entra con Google", con el enlace a `/entrar`.
    - Personal, cuenta desactivada, sin contraseña ni Google, o correo sin cuenta: nada.
    """
    user = users.get_by_email(email)
    if not _is_customer(user):
        return
    if user.has_usable_password():
        email_service.send_account_email(
            email_service.PASSWORD_RESET,
            user_id=user.pk,
            to=user.email,
            url=email_service.site_url(f"/recuperar#{password_reset_tokens.make(user)}"),
            hours=reset_hours(),
        )
    elif user.google_sub:
        email_service.send_account_email(
            email_service.GOOGLE_SIGN_IN, user_id=user.pk, to=user.email, url=email_service.site_url("/entrar")
        )


def _reset_link_valid(user, token: str) -> bool:
    return _is_customer(user) and user.has_usable_password() and password_reset_tokens.check(user, token)


@audit_operation(expected_errors=(InvalidLink, PasswordResetError), describe=_session_user_id)
def reset_password(token: str, *, new_password: str, users=user_repo) -> Session:
    """Pone la contraseña nueva con el enlace de recuperación, confirma el correo y deja abierta solo una sesión nueva.

    Primero el enlace (sin enlace válido no se dice nada de la contraseña) y luego las reglas del registro, con el
    correo y el nombre de la cuenta; un error de la contraseña no gasta el enlace. `user_repo.reset_password` revisa el
    enlace otra vez con la fila bloqueada: el token firma el hash de la contraseña, así sirve una sola vez.
    """
    user = _account_from(token, users)
    if not _reset_link_valid(user, token):
        raise InvalidLink
    messages, codes = _password_errors(new_password, email=user.email, full_name=user.full_name)
    if messages:
        raise PasswordResetError({"new_password": messages}, {"new_password": codes})
    def still_valid(locked) -> bool:
        return _reset_link_valid(locked, token)

    if not users.reset_password(user, still_valid=still_valid, new_password=new_password):
        raise InvalidLink
    users.touch_last_login(user)
    return start_session(user)
