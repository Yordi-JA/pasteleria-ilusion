"""Opciones de "Diseña tu pastel" con su disponibilidad y su motivo.

Los motivos y los precios por kilo salen de las mismas estrategias que el
cálculo del precio (`pricing_service`), así lo que la interfaz desactiva es lo
mismo que el servidor rechaza.
"""
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from types import MappingProxyType

from ..models import CakeDesignSize, CakeShape
from ..repositories import cake_option_repo, settings_repo
from ..repositories.records import (
    BreadRecord,
    CakeDesignSettingsRecord,
    CakeMoldRecord,
    CoverageColorRecord,
    DecorationRecord,
    FillingBaseRecord,
    FillingFlavorRecord,
)
from . import cake_lid
from .pricing_service import (
    decoration_unavailable_reason,
    BREAD_PRICING_STRATEGIES,
    CAKE_SIZE_LABELS,
    CAKE_TYPE_LABELS,
    CENT,
    DECORATION_PRICING_STRATEGIES,
    NO_ONLINE_ORDERS,
    PENDING_PRICE_REASON,
    SIZE_PRICING_STRATEGIES,
    SIZE_UNAVAILABLE,
    FillingPricing,
    bread_unavailable,
)
from .warranty_service import effective_cake_design_limits


@dataclass(frozen=True)
class TierMinimum:
    tiers: int
    min_kg: int


@dataclass(frozen=True)
class CakeTypeInfo:
    value: str
    label: str


@dataclass(frozen=True)
class BreadInfo:
    slug: str
    name: str
    description: str
    pricing_mode: str
    price_per_kg: Decimal
    included_filling: str
    preview_color: str
    # Solo en un pan de dos colores: la mitad de abajo de cada capa; vacío si es de un color.
    preview_color_bottom: str
    # Solo en un pan con relleno incluido: cómo se ve, el color de sus trozos y el de su crema (vacío: blanca).
    included_filling_preview_style: str
    included_filling_preview_color_secondary: str
    included_filling_preview_color: str
    # Tipos en que se puede elegir y, para los demás, el motivo.
    allowed_cake_types: tuple[str, ...]
    unavailable_reasons: Mapping[str, str]
    # Código de cada motivo (`not_offered`, `not_combinable`, `only_in`), para la interfaz.
    unavailable_codes: Mapping[str, str]
    price_per_kg_from: Mapping[str, Decimal]


@dataclass(frozen=True)
class FillingFlavorInfo:
    slug: str
    name: str
    preview_color: str
    # `smooth`, `fruit_slices`, `fruit_chunks`, `cookie_chunks`, `sprinkles`, `crumbles`, `nut_pieces` o
    # `round_chips`, y el color de los trozos.
    preview_style: str
    preview_color_secondary: str
    is_combinable: bool
    allowed_cake_types: tuple[str, ...]
    unavailable_reasons: Mapping[str, str]
    unavailable_codes: Mapping[str, str]
    price_per_kg_by_cake_type: Mapping[str, Decimal]


@dataclass(frozen=True)
class FillingBaseInfo:
    slug: str
    name: str
    description: str
    preview_color: str
    max_flavors: int
    combined_extra_per_kg: Decimal
    allowed_cake_types: tuple[str, ...]
    unavailable_reasons: Mapping[str, str]
    unavailable_codes: Mapping[str, str]
    price_per_kg_by_cake_type: Mapping[str, Decimal]
    flavors: tuple[FillingFlavorInfo, ...]


@dataclass(frozen=True)
class DecorationInfo:
    slug: str
    name: str
    description: str
    pricing: str
    price: Decimal | None
    price_pending: bool
    requires_quote: bool
    available: bool
    unavailable_reason: str | None
    preview_flavor: str | None
    preview_bread: str | None


