"""`/bases` ("Bases en préstamo"): las bases de la pastelería con su depósito y las condiciones del préstamo.

Regla 7: la página muestra las bases reales de la pastelería (origen "Pastelería", activas) y, aparte, un renglón con
los depósitos que se cobran por arriba de la base más grande (`beyond`, de 26 a 50 kg en la semilla), hasta el máximo en
línea. No muestra los rangos "Aprobada" intermedios, que cubre la siguiente base más grande. Todo sale de la base de
datos (regla 2 de AGENTS.md): los rangos y depósitos de `CakeStand`, el máximo en línea de `CakeDesignSettings`, el
plazo de `PolicySettings.stand_return_days` y qué pasa si la base regresa dañada de
`PolicySettings.damaged_stand_policy`, que mientras esté vacío es PENDIENTE y sale como `null`.
"""
from dataclasses import replace
from decimal import Decimal

import pytest
from django.urls import resolve, reverse
from rest_framework.test import APIClient
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from core_pasteleria.models import CakeDesignSettings, CakeStand, PolicySettings
from core_pasteleria.repositories.memory import MemorySettingsRepo
from core_pasteleria.services import warranty_service
from tests import memory_cake_design
from tests.memory_cake_design import stand

STANDS_URL = "/api/v1/stands/"

# La semilla (migración 0007): las cinco bases de la pastelería, de menos a más kilos.
SEEDED_STANDS = [
    {"min_kg": 4, "max_kg": 5, "deposit": "70.00", "description": ""},
    {"min_kg": 6, "max_kg": 8, "deposit": "90.00", "description": ""},
    {"min_kg": 10, "max_kg": 12, "deposit": "150.00", "description": ""},
    {"min_kg": 15, "max_kg": 15, "deposit": "200.00", "description": ""},
    {"min_kg": 20, "max_kg": 25, "deposit": "250.00", "description": "Madera forrada en aluminio"},
]
SEEDED_RESPONSE = {
    "stands": SEEDED_STANDS,
    "return_days": 15,
    "from_kg": 4,
    "damaged_policy": None,
    # Los depósitos "Aprobada" de 26 a 50 kg, hasta el máximo en línea de la semilla (50 kg).
    "beyond": {"from_kg": 26, "to_kg": 50, "min_deposit": "300.00", "max_deposit": "500.00"},
}


@pytest.fixture
def api():
    return APIClient()


def memory_settings(stands=None, max_online_kg=None, **policy_changes):
    """La configuración de las reglas en memoria, con otro máximo en línea u otra política si se pide."""
    seeded = memory_cake_design.settings_repo(stands=stands)
    cake_design = seeded.get_cake_design_settings()
    return MemorySettingsRepo(
        store=seeded.get_store_settings(),
        cake_design=cake_design if max_online_kg is None else replace(cake_design, max_online_kg=max_online_kg),
        policy=replace(seeded.get_policy_settings(), **policy_changes),
        upload=seeded.get_upload_settings(),
        stands=seeded.list_stand_sizes(active_only=False),
    )


# --- Servicio (repositorio en memoria) ---


def test_terms_list_only_the_active_bakery_stands_by_kilos():
    terms = warranty_service.get_loan_terms(settings=memory_settings())
    assert [(s.min_kg, s.max_kg, s.deposit) for s in terms.stands] == [
        (4, 5, Decimal("70")),
        (6, 8, Decimal("90")),
        (10, 12, Decimal("150")),
        (15, 15, Decimal("200")),
        (20, 25, Decimal("250")),
    ]


def test_terms_leave_out_approved_and_inactive_stands():
    stands = [
        stand(20, 25, "250"),
        stand(9, 9, "150", origin="approved"),
        stand(6, 8, "90", active=False),
        stand(4, 5, "70"),
        stand(26, 30, "300", origin="approved"),
    ]
    terms = warranty_service.get_loan_terms(settings=memory_settings(stands=stands))
    assert [(s.min_kg, s.max_kg) for s in terms.stands] == [(4, 5), (20, 25)]


def test_terms_read_the_return_days_from_the_policy():
    assert warranty_service.get_loan_terms(settings=memory_settings()).return_days == 15
    assert warranty_service.get_loan_terms(settings=memory_settings(stand_return_days=20)).return_days == 20


def test_terms_start_where_the_deposit_starts():
    """"Desde 4 kg" es el umbral de `get_stand_deposit`: el `min_kg` más chico de la tabla, activas o no."""
    settings = memory_settings(stands=[stand(3, 5, "70", active=False), stand(6, 8, "90")])
    terms = warranty_service.get_loan_terms(settings=settings)
    assert terms.from_kg == 3
    assert warranty_service.get_stand_deposit(2, settings=settings).stand is None
    assert warranty_service.get_stand_deposit(3, settings=settings).stand is not None


