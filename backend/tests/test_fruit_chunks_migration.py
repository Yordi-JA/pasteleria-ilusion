"""La migración de datos de D51 pasa durazno y fresa a trozos de fruta sin pisar lo que cambió el admin."""
import importlib

import pytest
from django.apps import apps

from core_pasteleria.models import FillingFlavor

migration = importlib.import_module("core_pasteleria.migrations.0017_seed_fruit_chunks_style")

pytestmark = pytest.mark.django_db


def look(slug):
    flavor = FillingFlavor.objects.get(slug=slug)
    return flavor.preview_style, flavor.preview_color_secondary


def test_the_seed_gives_durazno_and_fresa_fruit_chunks_and_keeps_their_colors():
    assert look("durazno") == ("fruit_chunks", "#FBD08F")
    assert look("fresa") == ("fruit_chunks", "#C8283A")


def test_the_seed_leaves_the_other_flavors_as_they_are():
    assert look("galleta")[0] == "cookie_chunks"
    assert look("chocolate")[0] == "sprinkles"
    assert look("zarzamora")[0] == "smooth"


def test_it_moves_the_rows_still_seeded_by_0015():
    FillingFlavor.objects.filter(slug__in=["durazno", "fresa"]).update(preview_style="fruit_slices")
    migration.seed(apps, None)
    assert look("durazno")[0] == "fruit_chunks"
    assert look("fresa")[0] == "fruit_chunks"


def test_it_does_not_overwrite_what_the_admin_changed():
    FillingFlavor.objects.filter(slug="durazno").update(preview_style="smooth")
    FillingFlavor.objects.filter(slug="fresa").update(preview_style="fruit_slices", preview_color_secondary="#AA0000")
    migration.seed(apps, None)
    assert look("durazno")[0] == "smooth"
    assert look("fresa") == ("fruit_slices", "#AA0000")


def test_running_it_again_changes_nothing():
    migration.seed(apps, None)
    assert look("durazno") == ("fruit_chunks", "#FBD08F")


def test_the_reverse_restores_slices_only_where_the_seed_put_chunks_and_deletes_nothing():
    FillingFlavor.objects.filter(slug="fresa").update(preview_color_secondary="#AA0000")
    total = FillingFlavor.objects.count()
    migration.restore_slices(apps, None)
    assert look("durazno") == ("fruit_slices", "#FBD08F")
    assert look("fresa") == ("fruit_chunks", "#AA0000")
    assert FillingFlavor.objects.count() == total
