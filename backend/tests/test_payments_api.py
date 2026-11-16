"""Iniciar el pago de un pedido (D68): `POST` y `GET /api/v1/orders/<id>/payment/`.

El monto es siempre `pay_today` del servidor; la misma `Idempotency-Key` da la misma respuesta sin cobrar otra vez;
solo el dueño, solo un pedido apartado y sin vencer; el efectivo extiende el plazo al cierre sin pasar del lapso; sin
las llaves de una pasarela, ese método responde 503. Las pasarelas son simuladas (`tests/payment_fakes.py`).
"""
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import ImproperlyConfigured
from rest_framework.test import APIClient

from core_pasteleria.api import throttles
from core_pasteleria.models import Order, Payment, ShowcaseInventory
from core_pasteleria.services.payments.results import ChargeRequest
from tests.payment_fakes import gateways  # noqa: F401 - pasarelas simuladas
from tests.test_order_round2 import at, mini
from tests.test_orders_api import CDMX, NOW, TODAY, body, design_line, post, upload_image
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


def payment_url(order_id):
    return f"/api/v1/orders/{order_id}/payment/"


def pay(client, order_id, method, key=None, **extra):
    return client.post(
        payment_url(order_id), {"method": method, **extra}, format="json", HTTP_IDEMPOTENCY_KEY=key or uuid.uuid4().hex
    )


def design_order(api):
    response = post(api, body(design_line()))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


def showcase_order(api, slot="14:00"):
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=2)
    response = post(api, body({"kind": "showcase", "offering_id": mini().id, "quantity": 2}, day=TODAY, slot=slot))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


# --- Acceso y validación ---


def test_anonymous_gets_401(api, gateways):
    order = design_order(api)
    assert APIClient().post(payment_url(order.pk), {"method": "cash"}, format="json").status_code == 401
    assert APIClient().get(payment_url(order.pk)).status_code == 401


def test_another_customers_order_is_404(api, gateways, django_user_model):
    order = design_order(api)
    other = APIClient()
    other.force_authenticate(django_user_model.objects.create_user("otra@pasteleria.test", "clave-123"))
    response = pay(other, order.pk, "stripe")
    assert response.status_code == 404 and response.json()["code"] == "not_found"
    assert other.get(payment_url(order.pk)).status_code == 404
    assert pay(api, 999999, "cash").status_code == 404
    assert not Payment.objects.exists() and gateways.stripe.created == []


def test_the_idempotency_key_and_a_known_method_are_required(api, gateways):
    order = design_order(api)
    missing = api.post(payment_url(order.pk), {"method": "cash"}, format="json")
    assert missing.status_code == 400 and "idempotency_key" in missing.json()
    unknown = pay(api, order.pk, "bitcoin")
    assert unknown.status_code == 400 and "method" in unknown.json()
    assert not Payment.objects.exists()


# --- El monto lo calcula el servidor ---


def test_stripe_charges_the_advance_plus_the_stand_deposit_in_cents(api, gateways):
    order = design_order(api)
    # 4 kg: anticipo del 50% de $1,020 más el depósito completo de la base (regla 10).
    assert order.advance == Decimal("510.00") and order.stand_deposit > 0
    assert order.pay_today == order.advance + order.stand_deposit
    response = pay(api, order.pk, "stripe", amount="1.00", pay_today="1.00")
    assert response.status_code == 201, response.json()
    params, options = gateways.stripe.created[0]
    assert params["amount"] == int(order.pay_today * 100) and params["currency"] == "mxn"
    assert params["metadata"] == {"order_id": str(order.pk)} and params["payment_method_types"] == ["card"]
    assert len(options["idempotency_key"]) == 64
    data = response.json()
    assert (data["method"], data["status"], data["amount"], data["currency"]) == ("stripe", "pending", str(order.pay_today), "MXN")
    assert data["client_secret"] == "pi_1_secret_abc" and data["redirect_url"] is None
    # El desglose para la pantalla sale del pedido: el navegador no conoce el porcentaje.
    assert data["order"]["payment"]["advance_percent"] == 50
    assert data["order"]["payment"]["pay_today"] == str(order.pay_today)
    payment = Payment.objects.get()
    assert (payment.amount, payment.checkout_id) == (order.pay_today, "pi_1")


