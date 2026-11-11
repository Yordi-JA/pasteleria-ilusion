"""La decoración "Flores" pasa a ser "Rosas" (paso 6, D53).

El usuario decidió el 10 de noviembre de 2026 que las flores son rosas de crema hechas con la técnica de modelado en clavo,
en una fila en el borde de arriba de cada piso. Esta migración cambia el nombre ("Rosas") y la descripción ("Rosas de crema
hechas con duya") de la fila `flores`. El identificador no cambia: los borradores guardados y la vista previa lo conocen.

Solo cambia lo que sigue como lo dejaron la `0005` (descripción "Flores hechas con duya") o la `0023` (descripción
"Florecitas de crema hechas con duya, con hojitas verdes"): lo que la pastelería editó en el admin no se pisa, y el precio
no se toca ni se usa como condición. Un nombre ya tomado por otra fila (es único) se deja como está.

La reversa devuelve el nombre "Flores" y la descripción de la `0023` solo si siguen como los dejó esta migración.
"""
from django.db import migrations

OLD_NAME, NEW_NAME = "Flores", "Rosas"
OLD_DESCRIPTIONS = ["Flores hechas con duya", "Florecitas de crema hechas con duya, con hojitas verdes"]
NEW_DESCRIPTION = "Rosas de crema hechas con duya"
# La descripción a la que vuelve la reversa: la de la `0023`.
RESTORED_DESCRIPTION = OLD_DESCRIPTIONS[1]


def seed(apps, schema_editor):
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    if not Decoration.objects.filter(name=NEW_NAME).exists():
        Decoration.objects.filter(slug="flores", name=OLD_NAME).update(name=NEW_NAME)
    Decoration.objects.filter(slug="flores", description__in=OLD_DESCRIPTIONS).update(description=NEW_DESCRIPTION)


def restore(apps, schema_editor):
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    if not Decoration.objects.filter(name=OLD_NAME).exists():
        Decoration.objects.filter(slug="flores", name=NEW_NAME).update(name=OLD_NAME)
    Decoration.objects.filter(slug="flores", description=NEW_DESCRIPTION).update(description=RESTORED_DESCRIPTION)


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0023_seed_decoration_designs"),
    ]

    operations = [migrations.RunPython(seed, restore)]
