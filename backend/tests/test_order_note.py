"""Nota en PDF, su verificación pública y los campos nuevos del pedido (regla 11, D64 y D69).

La nota existe desde que el pedido está pagado (`received` en adelante). El dueño la descarga en
`GET orders/<id>/note.pdf`; el QR abre `/nota/<token>`, que pide `GET notes/<token>/` sin sesión y muestra solo lo
que fija la regla 11 (nunca teléfono, correo ni dirección).
"""
import base64
import base64
import re
import zlib
from datetime import datetime
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from core_pasteleria.api.throttles import NoteVerificationThrottle
from core_pasteleria.models import Order, Payment, StoreSettings
from core_pasteleria.services.orders import order_status
from tests.test_orders_api import CDMX, body, design_line, offering, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db

DELIVERED_AT = datetime(2026, 11, 15, 15, 30, tzinfo=CDMX)


@pytest.fixture
def customer(customer_user):
    customer_user.full_name = "Mariana Pérez Soto"
    customer_user.save(update_fields=["full_name"])
    return customer_user


@pytest.fixture
def api(customer):
    client = APIClient()
    client.force_authenticate(customer)
    return client


@pytest.fixture
def other_api(django_user_model):
    other = django_user_model.objects.create_user("otra@pasteleria.test", "clave-de-prueba-123")
    client = APIClient()
    client.force_authenticate(other)
    return client


@pytest.fixture
def order(api):
    response = post(api, body(design_line()))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


def pay(order, method="cash"):
    """El pago registrado (la transición la prueban los pagos, D68)."""
    Payment.objects.create(order=order, method=method, status="succeeded", amount=order.pay_today)
    Order.objects.filter(pk=order.pk).update(status="received")
    order.refresh_from_db()
    return order


def deliver(order, actor):
    Order.objects.filter(pk=order.pk).update(status="ready_for_delivery")
    order_status.change_status(order.pk, "ready_for_delivery", "delivered", actor_id=actor.pk, now=DELIVERED_AT)


def note_url(order):
    return f"/api/v1/orders/{order.pk}/note.pdf"


def verify_url(token):
    return f"/api/v1/notes/{token}/"


def pdf_text(content: bytes) -> bytes:
    """Lo legible del PDF: el archivo y cada flujo descomprimido (reportlab usa `ASCII85Decode` y `FlateDecode`)."""
    parts = [content]
    for stream in re.findall(rb"stream\r?\n(.*?)\s*endstream", content, re.S):
        for decode in (zlib.decompress, lambda raw: zlib.decompress(base64.a85decode(raw.strip(), adobe=True))):
            try:
                parts.append(decode(stream))
                break
            except (zlib.error, ValueError):
                continue
    return b"\n".join(parts)


# --- La nota en PDF ---


def test_the_owner_downloads_the_note_as_a_letter_pdf(api, order, settings):
    settings.SITE_URL = "https://pasteleriailusion.me"
    pay(order)
    response = api.get(note_url(order))
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == f'attachment; filename="nota-pedido-{order.pk}.pdf"'
    assert response["Cache-Control"] == "private, no-store"
    content = b"".join(response.streaming_content) if response.streaming else response.content
    assert content.startswith(b"%PDF")
    assert b"/MediaBox [ 0 0 612 792 ]" in content  # carta: 8.5 x 11 pulgadas
    text = pdf_text(content)
    assert f"Pedido #{order.pk}".encode() in text
    assert f"https://pasteleriailusion.me/nota/{order.note_token}".encode() in text


def test_the_note_marks_the_pending_store_data_instead_of_inventing_it(api, order):
    StoreSettings.objects.update(address="", whatsapp="")
    text = pdf_text(api.get(note_url(pay(order))).content)
    assert b"[Direcci" in text and b"[WhatsApp por confirmar]" in text


# En el PDF, los paréntesis de un texto van escapados: "(Stripe)" queda como "\(Stripe\)".
@pytest.mark.parametrize(("method", "label"), [("mercadopago", rb"Mercado Pago"), ("stripe", rb"Tarjeta \(Stripe\)")])
def test_the_note_names_the_payment_method_with_its_label(api, order, method, label):
    text = pdf_text(api.get(note_url(pay(order, method=method))).content)
    assert b"Pagado con " + label in text
    assert label.lower() not in text


def test_the_note_shows_the_store_data_once_the_bakery_sets_it(api, order):
    StoreSettings.objects.update(address="Calle Falsa 123", whatsapp="525512345678")
    text = pdf_text(api.get(note_url(pay(order))).content)
    assert b"Calle Falsa 123" in text and b"525512345678" in text


def test_a_message_the_pdf_fonts_cannot_draw_still_gives_a_note(api):
    message = {
        "text": "Feliz día 🎂 Ana", "color_mode": "custom", "color": "#A1B2C3", "arrangement": "straight",
        "curve": 0, "scale": 0.3, "rotation_deg": 0, "x": 0, "y": 0,
    }
    response = post(api, body(design_line(decoration="flores", decoration_color="#D44C48", message_layout=message)))
    assert response.status_code == 201, response.json()
    order = pay(Order.objects.get(pk=response.json()["id"]))
    note = api.get(note_url(order))
    assert note.status_code == 200
    assert b"Feliz d\\355a ? Ana" in pdf_text(note.content)


