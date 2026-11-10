"""Opciones de "Diseña tu pastel" con su disponibilidad y su motivo.

Los motivos y los precios por kilo salen de las mismas estrategias que el
cálculo del precio (`pricing_service`), así lo que la interfaz desactiva es lo
mismo que el servidor rechaza.
"""
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from decimal import Decimal
from types import MappingProxyType

from ..repositories import cake_option_repo, settings_repo
from ..repositories.records import (
    BreadRecord,
    CakeDesignSettingsRecord,
    CoverageColorRecord,
    DecorationRecord,
    FillingBaseRecord,
    FillingFlavorRecord,
)
from .pricing_service import (
    BREAD_PRICING_STRATEGIES,
    CAKE_TYPE_LABELS,
    DECORATION_PRICING_STRATEGIES,
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
    # `smooth`, `fruit_slices`, `fruit_chunks`, `cookie_chunks` o `sprinkles`, y el color de los trozos.
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
    reason = strategy.unavailable_reason(decoration)
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
    """
    bases = cake_options.list_filling_bases_with_flavors()
    price_table = cake_options.get_filling_price_table()
    filling_by_type = {
        cake_type: FillingPricing(cake_type, bases, price_table) for cake_type in CAKE_TYPE_LABELS
    }
    return CakeDesignOptions(
        cake_types=tuple(CakeTypeInfo(value, label) for value, label in CAKE_TYPE_LABELS.items()),
        breads=tuple(_bread_info(bread, filling_by_type) for bread in cake_options.list_breads()),
        filling_bases=tuple(_base_info(base, filling_by_type) for base in bases),
        coverage_colors=tuple(cake_options.list_coverage_colors()),
        decorations=tuple(map(_decoration_info, cake_options.list_decorations())),
        limits=effective_cake_design_limits(settings),
        tier_minimums=tuple(
            TierMinimum(tier.tiers, tier.recommended_min_kg) for tier in cake_options.list_tier_recommendations()
        ),
    )
