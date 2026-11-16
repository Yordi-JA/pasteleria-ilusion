"""Confirmación del correo (D76): `User.email_verified_at`.

Las cuentas que ya existían entraban sin confirmar su correo; se marcan confirmadas con la hora de la migración, para
que nadie quede fuera al desplegar. Las que nazcan después la llenan al abrir su enlace o al entrar con Google.
"""
from django.db import migrations, models
from django.utils import timezone


def confirm_existing_accounts(apps, schema_editor):
    User = apps.get_model("core_pasteleria", "User")
    User.objects.filter(email_verified_at__isnull=True).update(email_verified_at=timezone.now())


class Migration(migrations.Migration):

    dependencies = [
        ("core_pasteleria", "0042_user_notify_whatsapp"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(
                blank=True,
                editable=False,
                help_text="Cuándo confirmó su correo con el enlace que le enviamos, o al entrar con Google.",
                null=True,
                verbose_name="correo confirmado",
            ),
        ),
        # Al revertir no hay nada que deshacer: la columna se borra con la operación de arriba.
        migrations.RunPython(confirm_existing_accounts, migrations.RunPython.noop),
    ]
