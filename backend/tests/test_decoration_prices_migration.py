"""La migración de datos de D54 deja los precios confirmados y los tipos de chispas sin pisar lo que cambió el admin."""
import importlib
from decimal import Decimal

import pytest
from django.apps import apps

from core_pasteleria.models import DecorationOption

migration = importlib.import_module("core_pasteleria.migrations.0026_seed_decoration_prices")

pytestmark = pytest.mark.django_db

DESIGNS = ["duya", "rosetones", "festones", "olanes", "chispas"]


def row(slug):
    return DecorationOption.objects.get(slug=slug)


@pytest.fixture
def as_after_the_0024():
    migration.restore(apps, None)


def test_the_seed_leaves_the_confirmed_prices():
    assert (row("flores").pricing, row("flores").price) == ("fixed", Decimal("120.00"))
    for slug in DESIGNS + ["ninguna", "chispas-chocolate", "chispas-choco-vainilla"]:
        assert (row(slug).pricing, row(slug).price) == ("included", None)
    assert [row(slug).sort_order for slug in ("chispas", "chispas-chocolate", "chispas-choco-vainilla", "otra")] == [7, 8, 9, 10]
    for decoration in DecorationOption.objects.all():
        decoration.full_clean()


def test_the_sprinkle_types_come_from_the_flavors_and_the_bread_the_shop_already_has():
    assert row("chispas").name == "Chispas de capuchino"
    assert (row("chispas").preview_flavor.slug, row("chispas").preview_bread) == ("capuchino", None)
    assert (row("chispas-chocolate").preview_flavor, row("chispas-chocolate").preview_bread.slug) == (None, "choco_pinguino")
    assert (row("chispas-choco-vainilla").preview_flavor.slug, row("chispas-choco-vainilla").preview_bread) == ("choco_vainilla", None)


def test_running_it_again_changes_nothing():
    before = list(DecorationOption.objects.values_list("slug", "name", "pricing", "price", "sort_order"))
    migration.seed(apps, None)
    assert list(DecorationOption.objects.values_list("slug", "name", "pricing", "price", "sort_order")) == before


def test_it_migrates_rows_as_the_0024_left_them(as_after_the_0024):
    assert (row("flores").price, row("duya").pricing, row("chispas").name) == (None, "fixed", "Chispas")
    assert not DecorationOption.objects.filter(slug__startswith="chispas-").exists()
    migration.seed(apps, None)
    assert (row("flores").price, row("duya").pricing, row("chispas").name) == (Decimal("120.00"), "included", "Chispas de capuchino")
    assert row("otra").sort_order == 10


def test_it_does_not_overwrite_what_the_admin_changed(as_after_the_0024):
    DecorationOption.objects.filter(slug="flores").update(price=Decimal("95"))
    DecorationOption.objects.filter(slug="duya").update(price=Decimal("60"))
    DecorationOption.objects.filter(slug="chispas").update(name="Chispas de la casa", description="Mía")
    DecorationOption.objects.filter(slug="otra").update(sort_order=3)
    migration.seed(apps, None)
    assert row("flores").price == Decimal("95.00")
    # Con precio propio, el cobro no cambia.
    assert (row("duya").pricing, row("duya").price) == ("fixed", Decimal("60.00"))
    assert (row("chispas").name, row("chispas").description) == ("Chispas de la casa", "Mía")
    assert row("otra").sort_order == 3


def test_it_skips_a_type_whose_name_is_taken(as_after_the_0024):
    DecorationOption.objects.filter(slug="olanes").update(name="Chispas de chocolate")
    migration.seed(apps, None)
    assert not DecorationOption.objects.filter(slug="chispas-chocolate").exists()
    assert DecorationOption.objects.filter(name="Chispas de chocolate").count() == 1


def test_the_reverse_restores_the_0024_rows_and_keeps_what_the_shop_edited():
    DecorationOption.objects.filter(slug="chispas-choco-vainilla").update(description="La mía")
    migration.restore(apps, None)
    assert (row("flores").price, row("duya").pricing, row("chispas").name) == (None, "fixed", "Chispas")
    assert row("otra").sort_order == 8
    assert not DecorationOption.objects.filter(slug="chispas-chocolate").exists()
    assert DecorationOption.objects.filter(slug="chispas-choco-vainilla").exists()
