"""Bases (depósito por tamaño) y tarifas de envío: restricciones y semilla."""
import importlib
from decimal import Decimal

import pytest
from django.apps import apps
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.urls import reverse

from core_pasteleria.models import CakeDesignSettings, CakeStand, DeliveryFeeBand

seed_module = importlib.import_module("core_pasteleria.migrations.0007_seed_stands_and_delivery")

pytestmark = pytest.mark.django_db


def deposit_rule_over_seed(kg):
    """La regla del depósito de `esquema-catalogo.md`, aplicada a los datos sembrados.

    Es un ayudante de la prueba, no código de producción: comprueba que la semilla
    cumple la regla. La regla real vivirá en el servicio.

    El depósito es el del tamaño activo con el `max_kg` más chico que sea mayor o
    igual a `kg`; con menos kilos que el `min_kg` más chico no hay base.
    """
    stands = CakeStand.objects.filter(is_active=True)
    if kg < stands.order_by("min_kg").first().min_kg:
        return None
    stand = stands.filter(max_kg__gte=kg).order_by("max_kg").first()
    return stand.deposit if stand else None


def delivery_rule_over_seed(km):
    """La regla de envío (primera banda que cubre `km`) aplicada a los datos sembrados.

    Es un ayudante de la prueba, no código de producción: comprueba que la semilla
    cumple la regla. La regla real vivirá en el servicio.
    """
    band = DeliveryFeeBand.objects.filter(max_km__gte=Decimal(km)).order_by("max_km").first()
    return band.fee if band else None


def rejected(operation):
    with pytest.raises(IntegrityError), transaction.atomic():
        operation()


def make_stand(min_kg, max_kg, **overrides):
    values = {"deposit": Decimal("10"), "origin": "bakery"}
    return CakeStand.objects.create(min_kg=min_kg, max_kg=max_kg, **{**values, **overrides})


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(
        django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123")
    )
    return client


# --- Restricciones ---


@pytest.mark.parametrize("min_kg, max_kg", [(51, 55), (56, 60)])
def test_a_new_range_after_the_last_one_is_accepted(min_kg, max_kg):
    make_stand(min_kg, max_kg).full_clean()


@pytest.mark.parametrize(
    "min_kg, max_kg",
    [(4, 5), (3, 4), (5, 6), (1, 100), (7, 7), (11, 11), (12, 13)],
)
def test_overlapping_ranges_are_rejected(min_kg, max_kg):
    rejected(lambda: make_stand(min_kg, max_kg))


def test_a_gap_between_ranges_is_allowed():
    make_stand(9, 9)
    assert deposit_rule_over_seed(9) == Decimal("10.00")


def test_min_greater_than_max_is_rejected():
    rejected(lambda: make_stand(52, 51))


def test_two_stands_with_the_same_max_kg_are_rejected():
    rejected(lambda: make_stand(50, 50, deposit=Decimal("1")))


def test_negative_deposit_is_rejected():
    rejected(lambda: make_stand(60, 65, deposit=Decimal("-1")))


def test_zero_deposit_is_allowed():
    make_stand(60, 65, deposit=Decimal("0"))


def test_full_clean_reports_overlap_and_min_greater_than_max():
    with pytest.raises(ValidationError) as overlap:
        CakeStand(min_kg=4, max_kg=5, deposit=Decimal("1"), origin="bakery").full_clean()
    assert overlap.value.messages
    with pytest.raises(ValidationError) as order:
        CakeStand(min_kg=70, max_kg=60, deposit=Decimal("1"), origin="bakery").full_clean()
    assert order.value.message_dict == {"max_kg": ['"Hasta" no puede ser menor que "desde".']}


def test_editing_a_stand_does_not_overlap_with_itself():
    stand = CakeStand.objects.get(max_kg=12)
    stand.deposit = Decimal("160")
    stand.full_clean()


@pytest.mark.parametrize("km", ["0", "-1"])
def test_non_positive_distance_is_rejected(km):
    rejected(lambda: DeliveryFeeBand.objects.create(max_km=Decimal(km), fee=Decimal("10")))


def test_negative_fee_is_rejected():
    rejected(lambda: DeliveryFeeBand.objects.create(max_km=Decimal("20"), fee=Decimal("-1")))


def test_two_bands_with_the_same_distance_are_rejected():
    rejected(lambda: DeliveryFeeBand.objects.create(max_km=Decimal("3"), fee=Decimal("1")))


def test_free_delivery_band_with_fee_zero_is_allowed():
    DeliveryFeeBand.objects.create(max_km=Decimal("20"), fee=Decimal("0"))


# --- La semilla cumple la regla del depósito y la de envío ---


@pytest.mark.parametrize(
    "kg, expected",
    [
        (3, None), (4, 70), (5, 70), (6, 90), (8, 90), (9, 150), (10, 150), (12, 150),
        (13, 200), (14, 200), (15, 200), (16, 250), (19, 250), (20, 250), (25, 250),
        (26, 300), (30, 300), (31, 350), (35, 350), (36, 400), (41, 450), (46, 500), (50, 500),
    ],
)
def test_seeded_stands_follow_the_deposit_rule(kg, expected):
    assert deposit_rule_over_seed(kg) == (None if expected is None else Decimal(expected))


