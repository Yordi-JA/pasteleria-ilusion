"""Precio del pedido en "Diseña tu pastel" con estrategias intercambiables (Strategy).

Cada forma de cobrar es una estrategia elegida desde un registro, sin cadenas
`if/elif`: el pan por su `BreadPricingMode` (incremento por kilo o precio
completo con relleno incluido) y la decoración por su `DecorationPricing`
(incluida, precio fijo o por cotizar). El relleno es otra estrategia, que el
pan de incremento usa y el de precio completo rechaza. La oblea es un precio
fijo de la configuración (`CakeDesignSettings.wafer_price`); vacío es PENDIENTE
y la oblea no se puede pedir.

El tamaño (tanda 2 de correcciones) es otra estrategia (`SIZE_PRICING_STRATEGIES`):
por kilos (precio por kilo por los kilos), de vitrina (el precio de catálogo de
su grupo más la diferencia por kilo contra la referencia, o el del producto si
sale de su ficha) o mini (siempre el precio de «Pastel mini»). La decoración y la
oblea se suman aparte en los tres; el mini no lleva oblea y solo las decoraciones
marcadas para él.

Todas las cifras salen de los repositorios, que se reciben por parámetro (en
las pruebas, los de `repositories/memory.py`). Forma y pisos no cambian el
precio. Los montos son `Decimal` con dos decimales.
"""
from dataclasses import dataclass, replace
from decimal import ROUND_HALF_UP, Decimal
from typing import NoReturn

from ..models import (
    BreadPricingMode,
    CakeDesignSize,
    CakeShape,
    CakeType,
    DecorationPricing,
    Presentation,
    ProductCategory,
    SalesChannel,
)
from ..repositories import cake_option_repo, product_repo, settings_repo
from ..repositories.records import (
    BreadRecord,
    CakeDesignSettingsRecord,
    DecorationRecord,
    DesignSizeRecord,
    FillingBaseRecord,
    FillingFlavorRecord,
    GroupPrice,
    ProductRecord,
)
from . import cake_lid
from .audit import audit_operation
from .design_layout import (
    MessageLayout,
    WaferLayout,
    check_message_block,
    check_message_layout,
    check_message_letter,
    check_wafer_layout,
)
from .errors import DomainValidationError, attempt, raise_all
from .warranty_service import NO_DEPOSIT, StandDeposit, effective_cake_design_limits, get_stand_deposit

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
PENDING_PRICE_REASON = "Precio por confirmar"
CAKE_TYPE_LABELS = dict(CakeType.choices)
CAKE_SIZE_LABELS = dict(CakeDesignSize.choices)


class CakeDesignError(DomainValidationError):
    """Una elección de "Diseña tu pastel" no cumple las reglas."""


class PendingPriceError(CakeDesignError):
    """La opción elegida aún no tiene precio (PENDIENTE)."""


@dataclass(frozen=True)
class CakeDesignChoice:
    """Lo que el cliente eligió.

    Forma y pisos no cambian el precio, pero se validan (regla 3.3) si llegan; el acomodo de la oblea y del mensaje
    (paso 7) tampoco lo cambia y se valida igual. `kg` solo va en un pastel por kilos: el de vitrina y el mini no se
    piden por kilos. `source_product` es el `slug` del pastel de vitrina de "Personalizar este pastel".
    """

    kg: int | None
    cake_type: str
    bread: str
    filling_base: str | None = None
    filling_flavors: tuple[str, ...] = ()
    decoration: str | None = None
    wafer: bool = False
    tiers: int | None = None
    form: str | None = None
    wafer_layout: WaferLayout | None = None
    message_layout: MessageLayout | None = None
    cake_size: str = CakeDesignSize.BY_WEIGHT.value
    source_product: str | None = None


@dataclass(frozen=True)
class PriceBreakdown:
    """Desglose del precio. La decoración por cotizar no se suma: `requires_quote` lo avisa.

    El pastel de vitrina y el mini no tienen kilos ni precio por kilo (`None`): `cake_subtotal` es su precio.
    """

    price_per_kg: Decimal | None
    kg: int | None
    cake_subtotal: Decimal
    wafer: Decimal
    decoration: Decimal
    total: Decimal
    requires_quote: bool
    # Un estimado ("Desde $X") puede ir sin sabores: ningún pedido debe aceptar un desglose así.
    is_estimate: bool = False
    cake_size: str = CakeDesignSize.BY_WEIGHT.value


# --- Motivos por tipo de pastel (regla 4.7) ---


def _type_name(cake_type: str) -> str:
    return f"pastel {CAKE_TYPE_LABELS[cake_type].lower()}"


# Códigos del motivo, para que la interfaz arme sus frases sin leer el texto.
NOT_OFFERED = "not_offered"
NOT_COMBINABLE = "not_combinable"
ONLY_IN = "only_in"


@dataclass(frozen=True)
class Unavailable:
    """Por qué una opción no se ofrece en un tipo de pastel: un código estable y el texto de la regla 4.7."""

    code: str
    reason: str


def _not_offered(cake_type: str) -> Unavailable:
    """Un pan, base o sabor que no se ofrece en ese tipo por los datos (D32)."""
    return Unavailable(NOT_OFFERED, f"No disponible en {_type_name(cake_type)}")


def _bread_type_unavailable(bread: BreadRecord, cake_type: str) -> Unavailable | None:
    """Motivo por `allowed_cake_types` del pan, con el texto de la regla 4.7."""
    allowed = bread.allowed_cake_types
    if cake_type in allowed:
        return None
    # Un pan de un solo tipo dice cuál es ("Solo en pastel seco"); los demás,
    # con qué tipo no van ("No se combina con pastel envinado").
    if len(allowed) == 1:
        return Unavailable(ONLY_IN, f"Solo en {_type_name(allowed[0])}")
    return Unavailable(NOT_COMBINABLE, f"No se combina con {_type_name(cake_type)}")


