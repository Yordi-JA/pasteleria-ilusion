"""Siembra los precios de catálogo, los productos del mockup y sus presentaciones.

Precios de `docs/reglas-de-negocio.md`, sección 2; nombres y descripciones
cortas de `mockup/fuente/Catalogo.dc.html` (14 pasteles y 8 postres). Lo que la
pastelería aún no responde queda vacío (PENDIENTE): el pan de los pasteles de
vitrina (`Product.bread`; solo Choco-pingüino y Red velvet lo traen, porque la
regla 4.3 lo fija), las fotos, la conservación y el transporte, y el peso del
Red velvet completo. Cada fila se busca por `slug` o `name` con `get_or_create`,
así que no pisa lo que ya editó la pastelería. La reversa no borra nada.
"""
from decimal import Decimal

from django.db import migrations

# (nombre, precio, peso aproximado en kg, personas que rinde). Peso y personas
# solo donde las reglas los dicen: un pastel de vitrina pesa ~2.7 kg (~19
# personas) y el mini rinde ~3 personas. El peso del Red velvet es PENDIENTE.
CATALOG_PRICES = [
    ("Pastel de sabor normal, completo", "350.00", "2.7", 19),
    ("Pastel de sabor normal, rebanada", "35.00", None, None),
    ("Pastel con queso o con flan, completo", "420.00", "2.7", 19),
    ("Pastel con queso o con flan, rebanada", "40.00", None, None),
    ("Choco-pingüino, completo", "350.00", "2.7", 19),
    ("Choco-pingüino, rebanada", "35.00", None, None),
    ("Red velvet, completo", "450.00", None, None),
    ("Pastel mini", "130.00", None, 3),
    ("Imposible, completo", "350.00", None, None),
    ("Imposible, rebanada", "35.00", None, None),
    ("Posible, completo", "350.00", None, None),
    ("Posible, rebanada", "35.00", None, None),
    ("Flan napolitano, grande", "360.00", None, None),
    ("Flan napolitano, individual", "35.00", None, None),
    ("Tarta de frutas, grande", "290.00", None, None),
    ("Tarta de frutas, mini", "35.00", None, None),
    ("Gelatina de molde", "290.00", None, None),
    ("Gelatina Mosaico con crema (vaso)", "20.00", None, None),
    ("Gelatina Mosaico con yogurt (vaso)", "20.00", None, None),
    ("Gelatina de Duvalín (vaso)", "25.00", None, None),
]

NORMAL = [
    ("whole", "Pastel de sabor normal, completo"),
    ("slice", "Pastel de sabor normal, rebanada"),
    ("mini", "Pastel mini"),
]
CHEESE_OR_FLAN = [
    ("whole", "Pastel con queso o con flan, completo"),
    ("slice", "Pastel con queso o con flan, rebanada"),
]

# Pasteles: (slug, nombre, descripción corta, tipo, base, sabor, presentaciones).
# No hay mini con queso ni con flan: esa presentación simplemente no existe.
CAKES = [
    ("tres-leches-de-durazno", "Tres leches de durazno", "Relleno de durazno y cobertura de crema pastelera.", "tres_leches", "normal", "durazno", NORMAL),
    ("tres-leches-de-fresa", "Tres leches de fresa", "Relleno de fresa y cobertura de crema pastelera.", "tres_leches", "normal", "fresa", NORMAL),
    ("tres-leches-de-zarzamora", "Tres leches de zarzamora", "Relleno de zarzamora y cobertura de crema pastelera.", "tres_leches", "normal", "zarzamora", NORMAL),
    ("tres-leches-de-cajeta", "Tres leches de cajeta", "Relleno de cajeta y cobertura de crema pastelera.", "tres_leches", "normal", "cajeta", NORMAL),
    ("tres-leches-de-galleta", "Tres leches de galleta", "Relleno de galleta y cobertura de crema pastelera.", "tres_leches", "normal", "galleta", NORMAL),
    ("tres-leches-de-chocolate", "Tres leches de chocolate", "Relleno de chocolate y cobertura de crema pastelera.", "tres_leches", "normal", "chocolate", NORMAL),
    ("tres-leches-de-choco-vainilla", "Tres leches de choco vainilla", "Relleno de choco vainilla y cobertura de crema pastelera.", "tres_leches", "normal", "choco_vainilla", NORMAL),
    ("tres-leches-de-capuchino", "Tres leches de capuchino", "Relleno de capuchino y cobertura de crema pastelera.", "tres_leches", "normal", "capuchino", NORMAL),
    ("tres-leches-con-queso-y-chocolate", "Tres leches con queso y chocolate", "Relleno de queso con chocolate y cobertura de crema pastelera.", "tres_leches", "queso", "chocolate", CHEESE_OR_FLAN),
    ("tres-leches-con-queso-y-zarzamora", "Tres leches con queso y zarzamora", "Relleno de queso con zarzamora y cobertura de crema pastelera.", "tres_leches", "queso", "zarzamora", CHEESE_OR_FLAN),
    ("tres-leches-con-flan-y-cajeta", "Tres leches con flan y cajeta", "Relleno de flan con cajeta y cobertura de crema pastelera.", "tres_leches", "flan", "cajeta", CHEESE_OR_FLAN),
    ("tres-leches-con-flan-y-zarzamora", "Tres leches con flan y zarzamora", "Relleno de flan con zarzamora y cobertura de crema pastelera.", "tres_leches", "flan", "zarzamora", CHEESE_OR_FLAN),
    ("choco-pinguino", "Choco-pingüino", "Pan de chocolate con su crema de chocolate sabor helado.", "seco", None, None, [("whole", "Choco-pingüino, completo"), ("slice", "Choco-pingüino, rebanada")]),
]
# Red velvet es solo por encargo: nunca va en vitrina.
RED_VELVET = ("red-velvet", "Red velvet", "Con su relleno típico de red velvet.", "seco", None, None, [("whole", "Red velvet, completo")])

