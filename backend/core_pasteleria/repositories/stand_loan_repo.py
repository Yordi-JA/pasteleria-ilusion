"""Consultas de las bases prestadas (D69).

El préstamo nace con la entrega (`create_loans`, dentro de la transacción del cambio de estado) y se cierra con un
`UPDATE` condicional (`mark_returned`) después de bloquear la fila (`lock_loan`): dos registros de la misma devolución a
la vez se esperan, y el segundo ve la base ya devuelta. Las consultas del cliente filtran por dueño.
"""
from datetime import date, datetime

from django.db import transaction

from ..models import CakeDesign, ReferenceRequest, StandLoan, StandLoanStatus
from .records import LoanableStand, StandLoanRecord


def atomic():
    return transaction.atomic()


def _record(loan: StandLoan) -> StandLoanRecord:
    return StandLoanRecord(
        id=loan.pk,
        order_id=loan.order_id,
        design_id=loan.design_id,
        # El pastel de un envío de referencia guarda sus kilos en la solicitud (D70).
        kg=loan.design.kg if loan.design_id else loan.reference_request.kg,
        deposit=loan.deposit,
        status=loan.status,
        delivered_on=loan.delivered_on,
        due_date=loan.due_date,
        returned_at=loan.returned_at,
        deposit_refunded=loan.deposit_refunded,
    )


def list_order_stands(order_id: int) -> list[LoanableStand]:
    """Los pasteles del pedido que llevan base con depósito: sus diseños, en el orden de sus líneas, y el pastel del
    envío de referencia que nació en ese pedido (D70; un pedido así tiene una sola línea)."""
    designs = (
        CakeDesign.objects.filter(item__order_id=order_id, stand__isnull=False, stand_deposit__gt=0)
        .order_by("item__position")
        .values_list("pk", "stand_id", "stand_deposit")
    )
    references = ReferenceRequest.objects.filter(
        order_id=order_id, stand__isnull=False, stand_deposit__gt=0
    ).values_list("pk", "stand_id", "stand_deposit")
    return [LoanableStand(design_id, stand_id, deposit) for design_id, stand_id, deposit in designs] + [
        LoanableStand(None, stand_id, deposit, reference_request_id=request_id)
        for request_id, stand_id, deposit in references
    ]


def create_loans(order_id: int, stands: list[LoanableStand], *, delivered_on: date, due_date: date) -> None:
    StandLoan.objects.bulk_create(
        StandLoan(
            order_id=order_id,
            design_id=stand.design_id,
            reference_request_id=stand.reference_request_id,
            stand_id=stand.stand_id,
            deposit=stand.deposit,
            status=StandLoanStatus.ON_LOAN,
            delivered_on=delivered_on,
            due_date=due_date,
        )
        for stand in stands
    )


def lock_loan(loan_id: int) -> StandLoanRecord | None:
    """La base bloqueada hasta el fin de la transacción; `None` si no existe."""
    loan = StandLoan.objects.select_for_update(of=("self",)).select_related("design", "reference_request").filter(pk=loan_id).first()
    return _record(loan) if loan else None


def mark_returned(loan_id: int, *, returned_at: datetime, actor_id: int) -> bool:
    """La pasa de prestada a devuelta, con el depósito reembolsado; `False` si ya no estaba prestada."""
    return (
        StandLoan.objects.filter(pk=loan_id, status=StandLoanStatus.ON_LOAN).update(
            status=StandLoanStatus.RETURNED, returned_at=returned_at, returned_by_id=actor_id, deposit_refunded=True
        )
        == 1
    )


def _customer_loans(customer_id: int):
    return StandLoan.objects.filter(order__customer_id=customer_id).select_related("design", "reference_request")


def count_customer_loans(customer_id: int) -> int:
    return _customer_loans(customer_id).count()


def list_customer_loans(customer_id: int, *, offset: int, limit: int) -> list[StandLoanRecord]:
    """Una página de las bases del cliente: primero las prestadas (por fecha límite), luego las devueltas."""
    loans = _customer_loans(customer_id).order_by("status", "due_date", "-pk")[offset:offset + limit]
    return [_record(loan) for loan in loans]
