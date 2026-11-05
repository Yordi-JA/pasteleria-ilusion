"""Repositorios en memoria con los datos de las reglas, para probar servicios sin PostgreSQL.

Copian a mano las secciones 3, 4, 6 y 7 de `docs/reglas-de-negocio.md` (no leen
la base): así una prueba unitaria demuestra que el servicio calcula con los
datos que recibe. Las decoraciones fijas van sin precio, como en la semilla
(PENDIENTE).
"""
from dataclasses import replace
from datetime import time
from decimal import Decimal

from core_pasteleria.repositories.memory import MemoryCakeOptionRepo, MemorySettingsRepo
from core_pasteleria.repositories.records import (
    BreadRecord,
    CakeDesignSettingsRecord,
    CoverageColorRecord,
    DecorationRecord,
    FillingBaseRecord,
    FillingFlavorRecord,
    PolicySettingsRecord,
    StandSizeRecord,
    StoreSettingsRecord,
    TierRecommendationRecord,
    UploadSettingsRecord,
)

ALL_TYPES = ("tres_leches", "seco", "envinado")


def bread(id, slug, name, mode, price, filling="", types=ALL_TYPES):
    return BreadRecord(
        id=id,
        slug=slug,
        name=name,
        description="",
        pricing_mode=mode,
        price_per_kg=Decimal(price),
        included_filling=filling,
        allowed_cake_types=tuple(types),
        preview_color="",
    )


BREADS = [
    bread(1, "vainilla", "Vainilla", "extra_per_kg", "0.00"),
    bread(2, "chocolate", "Chocolate", "extra_per_kg", "5.00"),
    bread(3, "choco_vainilla", "Choco-vainilla", "extra_per_kg", "5.00"),
    bread(
        4, "choco_pinguino", "Choco-pingüino", "full_price_per_kg", "250.00",
        "Crema de chocolate sabor helado", ("tres_leches", "seco"),
    ),
    bread(5, "red_velvet", "Red velvet", "full_price_per_kg", "280.00", "Relleno típico de red velvet", ("seco",)),
]


def flavor(slug, name, combinable=True, types=ALL_TYPES):
    return FillingFlavorRecord(
        slug=slug, name=name, is_combinable=combinable, allowed_cake_types=tuple(types), preview_color=""
    )


FLAVORS = {
    "durazno": flavor("durazno", "Durazno"),
    "fresa": flavor("fresa", "Fresa"),
    "zarzamora": flavor("zarzamora", "Zarzamora"),
    "cajeta": flavor("cajeta", "Cajeta"),
    "galleta": flavor("galleta", "Galleta"),
    "chocolate": flavor("chocolate", "Chocolate"),
    "choco_vainilla": flavor("choco_vainilla", "Choco vainilla"),
    "capuchino": flavor("capuchino", "Capuchino"),
    "fresa_yogurt": flavor("fresa_yogurt", "Fresa con yogurt", False, ("tres_leches", "seco")),
    "nuez": flavor("nuez", "Nuez"),
}


def base(slug, name, max_flavors, extra, flavor_slugs):
    return FillingBaseRecord(
        slug=slug,
        name=name,
        description="",
        preview_color="",
        max_flavors=max_flavors,
        combined_extra_per_kg=Decimal(extra),
        flavors=tuple(FLAVORS[s] for s in flavor_slugs),
    )


FILLING_BASES = [
    base("normal", "Normal", 2, "5.00", list(FLAVORS)),
    base("queso", "Con queso", 1, "0.00", ["chocolate", "zarzamora"]),
    base("flan", "Con flan", 1, "0.00", ["cajeta", "zarzamora"]),
]

