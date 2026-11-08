"""Precio del pedido en "Diseña tu pastel" con estrategias intercambiables (Strategy).

Cada forma de cobrar es una estrategia elegida desde un registro, sin cadenas
`if/elif`: el pan por su `BreadPricingMode` (incremento por kilo o precio
completo con relleno incluido) y la decoración por su `DecorationPricing`
(incluida, precio fijo o por cotizar). El relleno es otra estrategia, que el
pan de incremento usa y el de precio completo rechaza.

Todas las cifras salen de los repositorios, que se reciben por parámetro (en
las pruebas, los de `repositories/memory.py`). Forma y pisos no cambian el
precio. Los montos son `Decimal` con dos decimales.
"""
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import NoReturn

from ..models import BreadPricingMode, CakeType, DecorationPricing
from ..repositories import cake_option_repo, settings_repo
from ..repositories.records import (
    BreadRecord,
    CakeDesignSettingsRecord,
    DecorationRecord,
    FillingBaseRecord,
    FillingFlavorRecord,
)
from .audit import audit_operation
from .errors import DomainValidationError, attempt, raise_all
from .warranty_service import effective_cake_design_limits

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
PENDING_PRICE_REASON = "Precio por confirmar"
CAKE_TYPE_LABELS = dict(CakeType.choices)


class CakeDesignError(DomainValidationError):
    """Una elección de "Diseña tu pastel" no cumple las reglas."""


class PendingPriceError(CakeDesignError):
    """La opción elegida aún no tiene precio (PENDIENTE)."""


@dataclass(frozen=True)
class CakeDesignChoice:
    """Lo que el cliente eligió y cambia el precio. Forma y pisos no lo cambian."""

    kg: int
    cake_type: str
    bread: str
    filling_base: str | None = None
    filling_flavors: tuple[str, ...] = ()
    decoration: str | None = None
    wafer: bool = False


@dataclass(frozen=True)
class PriceBreakdown:
    """Desglose del precio. La decoración por cotizar no se suma: `requires_quote` lo avisa."""

    price_per_kg: Decimal
    kg: int
    cake_subtotal: Decimal
    wafer: Decimal
    decoration: Decimal
    total: Decimal
    requires_quote: bool
    # Un estimado ("Desde $X") puede ir sin sabores: ningún pedido debe aceptar un desglose así.
    is_estimate: bool = False


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


# --- Cálculo ---


def _check_kg(kg, limits: CakeDesignSettingsRecord) -> None:
    if isinstance(kg, bool) or not isinstance(kg, int):
        _fail("kg", "Los kilos van en números enteros.")
    if kg < limits.min_custom_kg:
        _fail("kg", f"El pedido es de mínimo {limits.min_custom_kg} kg.")
    if kg > limits.max_online_kg:
        _fail(
            "kg",
            f"En línea el máximo es {limits.max_online_kg} kg. Para más, escríbenos por WhatsApp.",
        )


def _cake_price_per_kg(choice: CakeDesignChoice, cake_options, estimate: bool = False) -> Decimal:
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
    strategy = BREAD_PRICING_STRATEGIES[bread.pricing_mode]
    return strategy.price_per_kg(bread, strategy.filling_per_kg(choice, filling, estimate))


def _decoration_charge(slug: str | None, cake_options) -> tuple[Decimal, bool]:
    """Importe de la decoración y si requiere cotización. Sin decoración elegida, nada."""
    if slug is None:
        return ZERO, False
    decoration = next((d for d in cake_options.list_decorations() if d.slug == slug), None)
    if decoration is None:
        _fail("decoration", "Esa decoración no existe o no está disponible.")
    strategy = DECORATION_PRICING_STRATEGIES[decoration.pricing]
    return strategy.amount(decoration), strategy.requires_quote


def _price(choice: CakeDesignChoice, cake_options, settings, estimate: bool) -> PriceBreakdown:
    # El máximo es el efectivo, el mismo que anuncian las opciones y que usan los kilos por personas.
    limits = effective_cake_design_limits(settings)
    failures: list[DomainValidationError] = []
    attempt(failures, _check_kg, choice.kg, limits)
    price_per_kg = attempt(failures, _cake_price_per_kg, choice, cake_options, estimate)
    decoration = attempt(failures, _decoration_charge, choice.decoration, cake_options)
    raise_all(failures, CakeDesignError)
    decoration_amount, requires_quote = decoration
    cake_subtotal = (price_per_kg * choice.kg).quantize(CENT)
    wafer = (limits.wafer_price if choice.wafer else ZERO).quantize(CENT)
    decoration_amount = decoration_amount.quantize(CENT)
    return PriceBreakdown(
        price_per_kg=price_per_kg.quantize(CENT),
        kg=choice.kg,
        cake_subtotal=cake_subtotal,
        wafer=wafer,
        decoration=decoration_amount,
        total=cake_subtotal + wafer + decoration_amount,
        requires_quote=requires_quote,
        is_estimate=estimate,
    )


@audit_operation(expected_errors=(DomainValidationError,))
def calculate_price(
    choice: CakeDesignChoice, cake_options=cake_option_repo, settings=settings_repo
) -> PriceBreakdown:
    """Precio de un diseño con las cifras vigentes.

    Valida kilos, pan, relleno y decoración por separado y, si algo falla,
    lanza `CakeDesignError` con todos los errores por campo
    (`PendingPriceError` si lo único que falla es una decoración sin precio).
    El relleno pide su base y sus sabores: es el precio que llevaría un pedido.
    """
    return _price(choice, cake_options, settings, estimate=False)


@audit_operation(expected_errors=(DomainValidationError,))
def estimate_price(
    choice: CakeDesignChoice, cake_options=cake_option_repo, settings=settings_repo
) -> PriceBreakdown:
    """Total estimado mientras se arma el pastel ("Desde $X").

    Igual que `calculate_price`, salvo que la base del relleno puede ir sin
    sabores: entonces cuenta su precio general. Ningún pedido usa este precio.
    """
    return _price(choice, cake_options, settings, estimate=True)


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


def _rounded_kg(people: int, people_per_kg: int) -> int:
    return int((Decimal(people) / people_per_kg).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


@audit_operation(expected_errors=(DomainValidationError,))
def size_for_people(people: int, settings=settings_repo) -> PeopleSize:
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
    )


def kg_for_people(people: int, settings=settings_repo) -> int:
    """Solo los kilos del pedido para `people` personas (ver `size_for_people`)."""
    return size_for_people(people, settings=settings).kg
