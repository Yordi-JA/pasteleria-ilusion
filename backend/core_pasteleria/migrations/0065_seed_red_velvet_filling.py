"""El relleno del pan Red velvet con su nombre (corrección del usuario del 21 de noviembre de 2026).

La `0005` sembró el relleno incluido del pan `red_velvet` como «Relleno típico de red velvet», y "Diseña tu pastel" arma la
descripción de la opción con «Relleno de» + ese dato: salía «Relleno de relleno típico de red velvet». El relleno del red velvet
es el betún de queso crema, así que el dato pasa a «Betún de queso crema» («Relleno de betún de queso crema», como «Relleno de
crema de chocolate sabor helado» del Choco-pingüino). La descripción corta del producto `red-velvet` (`0009`), aunque esté
inactivo desde la `0062`, decía «Con su relleno típico de red velvet.» y pasa a «Pan red velvet con su betún de queso crema.»,
como la del Choco-pingüino.

Cada cambio solo toca la fila que sigue con el texto sembrado: no pisa lo que la pastelería ya editó en el admin. Correrla otra
vez no cambia nada. La reversa regresa el texto sembrado solo donde sigue el de esta migración.
"""
from django.db import migrations

BREAD_SLUG = "red_velvet"
OLD_FILLING = "Relleno típico de red velvet"
NEW_FILLING = "Betún de queso crema"

PRODUCT_SLUG = "red-velvet"
OLD_SUMMARY = "Con su relleno típico de red velvet."
NEW_SUMMARY = "Pan red velvet con su betún de queso crema."


def seed(apps, schema_editor):
    Bread = apps.get_model("core_pasteleria", "Bread")
    Product = apps.get_model("core_pasteleria", "Product")
    Bread.objects.filter(slug=BREAD_SLUG, included_filling=OLD_FILLING).update(included_filling=NEW_FILLING)
    Product.objects.filter(slug=PRODUCT_SLUG, summary=OLD_SUMMARY).update(summary=NEW_SUMMARY)


def unseed(apps, schema_editor):
    Bread = apps.get_model("core_pasteleria", "Bread")
    Product = apps.get_model("core_pasteleria", "Product")
    Bread.objects.filter(slug=BREAD_SLUG, included_filling=NEW_FILLING).update(included_filling=OLD_FILLING)
    Product.objects.filter(slug=PRODUCT_SLUG, summary=NEW_SUMMARY).update(summary=OLD_SUMMARY)


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0064_seed_blueberry_pinguino_zarzamora_samples"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
