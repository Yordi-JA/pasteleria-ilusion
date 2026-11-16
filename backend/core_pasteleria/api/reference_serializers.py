"""Entrada y salida del envío de referencia y de la cancelación por el cliente (D70).

Precio, nota, estados y montos son de solo lectura: el cliente solo manda sus fotos y sus datos, y al aceptar, el lapso
y quién recoge.
"""
import unicodedata

from django.conf import settings
from rest_framework import serializers

from ..models import (
    REFERENCE_TEXT_MAX_LENGTH,
    CakeType,
    Occasion,
    OrderStatus,
    PaymentMethod,
    ReferenceRequestStatus,
)
from ..services.orders.order_service import MAX_ORDER_AMOUNT
from ..services.orders.reference_service import QuoteAcceptance, ReferenceSubmission
from ..services.text_rules import FORBIDDEN_NAME_CATEGORIES, has_excess_combining_marks
from .auth_serializers import StrictCharField
from .serializers import (
    MAX_FLAVORS_IN_REQUEST,
    MAX_PEOPLE_IN_REQUEST,
    SLUG_MAX_LENGTH,
    OrderCreateSerializer,
    OrderSerializer,
    OrderStandSerializer,
    money,
)

UNSAFE_DESCRIPTION_MESSAGE = "Tu descripción lleva caracteres que no se pueden mostrar."
# En la descripción se aceptan saltos de línea; lo demás de `FORBIDDEN_NAME_CATEGORIES` no.
ALLOWED_CONTROLS = frozenset({"\n"})


class OrderCancelSerializer(serializers.Serializer):
    """El estado que el cliente vio en la vista previa: si el pedido ya cambió, no se cancela (409 `stale_preview`)."""

    expected_status = serializers.ChoiceField(
        choices=OrderStatus.choices,
        error_messages={"required": "Falta el estado que viste del pedido.", "invalid_choice": "Estado no válido."},
    )


class ReferenceRequestCreateSerializer(serializers.Serializer):
    """La solicitud que manda el formulario "Envía tu referencia". No se cobra nada."""

    image_ids = serializers.ListField(
        child=serializers.UUIDField(error_messages={"invalid": "Esa foto no existe."}),
        allow_empty=False,
        # El tope duro; el del admin (`UploadSettings.max_reference_images`) lo revisa el servicio.
        max_length=settings.UPLOAD_HARD_LIMIT_IMAGES,
        help_text=(
            "Los ids de las fotos subidas con `POST customer-images/` y `purpose=reference`, de 1 a "
            "`UploadSettings.max_reference_images` (hoy 3)."
        ),
        error_messages={
            "empty": "Sube al menos una foto de referencia.",
            "max_length": f"Puedes mandar hasta {settings.UPLOAD_HARD_LIMIT_IMAGES} fotos.",
            "not_a_list": "Las fotos van en una lista.",
        },
    )
    description = StrictCharField(
        max_length=REFERENCE_TEXT_MAX_LENGTH,
        help_text="¿Qué quieres que tomemos de la foto? Hasta 1000 caracteres; acepta saltos de línea.",
        error_messages={
            "blank": "Cuéntanos qué quieres que tomemos de la foto.",
            "required": "Cuéntanos qué quieres que tomemos de la foto.",
            "max_length": f"Escribe la descripción en {REFERENCE_TEXT_MAX_LENGTH} caracteres o menos.",
        },
    )
    occasion = serializers.ChoiceField(
        choices=Occasion.choices,
        required=False,
        allow_blank=True,
        default="",
        help_text="Opcional (regla 6.4).",
        error_messages={"invalid_choice": "Elige una ocasión de la lista."},
    )
    people = serializers.IntegerField(
        min_value=1,
        max_value=MAX_PEOPLE_IN_REQUEST,
        error_messages={
            "required": "Indica para cuántas personas es.",
            "invalid": "Escribe cuántas personas, con número.",
            "min_value": "Indica para cuántas personas es.",
            "max_value": "Para tantas personas, escríbenos por WhatsApp.",
        },
    )
    # El sabor (D70, decisión del usuario del 15 de noviembre de 2026): las opciones de `GET cake-designs/options/`,
    # revisadas como en los pasos 2 a 4 (regla 4.7).
    cake_type = serializers.ChoiceField(
        choices=CakeType.choices,
        help_text="El tipo de pastel (paso 2): el pan y el relleno se ofrecen según el tipo (regla 4.7).",
        error_messages={
            "required": "Elige el tipo de pastel.",
            "null": "Elige el tipo de pastel.",
            "invalid_choice": "Elige un tipo de pastel de la lista.",
        },
    )
    bread = serializers.SlugField(
        max_length=SLUG_MAX_LENGTH,
        help_text="El `slug` del pan (paso 3).",
        error_messages={"required": "Elige el pan.", "null": "Elige el pan.", "blank": "Elige el pan."},
    )
    filling_base = serializers.SlugField(
        max_length=SLUG_MAX_LENGTH,
        required=False,
        allow_null=True,
        default=None,
        help_text="El `slug` de la base del relleno (paso 4); `null` con un pan de relleno incluido.",
    )
    filling_flavors = serializers.ListField(
        child=serializers.SlugField(max_length=SLUG_MAX_LENGTH),
        max_length=MAX_FLAVORS_IN_REQUEST,
        required=False,
        default=list,
        help_text="Los `slug` de los sabores: uno, o dos con la base Normal; vacía con un pan de relleno incluido.",
        error_messages={"not_a_list": "Los sabores van en una lista."},
    )
    event_date = serializers.DateField(
        help_text="Fecha del evento, AAAA-MM-DD: con al menos `custom_lead_days` (2) días de anticipación.",
        error_messages={"required": "Elige la fecha del evento.", "invalid": "Escribe la fecha como AAAA-MM-DD."},
    )
    budget = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0,
        max_value=MAX_ORDER_AMOUNT,
        required=False,
        allow_null=True,
        default=None,
        help_text="Presupuesto aproximado, opcional. No cambia nada: le sirve a la pastelería.",
        error_messages={"invalid": "Escribe el presupuesto con número.", "min_value": "El presupuesto no puede ser negativo."},
    )

    def validate_description(self, value):
        text = value.replace("\r\n", "\n").replace("\r", "\n")
        unsafe = any(
            unicodedata.category(char) in FORBIDDEN_NAME_CATEGORIES and char not in ALLOWED_CONTROLS for char in text
        )
        if unsafe or has_excess_combining_marks(text):
            raise serializers.ValidationError(UNSAFE_DESCRIPTION_MESSAGE)
        return text

    def to_submission(self, idempotency_key: str) -> ReferenceSubmission:
        data = self.validated_data
        return ReferenceSubmission(
            idempotency_key=idempotency_key,
            description=data["description"],
            occasion=data["occasion"],
            people=data["people"],
            event_date=data["event_date"],
            budget=data["budget"],
            image_ids=tuple(data["image_ids"]),
            cake_type=data["cake_type"],
            bread=data["bread"],
            filling_base=data["filling_base"],
            filling_flavors=tuple(data["filling_flavors"]),
        )


