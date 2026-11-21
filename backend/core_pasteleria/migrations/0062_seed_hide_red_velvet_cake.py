"""Quita «Red velvet» del catálogo (decisión del usuario del 20 de noviembre de 2026).

Igual que la nuez (`0061`): Red velvet es solo un sabor de pedido que se arma en «Diseña tu pastel», no un pastel de la
casa. La fila del producto no se borra: se desactiva (`is_active`), que es lo que el catálogo ya entiende. La tarjeta, la
ficha y el prefill de «Personalizar este pastel» dejan de salir; sus ofertas, su precio de catálogo y el pan `red_velvet` del
diseñador (con su relleno incluido y su vista previa) no se tocan. La pastelería puede reactivarlo en el admin.

Solo desactiva si sigue activo, así que correrla otra vez no cambia nada. La reversa lo reactiva solo si sigue desactivado.
"""
from django.db import migrations

SLUG = "red-velvet"


def seed(apps, schema_editor):
    Product = apps.get_model("core_pasteleria", "Product")
    Product.objects.filter(slug=SLUG, is_active=True).update(is_active=False)


def unseed(apps, schema_editor):
    Product = apps.get_model("core_pasteleria", "Product")
    Product.objects.filter(slug=SLUG, is_active=False).update(is_active=True)


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0061_seed_hide_walnut_cake"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
