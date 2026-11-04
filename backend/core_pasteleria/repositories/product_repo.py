"""Consultas de catálogo y existencias.

Las existencias son por día (`Inventory`): lo que no se cargó para una fecha no
aparece en vitrina ni en rebanadas. Pantalla de cada presentación: las
rebanadas (`slice`) van en "Rebanadas de hoy" y todas las demás en la vitrina.
Qué presentaciones salen en cada una (por ejemplo, el flan individual) es una
pregunta abierta para la pastelería.
"""
from datetime import date

from django.db.models import Case, F, IntegerField, OuterRef, Prefetch, Q, Subquery, Value, When
from django.db.models.functions import Now

from ..models import Inventory, InventoryKind, Presentation, Product, ProductOffering, SalesChannel
from .records import OfferingRecord, ProductRecord


def _offerings_queryset(on_date: date | None):
    """Presentaciones activas con su precio y sus existencias de `on_date`.

    Sin fecha (`None`), `stock` queda en `None` para todas. Un producto solo por
    encargo (Red velvet) nunca tiene existencias de vitrina: aunque alguien las
    escriba fuera del admin (SQL directo, `bulk_create`), aquí salen en `None` y
    no aparecen en la vitrina, las rebanadas ni el "En vitrina hoy".
    """
    no_stock = Value(None, output_field=IntegerField())
    if on_date is None:
        stock = no_stock
    else:
        stock = Case(
            When(product__sales_channel=SalesChannel.ORDER_ONLY, then=no_stock),
            default=Subquery(
                Inventory.objects.filter(
                    kind=InventoryKind.SHOWCASE, offering=OuterRef("pk"), stock_date=on_date
                ).values("quantity")[:1]
            ),
            output_field=IntegerField(),
        )
    return (
        ProductOffering.objects.filter(is_active=True)
        .select_related("product", "price")
        .annotate(stock=stock)
        .order_by("sort_order", "id")
    )


def _offering_record(offering) -> OfferingRecord:
    product = offering.product
    return OfferingRecord(
        id=offering.id,
        product_id=product.id,
        product_slug=product.slug,
        product_name=product.name,
        category=product.category,
        sales_channel=product.sales_channel,
        presentation=offering.presentation,
        price=offering.price.amount,
        approx_weight_kg=offering.price.approx_weight_kg,
        servings=offering.price.servings,
        photo=offering.photo or product.photo,
        stock=offering.stock,
    )


def _product_queryset(on_date: date | None):
    """Productos activos con sus presentaciones activas ya cargadas (dos consultas)."""
    return (
        Product.objects.filter(is_active=True)
        .select_related("bread", "filling_base", "filling_flavor")
        .prefetch_related(Prefetch("offerings", queryset=_offerings_queryset(on_date)))
        .order_by("sort_order", "name")
    )


def _product_record(product) -> ProductRecord:
    return ProductRecord(
        id=product.id,
        slug=product.slug,
        name=product.name,
        category=product.category,
        sales_channel=product.sales_channel,
        summary=product.summary,
        description=product.description,
        cake_type=product.cake_type,
        bread_id=product.bread_id,
        bread_slug=product.bread.slug if product.bread else None,
        filling_base_slug=product.filling_base.slug if product.filling_base else None,
        filling_flavor_slug=product.filling_flavor.slug if product.filling_flavor else None,
        storage_notes=product.storage_notes,
        transport_notes=product.transport_notes,
        photo=product.photo,
        offerings=tuple(_offering_record(offering) for offering in product.offerings.all()),
    )


# --- Catálogo ---


def list_catalog(*, on_date: date, category: str | None = None, search: str | None = None) -> list[ProductRecord]:
    """Productos activos, con las existencias de `on_date` en cada presentación.

    `search` busca en el nombre y en la descripción corta, sin distinguir
    mayúsculas.
    """
    products = _product_queryset(on_date)
    if category:
        products = products.filter(category=category)
    if search and search.strip():
        term = search.strip()
        products = products.filter(Q(name__icontains=term) | Q(summary__icontains=term))
    return [_product_record(product) for product in products]


def get_product_by_slug(slug: str, on_date: date) -> ProductRecord | None:
    product = _product_queryset(on_date).filter(slug=slug).first()
    return _product_record(product) if product else None