def test_the_showcase_of_today_is_charged_in_full(api, gateways):
    order = showcase_order(api)
    assert order.pay_today == order.subtotal and order.pay_on_delivery == 0
    assert pay(api, order.pk, "stripe").status_code == 201
    assert gateways.stripe.created[0][0]["amount"] == int(order.subtotal * 100)


def test_mercadopago_creates_a_checkout_pro_preference_from_the_server_amount(api, gateways):
    order = design_order(api)
    response = pay(api, order.pk, "mercadopago")
    assert response.status_code == 201, response.json()
    preference, options = gateways.mercadopago.preferences[0]
    assert preference["external_reference"] == str(order.pk)
    assert preference["items"][0]["unit_price"] == float(order.pay_today)
    assert preference["items"][0]["currency_id"] == "MXN" and preference["items"][0]["quantity"] == 1
    assert preference["back_urls"]["success"] == f"http://testserver/pedido/pago?pedido={order.pk}"
    assert preference["notification_url"] == "http://testserver/api/v1/payments/webhooks/mercadopago/?source_news=webhooks"
    assert datetime.fromisoformat(preference["expiration_date_to"]) == order.payment_due_at
    assert options.custom_headers["x-idempotency-key"]
    data = response.json()
    assert data["redirect_url"] == "https://www.mercadopago.com.mx/checkout?pref=pref-1" and data["client_secret"] is None
    assert Payment.objects.get().checkout_id == "pref-1"


# --- Idempotencia ---


def test_the_same_key_gets_the_same_answer_without_charging_again(api, gateways):
    order = design_order(api)
    first = pay(api, order.pk, "stripe", key="llave-pago-0001")
    again = pay(api, order.pk, "stripe", key="llave-pago-0001")
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["id"] == first.json()["id"] and again.json()["client_secret"] == first.json()["client_secret"]
    assert len(gateways.stripe.created) == 1 and gateways.stripe.retrieved == ["pi_1"]
    assert Payment.objects.count() == 1
    mp_first = pay(api, order.pk, "mercadopago", key="llave-pago-0002")
    mp_again = pay(api, order.pk, "mercadopago", key="llave-pago-0002")
    assert mp_again.status_code == 200 and mp_again.json()["redirect_url"] == mp_first.json()["redirect_url"]
    assert len(gateways.mercadopago.preferences) == 1


@pytest.mark.parametrize("attempt_status", ["pending", "failed"])
def test_repeating_a_key_of_a_cancelled_order_is_409_without_asking_stripe(api, gateways, attempt_status):
    order = design_order(api)
    assert pay(api, order.pk, "stripe", key="llave-pago-0001").status_code == 201
    Payment.objects.update(status=attempt_status)
    Order.objects.filter(pk=order.pk).update(status="cancelled")
    response = pay(api, order.pk, "stripe", key="llave-pago-0001")
    assert response.status_code == 409 and response.json()["code"] == "order_not_payable"
    assert "client_secret" not in response.json()
    assert gateways.stripe.retrieved == []


def test_repeating_a_key_of_a_cancelled_order_is_409_with_mercadopago(api, gateways):
    order = design_order(api)
    assert pay(api, order.pk, "mercadopago", key="llave-pago-0002").status_code == 201
    Order.objects.filter(pk=order.pk).update(status="cancelled")
    response = pay(api, order.pk, "mercadopago", key="llave-pago-0002")
    assert response.status_code == 409 and response.json()["code"] == "order_not_payable"
    assert "redirect_url" not in response.json()


def test_repeating_a_key_of_an_overdue_order_is_cancelled_instead_of_replayed(api, gateways):
    order = design_order(api)
    assert pay(api, order.pk, "stripe", key="llave-pago-0001").status_code == 201
    Order.objects.filter(pk=order.pk).update(payment_due_at=NOW - timedelta(minutes=1))
    response = pay(api, order.pk, "stripe", key="llave-pago-0001")
    assert response.status_code == 409 and response.json()["code"] == "order_expired"
    assert gateways.stripe.retrieved == []


def test_repeating_a_key_of_a_closed_attempt_still_replays_it(api, gateways):
    order = design_order(api)
    first = pay(api, order.pk, "stripe", key="llave-pago-0001")
    Payment.objects.update(status="refund_required")
    Order.objects.filter(pk=order.pk).update(status="cancelled")
    again = pay(api, order.pk, "stripe", key="llave-pago-0001")
    assert again.status_code == 200 and again.json()["id"] == first.json()["id"]