def _reason(unavailable: Unavailable | None) -> str | None:
    return None if unavailable is None else unavailable.reason


def _as_sentence(name: str, reason: str) -> str:
    """`("Red velvet", "Solo en pastel seco")` -> "Red velvet: solo en pastel seco."."""
    return f"{name}: {reason[:1].lower()}{reason[1:]}."


def _fail(field: str, message: str, error_class=CakeDesignError) -> NoReturn:
    raise error_class({field: [message]})


# --- Estrategia del relleno ---


class FillingPricing:
    """Precio por kilo del relleno para un tipo de pastel (tabla 4.5).

    Una base se ofrece en un tipo si tiene su precio general y al menos un
    sabor que se ofrezca en ese tipo. Un sabor con precio propio reemplaza el
    general; con dos sabores se toma el mayor y se suma el cargo por combinado
    de la base (así sale "Nuez + $5").

    Las mismas preguntas (`*_unavailable_reason`) las usan el cálculo para
    rechazar y las opciones para desactivar, así nunca se contradicen.
    """

    def __init__(
        self,
        cake_type: str,
        bases: list[FillingBaseRecord],
        price_table: dict[tuple[str, str, str | None], Decimal],
    ):
        self.cake_type = cake_type
        self._bases = {base.slug: base for base in bases}
        self._prices = price_table
        self._known_flavors = {flavor.slug: flavor for base in bases for flavor in base.flavors}

    def general_price(self, base: FillingBaseRecord) -> Decimal | None:
        return self._prices.get((self.cake_type, base.slug, None))

    def own_price(self, base: FillingBaseRecord, flavor: FillingFlavorRecord) -> Decimal | None:
        return self._prices.get((self.cake_type, base.slug, flavor.slug))

    def flavor_unavailable(self, flavor: FillingFlavorRecord) -> Unavailable | None:
        return None if self.cake_type in flavor.allowed_cake_types else _not_offered(self.cake_type)

    def flavor_unavailable_reason(self, flavor: FillingFlavorRecord) -> str | None:
        return _reason(self.flavor_unavailable(flavor))

    def base_unavailable(self, base: FillingBaseRecord) -> Unavailable | None:
        offered = self.general_price(base) is not None and any(
            self.flavor_unavailable(flavor) is None for flavor in base.flavors
        )
        return None if offered else _not_offered(self.cake_type)

    def base_unavailable_reason(self, base: FillingBaseRecord) -> str | None:
        return _reason(self.base_unavailable(base))

    def available_bases(self) -> list[FillingBaseRecord]:
        return [base for base in self._bases.values() if self.base_unavailable_reason(base) is None]

    def cheapest_general_price(self) -> Decimal | None:
        return min(map(self.general_price, self.available_bases()), default=None)

    def price_per_kg(
        self, base_slug: str | None, flavor_slugs: tuple[str, ...], estimate: bool = False
    ) -> Decimal:
        """Precio por kilo del relleno. En un estimado sin sabores, el precio general de la base."""
        base = self._base(base_slug)
        reason = self.base_unavailable_reason(base)
        if reason:
            _fail("filling_base", _as_sentence(base.name, reason))
        general = self.general_price(base)
        if estimate and not flavor_slugs:
            return general
        flavors = self._flavors(base, flavor_slugs)
        own_prices = [p for p in (self.own_price(base, f) for f in flavors) if p is not None]
        price = max(own_prices, default=general)
        if len(flavors) > 1:
            price += base.combined_extra_per_kg
        return price

    def _base(self, slug: str | None) -> FillingBaseRecord:
        if not slug:
            _fail("filling_base", "Elige la base del relleno.")
        base = self._bases.get(slug)
        if base is None:
            _fail("filling_base", "Esa base de relleno no existe o no está disponible.")
        return base

    def _flavors(self, base: FillingBaseRecord, slugs: tuple[str, ...]) -> list[FillingFlavorRecord]:
        if not slugs:
            _fail("filling_flavors", "Elige el sabor del relleno.")
        if len(set(slugs)) != len(slugs):
            _fail("filling_flavors", "No repitas el sabor.")
        if len(slugs) > base.max_flavors:
            limit = (
                "un solo sabor" if base.max_flavors == 1 else f"máximo {base.max_flavors} sabores"
            )
            _fail("filling_flavors", f"La base {base.name} lleva {limit}.")
        offered = {flavor.slug for flavor in base.flavors}
        flavors = []
        for slug in slugs:
            flavor = self._known_flavors.get(slug)
            if flavor is None:
                _fail("filling_flavors", f"El sabor «{slug}» no existe o no está disponible.")
            if slug not in offered:
                _fail("filling_flavors", f"{flavor.name} no se ofrece en la base {base.name}.")
            reason = self.flavor_unavailable_reason(flavor)
            if reason:
                _fail("filling_flavors", _as_sentence(flavor.name, reason))
            if len(slugs) > 1 and not flavor.is_combinable:
                _fail("filling_flavors", _as_sentence(flavor.name, "No se combina con otro sabor"))
            flavors.append(flavor)
        return flavors


# --- Estrategias del pan ---


