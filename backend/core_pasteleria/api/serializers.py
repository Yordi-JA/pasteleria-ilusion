"""DTOs: validan la entrada y dan forma a la salida JSON."""
from rest_framework import serializers

from ..models import Bread, CakeType
from ..services.pricing_service import CakeDesignChoice

# El mismo largo que el `slug` de las opciones (`Bread`, `FillingBase`, ...).
SLUG_MAX_LENGTH = Bread._meta.get_field("slug").max_length
# Tope técnico del tamaño de la petición. El máximo real de sabores es el de la
# base (`FillingBase.max_flavors`) y lo aplica el servicio con su mensaje.
MAX_FLAVORS_IN_REQUEST = 5
# Tope técnico de los kilos. El rango de la regla (4 a 50 kg al inicio) vive en
# `CakeDesignSettings` y lo aplica el servicio con su mensaje, también por abajo.
MAX_KG_IN_REQUEST = 1000


def money(**kwargs):
    return serializers.DecimalField(max_digits=10, decimal_places=2, **kwargs)


def money_by_cake_type(help_text):
    return serializers.DictField(child=money(), help_text=help_text)


def reasons_by_cake_type():
    return serializers.DictField(
        child=serializers.CharField(),
        help_text="Motivo por cada tipo de pastel en que la opción no se ofrece.",
    )


def cake_types():
    return serializers.ListField(
        child=serializers.CharField(),
        help_text="Tipos de pastel (`cake_types[].value`) en que la opción se ofrece.",
    )


# --- Opciones de "Diseña tu pastel" (salida) ---


class CakeTypeSerializer(serializers.Serializer):
    # Texto en la salida: así el esquema tiene un solo enum de tipos, el de
    # `cake_type` en la petición del precio.
    value = serializers.CharField()
    label = serializers.CharField()


class BreadOptionSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    name = serializers.CharField()
    description = serializers.CharField()
    pricing_mode = serializers.CharField()
    price_per_kg = money(help_text="Incremento por kilo o precio completo, según `pricing_mode`.")
    included_filling = serializers.CharField(help_text="Vacío si el pan lleva relleno aparte.")
    preview_color = serializers.CharField()
    allowed_cake_types = cake_types()
    unavailable_reasons = reasons_by_cake_type()
    price_per_kg_from = money_by_cake_type(
        "Precio por kilo que se muestra en el paso del pan, por tipo de pastel: relleno "
        "más barato del tipo elegido + incremento del pan, o el precio completo."
    )


class FillingFlavorOptionSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    name = serializers.CharField()
    preview_color = serializers.CharField()
    is_combinable = serializers.BooleanField()
    allowed_cake_types = cake_types()
    unavailable_reasons = reasons_by_cake_type()
    price_per_kg_by_cake_type = money_by_cake_type(
        "Precio propio por kilo en esta base, por tipo de pastel; vacío si usa el de la base."
    )


class FillingBaseOptionSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    name = serializers.CharField()
    description = serializers.CharField()
    preview_color = serializers.CharField()
    max_flavors = serializers.IntegerField()
    combined_extra_per_kg = money()
    allowed_cake_types = cake_types()
    unavailable_reasons = reasons_by_cake_type()
    price_per_kg_by_cake_type = money_by_cake_type("Precio general por kilo, por tipo de pastel.")
    flavors = FillingFlavorOptionSerializer(many=True)


class CoverageColorSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    name = serializers.CharField()
    preview_color = serializers.CharField()


class DecorationOptionSerializer(serializers.Serializer):
    """La decoración no depende del tipo de pastel: su disponibilidad es una sola."""

    slug = serializers.SlugField()
    name = serializers.CharField()
    description = serializers.CharField()
    pricing = serializers.CharField()
    price = money(allow_null=True)
    price_pending = serializers.BooleanField(
        help_text="Precio fijo aún no definido (PENDIENTE): no se puede elegir."
    )
    requires_quote = serializers.BooleanField()
    available = serializers.BooleanField()
    unavailable_reason = serializers.CharField(allow_null=True)


