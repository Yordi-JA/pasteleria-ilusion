"""Arreglos de la revisión de `feat/carrito-entrega` (D66): throttle propio del calendario, marcas combinantes en el
nombre de quien recoge y la fecha más cercana que ya no se reserva."""
from datetime import timedelta

import pytest
from django.core.cache import cache, caches
from rest_framework.test import APIClient

from core_pasteleria.models import PolicySettings, StoreSettings
from tests.test_orders_api import TODAY, body, catalog_line, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db

SLOTS = "/api/v1/delivery-slots/"
FORBIDDEN_NAME = "Escribe el nombre solo con letras, espacios y signos comunes."


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


def one_day(day=TODAY + timedelta(days=2), kind="design"):
    return {"start": day.isoformat(), "end": day.isoformat(), "kind": kind}


# --- Throttle propio del calendario ---


def test_the_calendar_has_its_own_rate_of_30_per_minute():
    from django.conf import settings

    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["delivery_slots"] == "30/min"


def test_the_calendar_rate_counts_per_user_in_the_security_cache_and_not_in_the_general_one(api, customer_user):
    for _ in range(30):
        assert api.get(SLOTS, one_day()).status_code == 200
    assert api.get(SLOTS, one_day()).status_code == 429
    # El contador vive en la caché `security` y el cupo general de la cuenta (`user`) no se gastó.
    assert caches["security"].get(f"throttle_delivery_slots_{customer_user.pk}") is not None
    assert cache.get(f"throttle_user_{customer_user.pk}") is None


# --- Marcas combinantes en los nombres ---


def test_a_pickup_name_has_at_most_two_combining_marks_in_a_row(api):
    stacked = post(api, body(catalog_line(), pickup_name="Ana\u0301\u0301\u0301 López"))
    assert stacked.status_code == 400
    assert stacked.json()["pickup_name"] == [FORBIDDEN_NAME]
    accented = post(api, body(catalog_line(), pickup_name="Jose\u0301 Ana\u0301\u0300"))
    assert accented.status_code == 201, accented.json()


def test_the_registration_name_has_at_most_two_combining_marks_in_a_row():
    from tests.test_auth_api import REGISTER_URL, csrf_client, register_payload

    response = csrf_client().post(REGISTER_URL, register_payload(full_name="Ana\u0301\u0301\u0301"), format="json")
    assert response.status_code == 400
    # El registro habla de tú: "Escribe tu nombre…".
    assert response.json()["full_name"] == ["Escribe tu nombre solo con letras, espacios y signos comunes."]


# --- La fecha más cercana que ya no se reserva ---


def test_the_earliest_date_is_null_when_it_falls_after_the_last_bookable_day(api):
    # El admin deja reservar 1 día adelante, pero un diseño pide 2 de anticipación: no hay fecha posible.
    PolicySettings.objects.update(max_days_ahead=1)
    assert StoreSettings.objects.get().custom_lead_days == 2
    response = api.get(SLOTS, {"start": TODAY.isoformat(), "end": (TODAY + timedelta(days=3)).isoformat(), "kind": "design"})
    assert response.status_code == 200
    calendar = response.json()
    assert calendar["latest_date"] == (TODAY + timedelta(days=1)).isoformat()
    assert calendar["earliest_date"] is None
    assert not any(day["available"] for day in calendar["days"])


# --- Un reintento con la llave de un pedido vencido (re-revisión) ---


def test_a_retry_with_the_key_of_an_expired_order_gets_it_cancelled_and_the_pieces_back(api, monkeypatch):
    from core_pasteleria.models import Order, ShowcaseInventory
    from core_pasteleria.services.orders import schedule_service
    from tests.test_orders_api import NOW, offering

    mini = offering("tres-leches-de-fresa", "mini")
    ShowcaseInventory.objects.create(offering=mini, stock_date=TODAY, quantity=1)
    request = body({"kind": "showcase", "offering_id": mini.id}, day=TODAY, slot="12:30")
    created = post(api, request, key="reintento-vencido-1")
    assert created.status_code == 201, created.json()
    assert created.json()["status"] == "awaiting_payment"
    assert ShowcaseInventory.objects.get(offering=mini, stock_date=TODAY).quantity == 0
    # Pasa el plazo para pagar y el comando de Heroku Scheduler todavía no corre.
    monkeypatch.setattr(schedule_service, "bakery_now", lambda: NOW + timedelta(minutes=31))
    retry = post(api, request, key="reintento-vencido-1")
    assert retry.status_code == 200
    assert retry.json()["status"] == "cancelled"
    assert Order.objects.get(pk=created.json()["id"]).cancellation_reason == "expired"
    assert ShowcaseInventory.objects.get(offering=mini, stock_date=TODAY).quantity == 1


def test_a_retry_of_an_order_still_on_time_does_not_cancel_anything(api):
    from core_pasteleria.models import Order

    first = post(api, body(catalog_line()), key="reintento-a-tiempo-1")
    again = post(api, body(catalog_line()), key="reintento-a-tiempo-1")
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["status"] == "awaiting_payment"
    assert Order.objects.count() == 1
