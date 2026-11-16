"""Webhooks de pago (D68): `POST /api/v1/payments/webhooks/mercadopago/` y `.../stripe/`.

Sin sesión ni CSRF: la firma es la autenticación. Firma ausente, inválida o vieja: 400 sin cambiar nada. Un pago
aprobado con el monto y la moneda esperados pasa el pedido a `received` por la misma transición y los mismos
observadores que el efectivo; el mismo evento dos veces no cambia nada la segunda; un pago que no se puede aplicar queda
como `refund_required` y no resucita el pedido.
"""
import json
import logging
import time
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from core_pasteleria.models import Inventory, Order, Payment, ShowcaseInventory
from core_pasteleria.services.orders import order_status
from core_pasteleria.services.payments import mercadopago_adapter
from tests.payment_fakes import (  # noqa: F401 - `gateways`: pasarelas simuladas
    MP_SECRET,
    STRIPE_WEBHOOK,
    gateways,
    mercadopago_headers,
    stripe_event,
    stripe_headers,
)
from tests.test_order_round2 import mini
from tests.test_orders_api import NOW, TODAY, body, design_line, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería
from tests.test_payments_api import pay

pytestmark = pytest.mark.django_db

MP_URL = "/api/v1/payments/webhooks/mercadopago/"
STRIPE_URL = "/api/v1/payments/webhooks/stripe/"


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


@pytest.fixture
def webhook():
    # Sin sesión y con CSRF exigido: un webhook no debe depender de ninguno de los dos.
    return APIClient(enforce_csrf_checks=True)


def design_order(api):
    response = post(api, body(design_line()))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


# --- Mercado Pago ---


def mp_payment(gateways, order, *, payment_id="9001", status="approved", amount=None, currency="MXN"):
    gateways.mercadopago.payments[payment_id] = {
        "id": int(payment_id),
        "status": status,
        "external_reference": str(order.pk),
        "transaction_amount": float(order.pay_today if amount is None else amount),
        "currency_id": currency,
    }


def mp_notify(client, payment_id="9001", headers=None, topic="payment"):
    payload = {"action": "payment.updated", "type": topic, "data": {"id": payment_id}}
    return client.post(
        f"{MP_URL}?data.id={payment_id}&type={topic}",
        json.dumps(payload),
        content_type="application/json",
        **(headers if headers is not None else mercadopago_headers(payment_id)),
    )


def started_with_mercadopago(api, gateways):
    order = design_order(api)
    assert pay(api, order.pk, "mercadopago").status_code == 201
    return order


def test_mercadopago_approves_the_order_once(api, webhook, gateways, caplog, django_capture_on_commit_callbacks):
    order = started_with_mercadopago(api, gateways)
    mp_payment(gateways, order)
    with caplog.at_level(logging.INFO, logger="core_pasteleria.notifications"):
        with django_capture_on_commit_callbacks(execute=True):
            response = mp_notify(webhook)
    assert response.status_code == 200 and response.json() == {"received": True}
    order.refresh_from_db()
    assert order.status == "received"
    payment = Payment.objects.get()
    assert (payment.status, payment.provider_payment_id, payment.checkout_id) == ("succeeded", "9001", "pref-1")
    # Pasó por el Observer, como el efectivo.
    assert any(r.name == "core_pasteleria.notifications" and r.new_status == "received" for r in caplog.records)
    # El mismo evento otra vez: 200 y nada cambia.
    changed_at = order.status_changed_at
    assert mp_notify(webhook).status_code == 200
    order.refresh_from_db()
    assert order.status_changed_at == changed_at and Payment.objects.count() == 1