@dataclass(frozen=True)
class SizeInfo:
    """Un tamaño de "Diseña tu pastel" (tanda 2): por kilos, de vitrina o mini, con lo que no admite y su motivo.

    Por kilos no tiene molde fijo (sale de los kilos, `cake_molds`) ni rinde personas fijas: trae `min_kg` y
    `min_people`. Vitrina y mini son redondos y de 1 piso, con su molde, su peso y sus personas del catálogo.
    """

    code: str
    name: str
    available: bool
    unavailable_reason: str | None
    # Lo menos que cuesta el pastel sin decoración ni oblea; `None` si su precio es PENDIENTE.
    price_from: Decimal | None
    servings: int | None = None
    approx_weight_kg: Decimal | None = None
    diameter_cm: Decimal | None = None
    height_cm: Decimal | None = None
    # El radio de la parte plana de la tapa (sin el canto): la letra del mensaje mide `scale` por este radio.
    lid_radius_cm: Decimal | None = None
    form: str | None = None
    tiers: int | None = None
    min_kg: int | None = None
    min_people: int | None = None
    wafer_unavailable_reason: str | None = None
    unavailable_breads: Mapping[str, str] = field(default_factory=lambda: MappingProxyType({}))
    unavailable_filling_bases: Mapping[str, str] = field(default_factory=lambda: MappingProxyType({}))
    unavailable_decorations: Mapping[str, str] = field(default_factory=lambda: MappingProxyType({}))
    # Lo que cobra este tamaño por cada decoración que se puede elegir en él (`slug -> monto`), con la misma estrategia del
    # precio: el mini cobra su precio de mini, que la interfaz no podría saber de otro modo.
    decoration_prices: Mapping[str, Decimal] = field(default_factory=lambda: MappingProxyType({}))


@dataclass(frozen=True)
class CakeDesignOptions:
    cake_types: tuple[CakeTypeInfo, ...]
    breads: tuple[BreadInfo, ...]
    filling_bases: tuple[FillingBaseInfo, ...]
    coverage_colors: tuple[CoverageColorRecord, ...]
    decorations: tuple[DecorationInfo, ...]
    limits: CakeDesignSettingsRecord
    # Kilos mínimos por número de pisos (regla 3.3, D50): con menos, esos pisos no se eligen.
    tier_minimums: tuple[TierMinimum, ...]
    # Moldes de la pastelería (D52): la vista previa toma de aquí el tamaño del pastel según los kilos.
    cake_molds: tuple[CakeMoldRecord, ...]
    # Tamaños (tanda 2): por kilos, de vitrina y mini.
    sizes: tuple[SizeInfo, ...] = ()


def _by_type(filling_by_type: dict[str, FillingPricing], answer: Callable, types=None) -> Mapping:
    """Respuesta de `answer(filling)` por tipo de pastel, sin los `None` y de solo lectura."""
    values = {
        cake_type: answer(filling)
        for cake_type, filling in filling_by_type.items()
        if types is None or cake_type in types
    }
    return MappingProxyType({t: v for t, v in values.items() if v is not None})


def _reasons_and_codes(filling_by_type: dict[str, FillingPricing], answer: Callable) -> tuple[Mapping, Mapping]:
    """Motivo y código por tipo de pastel de una misma pregunta (`answer` da `Unavailable` o `None`)."""
    found = _by_type(filling_by_type, answer)
    return (
        MappingProxyType({t: u.reason for t, u in found.items()}),
        MappingProxyType({t: u.code for t, u in found.items()}),
    )


def _allowed(reasons: Mapping[str, str]) -> tuple[str, ...]:
    return tuple(cake_type for cake_type in CAKE_TYPE_LABELS if cake_type not in reasons)


def _bread_info(bread: BreadRecord, filling_by_type: dict[str, FillingPricing]) -> BreadInfo:
    strategy = BREAD_PRICING_STRATEGIES[bread.pricing_mode]
    reasons, codes = _reasons_and_codes(filling_by_type, lambda filling: bread_unavailable(bread, filling))
    allowed = _allowed(reasons)
    return BreadInfo(
        slug=bread.slug,
        name=bread.name,
        description=bread.description,
        pricing_mode=bread.pricing_mode,
        price_per_kg=bread.price_per_kg,
        included_filling=bread.included_filling,
        preview_color=bread.preview_color,
        preview_color_bottom=bread.preview_color_bottom,
        included_filling_preview_style=bread.included_filling_preview_style,
        included_filling_preview_color_secondary=bread.included_filling_preview_color_secondary,
        included_filling_preview_color=bread.included_filling_preview_color,
        allowed_cake_types=allowed,
        unavailable_reasons=reasons,
        unavailable_codes=codes,
        price_per_kg_from=_by_type(
            filling_by_type,
            lambda filling: strategy.price_per_kg_from(bread, filling.cheapest_general_price()),
            allowed,
        ),
    )


