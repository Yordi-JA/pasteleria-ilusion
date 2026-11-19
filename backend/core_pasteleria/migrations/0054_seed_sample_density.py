"""Siembra lo tupido de la fruta y de las chispas, y los tulipanes de capuchino (tanda 4b, campos de la `0053`).

El usuario revisó las imágenes del catálogo y pidió que la fruta de choco vainilla, cajeta y capuchino se vea concentrada como en
la foto, sin el centro vacío, y más chispas en choco vainilla. En las tres fotos la fruta llena toda la parte de la tapa que dejan
libre los copos o las conchas, y sube en varias capas; en la de choco vainilla, el costado lleva unas ocho veces más granillo que
la decoración de chispas del diseñador. Las conchas de capuchino son tulipanes cerrados de chocolate blanco, no huevos abiertos.
No son datos de la pastelería: el admin los marca como observados y ella puede corregirlos. Solo los dibuja la imagen.

Solo cambia lo que sigue como lo dejaron la `0053` o la `0052`; correrla otra vez no cambia nada. La reversa devuelve solo lo que
sigue exactamente como se sembró.
"""
from django.db import migrations

# slug: {campo: (antes, después)}
CHANGES = {
    "tres-leches-de-choco-vainilla": {"fruit_density": (1.0, 2.0), "sprinkle_density": (1.0, 8.0)},
    "tres-leches-de-cajeta": {"fruit_density": (1.0, 2.0)},
    "tres-leches-de-capuchino": {"fruit_density": (1.0, 2.0), "shells": ("edge", "tulips")},
}


def _move(apps, forward):
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    for sample in Sample.objects.filter(product__slug__in=CHANGES).select_related("product"):
        changed = []
        for field, (before, after) in CHANGES[sample.product.slug].items():
            current, target = (before, after) if forward else (after, before)
            if getattr(sample, field) == current:
                setattr(sample, field, target)
                changed.append(field)
        if changed:
            sample.save(update_fields=changed)


def seed(apps, schema_editor):
    _move(apps, forward=True)


def unseed(apps, schema_editor):
    _move(apps, forward=False)


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0053_sample_density"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
