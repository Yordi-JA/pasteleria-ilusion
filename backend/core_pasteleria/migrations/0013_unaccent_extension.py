"""Extensión `unaccent` de PostgreSQL para buscar en el catálogo sin acentos.

`CREATE EXTENSION IF NOT EXISTS "unaccent"`: es idempotente y no toca ninguna
tabla, así que puede correr en la fase `release` de Heroku. Si fallara, la
versión nueva no se publica y sigue la anterior. `unaccent` es una extensión
estándar de `contrib`. Al revertir, Django la quita si existe.
"""
from django.contrib.postgres.operations import UnaccentExtension
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core_pasteleria", "0012_product_featured_on_home"),
    ]

    operations = [
        UnaccentExtension(),
    ]
