"""Precios y chispas de la decoración (paso 6, D54).

La dueña confirmó el 10 de noviembre de 2026 (regla 6.1): Rosas cuesta $120 fijos; el borde de conchas, los rosetones,
los festones colgantes, los olanes y las chispas van incluidos (diseños sencillos, no suman); lo complejo se pide por
"Otra decoración". Las chispas son tres tipos, los mismos que ya maneja en los rellenos: de capuchino (granillo café,
sabor Capuchino), de chocolate (chispas redondas, relleno incluido del pan Choco-pingüino) y choco-vainilla (granillo
blanco y chocolate, sabor Choco vainilla). Cada tipo apunta al sabor o al pan de donde sale su estilo y sus colores
(`preview_flavor`, `preview_bread`), así que no hay colores escritos en el código.

No pisa lo que la pastelería editó: el precio o el cobro solo cambian si la fila sigue como la sembraron la `0005`, la
`0023` y la `0024` (cobro fijo y sin precio); el nombre y la descripción de las chispas, solo si siguen como los sembró la
`0005`; el orden de "Otra decoración", solo si sigue como lo dejó la `0023`. Una fila nueva no se crea si ya existe su
identificador o su nombre, ni si el sabor o el pan de donde sale no existe.

La reversa devuelve a cobro fijo y sin precio lo que sigue como lo dejó esta migración (cobro incluido, o el precio de
$120 en Rosas) y borra solo los tipos nuevos que siguen exactamente como se sembraron. Las chispas conservan su vínculo
al sabor: el esquema lo quita la `0025`.
"""
from decimal import Decimal

from django.db import migrations

ROSES_PRICE = Decimal("120.00")
INCLUDED_SLUGS = ["duya", "rosetones", "festones", "olanes", "chispas"]
SPRINKLES_BEFORE = ("Chispas", "Chispas de colores")
SPRINKLES_AFTER = ("Chispas de capuchino", "Granillo café, como el relleno de capuchino")
# (identificador, nombre, descripción, orden, sabor de origen, pan de origen)
NEW_SPRINKLES = [
    ("chispas-chocolate", "Chispas de chocolate", "Chispas redondas de chocolate, como el relleno de Choco-pingüino", 8, None, "choco_pinguino"),
    ("chispas-choco-vainilla", "Chispas choco-vainilla", "Granillo blanco y de chocolate, como el relleno de choco vainilla", 9, "choco_vainilla", None),
]
OTHER_SORT = (8, 10)


def seed(apps, schema_editor):
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    Flavor = apps.get_model("core_pasteleria", "FillingFlavor")
    Bread = apps.get_model("core_pasteleria", "Bread")
    as_seeded = {"pricing": "fixed", "price__isnull": True}
    Decoration.objects.filter(slug="flores", **as_seeded).update(price=ROSES_PRICE)
    Decoration.objects.filter(slug__in=INCLUDED_SLUGS, **as_seeded).update(pricing="included")
    capuchino = Flavor.objects.filter(slug="capuchino").first()
    if capuchino and not Decoration.objects.filter(name=SPRINKLES_AFTER[0]).exists():
        Decoration.objects.filter(slug="chispas", name=SPRINKLES_BEFORE[0], description=SPRINKLES_BEFORE[1]).update(
            name=SPRINKLES_AFTER[0], description=SPRINKLES_AFTER[1]
        )
    if capuchino:
        Decoration.objects.filter(slug="chispas", preview_flavor__isnull=True, preview_bread__isnull=True).update(
            preview_flavor=capuchino
        )
    Decoration.objects.filter(slug="otra", sort_order=OTHER_SORT[0]).update(sort_order=OTHER_SORT[1])
    for slug, name, description, order, flavor_slug, bread_slug in NEW_SPRINKLES:
        if Decoration.objects.filter(slug=slug).exists() or Decoration.objects.filter(name=name).exists():
            continue
        flavor = Flavor.objects.filter(slug=flavor_slug).first() if flavor_slug else None
        bread = Bread.objects.filter(slug=bread_slug).first() if bread_slug else None
        if not (flavor or bread):
            continue
        Decoration.objects.create(
            slug=slug, name=name, description=description, pricing="included", price=None, sort_order=order,
            preview_flavor=flavor, preview_bread=bread,
        )


def restore(apps, schema_editor):
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    for slug, name, description, order, flavor_slug, bread_slug in NEW_SPRINKLES:
        Decoration.objects.filter(
            slug=slug, name=name, description=description, sort_order=order, pricing="included", price__isnull=True,
            preview_flavor__slug=flavor_slug, preview_bread__slug=bread_slug,
        ).delete()
    Decoration.objects.filter(slug="otra", sort_order=OTHER_SORT[1]).update(sort_order=OTHER_SORT[0])
    if not Decoration.objects.filter(name=SPRINKLES_BEFORE[0]).exists():
        Decoration.objects.filter(slug="chispas", name=SPRINKLES_AFTER[0], description=SPRINKLES_AFTER[1]).update(
            name=SPRINKLES_BEFORE[0], description=SPRINKLES_BEFORE[1]
        )
    Decoration.objects.filter(slug="flores", pricing="fixed", price=ROSES_PRICE).update(price=None)
    Decoration.objects.filter(slug__in=INCLUDED_SLUGS, pricing="included", price__isnull=True).update(pricing="fixed")


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0025_decoration_sprinkle_sources"),
    ]

    operations = [migrations.RunPython(seed, restore)]
