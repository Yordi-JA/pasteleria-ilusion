"""Más fruta en queso y chocolate, capuchino y flan y cajeta (tanda 4b, cuarta vuelta; rango de la `0057`).

El usuario revisó las imágenes del catálogo: a queso y chocolate le faltan fruta y conchas en el centro, a capuchino le sigue
faltando fruta y flan y cajeta se ve pobre de fruta. En sus fotos la fruta llena la tapa: en montón alto dentro de las conchas o
los tulipanes, o en filas encimadas que cubren casi toda la tapa (flan y cajeta). No son datos de la pastelería: el admin los marca
como observados y ella puede corregirlos. Solo los dibuja la imagen.

Solo cambia lo que sigue como lo dejaron las migraciones de antes; correrla otra vez no cambia nada. La reversa devuelve solo lo
que sigue exactamente como se sembró.
"""
from django.db import migrations

# slug: {campo: (antes, después)}
CHANGES = {
    "tres-leches-con-queso-y-chocolate": {"fruit_density": (1.0, 2.0), "edge_inset": (0.0, 0.06)},
    "tres-leches-de-capuchino": {"fruit_density": (2.0, 3.0), "edge_inset": (0.12, 0.08)},
    "tres-leches-con-flan-y-cajeta": {"fruit_density": (1.0, 2.0)},
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
        ("core_pasteleria", "0057_sample_fruit_density_range"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
