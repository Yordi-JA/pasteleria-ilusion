"""Catálogo público: productos, ficha, pasteles de la casa, vitrina y rebanadas de hoy.

Aquí viven las reglas de lectura del catálogo; el repositorio solo consulta:

- "Hoy" es la fecha local de la pastelería (`TIME_ZONE`, America/Mexico_City),
  no la del servidor ni la del navegador.
- "En vitrina hoy": alguna presentación que no es rebanada tiene piezas hoy. Las
  rebanadas van en "Rebanadas de hoy" (como `product_repo.list_showcase`).
- En la vitrina y las rebanadas, una presentación con existencias en 0 sale
  agotada; la que no se cargó para hoy no sale.
- Lo vacío (foto, conservación, transporte) es PENDIENTE y sale como `None`.
- "Pasteles de la casa": ver `list_home_featured`.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.utils import timezone

from ..models import Presentation, ProductCategory
from ..repositories import product_repo
from ..repositories.records import OfferingRecord, ProductRecord

# La portada tiene un pastel grande y tres chicos (mockup `Main`, "Pasteles de la
# casa"). Es el tamaño del diseño, no una regla del negocio: cambiarlo pide otra
# maqueta, así que no va en el admin.
HOME_FEATURED_LIMIT = 4
# "También te puede gustar" de la ficha muestra tres.
RELATED_LIMIT = 3


@dataclass(frozen=True)
class Offering:
    """Presentación a la venta. La tarjeta usa `id`, `presentation` y `price`."""

    id: int
    presentation: str
    price: Decimal
    approx_weight_kg: Decimal | None
    servings: int | None
    photo: str | None
    # `None`: no se cargó hoy. `0`: agotada por hoy.
    stock: int | None


@dataclass(frozen=True)
class ProductCard:
    slug: str
    name: str
    category: str
    sales_channel: str
    cake_type: str | None
    bread: str | None
    filling_base: str | None
    summary: str
    photo: str | None
    in_showcase_today: bool
    offerings: tuple[Offering, ...]


@dataclass(frozen=True)
class ProductDetail(ProductCard):
    description: str
    filling_flavor: str | None
    storage_notes: str | None
    transport_notes: str | None
    related: tuple[ProductCard, ...]


@dataclass(frozen=True)
class StockItem:
    """Presentación cargada hoy en la vitrina o en las rebanadas."""

    offering_id: int
    product_slug: str
    product_name: str
    category: str
    presentation: str
    price: Decimal
    photo: str | None
    stock: int
    sold_out: bool


@dataclass(frozen=True)
class TodayStock:
    date: date
    items: tuple[StockItem, ...]


def bakery_today() -> date:
    """Fecha local de la pastelería."""
    return timezone.localdate()


def _pending_if_blank(value: str) -> str | None:
    return value.strip() or None


def _has_pieces_today(offering: OfferingRecord) -> bool:
    return offering.presentation != Presentation.SLICE and (offering.stock or 0) > 0


def _offering(record: OfferingRecord) -> Offering:
    return Offering(
        id=record.id,
        presentation=record.presentation,
        price=record.price,
        approx_weight_kg=record.approx_weight_kg,
        servings=record.servings,
        photo=_pending_if_blank(record.photo),
        stock=record.stock,
    )


def _card_fields(record: ProductRecord) -> dict:
    return {
        "slug": record.slug,
        "name": record.name,
        "category": record.category,
        "sales_channel": record.sales_channel,
        "cake_type": record.cake_type,
        "bread": record.bread_slug,
        "filling_base": record.filling_base_slug,
        "summary": record.summary,
        "photo": _pending_if_blank(record.photo),
        "in_showcase_today": any(_has_pieces_today(o) for o in record.offerings),
        "offerings": tuple(_offering(o) for o in record.offerings),
    }


def _card(record: ProductRecord) -> ProductCard:
    return ProductCard(**_card_fields(record))


def _stock_item(record: OfferingRecord) -> StockItem:
    return StockItem(
        offering_id=record.id,
        product_slug=record.product_slug,
        product_name=record.product_name,
        category=record.category,
        presentation=record.presentation,
        price=record.price,
        photo=_pending_if_blank(record.photo),
        stock=record.stock,
        sold_out=record.stock == 0,
    )


def list_catalog(
    category: str | None = None,
    search: str | None = None,
    *,
    products=product_repo,
    today: date | None = None,
) -> list[ProductCard]:
    """Productos activos en el orden del admin, filtrados por categoría y búsqueda."""
    on_date = today or bakery_today()
    return [_card(record) for record in products.list_catalog(on_date=on_date, category=category, search=search)]


def get_product(slug: str, *, products=product_repo, today: date | None = None) -> ProductDetail | None:
    """Ficha de un producto activo con sus relacionados; `None` si no existe o está inactivo."""
    on_date = today or bakery_today()
    record = products.get_product_by_slug(slug, on_date)
    if record is None:
        return None
    related = products.list_related(record.id, limit=RELATED_LIMIT, on_date=on_date)
    return ProductDetail(
        **_card_fields(record),
        description=record.description,
        filling_flavor=record.filling_flavor_slug,
        storage_notes=_pending_if_blank(record.storage_notes),
        transport_notes=_pending_if_blank(record.transport_notes),
        related=tuple(_card(item) for item in related),
    )


def list_home_featured(*, products=product_repo, today: date | None = None) -> list[ProductCard]:
    """"Pasteles de la casa" de la portada.

    Hasta `HOME_FEATURED_LIMIT` de los productos activos que la pastelería marcó
    (`featured_on_home`), en el orden del admin; si marcó menos, salen esos, sin
    completar con otros. Si no marcó ninguno, salen los primeros pasteles
    (categoría `cake`) activos del catálogo, en el mismo orden.
    """
    on_date = today or bakery_today()
    featured = products.list_featured(on_date=on_date, limit=HOME_FEATURED_LIMIT)
    if not featured:
        featured = products.list_catalog(on_date=on_date, category=ProductCategory.CAKE)[:HOME_FEATURED_LIMIT]
    return [_card(record) for record in featured]


def get_showcase(
    category: str | None = None, *, products=product_repo, today: date | None = None
) -> TodayStock:
    """Vitrina de hoy, sin rebanadas, con las agotadas."""
    on_date = today or bakery_today()
    items = products.list_showcase(on_date, category=category)
    return TodayStock(date=on_date, items=tuple(_stock_item(item) for item in items))


def get_slices(*, products=product_repo, today: date | None = None) -> TodayStock:
    """Rebanadas de hoy, con las agotadas."""
    on_date = today or bakery_today()
    return TodayStock(date=on_date, items=tuple(_stock_item(item) for item in products.list_slices(on_date)))
