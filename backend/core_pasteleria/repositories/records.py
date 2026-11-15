"""Registros inmutables que devuelven los repositorios.

Los repositorios no devuelven instancias del modelo: devuelven estos
`dataclass`, para que `MemoryRepo` (ver `memory.py`) devuelva los mismos tipos y
los servicios se prueben sin PostgreSQL. Este módulo no importa Django.
"""
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

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
    # La del producto, sin la de la presentación: el rebanado se ve completo en la vitrina (D60).
    product_photo: str


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
    # Lo marca la pastelería para "Pasteles de la casa" de la portada.
    featured_on_home: bool
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
    # Solo en un pan de dos colores: la mitad de abajo de cada capa.
    preview_color_bottom: str = ""
    # Solo en un pan con relleno incluido: cómo se ve (siempre sobre crema pastelera blanca) y el color de sus trozos.
    included_filling_preview_style: str = "smooth"
    included_filling_preview_color_secondary: str = ""


@dataclass(frozen=True)
class FillingFlavorRecord:
    slug: str
    name: str
    is_combinable: bool
    allowed_cake_types: tuple[str, ...]
    preview_color: str
    preview_style: str = "smooth"
    preview_color_secondary: str = ""


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
    # Solo las chispas: el sabor o el pan de donde salen su estilo y sus colores en la vista previa.
    # Solo se llenan si ese sabor o pan está activo (uno inactivo no se lista).
    preview_flavor: str | None = None
    preview_bread: str | None = None
    # La decoración apunta a un sabor o a un pan que la pastelería desactivó: no hay de dónde dibujarla.
    preview_source_inactive: bool = False
    # Los diseños con duya y las rosas: el cliente elige su color (regla 6.1).
    accepts_color: bool = False


@dataclass(frozen=True)
class TierRecommendationRecord:
    """Kilos mínimos para un número de pisos (regla 3.3, D50): con menos, no se pueden elegir."""

    tiers: int
    recommended_min_kg: int
    recommended_max_kg: int | None


@dataclass(frozen=True)
class CakeMoldRecord:
    """Un molde de la pastelería (D52): los kilos que rinde y sus medidas en cm."""

    form: str
    kg: Decimal
    # El diámetro en un molde redondo; el largo en uno rectangular.
    length_cm: Decimal
    # `None` en un molde redondo.
    width_cm: Decimal | None


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
    # `None`: PENDIENTE; la oblea no se puede pedir hasta que la pastelería le ponga precio.
    wafer_price: Decimal | None
    wafer_max_width_cm: Decimal
    wafer_max_height_cm: Decimal
    message_suggested_max_words: int


@dataclass(frozen=True)
class PolicySettingsRecord:
    stand_return_days: int
    # Vacío: PENDIENTE.
    damaged_stand_policy: str
    # Parte del pedido que se paga hoy (regla 10); el resto, el día de la entrega.
    advance_percent: int
    # Topes de los pedidos en línea (D63); los valores por omisión son los propuestos.
    payment_window_minutes: int = 30
    max_unpaid_orders_per_customer: int = 2
    max_days_ahead: int = 60
    max_pieces_per_line: int = 20
    max_pieces_per_order: int = 100
    # `None`: PENDIENTE; la cotización no vence (D63, ronda 2).
    quote_expiry_hours: int | None = None
    max_quote_orders_per_customer: int = 1
    max_unpaid_showcase_pieces: int = 10
    expired_showcase_cooldown_hours: int = 24


@dataclass(frozen=True)
class UploadSettingsRecord:
    max_upload_mb: int
    max_reference_images: int
    # D63; los valores por omisión son los propuestos.
    max_pending_images: int = 10
    max_image_megapixels: int = 12
    daily_upload_mb: int = 25
    daily_upload_count: int = 20


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


# --- Imágenes de clientes ---


@dataclass(frozen=True)
class NewCustomerImage:
    """Imagen ya validada y vuelta a codificar, lista para guardarse."""

    owner_id: int
    purpose: str
    content: bytes
    content_type: str
    width: int
    height: int
    original_name: str


@dataclass(frozen=True)
class CustomerImageRecord:
    """Datos de una imagen, sin su contenido."""

    id: UUID
    owner_id: int
    purpose: str
    content_type: str
    width: int
    height: int
    size_bytes: int
    original_name: str