class ExtraPerKgBreadPricing:
    """Pan con incremento por kilo: relleno elegido + incremento del pan."""

    def unavailable(self, filling: FillingPricing) -> Unavailable | None:
        """Sin ninguna base que se ofrezca en el tipo, el pan no se puede armar."""
        return None if filling.available_bases() else _not_offered(filling.cake_type)

    def filling_per_kg(self, choice: CakeDesignChoice, filling: FillingPricing, estimate: bool = False) -> Decimal:
        return filling.price_per_kg(choice.filling_base, choice.filling_flavors, estimate)

    def price_per_kg(self, bread: BreadRecord, filling_per_kg: Decimal) -> Decimal:
        return filling_per_kg + bread.price_per_kg

    def price_per_kg_from(self, bread: BreadRecord, cheapest_filling: Decimal | None) -> Decimal | None:
        """Lo que la interfaz muestra como "Desde $X por kg"; sin relleno en ese tipo, nada."""
        return None if cheapest_filling is None else self.price_per_kg(bread, cheapest_filling)

    def showcase_group(self, bread: BreadRecord, base: FillingBaseRecord | None) -> GroupPrice | None:
        """En el pastel de vitrina, el grupo de catálogo lo da la base del relleno."""
        return base.showcase_price if base is not None else None

    def showcase_extra_per_kg(self, price_per_kg: Decimal, reference_per_kg: Decimal | None) -> Decimal | None:
        """Lo que cuesta de más por kilo lo elegido contra la referencia del grupo (nunca menos de 0)."""
        return None if reference_per_kg is None else max(ZERO, price_per_kg - reference_per_kg)


class FullPriceBreadPricing:
    """Pan de precio completo (Choco-pingüino, Red velvet): trae su relleno y no lleva otro."""

    def unavailable(self, filling: FillingPricing) -> Unavailable | None:
        return None

    def filling_per_kg(self, choice: CakeDesignChoice, filling: FillingPricing, estimate: bool = False) -> Decimal:
        if choice.filling_base or choice.filling_flavors:
            field = "filling_base" if choice.filling_base else "filling_flavors"
            _fail(field, "Este pan ya trae su relleno; no se elige otro.")
        return ZERO

    def price_per_kg(self, bread: BreadRecord, filling_per_kg: Decimal) -> Decimal:
        return bread.price_per_kg

    def price_per_kg_from(self, bread: BreadRecord, cheapest_filling: Decimal | None) -> Decimal:
        return bread.price_per_kg

    def showcase_group(self, bread: BreadRecord, base: FillingBaseRecord | None) -> GroupPrice | None:
        """Choco-pingüino y Red velvet: el precio de su pastel completo del catálogo."""
        return bread.showcase_price

    def showcase_extra_per_kg(self, price_per_kg: Decimal, reference_per_kg: Decimal | None) -> Decimal:
        """Su precio completo ya es el del grupo: no hay diferencia."""
        return ZERO


BREAD_PRICING_STRATEGIES = {
    BreadPricingMode.EXTRA_PER_KG.value: ExtraPerKgBreadPricing(),
    BreadPricingMode.FULL_PRICE_PER_KG.value: FullPriceBreadPricing(),
}


def bread_unavailable(bread: BreadRecord, filling: FillingPricing) -> Unavailable | None:
    """Por qué el pan no se ofrece en el tipo de `filling`, o `None` si se ofrece.

    Primero su `allowed_cake_types` (regla 4.7); después, lo que diga su
    estrategia sobre el relleno de ese tipo.
    """
    strategy = BREAD_PRICING_STRATEGIES[bread.pricing_mode]
    return _bread_type_unavailable(bread, filling.cake_type) or strategy.unavailable(filling)


def bread_unavailable_reason(bread: BreadRecord, filling: FillingPricing) -> str | None:
    return _reason(bread_unavailable(bread, filling))


# --- Estrategias de la decoración ---


class IncludedDecorationPricing:
    """"Sin decoración": no cuesta."""

    requires_quote = False

    def is_price_pending(self, decoration: DecorationRecord) -> bool:
        return False

    def unavailable_reason(self, decoration: DecorationRecord) -> str | None:
        return None

    def amount(self, decoration: DecorationRecord) -> Decimal:
        return ZERO


class FixedDecorationPricing:
    """Precio fijo. Sin precio es PENDIENTE: no se puede elegir y nunca se cobra como $0."""

    requires_quote = False

    def is_price_pending(self, decoration: DecorationRecord) -> bool:
        return decoration.price is None

    def unavailable_reason(self, decoration: DecorationRecord) -> str | None:
        return PENDING_PRICE_REASON if self.is_price_pending(decoration) else None

    def amount(self, decoration: DecorationRecord) -> Decimal:
        if self.is_price_pending(decoration):
            _fail("decoration", PENDING_PRICE_REASON, PendingPriceError)
        return decoration.price


class QuoteDecorationPricing:
    """"Otra decoración": la pastelería pone el precio después; aquí no se suma.

    Su precio vacío es a propósito, no PENDIENTE.
    """

    requires_quote = True

    def is_price_pending(self, decoration: DecorationRecord) -> bool:
        return False

    def unavailable_reason(self, decoration: DecorationRecord) -> str | None:
        return None

    def amount(self, decoration: DecorationRecord) -> Decimal:
        return ZERO


DECORATION_PRICING_STRATEGIES = {
    DecorationPricing.INCLUDED.value: IncludedDecorationPricing(),
    DecorationPricing.FIXED.value: FixedDecorationPricing(),
    DecorationPricing.QUOTE.value: QuoteDecorationPricing(),
}

# Unas chispas cuyo sabor o pan está desactivado no tienen de dónde dibujarse: no se pueden elegir ni cotizar.
SPRINKLE_SOURCE_REASON = "No disponible por ahora"


def decoration_unavailable_reason(decoration: DecorationRecord) -> str | None:
    """Por qué no se puede elegir una decoración: lo que diga su estrategia o el origen desactivado de sus chispas."""
    reason = DECORATION_PRICING_STRATEGIES[decoration.pricing].unavailable_reason(decoration)
    return reason or (SPRINKLE_SOURCE_REASON if decoration.preview_source_inactive else None)


# --- Cálculo ---


NO_ONLINE_ORDERS = "Por ahora no tomamos pedidos en línea. Escríbenos por WhatsApp."