def test_terms_without_stands_have_no_starting_kilos():
    terms = warranty_service.get_loan_terms(settings=memory_settings(stands=[]))
    assert (terms.stands, terms.from_kg, terms.beyond) == ((), None, None)


def test_terms_without_any_active_stand_have_no_starting_kilos():
    """Sin bases activas no se presta ninguna: la página no dice "Desde 4 kg". `get_stand_deposit` no cambia."""
    settings = memory_settings(stands=[stand(4, 5, "70", active=False), stand(6, 8, "90", active=False)])
    assert warranty_service.get_loan_terms(settings=settings).from_kg is None


def test_terms_without_active_bakery_stands_list_none_but_keep_the_threshold():
    """Con solo bases "Aprobada" activas, un pastel de 4 kg sí paga depósito (la siguiente base): "Desde 4 kg" sigue."""
    settings = memory_settings(stands=[stand(4, 5, "70", active=False), stand(26, 30, "300", origin="approved")])
    terms = warranty_service.get_loan_terms(settings=settings)
    assert (terms.stands, terms.from_kg, terms.beyond) == ((), 4, None)
    assert warranty_service.get_stand_deposit(4, settings=settings).deposit == Decimal("300")


# --- Más allá de la base más grande de la pastelería (`beyond`) ---


def test_beyond_sums_up_the_active_rows_past_the_largest_bakery_stand():
    beyond = warranty_service.get_loan_terms(settings=memory_settings()).beyond
    assert (beyond.from_kg, beyond.to_kg, beyond.min_deposit, beyond.max_deposit) == (26, 50, Decimal("300"), Decimal("500"))


def test_beyond_stops_at_the_online_maximum():
    beyond = warranty_service.get_loan_terms(settings=memory_settings(max_online_kg=35)).beyond
    assert (beyond.from_kg, beyond.to_kg, beyond.min_deposit, beyond.max_deposit) == (26, 35, Decimal("300"), Decimal("350"))


def test_beyond_stops_at_the_largest_active_stand():
    stands = [s if s.max_kg != 50 else replace(s, is_active=False) for s in memory_cake_design.STANDS]
    beyond = warranty_service.get_loan_terms(settings=memory_settings(stands=stands)).beyond
    assert (beyond.to_kg, beyond.max_deposit) == (45, Decimal("450"))


def test_beyond_starts_right_after_the_largest_bakery_stand():
    """Un hueco entre la base de 25 kg y la primera fila de arriba lo cubre esa fila: desde 26 kg."""
    stands = [stand(4, 5, "70"), stand(20, 25, "250"), stand(28, 30, "300", origin="approved")]
    beyond = warranty_service.get_loan_terms(settings=memory_settings(stands=stands)).beyond
    assert (beyond.from_kg, beyond.to_kg) == (26, 30)


def test_no_beyond_without_rows_past_the_largest_bakery_stand():
    stands = [s for s in memory_cake_design.STANDS if s.origin == "bakery"]
    assert warranty_service.get_loan_terms(settings=memory_settings(stands=stands)).beyond is None


def test_no_beyond_when_the_online_maximum_is_within_the_bakery_stands():
    assert warranty_service.get_loan_terms(settings=memory_settings(max_online_kg=25)).beyond is None


def test_no_beyond_with_inactive_rows_only():
    stands = [s if s.origin == "bakery" else replace(s, is_active=False) for s in memory_cake_design.STANDS]
    assert warranty_service.get_loan_terms(settings=memory_settings(stands=stands)).beyond is None


@pytest.mark.parametrize("policy", ["", "   \n"])
def test_an_empty_damaged_stand_policy_is_pending(policy):
    assert warranty_service.get_loan_terms(settings=memory_settings(damaged_stand_policy=policy)).damaged_policy is None


def test_the_damaged_stand_policy_is_the_text_the_bakery_wrote():
    settings = memory_settings(damaged_stand_policy="  Se descuenta la reparación.  ")
    assert warranty_service.get_loan_terms(settings=settings).damaged_policy == "Se descuenta la reparación."


# --- Endpoint ---


@pytest.mark.django_db
def test_stands_is_public_and_gives_the_seeded_bakery_stands(api):
    response = api.get(STANDS_URL)
    assert response.status_code == 200
    assert response.json() == SEEDED_RESPONSE


@pytest.mark.django_db
def test_stands_url_has_its_name():
    assert reverse("stands") == STANDS_URL


