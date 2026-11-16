"""Envíos de referencia (D70): alta con sus fotos, consulta del dueño, cotización del personal y aceptación.

Orden de los candados:
- Enviar: el cliente y después sus imágenes por id (como la creación del pedido).
- Aceptar: el cliente, la solicitud y después el lapso (`order_repo.lock_slot`): el pedido nace en esa transacción.
- Cotizar o cancelar: solo la solicitud.
"""
from datetime import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Prefetch

from ..models import Bread, CakeStand, CustomerImage, FillingBase, FillingFlavor, ReferenceRequest
from .records import (
    NewReferenceRequest,
    ReferenceCakeRecord,
    ReferenceImageRecord,
    ReferenceRequestRecord,
    StandLoanRecord,
)

# Lo que `cake_record` lee de la solicitud sin otra consulta.
CAKE_RELATIONS = ("bread", "filling_base", "first_flavor", "second_flavor", "stand")


def atomic():
    return transaction.atomic()


def on_commit(callback) -> None:
    transaction.on_commit(callback)


def lock_customer(customer_id: int) -> None:
    """Bloquea al cliente: dos envíos suyos a la vez se revisan uno tras otro (el tope y la llave)."""
    get_user_model().objects.select_for_update().filter(pk=customer_id).values_list("pk", flat=True).first()


def cake_record(request: ReferenceRequest, loan: StandLoanRecord | None = None) -> ReferenceCakeRecord:
    """El pastel de la solicitud (D70) con los nombres para mostrar; `order_repo` lo usa para la línea `reference`."""
    chosen = tuple(flavor for flavor in (request.first_flavor, request.second_flavor) if flavor is not None)
    return ReferenceCakeRecord(
        people=request.people,
        kg=request.kg,
        cake_type=request.cake_type,
        bread=request.bread.slug if request.bread else None,
        filling_base=request.filling_base.slug if request.filling_base else None,
        filling_flavors=tuple(flavor.slug for flavor in chosen),
        bread_name=request.bread.name if request.bread else None,
        filling_base_name=request.filling_base.name if request.filling_base else None,
        filling_flavor_names=tuple(flavor.name for flavor in chosen),
        stand_min_kg=request.stand.min_kg if request.stand else None,
        stand_max_kg=request.stand.max_kg if request.stand else None,
        stand_deposit=request.stand_deposit,
        loan=loan,
    )


def _requests():
    return ReferenceRequest.objects.select_related("customer", *CAKE_RELATIONS).prefetch_related(
        Prefetch(
            "images",
            queryset=CustomerImage.objects.only(
                "id", "original_name", "width", "height", "created_at", "reference_request_id"
            ).order_by("created_at", "id"),
        )
    )


def _record(request: ReferenceRequest) -> ReferenceRequestRecord:
    return ReferenceRequestRecord(
        id=request.pk,
        customer_id=request.customer_id,
        status=request.status,
        status_changed_at=request.status_changed_at,
        created_at=request.created_at,
        description=request.description,
        occasion=request.occasion,
        people=request.people,
        event_date=request.event_date,
        budget=request.budget,
        quoted_price=request.quoted_price,
        quote_note=request.quote_note,
        quoted_at=request.quoted_at,
        order_id=request.order_id,
        images=tuple(
            ReferenceImageRecord(id=image.id, original_name=image.original_name, width=image.width, height=image.height)
            for image in request.images.all()
        ),
        customer_name=request.customer.full_name,
        customer_email=request.customer.email,
        cake=cake_record(request),
    )


def find_by_key(customer_id: int, key: str) -> ReferenceRequestRecord | None:
    request = _requests().filter(customer_id=customer_id, idempotency_key=key).first()
    return _record(request) if request else None


def has_request_with_key(customer_id: int, key: str) -> bool:
    return ReferenceRequest.objects.filter(customer_id=customer_id, idempotency_key=key).exists()


def get(request_id: int) -> ReferenceRequestRecord | None:
    """La solicitud sin filtrar por dueño: solo para el correo y el admin, nunca para la API del cliente."""
    request = _requests().filter(pk=request_id).first()
    return _record(request) if request else None


def get_customer_request(customer_id: int, request_id: int) -> ReferenceRequestRecord | None:
    """La solicitud si es de ese cliente; una ajena es `None` (la API responde 404, no 403)."""
    request = _requests().filter(customer_id=customer_id, pk=request_id).first()
    return _record(request) if request else None


def count_customer_requests(customer_id: int) -> int:
    return ReferenceRequest.objects.filter(customer_id=customer_id).count()


def list_customer_requests(customer_id: int, *, offset: int, limit: int) -> list[ReferenceRequestRecord]:
    requests = _requests().filter(customer_id=customer_id).order_by("-created_at", "-pk")[offset:offset + limit]
    return [_record(request) for request in requests]


def count_customer_requests_in_status(customer_id: int, status: str) -> int:
    return ReferenceRequest.objects.filter(customer_id=customer_id, status=status).count()


def _flavor(slugs: tuple[str, ...], index: int) -> FillingFlavor | None:
    return FillingFlavor.objects.get(slug=slugs[index]) if len(slugs) > index else None


def create(new: NewReferenceRequest) -> ReferenceRequestRecord:
    """Guarda la solicitud y le pone sus imágenes. Va dentro de `atomic()`, con las imágenes ya revisadas y bloqueadas."""
    request = ReferenceRequest.objects.create(
        customer_id=new.customer_id,
        idempotency_key=new.idempotency_key,
        status=new.status,
        status_changed_at=new.status_changed_at,
        description=new.description,
        occasion=new.occasion,
        people=new.people,
        event_date=new.event_date,
        budget=new.budget,
        cake_type=new.cake_type,
        bread=Bread.objects.get(slug=new.bread) if new.bread else None,
        filling_base=FillingBase.objects.get(slug=new.filling_base) if new.filling_base else None,
        first_flavor=_flavor(new.filling_flavors, 0),
        second_flavor=_flavor(new.filling_flavors, 1),
        kg=new.kg,
        stand=CakeStand.objects.get(max_kg=new.stand_max_kg) if new.stand_max_kg is not None else None,
        stand_deposit=new.stand_deposit,
    )
    CustomerImage.objects.filter(pk__in=list(new.image_ids)).update(reference_request=request)
    return _record(_requests().get(pk=request.pk))


def lock(request_id: int) -> ReferenceRequestRecord | None:
    """Bloquea la solicitud hasta el fin de la transacción y la devuelve; `None` si no existe."""
    pk = ReferenceRequest.objects.select_for_update().filter(pk=request_id).values_list("pk", flat=True).first()
    return get(pk) if pk is not None else None


def set_quote(
    request_id: int, *, price: Decimal, note: str, quoted_at: datetime, quoted_by_id: int, status: str
) -> None:
    ReferenceRequest.objects.filter(pk=request_id).update(
        quoted_price=price,
        quote_note=note,
        quoted_at=quoted_at,
        quoted_by_id=quoted_by_id,
        status=status,
        status_changed_at=quoted_at,
    )


def mark_accepted(request_id: int, *, order_id: int, status: str, changed_at: datetime) -> None:
    ReferenceRequest.objects.filter(pk=request_id).update(order_id=order_id, status=status, status_changed_at=changed_at)


def cancel(request_id: int, *, status: str, changed_at: datetime) -> int:
    """La marca cancelada y borra sus fotos (ya nada las usa). Devuelve cuántas fotos borró."""
    ReferenceRequest.objects.filter(pk=request_id).update(status=status, status_changed_at=changed_at)
    deleted, _ = CustomerImage.objects.filter(reference_request_id=request_id).delete()
    return deleted
