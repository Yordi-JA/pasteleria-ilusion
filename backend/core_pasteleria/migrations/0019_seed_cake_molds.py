"""Siembra los moldes de la pastelería (D52).

Las medidas son las que dio la dueña el 10 de noviembre de 2026: redondos (kilos,
diámetro en cm) y rectangulares (kilos, largo por ancho en cm). La vista previa de
"Diseña tu pastel" toma de aquí el tamaño del pastel según los kilos. Se crean con
`get_or_create` sobre la forma y los kilos: correrla otra vez no duplica filas ni
pisa un molde que la pastelería ya cambió en el admin. La reversa no borra nada
(la tabla se borra con la migración anterior).
"""
from decimal import Decimal

from django.db import migrations

# (kilos, diámetro)
ROUND_MOLDS = [("2.7", "28"), ("4", "34"), ("6", "37"), ("8", "41"), ("10", "47"), ("12", "51.5")]
# (kilos, largo, ancho)
RECTANGULAR_MOLDS = [
    ("4", "41", "26"),
    ("5", "42", "28"),
    ("6", "45.4", "29.5"),
    ("7", "48", "33"),
    ("8", "50", "33"),
    ("9", "53.5", "41"),
    ("10", "60", "44"),
]


def seed(apps, schema_editor):
    CakeMold = apps.get_model("core_pasteleria", "CakeMold")
    for kg, diameter in ROUND_MOLDS:
        CakeMold.objects.get_or_create(
            form="round", kg=Decimal(kg), defaults={"length_cm": Decimal(diameter), "width_cm": None}
        )
    for kg, length, width in RECTANGULAR_MOLDS:
        CakeMold.objects.get_or_create(
            form="rectangular", kg=Decimal(kg), defaults={"length_cm": Decimal(length), "width_cm": Decimal(width)}
        )


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0018_cake_molds"),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
