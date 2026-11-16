"""Fábrica de pagos (Factory Method + Adapter, D68): registro sin `if/elif`, un método desconocido falla y el cobro se
audita sin payloads, tokens ni datos personales."""
import ast
import inspect
import logging
from decimal import Decimal

import pytest

from core_pasteleria.models import PaymentMethod, PaymentStatus
from core_pasteleria.services.payments import errors, mercadopago_adapter, payment_factory, payment_service, stripe_adapter
from core_pasteleria.services.payments.payment_factory import (
    PAYMENT_GATEWAY_REGISTRY,
    BasePayment,
    CashPayment,
    MercadoPagoPayment,
    StripePayment,
    create_payment_processor,
)
from core_pasteleria.services.payments.results import ChargeRequest


class FakeAdapter:
    def __init__(self):
        self.calls = []

    def create_checkout(self, amount, request):
        self.calls.append((amount, request))
        return payment_factory.PaymentResult(
            order_id=request.order_id, method="stripe", status="pending", amount=amount, checkout_id="pi_123",
            client_secret="pi_123_secret_abc",
        )


def test_the_registry_covers_every_payment_method_and_cannot_be_changed():
    assert set(PAYMENT_GATEWAY_REGISTRY) == set(PaymentMethod.values)
    assert PAYMENT_GATEWAY_REGISTRY["mercadopago"] is MercadoPagoPayment
    assert PAYMENT_GATEWAY_REGISTRY["stripe"] is StripePayment
    assert PAYMENT_GATEWAY_REGISTRY["cash"] is CashPayment
    assert all(issubclass(cls, BasePayment) for cls in PAYMENT_GATEWAY_REGISTRY.values())
    with pytest.raises(TypeError):
        PAYMENT_GATEWAY_REGISTRY["bitcoin"] = CashPayment


@pytest.mark.parametrize("module", [payment_factory, payment_service])
def test_the_gateway_is_never_chosen_with_if_chains(module):
    tree = ast.parse(inspect.getsource(module))
    for node in ast.walk(tree):
        if isinstance(node, ast.If):
            assert not (len(node.orelse) == 1 and isinstance(node.orelse[0], ast.If)), ast.unparse(node.test)
    factory = next(n for n in ast.walk(ast.parse(inspect.getsource(payment_factory))) if getattr(n, "name", "") == "create_payment_processor")
    assert not any(isinstance(node, ast.If) for node in ast.walk(factory))


def test_the_factory_returns_the_registered_class():
    assert isinstance(create_payment_processor("cash"), CashPayment)


def test_an_unknown_method_fails():
    with pytest.raises(errors.UnknownPaymentMethod):
        create_payment_processor("bitcoin")


def test_a_gateway_without_its_keys_is_not_configured(settings):
    settings.STRIPE_SECRET_KEY, settings.STRIPE_WEBHOOK_SECRET = "sk_test_123", ""
    settings.MERCADOPAGO_ACCESS_TOKEN, settings.MERCADOPAGO_WEBHOOK_SECRET = "", "secreto"
    for method in ("stripe", "mercadopago"):
        with pytest.raises(errors.PaymentNotConfigured) as missing:
            create_payment_processor(method)
        assert missing.value.status == 503
    assert CashPayment.is_available() is True
    assert StripePayment.is_available() is False and MercadoPagoPayment.is_available() is False


def test_the_domain_never_imports_the_sdks():
    for module in (payment_factory, payment_service):
        source = inspect.getsource(module)
        assert "import stripe" not in source and "import mercadopago" not in source
    assert "import stripe" in inspect.getsource(stripe_adapter)
    assert "import mercadopago" in inspect.getsource(mercadopago_adapter)


def test_cash_charges_nothing_and_leaves_the_order_waiting():
    result = CashPayment().charge(Decimal("640.00"), ChargeRequest(order_id=7, idempotency_key="k" * 8, description="x"))
    assert (result.method, result.status, result.amount, result.checkout_id) == ("cash", PaymentStatus.PENDING, Decimal("640.00"), "")
    assert CashPayment.pays_at_the_store is True and StripePayment.pays_at_the_store is False


def test_online_payments_delegate_in_their_adapter():
    adapter = FakeAdapter()
    request = ChargeRequest(order_id=7, idempotency_key="llave-0001", description="Pedido 7")
    result = StripePayment(adapter).charge(Decimal("640.00"), request)
    assert adapter.calls == [(Decimal("640.00"), request)] and result.checkout_id == "pi_123"


def test_the_charge_is_audited_with_the_order_but_no_secrets(caplog):
    request = ChargeRequest(order_id=7, idempotency_key="llave-secreta-0001", description="Pedido 7")
    with caplog.at_level(logging.INFO, logger="core_pasteleria.audit"):
        StripePayment(FakeAdapter()).charge(Decimal("640.00"), request)
    record = next(r for r in caplog.records if r.operation.endswith("BasePayment.charge"))
    assert (record.result, record.order_id, record.method, record.status) == ("ok", 7, "stripe", "pending")
    text = record.getMessage()
    assert "secret" not in text and "llave-secreta" not in text and "640" not in text


def test_a_gateway_failure_is_audited_as_an_error(caplog):
    class Down(FakeAdapter):
        def create_checkout(self, amount, request):
            raise errors.PaymentGatewayError("stripe")

    with caplog.at_level(logging.INFO, logger="core_pasteleria.audit"), pytest.raises(errors.PaymentGatewayError):
        StripePayment(Down()).charge(Decimal("1.00"), ChargeRequest(order_id=7, idempotency_key="k" * 8, description="x"))
    record = next(r for r in caplog.records if r.operation.endswith("BasePayment.charge"))
    assert record.levelno == logging.ERROR and record.result == "PaymentGatewayError"