class CakeDesignLimitsSerializer(serializers.Serializer):
    people_per_kg = serializers.IntegerField()
    min_custom_kg = serializers.IntegerField()
    max_online_kg = serializers.IntegerField()
    wafer_price = money()
    wafer_max_width_cm = serializers.DecimalField(max_digits=4, decimal_places=1)
    wafer_max_height_cm = serializers.DecimalField(max_digits=4, decimal_places=1)
    message_suggested_max_words = serializers.IntegerField()


class TierRecommendationSerializer(serializers.Serializer):
    tiers = serializers.IntegerField()
    recommended_min_kg = serializers.IntegerField()
    recommended_max_kg = serializers.IntegerField(allow_null=True)


class CakeDesignOptionsSerializer(serializers.Serializer):
    cake_types = CakeTypeSerializer(many=True)
    breads = BreadOptionSerializer(many=True)
    filling_bases = FillingBaseOptionSerializer(many=True)
    coverage_colors = CoverageColorSerializer(many=True)
    decorations = DecorationOptionSerializer(many=True)
    limits = CakeDesignLimitsSerializer()
    tier_recommendations = TierRecommendationSerializer(many=True)


# --- Precio (entrada y salida) ---


class CakeDesignPriceRequestSerializer(serializers.Serializer):
    """Elecciones del cliente. Cualquier monto que mande se ignora: el servidor lo calcula.

    Forma y pisos no cambian el precio: no se piden aquí, y si llegan se ignoran
    como cualquier otra clave. Se validarán cuando exista `CakeDesign`.
    """

    kg = serializers.IntegerField(
        max_value=MAX_KG_IN_REQUEST,
        error_messages={
            "invalid": "Los kilos van en números enteros.",
            "max_value": "Son demasiados kilos para pedir en línea. Escríbenos por WhatsApp.",
        },
    )
    cake_type = serializers.ChoiceField(choices=CakeType.choices)
    bread = serializers.SlugField(max_length=SLUG_MAX_LENGTH)
    filling_base = serializers.SlugField(
        max_length=SLUG_MAX_LENGTH, required=False, allow_null=True,
        help_text="Se omite con un pan de relleno incluido.",
    )
    filling_flavors = serializers.ListField(
        child=serializers.SlugField(max_length=SLUG_MAX_LENGTH),
        max_length=MAX_FLAVORS_IN_REQUEST,
        required=False,
        default=list,
    )
    decoration = serializers.SlugField(
        max_length=SLUG_MAX_LENGTH, required=False, allow_null=True,
        help_text="Sin elegir, no suma nada.",
    )
    wafer = serializers.BooleanField(required=False, default=False)

    def to_choice(self) -> CakeDesignChoice:
        data = self.validated_data
        return CakeDesignChoice(
            kg=data["kg"],
            cake_type=data["cake_type"],
            bread=data["bread"],
            filling_base=data.get("filling_base"),
            filling_flavors=tuple(data["filling_flavors"]),
            decoration=data.get("decoration"),
            wafer=data["wafer"],
        )


class StandDepositSerializer(serializers.Serializer):
    """Base que toca al pedido; `null` si los kilos no llevan base."""

    min_kg = serializers.IntegerField(source="stand.min_kg")
    max_kg = serializers.IntegerField(source="stand.max_kg")
    deposit = money(help_text="Se cobra aparte del pedido y se devuelve al regresar la base.")

    def to_representation(self, instance):
        return None if instance.stand is None else super().to_representation(instance)


class CakeDesignPriceSerializer(serializers.Serializer):
    price_per_kg = money(source="breakdown.price_per_kg")
    kg = serializers.IntegerField(source="breakdown.kg")
    cake_subtotal = money(source="breakdown.cake_subtotal")
    wafer = money(source="breakdown.wafer")
    decoration = money(
        source="breakdown.decoration", help_text="Con una decoración por cotizar es 0: no se suma."
    )
    total = money(source="breakdown.total", help_text="Sin el depósito de la base, que va aparte.")
    requires_quote = serializers.BooleanField(
        source="breakdown.requires_quote",
        help_text="La decoración la cotiza la pastelería; el pedido queda en pausa hasta entonces.",
    )
    stand = StandDepositSerializer(source="stand_deposit", allow_null=True)
