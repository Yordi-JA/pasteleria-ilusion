"""Datos y avisos de la cuenta del cliente (`/cuenta/datos`, D72).

El cliente cambia su nombre, su teléfono y si quiere avisos por WhatsApp; el correo no se cambia. El sitio no manda
WhatsApp: la preferencia es para que la pastelería escriba a mano, así que sin teléfono no se puede marcar. El cambio
de contraseña vive en `auth_service`, porque cierra y abre sesiones.
"""
from dataclasses import dataclass

from ..models import WHATSAPP_NEEDS_PHONE
from ..repositories import user_repo
from .audit import audit_operation
from .errors import DomainValidationError


@dataclass(frozen=True)
class AccountDetails:
    email: str
    full_name: str
    phone: str
    has_password: bool
    google_linked: bool
    notify_whatsapp: bool


def get_account(user) -> AccountDetails:
    return AccountDetails(
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        has_password=user.has_usable_password(),
        google_linked=bool(user.google_sub),
        notify_whatsapp=user.notify_whatsapp,
    )


def _whatsapp_error() -> DomainValidationError:
    return DomainValidationError({"notify_whatsapp": [WHATSAPP_NEEDS_PHONE]})


def _user_context(user, *args, **kwargs) -> dict:
    """Solo el id de la cuenta para la auditoría: nada de lo que se escribió."""
    return {"user_id": user.pk}


@audit_operation(expected_errors=(DomainValidationError,), context=_user_context)
def update_account(user, changes: dict, *, users=user_repo) -> AccountDetails:
    """Aplica los cambios ya validados en su formato (`full_name`, `phone`, `notify_whatsapp`; cualquiera puede faltar).

    La regla se revisa con el resultado: marcar WhatsApp sin teléfono, o borrar el teléfono con WhatsApp marcado, se
    rechazan igual.
    """
    phone = changes.get("phone", user.phone)
    notify_whatsapp = changes.get("notify_whatsapp", user.notify_whatsapp)
    if notify_whatsapp and not phone:
        raise _whatsapp_error()
    try:
        users.update_profile(user, changes)
    except users.WhatsAppWithoutPhoneError as error:
        raise _whatsapp_error() from error
    return get_account(user)