def test_deposit_ignores_inactive_stands():
    CakeStand.objects.filter(max_kg=12).update(is_active=False)
    assert deposit_rule_over_seed(9) == Decimal("200.00")


@pytest.mark.parametrize(
    "km, expected",
    [("0.5", 50), ("3", 50), ("3.1", 80), ("6", 80), ("6.1", 130), ("10", 130), ("10.1", 190), ("15", 190), ("15.1", None)],
)
def test_seeded_bands_follow_the_delivery_rule(km, expected):
    assert delivery_rule_over_seed(km) == (None if expected is None else Decimal(expected))


# --- Semilla ---


def test_seeded_stands_match_section_7():
    seeded = [
        (s.min_kg, s.max_kg, s.deposit, s.origin) for s in CakeStand.objects.order_by("max_kg")
    ]
    assert seeded == [
        (4, 5, Decimal("70"), "bakery"),
        (6, 8, Decimal("90"), "bakery"),
        (10, 12, Decimal("150"), "bakery"),
        (15, 15, Decimal("200"), "bakery"),
        (20, 25, Decimal("250"), "bakery"),
        (26, 30, Decimal("300"), "approved"),
        (31, 35, Decimal("350"), "approved"),
        (36, 40, Decimal("400"), "approved"),
        (41, 45, Decimal("450"), "approved"),
        (46, 50, Decimal("500"), "approved"),
    ]
    assert all(stand.is_active for stand in CakeStand.objects.all())
    assert CakeStand.objects.get(max_kg=25).description == "Madera forrada en aluminio"


def test_only_bakery_stands_are_the_five_real_ones():
    assert CakeStand.objects.filter(origin="bakery").count() == 5


def test_seeded_stands_reach_the_online_kilo_limit():
    top = CakeStand.objects.order_by("-max_kg").first().max_kg
    assert top >= CakeDesignSettings.objects.get(pk=1).max_online_kg


def test_seeded_delivery_bands_match_section_8():
    assert [(b.max_km, b.fee) for b in DeliveryFeeBand.objects.all()] == [
        (Decimal("3.0"), Decimal("50")),
        (Decimal("6.0"), Decimal("80")),
        (Decimal("10.0"), Decimal("130")),
        (Decimal("15.0"), Decimal("190")),
    ]


def test_every_seeded_row_passes_full_validation():
    for row in [*CakeStand.objects.all(), *DeliveryFeeBand.objects.all()]:
        row.full_clean()


def test_seed_can_run_again_without_duplicating_or_overwriting():
    CakeStand.objects.filter(max_kg=5).update(deposit=Decimal("75.00"))
    DeliveryFeeBand.objects.filter(max_km=Decimal("3")).update(fee=Decimal("55.00"))
    seed_module.seed_stands_and_delivery(apps, None)
    assert CakeStand.objects.count() == 10
    assert DeliveryFeeBand.objects.count() == 4
    assert CakeStand.objects.get(max_kg=5).deposit == Decimal("75.00")
    assert DeliveryFeeBand.objects.get(max_km=Decimal("3")).fee == Decimal("55.00")


# --- Admin ---


def test_stand_and_band_admin_pages_load(superuser_client):
    for name in ("cakestand", "deliveryfeeband"):
        assert superuser_client.get(reverse(f"admin:core_pasteleria_{name}_changelist")).status_code == 200
        assert superuser_client.get(reverse(f"admin:core_pasteleria_{name}_add")).status_code == 200


def test_stand_labels_are_built_from_the_range():
    assert str(CakeStand.objects.get(max_kg=5)) == "Base para 4 a 5 kg"
    assert str(CakeStand.objects.get(max_kg=15)) == "Base para 15 kg"


def test_admin_rejects_an_overlapping_stand(superuser_client):
    response = superuser_client.post(
        reverse("admin:core_pasteleria_cakestand_add"),
        {"min_kg": 4, "max_kg": 7, "deposit": "10", "origin": "bakery", "is_active": "on"},
    )
    assert response.status_code == 200
    assert response.context["adminform"].form.non_field_errors()


def test_admin_rejects_a_reversed_range_without_failing(superuser_client):
    response = superuser_client.post(
        reverse("admin:core_pasteleria_cakestand_add"),
        {"min_kg": 70, "max_kg": 60, "deposit": "10", "origin": "bakery", "is_active": "on"},
    )
    assert response.status_code == 200
    assert response.context["adminform"].form.errors["max_kg"]


def test_admin_warns_when_stands_do_not_reach_the_online_limit(superuser_client):
    url = reverse("admin:core_pasteleria_cakestand_changelist")
    assert "no tendría base" not in superuser_client.get(url).content.decode()
    CakeStand.objects.filter(max_kg__gt=40).update(is_active=False)
    assert "no tendría base" in superuser_client.get(url).content.decode()


