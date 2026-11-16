"""Cancelar el PaymentIntent de Stripe cuando el pedido se cancela (D68, revisión única).

`StripeCheckoutObserver` recibe el `StatusChanged` hacia `cancelled` y, después del commit, cancela en Stripe los
PaymentIntent abiertos del pedido (`pending` o `failed`). Es de mejor esfuerzo: si Stripe falla o el intento ya se
cobró, queda un WARNING sin datos personales ni secretos y el pedido sigue cancelado. Sin las llaves de Stripe, o con
Mercado Pago o efectivo, no se llama a Stripe. Las pasarelas son simuladas (`tests/payment_fakes.py`).
"""
import logging
from datetime import timedelta

import pytest
import stripe
from django.test import Client
from rest_framework.test import APIClient

from core_pasteleria.models import Order, Payment
from core_pasteleria.services.orders import order_status
from tests.payment_fakes import STRIPE_KEY, gateways  # noqa: F401 - pasarelas simuladas
from tests.test_order_admin import change_post
from tests.test_orders_api import NOW, body, design_line, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería
from tests.test_payments_api import pay

pytestmark = pytest.mark.django_db

OBSERVER_LOGGER = "core_pasteleria.services.orders.order_observer"
# Después del plazo para pagar (30 minutos desde el pedido).
AFTER_THE_DEADLINE = NOW + timedelta(hours=1)


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


@pytest.fixture
def boss(django_user_model):
    client = Client()
    client.force_login(django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    return client


def order_paying_with(api, *methods):
    response = post(api, body(design_line()))
    assert response.status_code == 201, response.json()
    order = Order.objects.get(pk=response.json()["id"])
    for method in methods:
        assert pay(api, order.pk, method).status_code == 201
    return order


def warnings_of(caplog):
    return [r for r in caplog.records if r.name == OBSERVER_LOGGER and r.levelno == logging.WARNING]


def test_cancelling_in_the_admin_cancels_the_open_intent_after_commit(api, boss, gateways, django_capture_on_commit_callbacks):
    order = order_paying_with(api, "stripe")
    with django_capture_on_commit_callbacks(execute=False) as callbacks:
        assert change_post(boss, order, status="cancelled").status_code == 302
    # Dentro de la transacción no se llama a Stripe: solo después del commit.
    assert gateways.stripe.cancelled == []
    for callback in callbacks:
        callback()
    assert gateways.stripe.cancelled == [("pi_1", {"cancellation_reason": "abandoned"})]
    assert Order.objects.get(pk=order.pk).status == "cancelled"
    # La fila no cambia: un cobro que ya hubiera entrado lo deja el webhook en `refund_required`.
    assert Payment.objects.get().status == "pending"


def test_the_expiry_command_cancels_every_open_intent_of_the_order(api, gateways, django_capture_on_commit_callbacks):
    order = order_paying_with(api, "stripe", "stripe")
    Payment.objects.filter(checkout_id="pi_1").update(status="failed")
    with django_capture_on_commit_callbacks(execute=True):
        assert order_status.cancel_expired_orders(now=AFTER_THE_DEADLINE) == 1
    assert [intent for intent, _ in gateways.stripe.cancelled] == ["pi_1", "pi_2"]
    assert Order.objects.get(pk=order.pk).status == "cancelled"


def test_a_closed_intent_is_not_cancelled(api, gateways, django_capture_on_commit_callbacks):
    order_paying_with(api, "stripe")
    Payment.objects.update(status="refund_required")
    with django_capture_on_commit_callbacks(execute=True):
        assert order_status.cancel_expired_orders(now=AFTER_THE_DEADLINE) == 1
    assert gateways.stripe.cancelled == []


@pytest.mark.parametrize(
    "error",
    [
        stripe.InvalidRequestError("This PaymentIntent's status is succeeded.", param=None),
        stripe.APIConnectionError("sin red"),
    ],
    ids=["ya-cobrado", "sin-red"],
)
def test_a_stripe_failure_keeps_the_cancellation_and_logs_a_warning(
    api, boss, gateways, caplog, django_capture_on_commit_callbacks, error
):
    order = order_paying_with(api, "stripe")
    gateways.stripe.cancel_error = error
    with caplog.at_level(logging.WARNING, logger=OBSERVER_LOGGER):
        with django_capture_on_commit_callbacks(execute=True):
            assert change_post(boss, order, status="cancelled").status_code == 302
    assert Order.objects.get(pk=order.pk).status == "cancelled"
    assert Payment.objects.get().status == "pending"
    [warning] = warnings_of(caplog)
    assert (warning.order_id, warning.checkout_id, warning.method) == (order.pk, "pi_1", "stripe")
    text = warning.getMessage() + repr(vars(warning))
    for secret in (STRIPE_KEY, "pi_1_secret_abc", "cliente@pasteleria.test", str(error)):
        assert secret not in text


def test_without_stripe_keys_nothing_is_called(api, gateways, settings, caplog, django_capture_on_commit_callbacks):
    order_paying_with(api, "stripe")
    settings.STRIPE_SECRET_KEY = ""
    with caplog.at_level(logging.WARNING, logger=OBSERVER_LOGGER):
        with django_capture_on_commit_callbacks(execute=True):
            assert order_status.cancel_expired_orders(now=AFTER_THE_DEADLINE) == 1
    assert gateways.stripe.cancelled == [] and warnings_of(caplog) == []


@pytest.mark.parametrize("method", ["mercadopago", "cash"])
def test_mercadopago_and_cash_do_not_call_stripe(api, boss, gateways, django_capture_on_commit_callbacks, method):
    order = order_paying_with(api, method)
    with django_capture_on_commit_callbacks(execute=True):
        assert change_post(boss, order, status="cancelled").status_code == 302
    assert Order.objects.get(pk=order.pk).status == "cancelled"
    assert gateways.stripe.cancelled == []
