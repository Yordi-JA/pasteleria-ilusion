"""API de pedidos (D63): `POST/GET /api/v1/orders/`, `GET /api/v1/orders/<id>/` y `GET /api/v1/delivery-slots/`.

El servidor crea el pedido y recalcula todo; del cliente solo se leen sus elecciones. La hora de la pastelería se fija
en el viernes 13 de noviembre de 2026 a las 12:00 (Ciudad de México).
"""
import io
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from core_pasteleria.models import (
    BreadInventory,
    CakeDesign,
    CustomerImage,
    Inventory,
    Order,
    PolicySettings,
    ProductOffering,
    ShowcaseInventory,
    StoreSettings,
)
from core_pasteleria.services.orders import schedule_service

pytestmark = pytest.mark.django_db

CDMX = ZoneInfo("America/Mexico_City")
NOW = datetime(2026, 11, 13, 12, 0, tzinfo=CDMX)
TODAY = NOW.date()
IN_TWO_DAYS = TODAY + timedelta(days=2)
URL = "/api/v1/orders/"

# 30 personas: 4 kg (regla 3.1). Tres leches, pan de chocolate, con queso y zarzamora: 4 x ($250 + $5) = $1,020.
DESIGN = {
    "people": 30,
    "form": "round",
    "tiers": 1,
    "cake_type": "tres_leches",
    "bread": "chocolate",
    "filling_base": "queso",
    "filling_flavors": ["zarzamora"],
    "coverage_color": "#F6B8CA",
    "decoration": "ninguna",
}


@pytest.fixture(autouse=True)
def bakery_clock(monkeypatch):
    monkeypatch.setattr(schedule_service, "bakery_now", lambda: NOW)


@pytest.fixture(autouse=True)
def many_unpaid_orders(db):
    # Estas pruebas crean varios pedidos de un mismo cliente; el tope de pedidos sin pagar se prueba en
    # `test_order_limits.py`.
    PolicySettings.objects.update(max_unpaid_orders_per_customer=50)


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


@pytest.fixture
def other_customer(django_user_model):
    return django_user_model.objects.create_user("otra@pasteleria.test", "clave-de-prueba-123")


def offering(slug, presentation="whole"):
    return ProductOffering.objects.get(product__slug=slug, presentation=presentation)


def design_line(**changes):
    return {"kind": "design", "design": {**DESIGN, **changes}}


def body(*items, day=IN_TWO_DAYS, slot="15:00", fulfillment="pickup"):
    return {"fulfillment": fulfillment, "delivery_date": day.isoformat(), "slot_starts_at": slot, "items": list(items)}


def post(client, payload, key=None):
    return client.post(URL, payload, format="json", HTTP_IDEMPOTENCY_KEY=key or uuid.uuid4().hex)


def upload_image(client, purpose):
    buffer = io.BytesIO()
    Image.new("RGB", (40, 40), "pink").save(buffer, format="PNG")
    file = SimpleUploadedFile("imagen.png", buffer.getvalue(), content_type="image/png")
    response = client.post("/api/v1/customer-images/", {"image": file, "purpose": purpose}, format="multipart")
    assert response.status_code == 201, response.json()
    return response.json()["id"]


def wafer_layout(**changes):
    return {
        "shape": "circle", "width_cm": 20, "height_cm": 20, "rotation_deg": 0, "x": 0, "y": 0,
        "image_zoom": 1, "image_x": 0, "image_y": 0, **changes,
    }


# --- Acceso ---


def test_anonymous_gets_401():
    client = APIClient()
    assert client.post(URL, body(design_line()), format="json").status_code == 401
    assert client.get(URL).status_code == 401
    assert client.get("/api/v1/delivery-slots/", {"date": IN_TWO_DAYS, "kind": "design"}).status_code == 401


def test_the_idempotency_key_is_required(api):
    response = api.post(URL, body(design_line()), format="json")
    assert response.status_code == 400
    assert "idempotency_key" in response.json()


# --- Diseña tu pastel ---


