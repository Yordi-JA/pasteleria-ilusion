"""Formato interno de los pagos (D68): lo que entra a una pasarela y lo que sale de ella, ya sin la forma de su SDK.

- `ChargeRequest`: el `payload` de `BasePayment.charge`. Solo ids, textos que arma el servidor y las URL del sitio;
  nunca datos de tarjeta ni datos personales.
- `PaymentResult`: lo que devuelve `charge` (y `resume` en un reintento con la misma llave).
- `WebhookRequest`: la petición de un webhook, con el cuerpo crudo para verificar la firma antes de leerlo.
- `PaymentNotice`: lo que la pasarela confirma de un pago, después de verificar la firma.
"""
import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

CURRENCY = "MXN"
CENT = Decimal("0.01")


@dataclass(frozen=True)
class ChargeRequest:
    order_id: int
    idempotency_key: str
    description: str
    # `/pedido/pago` del sitio, a donde regresa el cliente desde Checkout Pro.
    back_url: str = ""
    # El webhook de la pasarela.
    notification_url: str = ""
    # Hasta cuándo se puede pagar (el `payment_due_at` del pedido).
    expires_at: datetime | None = None
    currency: str = CURRENCY

    @property
    def provider_idempotency_key(self) -> str:
        """La llave que va a la pasarela: la del cliente atada al pedido, porque la de la pasarela es de toda la cuenta.
        64 caracteres hexadecimales (el máximo de Mercado Pago)."""
        return hashlib.sha256(f"pedido:{self.order_id}:{self.idempotency_key}".encode()).hexdigest()


@dataclass(frozen=True)
class PaymentResult:
    """El cobro que quedó iniciado. `client_secret` es solo para el navegador: no se guarda ni se registra."""

    order_id: int
    method: str
    status: str
    amount: Decimal
    currency: str = CURRENCY
    # La preferencia de Mercado Pago o el PaymentIntent de Stripe; vacío en efectivo.
    checkout_id: str = ""
    # Checkout Pro: la URL a la que se redirige al cliente.
    redirect_url: str = ""
    # Stripe Elements: con él, el navegador confirma el pago directo con Stripe.
    client_secret: str = field(default="", repr=False)


@dataclass(frozen=True)
class WebhookRequest:
    body: bytes
    # Encabezados con el nombre en minúsculas.
    headers: Mapping[str, str]
    query: Mapping[str, str]

    def json(self) -> dict:
        """El cuerpo como JSON; `{}` si no lo es. Solo después de verificar la firma (antes, solo para leer el `id` que
        se registra al rechazarla, sin confiar en él)."""
        try:
            value = json.loads(self.body or b"{}")
        except ValueError:
            return {}
        return value if isinstance(value, dict) else {}


@dataclass(frozen=True)
class PaymentNotice:
    """Un pago que la pasarela dio por aprobado (`succeeded`) o rechazado (`failed`)."""

    method: str
    outcome: str
    order_id: int | None
    provider_payment_id: str
    checkout_id: str
    amount: Decimal | None
    currency: str
