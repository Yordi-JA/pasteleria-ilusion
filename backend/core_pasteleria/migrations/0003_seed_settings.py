"""Siembra las 4 configuraciones de una sola fila con los valores de las reglas.

Usa `get_or_create`: si la pastelería ya editó la fila, no la pisa. La reversa
no borra nada para no perder lo que se haya editado.
"""
from datetime import time
from decimal import Decimal

from django.db import migrations


def seed_settings(apps, schema_editor):
    # Valores de `docs/reglas-de-negocio.md`, secciones 1, 3, 6.3, 7, 8 y 9.
    apps.get_model("core_pasteleria", "StoreSettings").objects.get_or_create(
        pk=1,
        defaults={
            "store_opens_at": time(10, 0),
            "store_closes_at": time(22, 30),
            "first_slot_starts_at": time(10, 30),
            "last_slot_starts_at": time(22, 0),
            "slot_minutes": 30,
            "max_orders_per_slot": 3,
            "custom_lead_days": 2,
            "same_day_showcase_lead_hours": 2,
            "free_delivery_from_kg": 15,
        },
    )
    apps.get_model("core_pasteleria", "CakeDesignSettings").objects.get_or_create(
        pk=1,
        defaults={
            "people_per_kg": 7,
            "min_custom_kg": 4,
            # PROPUESTA: falta que la pastelería la valide.
            "max_online_kg": 50,
            "wafer_price": Decimal("125.00"),
            "wafer_max_width_cm": Decimal("21.6"),
            "wafer_max_height_cm": Decimal("27.9"),
            "message_suggested_max_words": 4,
        },
    )
    # `damaged_stand_policy` queda vacío: PENDIENTE (sección 7 de las reglas).
    apps.get_model("core_pasteleria", "PolicySettings").objects.get_or_create(
        pk=1, defaults={"stand_return_days": 15}
    )
    apps.get_model("core_pasteleria", "UploadSettings").objects.get_or_create(
        pk=1, defaults={"max_upload_mb": 5, "max_reference_images": 3}
    )


class Migration(migrations.Migration):

    dependencies = [
        ("core_pasteleria", "0002_settings"),
    ]

    operations = [
        migrations.RunPython(seed_settings, migrations.RunPython.noop),
    ]