def test_a_design_order_is_priced_by_the_server_and_ignores_client_amounts(api, customer_user):
    tampered = design_line(total="1.00", baseDeposit="0.00", requiresQuote=True, kg=50)
    tampered.update(designId="cualquiera", total="1.00")
    response = post(api, {**body(tampered), "total": "1.00", "pay_today": "0.00", "status": "received"})
    assert response.status_code == 201, response.json()
    order = response.json()
    assert order["status"] == "awaiting_payment"
    assert (order["subtotal"], order["stand_deposit"], order["delivery_fee"]) == ("1020.00", "70.00", "0.00")
    assert order["payment"] == {
        "advance_percent": 50, "advance": "510.00", "base_deposit": "70.00", "delivery_fee": "0.00",
        "pay_today": "580.00", "pay_on_delivery": "510.00",
    }
    # Vence a los 30 minutos (`PolicySettings.payment_window_minutes`), antes de su lapso (D63, decisión D).
    assert datetime.fromisoformat(order["payment_due_at"]) == datetime(2026, 11, 13, 12, 30, tzinfo=CDMX)
    assert (order["delivery_date"], order["slot_starts_at"], order["slot_ends_at"]) == (
        IN_TWO_DAYS.isoformat(), "15:00", "15:30",
    )
    design = order["items"][0]["design"]
    assert (design["kg"], design["total"], design["requires_quote"]) == (4, "1020.00", False)
    assert design["stand"] == {"min_kg": 4, "max_kg": 5, "deposit": "70.00"}
    # El color se guarda en minúsculas y el "parecido a" lo calcula el servidor.
    assert (design["coverage_color"], design["coverage_color_name"]) == ("#f6b8ca", "Rosa")
    saved = Order.objects.get(pk=order["id"])
    assert saved.customer == customer_user and saved.items.get().design.stand.max_kg == 5
    assert len(saved.note_token) >= 43


def test_the_same_idempotency_key_returns_the_same_order(api):
    first = post(api, body(design_line()), key="llave-de-prueba-1")
    again = post(api, body(design_line(people=200)), key="llave-de-prueba-1")
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["id"] == first.json()["id"]
    assert Order.objects.count() == 1


def test_tiers_and_form_are_required_and_checked_against_the_kilos(api):
    missing = {key: value for key, value in DESIGN.items() if key not in ("tiers", "form")}
    response = post(api, body({"kind": "design", "design": missing}))
    assert response.status_code == 400
    assert set(response.json()["items"]["0"]["design"]) == {"tiers", "form"}
    too_many = post(api, body(design_line(tiers=3)))
    assert too_many.json()["items"]["0"]["design"]["tiers"] == ["Para 3 pisos el pedido es desde 18 kg."]


def test_a_design_needs_two_days(api):
    response = post(api, body(design_line(), day=TODAY + timedelta(days=1)))
    assert response.status_code == 400
    assert "delivery_date" in response.json()


@pytest.mark.parametrize("color", ["#abc", " #abcdef", "rosa", "#abcdef\n"])
def test_the_coverage_color_must_be_exactly_rrggbb(api, color):
    response = post(api, body(design_line(coverage_color=color)))
    assert response.status_code == 400
    assert "coverage_color" in response.json()["items"]["0"]["design"]


def test_the_decoration_and_message_colors_are_normalized(api):
    message = {
        "text": "Feliz día", "color_mode": "custom", "color": "#A1B2C3", "arrangement": "straight",
        "curve": 0, "scale": 0.3, "rotation_deg": 0, "x": 0, "y": 0,
    }
    response = post(api, body(design_line(decoration="flores", decoration_color="#D44C48", message_layout=message)))
    assert response.status_code == 201, response.json()
    design = response.json()["items"][0]["design"]
    assert (design["decoration_color"], design["decoration_color_name"]) == ("#d44c48", "Rojo")
    assert design["message_layout"]["color"] == "#a1b2c3"
    assert design["decoration_price"] == "120.00"
    assert CakeDesign.objects.get().message["color"] == "#a1b2c3"


