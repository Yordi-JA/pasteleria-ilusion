"""Siembra las opciones de "Diseña tu pastel" con los datos de las reglas.

Valores de `docs/reglas-de-negocio.md` (secciones 3.3, 4, 5 y 6.1). Los colores
de la vista previa salen de `design/referencia/pastel-css3d.js`: el primer tono
de cada pan (`PAN`), sabor (`REL`) y color de cobertura (`COB`), y el tono de la
capa de crema de las bases con queso y con flan (`BASEREL`). La base Normal y
el pan Choco-vainilla no tienen color propio en el prototipo y quedan vacíos.
Cada fila se busca por `slug` (o `tiers`)
con `get_or_create`, así que no pisa lo que ya editó la pastelería. Los precios
de las decoraciones fijas quedan vacíos: PENDIENTE. La reversa no borra nada.
"""
from decimal import Decimal

from django.db import migrations

ALL_TYPES = ["tres_leches", "seco", "envinado"]

# (slug, nombre, modo, precio por kg, relleno incluido, tipos, color)
BREADS = [
    ("vainilla", "Vainilla", "extra_per_kg", "0.00", "", ALL_TYPES, "#F0CE8A"),
    ("chocolate", "Chocolate", "extra_per_kg", "5.00", "", ALL_TYPES, "#805438"),
    # Su vista previa mezcla los tonos de vainilla y de chocolate: sin color propio.
    ("choco_vainilla", "Choco-vainilla", "extra_per_kg", "5.00", "", ALL_TYPES, ""),
    (
        "choco_pinguino",
        "Choco-pingüino",
        "full_price_per_kg",
        "250.00",
        "Crema de chocolate sabor helado",
        ["tres_leches", "seco"],
        "#603C2A",
    ),
    (
        "red_velvet",
        "Red velvet",
        "full_price_per_kg",
        "280.00",
        "Relleno típico de red velvet",
        ["seco"],
        "#B8363A",
    ),
]

# (slug, nombre, máximo de sabores, cargo por combinado, color)
FILLING_BASES = [
    ("normal", "Normal", 2, "5.00", ""),
    ("queso", "Con queso", 1, "0.00", "#FAF4E2"),
    ("flan", "Con flan", 1, "0.00", "#F2C860"),
]

# (slug, nombre, se combina, tipos, color, bases en que se ofrece)
FILLING_FLAVORS = [
    ("durazno", "Durazno", True, ALL_TYPES, "#F6B054", ["normal"]),
    ("fresa", "Fresa", True, ALL_TYPES, "#E25468", ["normal"]),
    ("zarzamora", "Zarzamora", True, ALL_TYPES, "#702C5A", ["normal", "queso", "flan"]),
    ("cajeta", "Cajeta", True, ALL_TYPES, "#BC7630", ["normal", "flan"]),
    ("galleta", "Galleta", True, ALL_TYPES, "#CEA876", ["normal"]),
    ("chocolate", "Chocolate", True, ALL_TYPES, "#5C3826", ["normal", "queso"]),
    ("choco_vainilla", "Choco vainilla", True, ALL_TYPES, "#966846", ["normal"]),
    ("capuchino", "Capuchino", True, ALL_TYPES, "#AA7A56", ["normal"]),
    # No va en envinado y no se combina (reglas 4.4 y 4.7).
    ("fresa_yogurt", "Fresa con yogurt", False, ["tres_leches", "seco"], "#F0A4B2", ["normal"]),
    ("nuez", "Nuez", True, ALL_TYPES, "#B08A60", ["normal"]),
]

# Tabla 4.5: (tipo, base, sabor con precio propio o None, precio por kg).
FILLING_PRICES = [
    ("tres_leches", "normal", None, "180.00"),
    ("seco", "normal", None, "180.00"),
    ("envinado", "normal", None, "200.00"),
    ("tres_leches", "normal", "fresa_yogurt", "190.00"),
    ("seco", "normal", "fresa_yogurt", "190.00"),
    ("tres_leches", "normal", "nuez", "190.00"),
    ("seco", "normal", "nuez", "190.00"),
    ("envinado", "normal", "nuez", "200.00"),
    ("tres_leches", "queso", None, "250.00"),
    ("seco", "queso", None, "250.00"),
    ("envinado", "queso", None, "250.00"),
    ("tres_leches", "flan", None, "250.00"),
    ("seco", "flan", None, "250.00"),
    ("envinado", "flan", None, "250.00"),
]

