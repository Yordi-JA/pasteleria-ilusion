"""DTOs: validan la entrada y dan forma a la salida JSON."""
from rest_framework import serializers

from ..models import Bread, CakeShape, CakeType, Presentation, Product, ProductCategory, SalesChannel
from ..services.pricing_service import CakeDesignChoice

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
            "Solo en un pan con relleno incluido: lo que lleva encima la crema pastelera blanca en la vista previa. "
            "Mismos valores que `preview_style` de los sabores; `smooth` si es liso."
        )
    )
    included_filling_preview_color_secondary = serializers.CharField(
        help_text="Color de los trozos del relleno incluido; vacío si es liso."
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
            "`smooth` (liso), `fruit_slices` (rebanadas de fruta), `fruit_chunks` (trozos de fruta), "
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
    wafer_price = money()
    wafer_max_width_cm = serializers.DecimalField(max_digits=4, decimal_places=1)
    wafer_max_height_cm = serializers.DecimalField(max_digits=4, decimal_places=1)
    message_suggested_max_words = serializers.IntegerField()


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


# --- Precio (entrada y salida) ---


class CakeDesignPriceRequestSerializer(serializers.Serializer):
    """Elecciones del cliente. Cualquier monto que mande se ignora: el servidor lo calcula.

    Forma (`form`) y pisos (`tiers`) no cambian el precio y son opcionales;
    si llegan, se validan (regla 3.3: los kilos mínimos por pisos bloquean).

    El tamaño llega como `people` (el servidor calcula los kilos, regla 3.1) o
    como `kg`, nunca los dos.
    """

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
        if has_people and has_kg:
            raise serializers.ValidationError({"people": ["Indica las personas o los kilos, no los dos."]})
        if not has_people and not has_kg:
            raise serializers.ValidationError({"people": ["Indica para cuántas personas es el pastel."]})
        return attrs

    def to_choice(self, kg: int) -> CakeDesignChoice:
        """La elección con los kilos ya resueltos (los mandados o los calculados por personas)."""
        data = self.validated_data
        return CakeDesignChoice(
            kg=kg,
            cake_type=data["cake_type"],
            bread=data["bread"],
            filling_base=data.get("filling_base"),
            filling_flavors=tuple(data["filling_flavors"]),
            decoration=data.get("decoration"),
            wafer=data["wafer"],
            tiers=data.get("tiers"),
            form=data.get("form"),
        )


class StandDepositSerializer(serializers.Serializer):
    """Base que toca al pedido; `null` si los kilos no llevan base."""

    min_kg = serializers.IntegerField(source="stand.min_kg")
    max_kg = serializers.IntegerField(source="stand.max_kg")
    deposit = money(help_text="Se cobra aparte del pedido y se devuelve al regresar la base.")

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
    """Desglose del precio. Con `size.above_maximum`, los montos, `kg` y `stand` salen en `null`."""

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


class CardOfferingSerializer(serializers.Serializer):
    id = serializers.IntegerField(help_text="Id de la presentación; con él se agrega al pedido.")
    presentation = serializers.ChoiceField(choices=Presentation.choices)
    price = money()


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
    offerings = CardOfferingSerializer(many=True, help_text="Presentaciones activas, en el orden del admin.")


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


class StockItemSerializer(serializers.Serializer):
    offering_id = serializers.IntegerField(help_text="Id de la presentación; con él se agrega al pedido.")
    product_slug = serializers.SlugField()
    product_name = serializers.CharField()
    category = serializers.ChoiceField(choices=ProductCategory.choices)
    presentation = serializers.ChoiceField(choices=Presentation.choices)
    price = money()
    photo = _photo_field()
    stock = serializers.IntegerField(min_value=0, help_text="\"Quedan [n]\".")
    sold_out = serializers.BooleanField(help_text="`true` con `stock` en 0: \"Agotada por hoy\".")


class TodayStockSerializer(serializers.Serializer):
    date = serializers.DateField(help_text="Fecha de hoy en la pastelería (Ciudad de México), AAAA-MM-DD.")
    items = StockItemSerializer(
        many=True, help_text="Lo cargado hoy, en el orden del catálogo; lo no cargado no sale."
    )
