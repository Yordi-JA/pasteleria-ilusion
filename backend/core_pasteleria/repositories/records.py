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
    # `None`: PENDIENTE ("[Precio por confirmar]"); esa presentación no se puede pedir.
    price: Decimal | None
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
    # Pastel de vitrina (tanda 2): un pan con relleno incluido se cobra con el precio de catálogo de su pastel.
    showcase_price: "GroupPrice | None" = None


@dataclass(frozen=True)
class GroupPrice:
    """El precio de catálogo de un grupo de pasteles de vitrina; `amount` en `None` es PENDIENTE."""

    name: str
    amount: Decimal | None


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
    # Pastel de vitrina (tanda 2): el precio de catálogo del grupo de esta base; `None`, no se ofrece en vitrina.
    showcase_price: GroupPrice | None = None
    # No hay pastel mini con queso ni con flan.
    available_in_mini: bool = False


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
    # El pastel mini solo lleva las decoraciones marcadas; una de precio fijo cobra ahí su `mini_price` (`None`: PENDIENTE).
    available_in_mini: bool = False
    mini_price: Decimal | None = None


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


@dataclass(frozen=True)
class DesignSizeRecord:
    """El pastel de vitrina o el mini (tanda 2): su molde y lo que dice su precio de catálogo."""

    code: str
    # Del precio de catálogo; `None` es PENDIENTE.
    price: Decimal | None
    approx_weight_kg: Decimal | None
    servings: int | None
    diameter_cm: Decimal
    height_cm: Decimal
    # Solo la vitrina: contra qué se cobra la diferencia por kilo de lo elegido.
    reference_cake_type: str = ""
    reference_bread: str | None = None


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
    # El alto mínimo de la letra del mensaje en cm; `None` (solo en pruebas en memoria) no revisa el mínimo.
    message_min_letter_cm: Decimal | None = None


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
    # D70: `None` es PENDIENTE (la cotización por referencia no vence); lo que se retiene al cancelar un pedido pagado.
    reference_quote_valid_hours: int | None = None
    customer_cancel_retention_percent: int = 50


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


# --- Bases prestadas (D69) ---


@dataclass(frozen=True)
class LoanableStand:
    """Un pastel del pedido con base y depósito: lo que se presta al entregarlo. Es de un diseño o del envío de
    referencia aceptado (D70)."""

    design_id: int | None
    stand_id: int
    deposit: Decimal
    reference_request_id: int | None = None


@dataclass(frozen=True)
class StandLoanRecord:
    id: int
    order_id: int
    # `None` en la base del pastel de un envío de referencia (D70).
    design_id: int | None
    kg: int
    deposit: Decimal
    status: str
    delivered_on: date
    due_date: date
    returned_at: datetime | None
    deposit_refunded: bool


@dataclass(frozen=True)
class NewCakeDesign:
    """Diseño ya revalidado y calculado por el servidor. Las opciones van por su `slug`."""

    # Por kilos, las del cliente; vitrina y mini, las que rinden (`None` si no se han definido).
    people: int | None
    # Solo por kilos.
    kg: int | None
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
    price_per_kg: Decimal | None
    cake_subtotal: Decimal
    wafer_price: Decimal
    decoration_price: Decimal
    total: Decimal
    requires_quote: bool
    # El tamaño de base se identifica por sus kilos máximos (únicos); `None` sin base.
    stand_max_kg: int | None
    stand_deposit: Decimal
    # Tanda 2: por kilos, de vitrina o mini; el pastel de vitrina de origen por su `slug`.
    cake_size: str = "by_weight"
    source_product: str | None = None


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
    # Quién recoge (D66): nombre limpio y 10 dígitos.
    pickup_name: str = ""
    pickup_phone: str = ""


@dataclass(frozen=True)
class CakeDesignRecord(NewCakeDesign):
    stand_min_kg: int | None = None
    # Los nombres de lo que eligió el cliente, para mostrarlos sin otra consulta (D69).
    bread_name: str = ""
    filling_base_name: str | None = None
    filling_flavor_names: tuple[str, ...] = ()
    decoration_name: str = ""
    # El préstamo de su base, desde que se entregó el pedido (D69).
    loan: StandLoanRecord | None = None