@pytest.mark.django_db
def test_stands_are_ordered_by_kilos_even_if_saved_out_of_order(api):
    """El orden lo da el repositorio (`order_by("max_kg")`): dos bases guardadas al revés salen por kilos."""
    CakeStand.objects.create(min_kg=56, max_kg=60, deposit=Decimal("600.00"), origin="bakery")
    CakeStand.objects.create(min_kg=51, max_kg=55, deposit=Decimal("550.00"), origin="bakery")
    kilos = [s["max_kg"] for s in api.get(STANDS_URL).json()["stands"]]
    assert kilos == [5, 8, 12, 15, 25, 55, 60]


@pytest.mark.django_db
def test_stands_leave_out_the_approved_ranges(api):
    assert CakeStand.objects.filter(origin="approved").count() == 5
    body = api.get(STANDS_URL).json()
    assert all(s["max_kg"] <= 25 for s in body["stands"])
    assert len(body["stands"]) == CakeStand.objects.filter(origin="bakery", is_active=True).count()


@pytest.mark.django_db
def test_stands_reflect_what_the_admin_saved(api):
    """Sin caché: el siguiente pedido de la página ve el cambio."""
    api.get(STANDS_URL)
    CakeStand.objects.filter(max_kg=5).update(deposit=Decimal("80.00"), description="De cartón grueso")
    CakeStand.objects.filter(max_kg=8).update(is_active=False)
    PolicySettings.objects.filter(pk=1).update(stand_return_days=20, damaged_stand_policy="Se descuenta la reparación.")
    body = api.get(STANDS_URL).json()
    assert body["stands"][0] == {"min_kg": 4, "max_kg": 5, "deposit": "80.00", "description": "De cartón grueso"}
    assert [s["max_kg"] for s in body["stands"]] == [5, 12, 15, 25]
    assert (body["return_days"], body["damaged_policy"]) == (20, "Se descuenta la reparación.")


@pytest.mark.django_db
def test_beyond_follows_the_online_maximum_of_the_admin(api):
    CakeDesignSettings.objects.filter(pk=1).update(max_online_kg=40)
    expected = {"from_kg": 26, "to_kg": 40, "min_deposit": "300.00", "max_deposit": "400.00"}
    assert api.get(STANDS_URL).json()["beyond"] == expected
    CakeDesignSettings.objects.filter(pk=1).update(max_online_kg=25)
    assert api.get(STANDS_URL).json()["beyond"] is None


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_stands_only_answer_get(api, method):
    response = getattr(api, method)(STANDS_URL, {"deposit": "1.00"}, format="json")
    assert response.status_code == 405
    assert CakeStand.objects.get(max_kg=5).deposit == Decimal("70.00")


@pytest.mark.django_db
def test_stands_ignore_an_invalid_token(api):
    """Sin sesión: un token vencido o falso no convierte la vista pública en 401."""
    api.credentials(HTTP_AUTHORIZATION="Bearer no-es-un-token")
    assert api.get(STANDS_URL).status_code == 200


@pytest.mark.django_db
def test_stands_do_not_read_the_session_or_the_token(customer_user):
    api = APIClient(enforce_csrf_checks=True)
    api.force_login(customer_user)
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(customer_user).access_token}")
    response = api.get(STANDS_URL)
    assert response.status_code == 200
    assert response.renderer_context["request"].user.is_anonymous


def test_stands_use_the_anonymous_rate():
    """Como `PublicReadOnlyView`: sin alcance propio, cuenta en el cupo `anon` por IP."""
    assert resolve(STANDS_URL).func.view_class.throttle_classes == [AnonRateThrottle]


@pytest.mark.django_db
def test_stands_are_throttled_by_the_anonymous_rate(api, monkeypatch):
    monkeypatch.setattr(AnonRateThrottle, "THROTTLE_RATES", {"anon": "2/min"})
    assert [api.get(STANDS_URL).status_code for _ in range(3)] == [200, 200, 429]


@pytest.mark.django_db
def test_stands_are_in_the_openapi_schema(api, staff_user):
    api.force_login(staff_user)
    schema = api.get("/api/v1/schema/", {"format": "json"}).json()
    operations = schema["paths"][STANDS_URL]
    assert set(operations) == {"get"}
    assert operations["get"]["operationId"] == "stands"
    assert operations["get"].get("security") in (None, [], [{}])
    component = schema["components"]["schemas"]["StandInfo"]
    assert set(component["properties"]) == set(component["required"]) == set(SEEDED_RESPONSE)
    nullable = {name for name, prop in component["properties"].items() if prop.get("nullable")}
    assert nullable == {"from_kg", "damaged_policy", "beyond"}
    examples = operations["get"]["responses"]["200"]["content"]["application/json"]["examples"]
    assert all(set(item["value"]) == set(SEEDED_RESPONSE) for item in examples.values())