def test_a_key_used_with_another_method_is_a_conflict(api, gateways):
    order = design_order(api)
    assert pay(api, order.pk, "stripe", key="llave-pago-0001").status_code == 201
    response = pay(api, order.pk, "cash", key="llave-pago-0001")
    assert response.status_code == 409 and response.json()["code"] == "idempotency_conflict"
    assert Payment.objects.count() == 1


def test_the_provider_idempotency_key_is_tied_to_the_order():
    one = ChargeRequest(order_id=1, idempotency_key="misma-llave", description="")
    two = ChargeRequest(order_id=2, idempotency_key="misma-llave", description="")
    assert one.provider_idempotency_key != two.provider_idempotency_key
    assert one.provider_idempotency_key == ChargeRequest(order_id=1, idempotency_key="misma-llave", description="x").provider_idempotency_key


# --- Estado y vencimiento ---


def test_only_an_order_awaiting_payment_can_be_paid(api, gateways):
    order = design_order(api)
    Order.objects.filter(pk=order.pk).update(status="received")
    response = pay(api, order.pk, "stripe")
    assert response.status_code == 409 and response.json()["code"] == "order_not_payable"
    image_id = upload_image(api, "decoration")
    quote = post(api, body(design_line(decoration="otra", decoration_image_id=image_id))).json()
    assert pay(api, quote["id"], "cash").status_code == 409
    assert not Payment.objects.exists() and gateways.stripe.created == []


def test_an_overdue_order_is_cancelled_instead_of_paid(api, gateways):
    order = design_order(api)
    Order.objects.filter(pk=order.pk).update(payment_due_at=NOW - timedelta(minutes=1))
    response = pay(api, order.pk, "mercadopago")
    assert response.status_code == 409 and response.json()["code"] == "order_expired"
    order.refresh_from_db()
    assert (order.status, order.cancellation_reason) == ("cancelled", "expired")
    assert gateways.mercadopago.preferences == []


# --- Efectivo ---


def test_cash_extends_the_deadline_to_closing_time(api, gateways):
    order = design_order(api)
    assert order.payment_due_at == at(12, 30)
    response = pay(api, order.pk, "cash")
    assert response.status_code == 201, response.json()
    order.refresh_from_db()
    assert order.status == "awaiting_payment" and order.payment_due_at == at(22, 30)
    assert response.json()["order"]["payment_due_at"] == at(22, 30).isoformat()
    assert (Payment.objects.get().method, Payment.objects.get().status) == ("cash", "pending")


def test_cash_never_goes_past_the_start_of_the_slot(api, gateways):
    order = showcase_order(api, slot="14:00")
    assert pay(api, order.pk, "cash").status_code == 201
    order.refresh_from_db()
    assert order.payment_due_at == at(14, 0)


def test_cash_never_shortens_the_deadline(api, gateways):
    order = design_order(api)
    later = datetime(TODAY.year, TODAY.month, TODAY.day, 23, 0, tzinfo=CDMX)
    Order.objects.filter(pk=order.pk).update(payment_due_at=later)
    assert pay(api, order.pk, "cash").status_code == 201
    order.refresh_from_db()
    assert order.payment_due_at == later


# --- Llaves y fallas de la pasarela ---


def test_a_method_without_its_keys_is_503_and_the_rest_keeps_working(api, gateways, settings):
    settings.STRIPE_WEBHOOK_SECRET = ""
    order = design_order(api)
    response = pay(api, order.pk, "stripe")
    assert response.status_code == 503
    assert response.json() == {
        "detail": "Por ahora no podemos cobrar con Tarjeta (Stripe). Elige otro método de pago.",
        "code": "method_unavailable",
    }
    assert pay(api, order.pk, "mercadopago").status_code == 201
    assert pay(api, order.pk, "cash").status_code == 201
    methods = {m["method"]: m["available"] for m in api.get(payment_url(order.pk)).json()["methods"]}
    assert methods == {"mercadopago": True, "stripe": False, "cash": True}


def test_a_gateway_failure_is_502_and_saves_nothing(api, gateways):
    order = design_order(api)
    gateways.stripe.fail = True
    gateways.mercadopago.fail = True
    for method, name in (("stripe", "Tarjeta (Stripe)"), ("mercadopago", "Mercado Pago")):
        response = pay(api, order.pk, method)
        assert response.status_code == 502
        assert response.json()["detail"] == f"No pudimos conectar con {name}. Inténtalo de nuevo en unos minutos."
    assert not Payment.objects.exists()


