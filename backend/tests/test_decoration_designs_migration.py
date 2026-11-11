"""La migración de datos de D53 siembra los diseños de la decoración sin pisar lo que cambió el admin."""
import importlib
from decimal import Decimal

import pytest
from django.apps import apps

from core_pasteleria.models import DecorationOption

migration = importlib.import_module("core_pasteleria.migrations.0023_seed_decoration_designs")
prices = importlib.import_module("core_pasteleria.migrations.0026_seed_decoration_prices")

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def as_after_the_0024():
    """Estas pruebas miran lo que la 0023 sembró: se deshacen los precios y las chispas de la 0026 (D54)."""
    prices.restore(apps, None)

ORDER = ["ninguna", "duya", "rosetones", "festones", "olanes", "flores", "chispas", "otra"]
DESIGNS = ["duya", "rosetones", "festones", "olanes", "flores", "chispas"]


def row(slug):
    return DecorationOption.objects.get(slug=slug)


def test_the_seed_lists_the_four_piping_designs_together_in_order():
    assert list(DecorationOption.objects.values_list("slug", flat=True)) == ORDER
    assert [row(slug).name for slug in ("duya", "rosetones", "festones", "olanes")] == [
        "Borde de conchas", "Rosetones", "Festones colgantes", "Olanes",
    ]


def test_every_design_is_fixed_price_and_has_no_price_yet():
    for slug in DESIGNS:
        assert (row(slug).pricing, row(slug).price) == ("fixed", None)
    assert (row("ninguna").pricing, row("otra").pricing) == ("included", "quote")


def test_every_seeded_row_passes_full_validation():
    for decoration in DecorationOption.objects.all():
        decoration.full_clean()


def test_running_it_again_changes_nothing():
    before = list(DecorationOption.objects.values_list("slug", "name", "description", "sort_order"))
    migration.seed(apps, None)
    assert list(DecorationOption.objects.values_list("slug", "name", "description", "sort_order")) == before


def test_it_migrates_rows_still_as_the_0005_seeded_them():
    DecorationOption.objects.filter(slug__in=["rosetones", "festones", "olanes"]).delete()
    DecorationOption.objects.filter(slug="duya").update(name="Patrón con duya", description="Líneas y festones de crema")
    DecorationOption.objects.filter(slug="flores").update(description="Flores hechas con duya", sort_order=3)
    DecorationOption.objects.filter(slug="chispas").update(sort_order=4)
    DecorationOption.objects.filter(slug="otra").update(sort_order=5)
    migration.seed(apps, None)
    assert list(DecorationOption.objects.values_list("slug", flat=True)) == ORDER
    assert row("duya").name == "Borde de conchas"
    assert row("flores").description.startswith("Florecitas de crema")


def test_it_does_not_overwrite_what_the_admin_changed():
    DecorationOption.objects.filter(slug__in=["rosetones", "festones", "olanes"]).delete()
    DecorationOption.objects.filter(slug="duya").update(
        name="Conchas de la casa", description="Mi descripción", price=Decimal("90")
    )
    DecorationOption.objects.filter(slug="flores").update(description="Flores de la casa", sort_order=3, price=Decimal("120"))
    DecorationOption.objects.filter(slug="chispas").update(sort_order=2, is_active=False)
    migration.seed(apps, None)
    assert (row("duya").name, row("duya").description, row("duya").price) == ("Conchas de la casa", "Mi descripción", Decimal("90.00"))
    assert (row("flores").description, row("flores").price) == ("Flores de la casa", Decimal("120.00"))
    # Un orden que la pastelería ya movió no se toca.
    assert (row("chispas").sort_order, row("chispas").is_active) == (2, False)


def test_it_skips_a_design_whose_slug_or_name_already_exists():
    DecorationOption.objects.filter(slug="olanes").delete()
    DecorationOption.objects.filter(slug="rosetones").update(name="Olanes")
    migration.seed(apps, None)
    assert DecorationOption.objects.filter(name="Olanes").count() == 1
    assert not DecorationOption.objects.filter(slug="olanes").exists()


def test_the_reverse_restores_the_0005_rows_and_keeps_a_design_that_has_a_price():
    DecorationOption.objects.filter(slug="festones").update(price=Decimal("75"))
    count = DecorationOption.objects.count()
    migration.restore(apps, None)
    assert set(DecorationOption.objects.values_list("slug", flat=True)) == {"ninguna", "duya", "flores", "chispas", "otra", "festones"}
    assert DecorationOption.objects.count() == count - 2
    assert row("duya").name == "Patrón con duya"
    assert (row("flores").sort_order, row("chispas").sort_order, row("otra").sort_order) == (3, 4, 5)
    assert row("festones").price == Decimal("75.00")


def test_the_reverse_does_not_rename_duya_when_another_row_already_has_that_name():
    DecorationOption.objects.create(name="Patrón con duya", slug="patron", description="x", pricing="fixed")
    migration.restore(apps, None)
    assert row("duya").name == "Borde de conchas"
    # Lo demás sí se restaura, y no revienta por el nombre único.
    assert row("duya").description == "Líneas y festones de crema"
    assert DecorationOption.objects.filter(name="Patrón con duya").count() == 1


def test_the_reverse_deletes_only_the_rows_exactly_as_the_seed_left_them():
    DecorationOption.objects.filter(slug="rosetones").update(description="La mía")
    DecorationOption.objects.filter(slug="festones").update(sort_order=1)
    DecorationOption.objects.filter(slug="olanes").update(is_active=False)
    migration.restore(apps, None)
    # Editadas: se quedan, con lo que la pastelería les puso.
    assert row("rosetones").description == "La mía"
    assert row("festones").sort_order == 1
    # Solo desactivada: sigue como se sembró (nombre, descripción, orden, precio fijo y vacío) y se borra.
    assert not DecorationOption.objects.filter(slug="olanes").exists()
