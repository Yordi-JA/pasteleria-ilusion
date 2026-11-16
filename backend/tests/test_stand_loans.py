"""Bases prestadas (D69): `StandLoan`, `StandLoanObserver`, la devolución en el admin y `GET stand-loans/`.

Al entrar el pedido en `delivered`, el Observer presta cada base con depósito (regla 12: fecha límite = entrega más
`PolicySettings.stand_return_days`). La devolución la registra el personal con permiso desde el admin (D64): pasa por
`warranty_service.register_stand_return`, que emite el evento "base devuelta" por el sujeto del pedido.
"""
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Permission
from django.test import Client
from rest_framework.test import APIClient

from core_pasteleria.models import Order, PolicySettings, StandLoan
from core_pasteleria.services import warranty_service
from core_pasteleria.services.errors import DomainValidationError
from core_pasteleria.services.orders import order_observer, order_status
from core_pasteleria.services.orders.order_observer import OrderObserver, StandLoanObserver, StandReturned
from tests.test_orders_api import CDMX, body, design_line, offering, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db

DELIVERED_AT = datetime(2026, 11, 15, 15, 30, tzinfo=CDMX)
RETURNED_AT = datetime(2026, 11, 20, 11, 0, tzinfo=CDMX)
LOANS_URL = "/api/v1/stand-loans/"


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


@pytest.fixture
def order(api):
    """Un pastel de 4 kg (30 personas): lleva la base de 4 a 5 kg, con $70 de depósito (regla 7)."""
    response = post(api, body(design_line()))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


@pytest.fixture
def returner(staff_user):
    staff_user.user_permissions.add(Permission.objects.get(codename="register_stand_return"))
    return type(staff_user).objects.get(pk=staff_user.pk)


class Spy(OrderObserver):
    def __init__(self):
        self.events = []

    def update(self, event):
        self.events.append(event)


def deliver(order, actor, at=DELIVERED_AT):
    Order.objects.filter(pk=order.pk).update(status="ready_for_delivery")
    order_status.change_status(order.pk, "ready_for_delivery", "delivered", actor_id=actor.pk, now=at)


def test_the_default_subject_also_has_the_stand_loan_observer():
    kinds = [type(observer) for observer in order_observer.build_order_subject()._observers]
    assert StandLoanObserver in kinds


def test_delivering_an_order_with_a_stand_lends_it_until_the_deadline(order, staff_user):
    deliver(order, staff_user)
    loan = StandLoan.objects.get(order=order)
    design = order.items.get().design
    assert (loan.design_id, loan.stand_id, loan.deposit) == (design.pk, design.stand_id, Decimal("70.00"))
    assert (loan.status, loan.delivered_on, loan.due_date) == ("on_loan", date(2026, 11, 15), date(2026, 11, 30))
    assert (loan.returned_at, loan.returned_by_id, loan.deposit_refunded) == (None, None, False)


def test_the_deadline_follows_the_return_days_of_the_admin(order, staff_user):
    PolicySettings.objects.update(stand_return_days=20)
    deliver(order, staff_user)
    assert StandLoan.objects.get(order=order).due_date == date(2026, 12, 5)


def test_the_delivery_day_is_the_bakery_day_not_utc(order, staff_user):
    # 23:30 en la Ciudad de México ya es el día siguiente en UTC.
    deliver(order, staff_user, at=datetime(2026, 11, 15, 23, 30, tzinfo=CDMX))
    assert StandLoan.objects.get(order=order).delivered_on == date(2026, 11, 15)


def test_an_order_without_a_stand_lends_nothing(api, staff_user):
    response = post(api, body({"kind": "order", "offering_id": offering("tres-leches-de-durazno").id, "quantity": 1}))
    order = Order.objects.get(pk=response.json()["id"])
    deliver(order, staff_user)
    assert not StandLoan.objects.filter(order=order).exists()


def test_other_status_changes_lend_nothing(order, staff_user):
    order_status.change_status(order.pk, "awaiting_payment", "cancelled", actor_id=staff_user.pk)
    assert not StandLoan.objects.exists()


def test_the_return_goes_through_the_subject_and_refunds_the_deposit(order, staff_user, returner):
    deliver(order, staff_user)
    loan = StandLoan.objects.get(order=order)
    spy = Spy()
    subject = order_observer.build_order_subject()
    subject.subscribe(spy)
    result = warranty_service.register_stand_return(loan.pk, actor=returner, now=RETURNED_AT, events=subject)
    assert result.registered is True
    assert spy.events == [StandReturned(order.pk, loan.pk, returner.pk, RETURNED_AT)]
    loan.refresh_from_db()
    assert (loan.status, loan.returned_at, loan.returned_by_id, loan.deposit_refunded) == (
        "returned", RETURNED_AT, returner.pk, True,
    )


def test_a_stand_returned_twice_is_refunded_once(order, staff_user, returner):
    deliver(order, staff_user)
    loan = StandLoan.objects.get(order=order)
    warranty_service.register_stand_return(loan.pk, actor=returner, now=RETURNED_AT)
    spy = Spy()
    subject = order_observer.build_order_subject()
    subject.subscribe(spy)
    again = warranty_service.register_stand_return(
        loan.pk, actor=returner, now=RETURNED_AT + timedelta(days=1), events=subject
    )
    assert again.registered is False and spy.events == []
    loan.refresh_from_db()
    assert loan.returned_at == RETURNED_AT