# --- Estado del pago para la pantalla ---


def test_the_payment_state_has_the_order_the_methods_and_the_latest_attempt(api, gateways):
    order = design_order(api)
    empty = api.get(payment_url(order.pk))
    assert empty.status_code == 200
    assert empty.json()["latest_payment"] is None and empty.json()["order"]["status"] == "awaiting_payment"
    pay(api, order.pk, "stripe")
    state = api.get(payment_url(order.pk)).json()
    latest = state["latest_payment"]
    assert (latest["method"], latest["status"], latest["amount"]) == ("stripe", "pending", str(order.pay_today))
    # El `client_secret` sale solo en la respuesta del POST.
    assert "client_secret" not in latest


def test_starting_a_payment_has_its_own_rate(api, gateways, monkeypatch):
    from django.conf import settings

    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["payments_user"] == "20/min"
    monkeypatch.setattr(throttles.PaymentStartUserThrottle, "rate", "1/min")
    order = design_order(api)
    assert pay(api, order.pk, "cash").status_code == 201
    assert pay(api, order.pk, "cash").status_code == 429
    # Consultar el estado no gasta ese cupo.
    assert api.get(payment_url(order.pk)).status_code == 200


# --- Configuración ---


def test_the_stripe_keys_are_checked_at_startup(load_settings):
    loaded = load_settings()
    assert (loaded.STRIPE_SECRET_KEY, loaded.MERCADOPAGO_ACCESS_TOKEN) == ("", "")
    with pytest.raises(ImproperlyConfigured, match="STRIPE_SECRET_KEY"):
        load_settings(STRIPE_SECRET_KEY="pk_test_publica")
    with pytest.raises(ImproperlyConfigured, match="STRIPE_WEBHOOK_SECRET"):
        load_settings(STRIPE_WEBHOOK_SECRET="sk_test_otra")
    assert load_settings(STRIPE_SECRET_KEY=" sk_test_123 ").STRIPE_SECRET_KEY == "sk_test_123"


@pytest.mark.parametrize("key", ["sk_live_123", "rk_live_123", " sk_live_123 "])
def test_live_stripe_keys_do_not_start(load_settings, key):
    with pytest.raises(ImproperlyConfigured, match="STRIPE_SECRET_KEY.*prueba"):
        load_settings(STRIPE_SECRET_KEY=key)


@pytest.mark.parametrize("key", ["sk_test_123", "rk_test_123"])
def test_test_stripe_keys_still_start(load_settings, key):
    assert load_settings(STRIPE_SECRET_KEY=key).STRIPE_SECRET_KEY == key


# --- Carrera entre el efectivo y la cancelación de lo vencido (pendiente 15 de D63) ---


def test_the_expiry_command_does_not_cancel_an_order_whose_deadline_moved(api, gateways, monkeypatch):
    from core_pasteleria.repositories import order_repo
    from core_pasteleria.services.orders import order_status

    order = design_order(api)
    assert pay(api, order.pk, "cash").status_code == 201
    # El comando leyó la lista antes de que el cliente eligiera efectivo: el pedido salía vencido.
    monkeypatch.setattr(order_repo, "list_expired_orders", lambda **kwargs: [(order.pk, "awaiting_payment")])
    assert order_status.cancel_expired_order_ids(now=at(13, 0)) == ()
    order.refresh_from_db()
    assert (order.status, order.payment_due_at) == ("awaiting_payment", at(22, 30))


def test_cash_does_not_extend_an_order_that_expired_meanwhile(api, gateways, monkeypatch):
    from core_pasteleria.services.payments import payment_service

    order = design_order(api)
    # Pasó la revisión, pero venció antes del `UPDATE` que extiende el plazo.
    monkeypatch.setattr(payment_service, "_check_payable", lambda *args: None)
    Order.objects.filter(pk=order.pk).update(payment_due_at=NOW - timedelta(minutes=1))
    response = pay(api, order.pk, "cash")
    assert response.status_code == 409 and response.json()["code"] == "order_expired"
    order.refresh_from_db()
    assert order.payment_due_at == NOW - timedelta(minutes=1) and not Payment.objects.exists()
