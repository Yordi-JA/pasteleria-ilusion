"""Siembra el acabado de las mermeladas y de la cajeta, y la crema café claro de Choco-pingüino (tanda 4 de correcciones).

El usuario pidió el 17 de noviembre de 2026 la textura de la mermelada de zarzamora, la de la cajeta y que la crema de
Choco-pingüino sea más café claro. Zarzamora y blueberry (también mermelada, D78) pasan de liso a `jam`; cajeta, a
`caramel`. Choco-pingüino recibe el color de su crema, `#B5876B` (chocolate con leche claro, propuesto y editable en el admin);
Red velvet queda vacío, su crema sigue blanca. Solo se cambia lo que sigue como lo dejó la semilla (estilo liso sin
color de trozos; crema sin color): lo que la pastelería cambió en el admin no se pisa.

La reversa devuelve a liso lo que sigue con el acabado sembrado y borra el color de la crema si sigue siendo el
sembrado; no borra nada más. Como en la `0021`, no distingue una fila que movió esta migración de una que la
pastelería dejó después igual (limitación aceptada).
"""
from django.db import migrations

# (slug del sabor, acabado)
FLAVOR_FINISHES = [
    ("zarzamora", "jam"),
    ("blueberry", "jam"),
    ("cajeta", "caramel"),
]
# (slug del pan, color de la crema del relleno incluido)
BREAD_CREAMS = [
    ("choco_pinguino", "#B5876B"),
]


def seed(apps, schema_editor):
    Bread = apps.get_model("core_pasteleria", "Bread")
    FillingFlavor = apps.get_model("core_pasteleria", "FillingFlavor")
    for slug, finish in FLAVOR_FINISHES:
        FillingFlavor.objects.filter(slug=slug, preview_style="smooth", preview_color_secondary="").update(
            preview_style=finish
        )
    for slug, color in BREAD_CREAMS:
        Bread.objects.filter(slug=slug, included_filling_preview_color="").update(included_filling_preview_color=color)


def unseed(apps, schema_editor):
    Bread = apps.get_model("core_pasteleria", "Bread")
    FillingFlavor = apps.get_model("core_pasteleria", "FillingFlavor")
    for slug, finish in FLAVOR_FINISHES:
        FillingFlavor.objects.filter(slug=slug, preview_style=finish).update(preview_style="smooth")
    for slug, color in BREAD_CREAMS:
        Bread.objects.filter(slug=slug, included_filling_preview_color=color).update(included_filling_preview_color="")


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0046_cake_preview_finishes"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
