"""DTOs: validan la entrada y dan forma a la salida JSON."""
import re

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.validators import ProhibitSurrogateCharactersValidator

from ..models import (
    Bread,
    CakeDesignSize,
    CakeShape,
    CakeType,
    CustomerImagePurpose,
    FruitKind,
    FruitLayout,
    Fulfillment,
    MessageArrangement,
    MessageColorMode,
    Occasion,
    OrderLineKind,
    OrderStatus,
    PaymentMethod,
    Presentation,
    Product,
    ProductCategory,
    SalesChannel,
    SampleDrizzle,
    SampleShells,
    SampleSideBits,
    SampleSideTexture,
    StandLoanStatus,
    WaferShape,
)
from ..services import catalog_service, design_layout, pricing_service, warranty_service
from ..services.design_layout import MessageLayout, WaferLayout
from ..services.text_rules import has_forbidden_name_characters
from ..services.orders import note_service, schedule_service
from ..services.orders.order_lines import DesignRequest, LineRequest
from ..services.orders.order_service import OrderRequest
from ..services.pricing_service import CakeDesignChoice
from .auth_serializers import PHONE_ERROR, PHONE_SEPARATORS, StrictCharField

# El mismo largo que el `slug` de las opciones (`Bread`, `FillingBase`, ...).
SLUG_MAX_LENGTH = Bread._meta.get_field("slug").max_length
# Tope técnico del tamaño de la petición. El máximo real de sabores es el de la
# base (`FillingBase.max_flavors`) y lo aplica el servicio con su mensaje.
MAX_FLAVORS_IN_REQUEST = 5
# Tope técnico de las personas, como el de los kilos: el máximo real lo aplica el servicio.
MAX_PEOPLE_IN_REQUEST = 10000
# Tope técnico de los kilos. El rango de la regla (4 a 50 kg al inicio) vive en
# `CakeDesignSettings` y lo aplica el servicio con su mensaje, también por abajo.
MAX_KG_IN_REQUEST = 1000
# Tope técnico de los pisos: el máximo real es el de la tabla de kilos mínimos y lo aplica el servicio.
MAX_TIERS_IN_REQUEST = 20


def money(**kwargs):
    return serializers.DecimalField(max_digits=10, decimal_places=2, **kwargs)


def money_by_cake_type(help_text):
    return serializers.DictField(child=money(), help_text=help_text)


def reasons_by_cake_type():
    return serializers.DictField(
        child=serializers.CharField(),
        help_text="Motivo por cada tipo de pastel en que la opción no se ofrece.",
    )


def codes_by_cake_type():
    return serializers.DictField(
        child=serializers.CharField(),
        help_text=(
            "Código de cada motivo, por tipo de pastel: `not_offered` (no se ofrece en ese tipo), "
            "`not_combinable` (no se combina con ese tipo) u `only_in` (solo va en los tipos de "
            "`allowed_cake_types`). La interfaz arma sus frases con el código, no con el texto."
        ),
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
    preview_color = serializers.CharField(help_text="En un pan de dos colores, el del pan que va encima del relleno en cada piso.")
    preview_color_bottom = serializers.CharField(
        help_text="Solo en un pan de dos colores: el del pan que va debajo del relleno en cada piso; vacío si es de un color."
    )
    included_filling_preview_style = serializers.CharField(
        help_text=(
            "Solo en un pan con relleno incluido: lo que lleva encima su crema en la vista previa. "
            "Mismos valores que `preview_style` de los sabores; `smooth` si es liso."
        )
    )
    included_filling_preview_color_secondary = serializers.CharField(
        help_text="Color de los trozos del relleno incluido; vacío si es liso."
    )
    included_filling_preview_color = serializers.CharField(
        help_text="Solo en un pan con relleno incluido: el color de su crema; vacío si es crema pastelera blanca."
    )
    allowed_cake_types = cake_types()
    unavailable_reasons = reasons_by_cake_type()
    unavailable_codes = codes_by_cake_type()
    price_per_kg_from = money_by_cake_type(
        "Precio por kilo que se muestra en el paso del pan, por tipo de pastel: relleno "
        "más barato del tipo elegido + incremento del pan, o el precio completo."
    )


class FillingFlavorOptionSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    name = serializers.CharField()
    preview_color = serializers.CharField()
    preview_style = serializers.CharField(
        help_text=(
            "`smooth` (liso), `jam` (mermelada: brillante, con semillas), `caramel` (cajeta: brillante y lisa), "
            "`fruit_slices` (rebanadas de fruta), `fruit_chunks` (trozos de fruta), "
            "`cookie_chunks` (trozos de galleta), `sprinkles` (granillo), `crumbles` (grumitos), "
            "`nut_pieces` (trozos de nuez) o `round_chips` (chispas redondas). Un cliente que no conozca un valor "
            "lo dibuja liso."
        )
    )
    preview_color_secondary = serializers.CharField(
        help_text="Color de los trozos; en `crumbles`, el de los grumitos más rojos. Vacío en un relleno liso."
    )
    is_combinable = serializers.BooleanField()
    allowed_cake_types = cake_types()
    unavailable_reasons = reasons_by_cake_type()
    unavailable_codes = codes_by_cake_type()
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
    unavailable_codes = codes_by_cake_type()
    price_per_kg_by_cake_type = money_by_cake_type("Precio general por kilo, por tipo de pastel.")
    flavors = FillingFlavorOptionSerializer(many=True)


class CoverageColorSerializer(serializers.Serializer):
    """Nombre de referencia de un color. No limita lo que elige el cliente: la interfaz lo usa para decir "parecido a"."""

    slug = serializers.SlugField()
    name = serializers.CharField()
    preview_color = serializers.CharField(help_text="El color de referencia, como `#RRGGBB`.")


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
    preview_flavor = serializers.SlugField(
        allow_null=True, help_text="Solo las chispas: el sabor de relleno de donde salen su estilo y sus colores."
    )
    preview_bread = serializers.SlugField(
        allow_null=True, help_text="Solo las chispas: el pan cuyo relleno incluido da su estilo y sus colores."
    )


class CakeDesignLimitsSerializer(serializers.Serializer):
    people_per_kg = serializers.IntegerField()
    min_custom_kg = serializers.IntegerField()
    max_online_kg = serializers.IntegerField()
    wafer_price = money(allow_null=True, help_text="`null`: PENDIENTE, la oblea no se puede pedir.")
    wafer_max_width_cm = serializers.DecimalField(max_digits=4, decimal_places=1)
    wafer_max_height_cm = serializers.DecimalField(max_digits=4, decimal_places=1)
    message_suggested_max_words = serializers.IntegerField()
    message_min_letter_cm = serializers.DecimalField(
        max_digits=3,
        decimal_places=1,
        help_text=(
            "Alto mínimo de la letra del mensaje, en cm, en todos los tamaños: `scale` por el radio de la parte plana "
            "de la tapa no puede ser menos. Con un pastel por kilos el radio sale de `cake_molds`; con vitrina y mini, "
            "de `sizes[].lid_radius_cm`."
        ),
    )


def _slug_reasons(help_text):
    return serializers.DictField(child=serializers.CharField(), help_text=help_text)


class DesignSizeSerializer(serializers.Serializer):
    """Un tamaño de "Diseña tu pastel" (tanda 2): `by_weight`, `showcase` o `mini`."""

    code = serializers.ChoiceField(choices=CakeDesignSize.choices)
    name = serializers.CharField(help_text="\"Por kilos\", \"Pastel de vitrina\" o \"Pastel mini\".")
    available = serializers.BooleanField()
    unavailable_reason = serializers.CharField(allow_null=True)
    price_from = money(
        allow_null=True,
        help_text=(
            "\"Desde $X\" sin decoración ni oblea. Por kilos: el precio por kilo más bajo por los kilos mínimos. "
            "`null`: PENDIENTE."
        ),
    )
    servings = serializers.IntegerField(allow_null=True, help_text="Personas que rinde (vitrina y mini); `null` si no se define.")
    approx_weight_kg = serializers.DecimalField(
        max_digits=4, decimal_places=1, allow_null=True, help_text="Peso (vitrina y mini); `null`: PENDIENTE."
    )
    diameter_cm = serializers.DecimalField(max_digits=4, decimal_places=1, allow_null=True, help_text="Molde redondo.")
    height_cm = serializers.DecimalField(max_digits=4, decimal_places=1, allow_null=True)
    lid_radius_cm = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        allow_null=True,
        help_text="Radio de la parte plana de la tapa (sin el canto de unos 0.88 cm), para la oblea y el mensaje.",
    )
    form = serializers.CharField(allow_null=True, help_text="`round` fijo en vitrina y mini; `null` por kilos.")
    tiers = serializers.IntegerField(allow_null=True, help_text="1 fijo en vitrina y mini; `null` por kilos.")
    min_kg = serializers.IntegerField(allow_null=True, help_text="Solo por kilos.")
    min_people = serializers.IntegerField(allow_null=True, help_text="Solo por kilos.")
    wafer_unavailable_reason = serializers.CharField(allow_null=True, help_text="Por qué no lleva oblea; `null` si la lleva.")
    unavailable_breads = _slug_reasons("Panes que este tamaño no admite: `slug -> motivo`.")
    unavailable_filling_bases = _slug_reasons("Bases de relleno que este tamaño no admite: `slug -> motivo`.")
    unavailable_decorations = _slug_reasons(
        "Decoraciones que se pueden elegir en otros tamaños pero no en este (o con su precio de este tamaño "
        "PENDIENTE, \"Precio por confirmar\"): `slug -> motivo`."
    )
    decoration_prices = serializers.DictField(
        child=money(),
        help_text=(
            "Lo que cobra este tamaño por cada decoración que se puede elegir en él (`slug -> monto`; \"0.00\" si va "
            "incluida o por cotizar). En el mini, una de precio fijo cobra su precio de mini."
        ),
    )


