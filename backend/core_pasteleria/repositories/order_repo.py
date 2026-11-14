"""Consultas de pedidos, agenda de entregas y bases.

La creación del pedido corre en una transacción (`atomic`) con candados en un orden fijo para no trabarse con otra
creación: el cliente, el lapso, las existencias (por id) y las imágenes. Qué estados ocupan un lapso es una regla del
servicio (`schedule_service`); aquí solo se cuentan los que el servicio dice.
"""
from collections.abc import Collection
from datetime import date, datetime, time

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Prefetch, Q

from ..models import (
    Bread,
    CakeDesign,
    CakeStand,
    DecorationOption,
    DeliverySlot,
    FillingBase,
    FillingFlavor,
    Order,
    OrderItem,
)
from .records import CakeDesignRecord, NewCakeDesign, NewOrder, OrderItemRecord, OrderRecord


def atomic():
    """La transacción de la creación del pedido: si algo falla adentro, nada se guarda ni se descuenta."""
    return transaction.atomic()


def lock_customer(customer_id: int) -> None:
    """Bloquea al cliente: dos creaciones suyas a la vez (doble clic) se revisan una tras otra."""
    get_user_model().objects.select_for_update().filter(pk=customer_id).values_list("pk", flat=True).first()


def lock_slot(on_date: date, starts_at: time, ends_at: time, *, latest_date: date) -> int:
    """Crea el lapso si es el primero y bloquea su fila hasta el fin de la transacción. Devuelve su id.

    Nunca crea una fila después de `latest_date` (el último día que se reserva). El fin del lapso es el de la
    cuadrícula vigente: si la fila guardaba otro (la pastelería cambió `slot_minutes`), se actualiza.
    """
    if on_date > latest_date:
        raise ValueError("Ese día está fuera de la agenda que se reserva.")
    slot, _ = DeliverySlot.objects.get_or_create(date=on_date, starts_at=starts_at, defaults={"ends_at": ends_at})
    DeliverySlot.objects.select_for_update().filter(pk=slot.pk).values_list("pk", flat=True).first()
    if slot.ends_at != ends_at:
        DeliverySlot.objects.filter(pk=slot.pk).update(ends_at=ends_at)
    return slot.pk


def _holding(holding_statuses: Collection[str], unpaid_status: str, now: datetime) -> Q:
    """Los pedidos que ocupan lugar: los de `holding_statuses` y los de `unpaid_status` que aún no vencen."""
    return Q(status__in=list(holding_statuses)) | Q(status=unpaid_status, payment_due_at__gt=now)


def count_orders_in_slot(
    slot_id: int, *, holding_statuses: Collection[str], unpaid_status: str, now: datetime
) -> int:
    return Order.objects.filter(_holding(holding_statuses, unpaid_status, now), delivery_slot_id=slot_id).count()


def count_unpaid_orders(
    customer_id: int, *, waiting_statuses: Collection[str], unpaid_status: str, now: datetime
) -> int:
    """Pedidos del cliente que esperan su pago o su cotización (los apartados vencidos no cuentan)."""
    return Order.objects.filter(_holding(waiting_statuses, unpaid_status, now), customer_id=customer_id).count()


def count_orders_by_slot(
    on_date: date, *, holding_statuses: Collection[str], unpaid_status: str, now: datetime
) -> dict[time, int]:
    """Pedidos que ocupan cada lapso de ese día, por la hora en que empieza el lapso."""
    rows = (
        Order.objects.filter(_holding(holding_statuses, unpaid_status, now), delivery_slot__date=on_date)
        .values("delivery_slot__starts_at")
        .annotate(total=Count("pk"))
    )
    return {row["delivery_slot__starts_at"]: row["total"] for row in rows}


# --- Lectura ---


