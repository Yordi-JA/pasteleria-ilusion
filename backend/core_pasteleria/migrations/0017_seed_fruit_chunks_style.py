"""Pasa durazno y fresa de rebanadas a trozos de fruta en la vista previa (D51).

La dueña pidió el 8 de noviembre de 2026 pedazos de fruta con volumen en lugar de
discos delgados. Solo se mueven los sabores que siguen como los dejó la `0015`:
estilo `fruit_slices` y el color de los trozos sembrado, comparado como texto
exacto. Un `#fbd08f` en minúsculas, escrito en el admin, cuenta como editado y no
se mueve. Lo que la pastelería cambió no se pisa.

La reversa devuelve a `fruit_slices` lo que cumple la misma condición con
`fruit_chunks`. No puede distinguir una fila que movió esta migración de una que
la pastelería puso después en `fruit_chunks` con el mismo identificador y el mismo
color sembrado: esa también vuelve a rebanadas (limitación aceptada, sin pérdida
de datos, el color no cambia). La reversa no borra nada.
"""
from django.db import migrations

# (slug, color de los trozos sembrado por la 0015)
FRUIT_FLAVORS = [
    ("durazno", "#FBD08F"),
    ("fresa", "#C8283A"),
]


def _move(apps, source, target):
    FillingFlavor = apps.get_model("core_pasteleria", "FillingFlavor")
    for slug, secondary in FRUIT_FLAVORS:
        FillingFlavor.objects.filter(slug=slug, preview_style=source, preview_color_secondary=secondary).update(
            preview_style=target
        )


def seed(apps, schema_editor):
    _move(apps, "fruit_slices", "fruit_chunks")


def restore_slices(apps, schema_editor):
    _move(apps, "fruit_chunks", "fruit_slices")


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0016_cake_preview_fruit_chunks_and_bread_help"),
    ]

    operations = [migrations.RunPython(seed, restore_slices)]
