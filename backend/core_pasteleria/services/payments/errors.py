"""Errores de los pagos (D68). `status`, `code` y `message` los usa la API, como los del acceso con Google (D62)."""
import re
from enum import StrEnum

from ...models import PaymentMethod


class PaymentError(Exception):
    status = 400
    code = "payment_error"
    message = "No pudimos iniciar el pago. Inténtalo de nuevo."

    def __init__(self, message: str | None = None):
        if message is not None:
            self.message = message
        super().__init__(self.code)


def _label(method: str) -> str:
    return PaymentMethod(method).label if method in PaymentMethod.values else method


class UnknownPaymentMethod(PaymentError):
    code = "unknown_method"
    message = "Ese método de pago no existe."


class PaymentNotConfigured(PaymentError):
    """Faltan las llaves de esa pasarela en el entorno: ese método no se ofrece y el resto del sitio sigue."""

    status = 503
    code = "method_unavailable"

    def __init__(self, method: str):
        super().__init__(f"Por ahora no podemos cobrar con {_label(method)}. Elige otro método de pago.")


class PaymentGatewayError(PaymentError):
    """La pasarela no respondió o respondió con un error."""

    status = 502
    code = "gateway_error"

    def __init__(self, method: str):
        super().__init__(f"No pudimos conectar con {_label(method)}. Inténtalo de nuevo en unos minutos.")


class SignatureRejection(StrEnum):
    """Por qué se rechazó la firma de un webhook, para el registro."""

    MISSING = "missing"
    MALFORMED = "malformed"
    MISMATCH = "mismatch"
    # `ts` fuera de la ventana de 300 s.
    STALE = "stale"
    # Firma válida sobre un cuerpo que no es JSON.
    BAD_BODY = "bad_body"
    UNKNOWN = "unknown"


# Lo que se acepta registrar de una petición sin verificar (el `x-request-id` o el `id` del evento); lo demás se omite,
# así un valor del atacante no mete saltos de línea ni texto en el registro.
SAFE_REFERENCE = re.compile(r"[A-Za-z0-9_.:-]{1,64}")


class InvalidNotification(PaymentError):
    """El webhook no trae una firma válida y reciente: no se cambia nada.

    `reason` y `reference` son solo para el registro: nunca la firma, el secreto ni el cuerpo.
    """

    code = "invalid_signature"
    message = "La firma de la notificación no es válida."

    def __init__(self, reason: SignatureRejection = SignatureRejection.UNKNOWN, reference: object = ""):
        super().__init__()
        self.reason = reason
        self.reference = reference if isinstance(reference, str) and SAFE_REFERENCE.fullmatch(reference) else ""


class OrderNotFound(PaymentError):
    status = 404
    code = "not_found"
    message = "No encontrado."


class OrderNotPayable(PaymentError):
    status = 409
    code = "order_not_payable"
    message = "Este pedido ya no espera pago."


class OrderExpired(PaymentError):
    status = 409
    code = "order_expired"
    message = "Este pedido venció sin pagarse. Vuelve a hacer tu pedido."


class KeyReusedWithAnotherMethod(PaymentError):
    status = 409
    code = "idempotency_conflict"
    message = "Esa llave ya se usó con otro método de pago. Usa una llave nueva para cambiar de método."
