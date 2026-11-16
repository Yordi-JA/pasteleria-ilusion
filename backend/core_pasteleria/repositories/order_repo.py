"""Consultas de pedidos, agenda de entregas y bases.

La creación del pedido corre en una transacción (`atomic`) con candados en un orden fijo para no trabarse con otra
creación: el cliente, el lapso, las existencias (por id) y las imágenes. Qué estados ocupan un lapso es una regla del
servicio (`schedule_service`); aquí solo se cuentan los que el servicio dice.

Orden de los candados (D63):
- Crear: el cliente, el lapso, la vitrina por id de la presentación, el pan por id y las imágenes por id.
- Cancelar: el pedido (su `UPDATE` condicional) y después lo que devuelve en el orden de la creación: la vitrina por id,
  el pan por id y las imágenes (`order_status._give_back`). Los vencidos de un cliente se cancelan antes de su
  transacción de creación, cada uno en la suya.
- Cobrar un apartado vencido y poner el precio de una cotización: el lapso y después el pedido.
Los montos de una cotización los calcula el servicio: aquí solo se guardan.
"""
from collections.abc import Collection
from datetime import date, datetime, time
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Prefetch, Q, Sum

from ..models import (
    Bread,
    CakeDesign,
    CakeStand,
    CustomerImage,
    DecorationOption,
    DeliverySlot,
    FillingBase,
    FillingFlavor,
    Order,
    OrderItem,
    OrderLineKind,
    Payment,
    PaymentStatus,
    ReferenceRequest,
)
from . import reference_repo
from .records import (
    CakeDesignRecord,
    CancellationTerms,
    StandLoanRecord,
    NewCakeDesign,
    NewOrder,
    OrderItemRecord,
    OrderRecord,
    OrderSlotRecord,
    QuotePrice,
    QuoteRecord,
    ReleasedLine,
)


def atomic():
    """La transacción de la creación del pedido: si algo falla adentro, nada se guarda ni se descuenta."""
    return transaction.atomic()


def on_commit(callback) -> None:
    """Corre `callback` cuando se confirme la transacción en curso (en el acto si no hay ninguna)."""
    transaction.on_commit(callback)


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


def _unpaid(customer_id: int, unpaid_status: str, now: datetime, also_order_ids: Collection[int] = ()) -> Q:
    """Los apartados del cliente que aún no vencen, más los de `also_order_ids` (vencidos que no se pudieron cancelar)."""
    unpaid = Q(customer_id=customer_id, status=unpaid_status, payment_due_at__gt=now)
    return unpaid | Q(customer_id=customer_id, pk__in=list(also_order_ids)) if also_order_ids else unpaid


def _showcase_pieces(showcase_kind: str, orders) -> int:
    total = OrderItem.objects.filter(kind=showcase_kind, order__in=orders).aggregate(total=Sum("quantity"))["total"]
    return total or 0


def count_unpaid_orders(
    customer_id: int, *, unpaid_status: str, now: datetime, also_order_ids: Collection[int] = ()
) -> int:
    """Pedidos del cliente que esperan su pago (los apartados vencidos no cuentan, salvo los de `also_order_ids`)."""
    return Order.objects.filter(_unpaid(customer_id, unpaid_status, now, also_order_ids)).count()


def count_unpaid_showcase_pieces(
    customer_id: int, *, unpaid_status: str, showcase_kind: str, now: datetime, also_order_ids: Collection[int] = ()
) -> int:
    """Piezas de la vitrina que el cliente tiene apartadas en pedidos sin pagar que aún no vencen (y en los de
    `also_order_ids`)."""
    return _showcase_pieces(showcase_kind, Order.objects.filter(_unpaid(customer_id, unpaid_status, now, also_order_ids)))


def count_recently_cancelled_showcase_pieces(
    customer_id: int, *, cancelled_status: str, reason: str, showcase_kind: str, since: datetime
) -> int:
    """Piezas de la vitrina de los pedidos del cliente cancelados con `reason` después de `since`."""
    cancelled = Order.objects.filter(
        customer_id=customer_id, status=cancelled_status, cancellation_reason=reason, status_changed_at__gt=since
    )
    return _showcase_pieces(showcase_kind, cancelled)


