"""Configuración editable: horarios, "Diseña tu pastel", políticas, subidas, bases y envío."""
from dataclasses import fields

from django.core.exceptions import ImproperlyConfigured

from ..models import (
    CakeDesignSettings,
    CakeStand,
    DeliveryFeeBand,
    PolicySettings,
    StoreSettings,
    UploadSettings,
)
from .records import (
    CakeDesignSettingsRecord,
    DeliveryBandRecord,
    PolicySettingsRecord,
    StandSizeRecord,
    StoreSettingsRecord,
    UploadSettingsRecord,
)


def _to_record(record_class, row):
    """Copia a un registro los campos que el registro declara."""
    return record_class(**{field.name: getattr(row, field.name) for field in fields(record_class)})


def _get_single_row(model, record_class):
    row = model.objects.filter(pk=1).first()
    if row is None:
        raise ImproperlyConfigured(
            f"Falta la configuración «{model._meta.verbose_name}». Corre `manage.py migrate`."
        )
    return _to_record(record_class, row)


def get_store_settings() -> StoreSettingsRecord:
    return _get_single_row(StoreSettings, StoreSettingsRecord)


def get_cake_design_settings() -> CakeDesignSettingsRecord:
    return _get_single_row(CakeDesignSettings, CakeDesignSettingsRecord)


def get_policy_settings() -> PolicySettingsRecord:
    return _get_single_row(PolicySettings, PolicySettingsRecord)


def get_upload_settings() -> UploadSettingsRecord:
    return _get_single_row(UploadSettings, UploadSettingsRecord)


def list_stand_sizes(active_only: bool = True) -> list[StandSizeRecord]:
    """Tamaños de base con su depósito, del más chico al más grande."""
    stands = CakeStand.objects.order_by("max_kg")
    if active_only:
        stands = stands.filter(is_active=True)
    return [_to_record(StandSizeRecord, stand) for stand in stands]


def list_delivery_bands() -> list[DeliveryBandRecord]:
    """Bandas de envío por distancia, de la más cercana a la más lejana."""
    return [_to_record(DeliveryBandRecord, band) for band in DeliveryFeeBand.objects.order_by("max_km")]