def _orders():
    return Order.objects.select_related("delivery_slot").prefetch_related(
        Prefetch(
            "items",
            queryset=OrderItem.objects.select_related(
                "design__bread",
                "design__filling_base",
                "design__first_flavor",
                "design__second_flavor",
                "design__decoration",
                "design__stand",
            ).order_by("position"),
        )
    )


def _slug(option) -> str | None:
    return option.slug if option is not None else None


def _design_record(design: CakeDesign) -> CakeDesignRecord:
    flavors = tuple(flavor.slug for flavor in (design.first_flavor, design.second_flavor) if flavor is not None)
    return CakeDesignRecord(
        people=design.people,
        kg=design.kg,
        form=design.form,
        tiers=design.tiers,
        cake_type=design.cake_type,
        bread=design.bread.slug,
        filling_base=_slug(design.filling_base),
        filling_flavors=flavors,
        coverage_color=design.coverage_color,
        coverage_color_name=design.coverage_color_name,
        decoration=design.decoration.slug,
        decoration_color=design.decoration_color,
        decoration_color_name=design.decoration_color_name,
        decoration_image_id=design.decoration_image_id,
        message=design.message,
        wafer=design.wafer,
        wafer_layout=design.wafer_layout,
        wafer_image_id=design.wafer_image_id,
        occasion=design.occasion,
        price_per_kg=design.price_per_kg,
        cake_subtotal=design.cake_subtotal,
        wafer_price=design.wafer_price,
        decoration_price=design.decoration_price,
        total=design.total,
        requires_quote=design.requires_quote,
        stand_max_kg=design.stand.max_kg if design.stand else None,
        stand_deposit=design.stand_deposit,
        stand_min_kg=design.stand.min_kg if design.stand else None,
    )


def _order_record(order: Order) -> OrderRecord:
    slot = order.delivery_slot
    return OrderRecord(
        id=order.pk,
        customer_id=order.customer_id,
        status=order.status,
        fulfillment=order.fulfillment,
        delivery_date=slot.date,
        slot_starts_at=slot.starts_at,
        slot_ends_at=slot.ends_at,
        subtotal=order.subtotal,
        stand_deposit=order.stand_deposit,
        delivery_fee=order.delivery_fee,
        advance_percent=order.advance_percent,
        advance=order.advance,
        pay_today=order.pay_today,
        pay_on_delivery=order.pay_on_delivery,
        payment_due_at=order.payment_due_at,
        created_at=order.created_at,
        items=tuple(
            OrderItemRecord(
                kind=item.kind,
                offering_id=item.offering_id,
                product_name=item.product_name,
                presentation=item.presentation,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
                design=_design_record(item.design) if item.design_id else None,
            )
            for item in order.items.all()
        ),
    )


def find_order_by_idempotency_key(customer_id: int, key: str) -> OrderRecord | None:
    order = _orders().filter(customer_id=customer_id, idempotency_key=key).first()
    return _order_record(order) if order else None


def change_status(order_id: int, current: str, new: str, changed_at: datetime) -> bool:
    """Pasa el pedido de `current` a `new` solo si sigue en `current`; `False` si ya había cambiado."""
    return Order.objects.filter(pk=order_id, status=current).update(status=new, status_changed_at=changed_at) == 1


def get_customer_order(customer_id: int, order_id: int) -> OrderRecord | None:
    """El pedido si es de ese cliente; uno ajeno es `None` (la API responde 404, no 403)."""
    order = _orders().filter(customer_id=customer_id, pk=order_id).first()
    return _order_record(order) if order else None


def count_customer_orders(customer_id: int) -> int:
    return Order.objects.filter(customer_id=customer_id).count()


def list_customer_orders(customer_id: int, *, offset: int, limit: int) -> list[OrderRecord]:
    """Una página de los pedidos del cliente, del más nuevo al más viejo: solo esa página se lee y se convierte."""
    orders = _orders().filter(customer_id=customer_id).order_by("-created_at", "-pk")[offset:offset + limit]
    return [_order_record(order) for order in orders]


