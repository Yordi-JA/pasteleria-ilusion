"""Registros inmutables que devuelven los repositorios.

Los repositorios no devuelven instancias del modelo: devuelven estos
`dataclass`, para que `MemoryRepo` (ver `memory.py`) devuelva los mismos tipos y
los servicios se prueben sin PostgreSQL. Este módulo no importa Django.
"""
from dataclasses import dataclass
from datetime import time
from decimal import Decimal

# --- Catálogo ---


@dataclass(frozen=True)
class OfferingRecord:
    """Presentación a la venta de un producto, con su precio y sus existencias del día."""

    id: int
    product_id: int
    product_slug: str
    product_name: str
    category: str
    sales_channel: str
    presentation: str
    price: Decimal
    approx_weight_kg: Decimal | None
    servings: int | None
    # La de la presentación o, si no tiene, la del producto. Vacía: PENDIENTE.
    photo: str
    # `None`: no se cargaron existencias para ese día (no aparece en vitrina).
    # `0`: agotada por hoy.
    stock: int | None


@dataclass(frozen=True)
class ProductRecord:
    """Producto del catálogo con sus presentaciones activas."""

    id: int
    slug: str
    name: str
    category: str
    sales_channel: str
    summary: str
    description: str
    cake_type: str | None
    bread_id: int | None
    bread_slug: str | None
    filling_base_slug: str | None
    filling_flavor_slug: str | None
    # Vacíos: PENDIENTE.
    storage_notes: str
    transport_notes: str
    photo: str
    offerings: tuple[OfferingRecord, ...]


# --- Opciones de "Diseña tu pastel" ---


@dataclass(frozen=True)
class BreadRecord:
    id: int
    slug: str
    name: str
    description: str
    pricing_mode: str
    price_per_kg: Decimal
    included_filling: str
    allowed_cake_types: tuple[str, ...]
    preview_color: str


@dataclass(frozen=True)
class FillingFlavorRecord:
    slug: str
    name: str
    is_combinable: bool
    allowed_cake_types: tuple[str, ...]
    preview_color: str


@dataclass(frozen=True)
class FillingBaseRecord:
    slug: str
    name: str
    description: str
    preview_color: str
    max_flavors: int
    combined_extra_per_kg: Decimal
    flavors: tuple[FillingFlavorRecord, ...]


@dataclass(frozen=True)
class CoverageColorRecord:
    slug: str
    name: str
    preview_color: str


@dataclass(frozen=True)
class DecorationRecord:
    slug: str
    name: str
    description: str
    pricing: str
    # `None` en una decoración de precio fijo: PENDIENTE, nunca se cobra como $0.
    price: Decimal | None


@dataclass(frozen=True)
class TierRecommendationRecord:
    tiers: int
    recommended_min_kg: int
    recommended_max_kg: int | None


# --- Configuraciones, bases y envío ---


@dataclass(frozen=True)
class StoreSettingsRecord:
    store_opens_at: time
    store_closes_at: time
    first_slot_starts_at: time
    last_slot_starts_at: time
    slot_minutes: int
    max_orders_per_slot: int
    custom_lead_days: int
    same_day_showcase_lead_hours: int
    free_delivery_from_kg: int
    # Vacíos: PENDIENTE.
    address: str
    whatsapp: str


@dataclass(frozen=True)
class CakeDesignSettingsRecord:
    people_per_kg: int
    min_custom_kg: int
    max_online_kg: int
    wafer_price: Decimal
    wafer_max_width_cm: Decimal
    wafer_max_height_cm: Decimal
    message_suggested_max_words: int


@dataclass(frozen=True)
class PolicySettingsRecord:
    stand_return_days: int
    # Vacío: PENDIENTE.
    damaged_stand_policy: str


@dataclass(frozen=True)
class UploadSettingsRecord:
    max_upload_mb: int
    max_reference_images: int


@dataclass(frozen=True)
class StandSizeRecord:
    min_kg: int
    max_kg: int
    deposit: Decimal
    origin: str
    description: str
    is_active: bool


@dataclass(frozen=True)
class DeliveryBandRecord:
    max_km: Decimal
    fee: Decimal
