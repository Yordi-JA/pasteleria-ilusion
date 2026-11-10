"""La migración de datos 0015 siembra los estilos de la vista previa sin pisar lo que cambió el admin."""
import importlib

import pytest
from django.apps import apps

from core_pasteleria.models import Bread, FillingFlavor

migration = importlib.import_module("core_pasteleria.migrations.0015_seed_cake_preview_styles")

pytestmark = pytest.mark.django_db


def look(slug):
    flavor = FillingFlavor.objects.get(slug=slug)
    return flavor.preview_style, flavor.preview_color_secondary


def test_it_does_not_overwrite_a_flavor_the_admin_already_changed():
    FillingFlavor.objects.filter(slug="galleta").update(preview_style="smooth", preview_color_secondary="")
    FillingFlavor.objects.filter(slug="capuchino").update(preview_style="fruit_chunks", preview_color_secondary="#AA0000")
    FillingFlavor.objects.filter(slug="chocolate").update(preview_style="smooth", preview_color_secondary="#123456")
    migration.seed(apps, None)
    # Un sabor liso y sin color vuelve a recibir su estilo sembrado; los demás conservan lo del admin.
    assert look("galleta") == ("cookie_chunks", "#2B1D1A")
    assert look("capuchino") == ("fruit_chunks", "#AA0000")
    assert look("chocolate") == ("smooth", "#123456")


def test_it_does_not_overwrite_the_colors_of_a_two_color_bread_the_admin_edited():
    Bread.objects.filter(slug="choco_vainilla").update(preview_color="#111111", preview_color_bottom="#EEEEEE")
    migration.seed(apps, None)
    bread = Bread.objects.get(slug="choco_vainilla")
    assert (bread.preview_color, bread.preview_color_bottom) == ("#111111", "#EEEEEE")
