"""SDK simulados de Mercado Pago y Stripe para las pruebas de pagos (D68): nada sale a la red.

Se sustituyen en el límite del SDK (`mercadopago.SDK` y `stripe.StripeClient`), así las pruebas recorren también la
traducción de cada adaptador. La firma de los webhooks es real: se calcula con la clave de prueba.
"""
import hashlib
import hmac
import json
import time

import pytest
import stripe

from core_pasteleria.services.payments import mercadopago_adapter, stripe_adapter

MP_TOKEN = "TEST-token-de-prueba"
MP_SECRET = "clave-secreta-de-prueba"
STRIPE_KEY = "sk_test_de_prueba"
STRIPE_WEBHOOK = "whsec_de_prueba"


class FakeMercadoPago:
    """Lo que se usa del SDK: `preference().create` y `payment().get`."""

    def __init__(self):
        self.preferences = []
        self.payments: dict[str, dict] = {}
        self.fail = False

    def __call__(self, access_token):
        return self

    def preference(self):
        return self

    def payment(self):
        return _PaymentResource(self)

    def create(self, preference, request_options=None):
        if self.fail:
            return {"status": 500, "response": {"message": "internal_error"}}
        self.preferences.append((preference, request_options))
        number = len(self.preferences)
        return {
            "status": 201,
            "response": {"id": f"pref-{number}", "init_point": f"https://www.mercadopago.com.mx/checkout?pref=pref-{number}"},
        }


class _PaymentResource:
    def __init__(self, fake):
        self._fake = fake

    def get(self, payment_id, request_options=None):
        payment = self._fake.payments.get(str(payment_id))
        return {"status": 200, "response": payment} if payment else {"status": 404, "response": {"message": "not_found"}}


class _Intents:
    def __init__(self, fake):
        self._fake = fake

    def create(self, params, options=None):
        if self._fake.fail:
            raise stripe.APIConnectionError("sin red")
        self._fake.created.append((params, options))
        intent_id = f"pi_{len(self._fake.created)}"
        intent = {
            "id": intent_id, "amount": params["amount"], "currency": params["currency"],
            "client_secret": f"{intent_id}_secret_abc", "metadata": params["metadata"],
        }
        self._fake.intents[intent_id] = intent
        return intent

    def retrieve(self, intent_id, params=None, options=None):
        self._fake.retrieved.append(intent_id)
        return self._fake.intents[intent_id]

    def cancel(self, intent_id, params=None, options=None):
        if self._fake.cancel_error is not None:
            raise self._fake.cancel_error
        self._fake.cancelled.append((intent_id, params))
        return {**self._fake.intents[intent_id], "status": "canceled"}


class FakeStripe:
    def __init__(self):
        self.created = []
        self.retrieved = []
        self.cancelled = []
        self.intents = {}
        self.fail = False
        # El error de Stripe al cancelar (un PaymentIntent ya cobrado, sin red); `None`: cancela.
        self.cancel_error = None

    def __call__(self, api_key, **kwargs):
        self.v1 = type("V1", (), {"payment_intents": _Intents(self)})()
        return self


@pytest.fixture
def gateways(settings, monkeypatch):
    """Las dos pasarelas configuradas y simuladas."""
    settings.MERCADOPAGO_ACCESS_TOKEN, settings.MERCADOPAGO_WEBHOOK_SECRET = MP_TOKEN, MP_SECRET
    settings.STRIPE_SECRET_KEY, settings.STRIPE_WEBHOOK_SECRET = STRIPE_KEY, STRIPE_WEBHOOK
    fakes = type("Gateways", (), {"mercadopago": FakeMercadoPago(), "stripe": FakeStripe()})()
    monkeypatch.setattr(mercadopago_adapter.mercadopago, "SDK", fakes.mercadopago)
    monkeypatch.setattr(stripe_adapter.stripe, "StripeClient", fakes.stripe)
    return fakes


def mercadopago_headers(data_id: str, *, secret: str = MP_SECRET, ts: int | None = None, request_id: str = "req-1"):
    """`x-signature` real: HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`."""
    ts = int(time.time()) if ts is None else ts
    manifest = f"id:{data_id};request-id:{request_id};ts:{ts};"
    v1 = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return {"HTTP_X_SIGNATURE": f"ts={ts},v1={v1}", "HTTP_X_REQUEST_ID": request_id}


def stripe_event(event_type: str, intent: dict, *, event_id: str = "evt_1") -> bytes:
    return json.dumps(
        {"id": event_id, "object": "event", "type": event_type, "data": {"object": {"object": "payment_intent", **intent}}}
    ).encode()


def stripe_headers(payload: bytes, *, secret: str = STRIPE_WEBHOOK, ts: int | None = None):
    ts = int(time.time()) if ts is None else ts
    signature = hmac.new(secret.encode(), f"{ts}.{payload.decode()}".encode(), hashlib.sha256).hexdigest()
    return {"HTTP_STRIPE_SIGNATURE": f"t={ts},v1={signature}"}