# Se arman al correr la prueba: con `ts`, armarlas al recolectar las dejaría viejas.
BAD_MERCADOPAGO_HEADERS = {
    "sin-firma": lambda: {},
    "mal-formada": lambda: {"HTTP_X_SIGNATURE": "basura", "HTTP_X_REQUEST_ID": "req-1"},
    "otra-clave": lambda: mercadopago_headers("9001", secret="otra-clave"),
    "otro-id": lambda: mercadopago_headers("1234"),
    "otra-peticion": lambda: {**mercadopago_headers("9001"), "HTTP_X_REQUEST_ID": "req-2"},
    "ts-viejo": lambda: mercadopago_headers("9001", ts=int(time.time()) - 302),
    "ts-futuro": lambda: mercadopago_headers("9001", ts=int(time.time()) + 302),
}


@pytest.mark.parametrize("kind", BAD_MERCADOPAGO_HEADERS)
def test_mercadopago_rejects_a_bad_signature_without_changing_anything(api, webhook, gateways, kind):
    order = started_with_mercadopago(api, gateways)
    mp_payment(gateways, order)
    response = mp_notify(webhook, headers=BAD_MERCADOPAGO_HEADERS[kind]())
    assert response.status_code == 400 and response.json()["code"] == "invalid_signature"
    order.refresh_from_db()
    assert order.status == "awaiting_payment" and Payment.objects.get().status == "pending"


def test_mercadopago_accepts_ts_in_milliseconds(api, webhook, gateways):
    order = started_with_mercadopago(api, gateways)
    mp_payment(gateways, order)
    assert mp_notify(webhook, headers=mercadopago_headers("9001", ts=int(time.time() * 1000))).status_code == 200
    assert Order.objects.get(pk=order.pk).status == "received"


def test_the_manifest_is_the_one_the_sdk_documents():
    adapter = mercadopago_adapter.MercadoPagoAdapter("token", MP_SECRET, sdk=object())
    request = mercadopago_adapter.WebhookRequest(
        body=b'{"type": "payment"}', headers={k[5:].lower().replace("_", "-"): v for k, v in mercadopago_headers("42").items()},
        query={"data.id": "42"},
    )
    assert adapter.verify_notification(request) == "42"


@pytest.mark.parametrize(
    ("amount", "currency", "reason"),
    [("1.00", "MXN", "amount_mismatch"), (None, "USD", "currency_mismatch")],
)
def test_mercadopago_with_another_amount_or_currency_is_not_applied(api, webhook, gateways, amount, currency, reason):
    order = started_with_mercadopago(api, gateways)
    mp_payment(gateways, order, amount=amount, currency=currency)
    assert mp_notify(webhook).status_code == 200
    order.refresh_from_db()
    payment = Payment.objects.get()
    assert order.status == "awaiting_payment"
    assert (payment.status, payment.refund_reason) == ("refund_required", reason)


def test_mercadopago_rejected_leaves_the_order_waiting(api, webhook, gateways):
    order = started_with_mercadopago(api, gateways)
    mp_payment(gateways, order, status="rejected")
    assert mp_notify(webhook).status_code == 200
    assert Order.objects.get(pk=order.pk).status == "awaiting_payment"
    assert Payment.objects.get().status == "failed"
    # Otro intento en el mismo Checkout Pro, aprobado: el pedido se recibe con ese pago.
    mp_payment(gateways, order, payment_id="9002")
    assert mp_notify(webhook, "9002", headers=mercadopago_headers("9002")).status_code == 200
    assert Order.objects.get(pk=order.pk).status == "received"
    assert set(Payment.objects.values_list("provider_payment_id", "status")) == {("9001", "failed"), ("9002", "succeeded")}


def test_mercadopago_pending_and_other_topics_are_ignored(api, webhook, gateways):
    order = started_with_mercadopago(api, gateways)
    mp_payment(gateways, order, status="in_process")
    assert mp_notify(webhook).status_code == 200
    assert mp_notify(webhook, topic="merchant_order").status_code == 200
    assert Order.objects.get(pk=order.pk).status == "awaiting_payment" and Payment.objects.get().status == "pending"


def test_mercadopago_without_its_keys_is_503(webhook, settings):
    settings.MERCADOPAGO_ACCESS_TOKEN, settings.MERCADOPAGO_WEBHOOK_SECRET = "token", ""
    response = mp_notify(webhook)
    assert response.status_code == 503 and response.json()["code"] == "method_unavailable"


