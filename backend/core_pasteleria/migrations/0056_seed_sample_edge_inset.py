"""Siembra cuánto se meten las piezas del borde de arriba en choco vainilla, cajeta y capuchino (tanda 4b, campo de la `0055`).

El usuario pidió acercar al centro las conchas de choco vainilla, los copos de cajeta y los tulipanes de capuchino: en sus fotos
abrazan la fruta y no hay hueco entre ellas y el montón. Medido en las fotos, sus centros quedan a unos 0.70, 0.78 y 0.72 del radio
de la tapa, contra 0.84 y 0.86 de la imagen anterior. No son datos de la pastelería: el admin los marca como observados y ella
puede corregirlos. Solo los dibuja la imagen.

Solo cambia lo que sigue en 0, como lo dejó la `0055`; correrla otra vez no cambia nada. La reversa vuelve a 0 solo lo que sigue
exactamente como se sembró.
"""
from django.db import migrations

INSETS = {"tres-leches-de-choco-vainilla": 0.14, "tres-leches-de-capuchino": 0.12, "tres-leches-de-cajeta": 0.08}


def _move(apps, forward):
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    for sample in Sample.objects.filter(product__slug__in=INSETS).select_related("product"):
        seeded = INSETS[sample.product.slug]
        current, target = (0.0, seeded) if forward else (seeded, 0.0)
        if sample.edge_inset == current:
            sample.edge_inset = target
            sample.save(update_fields=["edge_inset"])


def seed(apps, schema_editor):
    _move(apps, forward=True)


def unseed(apps, schema_editor):
    _move(apps, forward=False)


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0055_sample_edge_inset"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
