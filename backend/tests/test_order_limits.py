"""Ronda 1 de correcciones de la API de pedidos (D63, 14 de noviembre de 2026).

Topes configurables (decisión A del usuario), la vitrina de hoy pagada completa (C), la caducidad de 30 minutos que
nunca pasa del lapso (D) y los hallazgos de la revisión: throttle de creación, piezas por línea y por pedido, la misma
imagen en dos líneas, el fin del lapso desde la cuadrícula vigente, la lista paginada en el repositorio y el color de
una decoración que no lo admite.
"""
from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from core_pasteleria.api import throttles
from core_pasteleria.models import (
    BreadInventory,
    CatalogPrice,
    DeliverySlot,
    Order,
    PolicySettings,
    ShowcaseInventory,
)
from core_pasteleria.repositories import order_repo
from core_pasteleria.services.orders import schedule_service
from tests import memory_cake_design as data
from tests.test_orders_api import (
    CDMX,
    IN_TWO_DAYS,
    NOW,
    TODAY,
    body,
    design_line,
    offering,
    post,
    upload_image,
    wafer_layout,
)
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


def catalog_line(quantity=1):
    return {"kind": "order", "offering_id": offering("tres-leches-de-durazno").id, "quantity": quantity}


# --- A. Topes configurables ---


def test_a_customer_has_at_most_two_unpaid_orders(api):
    assert PolicySettings.objects.get().max_unpaid_orders_per_customer == 2
    assert [post(api, body(catalog_line())).status_code for _ in range(2)] == [201, 201]
    third = post(api, body(catalog_line()))
    assert third.status_code == 400
    assert "2 pedidos sin pagar" in third.json()["non_field_errors"][0]
    Order.objects.filter(pk=Order.objects.order_by("pk").first().pk).update(status="received")
    assert post(api, body(catalog_line())).status_code == 201


def test_an_expired_order_does_not_count_for_the_unpaid_cap(api):
    # Desde la ronda 2 una cotización tiene su propio tope (decisión 4 del usuario; `test_order_round2.py`).
    PolicySettings.objects.update(max_unpaid_orders_per_customer=1)
    assert post(api, body(catalog_line())).status_code == 201
    assert post(api, body(catalog_line())).status_code == 400
    Order.objects.filter(status="awaiting_payment").update(payment_due_at=NOW - timedelta(minutes=1))
    assert post(api, body(catalog_line())).status_code == 201


def test_orders_are_taken_up_to_60_days_ahead(api):
    assert PolicySettings.objects.get().max_days_ahead == 60
    assert post(api, body(catalog_line(), day=TODAY + timedelta(days=60))).status_code == 201
    late = post(api, body(catalog_line(), day=TODAY + timedelta(days=61)))
    assert "60 días" in late.json()["delivery_date"][0]
    slots = api.get("/api/v1/delivery-slots/", {"date": (TODAY + timedelta(days=61)).isoformat(), "kind": "order"})
    assert slots.status_code == 400 and "date" in slots.json()


def test_lock_slot_never_creates_a_row_past_the_window():
    with pytest.raises(ValueError):
        order_repo.lock_slot(TODAY + timedelta(days=61), time(15), time(15, 30), latest_date=TODAY + timedelta(days=60))
    assert not DeliverySlot.objects.exists()


# --- C. La vitrina de hoy se paga completa ---


def test_a_showcase_order_is_paid_in_full(api):
    mini = offering("tres-leches-de-fresa", "mini")
    ShowcaseInventory.objects.create(offering=mini, stock_date=TODAY, quantity=1)
    response = post(api, body({"kind": "showcase", "offering_id": mini.id}, day=TODAY, slot="12:30"))
    assert response.status_code == 201, response.json()
    payment = response.json()["payment"]
    assert (payment["advance"], payment["pay_today"], payment["pay_on_delivery"]) == ("130.00", "130.00", "0.00")


def test_showcase_and_a_same_day_order_mix_full_and_advance(api):
    mini, pinguino = offering("tres-leches-de-fresa", "mini"), offering("choco-pinguino")
    ShowcaseInventory.objects.create(offering=mini, stock_date=TODAY, quantity=1)
    BreadInventory.objects.create(bread=pinguino.product.bread, stock_date=TODAY, quantity=1)
    lines = ({"kind": "showcase", "offering_id": mini.id}, {"kind": "order", "offering_id": pinguino.id})
    response = post(api, body(*lines, day=TODAY, slot="14:00"))
    assert response.status_code == 201, response.json()
    payment = response.json()["payment"]
    # La mini completa ($130) y la mitad del Choco-pingüino ($175).
    assert (payment["advance"], payment["pay_on_delivery"]) == ("305.00", "175.00")