def _check_kg(kg, limits: CakeDesignSettingsRecord) -> None:
    if isinstance(kg, bool) or not isinstance(kg, int):
        _fail("kg", "Los kilos van en números enteros.")
    # Sin ninguna base activa el máximo efectivo es 0: no hay pedido en línea posible, no "máximo 0 kg".
    if limits.max_online_kg <= 0:
        _fail("kg", NO_ONLINE_ORDERS)
    if kg < limits.min_custom_kg:
        _fail("kg", f"El pedido es de mínimo {limits.min_custom_kg} kg.")
    if kg > limits.max_online_kg:
        _fail(
            "kg",
            f"En línea el máximo es {limits.max_online_kg} kg. Para más, escríbenos por WhatsApp.",
        )


# --- Pisos y forma (regla 3.3, D50) ---


def allowed_tiers(kg: int, cake_options=cake_option_repo) -> list[int]:
    """Pisos que se pueden elegir con `kg` kilos: los de la tabla cuyo mínimo alcanzan (regla 3.3)."""
    return [tier.tiers for tier in cake_options.list_tier_recommendations() if kg >= tier.recommended_min_kg]


def _check_tiers(tiers, kg, cake_options) -> None:
    if tiers is None:
        return
    minimums = {tier.tiers: tier.recommended_min_kg for tier in cake_options.list_tier_recommendations()}
    if isinstance(tiers, bool) or not isinstance(tiers, int) or tiers not in minimums:
        _fail("tiers", f"El pastel lleva de 1 a {max(minimums, default=1)} pisos.")
    if isinstance(kg, int) and kg < minimums[tiers]:
        _fail("tiers", f"Para {tiers} pisos el pedido es desde {minimums[tiers]} kg.")


def _check_form(form) -> None:
    if form is not None and form not in CakeShape.values:
        _fail("form", "Elige una forma: redondo o rectangular.")


def _chosen(choice: CakeDesignChoice, cake_options) -> tuple[BreadRecord, FillingPricing]:
    """El pan elegido y el relleno del tipo elegido, ya revisados contra la regla 4.7."""
    if choice.cake_type not in CAKE_TYPE_LABELS:
        _fail("cake_type", "Ese tipo de pastel no existe.")
    bread = next((b for b in cake_options.list_breads() if b.slug == choice.bread), None)
    if bread is None:
        _fail("bread", "Ese pan no existe o no está disponible.")
    filling = FillingPricing(
        choice.cake_type,
        cake_options.list_filling_bases_with_flavors(),
        cake_options.get_filling_price_table(),
    )
    reason = bread_unavailable_reason(bread, filling)
    if reason:
        _fail("bread", _as_sentence(bread.name, reason))
    return bread, filling


def _cake_price_per_kg(choice: CakeDesignChoice, cake_options, estimate: bool = False) -> Decimal:
    bread, filling = _chosen(choice, cake_options)
    strategy = BREAD_PRICING_STRATEGIES[bread.pricing_mode]
    return strategy.price_per_kg(bread, strategy.filling_per_kg(choice, filling, estimate))


def _decoration_charge(slug: str | None, cake_options, size) -> tuple[Decimal, bool]:
    """Importe de la decoración y si requiere cotización. Sin decoración elegida, nada.

    El tamaño decide si se puede poner (el mini solo lleva las suyas) y con qué precio (`size.priced`).
    """
    if slug is None:
        return ZERO, False
    decoration = next((d for d in cake_options.list_decorations() if d.slug == slug), None)
    if decoration is None:
        _fail("decoration", "Esa decoración no existe o no está disponible.")
    refusal = size.decoration_refusal(decoration)
    if refusal:
        _fail("decoration", refusal)
    decoration = size.priced(decoration)
    reason = decoration_unavailable_reason(decoration)
    if reason == SPRINKLE_SOURCE_REASON:
        _fail("decoration", reason)
    strategy = DECORATION_PRICING_STRATEGIES[decoration.pricing]
    return strategy.amount(decoration), strategy.requires_quote


def _wafer_charge(wafer: bool, limits: CakeDesignSettingsRecord, size) -> Decimal:
    """Importe de la oblea. Sin precio (PENDIENTE) no se puede pedir ni se cobra como $0; el mini no la lleva."""
    if not wafer:
        return ZERO
    refusal = size.wafer_refusal()
    if refusal:
        _fail("wafer", refusal)
    if limits.wafer_price is None:
        _fail("wafer", PENDING_PRICE_REASON, PendingPriceError)
    return limits.wafer_price


def _check_layouts(choice: CakeDesignChoice, limits: CakeDesignSettingsRecord, cake_options, size) -> None:
    """Acomodo de la oblea y del mensaje, si llegan: cotas del paso 7 (`design_layout`), la letra mínima del mensaje y
    que su bloque de renglones quepa, con la tapa de ese pastel (si con lo que llegó no se sabe, otra revisión ya lo
    rechaza)."""
    failures: list[DomainValidationError] = []
    if choice.wafer_layout is not None:
        attempt(failures, check_wafer_layout, choice.wafer_layout, choice.wafer, limits)
    if choice.message_layout is not None:
        message = choice.message_layout
        attempt(failures, check_message_layout, message)
        lid = attempt([], size.lid, choice, cake_options)
        if lid is not None and limits.message_min_letter_cm is not None and not failures:
            attempt(failures, check_message_letter, message, lid.radius, limits.message_min_letter_cm)
        if lid is not None and not failures:
            room = cake_lid.message_room_cm(lid, message.rotation_deg)
            attempt(failures, check_message_block, message, lid.radius, room, limits.message_min_letter_cm)
    try:
        raise_all(failures)
    except DomainValidationError as error:
        # Con un solo error `raise_all` lo deja tal cual: el precio siempre lanza `CakeDesignError`.
        raise CakeDesignError(error.errors) from error


# --- Estrategias del tamaño (tanda 2 de correcciones) ---


ONLY_SHOWCASE_FROM_PRODUCT = "Solo un pastel de vitrina se personaliza desde su ficha."
SIZE_UNAVAILABLE = "Ese tamaño no está disponible por ahora."
UNKNOWN_SIZE = "Elige un tamaño: por kilos, de vitrina o mini."