class QuoteAcceptSerializer(OrderCreateSerializer):
    """Aceptar la cotización: el lapso del día del evento y quién recoge, con las reglas de `POST orders/`."""

    fulfillment = None
    items = None
    delivery_date = serializers.DateField(
        required=False,
        help_text="Opcional: si llega, debe ser la fecha del evento (la pantalla de entrega la manda fija).",
        error_messages={"invalid": "Escribe la fecha como AAAA-MM-DD."},
    )

    def to_acceptance(self, idempotency_key: str) -> QuoteAcceptance:
        data = self.validated_data
        return QuoteAcceptance(
            idempotency_key=idempotency_key,
            slot_starts_at=data["slot_starts_at"],
            pickup_name=data["pickup_name"],
            pickup_phone=data["pickup_phone"],
            delivery_date=data.get("delivery_date"),
        )


class ReferenceImageSerializer(serializers.Serializer):
    id = serializers.UUIDField(help_text="Se ve con `GET customer-images/<id>/` (solo el dueño).")
    original_name = serializers.CharField()
    width = serializers.IntegerField()
    height = serializers.IntegerField()


class ReferenceQuoteSerializer(serializers.Serializer):
    """La cotización de la pastelería; `null` mientras la solicitud está en revisión."""

    price = money(source="request.quoted_price", help_text="El precio del pastel según la referencia (el total).")
    note = serializers.CharField(source="request.quote_note", help_text="La nota de la pastelería; puede venir vacía.")
    quoted_at = serializers.DateTimeField(source="request.quoted_at")
    expires_at = serializers.DateTimeField(
        allow_null=True,
        help_text="Hasta cuándo se acepta; `null` mientras la vigencia siga PENDIENTE (no vence).",
    )
    expired = serializers.BooleanField(help_text="Ya no se puede aceptar: venció su vigencia.")
    validity_pending = serializers.BooleanField(
        help_text="La pastelería no ha fijado la vigencia (PENDIENTE): la pantalla muestra el marcador."
    )
    advance_percent = serializers.IntegerField(help_text="El anticipo de siempre (`PolicySettings.advance_percent`).")
    advance = money(help_text="El anticipo del precio cotizado.")
    stand_deposit = money(
        help_text="El depósito de la base (la de la solicitud, `stand`), aparte del precio y completo; 0 sin base."
    )
    pay_today = money(help_text="Lo que se paga al aceptar: el anticipo más el depósito completo de la base.")
    pay_on_delivery = money(help_text="El resto del precio cotizado, el día de la entrega.")

    def to_representation(self, instance):
        return super().to_representation(instance) if instance.request.quoted_price is not None else None


class ReferenceRequestSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="request.id", help_text='El número de la solicitud: "Solicitud #<id>".')
    status = serializers.ChoiceField(
        source="request.status",
        choices=ReferenceRequestStatus.choices,
        help_text=(
            "`in_review` (En revisión), `quote_ready` (Cotización lista), `accepted` (ya es el pedido `order_id`) o "
            "`cancelled`."
        ),
    )
    status_label = serializers.SerializerMethodField()
    status_changed_at = serializers.DateTimeField(source="request.status_changed_at")
    created_at = serializers.DateTimeField(source="request.created_at", help_text="Enviada el.")
    description = serializers.CharField(source="request.description")
    occasion = serializers.CharField(source="request.occasion", allow_blank=True, help_text="Vacía si no la eligió.")
    occasion_label = serializers.SerializerMethodField()
    people = serializers.IntegerField(source="request.people")
    # El sabor y la base (D70): los mismos campos que el pastel de la línea `reference` del pedido.
    kg = serializers.IntegerField(
        source="request.cake.kg",
        allow_null=True,
        help_text="Salen de las personas (regla 3.1); `null` en solicitudes viejas.",
    )
    cake_type = serializers.ChoiceField(
        source="request.cake.cake_type", choices=[("", ""), *CakeType.choices], allow_blank=True
    )
    cake_type_label = serializers.SerializerMethodField()
    bread = serializers.SlugField(source="request.cake.bread", allow_null=True)
    bread_name = serializers.CharField(source="request.cake.bread_name", allow_null=True)
    filling_base = serializers.SlugField(source="request.cake.filling_base", allow_null=True)
    filling_base_name = serializers.CharField(
        source="request.cake.filling_base_name", allow_null=True, help_text="`null` con un pan de relleno incluido."
    )
    filling_flavors = serializers.ListField(source="request.cake.filling_flavors", child=serializers.SlugField())
    filling_flavor_names = serializers.ListField(
        source="request.cake.filling_flavor_names", child=serializers.CharField()
    )
    stand = OrderStandSerializer(
        source="request.cake",
        allow_null=True,
        help_text="La base que toca a los kilos (regla 7), con su depósito; `null` si no lleva base.",
    )
    event_date = serializers.DateField(source="request.event_date")
    budget = money(source="request.budget", allow_null=True)
    images = ReferenceImageSerializer(source="request.images", many=True)
    quote = ReferenceQuoteSerializer(source="*", allow_null=True)
    order_id = serializers.IntegerField(
        source="request.order_id", allow_null=True, help_text="El pedido que nació al aceptar; `null` antes."
    )

    def get_status_label(self, view) -> str:
        return ReferenceRequestStatus(view.request.status).label

    def get_occasion_label(self, view) -> str | None:
        return Occasion(view.request.occasion).label if view.request.occasion else None

    def get_cake_type_label(self, view) -> str | None:
        cake_type = view.request.cake.cake_type
        return CakeType(cake_type).label if cake_type else None


class CancellationSerializer(serializers.Serializer):
    """Lo que pasa si el cliente cancela ahora (D70)."""

    order_id = serializers.IntegerField()
    status = serializers.ChoiceField(choices=OrderStatus.choices, help_text="El estado del pedido ahora.")
    cancellable = serializers.BooleanField()
    reason = serializers.CharField(
        allow_null=True,
        help_text="`null` si se puede; si no, `not_cancellable` (ya se entregó) o `already_cancelled`.",
    )
    message = serializers.CharField(allow_null=True, help_text="El motivo en español, listo para mostrarse.")
    paid = money(help_text="Lo que el cliente pagó; 0 sin pagar.")
    paid_with = serializers.ChoiceField(
        choices=[("", ""), *PaymentMethod.choices], allow_blank=True, help_text="El método del pago; vacío sin pagar."
    )
    order_total = money(help_text="El total del pedido sin el depósito de la base.")
    retention_percent = serializers.IntegerField(
        help_text="Lo que retiene la pastelería de `order_total` (`customer_cancel_retention_percent`); 0 sin pagar."
    )
    retained = money(help_text="Lo que se retiene, nunca más de lo pagado.")
    refund = money(help_text="Lo que se devuelve: lo pagado menos lo retenido, nunca menos de 0.")


class CancelledOrderSerializer(serializers.Serializer):
    order = OrderSerializer()
    cancellation = CancellationSerializer(source="quote")