def test_payment_summary_pays_the_full_part_and_the_advance_of_the_rest():
    from core_pasteleria.services.payment_summary import payment_summary

    summary = payment_summary(Decimal("480.00"), Decimal("70.00"), settings=data.settings_repo(), paid_in_full=Decimal("130.00"))
    assert (summary.advance, summary.pay_today, summary.pay_on_delivery) == (
        Decimal("305.00"), Decimal("375.00"), Decimal("175.00"),
    )


# --- D. Caducidad ---


def test_an_unpaid_order_expires_after_the_window_and_its_slot_leaves_the_whole_window(api):
    mini = offering("tres-leches-de-fresa", "mini")
    ShowcaseInventory.objects.create(offering=mini, stock_date=TODAY, quantity=1)
    response = post(api, body({"kind": "showcase", "offering_id": mini.id}, day=TODAY, slot="12:30"))
    # A las 12:00, 30 minutos son las 12:30, el mismo inicio del lapso.
    assert datetime.fromisoformat(response.json()["payment_due_at"]) == datetime(2026, 11, 13, 12, 30, tzinfo=CDMX)
    # Ronda 2: con 90 minutos para pagar, el lapso de las 13:00 ya no se ofrece; el primero es el de las 13:30.
    PolicySettings.objects.update(payment_window_minutes=90)
    ShowcaseInventory.objects.filter(offering=mini).update(quantity=1)
    too_soon = post(api, body({"kind": "showcase", "offering_id": mini.id}, day=TODAY, slot="13:00"))
    assert too_soon.status_code == 400 and "delivery_date" in too_soon.json()
    later = post(api, body({"kind": "showcase", "offering_id": mini.id}, day=TODAY, slot="13:30"))
    assert datetime.fromisoformat(later.json()["payment_due_at"]) == datetime(2026, 11, 13, 13, 30, tzinfo=CDMX)


def test_an_order_placed_after_closing_for_early_tomorrow_expires_in_30_minutes(api, monkeypatch):
    night = datetime(2026, 11, 13, 23, 0, tzinfo=CDMX)
    monkeypatch.setattr(schedule_service, "bakery_now", lambda: night)
    response = post(api, body(catalog_line(), day=TODAY + timedelta(days=1), slot="10:30"))
    assert response.status_code == 201, response.json()
    assert datetime.fromisoformat(response.json()["payment_due_at"]) == datetime(2026, 11, 13, 23, 30, tzinfo=CDMX)


def test_cash_will_extend_the_deadline_to_closing_but_not_past_the_slot():
    store = data.STORE_SETTINGS
    noon = datetime(2026, 11, 13, 12, 0, tzinfo=CDMX)
    assert schedule_service.cash_payment_due_at(noon, datetime(2026, 11, 15, 15, 0, tzinfo=CDMX), store) == datetime(
        2026, 11, 13, 22, 30, tzinfo=CDMX
    )
    assert schedule_service.cash_payment_due_at(noon, datetime(2026, 11, 13, 14, 0, tzinfo=CDMX), store) == datetime(
        2026, 11, 13, 14, 0, tzinfo=CDMX
    )


# --- 1. Throttle de creación y piezas ---


def test_order_creation_is_throttled_per_user(api, monkeypatch):
    PolicySettings.objects.update(max_unpaid_orders_per_customer=50)
    monkeypatch.setattr(throttles.OrderCreateUserThrottle, "rate", "2/min")
    assert [post(api, body(catalog_line())).status_code for _ in range(3)] == [201, 201, 429]
    # Leer los pedidos no gasta el cupo de creación.
    assert api.get("/api/v1/orders/").status_code == 200


def test_order_creation_is_throttled_per_ip_across_accounts(customer_user, django_user_model, monkeypatch):
    monkeypatch.setattr(throttles.OrderCreateIPThrottle, "rate", "2/min")
    clients = []
    for index in range(3):
        client = APIClient()
        client.force_authenticate(django_user_model.objects.create_user(f"ip{index}@pasteleria.test", "clave-123"))
        clients.append(client)
    assert [post(client, body(catalog_line())).status_code for client in clients] == [201, 201, 429]


