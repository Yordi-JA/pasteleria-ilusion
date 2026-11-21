"""La foto real del Imposible (decisión del usuario del 20 de noviembre de 2026).

La foto es un archivo estático del frontend (`frontend/public/fotos/imposible.webp`, D32) que el producto nombra en su campo
`photo`, como los pasteles con foto. Solo se pone si el campo sigue vacío, como lo dejó la `0009`: no pisa una foto que la
pastelería ya puso en el admin. Correrla otra vez no cambia nada. La reversa la quita solo si sigue siendo esta.
"""
from django.db import migrations

SLUG = "imposible"
PHOTO = "imposible.webp"


def seed(apps, schema_editor):
    Product = apps.get_model("core_pasteleria", "Product")
    Product.objects.filter(slug=SLUG, photo="").update(photo=PHOTO)


def unseed(apps, schema_editor):
    Product = apps.get_model("core_pasteleria", "Product")
    Product.objects.filter(slug=SLUG, photo=PHOTO).update(photo="")


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0059_seed_cup_gelatins"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