def count_customer_orders_in_status(customer_id: int, status: str) -> int:
    return Order.objects.filter(customer_id=customer_id, status=status).count()


def count_orders_by_date_and_slot(
    start: date, end: date, *, holding_statuses: Collection[str], unpaid_status: str, now: datetime
) -> dict[tuple[date, time], int]:
    """Pedidos que ocupan cada lapso de los días de `start` a `end`, por día y hora en que empieza el lapso."""
    rows = (
        Order.objects.filter(
            _holding(holding_statuses, unpaid_status, now), delivery_slot__date__gte=start, delivery_slot__date__lte=end
        )
        .values("delivery_slot__date", "delivery_slot__starts_at")
        .annotate(total=Count("pk"))
    )
    return {(row["delivery_slot__date"], row["delivery_slot__starts_at"]): row["total"] for row in rows}


# --- Lectura ---


def _orders():
    # El envío de referencia de la línea `reference` (D70) viene en la misma consulta del pedido.
    reference = ("reference_request", *(f"reference_request__{name}" for name in reference_repo.CAKE_RELATIONS))
    return Order.objects.select_related(
        "delivery_slot", "customer", *reference, "reference_request__stand_loan"
    ).prefetch_related(
        Prefetch(
            "items",
            queryset=OrderItem.objects.select_related(
                "design__bread",
                "design__filling_base",
                "design__first_flavor",
                "design__second_flavor",
                "design__decoration",
                "design__stand",
                "design__stand_loan",
            ).order_by("position"),
        ),
        Prefetch("payments", queryset=Payment.objects.filter(status=PaymentStatus.SUCCEEDED), to_attr="succeeded"),
    )


def _loan_record(cake: CakeDesign | ReferenceRequest) -> StandLoanRecord | None:
    """El préstamo de la base de un diseño o del pastel de un envío de referencia (D70); `None` antes de la entrega."""
    loan = getattr(cake, "stand_loan", None)
    if loan is None:
        return None
    return StandLoanRecord(
        id=loan.pk,
        order_id=loan.order_id,
        design_id=loan.design_id,
        kg=cake.kg,
        deposit=loan.deposit,
        status=loan.status,
        delivered_on=loan.delivered_on,
        due_date=loan.due_date,
        returned_at=loan.returned_at,
        deposit_refunded=loan.deposit_refunded,
    )


def _slug(option) -> str | None:
    return option.slug if option is not None else None


def _design_record(design: CakeDesign) -> CakeDesignRecord:
    chosen = tuple(flavor for flavor in (design.first_flavor, design.second_flavor) if flavor is not None)
    flavors = tuple(flavor.slug for flavor in chosen)
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
        bread_name=design.bread.name,
        filling_base_name=design.filling_base.name if design.filling_base else None,
        filling_flavor_names=tuple(flavor.name for flavor in chosen),
        decoration_name=design.decoration.name,
        loan=_loan_record(design),
    )


def _order_record(order: Order) -> OrderRecord:
    slot = order.delivery_slot
    # Un solo pago `succeeded` por pedido (restricción de D68), del prefetch de `_orders()`.
    paid = order.succeeded[0] if order.succeeded else None
    request = getattr(order, "reference_request", None)
    reference_cake = reference_repo.cake_record(request, _loan_record(request)) if request is not None else None
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
        paid_in_full=order.paid_in_full,
        status_changed_at=order.status_changed_at,
        delivery_slot_id=order.delivery_slot_id,
        pickup_name=order.pickup_name,
        pickup_phone=order.pickup_phone,
        paid_with=paid.method if paid else "",
        paid_at=paid.updated_at if paid else None,
        customer_name=order.customer.full_name,
        customer_email=order.customer.email,
        note_token=order.note_token,
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
                reference=reference_cake if item.kind == OrderLineKind.REFERENCE else None,
            )
            for item in order.items.all()
        ),
    )


def has_order_with_key(customer_id: int, key: str) -> bool:
    """Si el cliente ya tiene un pedido con esa llave, sin leerlo."""
    return Order.objects.filter(customer_id=customer_id, idempotency_key=key).exists()


def find_order_by_idempotency_key(customer_id: int, key: str) -> OrderRecord | None:
    order = _orders().filter(customer_id=customer_id, idempotency_key=key).first()
    return _order_record(order) if order else None