def test_order_creation_counts_a_whole_ipv6_slash_64_together(django_user_model, monkeypatch):
    monkeypatch.setattr(throttles.OrderCreateIPThrottle, "rate", "2/min")

    def client_from(ip, index):
        client = APIClient(REMOTE_ADDR=ip)
        client.force_authenticate(django_user_model.objects.create_user(f"v6-{index}@pasteleria.test", "clave-123"))
        return client

    same_64 = [client_from(f"2001:db8:1:2::{index + 1}", index) for index in range(3)]
    assert [post(client, body(catalog_line())).status_code for client in same_64] == [201, 201, 429]
    # Otra /64 tiene su propio contador.
    assert post(client_from("2001:db8:1:3::1", 3), body(catalog_line())).status_code == 201


def test_order_and_image_throttles_count_in_the_security_cache():
    # El cull de la caché pública no reinicia estos contadores (D62).
    for throttle in (
        throttles.OrderCreateUserThrottle,
        throttles.OrderCreateIPThrottle,
        throttles.CustomerImageUserThrottle,
        throttles.CustomerImageIPThrottle,
    ):
        assert throttle.cache._alias == "security"


def test_the_creation_rate_is_10_per_hour_per_account():
    from django.conf import settings

    # Por IP es otra tasa desde la ronda 2 (`test_order_round2.py`).
    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["orders_create_user"] == "10/hour"


def test_a_catalog_line_has_at_most_20_pieces(api):
    response = post(api, body(catalog_line(quantity=21)))
    assert response.json()["items"]["0"]["quantity"] == ["Encarga hasta 20 piezas por línea."]
    assert post(api, body(catalog_line(quantity=20))).status_code == 201


def test_an_order_has_a_total_piece_limit(api):
    PolicySettings.objects.update(max_pieces_per_order=3)
    second = {"kind": "order", "offering_id": offering("tres-leches-de-fresa").id, "quantity": 2}
    response = post(api, body(catalog_line(quantity=2), second))
    assert response.json() == {"non_field_errors": ["Tu pedido lleva 4 piezas; en línea el máximo es 3."]}


def test_a_huge_amount_is_a_400_never_a_500(api):
    PolicySettings.objects.update(max_pieces_per_line=999, max_pieces_per_order=9999)
    CatalogPrice.objects.filter(offerings__product__slug="tres-leches-de-durazno").update(amount=Decimal("999999.99"))
    response = post(api, body(catalog_line(quantity=999)))
    assert response.status_code == 400
    assert "WhatsApp" in response.json()["non_field_errors"][0]


# --- 3. La misma imagen en dos líneas ---


def test_the_same_image_in_two_lines_is_refused_on_the_second(api):
    PolicySettings.objects.update(max_unpaid_orders_per_customer=50)
    image_id = upload_image(api, "wafer")
    line = design_line(wafer=True, wafer_image_id=image_id, wafer_layout=wafer_layout())
    response = post(api, body(line, design_line(people=40, wafer=True, wafer_image_id=image_id, wafer_layout=wafer_layout())))
    assert response.status_code == 400
    errors = response.json()["items"]
    assert set(errors) == {"1"}
    assert errors["1"]["design"]["wafer_image_id"] == ["Esa imagen no está disponible. Súbela otra vez."]


# --- 5. El fin del lapso sale de la cuadrícula vigente ---


def test_the_slot_end_comes_from_the_current_grid(api):
    DeliverySlot.objects.create(date=IN_TWO_DAYS, starts_at=time(15), ends_at=time(16))
    response = post(api, body(catalog_line()))
    assert response.json()["slot_ends_at"] == "15:30"
    assert DeliverySlot.objects.get().ends_at == time(15, 30)


# --- 6. La lista se pagina en el repositorio ---


def test_the_order_list_is_paged_in_the_repository(api, customer_user):
    PolicySettings.objects.update(max_unpaid_orders_per_customer=50)
    ids = [post(api, body(catalog_line())).json()["id"] for _ in range(3)]
    page = order_repo.list_customer_orders(customer_user.pk, offset=1, limit=1)
    assert [order.id for order in page] == [ids[1]]
    assert order_repo.count_customer_orders(customer_user.pk) == 3
    listed = api.get("/api/v1/orders/").json()
    assert (listed["count"], [order["id"] for order in listed["results"]]) == (3, ids[::-1])


# --- 8. Color de una decoración que no lo admite ---


@pytest.mark.parametrize("decoration", ["ninguna", "chispas"])
def test_a_decoration_without_color_refuses_one(api, decoration):
    response = post(api, body(design_line(decoration=decoration, decoration_color="#d44c48")))
    assert response.json()["items"]["0"]["design"]["decoration_color"] == ["Esta decoración no lleva color."]