def _flavor_info(
    flavor: FillingFlavorRecord, base: FillingBaseRecord, filling_by_type: dict[str, FillingPricing]
) -> FillingFlavorInfo:
    reasons, codes = _reasons_and_codes(filling_by_type, lambda filling: filling.flavor_unavailable(flavor))
    allowed = _allowed(reasons)
    return FillingFlavorInfo(
        slug=flavor.slug,
        name=flavor.name,
        preview_color=flavor.preview_color,
        preview_style=flavor.preview_style,
        preview_color_secondary=flavor.preview_color_secondary,
        is_combinable=flavor.is_combinable,
        allowed_cake_types=allowed,
        unavailable_reasons=reasons,
        unavailable_codes=codes,
        price_per_kg_by_cake_type=_by_type(
            filling_by_type, lambda filling: filling.own_price(base, flavor), allowed
        ),
    )


def _base_info(base: FillingBaseRecord, filling_by_type: dict[str, FillingPricing]) -> FillingBaseInfo:
    reasons, codes = _reasons_and_codes(filling_by_type, lambda filling: filling.base_unavailable(base))
    allowed = _allowed(reasons)
    return FillingBaseInfo(
        slug=base.slug,
        name=base.name,
        description=base.description,
        preview_color=base.preview_color,
        max_flavors=base.max_flavors,
        combined_extra_per_kg=base.combined_extra_per_kg,
        allowed_cake_types=allowed,
        unavailable_reasons=reasons,
        unavailable_codes=codes,
        price_per_kg_by_cake_type=_by_type(
            filling_by_type, lambda filling: filling.general_price(base), allowed
        ),
        flavors=tuple(_flavor_info(flavor, base, filling_by_type) for flavor in base.flavors),
    )


def _decoration_info(decoration: DecorationRecord) -> DecorationInfo:
    strategy = DECORATION_PRICING_STRATEGIES[decoration.pricing]
    reason = decoration_unavailable_reason(decoration)
    return DecorationInfo(
        slug=decoration.slug,
        name=decoration.name,
        description=decoration.description,
        pricing=decoration.pricing,
        price=decoration.price,
        price_pending=strategy.is_price_pending(decoration),
        requires_quote=strategy.requires_quote,
        available=reason is None,
        unavailable_reason=reason,
        preview_flavor=decoration.preview_flavor,
        preview_bread=decoration.preview_bread,
    )


def get_cake_design_options(cake_options=cake_option_repo, settings=settings_repo) -> CakeDesignOptions:
    """Todo lo que la interfaz necesita para armar el pastel, con las cifras vigentes.

    Las opciones que la pastelería desactiva en el admin no se listan; "nunca
    desaparecen" aplica a las que un conflicto de tipo vuelve no elegibles.
    Panes, bases y sabores dependen del tipo de pastel: llevan
    `allowed_cake_types` y un motivo por cada tipo en que no se ofrecen. Las
    decoraciones no dependen del tipo: llevan `available` y su motivo.

    `limits.max_online_kg` es el máximo que de verdad se puede pedir: el menor
    entre el de la configuración y lo que cubre la base activa más grande (sin
    bases activas, 0: ningún kilo tiene base y el precio los rechaza todos).

    `sizes` (tanda 2) trae el pastel por kilos, el de vitrina y el mini, cada uno con lo
    que no admite y su motivo, salidos de las mismas estrategias del tamaño que el precio.
    """
    bases = cake_options.list_filling_bases_with_flavors()
    price_table = cake_options.get_filling_price_table()
    filling_by_type = {
        cake_type: FillingPricing(cake_type, bases, price_table) for cake_type in CAKE_TYPE_LABELS
    }
    breads = cake_options.list_breads()
    decorations = cake_options.list_decorations()
    bread_infos = tuple(_bread_info(bread, filling_by_type) for bread in breads)
    limits = effective_cake_design_limits(settings)
    offered_bases = [base for base in bases if any(f.base_unavailable(base) is None for f in filling_by_type.values())]
    return CakeDesignOptions(
        cake_types=tuple(CakeTypeInfo(value, label) for value, label in CAKE_TYPE_LABELS.items()),
        breads=bread_infos,
        filling_bases=tuple(_base_info(base, filling_by_type) for base in bases),
        coverage_colors=tuple(cake_options.list_coverage_colors()),
        decorations=tuple(map(_decoration_info, decorations)),
        limits=limits,
        tier_minimums=tuple(
            TierMinimum(tier.tiers, tier.recommended_min_kg) for tier in cake_options.list_tier_recommendations()
        ),
        cake_molds=tuple(cake_options.list_cake_molds()),
        sizes=(
            _by_weight_info(bread_infos, limits, decorations),
            *(
                _small_size_info(code, cake_options, breads, offered_bases, decorations)
                for code in (CakeDesignSize.SHOWCASE.value, CakeDesignSize.MINI.value)
            ),
        ),
    )


