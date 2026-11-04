"""Siembra los tamaños de base con su depósito y las tarifas de envío.

Valores de `docs/reglas-de-negocio.md`, secciones 7 y 8. Los rangos 9, 13 a 14 y
16 a 19 kg no llevan fila: los cubre la regla de la siguiente base más grande.
Cada fila se busca por su tope (`max_kg` o `max_km`) con `get_or_create`, así que
no pisa lo que ya editó la pastelería. La reversa no borra nada.
"""
from decimal import Decimal

from django.db import migrations

# (desde kg, hasta kg, depósito, origen, descripción)
STANDS = [
    (4, 5, "70.00", "bakery", ""),
    (6, 8, "90.00", "bakery", ""),
    (10, 12, "150.00", "bakery", ""),
    (15, 15, "200.00", "bakery", ""),
    (20, 25, "250.00", "bakery", "Madera forrada en aluminio"),
    (26, 30, "300.00", "approved", ""),
    (31, 35, "350.00", "approved", ""),
    (36, 40, "400.00", "approved", ""),
    (41, 45, "450.00", "approved", ""),
    (46, 50, "500.00", "approved", ""),
]

# (hasta km, costo). Más de 15 km: por WhatsApp, sin fila.
DELIVERY_BANDS = [("3.0", "50.00"), ("6.0", "80.00"), ("10.0", "130.00"), ("15.0", "190.00")]


def seed_stands_and_delivery(apps, schema_editor):
    CakeStand = apps.get_model("core_pasteleria", "CakeStand")
    for min_kg, max_kg, deposit, origin, description in STANDS:
        CakeStand.objects.get_or_create(
            max_kg=max_kg,
            defaults={
                "min_kg": min_kg,
                "deposit": Decimal(deposit),
                "origin": origin,
                "description": description,
            },
        )
    DeliveryFeeBand = apps.get_model("core_pasteleria", "DeliveryFeeBand")
    for max_km, fee in DELIVERY_BANDS:
        DeliveryFeeBand.objects.get_or_create(
            max_km=Decimal(max_km), defaults={"fee": Decimal(fee)}
        )


class Migration(migrations.Migration):

    dependencies = [
        ("core_pasteleria", "0006_stands_and_delivery"),
    ]

    operations = [
        migrations.RunPython(seed_stands_and_delivery, migrations.RunPython.noop),
    ]