@dataclass(frozen=True)
class ReferenceCakeRecord:
    """El pastel de un envío de referencia: personas, kilos, sabor y base (D70). Con los mismos nombres que el diseño
    para la base (`kg`, `stand_max_kg`, `stand_deposit`, `loan`), así la nota y "Mis pedidos" los leen igual."""

    people: int
    kg: int | None
    cake_type: str
    bread: str | None
    filling_base: str | None
    filling_flavors: tuple[str, ...]
    bread_name: str | None
    filling_base_name: str | None
    filling_flavor_names: tuple[str, ...]
    stand_min_kg: int | None
    stand_max_kg: int | None
    stand_deposit: Decimal
    loan: StandLoanRecord | None = None


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
    # La línea `reference`: el pastel de su envío de referencia (D70).
    reference: ReferenceCakeRecord | None = None


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
    pickup_name: str = ""
    pickup_phone: str = ""
    # El cobro que pagó el pedido (D69): su método y cuándo se confirmó; vacíos sin pago.
    paid_with: str = ""
    paid_at: datetime | None = None
    # La cuenta del cliente, para la nota (D69). La API de pedidos no los devuelve.
    customer_name: str = ""
    customer_email: str = ""
    note_token: str = ""


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


# --- Pagos (D68) ---


@dataclass(frozen=True)
class PaymentRecord:
    """Un intento de cobro de un pedido, como lo guardó el servidor."""

    id: int
    order_id: int
    method: str
    status: str
    refund_reason: str
    amount: Decimal
    currency: str
    idempotency_key: str
    checkout_id: str
    provider_payment_id: str
    redirect_url: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class NewPayment:
    """Lo que se guarda al iniciar un cobro o al registrar uno confirmado."""

    order_id: int
    method: str
    status: str
    amount: Decimal
    currency: str
    idempotency_key: str = ""
    checkout_id: str = ""
    provider_payment_id: str = ""
    redirect_url: str = ""
    refund_reason: str = ""
    recorded_by_id: int | None = None


@dataclass(frozen=True)
class PaymentTerms:
    """Lo que hace falta de un pedido para aplicarle un pago: su estado y lo que paga hoy."""

    order_id: int
    status: str
    pay_today: Decimal | None


# --- Envío de referencia (D70) ---


@dataclass(frozen=True)
class ReferenceImageRecord:
    id: UUID
    original_name: str
    width: int
    height: int


@dataclass(frozen=True)
class NewReferenceRequest:
    customer_id: int
    idempotency_key: str
    status: str
    status_changed_at: datetime
    description: str
    occasion: str
    people: int
    event_date: date
    budget: Decimal | None
    image_ids: tuple[UUID, ...]
    # El sabor por `slug` y la base que toca a los kilos (D70); el tamaño de base va por sus kilos máximos.
    cake_type: str = ""
    bread: str | None = None
    filling_base: str | None = None
    filling_flavors: tuple[str, ...] = ()
    kg: int | None = None
    stand_max_kg: int | None = None
    stand_deposit: Decimal = Decimal("0.00")


@dataclass(frozen=True)
class ReferenceRequestRecord:
    id: int
    customer_id: int
    status: str
    status_changed_at: datetime
    created_at: datetime
    description: str
    occasion: str
    people: int
    event_date: date
    budget: Decimal | None
    quoted_price: Decimal | None
    quote_note: str
    quoted_at: datetime | None
    order_id: int | None
    images: tuple[ReferenceImageRecord, ...]
    customer_name: str = ""
    customer_email: str = ""
    # El pastel: personas, sabor y base (D70).
    cake: ReferenceCakeRecord | None = None


# --- Cancelación por el cliente (D70) ---


@dataclass(frozen=True)
class CancellationTerms:
    """Lo que hace falta del pedido para saber si el cliente lo puede cancelar y cuánto se retiene."""

    order_id: int
    status: str
    subtotal: Decimal
    delivery_fee: Decimal
    delivery_date: date
    slot_starts_at: time