# --- Tamaños (tanda 2) ---


def _decoration_prices(size_strategy, decorations: list[DecorationRecord]) -> Mapping[str, Decimal]:
    """`slug -> monto` de lo que cobra el tamaño por cada decoración que se puede elegir en él (`_decoration_charge`)."""
    prices = {}
    for decoration in decorations:
        priced = size_strategy.priced(decoration)
        if size_strategy.decoration_refusal(decoration) or decoration_unavailable_reason(priced):
            continue
        prices[decoration.slug] = DECORATION_PRICING_STRATEGIES[priced.pricing].amount(priced).quantize(CENT)
    return MappingProxyType(prices)


def _by_weight_info(
    bread_infos: tuple[BreadInfo, ...], limits: CakeDesignSettingsRecord, decorations: list[DecorationRecord]
) -> SizeInfo:
    """Por kilos: desde el mínimo de pedido, al precio por kilo más bajo que se puede elegir."""
    cheapest = min((price for info in bread_infos for price in info.price_per_kg_from.values()), default=None)
    available = limits.max_online_kg > 0
    return SizeInfo(
        code=CakeDesignSize.BY_WEIGHT.value,
        name=CAKE_SIZE_LABELS[CakeDesignSize.BY_WEIGHT],
        available=available,
        unavailable_reason=None if available else NO_ONLINE_ORDERS,
        price_from=None if cheapest is None else (cheapest * limits.min_custom_kg).quantize(CENT),
        min_kg=limits.min_custom_kg,
        min_people=limits.min_custom_kg * limits.people_per_kg,
        decoration_prices=_decoration_prices(SIZE_PRICING_STRATEGIES[CakeDesignSize.BY_WEIGHT.value], decorations),
    )


def _only_refused(items, refusal: Callable) -> Mapping[str, str]:
    """`slug -> motivo` de lo que el tamaño no admite."""
    return MappingProxyType({item.slug: reason for item in items if (reason := refusal(item))})


def _small_size_info(
    code: str,
    cake_options,
    breads: list[BreadRecord],
    bases: list[FillingBaseRecord],
    decorations: list[DecorationRecord],
) -> SizeInfo:
    """Vitrina o mini, con los mismos motivos con que el precio las rechaza (`SIZE_PRICING_STRATEGIES`)."""
    strategy = SIZE_PRICING_STRATEGIES[code]
    name = CAKE_SIZE_LABELS[code]
    size = next((size for size in cake_options.list_design_sizes() if size.code == code), None)
    if size is None:
        return SizeInfo(code=code, name=name, available=False, unavailable_reason=SIZE_UNAVAILABLE, price_from=None)
    unavailable_breads = _only_refused(breads, strategy.bread_refusal)
    unavailable_bases = _only_refused(bases, strategy.base_refusal)
    offered_breads = [bread for bread in breads if bread.slug not in unavailable_breads]
    price_from = strategy.price_from(size, offered_breads, [base for base in bases if base.slug not in unavailable_bases])

    def decoration_refusal(decoration: DecorationRecord) -> str | None:
        # Solo lo que cambia en este tamaño: lo que no se puede elegir en ninguno ya lo dice la decoración.
        reason = strategy.decoration_refusal(decoration) or decoration_unavailable_reason(strategy.priced(decoration))
        return None if reason == decoration_unavailable_reason(decoration) else reason

    return SizeInfo(
        code=code,
        name=name,
        available=price_from is not None,
        unavailable_reason=None if price_from is not None else PENDING_PRICE_REASON,
        price_from=price_from,
        servings=size.servings,
        approx_weight_kg=size.approx_weight_kg,
        diameter_cm=size.diameter_cm,
        height_cm=size.height_cm,
        lid_radius_cm=Decimal(str(cake_lid.round_lid(size.diameter_cm).radius)).quantize(CENT),
        form=CakeShape.ROUND.value,
        tiers=1,
        wafer_unavailable_reason=strategy.wafer_refusal(),
        unavailable_breads=unavailable_breads,
        unavailable_filling_bases=unavailable_bases,
        unavailable_decorations=_only_refused(decorations, decoration_refusal),
        decoration_prices=_decoration_prices(strategy, decorations),
    )
