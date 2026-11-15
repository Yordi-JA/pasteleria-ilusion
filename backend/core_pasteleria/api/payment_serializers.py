"""Entrada y salida de los pagos (D68). Montos, estado y llaves son de solo lectura: el cliente solo elige el método."""
from rest_framework import serializers

from ..models import PaymentMethod, PaymentStatus
from .serializers import OrderSerializer, money


class PaymentStartSerializer(serializers.Serializer):
    method = serializers.ChoiceField(
        choices=PaymentMethod.choices,
        help_text="`mercadopago` (Checkout Pro), `stripe` (tarjeta con Stripe Elements) o `cash` (en la pastelería).",
    )


class PaymentSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    status = serializers.ChoiceField(
        choices=PaymentStatus.choices,
        help_text=(
            "`pending`: iniciado, sin confirmar (en efectivo, hasta que la pastelería registre el cobro). "
            "`succeeded`: la pasarela lo confirmó por webhook o la pastelería registró el efectivo. `failed`: la "
            "pasarela lo rechazó; el pedido sigue apartado y se puede volver a pagar. `refund_required`: se cobró, pero "
            "el pedido ya no estaba vigente o el monto no coincidía; la pastelería lo reembolsa."
        ),
    )
    amount = money(help_text="Lo que se cobra: `pay_today` del pedido.")
    currency = serializers.CharField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class StartedPaymentSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="payment.id")
    method = serializers.CharField(source="payment.method")
    status = serializers.CharField(source="payment.status")
    amount = money(source="payment.amount")
    currency = serializers.CharField(source="payment.currency")
    redirect_url = serializers.SerializerMethodField(
        help_text="Mercado Pago: la página de Checkout Pro a la que se redirige al cliente; `null` en los demás."
    )
    client_secret = serializers.SerializerMethodField(
        help_text="Stripe: el `client_secret` del PaymentIntent para `stripe.confirmCardPayment`; `null` en los demás."
    )
    order = OrderSerializer(help_text="El pedido con su desglose (`payment`) y su plazo (`payment_due_at`).")

    def get_redirect_url(self, started) -> str | None:
        return started.result.redirect_url or None

    def get_client_secret(self, started) -> str | None:
        return started.result.client_secret or None


class PaymentMethodSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    available = serializers.BooleanField(help_text="`false` si faltan las llaves de esa pasarela: el método responde 503.")


class PaymentStateSerializer(serializers.Serializer):
    order = OrderSerializer()
    methods = PaymentMethodSerializer(many=True, help_text="Los tres métodos, en orden, con su disponibilidad.")
    latest_payment = PaymentSerializer(source="latest", allow_null=True, help_text="El último intento; `null` sin ninguno.")


class WebhookAckSerializer(serializers.Serializer):
    received = serializers.BooleanField()