def test_too_many_people_for_online_is_refused_on_people(api):
    response = post(api, body(design_line(people=400)))
    assert response.status_code == 400
    assert "WhatsApp" in response.json()["items"]["0"]["design"]["people"][0]


def test_other_decoration_pauses_the_order_and_requires_its_image(api):
    missing = post(api, body(design_line(decoration="otra")))
    assert missing.json()["items"]["0"]["design"]["decoration_image_id"] == ["Sube la imagen de tu decoración."]
    image_id = upload_image(api, "decoration")
    response = post(api, body(design_line(decoration="otra", decoration_image_id=image_id)))
    assert response.status_code == 201, response.json()
    order = response.json()
    assert (order["status"], order["payment"], order["payment_due_at"]) == ("awaiting_quote", None, None)
    assert order["items"][0]["design"]["requires_quote"] is True
    # La misma imagen no entra en otro pedido.
    again = post(api, body(design_line(decoration="otra", decoration_image_id=image_id)))
    assert again.json()["items"]["0"]["design"]["decoration_image_id"] == ["Esa imagen no está disponible. Súbela otra vez."]


def test_someone_elses_image_is_refused(api, other_customer):
    stranger = APIClient()
    stranger.force_authenticate(other_customer)
    image_id = upload_image(stranger, "decoration")
    response = post(api, body(design_line(decoration="otra", decoration_image_id=image_id)))
    assert response.status_code == 400
    assert response.json()["items"]["0"]["design"]["decoration_image_id"] == ["Esa imagen no está disponible. Súbela otra vez."]
    assert not Order.objects.exists()
    assert not CakeDesign.objects.filter(decoration_image=CustomerImage.objects.get()).exists()


def test_an_image_on_a_design_that_does_not_take_one_is_refused(api):
    image_id = upload_image(api, "decoration")
    response = post(api, body(design_line(decoration_image_id=image_id)))
    assert response.json()["items"]["0"]["design"]["decoration_image_id"] == ["Esta decoración no lleva imagen."]


def test_the_wafer_needs_its_image_and_layout_and_must_fit_the_lid(api):
    missing = post(api, body(design_line(wafer=True)))
    assert set(missing.json()["items"]["0"]["design"]) == {"wafer_layout", "wafer_image_id"}
    image_id = upload_image(api, "wafer")
    outside = post(api, body(design_line(wafer=True, wafer_image_id=image_id, wafer_layout=wafer_layout(x=0.5))))
    assert outside.json()["items"]["0"]["design"]["wafer_layout"] == ["La oblea se sale de la tapa del pastel. Acomódala otra vez."]
    response = post(api, body(design_line(wafer=True, wafer_image_id=image_id, wafer_layout=wafer_layout())))
    assert response.status_code == 201, response.json()
    design = response.json()["items"][0]["design"]
    assert (design["wafer_price"], design["total"], design["wafer_image_id"]) == ("125.00", "1145.00", image_id)


# --- Catálogo y vitrina ---


def test_a_slice_cannot_be_ordered_for_a_date(api):
    response = post(api, body({"kind": "order", "offering_id": offering("tres-leches-de-fresa", "slice").id}))
    assert response.status_code == 400
    assert response.json()["items"]["0"]["offering_id"] == ["Las rebanadas son solo de la vitrina de hoy: no se encargan."]


def test_channel_rules_are_checked(api):
    showcase_only = post(api, body({"kind": "order", "offering_id": offering("mosaico-con-crema", "cup").id}))
    order_only = post(
        api, body({"kind": "showcase", "offering_id": offering("red-velvet").id}, day=TODAY, slot="12:30")
    )
    assert showcase_only.json()["items"]["0"]["offering_id"] == ["Solo en vitrina: no se encarga."]
    assert order_only.json()["items"]["0"]["offering_id"] == ["Solo por encargo: no está en la vitrina."]


