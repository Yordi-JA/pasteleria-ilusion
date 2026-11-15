"""Quién recoge el pedido (D66, decisión A del usuario del 14 de noviembre de 2026).

El pedido guarda el nombre y el teléfono de quien lo recoge. El nombre sigue las reglas del nombre del registro
(`services/text_rules.py`) y el teléfono, las de `User.phone`: 10 dígitos, con una restricción en la base.
"""
import pytest
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from core_pasteleria.models import Order
from tests.test_orders_api import body, catalog_line, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


def without(payload, *fields):
    return {key: value for key, value in payload.items() if key not in fields}


def test_the_order_keeps_who_picks_it_up(api):
    response = post(api, body(catalog_line(), pickup_name="  Ana   López  ", pickup_phone="55 1234-5678"))
    assert response.status_code == 201, response.json()
    data = response.json()
    assert (data["pickup_name"], data["pickup_phone"]) == ("Ana López", "5512345678")
    order = Order.objects.get(pk=data["id"])
    assert (order.pickup_name, order.pickup_phone) == ("Ana López", "5512345678")
    # La consulta del pedido también los trae.
    assert api.get(f"/api/v1/orders/{order.pk}/").json()["pickup_name"] == "Ana López"


@pytest.mark.parametrize("field", ["pickup_name", "pickup_phone"])
def test_who_picks_it_up_is_required(api, field):
    response = post(api, without(body(catalog_line()), field))
    assert response.status_code == 400
    assert field in response.json()
    assert not Order.objects.exists()


@pytest.mark.parametrize(
    "name, message",
    [
        ("", "Escribe el nombre de quien recoge."),
        ("   ", "Escribe el nombre de quien recoge."),
        ("Ana\u202eLópez", "Escribe el nombre solo con letras, espacios y signos comunes."),
        ("Ana\nLópez", "Escribe el nombre solo con letras, espacios y signos comunes."),
        ("A" * 151, "Escribe el nombre en 150 caracteres o menos."),
    ],
)
def test_a_pickup_name_follows_the_rules_of_a_full_name(api, name, message):
    response = post(api, body(catalog_line(), pickup_name=name))
    assert response.status_code == 400
    assert response.json()["pickup_name"] == [message]


@pytest.mark.parametrize("phone", ["", "55 1234 567", "551234567890", "55-1234-567a", "+52 55 1234 5678"])
def test_a_pickup_phone_has_ten_digits(api, phone):
    response = post(api, body(catalog_line(), pickup_phone=phone))
    assert response.status_code == 400
    assert response.json()["pickup_phone"] == ["Escribe 10 dígitos, por ejemplo 55 1234 5678."]


def test_a_pickup_name_or_phone_that_is_not_text_is_refused(api):
    response = post(api, body(catalog_line(), pickup_name=123, pickup_phone=5512345678))
    assert response.status_code == 400
    assert set(response.json()) >= {"pickup_name", "pickup_phone"}


def test_the_database_refuses_a_phone_without_ten_digits(api):
    response = post(api, body(catalog_line()))
    assert response.status_code == 201
    with pytest.raises(IntegrityError), transaction.atomic():
        Order.objects.filter(pk=response.json()["id"]).update(pickup_phone="12345")


def test_staff_sees_who_picks_it_up_read_only(api, client, django_user_model):
    order_id = post(api, body(catalog_line(), pickup_name="Luis Pérez", pickup_phone="5598765432")).json()["id"]
    client.force_login(django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    html = client.get(f"/admin/core_pasteleria/order/{order_id}/change/").content.decode()
    assert "Luis Pérez" in html and "5598765432" in html
    assert 'name="pickup_name"' not in html and 'name="pickup_phone"' not in html
