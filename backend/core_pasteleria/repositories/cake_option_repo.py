"""Opciones y precios de "Diseña tu pastel"."""
from decimal import Decimal

from ..models import (
    Bread,
    CakeMold,
    CoverageColor,
    DecorationOption,
    FillingBase,
    FillingFlavor,
    FillingPrice,
    TierRecommendation,
)
from .records import (
    BreadRecord,
    CakeMoldRecord,
    CoverageColorRecord,
    DecorationRecord,
    FillingBaseRecord,
    FillingFlavorRecord,
    TierRecommendationRecord,
)


def list_breads() -> list[BreadRecord]:
    return [
        BreadRecord(
            id=bread.id,
            slug=bread.slug,
            name=bread.name,
            description=bread.description,
            pricing_mode=bread.pricing_mode,
            price_per_kg=bread.price_per_kg,
            included_filling=bread.included_filling,
            allowed_cake_types=tuple(bread.allowed_cake_types),
            preview_color=bread.preview_color,
            preview_color_bottom=bread.preview_color_bottom,
            included_filling_preview_style=bread.included_filling_preview_style,
            included_filling_preview_color_secondary=bread.included_filling_preview_color_secondary,
        )
        for bread in Bread.objects.filter(is_active=True)
    ]


def list_filling_bases_with_flavors() -> list[FillingBaseRecord]:
    """Bases activas, cada una con sus sabores activos (dos consultas)."""
    flavors_by_base: dict[int, list[FillingFlavorRecord]] = {}
    flavors = FillingFlavor.objects.filter(is_active=True).prefetch_related("bases")
    for flavor in flavors:
        record = FillingFlavorRecord(
            slug=flavor.slug,
            name=flavor.name,
            is_combinable=flavor.is_combinable,
            allowed_cake_types=tuple(flavor.allowed_cake_types),
            preview_color=flavor.preview_color,
            preview_style=flavor.preview_style,
            preview_color_secondary=flavor.preview_color_secondary,
        )
        for base in flavor.bases.all():
            flavors_by_base.setdefault(base.id, []).append(record)
    return [
        FillingBaseRecord(
            slug=base.slug,
            name=base.name,
            description=base.description,
            preview_color=base.preview_color,
            max_flavors=base.max_flavors,
            combined_extra_per_kg=base.combined_extra_per_kg,
            flavors=tuple(flavors_by_base.get(base.id, ())),
        )
        for base in FillingBase.objects.filter(is_active=True)
    ]


def get_filling_price_table() -> dict[tuple[str, str, str | None], Decimal]:
    """Precio por kilo del relleno: `(tipo, base, sabor o None) -> precio`.

    Sin sabor es el precio general de la base; con sabor, el precio propio de
    ese sabor.
    """
    prices = FillingPrice.objects.select_related("base", "flavor")
    return {
        (price.cake_type, price.base.slug, price.flavor.slug if price.flavor else None): price.price_per_kg
        for price in prices
    }


def list_coverage_colors() -> list[CoverageColorRecord]:
    return [
        CoverageColorRecord(slug=color.slug, name=color.name, preview_color=color.preview_color)
        for color in CoverageColor.objects.filter(is_active=True)
    ]


def _decoration_record(decoration: DecorationOption) -> DecorationRecord:
    # Las opciones desactivadas no se listan: su identificador tampoco se manda como origen de las chispas.
    # Un sabor solo se ofrece en sus bases activas: sin ninguna, tampoco se encuentra en las opciones.
    offered = decoration.preview_flavor and decoration.preview_flavor.is_active and any(base.is_active for base in decoration.preview_flavor.bases.all())
    flavor = decoration.preview_flavor if offered else None
    bread = decoration.preview_bread if decoration.preview_bread and decoration.preview_bread.is_active else None
    linked = decoration.preview_flavor is not None or decoration.preview_bread is not None
    return DecorationRecord(
        slug=decoration.slug,
        name=decoration.name,
        description=decoration.description,
        pricing=decoration.pricing,
        price=decoration.price,
        preview_flavor=flavor.slug if flavor else None,
        preview_bread=bread.slug if bread else None,
        preview_source_inactive=linked and flavor is None and bread is None,
    )


def list_decorations() -> list[DecorationRecord]:
    return [
        _decoration_record(decoration)
        for decoration in DecorationOption.objects.filter(is_active=True).select_related("preview_flavor", "preview_bread").prefetch_related("preview_flavor__bases")
    ]


def list_tier_recommendations() -> list[TierRecommendationRecord]:
    return [
        TierRecommendationRecord(
            tiers=tier.tiers,
            recommended_min_kg=tier.recommended_min_kg,
            recommended_max_kg=tier.recommended_max_kg,
        )
        for tier in TierRecommendation.objects.all()
    ]


def list_cake_molds() -> list[CakeMoldRecord]:
    return [
        CakeMoldRecord(form=mold.form, kg=mold.kg, length_cm=mold.length_cm, width_cm=mold.width_cm)
        for mold in CakeMold.objects.all()
    ]