# --- Alta ---


def _by_key(model, field: str, keys) -> dict:
    """Las filas de `model` cuyo `field` está en `keys`, en una sola consulta."""
    keys = {key for key in keys if key is not None}
    return {getattr(row, field): row for row in model.objects.filter(**{f"{field}__in": keys})} if keys else {}


def _options_for(designs: list[NewCakeDesign]) -> dict:
    """Las opciones de todos los diseños del pedido, una consulta por tabla."""
    return {
        "bread": _by_key(Bread, "slug", (d.bread for d in designs)),
        "base": _by_key(FillingBase, "slug", (d.filling_base for d in designs)),
        "flavor": _by_key(FillingFlavor, "slug", (slug for d in designs for slug in d.filling_flavors)),
        "decoration": _by_key(DecorationOption, "slug", (d.decoration for d in designs)),
        "stand": _by_key(CakeStand, "max_kg", (d.stand_max_kg for d in designs)),
    }


def _design_row(new: NewCakeDesign, options: dict) -> CakeDesign:
    ordered = [options["flavor"][slug] for slug in new.filling_flavors]
    return CakeDesign(
        people=new.people,
        kg=new.kg,
        form=new.form,
        tiers=new.tiers,
        cake_type=new.cake_type,
        bread=options["bread"][new.bread],
        filling_base=options["base"][new.filling_base] if new.filling_base else None,
        first_flavor=ordered[0] if ordered else None,
        second_flavor=ordered[1] if len(ordered) > 1 else None,
        coverage_color=new.coverage_color,
        coverage_color_name=new.coverage_color_name,
        decoration=options["decoration"][new.decoration],
        decoration_color=new.decoration_color,
        decoration_color_name=new.decoration_color_name,
        decoration_image_id=new.decoration_image_id,
        message=new.message,
        wafer=new.wafer,
        wafer_layout=new.wafer_layout,
        wafer_image_id=new.wafer_image_id,
        occasion=new.occasion,
        price_per_kg=new.price_per_kg,
        cake_subtotal=new.cake_subtotal,
        wafer_price=new.wafer_price,
        decoration_price=new.decoration_price,
        total=new.total,
        requires_quote=new.requires_quote,
        stand=options["stand"][new.stand_max_kg] if new.stand_max_kg is not None else None,
        stand_deposit=new.stand_deposit,
    )


def create_order(new: NewOrder) -> OrderRecord:
    """Guarda el pedido con sus líneas y sus diseños. Va dentro de `atomic()`, después de los candados."""
    order = Order.objects.create(
        customer_id=new.customer_id,
        idempotency_key=new.idempotency_key,
        status=new.status,
        status_changed_at=new.status_changed_at,
        fulfillment=new.fulfillment,
        delivery_slot_id=new.delivery_slot_id,
        subtotal=new.subtotal,
        stand_deposit=new.stand_deposit,
        delivery_fee=new.delivery_fee,
        advance_percent=new.advance_percent,
        advance=new.advance,
        pay_today=new.pay_today,
        pay_on_delivery=new.pay_on_delivery,
        payment_due_at=new.payment_due_at,
    )
    options = _options_for([item.design for item in new.items if item.design])
    # Una inserción para todos los diseños y otra para todas las líneas (PostgreSQL devuelve los ids).
    designs = {
        position: _design_row(item.design, options)
        for position, item in enumerate(new.items, start=1)
        if item.design
    }
    CakeDesign.objects.bulk_create(designs.values())
    OrderItem.objects.bulk_create(
        OrderItem(
            order=order,
            position=position,
            kind=item.kind,
            offering_id=item.offering_id,
            design=designs.get(position),
            product_name=item.product_name,
            presentation=item.presentation,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_total=item.line_total,
        )
        for position, item in enumerate(new.items, start=1)
    )
    return _order_record(_orders().get(pk=order.pk))