def test_the_return_needs_staff_with_the_permission(order, staff_user, customer_user):
    deliver(order, staff_user)
    loan = StandLoan.objects.get(order=order)
    for actor in (staff_user, customer_user):
        with pytest.raises(DomainValidationError):
            warranty_service.register_stand_return(loan.pk, actor=actor, now=RETURNED_AT)
    loan.refresh_from_db()
    assert loan.status == "on_loan"


def test_the_return_is_audited_without_personal_data(order, staff_user, returner, caplog):
    deliver(order, staff_user)
    loan = StandLoan.objects.get(order=order)
    with caplog.at_level(logging.INFO, logger="core_pasteleria.audit"):
        warranty_service.register_stand_return(loan.pk, actor=returner, now=RETURNED_AT)
    records = [r for r in caplog.records if r.name == "core_pasteleria.audit" and "register_stand_return" in r.operation]
    assert len(records) == 1
    record = records[0]
    assert (record.result, record.loan_id, record.order_id, record.actor_id) == ("ok", loan.pk, order.pk, returner.pk)
    assert returner.email not in record.getMessage()


def test_a_refused_return_is_audited_as_rejected(order, staff_user, caplog):
    deliver(order, staff_user)
    loan = StandLoan.objects.get(order=order)
    with caplog.at_level(logging.INFO, logger="core_pasteleria.audit"), pytest.raises(DomainValidationError):
        warranty_service.register_stand_return(loan.pk, actor=staff_user, now=RETURNED_AT)
    results = [r.result for r in caplog.records if "register_stand_return" in getattr(r, "operation", "")]
    assert results == ["rejected:StandReturnError"]


# --- Admin (D64): el personal cambia el estado de la base a "Devuelta" ---


def admin_client(user, *codenames):
    user.user_permissions.add(*Permission.objects.filter(codename__in=["view_standloan", *codenames]))
    client = Client()
    client.force_login(user)
    return client


def test_staff_with_the_permission_returns_the_stand_from_the_admin(order, staff_user, monkeypatch):
    deliver(order, staff_user)
    loan = StandLoan.objects.get(order=order)
    calls = []
    original = warranty_service.register_stand_return

    def spy(*args, **kwargs):
        calls.append(args)
        return original(*args, **kwargs)

    monkeypatch.setattr(warranty_service, "register_stand_return", spy)
    client = admin_client(staff_user, "register_stand_return")
    url = f"/admin/core_pasteleria/standloan/{loan.pk}/change/"
    assert 'name="status"' in client.get(url).content.decode()
    response = client.post(url, {"status": "returned"})
    assert response.status_code == 302
    loan.refresh_from_db()
    assert (loan.status, loan.returned_by_id, loan.deposit_refunded) == ("returned", staff_user.pk, True)
    assert calls == [(loan.pk,)]
    assert LogEntry.objects.filter(object_id=str(loan.pk)).exists()


def test_staff_without_the_permission_only_sees_the_loan(order, staff_user):
    deliver(order, staff_user)
    loan = StandLoan.objects.get(order=order)
    client = admin_client(staff_user)
    url = f"/admin/core_pasteleria/standloan/{loan.pk}/change/"
    page = client.get(url)
    assert page.status_code == 200 and 'name="status"' not in page.content.decode()
    assert client.post(url, {"status": "returned"}).status_code == 403
    loan.refresh_from_db()
    assert loan.status == "on_loan"


def test_a_returned_stand_cannot_go_back_on_loan_from_the_admin(order, staff_user, returner):
    deliver(order, staff_user)
    loan = StandLoan.objects.get(order=order)
    warranty_service.register_stand_return(loan.pk, actor=returner, now=RETURNED_AT)
    client = admin_client(staff_user, "register_stand_return")
    url = f"/admin/core_pasteleria/standloan/{loan.pk}/change/"
    assert 'name="status"' not in client.get(url).content.decode()


# --- API del cliente: "Bases en préstamo" ---


def test_anonymous_cannot_list_stand_loans():
    assert APIClient().get(LOANS_URL).status_code == 401


def test_the_customer_sees_only_their_stand_loans(api, order, staff_user, returner, django_user_model):
    other = django_user_model.objects.create_user("otra@pasteleria.test", "clave-de-prueba-123")
    other_api = APIClient()
    other_api.force_authenticate(other)
    other_order = Order.objects.get(pk=post(other_api, body(design_line(), slot="16:00")).json()["id"])
    deliver(order, staff_user)
    deliver(other_order, staff_user)
    loan = StandLoan.objects.get(order=order)
    response = api.get(LOANS_URL)
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    assert data["results"] == [
        {
            "id": loan.pk,
            "order_id": order.pk,
            "kg": 4,
            "deposit": "70.00",
            "status": "on_loan",
            "status_label": "Prestada",
            "delivered_on": "2026-11-15",
            "due_date": "2026-11-30",
            "returned_at": None,
            "deposit_refunded": False,
        }
    ]
    warranty_service.register_stand_return(loan.pk, actor=returner, now=RETURNED_AT)
    returned = api.get(LOANS_URL).json()["results"][0]
    assert (returned["status"], returned["status_label"], returned["deposit_refunded"]) == ("returned", "Devuelta", True)
    assert returned["returned_at"] == "2026-11-20T11:00:00-06:00"