# Postres: (slug, nombre, descripción corta, cómo se vende, presentaciones). Las
# gelatinas en vaso solo se venden cuando hay en vitrina.
S_AND_O, S_ONLY = "showcase_and_order", "showcase_only"
DESSERTS = [
    ("imposible", "Imposible", "Flan con pan de chocolate.", S_AND_O, [("whole", "Imposible, completo"), ("slice", "Imposible, rebanada")]),
    ("posible", "Posible", "Flan con pan de vainilla.", S_AND_O, [("whole", "Posible, completo"), ("slice", "Posible, rebanada")]),
    ("flan-napolitano", "Flan napolitano", "Grande o individual.", S_AND_O, [("large", "Flan napolitano, grande"), ("individual", "Flan napolitano, individual")]),
    ("tarta-de-frutas", "Tarta de frutas", "Grande o mini.", S_AND_O, [("large", "Tarta de frutas, grande"), ("mini", "Tarta de frutas, mini")]),
    ("gelatina-de-molde", "Gelatina de molde", "El diseño cambia según cómo la hagamos.", S_AND_O, [("whole", "Gelatina de molde")]),
    ("mosaico-con-crema", "Mosaico con crema", "Gelatina en vaso, cuadritos de sabores.", S_ONLY, [("cup", "Gelatina Mosaico con crema (vaso)")]),
    ("mosaico-con-yogurt", "Mosaico con yogurt", "Gelatina en vaso, con yogurt de fresa o durazno.", S_ONLY, [("cup", "Gelatina Mosaico con yogurt (vaso)")]),
    ("gelatina-de-duvalin", "Gelatina de Duvalín", "Gelatina en vaso en tres secciones, como el dulce.", S_ONLY, [("cup", "Gelatina de Duvalín (vaso)")]),
]


def seed_catalog(apps, schema_editor):
    def model(name):
        return apps.get_model("core_pasteleria", name)

    prices = {}
    for order, (name, amount, weight, servings) in enumerate(CATALOG_PRICES, start=1):
        prices[name], _ = model("CatalogPrice").objects.get_or_create(
            name=name,
            defaults={
                "amount": Decimal(amount),
                "approx_weight_kg": Decimal(weight) if weight else None,
                "servings": servings,
                "sort_order": order,
            },
        )

    def add_product(order, slug, name, summary, category, channel, offerings, **fields):
        product, _ = model("Product").objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "summary": summary,
                "category": category,
                "sales_channel": channel,
                "sort_order": order,
                **fields,
            },
        )
        for presentation_order, (presentation, price_name) in enumerate(offerings, start=1):
            model("ProductOffering").objects.get_or_create(
                product=product,
                presentation=presentation,
                defaults={"price": prices[price_name], "sort_order": presentation_order},
            )

    # La regla 4.3 fija el pan de estos dos. El de los demás pasteles es PENDIENTE.
    breads = {bread.slug: bread for bread in model("Bread").objects.all()}
    bread_of = {"choco-pinguino": "choco_pinguino", "red-velvet": "red_velvet"}
    bases = {base.slug: base for base in model("FillingBase").objects.all()}
    flavors = {flavor.slug: flavor for flavor in model("FillingFlavor").objects.all()}
    order = 0
    for slug, name, summary, cake_type, base, flavor, offerings in [*CAKES, RED_VELVET]:
        order += 1
        channel = "order_only" if slug == "red-velvet" else S_AND_O
        add_product(
            order, slug, name, summary, "cake", channel, offerings,
            cake_type=cake_type,
            bread=breads[bread_of[slug]] if slug in bread_of else None,
            filling_base=bases[base] if base else None,
            filling_flavor=flavors[flavor] if flavor else None,
        )
    for slug, name, summary, channel, offerings in DESSERTS:
        order += 1
        add_product(order, slug, name, summary, "dessert", channel, offerings)


class Migration(migrations.Migration):

    dependencies = [
        ("core_pasteleria", "0008_catalog"),
    ]

    operations = [
        migrations.RunPython(seed_catalog, migrations.RunPython.noop),
    ]