# Tabla 4.5.
FILLING_PRICES = {
    (cake_type, base_slug, flavor_slug): Decimal(price)
    for (cake_type, base_slug, flavor_slug), price in {
        ("tres_leches", "normal", None): "180", ("seco", "normal", None): "180",
        ("envinado", "normal", None): "200",
        ("tres_leches", "normal", "fresa_yogurt"): "190", ("seco", "normal", "fresa_yogurt"): "190",
        ("tres_leches", "normal", "nuez"): "190", ("seco", "normal", "nuez"): "190",
        ("envinado", "normal", "nuez"): "200",
        ("tres_leches", "queso", None): "250", ("seco", "queso", None): "250", ("envinado", "queso", None): "250",
        ("tres_leches", "flan", None): "250", ("seco", "flan", None): "250", ("envinado", "flan", None): "250",
    }.items()
}

COVERAGE_COLORS = [CoverageColorRecord(slug="rosa", name="Rosa", preview_color="#F6B8CA")]

DECORATIONS = [
    DecorationRecord("ninguna", "Sin decoración", "Solo la cobertura", "included", None),
    DecorationRecord("duya", "Patrón con duya", "Líneas y festones de crema", "fixed", None),
    DecorationRecord("flores", "Flores", "Flores hechas con duya", "fixed", None),
    DecorationRecord("chispas", "Chispas", "Chispas de colores", "fixed", None),
    DecorationRecord("otra", "Otra decoración", "Sube una imagen", "quote", None),
]

TIERS = [
    TierRecommendationRecord(1, 0, None),
    TierRecommendationRecord(2, 15, None),
    TierRecommendationRecord(3, 18, 20),
    TierRecommendationRecord(4, 25, None),
    TierRecommendationRecord(5, 30, 35),
]

CAKE_DESIGN_SETTINGS = CakeDesignSettingsRecord(
    people_per_kg=7,
    min_custom_kg=4,
    max_online_kg=50,
    wafer_price=Decimal("125.00"),
    wafer_max_width_cm=Decimal("21.6"),
    wafer_max_height_cm=Decimal("27.9"),
    message_suggested_max_words=4,
)


def stand(min_kg, max_kg, deposit, origin="bakery", active=True):
    return StandSizeRecord(min_kg, max_kg, Decimal(deposit), origin, "", active)


# Sección 7: sin filas para 9, 13 a 14 ni 16 a 19 kg (siguiente base más grande).
STANDS = [
    stand(4, 5, "70"), stand(6, 8, "90"), stand(10, 12, "150"), stand(15, 15, "200"), stand(20, 25, "250"),
    stand(26, 30, "300", "approved"), stand(31, 35, "350", "approved"), stand(36, 40, "400", "approved"),
    stand(41, 45, "450", "approved"), stand(46, 50, "500", "approved"),
]


def cake_option_repo(breads=None, filling_bases=None, filling_prices=None, decorations=None):
    return MemoryCakeOptionRepo(
        breads=BREADS if breads is None else breads,
        filling_bases=FILLING_BASES if filling_bases is None else filling_bases,
        filling_prices=FILLING_PRICES if filling_prices is None else filling_prices,
        coverage_colors=COVERAGE_COLORS,
        decorations=DECORATIONS if decorations is None else decorations,
        tier_recommendations=TIERS,
    )


# Dirección y WhatsApp vacíos, como en la semilla (PENDIENTE).
STORE_SETTINGS = StoreSettingsRecord(
    time(10, 0), time(22, 30), time(10, 30), time(22, 0), 30, 3, 2, 2, 15, address="", whatsapp=""
)


def settings_repo(cake_design=None, stands=None, store=STORE_SETTINGS):
    return MemorySettingsRepo(
        store=store,
        cake_design=cake_design or CAKE_DESIGN_SETTINGS,
        policy=PolicySettingsRecord(stand_return_days=15, damaged_stand_policy=""),
        upload=UploadSettingsRecord(max_upload_mb=5, max_reference_images=3),
        stands=STANDS if stands is None else stands,
    )


def with_decoration_price(slug, price):
    """Decoraciones de la semilla con un precio fijo ya definido para `slug`."""
    return [replace(d, price=Decimal(price)) if d.slug == slug else d for d in DECORATIONS]
