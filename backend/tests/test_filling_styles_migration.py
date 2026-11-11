"""La migración de datos de D52 siembra los rellenos nuevos sin pisar lo que cambió el admin."""
import importlib

import pytest
from django.apps import apps

from core_pasteleria.models import Bread, FillingFlavor

migration = importlib.import_module("core_pasteleria.migrations.0021_seed_filling_styles")

pytestmark = pytest.mark.django_db


def flavor_look(slug):
    flavor = FillingFlavor.objects.get(slug=slug)
    return flavor.preview_style, flavor.preview_color_secondary


def bread_look(slug):
    bread = Bread.objects.get(slug=slug)
    return bread.included_filling_preview_style, bread.included_filling_preview_color_secondary


def test_the_seed_gives_the_new_fillings_their_style_and_color():
    assert flavor_look("fresa_yogurt") == ("crumbles", "#D95F76")
    assert flavor_look("nuez") == ("nut_pieces", "#7A5230")
    assert bread_look("choco_pinguino") == ("round_chips", "#3A2218")
    assert bread_look("red_velvet") == ("sprinkles", "#C8283A")


def test_the_seed_leaves_the_other_fillings_and_breads_as_they_are():
    assert flavor_look("durazno")[0] == "fruit_chunks"
    assert flavor_look("zarzamora") == ("smooth", "")
    for slug in ("vainilla", "chocolate", "choco_vainilla"):
        assert bread_look(slug) == ("smooth", "")


def test_it_fills_the_rows_that_are_still_smooth_and_without_a_color():
    FillingFlavor.objects.filter(slug__in=["nuez", "fresa_yogurt"]).update(preview_style="smooth", preview_color_secondary="")
    Bread.objects.filter(slug__in=["choco_pinguino", "red_velvet"]).update(
        included_filling_preview_style="smooth", included_filling_preview_color_secondary=""
    )
    migration.seed(apps, None)
    assert flavor_look("nuez") == ("nut_pieces", "#7A5230")
    assert bread_look("red_velvet") == ("sprinkles", "#C8283A")


def test_it_does_not_overwrite_what_the_admin_changed():
    FillingFlavor.objects.filter(slug="nuez").update(preview_style="cookie_chunks", preview_color_secondary="#AA0000")
    FillingFlavor.objects.filter(slug="fresa_yogurt").update(preview_style="smooth", preview_color_secondary="#123456")
    Bread.objects.filter(slug="choco_pinguino").update(
        included_filling_preview_style="smooth", included_filling_preview_color_secondary="#123456"
    )
    Bread.objects.filter(slug="red_velvet").update(included_filling_preview_style="round_chips")
    migration.seed(apps, None)
    assert flavor_look("nuez") == ("cookie_chunks", "#AA0000")
    assert flavor_look("fresa_yogurt") == ("smooth", "#123456")
    assert bread_look("choco_pinguino") == ("smooth", "#123456")
    assert bread_look("red_velvet") == ("round_chips", "#C8283A")


def test_running_it_again_changes_nothing():
    migration.seed(apps, None)
    assert flavor_look("fresa_yogurt") == ("crumbles", "#D95F76")
    assert bread_look("choco_pinguino") == ("round_chips", "#3A2218")


def test_the_reverse_returns_to_smooth_only_where_the_seed_put_the_style_and_deletes_nothing():
    FillingFlavor.objects.filter(slug="nuez").update(preview_color_secondary="#AA0000")
    Bread.objects.filter(slug="red_velvet").update(included_filling_preview_color_secondary="#AA0000")
    flavors, breads = FillingFlavor.objects.count(), Bread.objects.count()
    migration.restore_smooth(apps, None)
    assert flavor_look("fresa_yogurt") == ("smooth", "")
    assert flavor_look("nuez") == ("nut_pieces", "#AA0000")
    assert bread_look("choco_pinguino") == ("smooth", "")
    assert bread_look("red_velvet") == ("sprinkles", "#AA0000")
    assert (FillingFlavor.objects.count(), Bread.objects.count()) == (flavors, breads)