class TierMinimumSerializer(serializers.Serializer):
    """Kilos mínimos para un número de pisos (regla 3.3, D50): con menos kilos, esos pisos no se eligen."""

    tiers = serializers.IntegerField()
    min_kg = serializers.IntegerField(help_text="Desde estos kilos se pueden elegir estos pisos.")


class CakeMoldSerializer(serializers.Serializer):
    """Un molde de la pastelería (D52): la vista previa toma de aquí el tamaño del pastel según los kilos."""

    form = serializers.CharField(help_text="`round` o `rectangular`.")
    kg = serializers.DecimalField(max_digits=4, decimal_places=1, help_text="Kilos que rinde el molde.")
    length_cm = serializers.DecimalField(
        max_digits=4, decimal_places=1, help_text="El diámetro en un molde redondo; el largo en uno rectangular."
    )
    width_cm = serializers.DecimalField(
        max_digits=4, decimal_places=1, allow_null=True, help_text="El ancho en un molde rectangular; `null` en uno redondo."
    )


class CakeSizeSerializer(serializers.Serializer):
    approx_weight_kg = serializers.DecimalField(
        max_digits=4, decimal_places=1, allow_null=True, help_text="`null`: aún no se define."
    )
    servings = serializers.IntegerField(allow_null=True, help_text="Personas que rinde; `null`: aún no se define.")


class SmallerAlternativesSerializer(serializers.Serializer):
    """Lo que se ofrece a quien pide menos del mínimo; `null` si el catálogo no tiene el dato."""

    showcase_cake = CakeSizeSerializer(
        allow_null=True, help_text="El pastel completo más ligero que se vende en vitrina."
    )
    mini_cake = CakeSizeSerializer(allow_null=True, help_text="El pastel mini que rinde menos.")


class CakeDesignOptionsSerializer(serializers.Serializer):
    cake_types = CakeTypeSerializer(many=True)
    breads = BreadOptionSerializer(many=True)
    filling_bases = FillingBaseOptionSerializer(many=True)
    coverage_colors = CoverageColorSerializer(many=True)
    decorations = DecorationOptionSerializer(many=True)
    limits = CakeDesignLimitsSerializer()
    tier_minimums = TierMinimumSerializer(
        many=True, help_text="Una fila por número de pisos, en orden; el último es el máximo de pisos."
    )
    cake_molds = CakeMoldSerializer(
        many=True,
        help_text=(
            "Moldes de la pastelería, de menor a mayor por forma. Solo para la vista previa: la interfaz no "
            "muestra medidas ni moldes."
        ),
    )
    smaller_alternatives = SmallerAlternativesSerializer(
        help_text="Pastel de vitrina y pastel mini, para quien pide menos del mínimo (regla 3.1)."
    )
    sizes = DesignSizeSerializer(
        many=True, help_text="Los tres tamaños, en orden: por kilos, de vitrina y mini (tanda 2 de correcciones)."
    )


# --- Precio (entrada y salida) ---


UNSAFE_TEXT_MESSAGE = "El mensaje lleva caracteres que no se pueden imprimir."


class StrictFloatField(serializers.FloatField):
    """Un número de verdad: no acepta `true` ni `false` (Python los toma por 1 y 0). DRF ya rechaza NaN, los infinitos y los enteros que no caben en un `float`; aquí solo se dicen en español."""

    default_error_messages = {
        "invalid": "Escribe un número.",
        "overflow": "Ese número es demasiado grande.",
    }

    def to_internal_value(self, data):
        if isinstance(data, bool):
            self.fail("invalid")
        return super().to_internal_value(data)


class StrictBooleanField(serializers.BooleanField):
    """Un `true` o un `false` de JSON, nada más: DRF acepta también `"true"`, `"no"`, `1` o `0`."""

    def __init__(self, *, message: str, **kwargs):
        super().__init__(**kwargs)
        self.error_messages["invalid"] = message
        self.error_messages["null"] = message

    def to_internal_value(self, data):
        if not isinstance(data, bool):
            self.fail("invalid")
        return data


SIDE_COMB_MESSAGE = "Indica si lleva peinado lateral: true o false."


def side_comb_field():
    return StrictBooleanField(
        message=SIDE_COMB_MESSAGE,
        required=False,
        default=True,
        help_text="Peinado lateral: surcos horizontales en los costados de la cobertura (`true` por omisión). No cambia el precio.",
    )


def _relative_position():
    limit = design_layout.MAX_RELATIVE_POSITION
    return StrictFloatField(min_value=-limit, max_value=limit)


def _rotation():
    limit = design_layout.MAX_ROTATION_DEG
    return StrictFloatField(min_value=-limit, max_value=limit)