# Sección 3.3: (pisos, kilos recomendados desde, hasta de referencia).
TIERS = [(1, 0, None), (2, 15, None), (3, 18, 20), (4, 25, None), (5, 30, 35)]

# Sección 5, en el orden de las reglas: (slug, nombre, color).
COVERAGE_COLORS = [
    ("amarillo", "Amarillo", "#FAE496"),
    ("blanco", "Blanco", "#FFFBFB"),
    ("azulfuerte", "Azul fuerte", "#4A70BA"),
    ("azulclaro", "Azul claro", "#B0D0EC"),
    ("verde", "Verde", "#A6CE98"),
    ("naranja", "Naranja", "#F6B06C"),
    ("cafe", "Café", "#9C6E50"),
    ("turquesa", "Turquesa", "#6ECAC6"),
    ("rojo", "Rojo", "#D44C48"),
    ("rosa", "Rosa", "#F6B8CA"),
    ("lila", "Lila", "#CCBAE4"),
]

# Sección 6.1: (slug, nombre, descripción del mockup, cómo se cobra). Los
# precios de las decoraciones fijas son PENDIENTE: no se siembran.
DECORATIONS = [
    ("ninguna", "Sin decoración", "Solo la cobertura", "included"),
    ("duya", "Patrón con duya", "Líneas y festones de crema", "fixed"),
    ("flores", "Flores", "Flores hechas con duya", "fixed"),
    ("chispas", "Chispas", "Chispas de colores", "fixed"),
    ("otra", "Otra decoración", "Sube una imagen y la pastelería te dice el precio", "quote"),
]


def seed_cake_options(apps, schema_editor):
    def model(name):
        return apps.get_model("core_pasteleria", name)

    Bread, FillingBase, FillingFlavor = model("Bread"), model("FillingBase"), model("FillingFlavor")

    for order, (slug, name, mode, price, filling, types, color) in enumerate(BREADS, start=1):
        Bread.objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "pricing_mode": mode,
                "price_per_kg": Decimal(price),
                "included_filling": filling,
                "allowed_cake_types": types,
                "preview_color": color,
                "sort_order": order,
            },
        )

    bases = {}
    for order, (slug, name, max_flavors, extra, color) in enumerate(FILLING_BASES, start=1):
        bases[slug], _ = FillingBase.objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "max_flavors": max_flavors,
                "combined_extra_per_kg": Decimal(extra),
                "preview_color": color,
                "sort_order": order,
            },
        )

    flavors = {}
    for order, (slug, name, combinable, types, color, base_slugs) in enumerate(
        FILLING_FLAVORS, start=1
    ):
        flavors[slug], created = FillingFlavor.objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "is_combinable": combinable,
                "allowed_cake_types": types,
                "preview_color": color,
                "sort_order": order,
            },
        )
        # Solo al crear el sabor: si ya existía, las bases que la pastelería le
        # quitó o le puso no se tocan.
        if created:
            flavors[slug].bases.add(*(bases[base_slug] for base_slug in base_slugs))

    for cake_type, base_slug, flavor_slug, price in FILLING_PRICES:
        model("FillingPrice").objects.get_or_create(
            cake_type=cake_type,
            base=bases[base_slug],
            flavor=flavors[flavor_slug] if flavor_slug else None,
            defaults={"price_per_kg": Decimal(price)},
        )

    for tiers, min_kg, max_kg in TIERS:
        model("TierRecommendation").objects.get_or_create(
            tiers=tiers,
            defaults={"recommended_min_kg": min_kg, "recommended_max_kg": max_kg},
        )

    for order, (slug, name, color) in enumerate(COVERAGE_COLORS, start=1):
        model("CoverageColor").objects.get_or_create(
            slug=slug, defaults={"name": name, "preview_color": color, "sort_order": order}
        )

    for order, (slug, name, description, pricing) in enumerate(DECORATIONS, start=1):
        model("DecorationOption").objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "description": description,
                "pricing": pricing,
                "sort_order": order,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("core_pasteleria", "0004_cake_options"),
    ]

    operations = [
        migrations.RunPython(seed_cake_options, migrations.RunPython.noop),
    ]