def test_mercadopago_lookup_failure_is_502_so_it_retries(api, webhook, gateways):
    started_with_mercadopago(api, gateways)
    # La firma es válida pero el pago no existe en la API (o la API falló): no se cambia nada.
    assert mp_notify(webhook, "777", headers=mercadopago_headers("777")).status_code == 502
    assert Payment.objects.get().status == "pending"


# --- Stripe ---


def stripe_notify(client, payload, headers=None):
    return client.post(
        STRIPE_URL, payload, content_type="application/json",
        **(headers if headers is not None else stripe_headers(payload)),
    )


def intent_for(order, *, intent_id="pi_1", amount=None, currency="mxn"):
    cents = int((order.pay_today if amount is None else Decimal(amount)) * 100)
    return {"id": intent_id, "amount": cents, "currency": currency, "metadata": {"order_id": str(order.pk)}}


def started_with_stripe(api, gateways):
    order = design_order(api)
    assert pay(api, order.pk, "stripe").status_code == 201
    return order


def test_stripe_succeeded_receives_the_order_once(api, webhook, gateways):
    order = started_with_stripe(api, gateways)
    payload = stripe_event("payment_intent.succeeded", intent_for(order))
    assert stripe_notify(webhook, payload).status_code == 200
    order.refresh_from_db()
    assert order.status == "received"
    assert Payment.objects.get().status == "succeeded"
    changed_at = order.status_changed_at
    assert stripe_notify(webhook, payload).status_code == 200
    order.refresh_from_db()
    assert order.status_changed_at == changed_at and Payment.objects.count() == 1


@pytest.mark.parametrize("kind", ["sin-firma", "otra-clave", "ts-viejo", "cuerpo-cambiado"])
def test_stripe_rejects_a_bad_signature_without_changing_anything(api, webhook, gateways, kind):
    order = started_with_stripe(api, gateways)
    payload = stripe_event("payment_intent.succeeded", intent_for(order))
    headers = {
        "sin-firma": {},
        "otra-clave": stripe_headers(payload, secret="whsec_otra"),
        "ts-viejo": stripe_headers(payload, ts=int(time.time()) - 301),
        "cuerpo-cambiado": stripe_headers(stripe_event("payment_intent.succeeded", intent_for(order, amount="1.00"))),
    }[kind]
    response = stripe_notify(webhook, payload, headers=headers)
    assert response.status_code == 400 and response.json()["code"] == "invalid_signature"
    assert Order.objects.get(pk=order.pk).status == "awaiting_payment" and Payment.objects.get().status == "pending"


# --- Registro de las firmas rechazadas (D68, revisión única) ---

WEBHOOK_LOGGER = "core_pasteleria.api.payment_views"
MERCADOPAGO_REJECTIONS = {
    "sin-firma": ("missing", ""),
    "mal-formada": ("malformed", "req-1"),
    "otra-clave": ("mismatch", "req-1"),
    "otro-id": ("mismatch", "req-1"),
    "otra-peticion": ("mismatch", "req-2"),
    "ts-viejo": ("stale", "req-1"),
    "ts-futuro": ("stale", "req-1"),
}


def rejection(caplog):
    [record] = [r for r in caplog.records if r.name == WEBHOOK_LOGGER and r.levelno == logging.WARNING]
    return record, record.getMessage() + repr(vars(record))


@pytest.mark.parametrize("kind", MERCADOPAGO_REJECTIONS)
def test_a_rejected_mercadopago_signature_is_logged_without_secrets(api, webhook, gateways, caplog, kind):
    order = started_with_mercadopago(api, gateways)
    mp_payment(gateways, order)
    headers = BAD_MERCADOPAGO_HEADERS[kind]()
    with caplog.at_level(logging.WARNING, logger=WEBHOOK_LOGGER):
        assert mp_notify(webhook, headers=headers).status_code == 400
    record, text = rejection(caplog)
    assert (record.method, record.reason, record.reference) == ("mercadopago", *MERCADOPAGO_REJECTIONS[kind])
    assert MP_SECRET not in text and "payment.updated" not in text
    if "HTTP_X_SIGNATURE" in headers:
        assert headers["HTTP_X_SIGNATURE"] not in text