def _size_name(code: str) -> str:
    """"Pastel mini" -> "pastel mini", para las frases."""
    label = CAKE_SIZE_LABELS[code]
    return label[:1].lower() + label[1:]


def _design_size(code: str, cake_options) -> DesignSizeRecord:
    size = next((size for size in cake_options.list_design_sizes() if size.code == code), None)
    if size is None:
        _fail("cake_size", SIZE_UNAVAILABLE)
    return size


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


class ByWeightSizePricing:
    """Por kilos (desde el mínimo de pedido): el precio por kilo de lo elegido por los kilos, con su base (regla 7)."""

    code = CakeDesignSize.BY_WEIGHT.value

    def check_size(self, choice: CakeDesignChoice, limits: CakeDesignSettingsRecord, cake_options) -> None:
        failures: list[DomainValidationError] = []
        attempt(failures, _check_kg, choice.kg, limits)
        attempt(failures, _check_tiers, choice.tiers, choice.kg, cake_options)
        attempt(failures, _check_form, choice.form)
        if choice.source_product is not None:
            attempt(failures, _fail, "source_product", ONLY_SHOWCASE_FROM_PRODUCT)
        raise_all(failures, CakeDesignError)

    def cake_price(self, choice, cake_options, products, estimate: bool) -> tuple[Decimal | None, Decimal]:
        price_per_kg = _cake_price_per_kg(choice, cake_options, estimate)
        # Unos kilos que no valen ya los rechazó `check_size`: aquí no se multiplica por ellos.
        kg = choice.kg if _is_int(choice.kg) else 0
        return price_per_kg.quantize(CENT), (price_per_kg * kg).quantize(CENT)

    def bread_refusal(self, bread: BreadRecord | None) -> str | None:
        return None

    def base_refusal(self, base: FillingBaseRecord | None) -> str | None:
        return None

    def decoration_refusal(self, decoration: DecorationRecord) -> str | None:
        return None

    def priced(self, decoration: DecorationRecord) -> DecorationRecord:
        return decoration

    def wafer_refusal(self) -> str | None:
        return None

    def lid(self, choice: CakeDesignChoice, cake_options) -> cake_lid.Lid | None:
        """La tapa del último piso por los moldes (D52); sin forma, pisos o kilos válidos no se sabe."""
        valid = choice.form in CakeShape.values and _is_int(choice.tiers) and _is_int(choice.kg) and choice.kg > 0
        return cake_lid.lid_for(cake_options.list_cake_molds(), choice.form, choice.kg, choice.tiers) if valid else None

    def stand(self, choice: CakeDesignChoice, settings) -> StandDeposit:
        return get_stand_deposit(choice.kg, settings)

    def servings(self, choice: CakeDesignChoice, cake_options, products) -> int | None:
        """Por kilos, las personas son las que pidió el cliente: no salen del catálogo."""
        return None


class SmallSizePricing:
    """Lo común del pastel de vitrina y del mini: redondo, de 1 piso, sin kilos y sin base (pesan menos de 4 kg)."""

    code: str
    # Solo el pastel de vitrina sale de la ficha de un producto ("Personalizar este pastel").
    takes_source_product = False

    def check_size(self, choice: CakeDesignChoice, limits: CakeDesignSettingsRecord, cake_options) -> None:
        name = _size_name(self.code)
        failures: list[DomainValidationError] = []
        attempt(failures, _design_size, self.code, cake_options)
        refusals = (
            ("kg", choice.kg is not None, f"El {name} no se pide por kilos."),
            ("form", choice.form is not None and choice.form != CakeShape.ROUND, f"El {name} es redondo."),
            ("tiers", choice.tiers is not None and choice.tiers != 1, f"El {name} es de 1 piso."),
            (
                "source_product",
                choice.source_product is not None and not self.takes_source_product,
                ONLY_SHOWCASE_FROM_PRODUCT,
            ),
        )
        for field, applies, message in refusals:
            if applies:
                attempt(failures, _fail, field, message)
        raise_all(failures, CakeDesignError)

    def bread_refusal(self, bread: BreadRecord | None) -> str | None:
        return None

    def base_refusal(self, base: FillingBaseRecord | None) -> str | None:
        return None

    def decoration_refusal(self, decoration: DecorationRecord) -> str | None:
        return None

    def priced(self, decoration: DecorationRecord) -> DecorationRecord:
        return decoration

    def wafer_refusal(self) -> str | None:
        return None

    def lid(self, choice: CakeDesignChoice, cake_options) -> cake_lid.Lid:
        return cake_lid.round_lid(_design_size(self.code, cake_options).diameter_cm)

    def stand(self, choice: CakeDesignChoice, settings) -> StandDeposit:
        return StandDeposit(stand=None, deposit=NO_DEPOSIT, return_days=settings.get_policy_settings().stand_return_days)

    def servings(self, choice: CakeDesignChoice, cake_options, products) -> int | None:
        """Las personas que rinde, del catálogo (`None` si la pastelería no las ha definido)."""
        return _design_size(self.code, cake_options).servings


def _showcase_group_refusal(name: str, group: GroupPrice | None) -> str | None:
    """Sin grupo de catálogo, esa opción no va en el pastel de vitrina; con su precio vacío, es PENDIENTE."""
    if group is None:
        return f"{name}: no se ofrece en el pastel de vitrina."
    return PENDING_PRICE_REASON if group.amount is None else None


def _whole_offering(product: ProductRecord):
    return next((offering for offering in product.offerings if offering.presentation == Presentation.WHOLE), None)


