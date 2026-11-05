"""Datos del negocio para el pie y la franja superior del sitio."""
from dataclasses import dataclass
from datetime import time

from ..repositories import settings_repo


@dataclass(frozen=True)
class StoreInfo:
    """Dirección, WhatsApp, horario y días de anticipación de un pedido.

    `None` en la dirección o el WhatsApp: la pastelería aún no los define
    (PENDIENTE). La interfaz lo muestra como pendiente, nunca con un valor supuesto.
    """

    address: str | None
    whatsapp: str | None
    opens_at: time
    closes_at: time
    custom_lead_days: int


def _text_or_none(value: str) -> str | None:
    return value.strip() or None


def get_store_info(settings=settings_repo) -> StoreInfo:
    """Datos del negocio vigentes, tal como están en el admin.

    Como las demás configuraciones, si falta la fila de "horarios y entregas"
    falla (`ImproperlyConfigured`): la migración la crea y el admin no la borra.
    """
    store = settings.get_store_settings()
    return StoreInfo(
        address=_text_or_none(store.address),
        whatsapp=_text_or_none(store.whatsapp),
        opens_at=store.store_opens_at,
        closes_at=store.store_closes_at,
        custom_lead_days=store.custom_lead_days,
    )