def change_status(
    order_id: int,
    current: str,
    new: str,
    changed_at: datetime,
    *,
    cancellation_reason: str = "",
    due_by: datetime | None = None,
) -> bool:
    """Pasa el pedido de `current` a `new` solo si sigue en `current`; `False` si ya había cambiado. Con
    `cancellation_reason`, guarda también el motivo. Con `due_by`, solo si su plazo para pagar ya se cumplió para
    entonces: la cancelación de lo vencido no gana a un plazo que se extendió después de listarlo (D68)."""
    fields = {"status": new, "status_changed_at": changed_at}
    if cancellation_reason:
        fields["cancellation_reason"] = cancellation_reason
    orders = Order.objects.filter(pk=order_id, status=current)
    if due_by is not None:
        orders = orders.filter(payment_due_at__lte=due_by)
    return orders.update(**fields) == 1


def get_order(order_id: int) -> OrderRecord | None:
    """El pedido sin filtrar por dueño: solo para avisos del sistema (el correo, D70), nunca para la API del cliente."""
    order = _orders().filter(pk=order_id).first()
    return _order_record(order) if order else None


def get_customer_order(customer_id: int, order_id: int) -> OrderRecord | None:
    """El pedido si es de ese cliente; uno ajeno es `None` (la API responde 404, no 403)."""
    order = _orders().filter(customer_id=customer_id, pk=order_id).first()
    return _order_record(order) if order else None


def find_order_by_note_token(token: str, *, statuses) -> OrderRecord | None:
    """El pedido de esa nota, solo si está en `statuses` (los que ya tienen nota); si no, `None`."""
    order = _orders().filter(note_token=token, status__in=statuses).first()
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
        pickup_name=new.pickup_name,
        pickup_phone=new.pickup_phone,
        subtotal=new.subtotal,
        stand_deposit=new.stand_deposit,
        delivery_fee=new.delivery_fee,
        advance_percent=new.advance_percent,
        advance=new.advance,
        pay_today=new.pay_today,
        pay_on_delivery=new.pay_on_delivery,
        paid_in_full=new.paid_in_full,
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
            bread_id=item.bread_id,
            product_name=item.product_name,
            presentation=item.presentation,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_total=item.line_total,
        )
        for position, item in enumerate(new.items, start=1)
    )
    return _order_record(_orders().get(pk=order.pk))


# --- Vencimiento, cancelación y cobro (D63, ronda 2) ---


def list_expired_orders(
    *,
    unpaid_status: str,
    now: datetime,
    quote_status: str,
    quoted_before: datetime | None,
    customer_id: int | None = None,
) -> list[tuple[int, str]]:
    """Los pedidos vencidos, con su estado: los apartados con el plazo cumplido y, si `quoted_before` no es `None`, los
    que esperan cotización desde antes de ese momento. Con `customer_id`, solo los de ese cliente. Del más viejo al más
    nuevo."""
    expired = Q(status=unpaid_status, payment_due_at__lte=now)
    if quoted_before is not None:
        expired |= Q(status=quote_status, status_changed_at__lte=quoted_before)
    orders = Order.objects.filter(expired)
    if customer_id is not None:
        orders = orders.filter(customer_id=customer_id)
    return list(orders.order_by("pk").values_list("pk", "status"))


def list_reserved_lines(order_id: int, *, showcase_kind: str) -> list[ReleasedLine]:
    """Lo que el pedido apartó al crearse: las piezas de la vitrina y el pan del día, con el día del lapso."""
    items = (
        OrderItem.objects.filter(Q(kind=showcase_kind) | Q(bread__isnull=False), order_id=order_id)
        .order_by("offering_id", "bread_id")
        .values("kind", "offering_id", "bread_id", "quantity", "order__delivery_slot__date")
    )
    return [
        ReleasedLine(
            offering_id=item["offering_id"] if item["kind"] == showcase_kind else None,
            bread_id=item["bread_id"],
            quantity=item["quantity"],
            on_date=item["order__delivery_slot__date"],
        )
        for item in items
    ]