def showcase_product_unavailable(product: ProductRecord | None) -> str | None:
    """Por qué un producto no se personaliza como pastel de vitrina desde su ficha, o `None` si se puede.

    Solo un pastel que sale en la vitrina, con su presentación completa con precio y con su tipo y su pan definidos
    (el pan de los pasteles de vitrina es PENDIENTE hasta que la pastelería lo captura en el admin). Lo solo por encargo
    (Red velvet, nuez) se arma como un pedido por kilos o como un pastel de vitrina desde cero.
    """
    if product is None:
        return "Ese pastel no existe o no está disponible."
    whole = _whole_offering(product)
    rules = (
        (product.category != ProductCategory.CAKE or not product.cake_type, "Este producto no se personaliza."),
        (product.sales_channel == SalesChannel.ORDER_ONLY, "Solo por encargo: no sale en la vitrina."),
        (whole is None, "Este pastel no se vende completo."),
        (whole is not None and whole.price is None, PENDING_PRICE_REASON),
        (product.bread_slug is None, "El pan de este pastel está por confirmar."),
    )
    return next((reason for applies, reason in rules if applies), None)


def _differences(choice: CakeDesignChoice, product: ProductRecord) -> list[tuple[str, str]]:
    """Lo que la elección cambia del producto, como `(campo, qué)`: tipo, pan, base y sabor (un producto lleva uno)."""
    flavors = (product.filling_flavor_slug,) if product.filling_flavor_slug else ()
    compared = (
        ("cake_type", choice.cake_type != product.cake_type, "el tipo de pastel"),
        ("bread", choice.bread != product.bread_slug, "el pan"),
        ("filling_base", (choice.filling_base or None) != product.filling_base_slug, "la base del relleno"),
        ("filling_flavors", tuple(choice.filling_flavors) != flavors, "el sabor"),
    )
    return [(field, what) for field, differs, what in compared if differs]


def _matching_showcase_product(choice: CakeDesignChoice, products) -> ProductRecord | None:
    """El pastel de la vitrina que es justo lo elegido, o `None`.

    Solo cuenta un producto que se podría personalizar desde su ficha (`showcase_product_unavailable`): activo, que
    sale en la vitrina, con su completo con precio (uno PENDIENTE, como la nuez, no cuenta) y su pan definido.
    """
    cakes = products.list_catalog(on_date=None, category=ProductCategory.CAKE)
    return next(
        (cake for cake in cakes if showcase_product_unavailable(cake) is None and not _differences(choice, cake)),
        None,
    )


class ShowcaseSizePricing(SmallSizePricing):
    """Pastel de vitrina (peso y personas del catálogo: 2.7 kg, ~19 personas).

    Armado libre: si lo elegido es un pastel de la vitrina (mismo tipo, pan, base y un solo sabor que un producto que se
    puede personalizar, `showcase_product_unavailable`), el precio de ese producto. Si no, el precio de catálogo del
    grupo de su relleno (o de su pan de relleno incluido) más lo que cuesta de más por kilo lo elegido contra la
    referencia del grupo (tres leches, pan de vainilla y un sabor sin precio propio de esa base), por el peso de vitrina.
    Desde la ficha: el precio del producto, sin cambiar su tipo, pan ni relleno.
    """

    code = CakeDesignSize.SHOWCASE.value
    takes_source_product = True

    def cake_price(self, choice, cake_options, products, estimate: bool) -> tuple[None, Decimal]:
        if choice.source_product is not None:
            return None, self._from_product(choice, cake_options, products)
        return None, self._assembled(choice, cake_options, products, estimate)

    def _assembled(self, choice: CakeDesignChoice, cake_options, products, estimate: bool) -> Decimal:
        bread, filling = _chosen(choice, cake_options)
        strategy = BREAD_PRICING_STRATEGIES[bread.pricing_mode]
        # También revisa el relleno (regla 4.7): un pastel que coincide con un producto se valida igual.
        price_per_kg = strategy.price_per_kg(bread, strategy.filling_per_kg(choice, filling, estimate))
        product = _matching_showcase_product(choice, products)
        if product is not None:
            return _whole_offering(product).price.quantize(CENT)
        base = next((b for b in filling.available_bases() if b.slug == choice.filling_base), None)
        for field, refusal in (("bread", self.bread_refusal(bread)), ("filling_base", self.base_refusal(base))):
            if refusal:
                _fail(field, refusal, PendingPriceError if refusal == PENDING_PRICE_REASON else CakeDesignError)
        group = strategy.showcase_group(bread, base)
        size = _design_size(self.code, cake_options)
        extra = strategy.showcase_extra_per_kg(price_per_kg, self._reference_per_kg(size, base, cake_options))
        if group is None or extra is None or (extra > 0 and size.approx_weight_kg is None):
            _fail("cake_size", PENDING_PRICE_REASON, PendingPriceError)
        weight = size.approx_weight_kg if extra > 0 else ZERO
        return (group.amount + extra * weight).quantize(CENT, rounding=ROUND_HALF_UP)

    def bread_refusal(self, bread: BreadRecord | None) -> str | None:
        """Un pan de relleno incluido sin precio de vitrina no se ofrece; los demás toman el de su base."""
        if bread is None or bread.pricing_mode != BreadPricingMode.FULL_PRICE_PER_KG:
            return None
        return _showcase_group_refusal(bread.name, bread.showcase_price)

    def base_refusal(self, base: FillingBaseRecord | None) -> str | None:
        return None if base is None else _showcase_group_refusal(base.name, base.showcase_price)

    def price_from(self, size: DesignSizeRecord, breads: list[BreadRecord], bases: list[FillingBaseRecord]):
        """Desde el grupo más barato que se puede elegir (`breads` y `bases`, sin los que este tamaño rechaza)."""
        groups = [base.showcase_price for base in bases] + [
            bread.showcase_price for bread in breads if bread.pricing_mode == BreadPricingMode.FULL_PRICE_PER_KG
        ]
        return min((group.amount for group in groups if group is not None and group.amount is not None), default=None)

    @staticmethod
    def _reference_per_kg(size: DesignSizeRecord, base: FillingBaseRecord | None, cake_options) -> Decimal | None:
        """La referencia del grupo: el precio general de la base en el tipo de referencia más el pan de referencia."""
        if base is None or not size.reference_cake_type:
            return None
        bread = next((b for b in cake_options.list_breads() if b.slug == size.reference_bread), None)
        general = cake_options.get_filling_price_table().get((size.reference_cake_type, base.slug, None))
        if bread is None or general is None:
            return None
        return general + bread.price_per_kg

    def _from_product(self, choice: CakeDesignChoice, cake_options, products) -> Decimal:
        product = products.get_product_by_slug(choice.source_product, None)
        reason = showcase_product_unavailable(product)
        if reason:
            _fail("source_product", reason)
        errors = {
            field: [f"{product.name} no cambia {what}: para cambiarlo, arma tu pastel desde el principio."]
            for field, what in _differences(choice, product)
        }
        if errors:
            raise CakeDesignError(errors)
        # El tipo, el pan y el relleno del producto también tienen que poder hacerse (regla 4.7 y lo activo).
        _cake_price_per_kg(choice, cake_options)
        return _whole_offering(product).price.quantize(CENT)

    def servings(self, choice: CakeDesignChoice, cake_options, products) -> int | None:
        """Desde la ficha, las del pastel completo del producto; armado libre, las de la vitrina."""
        product = products.get_product_by_slug(choice.source_product, None) if choice.source_product else None
        whole = _whole_offering(product) if product is not None else None
        if whole is not None and whole.servings is not None:
            return whole.servings
        return super().servings(choice, cake_options, products)


