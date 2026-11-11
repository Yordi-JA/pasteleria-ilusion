"""La migración de datos que cambia "Flores" por "Rosas" no pisa lo que cambió el admin ni toca el precio."""
import importlib
from decimal import Decimal

import pytest
from django.apps import apps

from core_pasteleria.models import DecorationOption

migration = importlib.import_module("core_pasteleria.migrations.0024_seed_rose_decoration")

pytestmark = pytest.mark.django_db


def flores():
    return DecorationOption.objects.get(slug="flores")


def test_the_seed_names_the_decoration_roses_and_keeps_its_slug():
    assert (flores().name, flores().description) == ("Rosas", "Rosas de crema hechas con duya")
    # La 0026 le puso su precio (D54); el nombre y la descripción de la 0024 siguen.
    assert (flores().pricing, flores().price) == ("fixed", Decimal("120.00"))
    flores().full_clean()


def test_it_migrates_a_row_as_the_0005_or_the_0023_left_it():
    for description in ("Flores hechas con duya", "Florecitas de crema hechas con duya, con hojitas verdes"):
        DecorationOption.objects.filter(slug="flores").update(name="Flores", description=description)
        migration.seed(apps, None)
        assert (flores().name, flores().description) == ("Rosas", "Rosas de crema hechas con duya")


def test_it_does_not_overwrite_what_the_admin_changed_and_never_touches_the_price():
    DecorationOption.objects.filter(slug="flores").update(name="Flores de azúcar", description="La mía", price=Decimal("1.00"))
    migration.seed(apps, None)
    assert (flores().name, flores().description, flores().price) == ("Flores de azúcar", "La mía", Decimal("1.00"))
    # Con el nombre sin editar pero con precio capturado, sí cambia el nombre y el precio queda igual.
    DecorationOption.objects.filter(slug="flores").update(name="Flores", description="Flores hechas con duya")
    migration.seed(apps, None)
    assert (flores().name, flores().price) == ("Rosas", Decimal("1.00"))


def test_it_skips_the_name_when_another_row_already_has_it():
    DecorationOption.objects.filter(slug="flores").update(name="Flores")
    DecorationOption.objects.create(name="Rosas", slug="rosas-otra", description="x", pricing="fixed")
    migration.seed(apps, None)
    assert flores().name == "Flores"
    assert DecorationOption.objects.filter(name="Rosas").count() == 1


def test_running_it_again_changes_nothing():
    before = (flores().name, flores().description)
    migration.seed(apps, None)
    assert (flores().name, flores().description) == before


def test_the_reverse_restores_the_name_and_the_0023_description_only_where_the_seed_left_them():
    migration.restore(apps, None)
    assert (flores().name, flores().description) == ("Flores", "Florecitas de crema hechas con duya, con hojitas verdes")
    DecorationOption.objects.filter(slug="flores").update(name="Rosas", description="La mía")
    migration.restore(apps, None)
    assert (flores().name, flores().description) == ("Flores", "La mía")


def test_the_reverse_does_not_rename_when_another_row_already_has_the_old_name():
    DecorationOption.objects.create(name="Flores", slug="otras", description="x", pricing="fixed")
    migration.restore(apps, None)
    assert flores().name == "Rosas"
