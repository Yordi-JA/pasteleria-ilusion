"""La migración de datos de la tanda 4 da a las mermeladas y a la cajeta su acabado y a Choco-pingüino su crema café claro."""
import importlib

import pytest
from django.apps import apps

from core_pasteleria.models import Bread, FillingFlavor

migration = importlib.import_module("core_pasteleria.migrations.0047_seed_preview_finishes")

pytestmark = pytest.mark.django_db

CHOCO_PINGUINO_CREAM = "#B5876B"


def flavor_style(slug):
    return FillingFlavor.objects.get(slug=slug).preview_style


def cream_color(slug):
    return Bread.objects.get(slug=slug).included_filling_preview_color


def test_the_seed_gives_the_jams_and_the_cajeta_their_finish():
    assert flavor_style("zarzamora") == "jam"
    assert flavor_style("blueberry") == "jam"
    assert flavor_style("cajeta") == "caramel"


def test_the_seed_gives_choco_pinguino_a_light_coffee_cream_and_leaves_red_velvet_white():
    assert cream_color("choco_pinguino") == CHOCO_PINGUINO_CREAM
    assert cream_color("red_velvet") == ""
    for slug in ("vainilla", "chocolate", "choco_vainilla"):
        assert cream_color(slug) == ""


def test_the_seed_leaves_the_other_flavors_and_the_pieces_as_they_are():
    assert flavor_style("durazno") == "fruit_chunks"
    assert flavor_style("nuez") == "nut_pieces"
    pinguino = Bread.objects.get(slug="choco_pinguino")
    assert (pinguino.included_filling_preview_style, pinguino.included_filling_preview_color_secondary) == (
        "round_chips",
        "#3A2218",
    )


def test_it_fills_the_rows_that_are_still_as_seeded():
    FillingFlavor.objects.filter(slug__in=["zarzamora", "blueberry", "cajeta"]).update(preview_style="smooth")
    Bread.objects.filter(slug="choco_pinguino").update(included_filling_preview_color="")
    migration.seed(apps, None)
    assert [flavor_style(slug) for slug in ("zarzamora", "blueberry", "cajeta")] == ["jam", "jam", "caramel"]
    assert cream_color("choco_pinguino") == CHOCO_PINGUINO_CREAM


def test_it_does_not_overwrite_what_the_admin_changed():
    FillingFlavor.objects.filter(slug="zarzamora").update(preview_style="fruit_chunks", preview_color_secondary="#2A0F22")
    FillingFlavor.objects.filter(slug="cajeta").update(preview_style="jam")
    Bread.objects.filter(slug="choco_pinguino").update(included_filling_preview_color="#D2B48C")
    migration.seed(apps, None)
    assert flavor_style("zarzamora") == "fruit_chunks"
    assert flavor_style("cajeta") == "jam"
    assert cream_color("choco_pinguino") == "#D2B48C"


def test_running_it_again_changes_nothing():
    migration.seed(apps, None)
    assert flavor_style("zarzamora") == "jam"
    assert cream_color("choco_pinguino") == CHOCO_PINGUINO_CREAM


def test_the_reverse_returns_only_what_the_seed_put_and_deletes_nothing():
    FillingFlavor.objects.filter(slug="blueberry").update(preview_style="caramel")
    flavors, breads = FillingFlavor.objects.count(), Bread.objects.count()
    migration.unseed(apps, None)
    assert flavor_style("zarzamora") == "smooth"
    assert flavor_style("cajeta") == "smooth"
    # Blueberry ya no es mermelada (lo cambió el admin): la reversa no lo toca.
    assert flavor_style("blueberry") == "caramel"
    assert cream_color("choco_pinguino") == ""
    assert (FillingFlavor.objects.count(), Bread.objects.count()) == (flavors, breads)