class MiniSizePricing(SmallSizePricing):
    """Pastel mini (~3 personas): siempre el precio de «Pastel mini» del catálogo, sin recargos por tipo, pan ni
    combinado. Sin oblea, sin panes de relleno incluido, solo con las bases y las decoraciones marcadas para el mini;
    una decoración de precio fijo cobra su precio de mini (vacío: PENDIENTE)."""

    code = CakeDesignSize.MINI.value

    def cake_price(self, choice, cake_options, products, estimate: bool) -> tuple[None, Decimal]:
        refusal = self.bread_refusal(next((b for b in cake_options.list_breads() if b.slug == choice.bread), None))
        if refusal:
            _fail("bread", refusal)
        base = next((b for b in cake_options.list_filling_bases_with_flavors() if b.slug == choice.filling_base), None)
        refusal = self.base_refusal(base)
        if refusal:
            _fail("filling_base", refusal)
        # El relleno se revisa igual que en cualquier pastel (tipo, sabores, combinado); su precio no cuenta.
        _cake_price_per_kg(choice, cake_options, estimate)
        size = _design_size(self.code, cake_options)
        if size.price is None:
            _fail("cake_size", PENDING_PRICE_REASON, PendingPriceError)
        return None, size.price.quantize(CENT)

    @staticmethod
    def bread_refusal(bread: BreadRecord | None) -> str | None:
        if bread is None or bread.pricing_mode != BreadPricingMode.FULL_PRICE_PER_KG:
            return None
        return f"{bread.name} no va en el pastel mini: ya trae su relleno."

    @staticmethod
    def base_refusal(base: FillingBaseRecord | None) -> str | None:
        return None if base is None or base.available_in_mini else f"No hay pastel mini {base.name.lower()}."

    def decoration_refusal(self, decoration: DecorationRecord) -> str | None:
        return None if decoration.available_in_mini else f"{decoration.name} no va en el pastel mini."

    def priced(self, decoration: DecorationRecord) -> DecorationRecord:
        """En el mini, una decoración de precio fijo cobra su precio de mini; las incluidas siguen incluidas."""
        if decoration.pricing != DecorationPricing.FIXED:
            return decoration
        return replace(decoration, price=decoration.mini_price)

    def wafer_refusal(self) -> str | None:
        return "El pastel mini no lleva oblea."

    def price_from(self, size: DesignSizeRecord, breads: list[BreadRecord], bases: list[FillingBaseRecord]):
        """El mini cuesta siempre lo mismo; `None` si su precio es PENDIENTE."""
        return size.price


SIZE_PRICING_STRATEGIES = {
    CakeDesignSize.BY_WEIGHT.value: ByWeightSizePricing(),
    CakeDesignSize.SHOWCASE.value: ShowcaseSizePricing(),
    CakeDesignSize.MINI.value: MiniSizePricing(),
}


def size_strategy(cake_size: str):
    """La estrategia del tamaño; uno que no existe es error del campo `cake_size`."""
    strategy = SIZE_PRICING_STRATEGIES.get(cake_size)
    if strategy is None:
        _fail("cake_size", UNKNOWN_SIZE)
    return strategy


def stand_for(choice: CakeDesignChoice, settings=settings_repo) -> StandDeposit:
    """La base del pastel y su depósito: por kilos, la que toca a los kilos (regla 7); vitrina y mini, ninguna."""
    return size_strategy(choice.cake_size).stand(choice, settings)


def lid_for(choice: CakeDesignChoice, cake_options=cake_option_repo) -> cake_lid.Lid | None:
    """La parte plana de la tapa del pastel elegido (para la oblea y el mensaje); `None` si no se puede saber."""
    return size_strategy(choice.cake_size).lid(choice, cake_options)


def servings_for(choice: CakeDesignChoice, cake_options=cake_option_repo, products=product_repo) -> int | None:
    """Las personas que rinde un pastel de vitrina o mini, para guardarlas con el pedido; por kilos, `None`."""
    return size_strategy(choice.cake_size).servings(choice, cake_options, products)


def describe_cake_size(cake_size: str, kg: int | None, people: int | None) -> str:
    """Cómo se dice el tamaño en la revisión, el carrito, el admin y la nota.

    "Pastel de 4 kg, 30 personas", "Pastel mini, ~3 personas" o "Pastel de vitrina, ~19 personas" (sin personas si la
    pastelería no las ha definido).
    """
    if cake_size == CakeDesignSize.BY_WEIGHT:
        return f"Pastel de {kg} kg, {people} personas"
    name = CAKE_SIZE_LABELS.get(cake_size, cake_size)
    return f"{name}, ~{people} personas" if people else name