@dataclass(frozen=True)
class StoredImageRecord:
    """El contenido de una imagen, para entregarlo."""

    id: UUID
    content: bytes
    content_type: str


# --- Pedidos ---


@dataclass(frozen=True)
class NewCakeDesign:
    """Diseño ya revalidado y calculado por el servidor. Las opciones van por su `slug`."""

    people: int
    kg: int
    form: str
    tiers: int
    cake_type: str
    bread: str
    filling_base: str | None
    filling_flavors: tuple[str, ...]
    coverage_color: str
    coverage_color_name: str
    decoration: str
    decoration_color: str | None
    decoration_color_name: str
    decoration_image_id: UUID | None
    message: dict | None
    wafer: bool
    wafer_layout: dict | None
    wafer_image_id: UUID | None
    occasion: str
    price_per_kg: Decimal
    cake_subtotal: Decimal
    wafer_price: Decimal
    decoration_price: Decimal
    total: Decimal
    requires_quote: bool
    # El tamaño de base se identifica por sus kilos máximos (únicos); `None` sin base.
    stand_max_kg: int | None
    stand_deposit: Decimal


@dataclass(frozen=True)
class NewOrderItem:
    kind: str
    offering_id: int | None
    product_name: str
    presentation: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    design: NewCakeDesign | None
    # El pan del día que consume un encargo para hoy (se devuelve si el pedido se cancela).
    bread_id: int | None = None


@dataclass(frozen=True)
class NewOrder:
    customer_id: int
    idempotency_key: str
    status: str
    status_changed_at: datetime
    fulfillment: str
    delivery_slot_id: int
    subtotal: Decimal
    stand_deposit: Decimal
    delivery_fee: Decimal
    advance_percent: int | None
    advance: Decimal | None
    pay_today: Decimal | None
    pay_on_delivery: Decimal | None
    payment_due_at: datetime | None
    items: tuple[NewOrderItem, ...]
    # Lo de la vitrina de hoy, que se paga completo dentro del anticipo.
    paid_in_full: Decimal | None = None


@dataclass(frozen=True)
class CakeDesignRecord(NewCakeDesign):
    stand_min_kg: int | None = None


@dataclass(frozen=True)
class OrderItemRecord:
    kind: str
    offering_id: int | None
    product_name: str
    presentation: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    design: CakeDesignRecord | None


@dataclass(frozen=True)
class OrderRecord:
    id: int
    customer_id: int
    status: str
    fulfillment: str
    delivery_date: date
    slot_starts_at: time
    slot_ends_at: time
    subtotal: Decimal
    stand_deposit: Decimal
    delivery_fee: Decimal
    advance_percent: int | None
    advance: Decimal | None
    pay_today: Decimal | None
    pay_on_delivery: Decimal | None
    payment_due_at: datetime | None
    created_at: datetime
    items: tuple[OrderItemRecord, ...]
    paid_in_full: Decimal | None = None
    status_changed_at: datetime | None = None
    delivery_slot_id: int | None = None


@dataclass(frozen=True)
class ReleasedLine:
    """Lo que un pedido cancelado devuelve: piezas de la vitrina o pan del día, con su día."""

    offering_id: int | None
    bread_id: int | None
    quantity: int
    on_date: date


@dataclass(frozen=True)
class OrderSlotRecord:
    """El lapso de un pedido y hasta cuándo se puede pagar, para volver a revisar el cupo al cobrarlo."""

    delivery_slot_id: int
    payment_due_at: datetime | None


@dataclass(frozen=True)
class QuoteRecord:
    """Un pedido en pausa por cotización, bloqueado, con lo que hace falta para ponerle precio."""

    order_id: int
    subtotal: Decimal
    stand_deposit: Decimal
    delivery_fee: Decimal
    paid_in_full: Decimal
    delivery_date: date
    slot_starts_at: time
    design_id: int
    design_total: Decimal


@dataclass(frozen=True)
class QuotePrice:
    """Los montos que calcula el servicio al cotizar; el repositorio solo los guarda."""

    decoration_price: Decimal
    design_total: Decimal
    subtotal: Decimal
    advance_percent: int
    advance: Decimal
    pay_today: Decimal
    pay_on_delivery: Decimal
    paid_in_full: Decimal
    payment_due_at: datetime
    status: str
    status_changed_at: datetime