def test_stands_cannot_be_deleted_from_the_admin_only_deactivated(superuser_client):
    """Borrar una base dejaría pedidos sin depósito; se desactiva."""
    stand = CakeStand.objects.get(max_kg=5)
    delete_url = reverse("admin:core_pasteleria_cakestand_delete", args=[stand.pk])
    assert superuser_client.get(delete_url).status_code == 403
    assert superuser_client.post(delete_url, {"post": "yes"}).status_code == 403
    changelist = superuser_client.get(reverse("admin:core_pasteleria_cakestand_changelist"))
    assert "delete_selected" not in changelist.content.decode()
    assert CakeStand.objects.filter(pk=stand.pk).exists()


def test_online_limit_cannot_go_beyond_the_largest_active_stand():
    design = CakeDesignSettings.objects.get(pk=1)
    design.max_online_kg = 51
    with pytest.raises(ValidationError) as raised:
        design.full_clean()
    assert raised.value.message_dict["max_online_kg"] == [
        "La base activa más grande llega a 50 kg: los kilos máximos en línea no pueden pasar de ahí. "
        "Agrega o activa una base más grande primero."
    ]
    design.max_online_kg = 50
    design.full_clean()


def test_online_limit_follows_only_active_stands():
    CakeStand.objects.filter(max_kg__gt=40).update(is_active=False)
    design = CakeDesignSettings.objects.get(pk=1)
    design.max_online_kg = 45
    with pytest.raises(ValidationError):
        design.full_clean()
    design.max_online_kg = 40
    design.full_clean()


def test_online_limit_needs_some_active_stand():
    CakeStand.objects.update(is_active=False)
    design = CakeDesignSettings.objects.get(pk=1)
    design.max_online_kg = 49
    with pytest.raises(ValidationError) as raised:
        design.full_clean()
    assert raised.value.message_dict["max_online_kg"] == [
        "No hay bases activas: activa al menos una antes de fijar los kilos máximos en línea."
    ]


def test_admin_rejects_an_online_limit_beyond_the_stands(superuser_client):
    url = reverse("admin:core_pasteleria_cakedesignsettings_change", args=[1])
    form = superuser_client.get(url).context["adminform"].form
    data = {name: form[name].value() for name in form.fields}
    response = superuser_client.post(url, {**data, "max_online_kg": 60})
    assert response.status_code == 200
    assert response.context["adminform"].form.errors["max_online_kg"]
    assert CakeDesignSettings.objects.get(pk=1).max_online_kg == 50


def test_other_settings_can_be_edited_without_active_stands():
    """La validación de los kilos máximos solo corre si ese campo cambia."""
    CakeStand.objects.update(is_active=False)
    design = CakeDesignSettings.objects.get(pk=1)
    design.wafer_price = Decimal("130")
    design.full_clean()


def test_online_limit_is_validated_when_the_row_is_new():
    CakeDesignSettings.objects.all().delete()
    CakeStand.objects.filter(max_kg__gt=40).update(is_active=False)
    design = CakeDesignSettings(
        people_per_kg=7, min_custom_kg=4, max_online_kg=50, wafer_price=Decimal("125"),
        wafer_max_width_cm=Decimal("21.6"), wafer_max_height_cm=Decimal("27.9"), message_suggested_max_words=4,
    )
    with pytest.raises(ValidationError) as raised:
        design.full_clean()
    assert list(raised.value.message_dict) == ["max_online_kg"]


# --- Umbral del depósito ---

THRESHOLD_MESSAGE = (
    "La base más chica empezaría en {kg} kg y el pedido mínimo es de 4 kg: un pedido de 4 kg "
    "se quedaría sin base. Deja una base que empiece en 4 kg o menos."
)


def test_the_smallest_stand_cannot_start_above_the_minimum_order():
    stand = CakeStand.objects.get(max_kg=5)
    stand.min_kg = 5
    with pytest.raises(ValidationError) as raised:
        stand.full_clean()
    assert raised.value.message_dict["min_kg"] == [THRESHOLD_MESSAGE.format(kg=5)]


def test_the_threshold_counts_inactive_stands_too():
    """El umbral sin depósito sale de toda la tabla, como en `warranty_service`."""
    CakeStand.objects.filter(max_kg=5).update(is_active=False)
    stand = CakeStand.objects.get(max_kg=8)
    stand.deposit = Decimal("95")
    stand.full_clean()


def test_a_stand_below_the_minimum_order_is_accepted():
    CakeStand(min_kg=2, max_kg=3, deposit=Decimal("50"), origin="approved").full_clean()


def test_admin_rejects_raising_the_smallest_stand(superuser_client):
    stand = CakeStand.objects.get(max_kg=5)
    response = superuser_client.post(
        reverse("admin:core_pasteleria_cakestand_change", args=[stand.pk]),
        {"min_kg": 5, "max_kg": 5, "deposit": "70", "origin": "bakery", "is_active": "on"},
    )
    assert response.status_code == 200
    assert response.context["adminform"].form.errors["min_kg"]
    assert CakeStand.objects.get(pk=stand.pk).min_kg == 4