def _price(choice: CakeDesignChoice, cake_options, settings, products, estimate: bool) -> PriceBreakdown:
    # El máximo es el efectivo, el mismo que anuncian las opciones y que usan los kilos por personas.
    limits = effective_cake_design_limits(settings)
    size = size_strategy(choice.cake_size)
    failures: list[DomainValidationError] = []
    attempt(failures, size.check_size, choice, limits, cake_options)
    cake = attempt(failures, size.cake_price, choice, cake_options, products, estimate)
    decoration = attempt(failures, _decoration_charge, choice.decoration, cake_options, size)
    wafer_amount = attempt(failures, _wafer_charge, choice.wafer, limits, size)
    attempt(failures, _check_layouts, choice, limits, cake_options, size)
    raise_all(failures, CakeDesignError)
    price_per_kg, cake_subtotal = cake
    decoration_amount, requires_quote = decoration
    wafer = wafer_amount.quantize(CENT)
    decoration_amount = decoration_amount.quantize(CENT)
    return PriceBreakdown(
        price_per_kg=price_per_kg,
        kg=choice.kg,
        cake_subtotal=cake_subtotal,
        wafer=wafer,
        decoration=decoration_amount,
        total=cake_subtotal + wafer + decoration_amount,
        requires_quote=requires_quote,
        is_estimate=estimate,
        cake_size=size.code,
    )


@audit_operation(expected_errors=(DomainValidationError,))
def calculate_price(
    choice: CakeDesignChoice, cake_options=cake_option_repo, settings=settings_repo, products=product_repo
) -> PriceBreakdown:
    """Precio de un diseño con las cifras vigentes.

    Valida el tamaño, el pan, el relleno y la decoración por separado y, si algo falla,
    lanza `CakeDesignError` con todos los errores por campo
    (`PendingPriceError` si lo único que falla es un precio PENDIENTE).
    El relleno pide su base y sus sabores: es el precio que llevaría un pedido.
    """
    return _price(choice, cake_options, settings, products, estimate=False)


@audit_operation(expected_errors=(DomainValidationError,))
def check_size_and_flavor(choice: CakeDesignChoice, cake_options=cake_option_repo, settings=settings_repo) -> None:
    """Revisa los kilos, el tipo, el pan y el relleno de `choice` con las mismas reglas que el precio (3.1 y 4.7),
    sin calcularlo. Lo usa el envío de referencia (D70): la pastelería pone el precio, pero el sabor que pide el cliente
    tiene que poder hacerse. Lanza `CakeDesignError` con todos los errores por campo.
    """
    limits = effective_cake_design_limits(settings)
    failures: list[DomainValidationError] = []
    attempt(failures, _check_kg, choice.kg, limits)
    attempt(failures, _cake_price_per_kg, choice, cake_options)
    raise_all(failures, CakeDesignError)


@audit_operation(expected_errors=(DomainValidationError,))
def estimate_price(
    choice: CakeDesignChoice, cake_options=cake_option_repo, settings=settings_repo, products=product_repo
) -> PriceBreakdown:
    """Total estimado mientras se arma el pastel ("Desde $X").

    Igual que `calculate_price`, salvo que la base del relleno puede ir sin
    sabores: entonces cuenta su precio general. Ningún pedido usa este precio.
    """
    return _price(choice, cake_options, settings, products, estimate=True)


# --- Kilos por personas (regla 3.1) ---


@dataclass(frozen=True)
class PeopleSize:
    """Kilos para un número de personas y dónde quedan contra los límites vigentes."""

    people: int
    # Personas entre personas por kilo, de .5 hacia arriba, sin el mínimo.
    rounded_kg: int
    # Kilos del pedido: nunca menos que el mínimo.
    kg: int
    below_minimum: bool
    above_maximum: bool
    # Personas que alcanzan el mínimo y el máximo en línea ("unas 28 personas").
    minimum_people: int
    max_online_people: int
    # El mayor número de pisos que permiten los kilos (regla 3.3).
    max_tiers: int


def _rounded_kg(people: int, people_per_kg: int) -> int:
    return int((Decimal(people) / people_per_kg).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


@audit_operation(expected_errors=(DomainValidationError,))
def size_for_people(people: int, settings=settings_repo, cake_options=cake_option_repo) -> PeopleSize:
    """Kilos para `people` personas (regla 3.1) con lo que la interfaz dice del mínimo y del máximo.

    1 kg por cada `people_per_kg`, de .5 hacia arriba, nunca menos que el
    mínimo. El máximo es el efectivo (`effective_cake_design_limits`), el mismo
    que anuncian las opciones y que revisa el precio. Va auditado: con más
    personas de las que se piden en línea, la vista responde sin calcular el
    precio y esta es la operación que queda en el registro.
    """
    if isinstance(people, bool) or not isinstance(people, int) or people < 1:
        _fail("people", "Indica al menos una persona.")
    limits = effective_cake_design_limits(settings)
    maximum = limits.max_online_kg
    rounded = _rounded_kg(people, limits.people_per_kg)
    kg = max(rounded, limits.min_custom_kg)
    return PeopleSize(
        people=people,
        rounded_kg=rounded,
        kg=kg,
        below_minimum=rounded < limits.min_custom_kg,
        above_maximum=kg > maximum,
        minimum_people=limits.min_custom_kg * limits.people_per_kg,
        max_online_people=maximum * limits.people_per_kg,
        max_tiers=max(allowed_tiers(kg, cake_options), default=1),
    )


def kg_for_people(people: int, settings=settings_repo, cake_options=cake_option_repo) -> int:
    """Solo los kilos del pedido para `people` personas (ver `size_for_people`)."""
    return size_for_people(people, settings=settings, cake_options=cake_options).kg
