"""Cobro en efectivo desde el registro básico del pedido en el admin (D64, D68).

El personal con `core_pasteleria.register_cash_payment` cambia el estado a `received`: pasa por la misma transición y
los mismos observadores que un pago en línea, y queda el pago en efectivo `succeeded` con quién lo registró.
"""
import logging

import pytest
from django.contrib.auth.models import Permission
from django.test import Client
from rest_framework.test import APIClient

from core_pasteleria.models import Order, Payment
from core_pasteleria.services.errors import DomainValidationError
from core_pasteleria.services.payments import payment_service
from tests.payment_fakes import gateways  # noqa: F401 - pasarelas simuladas
from tests.test_order_admin import change_post
from tests.test_order_status import status_options
from tests.test_orders_api import body, design_line, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería
from tests.test_payments_api import pay

pytestmark = pytest.mark.django_db


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


@pytest.fixture
def order(api):
    response = post(api, body(design_line()))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


@pytest.fixture
def superuser(django_user_model):
    return django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123")


def staff_client(user, *codenames):
    user.user_permissions.add(*Permission.objects.filter(codename__in=["view_order", "change_order", *codenames]))
    client = Client()
    client.force_login(user)
    return client


def test_staff_registers_cash_and_it_goes_through_the_observer(order, superuser, caplog, django_capture_on_commit_callbacks):
    client = Client()
    client.force_login(superuser)
    with caplog.at_level(logging.INFO):
        with django_capture_on_commit_callbacks(execute=True):
            response = change_post(client, order, status="received")
    assert response.status_code == 302
    order.refresh_from_db()
    assert order.status == "received"
    payment = Payment.objects.get()
    assert (payment.method, payment.status, payment.amount, payment.recorded_by_id) == (
        "cash", "succeeded", order.pay_today, superuser.pk,
    )
    notices = [r for r in caplog.records if r.name == "core_pasteleria.notifications"]
    assert [(r.order_id, r.new_status) for r in notices] == [(order.pk, "received")]
    audit = next(r for r in caplog.records if getattr(r, "operation", "").endswith("register_cash_payment"))
    assert (audit.result, audit.order_id, audit.actor_id) == ("ok", order.pk, superuser.pk)


def test_the_cash_the_customer_chose_is_the_one_marked_paid(api, order, superuser, gateways):
    assert pay(api, order.pk, "cash").status_code == 201
    payment_service.register_cash_payment(order.pk, actor=superuser)
    payment = Payment.objects.get()
    assert (payment.status, payment.recorded_by_id) == ("succeeded", superuser.pk)


def test_staff_without_the_permission_cannot_register_cash(order, staff_user):
    client = staff_client(staff_user)
    assert "received" not in status_options(client, order)
    with pytest.raises(DomainValidationError) as refused:
        payment_service.register_cash_payment(order.pk, actor=staff_user)
    assert refused.value.errors == {"status": [payment_service.NO_CASH_PERMISSION_MESSAGE]}
    order.refresh_from_db()
    assert order.status == "awaiting_payment" and not Payment.objects.exists()
    # Puede cancelar, que no es un cobro.
    assert "cancelled" in status_options(client, order)


def test_staff_with_the_permission_registers_cash(order, staff_user):
    client = staff_client(staff_user, "register_cash_payment")
    assert "received" in status_options(client, order)
    assert change_post(client, order, status="received").status_code == 302
    assert Order.objects.get(pk=order.pk).status == "received"
    assert Payment.objects.get().recorded_by_id == staff_user.pk


def test_cash_on_an_order_that_is_no_longer_waiting_is_refused(order, superuser):
    Order.objects.filter(pk=order.pk).update(status="cancelled")
    with pytest.raises(DomainValidationError):
        payment_service.register_cash_payment(order.pk, actor=superuser)
    assert not Payment.objects.exists()


def test_the_order_page_shows_its_payments_read_only(api, order, superuser, gateways):
    pay(api, order.pk, "stripe")
    client = Client()
    client.force_login(superuser)
    html = client.get(f"/admin/core_pasteleria/order/{order.pk}/change/").content.decode()
    assert "Tarjeta (Stripe)" in html and "Esperando el pago" in html
    # Solo lectura: ningún campo del pago en el formulario.
    assert 'name="payments' not in html and 'name="refund_reason"' not in html
    listing = client.get("/admin/core_pasteleria/payment/?status__exact=refund_required")
    assert listing.status_code == 200
    assert client.get(f"/admin/core_pasteleria/payment/{Payment.objects.get().pk}/change/").status_code == 200
    assert client.post("/admin/core_pasteleria/payment/add/", {}).status_code == 403