def delete_order_images(order_id: int) -> int:
    """Quita de los diseños del pedido sus imágenes y las borra. Devuelve cuántas borró."""
    designs = CakeDesign.objects.filter(item__order_id=order_id)
    image_ids = [
        image_id
        for pair in designs.values_list("decoration_image_id", "wafer_image_id")
        for image_id in pair
        if image_id is not None
    ]
    if not image_ids:
        return 0
    designs.update(decoration_image=None, wafer_image=None)
    deleted, _ = CustomerImage.objects.filter(pk__in=image_ids).delete()
    return deleted


def lock_order_slot(order_id: int) -> OrderSlotRecord | None:
    """Bloquea el lapso del pedido hasta el fin de la transacción; `None` si el pedido no existe."""
    row = Order.objects.filter(pk=order_id).values("delivery_slot_id", "payment_due_at").first()
    if row is None:
        return None
    DeliverySlot.objects.select_for_update().filter(pk=row["delivery_slot_id"]).values_list("pk", flat=True).first()
    return OrderSlotRecord(delivery_slot_id=row["delivery_slot_id"], payment_due_at=row["payment_due_at"])


def lock_quote(order_id: int, *, status: str) -> QuoteRecord | None:
    """Bloquea el pedido si sigue en `status` y tiene un diseño por cotizar; `None` si no."""
    order = (
        Order.objects.select_for_update(of=("self",))
        .select_related("delivery_slot")
        .filter(pk=order_id, status=status)
        .first()
    )
    if order is None:
        return None
    design = CakeDesign.objects.filter(item__order_id=order_id, requires_quote=True).values("pk", "total").first()
    if design is None:
        return None
    return QuoteRecord(
        order_id=order.pk,
        subtotal=order.subtotal,
        stand_deposit=order.stand_deposit,
        delivery_fee=order.delivery_fee,
        paid_in_full=order.paid_in_full or Decimal("0.00"),
        delivery_date=order.delivery_slot.date,
        slot_starts_at=order.delivery_slot.starts_at,
        design_id=design["pk"],
        design_total=design["total"],
    )


def apply_quote(order_id: int, design_id: int, price: QuotePrice) -> None:
    """Guarda el precio de la decoración, los montos nuevos y el estado. Va dentro de `atomic()`, tras `lock_quote`."""
    CakeDesign.objects.filter(pk=design_id).update(decoration_price=price.decoration_price, total=price.design_total)
    OrderItem.objects.filter(design_id=design_id).update(unit_price=price.design_total, line_total=price.design_total)
    Order.objects.filter(pk=order_id).update(
        quoted_decoration_price=price.decoration_price,
        subtotal=price.subtotal,
        advance_percent=price.advance_percent,
        advance=price.advance,
        pay_today=price.pay_today,
        pay_on_delivery=price.pay_on_delivery,
        paid_in_full=price.paid_in_full,
        payment_due_at=price.payment_due_at,
        status=price.status,
        status_changed_at=price.status_changed_at,
    )


# --- Pago (D68) ---


def extend_payment_due_at(order_id: int, due_at: datetime, *, unpaid_status: str, now: datetime) -> bool:
    """Mueve el plazo para pagar de un apartado que todavía no vence; `False` si ya no espera pago o ya venció. Es la
    otra mitad de `change_status(..., due_by=)`: los dos `UPDATE` condicionales sobre la misma fila, y gana uno solo."""
    orders = Order.objects.filter(pk=order_id, status=unpaid_status, payment_due_at__gt=now)
    return orders.update(payment_due_at=due_at) == 1


# --- Cancelación por el cliente (D70) ---


def get_cancellation_terms(customer_id: int, order_id: int, *, lock: bool = False) -> CancellationTerms | None:
    """Lo que decide si el cliente puede cancelar su pedido y cuánto se retiene; `None` si no es suyo.

    Con `lock` bloquea el pedido hasta el fin de la transacción: la cancelación y un cambio del personal se esperan.
    """
    orders = Order.objects.filter(pk=order_id, customer_id=customer_id).select_related("delivery_slot")
    if lock:
        orders = orders.select_for_update(of=("self",))
    order = orders.first()
    if order is None:
        return None
    return CancellationTerms(
        order_id=order.pk,
        status=order.status,
        subtotal=order.subtotal,
        delivery_fee=order.delivery_fee,
        delivery_date=order.delivery_slot.date,
        slot_starts_at=order.delivery_slot.starts_at,
    )
