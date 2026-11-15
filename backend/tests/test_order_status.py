"""Transiciones del estado del pedido desde el registro básico del admin (D63, rondas 1 y 2).

El personal cambia el estado sin pantallas nuevas (D64), pero solo por las transiciones de `ALLOWED_TRANSITIONS`.
Desde la ronda 2 cancela un pedido que todavía no se paga, con su reintegro (`test_order_round2.py`). Cada cambio queda
en la auditoría con el pedido, quién y los dos estados.
"""
import logging

import pytest
from django.contrib.auth.models import Permission
from django.test import Client
from rest_framework.test import APIClient

from core_pasteleria.models import Order, OrderStatus
from core_pasteleria.services.errors import DomainValidationError
from core_pasteleria.services.orders import order_status
from tests.test_order_admin import change_post
from tests.test_orders_api import body, design_line, post, upload_image, wafer_layout
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db


@pytest.fixture
def order(customer_user):
    api = APIClient()
    api.force_authenticate(customer_user)
    image_id = upload_image(api, "wafer")
    response = post(api, body(design_line(wafer=True, wafer_image_id=image_id, wafer_layout=wafer_layout())))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    return client


@pytest.fixture
def staff_client(staff_user):
    # Su propio cliente: `client` ya tiene la sesión del superusuario.
    staff_user.user_permissions.add(*Permission.objects.filter(codename__in=["view_order", "change_order"]))
    client = Client()
    client.force_login(staff_user)
    return client


def status_options(client, order):
    html = client.get(f"/admin/core_pasteleria/order/{order.pk}/change/").content.decode()
    select = html[html.index('name="status"'):]
    select = select[: select.index("</select>")]
    return [value for value in OrderStatus.values if f'value="{value}"' in select]


def test_every_status_has_its_transitions():
    assert set(order_status.ALLOWED_TRANSITIONS) == set(OrderStatus.values)
    # Solo se cancela antes del pago (decisión 3 del usuario, ronda 2).
    transitions = order_status.ALLOWED_TRANSITIONS
    cancellable = {status for status, targets in transitions.items() if OrderStatus.CANCELLED in targets}
    assert cancellable == {OrderStatus.AWAITING_PAYMENT, OrderStatus.AWAITING_QUOTE}


def test_the_admin_offers_only_the_current_status_and_its_next_ones(superuser_client, order):
    assert status_options(superuser_client, order) == ["awaiting_payment", "received", "cancelled"]
    Order.objects.filter(pk=order.pk).update(status="ready_for_delivery")
    assert status_options(superuser_client, order) == ["ready_for_delivery", "delivered"]


def test_a_transition_that_is_not_allowed_is_refused(superuser_client, order):
    response = change_post(superuser_client, order, status="delivered")
    assert response.status_code == 200
    assert "errorlist" in response.content.decode()
    order.refresh_from_db()
    assert order.status == "awaiting_payment"


def test_each_change_is_audited_with_who_and_both_states(superuser_client, order, caplog):
    with caplog.at_level(logging.INFO, logger="core_pasteleria.audit"):
        assert change_post(superuser_client, order, status="received").status_code == 302
    record = next(r for r in caplog.records if r.operation.endswith("change_status"))
    actor = Order.objects.get(pk=order.pk)
    assert (record.result, record.order_id, record.previous_status, record.new_status) == (
        "ok", order.pk, "awaiting_payment", "received",
    )
    assert record.actor_id == int(superuser_client.session["_auth_user_id"]) and actor.status == "received"
    # Nunca el correo ni otros datos personales.
    assert "@" not in record.getMessage()


def test_the_service_refuses_a_stale_change(order, staff_user):
    Order.objects.filter(pk=order.pk).update(status="received")
    with pytest.raises(DomainValidationError):
        order_status.change_status(order.pk, "awaiting_payment", "received", actor_id=staff_user.pk)


def test_only_the_superuser_sees_the_image_link(superuser_client, staff_client, order, django_user_model):
    page = f"/admin/core_pasteleria/order/{order.pk}/change/"
    assert "ver imagen" in superuser_client.get(page).content.decode()
    staff_page = staff_client.get(page)
    assert staff_page.status_code == 200
    assert "ver imagen" not in staff_page.content.decode()