class MessageTextField(serializers.CharField):
    """Texto del mensaje. DRF rechaza los sustitutos sueltos con un validador en inglés: aquí lleva el mismo texto que los demás."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        for validator in self.validators:
            if isinstance(validator, ProhibitSurrogateCharactersValidator):
                validator.message = UNSAFE_TEXT_MESSAGE

    def to_internal_value(self, data):
        # Antes de medir los 80 caracteres: `\r\n` y `\r` pasan a `\n` (cuenta 1) y se recortan los espacios de cada renglón.
        return design_layout.normalize_message_text(super().to_internal_value(data))


class WaferLayoutSerializer(serializers.Serializer):
    """Cómo acomoda el cliente la oblea sobre la tapa del último piso (paso 7). No cambia el precio."""

    shape = serializers.ChoiceField(choices=WaferShape.choices)
    width_cm = StrictFloatField(
        min_value=design_layout.MIN_WAFER_CM, max_value=100, help_text="En un círculo, el diámetro."
    )
    height_cm = StrictFloatField(min_value=design_layout.MIN_WAFER_CM, max_value=100)
    rotation_deg = _rotation()
    x = _relative_position()
    y = _relative_position()
    image_zoom = StrictFloatField(
        min_value=design_layout.MIN_IMAGE_ZOOM, max_value=design_layout.MAX_IMAGE_ZOOM,
        help_text="1 cubre la oblea justo; más acerca la imagen.",
    )
    image_x = StrictFloatField(min_value=-1, max_value=1)
    image_y = StrictFloatField(min_value=-1, max_value=1)


class MessageLayoutSerializer(serializers.Serializer):
    """Cómo escribe el cliente el mensaje sobre la tapa (paso 7). No cambia el precio."""

    text = MessageTextField(
        max_length=design_layout.MAX_MESSAGE_LENGTH,
        help_text=(
            "La pastelería sugiere hasta 4 palabras; no se bloquea. Hasta 3 renglones separados con `\\n` (`\\r\\n` y "
            "`\\r` se cambian por `\\n`, que cuenta como 1 carácter); sin renglones vacíos."
        ),
    )
    color_mode = serializers.ChoiceField(
        choices=MessageColorMode.choices,
        error_messages={"invalid_choice": "Elige automático, colores que combinan o elegir un color."},
    )
    color = serializers.CharField(
        allow_null=True,
        max_length=SLUG_MAX_LENGTH,
        # Un color con espacios o saltos de línea no es `#RRGGBB`: no se recorta para aceptarlo.
        trim_whitespace=False,
        help_text=(
            "`auto`: `null`. `tones`: `deep` o `light`. `custom`: cualquier color como `#RRGGBB` "
            "(seis dígitos hexadecimales, sin forma corta, sin transparencia ni nombres); el servidor lo guarda en minúsculas."
        ),
    )
    arrangement = serializers.ChoiceField(choices=MessageArrangement.choices)
    curve = StrictFloatField(min_value=-1, max_value=1)
    scale = StrictFloatField(
        min_value=design_layout.MIN_MESSAGE_SCALE, max_value=design_layout.MAX_MESSAGE_SCALE
    )
    rotation_deg = _rotation()
    x = _relative_position()
    y = _relative_position()

    def validate_text(self, value):
        if design_layout.has_unsafe_characters(value):
            raise serializers.ValidationError(UNSAFE_TEXT_MESSAGE)
        problem = design_layout.message_text_problem(value)
        if problem:
            raise serializers.ValidationError(problem)
        return value

    def validate(self, attrs):
        # Un color libre válido se normaliza a minúsculas; uno que no lo es llega tal cual y el servicio lo rechaza.
        if attrs["color_mode"] == MessageColorMode.CUSTOM:
            attrs["color"] = design_layout.normalize_hex_color(attrs["color"]) or attrs["color"]
        return attrs


SMALL_SIZE_PEOPLE_MESSAGE = "El pastel de vitrina y el mini ya traen su tamaño: no se indican personas ni kilos."


def cake_size_field():
    return serializers.ChoiceField(
        choices=CakeDesignSize.choices,
        required=False,
        default=CakeDesignSize.BY_WEIGHT,
        help_text=(
            "`by_weight` (por kilos, desde el mínimo de pedido; por omisión), `showcase` (pastel de vitrina) o `mini`. "
            "Vitrina y mini son redondos, de 1 piso y sin base."
        ),
        error_messages={"invalid_choice": "Elige un tamaño: por kilos, de vitrina o mini."},
    )


def source_product_field():
    return serializers.SlugField(
        max_length=Product._meta.get_field("slug").max_length,
        required=False,
        allow_null=True,
        default=None,
        help_text=(
            "Solo con `showcase`: el `slug` del pastel de vitrina de \"Personalizar este pastel\". Su tipo, pan y "
            "relleno no cambian y el precio es el del producto."
        ),
    )


class CakeDesignPriceRequestSerializer(serializers.Serializer):
    """Elecciones del cliente. Cualquier monto que mande se ignora: el servidor lo calcula.

    Forma (`form`) y pisos (`tiers`) no cambian el precio y son opcionales;
    si llegan, se validan (regla 3.3: los kilos mínimos por pisos bloquean).

    El tamaño (`cake_size`) es `by_weight` (por omisión), `showcase` o `mini`. Por
    kilos llega como `people` (el servidor calcula los kilos, regla 3.1) o como
    `kg`, nunca los dos; el pastel de vitrina y el mini no llevan ninguno.
    """

    cake_size = cake_size_field()
    source_product = source_product_field()
    people = serializers.IntegerField(
        required=False,
        min_value=1,
        max_value=MAX_PEOPLE_IN_REQUEST,
        help_text="Personas; el servidor calcula los kilos y los devuelve en `size`.",
        error_messages={
            "invalid": "Las personas van en números enteros.",
            "min_value": "Indica al menos una persona.",
            "max_value": "Son demasiadas personas para pedir en línea. Escríbenos por WhatsApp.",
        },
    )
    kg = serializers.IntegerField(
        required=False,
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
    tiers = serializers.IntegerField(
        required=False,
        min_value=1,
        max_value=MAX_TIERS_IN_REQUEST,
        help_text="Pisos; si llegan, se validan contra los kilos (regla 3.3). No cambian el precio.",
        error_messages={
            "invalid": "Los pisos van en números enteros.",
            "min_value": "El pastel lleva al menos un piso.",
            "max_value": "Son demasiados pisos para pedir en línea. Escríbenos por WhatsApp.",
        },
    )
    form = serializers.ChoiceField(
        choices=CakeShape.choices,
        required=False,
        help_text="Forma del molde; si llega, se valida. No cambia el precio.",
        error_messages={"invalid_choice": "Elige una forma: redondo o rectangular."},
    )
    wafer_layout = WaferLayoutSerializer(
        required=False,
        help_text="Acomodo de la oblea; si llega, se valida y exige `wafer`. No cambia el precio.",
    )
    message_layout = MessageLayoutSerializer(
        required=False, help_text="Acomodo del mensaje; si llega, se valida. No cambia el precio."
    )
    side_comb = side_comb_field()
    estimate = serializers.BooleanField(
        required=False,
        default=False,
        help_text=(
            "Total estimado mientras el cliente arma el pastel: con la base del relleno y sin "
            "sabores, cuenta el precio general de la base. Solo cambia qué cálculo se usa; no "
            "es parte de la elección y ningún pedido lo lleva."
        ),
    )

    def validate(self, attrs):
        has_people, has_kg = attrs.get("people") is not None, attrs.get("kg") is not None
        if attrs["cake_size"] != CakeDesignSize.BY_WEIGHT:
            if has_people or has_kg:
                field = "people" if has_people else "kg"
                raise serializers.ValidationError({field: [SMALL_SIZE_PEOPLE_MESSAGE]})
            return attrs
        if has_people and has_kg:
            raise serializers.ValidationError({"people": ["Indica las personas o los kilos, no los dos."]})
        if not has_people and not has_kg:
            raise serializers.ValidationError({"people": ["Indica para cuántas personas es el pastel."]})
        return attrs

    def to_choice(self, kg: int | None) -> CakeDesignChoice:
        """La elección con los kilos ya resueltos (los mandados o los calculados por personas; `None` sin kilos)."""
        data = self.validated_data
        return CakeDesignChoice(
            cake_size=data["cake_size"],
            source_product=data.get("source_product"),
            kg=kg,
            cake_type=data["cake_type"],
            bread=data["bread"],
            filling_base=data.get("filling_base"),
            filling_flavors=tuple(data["filling_flavors"]),
            decoration=data.get("decoration"),
            wafer=data["wafer"],
            tiers=data.get("tiers"),
            form=data.get("form"),
            wafer_layout=WaferLayout(**data["wafer_layout"]) if "wafer_layout" in data else None,
            message_layout=MessageLayout(**data["message_layout"]) if "message_layout" in data else None,
        )


class PaymentSummarySerializer(serializers.Serializer):
    """Lo que se paga hoy y el día de la entrega (regla 10). El envío se decide en el carrito."""

    advance_percent = serializers.IntegerField(help_text="Parte del pedido que se paga hoy, en porcentaje.")
    advance = money(help_text="Anticipo: esa parte del pedido, sin la base ni el envío.")
    base_deposit = money(help_text="Depósito de la base, completo y aparte.")
    delivery_fee = money(help_text="Envío, completo y aparte; $0 hasta que se elige la entrega.")
    pay_today = money(help_text="Anticipo más el depósito de la base y el envío.")
    pay_on_delivery = money(help_text="Lo que falta del pedido: se paga el día de la entrega.")


class StandDepositSerializer(serializers.Serializer):
    """Base que toca al pedido; `null` si los kilos no llevan base."""

    min_kg = serializers.IntegerField(source="stand.min_kg")
    max_kg = serializers.IntegerField(source="stand.max_kg")
    deposit = money(help_text="Se cobra aparte del pedido y se devuelve al regresar la base.")
    return_days = serializers.IntegerField(help_text="Días, desde la entrega, para regresar la base y recuperar el depósito.")

    def to_representation(self, instance):
        return None if instance.stand is None else super().to_representation(instance)


class PeopleSizeSerializer(serializers.Serializer):
    """Kilos calculados por personas (regla 3.1) y dónde quedan contra el mínimo y el máximo en línea."""

    people = serializers.IntegerField()
    rounded_kg = serializers.IntegerField(help_text="Personas entre personas por kilo, de .5 hacia arriba, sin el mínimo.")
    kg = serializers.IntegerField(help_text="Kilos del pedido: nunca menos que el mínimo.")
    below_minimum = serializers.BooleanField()
    above_maximum = serializers.BooleanField(help_text="Más de lo que se pide en línea: el precio sale en `null`.")
    minimum_people = serializers.IntegerField(help_text="Personas que alcanza el mínimo.")
    max_online_people = serializers.IntegerField(help_text="Personas que alcanza el máximo en línea.")
    max_tiers = serializers.IntegerField(help_text="El mayor número de pisos que permiten los kilos (regla 3.3).")


class CakeDesignPriceSerializer(serializers.Serializer):
    """Desglose del precio. Con `size.above_maximum`, los montos, `kg` y `stand` salen en `null`. El pastel de vitrina
    y el mini no tienen `kg` ni `price_per_kg` (`null`): `cake_subtotal` es su precio."""

    cake_size = serializers.ChoiceField(
        choices=CakeDesignSize.choices, source="breakdown.cake_size", allow_null=True, help_text="El tamaño cobrado."
    )
    price_per_kg = money(source="breakdown.price_per_kg", allow_null=True)
    kg = serializers.IntegerField(source="breakdown.kg", allow_null=True)
    cake_subtotal = money(source="breakdown.cake_subtotal", allow_null=True)
    wafer = money(source="breakdown.wafer", allow_null=True)
    decoration = money(
        source="breakdown.decoration", allow_null=True, help_text="Con una decoración por cotizar es 0: no se suma."
    )
    total = money(source="breakdown.total", allow_null=True, help_text="Sin el depósito de la base, que va aparte.")
    requires_quote = serializers.BooleanField(
        source="breakdown.requires_quote",
        allow_null=True,
        help_text="La decoración la cotiza la pastelería; el pedido queda en pausa hasta entonces.",
    )
    is_estimate = serializers.BooleanField(
        source="breakdown.is_estimate",
        allow_null=True,
        read_only=True,
        help_text="El total es un estimado sin sabores (`estimate`): ningún pedido lo acepta.",
    )
    stand = StandDepositSerializer(source="stand_deposit", allow_null=True)
    payment = PaymentSummarySerializer(
        allow_null=True,
        help_text=(
            "Anticipo, lo que se paga hoy y lo que queda para la entrega. `null` con una decoración por "
            "cotizar (`requires_quote`): no se cobra nada hasta que la pastelería ponga el precio."
        ),
    )
    size = PeopleSizeSerializer(allow_null=True, help_text="Solo si la petición trae `people`; si no, `null`.")


# --- Datos del negocio (salida) ---


def _hh_mm_field(help_text):
    return serializers.TimeField(format="%H:%M", help_text=help_text)


class StoreInfoSerializer(serializers.Serializer):
    """Datos del pie y la franja superior; `null` en lo que la pastelería aún no define."""

    address = serializers.CharField(
        allow_null=True, help_text="Dirección de la pastelería. `null`: PENDIENTE."
    )
    whatsapp = serializers.CharField(
        allow_null=True,
        help_text=(
            "Solo dígitos, con la lada del país y sin \"+\" (E.164, de 8 a 15 dígitos), "
            "listo para https://wa.me/<whatsapp>. `null`: PENDIENTE."
        ),
    )
    opens_at = _hh_mm_field("Hora de apertura, HH:MM en 24 horas.")
    closes_at = _hh_mm_field("Hora de cierre, HH:MM en 24 horas.")
    custom_lead_days = serializers.IntegerField(help_text="Días de anticipación de un pedido.")


# --- Bases en préstamo (`/bases`) ---


class PublicStandSerializer(serializers.Serializer):
    """Una base de la pastelería: sus kilos, su depósito y una nota opcional."""

    min_kg = serializers.IntegerField(help_text="Desde estos kilos.")
    max_kg = serializers.IntegerField(help_text="Hasta estos kilos; igual a `min_kg` en una base de un solo peso.")
    deposit = money(help_text="Se cobra aparte del pedido y se devuelve al regresar la base.")
    description = serializers.CharField(help_text="Nota de la base, como \"Madera forrada en aluminio\"; vacía si no lleva.")


class DepositsBeyondSerializer(serializers.Serializer):
    """Los depósitos por arriba de la base más grande de la pastelería, hasta el máximo en línea."""

    from_kg = serializers.IntegerField(help_text="El kilo siguiente a la base más grande de la pastelería.")
    to_kg = serializers.IntegerField(help_text="El máximo en línea efectivo.")
    min_deposit = money(help_text="El depósito más chico de ese rango.")
    max_deposit = money(help_text="El depósito más grande de ese rango.")


class StandInfoSerializer(serializers.Serializer):
    """Las bases de la pastelería y las condiciones del préstamo; `null` en lo que aún no se define."""

    stands = PublicStandSerializer(many=True, help_text="Solo las de origen \"Pastelería\" y activas, por kilos.")
    return_days = serializers.IntegerField(help_text="Días, desde la entrega, para regresar la base (`stand_return_days`).")
    from_kg = serializers.IntegerField(
        allow_null=True, help_text="Desde cuántos kilos un pedido lleva base. `null`: no hay ninguna base activa."
    )
    damaged_policy = serializers.CharField(
        allow_null=True, help_text="Qué pasa si la base regresa dañada. `null`: PENDIENTE."
    )
    beyond = DepositsBeyondSerializer(
        allow_null=True,
        help_text="Lo que se cobra arriba de la base más grande de la pastelería. `null`: nada que pedir en línea ahí.",
    )


# --- Catálogo público (entrada y salida) ---

# Tope deliberado del término de búsqueda, igual al largo del nombre. La búsqueda
# también mira la descripción corta (160): un término más largo que un nombre
# solo podría coincidir con una descripción, y eso no se busca así.
SEARCH_MAX_LENGTH = Product._meta.get_field("name").max_length


def _category_field(help_text):
    return serializers.ChoiceField(choices=ProductCategory.choices, required=False, help_text=help_text)


def _pending_text(help_text):
    return serializers.CharField(allow_null=True, help_text=f"{help_text} `null`: PENDIENTE.")


def _photo_field():
    return _pending_text(
        "Nombre del archivo estático del frontend; la interfaz muestra \"Foto del pastel\" mientras falta."
    )


class ShowcaseQuerySerializer(serializers.Serializer):
    category = _category_field("Filtro de la vitrina: Todo (sin el parámetro), Pasteles o Postres.")


class CatalogQuerySerializer(serializers.Serializer):
    category = _category_field("Filtro del catálogo: Todo (sin el parámetro), Pasteles o Postres.")
    search = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=SEARCH_MAX_LENGTH,
        help_text="Busca en el nombre y en la descripción corta, sin distinguir mayúsculas.",
    )


def _catalog_price():
    return money(
        allow_null=True,
        help_text="`null`: PENDIENTE; la interfaz muestra \"[Precio por confirmar]\" y la presentación no se puede pedir.",
    )


class CardOfferingSerializer(serializers.Serializer):
    id = serializers.IntegerField(help_text="Id de la presentación; con él se agrega al pedido.")
    presentation = serializers.ChoiceField(choices=Presentation.choices)
    price = _catalog_price()
    price_pending = serializers.BooleanField(help_text="`true` con `price` en `null`: \"[Precio por confirmar]\".")


class ProductOfferingSerializer(CardOfferingSerializer):
    approx_weight_kg = serializers.DecimalField(
        max_digits=4, decimal_places=1, allow_null=True, help_text="`null`: aún no se define."
    )
    servings = serializers.IntegerField(allow_null=True, help_text="Personas que rinde; `null`: aún no se define.")
    photo = _pending_text("La de la presentación o, si no tiene, la del producto.")
    stock = serializers.IntegerField(
        allow_null=True,
        help_text="Piezas en la vitrina de hoy. `null`: no se cargó hoy (solo por encargo). `0`: agotada por hoy.",
    )


class ShowcaseDesignSerializer(serializers.Serializer):
    available = serializers.BooleanField()
    unavailable_reason = serializers.CharField(allow_null=True)


def _model_image_field():
    return serializers.CharField(
        allow_null=True,
        help_text=(
            "Imagen fija del modelo (D86), nombre del archivo estático del frontend: la tarjeta la muestra en lugar de "
            "`photo`. `null` si la pastelería no la muestra en el catálogo o no tiene: la tarjeta usa `photo`."
        ),
    )


class SampleDesignSerializer(serializers.Serializer):
    """La muestra del modelo (D86): lo que dibuja la imagen fija, además del tipo, el pan y el relleno del producto."""

    coverage_color = serializers.CharField(help_text="Color de la cobertura, `#RRGGBB`.")
    decoration = serializers.SlugField(
        allow_null=True, help_text="Decoración del paso 6, como en `cake-designs/options`. `null` si ya no está activa."
    )
    decoration_color = serializers.CharField(allow_null=True, help_text="`#RRGGBB`; `null` es automático.")
    fruit_layout = serializers.ChoiceField(choices=FruitLayout.choices, allow_null=True, help_text="`null`: sin fruta.")
    fruits = serializers.ListField(
        child=serializers.ChoiceField(choices=FruitKind.choices),
        help_text="Fruta fresca de la tapa. Solo la dibuja la imagen del catálogo: no se pide.",
    )
    side_comb = serializers.BooleanField(help_text="Peinado lateral de la cobertura.")
    model_image = serializers.CharField(allow_null=True, help_text="Archivo de la imagen; `null` si aún no se genera.")
    show_model_in_catalog = serializers.BooleanField(help_text="Si el catálogo y la portada muestran la imagen.")
    # Los detalles de la imagen del catálogo (tanda 4b). Solo los dibuja esa imagen; `null` es "no lleva".
    top_color = serializers.CharField(allow_null=True, help_text="Color de la tapa, `#RRGGBB`; `null`: el de la cobertura.")
    top_glossy = serializers.BooleanField(help_text="La tapa brilla como un glaseado de espejo.")
    side_glossy = serializers.BooleanField(help_text="El costado brilla como la cajeta.")
    side_texture = serializers.ChoiceField(choices=SampleSideTexture.choices, allow_null=True, help_text="`null`: costado liso.")
    top_ring_color = serializers.CharField(allow_null=True, help_text="Anillo de mermelada en la tapa, `#RRGGBB`; `null`: sin anillo.")
    top_ring_width = serializers.FloatField(allow_null=True, help_text="Parte del radio de la tapa que ocupa el anillo, desde la orilla.")
    side_band_color = serializers.CharField(allow_null=True, help_text="Franja de abajo del costado, `#RRGGBB`; `null`: sin franja.")
    side_band_height = serializers.FloatField(allow_null=True, help_text="Parte del alto del pastel que ocupa la franja.")
    drizzle = serializers.ChoiceField(choices=SampleDrizzle.choices, allow_null=True, help_text="`null`: sin hilos.")
    drizzle_color = serializers.CharField(allow_null=True, help_text="Color de los hilos, `#RRGGBB`.")
    edge_size = serializers.FloatField(help_text="Tamaño de los rosetones o conchas de duya del borde de arriba; 1 es el del diseñador.")
    shells = serializers.ChoiceField(choices=SampleShells.choices, allow_null=True, help_text="`null`: sin conchas de chocolate.")
    shell_color = serializers.CharField(allow_null=True, help_text="Color de las conchas, `#RRGGBB`.")
    shell_second_color = serializers.CharField(allow_null=True, help_text="Segundo color, que se alterna; `null`: todas iguales.")
    dusting_color = serializers.CharField(allow_null=True, help_text="Espolvoreado sobre la tapa y las conchas; `null`: sin él.")
    side_bits = serializers.ChoiceField(choices=SampleSideBits.choices, allow_null=True, help_text="`null`: nada pegado al costado.")
    side_bits_color = serializers.CharField(allow_null=True, help_text="Color de lo pegado al costado, `#RRGGBB`.")
    fruit_density = serializers.FloatField(help_text="Lo tupido de la fruta, de 1 (el montón de siempre) a 3 (toda la parte libre de la tapa, alto).")
    edge_inset = serializers.FloatField(help_text="Cuánto se meten las piezas del borde hacia el centro, en parte del radio de la tapa; 0 es la orilla.")
    sprinkle_density = serializers.FloatField(help_text="Cuántas veces más chispas que en el diseñador, de 1 a 10.")


class ProductCardSerializer(serializers.Serializer):
    """Tarjeta del catálogo, de "Pasteles de la casa" y de "También te puede gustar"."""

    slug = serializers.SlugField()
    name = serializers.CharField()
    category = serializers.ChoiceField(choices=ProductCategory.choices)
    sales_channel = serializers.ChoiceField(
        choices=SalesChannel.choices,
        help_text="`showcase_only`: \"Solo en vitrina\". `order_only`: \"Solo por encargo\", nunca en la vitrina.",
    )
    cake_type = serializers.ChoiceField(choices=CakeType.choices, allow_null=True, help_text="`null` en los postres.")
    bread = serializers.SlugField(
        allow_null=True,
        help_text=(
            "Pan, como en `cake-designs/options` (con él se muestra el precio por kilo de un pan de "
            "precio completo, como Red velvet). `null` si aún no se define o es un postre."
        ),
    )
    filling_base = serializers.SlugField(
        allow_null=True, help_text="Base de relleno (`normal`, `queso`, `flan`); `null` si no lleva."
    )
    summary = serializers.CharField(help_text="Descripción corta de la tarjeta.")
    photo = _photo_field()
    in_showcase_today = serializers.BooleanField(
        help_text="\"En vitrina hoy\": alguna presentación que no es rebanada tiene piezas hoy."
    )
    sliced_today = serializers.BooleanField(
        help_text=(
            "\"Rebanado hoy\": el producto es el rebanado (tiene rebanadas cargadas hoy) y le quedan "
            "rebanadas. Se ve completo en la vitrina, pero completo solo se encarga."
        )
    )
    offerings = CardOfferingSerializer(many=True, help_text="Presentaciones activas, en el orden del admin.")
    showcase_design = ShowcaseDesignSerializer(
        help_text=(
            "Si \"Personalizar este pastel\" lo abre en \"Diseña tu pastel\" como pastel de vitrina "
            "(`cake_size=showcase`, `source_product=<slug>`): sale en la vitrina, con su completo con precio y su pan "
            "definido. Si no, el motivo."
        )
    )
    model_image = _model_image_field()


class ProductDetailSerializer(ProductCardSerializer):
    """Ficha del producto. `cake_type`, `bread`, `filling_base` y `filling_flavor` preparan "Personalizar este pastel"."""

    description = serializers.CharField(help_text="Descripción de la ficha; vacía si no tiene.")
    filling_flavor = serializers.SlugField(allow_null=True)
    storage_notes = _pending_text("Conservación.")
    transport_notes = _pending_text("Transporte.")
    offerings = ProductOfferingSerializer(many=True, help_text="Presentaciones activas, en el orden del admin.")
    related = ProductCardSerializer(
        many=True, help_text="\"También te puede gustar\": otros productos activos de la misma categoría."
    )
    sample_design = SampleDesignSerializer(
        allow_null=True,
        help_text="La muestra del modelo, que lee la ruta que genera la imagen fija. `null` si el pastel no tiene.",
    )


class StockItemSerializer(serializers.Serializer):
    offering_id = serializers.IntegerField(help_text="Id de la presentación; con él se agrega al pedido.")
    product_slug = serializers.SlugField()
    product_name = serializers.CharField()
    category = serializers.ChoiceField(choices=ProductCategory.choices)
    presentation = serializers.ChoiceField(choices=Presentation.choices)
    price = _catalog_price()
    photo = _photo_field()
    stock = serializers.IntegerField(min_value=0, help_text="\"Quedan [n]\".")
    sold_out = serializers.BooleanField(help_text="`true` con `stock` en 0: \"Agotada por hoy\".")


class TodayStockSerializer(serializers.Serializer):
    date = serializers.DateField(help_text="Fecha de hoy en la pastelería (Ciudad de México), AAAA-MM-DD.")
    items = StockItemSerializer(
        many=True, help_text="Lo cargado hoy, en el orden del catálogo; lo no cargado no sale."
    )


class SliceItemSerializer(StockItemSerializer):
    model_image = _model_image_field()


class SlicesSerializer(TodayStockSerializer):
    items = SliceItemSerializer(
        many=True, help_text="Las rebanadas cargadas hoy, en el orden del catálogo, con la imagen del modelo de su pastel."
    )


class ShowcaseItemSerializer(StockItemSerializer):
    sliced = serializers.BooleanField(
        help_text=(
            "`true`: es el rebanado. Se ve completo en la vitrina, pero no se vende completo: la "
            "partida es su rebanada (id, precio y `stock`, las rebanadas que quedan) y `photo` es la "
            "del producto. Con `stock` en 0 el rebanado ya se acabó."
        )
    )
    model_image = _model_image_field()


class ShowcaseSerializer(TodayStockSerializer):
    items = ShowcaseItemSerializer(
        many=True, help_text="Lo cargado hoy, en el orden del catálogo, con el rebanado en su lugar."
    )


# --- Imágenes de clientes (entrada y salida) ---


class CustomerImageUploadSerializer(serializers.Serializer):
    """Una imagen del cliente. El servidor la abre con Pillow: la extensión y el tipo que declara no cuentan."""

    image = serializers.FileField(
        help_text="JPG, PNG o WebP, de hasta el tamaño máximo del admin (5 MB al inicio) y sus megapíxeles (12 al inicio).",
        error_messages={"required": "Elige una imagen.", "invalid": "Elige una imagen.", "empty": "La imagen está vacía."},
    )
    purpose = serializers.ChoiceField(
        choices=CustomerImagePurpose.choices,
        help_text="`wafer` (oblea), `decoration` (\"Otra decoración\") o `reference` (envío de referencia, D70).",
        error_messages={"invalid_choice": "Indica si la imagen es de la oblea, de la decoración o una referencia."},
    )


class CustomerImageSerializer(serializers.Serializer):
    id = serializers.UUIDField(help_text="Con él se pone la imagen en el pedido y se pide para verla.")
    purpose = serializers.ChoiceField(choices=CustomerImagePurpose.choices)
    content_type = serializers.CharField(help_text="`image/jpeg`, `image/png` o `image/webp`: el de la imagen ya limpia.")
    width = serializers.IntegerField()
    height = serializers.IntegerField()
    size_bytes = serializers.IntegerField()
    original_name = serializers.CharField(help_text="El nombre del archivo, limpio; solo para mostrarlo.")


# --- Agenda de entregas (entrada y salida) ---


def _hh_mm_input(help_text, **kwargs):
    return serializers.TimeField(
        format="%H:%M",
        input_formats=["%H:%M"],
        help_text=help_text,
        error_messages={"invalid": "Escribe la hora como HH:MM, por ejemplo 15:30."},
        **kwargs,
    )


class DeliverySlotQuerySerializer(serializers.Serializer):
    start = serializers.DateField(
        help_text="Primer día del calendario, AAAA-MM-DD.",
        error_messages={"required": "Indica el primer día.", "invalid": "Escribe la fecha como AAAA-MM-DD."},
    )
    end = serializers.DateField(
        help_text=(
            f"Último día del calendario, AAAA-MM-DD; como mucho {schedule_service.MAX_CALENDAR_DAYS} días contando "
            "`start` (un mes con sus semanas)."
        ),
        error_messages={"required": "Indica el último día.", "invalid": "Escribe la fecha como AAAA-MM-DD."},
    )
    kind = serializers.MultipleChoiceField(
        choices=OrderLineKind.choices,
        allow_empty=False,
        help_text=(
            "Los tipos de línea del pedido (se repite: `?kind=design&kind=order`). La anticipación es la del más "
            "estricto: `design` 2 días; `order` hoy con 2 horas o cualquier otro día; `showcase` solo hoy; "
            "`reference` (aceptar una cotización, D70) cualquier lapso que no haya pasado."
        ),
        error_messages={"empty": "Indica qué lleva tu pedido.", "required": "Indica qué lleva tu pedido."},
    )


class DaySlotSerializer(serializers.Serializer):
    starts_at = _hh_mm_input("Empieza, HH:MM.")
    ends_at = _hh_mm_input("Termina, HH:MM.")
    available = serializers.BooleanField()
    reason = serializers.ChoiceField(
        choices=[(schedule_service.TOO_SOON, "Muy pronto"), (schedule_service.FULL, "Lleno")],
        allow_null=True,
        help_text="`too_soon`: no alcanza la anticipación o ya pasó. `full`: \"Lleno\". `null` si se puede elegir.",
    )


class CalendarDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    available = serializers.BooleanField(help_text="Si tiene algún lapso que se puede elegir.")
    reason = serializers.ChoiceField(
        choices=[
            (schedule_service.TOO_SOON, "Muy pronto"),
            (schedule_service.FULL, "Lleno"),
            (schedule_service.TOO_FAR, "Fuera de los días que se reservan"),
        ],
        allow_null=True,
        help_text=(
            "Por qué no se puede elegir: `too_soon` (ya pasó o no alcanza la anticipación), `full` (\"Lleno\": los "
            "lapsos que alcanzan la anticipación tienen el máximo de pedidos) o `too_far` (después de "
            "`PolicySettings.max_days_ahead`, o después de hoy si el pedido lleva la vitrina de hoy). `null` si se "
            "puede elegir."
        ),
    )
    slots = DaySlotSerializer(
        many=True,
        help_text="Los lapsos del día, en orden, con su disponibilidad. Vacío en los días `too_soon` y `too_far`.",
    )


class DeliveryCalendarSerializer(serializers.Serializer):
    start = serializers.DateField()
    end = serializers.DateField()
    earliest_date = serializers.DateField(
        allow_null=True,
        help_text="El primer día con algún lapso que alcanza la anticipación (sin contar el cupo); `null` si ya no hay.",
    )
    latest_date = serializers.DateField(
        help_text="El último día que se puede reservar para este pedido (`PolicySettings.max_days_ahead`, o hoy con la vitrina)."
    )
    days = CalendarDaySerializer(many=True, help_text="Cada día de `start` a `end`, en orden.")


# --- Pedidos (entrada) ---

# Topes técnicos contra peticiones absurdas, como los del carrito (`MAX_LINES`, `MAX_LINE_QUANTITY`, D46): el límite real
# de cada pieza de la vitrina son sus existencias.
MAX_ORDER_LINES = 100
MAX_LINE_QUANTITY = 999
# Quién recoge (D66): el mismo largo que `User.full_name` y los 10 dígitos de `User.phone`.
PICKUP_NAME_MAX_LENGTH = 150
PICKUP_PHONE = re.compile(r"[0-9]{10}")
HEX_COLOR_MESSAGE = "Escribe el color como #RRGGBB, por ejemplo #F0CE8A."


class HexColorField(serializers.CharField):
    """Un color libre `#RRGGBB`, en minúsculas. Sin recortar espacios: `" #abcdef"` no es un color (D57)."""

    def __init__(self, **kwargs):
        super().__init__(trim_whitespace=False, max_length=7, **kwargs)

    def to_internal_value(self, data):
        color = design_layout.normalize_hex_color(super().to_internal_value(data))
        if color is None:
            raise serializers.ValidationError(HEX_COLOR_MESSAGE)
        return color


class OrderDesignSerializer(serializers.Serializer):
    """Un pastel de "Diseña tu pastel", campo por campo. Montos, `requiresQuote` y el id del diseño no se leen.

    Por kilos (`cake_size` `by_weight`, por omisión) llevan `people`, `form` y `tiers`. El pastel de vitrina y el mini
    van sin personas: son redondos y de 1 piso (`form` y `tiers`, si llegan, se revisan contra eso).
    """

    cake_size = cake_size_field()
    source_product = source_product_field()
    people = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        min_value=1,
        max_value=MAX_PEOPLE_IN_REQUEST,
        help_text="Personas, solo por kilos; el servidor calcula los kilos (regla 3.1).",
        error_messages={
            "invalid": "Las personas van en números enteros.",
            "min_value": "Indica al menos una persona.",
            "max_value": "Son demasiadas personas para pedir en línea. Escríbenos por WhatsApp.",
        },
    )
    form = serializers.ChoiceField(
        choices=CakeShape.choices,
        required=False,
        help_text="Obligatoria por kilos; vitrina y mini son redondos.",
        error_messages={"invalid_choice": "Elige una forma: redondo o rectangular."},
    )
    tiers = serializers.IntegerField(
        required=False,
        min_value=1,
        max_value=MAX_TIERS_IN_REQUEST,
        help_text="Pisos; se revisan contra los kilos (regla 3.3). Obligatorios por kilos; vitrina y mini van de 1 piso.",
        error_messages={
            "invalid": "Los pisos van en números enteros.",
            "min_value": "El pastel lleva al menos un piso.",
            "max_value": "Son demasiados pisos para pedir en línea. Escríbenos por WhatsApp.",
        },
    )
    cake_type = serializers.ChoiceField(choices=CakeType.choices)
    bread = serializers.SlugField(max_length=SLUG_MAX_LENGTH)
    filling_base = serializers.SlugField(max_length=SLUG_MAX_LENGTH, required=False, allow_null=True, default=None)
    filling_flavors = serializers.ListField(
        child=serializers.SlugField(max_length=SLUG_MAX_LENGTH), max_length=MAX_FLAVORS_IN_REQUEST, required=False, default=list
    )
    coverage_color = HexColorField(help_text="Color de la cobertura, `#RRGGBB`; se guarda en minúsculas.")
    side_comb = side_comb_field()
    decoration = serializers.SlugField(max_length=SLUG_MAX_LENGTH, help_text="La decoración elegida, también \"Sin decoración\".")
    decoration_color = HexColorField(
        required=False, allow_null=True, default=None, help_text="`#RRGGBB`, o `null` para el color automático."
    )
    decoration_image_id = serializers.UUIDField(
        required=False, allow_null=True, default=None, help_text="Obligatoria con \"Otra decoración\"; si no, va vacía."
    )
    message_layout = MessageLayoutSerializer(required=False, allow_null=True, default=None)
    wafer = serializers.BooleanField(required=False, default=False)
    wafer_layout = WaferLayoutSerializer(required=False, allow_null=True, default=None, help_text="Obligatorio con la oblea.")
    wafer_image_id = serializers.UUIDField(
        required=False, allow_null=True, default=None, help_text="Obligatoria con la oblea; si no, va vacía."
    )
    occasion = serializers.ChoiceField(choices=Occasion.choices, required=False, allow_null=True, default=None)

    def validate(self, attrs):
        if attrs["cake_size"] == CakeDesignSize.BY_WEIGHT:
            required = "Este campo es requerido."
            missing = {field: [required] for field in ("people", "form", "tiers") if attrs.get(field) is None}
            if missing:
                raise serializers.ValidationError(missing)
            return attrs
        if attrs["people"] is not None:
            raise serializers.ValidationError({"people": [SMALL_SIZE_PEOPLE_MESSAGE]})
        # Vitrina y mini son redondos y de 1 piso: lo que llegue distinto lo rechaza el precio con su motivo.
        attrs.setdefault("form", CakeShape.ROUND)
        attrs.setdefault("tiers", 1)
        return attrs

    @staticmethod
    def to_request(data) -> DesignRequest:
        return DesignRequest(
            cake_size=data["cake_size"],
            source_product=data["source_product"],
            people=data["people"],
            form=data["form"],
            tiers=data["tiers"],
            cake_type=data["cake_type"],
            bread=data["bread"],
            filling_base=data["filling_base"],
            filling_flavors=tuple(data["filling_flavors"]),
            coverage_color=data["coverage_color"],
            decoration=data["decoration"],
            decoration_color=data["decoration_color"],
            decoration_image_id=data["decoration_image_id"],
            message_layout=MessageLayout(**data["message_layout"]) if data["message_layout"] else None,
            wafer=data["wafer"],
            wafer_layout=WaferLayout(**data["wafer_layout"]) if data["wafer_layout"] else None,
            wafer_image_id=data["wafer_image_id"],
            occasion=data["occasion"] or "",
            side_comb=data["side_comb"],
        )


# Las líneas que manda el carrito; `reference` solo nace al aceptar una cotización (D70).
CART_LINE_KINDS = [choice for choice in OrderLineKind.choices if choice[0] != OrderLineKind.REFERENCE]


class OrderItemRequestSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(
        choices=CART_LINE_KINDS,
        help_text="`order` (encargo del catálogo), `showcase` (vitrina de hoy) o `design` (\"Diseña tu pastel\").",
    )
    offering_id = serializers.IntegerField(
        required=False, min_value=1, help_text="Con `order` y `showcase`: el id de la presentación."
    )
    quantity = serializers.IntegerField(
        required=False,
        default=1,
        min_value=1,
        max_value=MAX_LINE_QUANTITY,
        help_text="Con `order` y `showcase`. Un diseño es siempre una pieza.",
        error_messages={"min_value": "Pide al menos una pieza.", "max_value": "Son demasiadas piezas para pedir en línea."},
    )
    design = OrderDesignSerializer(required=False, help_text="Con `design`.")

    def validate(self, attrs):
        if attrs["kind"] == OrderLineKind.DESIGN:
            if "design" not in attrs:
                raise serializers.ValidationError({"design": ["Falta el diseño de tu pastel."]})
            if "offering_id" in attrs:
                raise serializers.ValidationError({"offering_id": ["Un diseño no lleva presentación del catálogo."]})
        else:
            if "offering_id" not in attrs:
                raise serializers.ValidationError({"offering_id": ["Indica la presentación."]})
            if "design" in attrs:
                raise serializers.ValidationError({"design": ["Una presentación del catálogo no lleva diseño."]})
        return attrs


class OrderCreateSerializer(serializers.Serializer):
    """El pedido que manda el carrito. Cualquier monto, depósito, `requiresQuote` o id de diseño se ignora."""

    fulfillment = serializers.ChoiceField(
        choices=Fulfillment.choices,
        help_text="Por ahora solo `pickup`; `delivery` responde 400 y remite a WhatsApp.",
    )
    delivery_date = serializers.DateField(help_text="Día en que se recoge, AAAA-MM-DD.")
    slot_starts_at = _hh_mm_input("La hora en que empieza el lapso elegido, HH:MM (de `delivery-slots/`).")
    pickup_name = StrictCharField(
        max_length=PICKUP_NAME_MAX_LENGTH,
        help_text=(
            "Quién recoge el pedido (D66): las mismas reglas que el nombre del registro. Se guarda con los espacios juntos."
        ),
        error_messages={
            "blank": "Escribe el nombre de quien recoge.",
            "required": "Escribe el nombre de quien recoge.",
            "max_length": f"Escribe el nombre en {PICKUP_NAME_MAX_LENGTH} caracteres o menos.",
        },
    )
    pickup_phone = StrictCharField(
        max_length=20,
        help_text="Su teléfono: 10 dígitos. Los espacios, guiones, puntos y paréntesis se quitan.",
        error_messages={"blank": PHONE_ERROR, "required": PHONE_ERROR, "max_length": PHONE_ERROR},
    )
    items = OrderItemRequestSerializer(
        many=True,
        allow_empty=False,
        max_length=MAX_ORDER_LINES,
        help_text="Las líneas del carrito, en su orden.",
        error_messages={"empty": "Tu pedido está vacío.", "not_a_list": "Las líneas van en una lista."},
    )

    def validate_pickup_name(self, value):
        if has_forbidden_name_characters(value):
            raise serializers.ValidationError("Escribe el nombre solo con letras, espacios y signos comunes.")
        return " ".join(value.split())

    def validate_pickup_phone(self, value):
        digits = PHONE_SEPARATORS.sub("", value)
        if not PICKUP_PHONE.fullmatch(digits):
            raise serializers.ValidationError(PHONE_ERROR)
        return digits

    def to_request(self, idempotency_key: str) -> OrderRequest:
        data = self.validated_data
        return OrderRequest(
            idempotency_key=idempotency_key,
            fulfillment=data["fulfillment"],
            delivery_date=data["delivery_date"],
            slot_starts_at=data["slot_starts_at"],
            pickup_name=data["pickup_name"],
            pickup_phone=data["pickup_phone"],
            items=tuple(
                LineRequest(
                    kind=item["kind"],
                    offering_id=item.get("offering_id"),
                    quantity=item["quantity"] if item["kind"] != OrderLineKind.DESIGN else 1,
                    design=OrderDesignSerializer.to_request(item["design"]) if "design" in item else None,
                )
                for item in data["items"]
            ),
        )


# --- Pedidos (salida) ---


class BlankAsNullCharField(serializers.CharField):
    """Un texto que, vacío, sale como `null`."""

    def __init__(self, **kwargs):
        super().__init__(allow_null=True, **kwargs)

    def to_representation(self, value):
        return value or None


class OrderStandSerializer(serializers.Serializer):
    """La base del pastel (regla 7), con su depósito; `null` si los kilos no llevan base."""

    min_kg = serializers.IntegerField(source="stand_min_kg")
    max_kg = serializers.IntegerField(source="stand_max_kg")
    deposit = money(source="stand_deposit")

    def to_representation(self, instance):
        return None if instance.stand_max_kg is None else super().to_representation(instance)


class OrderDesignOutSerializer(serializers.Serializer):
    cake_size = serializers.ChoiceField(choices=CakeDesignSize.choices)
    cake_size_label = serializers.SerializerMethodField(
        help_text='"Pastel de 4 kg, 30 personas", "Pastel mini, ~3 personas" o "Pastel de vitrina, ~19 personas".'
    )
    source_product = serializers.SlugField(
        allow_null=True, help_text="El pastel de vitrina de \"Personalizar este pastel\"; `null` si se armó desde cero."
    )
    people = serializers.IntegerField(
        allow_null=True, help_text="Por kilos, las del cliente; vitrina y mini, las que rinden (`null` si no se definen)."
    )
    kg = serializers.IntegerField(allow_null=True, help_text="Calculados por el servidor; `null` en vitrina y mini.")
    form = serializers.ChoiceField(choices=CakeShape.choices)
    tiers = serializers.IntegerField()
    cake_type = serializers.ChoiceField(choices=CakeType.choices)
    bread = serializers.SlugField()
    filling_base = serializers.SlugField(allow_null=True)
    filling_flavors = serializers.ListField(child=serializers.SlugField())
    coverage_color = serializers.CharField(help_text="`#rrggbb`.")
    coverage_color_name = BlankAsNullCharField(help_text="\"Parecido a\", calculado por el servidor; `null` si ninguno.")
    side_comb = serializers.BooleanField(help_text="Peinado lateral de la cobertura; sin él, los costados van lisos.")
    decoration = serializers.SlugField()
    decoration_color = serializers.CharField(allow_null=True, help_text="`null`: automático.")
    decoration_color_name = BlankAsNullCharField()
    decoration_image_id = serializers.UUIDField(allow_null=True)
    message_layout = MessageLayoutSerializer(source="message", allow_null=True)
    wafer = serializers.BooleanField()
    wafer_layout = WaferLayoutSerializer(allow_null=True)
    wafer_image_id = serializers.UUIDField(allow_null=True)
    occasion = BlankAsNullCharField()
    price_per_kg = money(allow_null=True, help_text="`null` en vitrina y mini: no se cobran por kilo.")
    cake_subtotal = money()
    wafer_price = money()
    decoration_price = money(
        help_text="Con una decoración por cotizar es 0 hasta que la pastelería le pone precio; después, ese precio."
    )
    total = money(help_text="Sin el depósito de la base.")
    requires_quote = serializers.BooleanField()
    stand = OrderStandSerializer(source="*", allow_null=True)
    bread_name = serializers.CharField(help_text="El nombre del pan, para mostrarlo (D69).")
    filling_base_name = serializers.CharField(allow_null=True, help_text="`null` con el relleno incluido en el pan.")
    filling_flavor_names = serializers.ListField(child=serializers.CharField())
    decoration_name = serializers.CharField()

    def get_cake_size_label(self, design) -> str:
        return pricing_service.describe_cake_size(design.cake_size, design.kg, design.people)


class ReferenceCakeSerializer(serializers.Serializer):
    """El pastel de un envío de referencia (D70): personas, kilos, sabor con sus nombres y la base."""

    people = serializers.IntegerField()
    kg = serializers.IntegerField(allow_null=True, help_text="Salen de las personas (regla 3.1).")
    cake_type = serializers.ChoiceField(
        choices=[("", ""), *CakeType.choices], allow_blank=True, help_text="Vacío solo en solicitudes viejas."
    )
    cake_type_label = serializers.SerializerMethodField()
    bread = serializers.SlugField(allow_null=True)
    bread_name = serializers.CharField(allow_null=True)
    filling_base = serializers.SlugField(allow_null=True, help_text="`null` con un pan de relleno incluido.")
    filling_base_name = serializers.CharField(allow_null=True)
    filling_flavors = serializers.ListField(child=serializers.SlugField())
    filling_flavor_names = serializers.ListField(child=serializers.CharField())
    stand = OrderStandSerializer(source="*", allow_null=True)

    def get_cake_type_label(self, cake) -> str | None:
        return CakeType(cake.cake_type).label if cake.cake_type else None


class OrderItemSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=OrderLineKind.choices)
    offering_id = serializers.IntegerField(allow_null=True)
    product_name = BlankAsNullCharField(help_text="El nombre del producto al hacer el pedido; `null` en un diseño.")
    presentation = BlankAsNullCharField(help_text="`whole`, `slice`, `mini`...; `null` en un diseño.")
    quantity = serializers.IntegerField()
    unit_price = money()
    line_total = money()
    design = OrderDesignOutSerializer(allow_null=True)
    reference = ReferenceCakeSerializer(
        allow_null=True, help_text="En la línea `reference`: el pastel de su envío de referencia (D70); si no, `null`."
    )
    image = serializers.SerializerMethodField(
        help_text=(
            "D103: el archivo en `/fotos/` de la imagen de la tarjeta del catálogo (la del modelo o la foto). Sale del "
            "catálogo de hoy, no de cuando se hizo el pedido. `null` en un diseño (su cobertura y su decoración son "
            "libres: solo vale la captura que guardó la pestaña que hizo el pedido), en una cotización y sin foto."
        )
    )
    product_slug = serializers.SerializerMethodField(
        help_text=(
            "El producto de la presentación; `null` en un diseño y en una cotización. Con él, el frontend pone la "
            "imagen del modelo de un postre (D97)."
        )
    )

    def get_image(self, item) -> str | None:
        return catalog_service.order_line_image(item.image_source, item.presentation)

    def get_product_slug(self, item) -> str | None:
        return item.image_source.product_slug if item.image_source else None


class OrderPaymentSerializer(serializers.Serializer):
    """Lo que se paga hoy y el día de la entrega (regla 10); `null` mientras el pedido espera cotización."""

    advance_percent = serializers.IntegerField()
    advance = money(help_text="El anticipo del pedido, sin la base ni el envío. Incluye completo `paid_in_full`.")
    paid_in_full = money(
        help_text=(
            "La parte del pedido que se paga completa hoy: lo de la vitrina de hoy. Al resto se le aplica el porcentaje."
        )
    )
    base_deposit = money(source="stand_deposit", help_text="Depósitos de las bases, completos y aparte.")
    delivery_fee = money(help_text="Envío, completo y aparte; $0 al recoger en la pastelería.")
    pay_today = money()
    pay_on_delivery = money()

    def to_representation(self, instance):
        return None if instance.advance is None else super().to_representation(instance)


def _stand_status_label(status: str | None) -> str | None:
    """La etiqueta en español del estado de la base (regla 12); `null` antes de la entrega."""
    return StandLoanStatus(status).label if status else None


class OrderStandStatusSerializer(serializers.Serializer):
    """La base de un diseño del pedido y su préstamo (D69): antes de la entrega, sin estado y con la fecha prevista."""

    kg = serializers.IntegerField(help_text='Los kilos del pastel: "Base para <kg> kg".')
    deposit = money(help_text="El depósito de la base, que se paga completo con el anticipo.")
    return_days = serializers.IntegerField(help_text="Días para devolverla desde la entrega (`stand_return_days`).")
    return_by = serializers.DateField(
        help_text=(
            "Antes de la entrega, la fecha prevista (día de entrega más `return_days`); desde la entrega, la del "
            "préstamo."
        )
    )
    status = serializers.ChoiceField(
        choices=StandLoanStatus.choices, allow_null=True, help_text="`null` hasta que se entrega el pedido."
    )
    status_label = serializers.SerializerMethodField()
    returned_at = serializers.DateTimeField(allow_null=True)

    def get_status_label(self, stand) -> str | None:
        return _stand_status_label(stand.status)


class PaidWithSerializer(serializers.Serializer):
    """El cobro que pagó el pedido: su método y cuándo se confirmó; `null` sin pago."""

    method = serializers.ChoiceField(choices=PaymentMethod.choices, source="paid_with")
    method_label = serializers.SerializerMethodField()
    paid_at = serializers.DateTimeField()

    def get_method_label(self, order) -> str:
        return PaymentMethod(order.paid_with).label

    def to_representation(self, instance):
        return super().to_representation(instance) if instance.paid_with else None


class OrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    status = serializers.ChoiceField(
        choices=OrderStatus.choices,
        help_text=(
            "`awaiting_payment` (apartado, falta el pago) o `awaiting_quote` al crearse. Lo cambian los servicios y el "
            "personal desde el admin, solo por las transiciones permitidas; nunca esta API. Un apartado vencido o una "
            "cotización vencida pasan a `cancelled`."
        ),
    )
    fulfillment = serializers.ChoiceField(choices=Fulfillment.choices)
    pickup_name = serializers.CharField(help_text="Quién recoge el pedido.")
    pickup_phone = serializers.CharField(help_text="Su teléfono, 10 dígitos.")
    delivery_date = serializers.DateField()
    slot_starts_at = _hh_mm_input("")
    slot_ends_at = _hh_mm_input("")
    subtotal = money(help_text="El pedido, sin la base ni el envío.")
    stand_deposit = money(help_text="Depósitos de las bases.")
    delivery_fee = money()
    payment = OrderPaymentSerializer(source="*", allow_null=True)
    payment_due_at = serializers.DateTimeField(
        allow_null=True, help_text="El pedido apartado se cancela si no se paga antes; `null` si espera cotización."
    )
    created_at = serializers.DateTimeField()
    items = OrderItemSerializer(many=True)
    # D69: lo que piden la confirmación, "Mis pedidos" y el detalle.
    status_label = serializers.SerializerMethodField(help_text="La etiqueta del estado (regla 12).")
    status_changed_at = serializers.DateTimeField(allow_null=True, help_text="Desde cuándo está en este estado.")
    note_available = serializers.SerializerMethodField(
        help_text="Si ya hay nota en PDF (`GET orders/<id>/note.pdf`): desde `received`."
    )
    paid_with = PaidWithSerializer(source="*", allow_null=True)
    stands = serializers.SerializerMethodField(
        help_text=(
            "Una por pastel que lleva base con depósito (un diseño o el de un envío de referencia); vacía si el pedido "
            "no lleva base."
        )
    )

    def get_status_label(self, order) -> str:
        return OrderStatus(order.status).label

    def get_note_available(self, order) -> bool:
        return note_service.has_note(order.status)

    @extend_schema_field(OrderStandStatusSerializer(many=True))
    def get_stands(self, order):
        # Los días para devolver la base se leen una vez por respuesta, no una vez por pedido de la lista.
        context = self.context
        if "stand_return_days" not in context:
            context["stand_return_days"] = warranty_service.stand_return_days()
        stands = note_service.order_stands(order, context["stand_return_days"])
        return OrderStandStatusSerializer(stands, many=True).data


# --- Bases prestadas y verificación de la nota (D69) ---


class StandLoanSerializer(serializers.Serializer):
    """Una base del cliente en "Bases en préstamo"."""

    id = serializers.IntegerField()
    order_id = serializers.IntegerField()
    kg = serializers.IntegerField(help_text='Los kilos del pastel: "Base para <kg> kg".')
    deposit = money(help_text="El depósito retenido mientras la tiene.")
    status = serializers.ChoiceField(choices=StandLoanStatus.choices)
    status_label = serializers.SerializerMethodField()
    delivered_on = serializers.DateField()
    due_date = serializers.DateField(help_text="Devolverla antes de esta fecha.")
    returned_at = serializers.DateTimeField(allow_null=True)
    deposit_refunded = serializers.BooleanField()

    def get_status_label(self, loan) -> str:
        return StandLoanStatus(loan.status).label


class NoteDeliverySerializer(serializers.Serializer):
    fulfillment = serializers.ChoiceField(choices=Fulfillment.choices)
    fulfillment_label = serializers.SerializerMethodField()
    date = serializers.DateField(source="delivery_date")
    starts_at = _hh_mm_input("")
    ends_at = _hh_mm_input("")

    def get_fulfillment_label(self, note) -> str:
        return Fulfillment(note.fulfillment).label


class NoteStandSerializer(serializers.Serializer):
    kg = serializers.IntegerField()
    deposit = money()
    status = serializers.ChoiceField(
        choices=StandLoanStatus.choices, allow_null=True, help_text="`null` hasta que se entrega el pedido."
    )
    status_label = serializers.SerializerMethodField()
    return_by = serializers.DateField()
    returned_at = serializers.DateTimeField(allow_null=True)

    def get_status_label(self, stand) -> str | None:
        return _stand_status_label(stand.status)


class NoteVerificationSerializer(serializers.Serializer):
    """Solo lo que fija la regla 11: nunca teléfono, correo ni dirección."""

    valid = serializers.SerializerMethodField(help_text="Siempre `true`: una nota que no vale responde 404.")
    order_id = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    customer = serializers.CharField(help_text='El nombre y la inicial del apellido, por ejemplo "Mariana P.".')
    delivery = NoteDeliverySerializer(source="*")
    stands = NoteStandSerializer(many=True)

    def get_valid(self, note) -> bool:
        return True
