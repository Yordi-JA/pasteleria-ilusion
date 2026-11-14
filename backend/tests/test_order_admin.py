"""Admin de pedidos: el personal ve el pedido con sus líneas en solo lectura y solo cambia su estado (D63)."""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from core_pasteleria.models import Order
from tests.test_orders_api import NOW, body, design_line, post  # noqa: F401 - `bakery_clock` fija la hora
from tests.test_orders_api import bakery_clock  # noqa: F401

pytestmark = pytest.mark.django_db


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    return client


@pytest.fixture
def order(customer_user):
    api = APIClient()
    api.force_authenticate(customer_user)
    message = {
        "text": "<b>Hola</b>", "color_mode": "custom", "color": "#A1B2C3", "arrangement": "straight",
        "curve": 0, "scale": 0.3, "rotation_deg": 0, "x": 0, "y": 0,
    }
    response = post(api, body(design_line(decoration="flores", decoration_color="#D44C48", message_layout=message)))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


def test_staff_sees_the_order_with_its_lines_read_only(superuser_client, order):
    assert superuser_client.get("/admin/core_pasteleria/order/").status_code == 200
    page = superuser_client.get(f"/admin/core_pasteleria/order/{order.pk}/change/")
    assert page.status_code == 200
    html = page.content.decode()
    assert "Apartado, falta tu pago" in html
    # El color se pinta con el valor validado; el texto del cliente va escapado.
    assert "background-color: #f6b8ca" in html and "parecido a Rosa" in html
    assert "&lt;b&gt;Hola&lt;/b&gt;" in html and "<b>Hola</b>" not in html
    # Las líneas no se editan: ningún campo de la línea en el formulario.
    assert 'name="items-0-quantity"' not in html and 'name="items-0-unit_price"' not in html
    assert order.note_token not in html


def change_post(client, order, **data):
    item = order.items.get()
    management = {
        "items-TOTAL_FORMS": "1", "items-INITIAL_FORMS": "1", "items-MIN_NUM_FORMS": "0", "items-MAX_NUM_FORMS": "1000",
        "items-0-id": str(item.pk), "items-0-order": str(order.pk),
    }
    return client.post(f"/admin/core_pasteleria/order/{order.pk}/change/", {**management, **data})


def test_the_status_is_the_only_field_staff_can_change(superuser_client, order):
    """El cobro en efectivo y lo demás del personal se hacen cambiando el estado aquí, sin pantallas nuevas
    (decisión del usuario del 14 de noviembre, D63); el Observer de la tanda 2 reaccionará al cambio."""
    page = superuser_client.get(f"/admin/core_pasteleria/order/{order.pk}/change/").content.decode()
    assert 'name="status"' in page
    before = order.status_changed_at
    amounts = (order.subtotal, order.pay_today)
    assert amounts == (Decimal("1140.00"), Decimal("640.00"))
    response = change_post(superuser_client, order, status="received", subtotal="1.00", pay_today="0.00")
    assert response.status_code == 302, response.content.decode()[:500]
    order.refresh_from_db()
    assert order.status == "received"
    assert order.status_changed_at > before
    # Los montos no se editan: lo que llegue en el formulario se ignora.
    assert (order.subtotal, order.pay_today) == amounts


def test_saving_without_changing_the_status_keeps_its_time(superuser_client, order):
    before = order.status_changed_at
    assert change_post(superuser_client, order, status="awaiting_payment").status_code == 302
    order.refresh_from_db()
    assert order.status_changed_at == before


def test_orders_cannot_be_added_or_deleted_from_the_admin(superuser_client, order):
    assert superuser_client.get("/admin/core_pasteleria/order/add/").status_code == 403
    assert superuser_client.get(f"/admin/core_pasteleria/order/{order.pk}/delete/").status_code == 403
    assert Order.objects.filter(pk=order.pk).exists()
