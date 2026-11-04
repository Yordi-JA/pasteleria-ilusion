"""Opciones y precios de "Diseña tu pastel"."""
from decimal import Decimal

from ..models import (
    Bread,
    CoverageColor,
    DecorationOption,
    FillingBase,
    FillingFlavor,
    FillingPrice,
    TierRecommendation,
)
from .records import (
    BreadRecord,
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


def list_decorations() -> list[DecorationRecord]:
    return [
        DecorationRecord(
            slug=decoration.slug,
            name=decoration.name,
            description=decoration.description,
            pricing=decoration.pricing,
            price=decoration.price,
        )
        for decoration in DecorationOption.objects.filter(is_active=True)
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
