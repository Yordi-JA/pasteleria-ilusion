"""Marca las decoraciones que llevan color elegido por el cliente (regla 6.1, D63).

Los cuatro diseños con duya y las rosas eligen "Automático" o un color; "Sin decoración", las chispas y "Otra
decoración" no llevan color. Se marca por `slug` (el contrato con la vista previa) y solo lo que sigue sin marcar, así
que correrla otra vez no cambia nada. La reversa no desmarca: la pastelería pudo marcarlas a mano.
"""
from django.db import migrations

COLOR_SLUGS = ("duya", "rosetones", "festones", "olanes", "flores")


def seed(apps, schema_editor):
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    Decoration.objects.filter(slug__in=COLOR_SLUGS, accepts_color=False).update(accepts_color=True)


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0031_orders"),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