def list_related(product_id: int, limit: int = 3) -> list[ProductRecord]:
    """Otros productos activos de la misma categoría, sin existencias (`stock=None`)."""
    category = Product.objects.filter(pk=product_id).values_list("category", flat=True).first()
    if category is None:
        return []
    related = _product_queryset(None).filter(category=category).exclude(pk=product_id)[:limit]
    return [_product_record(product) for product in related]


def get_offering(offering_id: int) -> OfferingRecord | None:
    """Presentación activa de un producto activo, sin existencias (`stock=None`)."""
    offering = _offerings_queryset(None).filter(pk=offering_id, product__is_active=True).first()
    return _offering_record(offering) if offering else None


# --- Vitrina y rebanadas ---


def _stocked_offerings(on_date: date):
    return (
        _offerings_queryset(on_date)
        .filter(product__is_active=True, stock__isnull=False)
        .order_by("product__sort_order", "product__name", "sort_order", "id")
    )


def list_showcase(on_date: date, category: str | None = None) -> list[OfferingRecord]:
    """Presentaciones con existencias cargadas para `on_date`, sin rebanadas.

    Incluye las de cantidad 0 (agotadas por hoy).
    """
    offerings = _stocked_offerings(on_date).exclude(presentation=Presentation.SLICE)
    if category:
        offerings = offerings.filter(product__category=category)
    return [_offering_record(offering) for offering in offerings]


def list_slices(on_date: date) -> list[OfferingRecord]:
    """Rebanadas con existencias cargadas para `on_date` (incluye las agotadas)."""
    offerings = _stocked_offerings(on_date).filter(presentation=Presentation.SLICE)
    return [_offering_record(offering) for offering in offerings]


# --- Existencias de vitrina ---
#
# Toda escritura sube `updated_at` (un `update()` no dispara `auto_now`): el admin
# lo usa para detectar que la fila cambió mientras alguien editaba (bloqueo optimista).


def _check_quantity(quantity: int) -> None:
    if quantity < 1:
        raise ValueError("La cantidad debe ser de 1 o más.")


def get_showcase_stock(offering_id: int, on_date: date) -> int | None:
    """Existencias de `on_date`; `None` si no se cargaron."""
    return (
        Inventory.objects.filter(
            kind=InventoryKind.SHOWCASE, offering_id=offering_id, stock_date=on_date
        )
        .values_list("quantity", flat=True)
        .first()
    )


def decrement_showcase_stock(offering_id: int, on_date: date, quantity: int) -> bool:
    """Descuenta `quantity` de forma atómica; `False` si no alcanza o no hay fila."""
    _check_quantity(quantity)
    updated = Inventory.objects.filter(
        kind=InventoryKind.SHOWCASE,
        offering_id=offering_id,
        stock_date=on_date,
        quantity__gte=quantity,
    ).update(quantity=F("quantity") - quantity, updated_at=Now())
    return updated == 1


def restock_showcase(offering_id: int, on_date: date, quantity: int) -> bool:
    """Devuelve `quantity` a la vitrina; `False` si no había fila ese día.

    No crea la fila: lo que no se cargó para un día no se inventa.
    """
    _check_quantity(quantity)
    updated = Inventory.objects.filter(
        kind=InventoryKind.SHOWCASE, offering_id=offering_id, stock_date=on_date
    ).update(quantity=F("quantity") + quantity, updated_at=Now())
    return updated == 1


# --- Pan para encargos de vitrina del mismo día ---


def get_bread_availability(bread_id: int, on_date: date) -> int | None:
    """Pan disponible para `on_date`; `None` si no se cargó."""
    return (
        Inventory.objects.filter(kind=InventoryKind.BREAD, bread_id=bread_id, stock_date=on_date)
        .values_list("quantity", flat=True)
        .first()
    )


def consume_bread(bread_id: int, on_date: date, quantity: int) -> bool:
    """Consume `quantity` de pan de forma atómica; `False` si no alcanza o no hay fila."""
    _check_quantity(quantity)
    updated = Inventory.objects.filter(
        kind=InventoryKind.BREAD, bread_id=bread_id, stock_date=on_date, quantity__gte=quantity
    ).update(quantity=F("quantity") - quantity, updated_at=Now())
    return updated == 1


def release_bread(bread_id: int, on_date: date, quantity: int) -> bool:
    """Devuelve `quantity` de pan; `False` si no había fila ese día."""
    _check_quantity(quantity)
    updated = Inventory.objects.filter(
        kind=InventoryKind.BREAD, bread_id=bread_id, stock_date=on_date
    ).update(quantity=F("quantity") + quantity, updated_at=Now())
    return updated == 1
