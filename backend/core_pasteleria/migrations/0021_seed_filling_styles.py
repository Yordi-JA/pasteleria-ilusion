"""Siembra los rellenos nuevos de la vista previa (D52).

La dueña pidió el 10 de noviembre de 2026 grumitos en la fresa con yogurt, trozos
de nuez en la nuez, y que el relleno de Choco-pingüino (crema pastelera blanca con
chispas redondas de chocolate) y el de Red velvet (crema pastelera blanca con
granillo rojo) se vean desde la elección del pan. Solo se llena lo que sigue liso y
sin color de trozos: lo que la pastelería cambió en el admin no se pisa. Los colores
de la fresa con yogurt (grumitos más rojos) y de la nuez son propuestos y esperan el
visto bueno de la dueña (`docs/pendientes.md`).

La reversa devuelve a liso lo que sigue como lo sembró esta migración (estilo y color
de los trozos, comparado como texto exacto) y no borra nada. No puede distinguir una
fila que movió esta migración de una que la pastelería puso después con el mismo
estilo y el mismo color: esa también vuelve a liso (limitación aceptada, como en la
`0017`).
"""
from django.db import migrations

# (slug, estilo, color de los trozos)
FLAVOR_STYLES = [
    ("fresa_yogurt", "crumbles", "#D95F76"),
    ("nuez", "nut_pieces", "#7A5230"),
]
# (slug del pan, estilo del relleno incluido, color de los trozos)
BREAD_FILLING_STYLES = [
    ("choco_pinguino", "round_chips", "#3A2218"),
    ("red_velvet", "sprinkles", "#C8283A"),
]


def seed(apps, schema_editor):
    Bread = apps.get_model("core_pasteleria", "Bread")
    FillingFlavor = apps.get_model("core_pasteleria", "FillingFlavor")
    for slug, style, secondary in FLAVOR_STYLES:
        FillingFlavor.objects.filter(slug=slug, preview_style="smooth", preview_color_secondary="").update(
            preview_style=style, preview_color_secondary=secondary
        )
    for slug, style, secondary in BREAD_FILLING_STYLES:
        Bread.objects.filter(
            slug=slug, included_filling_preview_style="smooth", included_filling_preview_color_secondary=""
        ).update(included_filling_preview_style=style, included_filling_preview_color_secondary=secondary)


def restore_smooth(apps, schema_editor):
    Bread = apps.get_model("core_pasteleria", "Bread")
    FillingFlavor = apps.get_model("core_pasteleria", "FillingFlavor")
    for slug, style, secondary in FLAVOR_STYLES:
        FillingFlavor.objects.filter(slug=slug, preview_style=style, preview_color_secondary=secondary).update(
            preview_style="smooth", preview_color_secondary=""
        )
    for slug, style, secondary in BREAD_FILLING_STYLES:
        Bread.objects.filter(
            slug=slug, included_filling_preview_style=style, included_filling_preview_color_secondary=secondary
        ).update(included_filling_preview_style="smooth", included_filling_preview_color_secondary="")


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0020_cake_preview_filling_styles"),
    ]

    operations = [migrations.RunPython(seed, restore_smooth)]