def test_another_customer_gets_404_and_anonymous_401(other_api, order):
    pay(order)
    assert other_api.get(note_url(order)).status_code == 404
    assert APIClient().get(note_url(order)).status_code == 401


@pytest.mark.parametrize("status", ["awaiting_payment", "awaiting_quote", "cancelled"])
def test_there_is_no_note_before_the_payment(api, order, status):
    Order.objects.filter(pk=order.pk).update(status=status)
    assert api.get(note_url(order)).status_code == 404


# --- La verificación pública (lo que abre el QR) ---


def test_a_valid_token_shows_only_what_rule_11_allows(api, order, staff_user):
    pay(order)
    deliver(order, staff_user)
    response = APIClient().get(verify_url(order.note_token))
    assert response.status_code == 200
    data = response.json()
    assert data.pop("created_at") is not None
    assert data == {
        "valid": True,
        "order_id": order.pk,
        "customer": "Mariana P.",
        "delivery": {
            "fulfillment": "pickup",
            "fulfillment_label": "Recoger en la pastelería",
            "date": "2026-11-15",
            "starts_at": "15:00",
            "ends_at": "15:30",
        },
        "stands": [
            {
                "kg": 4,
                "deposit": "70.00",
                "status": "on_loan",
                "status_label": "Prestada",
                "return_by": "2026-11-30",
                "returned_at": None,
            }
        ],
    }
    text = response.content.decode()
    for private in ("5512345678", "cliente@pasteleria.test", "Pérez", "address", "phone", "email"):
        assert private not in text


def test_before_delivery_the_stand_has_no_loan_yet_but_its_projected_deadline(api, order):
    pay(order)
    stand = APIClient().get(verify_url(order.note_token)).json()["stands"][0]
    assert (stand["status"], stand["status_label"], stand["return_by"]) == (None, None, "2026-11-30")


@pytest.mark.parametrize("token", ["x" * 43, "no-existe", "a" * 200])
def test_an_unknown_token_is_a_generic_404(token):
    response = APIClient().get(verify_url(token))
    assert response.status_code == 404
    assert response.json() == {"detail": "No encontrado."}


def test_the_token_of_an_unpaid_order_is_not_a_valid_note(order):
    assert APIClient().get(verify_url(order.note_token)).status_code == 404


def test_the_verification_ignores_a_session(api, order):
    pay(order)
    assert api.get(verify_url(order.note_token)).status_code == 200


def test_the_verification_is_throttled_by_ip(order, monkeypatch):
    monkeypatch.setattr(NoteVerificationThrottle, "THROTTLE_RATES", {"note_verification": "2/min"})
    pay(order)
    client = APIClient()
    assert [client.get(verify_url(order.note_token)).status_code for _ in range(3)] == [200, 200, 429]


# --- Lo que el frontend necesita del pedido ---


def test_the_order_brings_its_status_label_note_and_stand(api, order):
    data = api.get(f"/api/v1/orders/{order.pk}/").json()
    assert (data["status"], data["status_label"], data["note_available"]) == (
        "awaiting_payment", "Apartado, falta tu pago", False,
    )
    assert data["paid_with"] is None
    assert data["stands"] == [
        {
            "kg": 4,
            "deposit": "70.00",
            "return_days": 15,
            "return_by": "2026-11-30",
            "status": None,
            "status_label": None,
            "returned_at": None,
        }
    ]
    design = data["items"][0]["design"]
    assert (design["bread_name"], design["filling_base_name"], design["filling_flavor_names"]) == (
        "Chocolate", "Con queso", ["Zarzamora"],
    )
    assert design["decoration_name"] == "Sin decoración"


def test_a_paid_and_delivered_order_has_its_note_payment_and_loan(api, order, staff_user):
    pay(order, method="stripe")
    deliver(order, staff_user)
    data = api.get(f"/api/v1/orders/{order.pk}/").json()
    assert (data["status_label"], data["note_available"]) == ("Entregado", True)
    assert data["paid_with"]["method"] == "stripe"
    assert data["paid_with"]["method_label"] == "Tarjeta (Stripe)"
    assert data["paid_with"]["paid_at"] is not None
    assert data["status_changed_at"] == "2026-11-15T15:30:00-06:00"
    stand = data["stands"][0]
    assert (stand["status"], stand["status_label"], stand["return_by"]) == ("on_loan", "Prestada", "2026-11-30")


def test_the_list_brings_the_same_fields_and_only_the_customers_orders(api, other_api, order):
    pay(order)
    post(other_api, body(design_line(), slot="16:00"))
    data = api.get("/api/v1/orders/").json()
    assert data["count"] == 1
    listed = data["results"][0]
    assert (listed["id"], listed["status_label"], listed["note_available"]) == (order.pk, "Recibido", True)
    assert listed["stands"][0]["deposit"] == "70.00"


def test_an_order_without_stand_lists_no_stands(api):
    response = post(api, body({"kind": "order", "offering_id": offering("tres-leches-de-durazno").id, "quantity": 1}))
    assert response.json()["stands"] == []
    assert Decimal(response.json()["stand_deposit"]) == 0