@pytest.mark.parametrize(
    ("kind", "reason"),
    [("sin-firma", "missing"), ("mal-formada", "malformed"), ("otra-clave", "mismatch"), ("ts-viejo", "stale"),
     ("cuerpo-cambiado", "mismatch")],
)
def test_a_rejected_stripe_signature_is_logged_without_secrets(api, webhook, gateways, caplog, kind, reason):
    order = started_with_stripe(api, gateways)
    payload = stripe_event("payment_intent.succeeded", intent_for(order), event_id="evt_1Abc")
    headers = {
        "sin-firma": {},
        "mal-formada": {"HTTP_STRIPE_SIGNATURE": "basura"},
        "otra-clave": stripe_headers(payload, secret="whsec_otra"),
        "ts-viejo": stripe_headers(payload, ts=int(time.time()) - 301),
        "cuerpo-cambiado": stripe_headers(stripe_event("payment_intent.succeeded", intent_for(order, amount="1.00"))),
    }[kind]
    with caplog.at_level(logging.WARNING, logger=WEBHOOK_LOGGER):
        assert stripe_notify(webhook, payload, headers=headers).status_code == 400
    record, text = rejection(caplog)
    assert (record.method, record.reason, record.reference) == ("stripe", reason, "evt_1Abc")
    assert STRIPE_WEBHOOK not in text and "whsec_otra" not in text and "payment_intent.succeeded" not in text
    if "HTTP_STRIPE_SIGNATURE" in headers:
        assert headers["HTTP_STRIPE_SIGNATURE"] not in text


def test_an_unreadable_event_id_is_not_logged(api, webhook, gateways, caplog):
    order = started_with_stripe(api, gateways)
    # El cuerpo no está firmado: su id puede traer cualquier cosa, como un salto de línea con un registro falso.
    payload = stripe_event("payment_intent.succeeded", intent_for(order), event_id="evt_1\nINFO falso")
    with caplog.at_level(logging.WARNING, logger=WEBHOOK_LOGGER):
        assert stripe_notify(webhook, payload, headers=stripe_headers(payload, secret="whsec_otra")).status_code == 400
    record, text = rejection(caplog)
    assert (record.reason, record.reference) == ("mismatch", "") and "INFO falso" not in text


def test_stripe_failed_then_succeeded_on_the_same_intent(api, webhook, gateways):
    order = started_with_stripe(api, gateways)
    assert stripe_notify(webhook, stripe_event("payment_intent.payment_failed", intent_for(order), event_id="evt_1")).status_code == 200
    assert Payment.objects.get().status == "failed" and Order.objects.get(pk=order.pk).status == "awaiting_payment"
    assert stripe_notify(webhook, stripe_event("payment_intent.succeeded", intent_for(order), event_id="evt_2")).status_code == 200
    assert Payment.objects.get().status == "succeeded" and Order.objects.get(pk=order.pk).status == "received"


@pytest.mark.parametrize(
    ("amount", "currency", "reason"),
    [("1.00", "mxn", "amount_mismatch"), (None, "usd", "currency_mismatch")],
)
def test_stripe_with_another_amount_or_currency_is_not_applied(api, webhook, gateways, amount, currency, reason):
    order = started_with_stripe(api, gateways)
    payload = stripe_event("payment_intent.succeeded", intent_for(order, amount=amount, currency=currency))
    assert stripe_notify(webhook, payload).status_code == 200
    payment = Payment.objects.get()
    assert Order.objects.get(pk=order.pk).status == "awaiting_payment"
    assert (payment.status, payment.refund_reason) == ("refund_required", reason)


