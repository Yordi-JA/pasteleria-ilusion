"""Quita «Tres leches de nuez» del catálogo (decisión del usuario del 20 de noviembre de 2026).

La nuez es solo un sabor de relleno que se pide en «Diseña tu pastel», no un pastel de la casa. La fila del producto no se
borra: se desactiva (`is_active`), que es lo que el catálogo ya entiende. Así la tarjeta, la ficha y el prefill de
«Personalizar este pastel» dejan de salir y nada que la referencie (ofertas, `CatalogPrice`) se rompe. El sabor `nuez`
(`FillingFlavor`) y sus precios no se tocan, y la pastelería puede reactivar el producto en el admin.

Solo desactiva si sigue activo, así que correrla otra vez no cambia nada. La reversa lo reactiva solo si sigue
desactivado.
"""
from django.db import migrations

SLUG = "tres-leches-de-nuez"


def seed(apps, schema_editor):
    Product = apps.get_model("core_pasteleria", "Product")
    Product.objects.filter(slug=SLUG, is_active=True).update(is_active=False)


def unseed(apps, schema_editor):
    Product = apps.get_model("core_pasteleria", "Product")
    Product.objects.filter(slug=SLUG, is_active=False).update(is_active=True)


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0060_seed_imposible_photo"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
