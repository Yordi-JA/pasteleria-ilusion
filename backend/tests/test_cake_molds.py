"""Moldes de la pastelería (D52): restricciones, admin y semilla."""
import importlib
from decimal import Decimal

import pytest
from django.apps import apps
from django.db import IntegrityError, transaction
from django.urls import reverse

from core_pasteleria.models import CakeMold
from core_pasteleria.repositories import cake_option_repo

seed_module = importlib.import_module("core_pasteleria.migrations.0019_seed_cake_molds")

pytestmark = pytest.mark.django_db


def rejected(operation):
    with pytest.raises(IntegrityError), transaction.atomic():
        operation()


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    return client


def test_the_seed_has_the_bakery_molds():
    rounds = CakeMold.objects.filter(form="round")
    rectangles = CakeMold.objects.filter(form="rectangular")
    assert [(m.kg, m.length_cm, m.width_cm) for m in rounds] == [
        (Decimal(kg), Decimal(d), None) for kg, d in [("2.7", "28"), ("4", "34"), ("6", "37"), ("8", "41"), ("10", "47"), ("12", "51.5")]
    ]
    assert [(m.kg, m.length_cm, m.width_cm) for m in rectangles] == [
        (Decimal(kg), Decimal(length), Decimal(width))
        for kg, length, width in [
            ("4", "41", "26"), ("5", "42", "28"), ("6", "45.4", "29.5"), ("7", "48", "33"),
            ("8", "50", "33"), ("9", "53.5", "41"), ("10", "60", "44"),
        ]
    ]


def test_running_the_seed_again_neither_duplicates_nor_overwrites_what_the_admin_changed():
    total = CakeMold.objects.count()
    CakeMold.objects.filter(form="round", kg=Decimal("12")).update(length_cm=Decimal("53"))
    seed_module.seed(apps, None)
    assert CakeMold.objects.count() == total
    assert CakeMold.objects.get(form="round", kg=Decimal("12")).length_cm == Decimal("53.0")


def test_the_seed_recreates_a_mold_the_bakery_deleted():
    CakeMold.objects.filter(form="rectangular", kg=Decimal("5")).delete()
    seed_module.seed(apps, None)
    assert CakeMold.objects.get(form="rectangular", kg=Decimal("5")).length_cm == Decimal("42.0")


def test_a_form_and_kilos_pair_is_unique():
    rejected(lambda: CakeMold.objects.create(form="round", kg=Decimal("12"), length_cm=Decimal("60")))
    # Los mismos kilos en la otra forma sí se pueden.
    CakeMold.objects.create(form="rectangular", kg=Decimal("2.7"), length_cm=Decimal("30"), width_cm=Decimal("20"))


def test_the_database_rejects_non_positive_sizes():
    rejected(lambda: CakeMold.objects.create(form="round", kg=Decimal("0"), length_cm=Decimal("20")))
    rejected(lambda: CakeMold.objects.create(form="round", kg=Decimal("3"), length_cm=Decimal("0")))


def test_a_round_mold_has_no_width_and_a_rectangular_one_needs_it():
    rejected(lambda: CakeMold.objects.create(form="round", kg=Decimal("3"), length_cm=Decimal("30"), width_cm=Decimal("20")))
    rejected(lambda: CakeMold.objects.create(form="rectangular", kg=Decimal("3"), length_cm=Decimal("30")))
    rejected(lambda: CakeMold.objects.create(form="rectangular", kg=Decimal("3"), length_cm=Decimal("30"), width_cm=Decimal("0")))


def test_the_repository_returns_records_ordered_by_form_and_kilos():
    molds = cake_option_repo.list_cake_molds()
    assert len(molds) == 13
    rounds = [m.kg for m in molds if m.form == "round"]
    assert rounds == sorted(rounds)
    smallest_round = next(m for m in molds if m.form == "round")
    assert (smallest_round.kg, smallest_round.length_cm, smallest_round.width_cm) == (Decimal("2.7"), Decimal("28.0"), None)


def test_the_admin_adds_a_mold_and_rejects_a_bad_one(superuser_client):
    url = reverse("admin:core_pasteleria_cakemold_add")
    saved = superuser_client.post(url, {"form": "round", "kg": "14", "length_cm": "55", "width_cm": ""})
    assert saved.status_code == 302
    assert CakeMold.objects.filter(form="round", kg=Decimal("14")).exists()
    repeated = superuser_client.post(url, {"form": "round", "kg": "14", "length_cm": "56", "width_cm": ""})
    assert repeated.status_code == 200
    round_with_width = superuser_client.post(url, {"form": "round", "kg": "15", "length_cm": "56", "width_cm": "30"})
    assert round_with_width.status_code == 200
    assert not CakeMold.objects.filter(kg=Decimal("15")).exists()
    rect_without_width = superuser_client.post(url, {"form": "rectangular", "kg": "15", "length_cm": "56", "width_cm": ""})
    assert rect_without_width.status_code == 200
    assert not CakeMold.objects.filter(kg=Decimal("15")).exists()
    assert superuser_client.get(reverse("admin:core_pasteleria_cakemold_changelist")).status_code == 200


def test_the_database_rejects_nan_and_values_over_the_caps():
    from django.db import connection

    def raw_insert(kg, length, width="NULL", form="round"):
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO core_pasteleria_cakemold (form, kg, length_cm, width_cm) "
                f"VALUES ('{form}', {kg}, {length}, {width})"
            )

    # PostgreSQL deja pasar un NaN en un `numeric` con una restricción de solo "mayor que 0".
    rejected(lambda: raw_insert("'NaN'", "30"))
    rejected(lambda: raw_insert("3", "'NaN'"))
    rejected(lambda: raw_insert("3", "30", "'NaN'", "rectangular"))
    rejected(lambda: raw_insert("101", "30"))
    rejected(lambda: raw_insert("3", "151"))
    rejected(lambda: raw_insert("3", "30", "151", "rectangular"))


def test_the_form_validators_stop_a_typo_in_the_admin():
    from django.core.exceptions import ValidationError

    for fields in (
        {"kg": Decimal("101"), "length_cm": Decimal("30")},
        {"kg": Decimal("3"), "length_cm": Decimal("151")},
        {"kg": Decimal("3"), "length_cm": Decimal("0")},
    ):
        with pytest.raises(ValidationError):
            CakeMold(form="round", **fields).full_clean()
    CakeMold(form="round", kg=Decimal("14"), length_cm=Decimal("55")).full_clean()


def mold_warnings(response):
    return [str(message) for message in response.context["messages"] if message.level_tag == "warning"]


def test_the_admin_warns_softly_when_a_mold_breaks_the_growing_order(superuser_client):
    url = reverse("admin:core_pasteleria_cakemold_add")
    # 14 kg más chico que el de 12 kg: avisa, pero guarda.
    response = superuser_client.post(url, {"form": "round", "kg": "14", "length_cm": "40", "width_cm": ""}, follow=True)
    assert CakeMold.objects.filter(form="round", kg=Decimal("14")).exists()
    assert len(mold_warnings(response)) == 1
    assert "no crecen juntos" in mold_warnings(response)[0]
    # Uno que sí crece no avisa.
    ok = superuser_client.post(url, {"form": "round", "kg": "16", "length_cm": "60", "width_cm": ""}, follow=True)
    assert mold_warnings(ok) == []