def test_stripe_other_events_are_ignored(webhook, gateways):
    payload = stripe_event("charge.refunded", {"id": "ch_1", "amount": 100, "currency": "mxn"})
    assert stripe_notify(webhook, payload).status_code == 200
    assert not Payment.objects.exists()


def test_stripe_without_its_webhook_secret_is_503(webhook, settings):
    settings.STRIPE_SECRET_KEY, settings.STRIPE_WEBHOOK_SECRET = "sk_test_x", ""
    payload = stripe_event("payment_intent.succeeded", {"id": "pi_1", "amount": 100, "currency": "mxn"})
    assert stripe_notify(webhook, payload).status_code == 503


# --- Pedido cancelado o ya pagado ---


def test_a_payment_for_a_cancelled_order_does_not_revive_it(api, webhook, gateways):
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=1)
    response = post(api, body({"kind": "showcase", "offering_id": mini().id}, day=TODAY, slot="14:00"))
    order = Order.objects.get(pk=response.json()["id"])
    assert pay(api, order.pk, "stripe").status_code == 201
    # Vence y el comando lo cancela: la pieza vuelve a la vitrina.
    order_status.cancel_expired_orders(now=NOW.replace(hour=13))
    assert Inventory.objects.get(offering=mini(), stock_date=TODAY).quantity == 1
    assert stripe_notify(webhook, stripe_event("payment_intent.succeeded", intent_for(order))).status_code == 200
    order.refresh_from_db()
    payment = Payment.objects.get()
    assert order.status == "cancelled"
    assert (payment.status, payment.refund_reason) == ("refund_required", "order_not_payable")
    # La pieza sigue en la vitrina: el pago no la volvió a apartar.
    assert Inventory.objects.get(offering=mini(), stock_date=TODAY).quantity == 1


def test_a_second_payment_for_a_paid_order_is_left_for_a_refund(api, webhook, gateways):
    order = design_order(api)
    assert pay(api, order.pk, "stripe").status_code == 201
    assert pay(api, order.pk, "mercadopago").status_code == 201
    assert stripe_notify(webhook, stripe_event("payment_intent.succeeded", intent_for(order))).status_code == 200
    mp_payment(gateways, order)
    assert mp_notify(webhook).status_code == 200
    assert Order.objects.get(pk=order.pk).status == "received"
    assert dict(Payment.objects.values_list("method", "status")) == {"stripe": "succeeded", "mercadopago": "refund_required"}


def test_a_payment_without_a_known_order_is_ignored(webhook, gateways):
    payload = stripe_event("payment_intent.succeeded", {"id": "pi_x", "amount": 100, "currency": "mxn", "metadata": {}})
    assert stripe_notify(webhook, payload).status_code == 200
    assert not Payment.objects.exists()


def test_the_webhook_is_audited_without_secrets(api, webhook, gateways, caplog):
    order = started_with_stripe(api, gateways)
    with caplog.at_level(logging.INFO, logger="core_pasteleria.audit"):
        stripe_notify(webhook, stripe_event("payment_intent.succeeded", intent_for(order)))
    record = next(r for r in caplog.records if r.operation.endswith("apply_notice"))
    assert (record.order_id, record.method, record.outcome) == (order.pk, "stripe", "succeeded")
    assert "secret" not in record.getMessage()


def test_an_oversized_webhook_is_413(webhook, gateways):
    payload = json.dumps({"x": "a" * (70 * 1024)}).encode()
    assert stripe_notify(webhook, payload).status_code == 413


def test_the_webhook_never_needs_a_session(api, webhook, gateways):
    # Un cliente con sesión no cambia nada: la firma manda.
    order = started_with_stripe(api, gateways)
    payload = stripe_event("payment_intent.succeeded", intent_for(order))
    assert api.post(STRIPE_URL, payload, content_type="application/json", **stripe_headers(payload, secret="whsec_mala")).status_code == 400
    assert stripe_notify(webhook, payload).status_code == 200