def test_a_catalog_order_is_priced_from_the_catalog(api):
    durazno = offering("tres-leches-de-durazno")
    response = post(api, body({"kind": "order", "offering_id": durazno.id, "quantity": 2, "unit_price": "1.00"}))
    assert response.status_code == 201, response.json()
    order = response.json()
    item = order["items"][0]
    assert (item["unit_price"], item["line_total"], item["product_name"], item["presentation"]) == (
        "350.00", "700.00", "Tres leches de durazno", "whole",
    )
    assert (order["subtotal"], order["stand_deposit"], order["payment"]["pay_today"]) == ("700.00", "0.00", "350.00")


def test_a_showcase_order_takes_stock_today_and_cannot_oversell(api):
    mini = offering("tres-leches-de-fresa", "mini")
    row = ShowcaseInventory.objects.create(offering=mini, stock_date=TODAY, quantity=2)
    first = post(api, body({"kind": "showcase", "offering_id": mini.id, "quantity": 2}, day=TODAY, slot="12:30"))
    assert first.status_code == 201, first.json()
    row.refresh_from_db()
    assert row.quantity == 0
    second = post(api, body({"kind": "showcase", "offering_id": mini.id}, day=TODAY, slot="13:00"))
    assert second.json()["items"]["0"]["quantity"] == ["Se agotó por hoy."]


def test_the_showcase_is_only_for_today_and_from_the_next_slot(api):
    mini = offering("tres-leches-de-fresa", "mini")
    ShowcaseInventory.objects.create(offering=mini, stock_date=TODAY, quantity=2)
    tomorrow = post(api, body({"kind": "showcase", "offering_id": mini.id}, day=TODAY + timedelta(days=1)))
    past = post(api, body({"kind": "showcase", "offering_id": mini.id}, day=TODAY, slot="11:30"))
    assert "delivery_date" in tomorrow.json() and "delivery_date" in past.json()


def test_the_whole_cake_of_the_sliced_one_is_not_sold(api):
    ShowcaseInventory.objects.create(offering=offering("tres-leches-de-fresa", "slice"), stock_date=TODAY, quantity=6)
    # Un dato que se saltó la validación del admin: completo y rebanadas el mismo día.
    Inventory.objects.create(kind="showcase", offering=offering("tres-leches-de-fresa"), stock_date=TODAY, quantity=1)
    response = post(
        api, body({"kind": "showcase", "offering_id": offering("tres-leches-de-fresa").id}, day=TODAY, slot="12:30")
    )
    assert response.json()["items"]["0"]["offering_id"] == ["Hoy este pastel se vende en rebanadas. Puedes encargarlo completo."]


def test_a_same_day_catalog_order_needs_bread_and_two_hours(api):
    pinguino = offering("choco-pinguino")
    no_bread = post(api, body({"kind": "order", "offering_id": pinguino.id}, day=TODAY, slot="14:00"))
    assert no_bread.json()["items"]["0"]["offering_id"] == ["Para hoy ya no tenemos pan para este pastel. Elige otra fecha."]
    bread = BreadInventory.objects.create(bread=pinguino.product.bread, stock_date=TODAY, quantity=1)
    too_soon = post(api, body({"kind": "order", "offering_id": pinguino.id}, day=TODAY, slot="13:30"))
    assert "delivery_date" in too_soon.json()
    response = post(api, body({"kind": "order", "offering_id": pinguino.id}, day=TODAY, slot="14:00"))
    assert response.status_code == 201, response.json()
    bread.refresh_from_db()
    assert bread.quantity == 0
    # Sin pan definido para el producto (PENDIENTE en la semilla), no hay encargo para hoy.
    durazno = post(api, body({"kind": "order", "offering_id": offering("tres-leches-de-durazno").id}, day=TODAY, slot="14:00"))
    assert "offering_id" in durazno.json()["items"]["0"]


def test_the_showcase_and_a_design_cannot_share_an_order(api):
    mini = offering("tres-leches-de-fresa", "mini")
    ShowcaseInventory.objects.create(offering=mini, stock_date=TODAY, quantity=2)
    response = post(api, body(design_line(), {"kind": "showcase", "offering_id": mini.id}))
    assert response.json()["delivery_date"] == [schedule_service.MIXED_MESSAGE]


def test_a_repeated_line_is_refused(api):
    durazno = offering("tres-leches-de-durazno").id
    response = post(api, body({"kind": "order", "offering_id": durazno}, {"kind": "order", "offering_id": durazno}))
    assert set(response.json()["items"]) == {"1"}
    assert "offering_id" in response.json()["items"]["1"]


def test_errors_of_several_lines_come_together(api):
    response = post(
        api,
        body(
            {"kind": "order", "offering_id": offering("tres-leches-de-fresa", "slice").id},
            design_line(bread="no-existe"),
            fulfillment="delivery",
        ),
    )
    errors = response.json()
    assert "WhatsApp" in errors["fulfillment"][0]
    assert "offering_id" in errors["items"]["0"] and "bread" in errors["items"]["1"]["design"]


def test_an_empty_order_is_refused(api):
    response = post(api, body())
    assert response.status_code == 400
    assert response.json()["items"] == {"non_field_errors": ["Tu pedido está vacío."]}


# --- Agenda ---


def catalog_line():
    return {"kind": "order", "offering_id": offering("tres-leches-de-durazno").id}


def test_a_full_slot_is_refused_and_an_expired_reservation_frees_it(api, settings):
    StoreSettings.objects.update(max_orders_per_slot=2)
    assert [post(api, body(catalog_line())).status_code for _ in range(2)] == [201, 201]
    full = post(api, body(catalog_line()))
    assert full.json() == {"slot_starts_at": ["Ese horario se acaba de llenar. Elige otro."]}
    Order.objects.filter(pk=Order.objects.order_by("pk").first().pk).update(payment_due_at=NOW - timedelta(minutes=1))
    assert post(api, body(catalog_line())).status_code == 201


def test_cancelled_and_delivered_orders_do_not_hold_the_slot(api):
    StoreSettings.objects.update(max_orders_per_slot=1)
    assert post(api, body(catalog_line())).status_code == 201
    Order.objects.update(status="cancelled")
    assert post(api, body(catalog_line())).status_code == 201


def test_the_slots_endpoint_marks_full_and_too_soon(api):
    StoreSettings.objects.update(max_orders_per_slot=1)
    assert post(api, body(catalog_line(), day=TODAY, slot="15:00")).status_code == 400  # sin pan hoy
    assert post(api, body(catalog_line(), day=IN_TWO_DAYS, slot="15:00")).status_code == 201
    response = api.get("/api/v1/delivery-slots/", {"date": IN_TWO_DAYS.isoformat(), "kind": ["order", "design"]})
    assert response.status_code == 200
    schedule = response.json()
    slots = {slot["starts_at"]: slot for slot in schedule["slots"]}
    assert len(slots) == 24 and schedule["earliest_date"] == IN_TWO_DAYS.isoformat()
    assert (slots["15:00"]["available"], slots["15:00"]["reason"]) == (False, "full")
    assert slots["15:30"] == {"starts_at": "15:30", "ends_at": "16:00", "available": True, "reason": None}
    today = api.get("/api/v1/delivery-slots/", {"date": TODAY.isoformat(), "kind": "order"}).json()
    assert [s["reason"] for s in today["slots"] if s["starts_at"] in ("13:30", "14:00")] == ["too_soon", None]


def test_the_slots_endpoint_refuses_showcase_with_design(api):
    response = api.get("/api/v1/delivery-slots/", {"date": TODAY.isoformat(), "kind": ["showcase", "design"]})
    assert response.status_code == 400
    assert response.json() == {"kind": [schedule_service.MIXED_MESSAGE]}


# --- Lectura ---


def test_customers_see_only_their_orders(api, other_customer):
    order_id = post(api, body(design_line())).json()["id"]
    assert api.get(f"{URL}{order_id}/").status_code == 200
    listed = api.get(URL).json()
    assert [order["id"] for order in listed["results"]] == [order_id]
    stranger = APIClient()
    stranger.force_authenticate(other_customer)
    assert stranger.get(f"{URL}{order_id}/").status_code == 404
    assert stranger.get(URL).json()["results"] == []
