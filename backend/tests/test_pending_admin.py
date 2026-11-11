"""Admin de PENDIENTE: lo que la pastelería aún no define se ve, nunca se inventa."""
from decimal import Decimal

import pytest
from django.urls import reverse

from core_pasteleria.models import DecorationOption

pytestmark = pytest.mark.django_db

DECORATIONS_URL = "admin:core_pasteleria_decorationoption_changelist"


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(
        django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123")
    )
    return client


def price_cells(response):
    """Texto del precio de cada decoración que muestra la lista, por nombre."""
    admin_class = response.context["cl"].model_admin
    return {
        decoration.name: str(admin_class.price_label(decoration))
        for decoration in response.context["cl"].result_list
    }


@pytest.fixture
def pending_designs(db):
    """Los diseños sin precio definido (PENDIENTE): cobro fijo y sin precio."""
    DecorationOption.objects.filter(slug__in=["duya", "rosetones", "festones", "olanes", "flores", "chispas"]).update(
        pricing="fixed", price=None
    )


def test_decoration_list_shows_the_confirmed_prices_and_included(superuser_client):
    response = superuser_client.get(reverse(DECORATIONS_URL))
    assert response.status_code == 200
    assert price_cells(response) == {
        "Sin decoración": "Incluido",
        "Borde de conchas": "Incluido",
        "Rosetones": "Incluido",
        "Festones colgantes": "Incluido",
        "Olanes": "Incluido",
        "Rosas": "$120.00",
        "Chispas de capuchino": "Incluido",
        "Chispas de chocolate": "Incluido",
        "Chispas choco-vainilla": "Incluido",
        "Otra decoración": "Por cotizar",
    }


def test_decoration_list_shows_pending_where_the_price_is_empty(superuser_client, pending_designs):
    response = superuser_client.get(reverse(DECORATIONS_URL))
    cells = price_cells(response)
    assert [cells[name] for name in ("Borde de conchas", "Rosetones", "Festones colgantes", "Olanes", "Rosas", "Chispas de capuchino")] == ["PENDIENTE"] * 6
    assert (cells["Sin decoración"], cells["Otra decoración"]) == ("Incluido", "Por cotizar")


def test_decoration_list_shows_the_price_once_it_is_set(superuser_client, pending_designs):
    DecorationOption.objects.filter(slug="flores").update(price=Decimal("90"))
    response = superuser_client.get(reverse(DECORATIONS_URL))
    assert price_cells(response)["Rosas"] == "$90.00"
    assert price_cells(response)["Chispas de capuchino"] == "PENDIENTE"


def test_pending_price_filter_lists_only_fixed_decorations_without_a_price(superuser_client, pending_designs):
    response = superuser_client.get(reverse(DECORATIONS_URL), {"price": "pending"})
    assert sorted(price_cells(response)) == ["Borde de conchas", "Chispas de capuchino", "Festones colgantes", "Olanes", "Rosas", "Rosetones"]
    assert "Con precio pendiente" in response.content.decode()


def test_pending_price_filter_is_empty_when_every_price_is_confirmed(superuser_client):
    assert price_cells(superuser_client.get(reverse(DECORATIONS_URL), {"price": "pending"})) == {}


def test_pending_price_filter_drops_a_decoration_once_it_has_a_price(superuser_client, pending_designs):
    DecorationOption.objects.filter(slug="flores").update(price=Decimal("120"))
    response = superuser_client.get(reverse(DECORATIONS_URL), {"price": "pending"})
    assert sorted(price_cells(response)) == ["Borde de conchas", "Chispas de capuchino", "Festones colgantes", "Olanes", "Rosetones"]


def test_list_without_the_filter_shows_every_decoration(superuser_client):
    assert len(superuser_client.get(reverse(DECORATIONS_URL)).context["cl"].result_list) == 10


def test_decoration_form_explains_that_an_empty_price_is_pending(superuser_client):
    rosas = DecorationOption.objects.get(slug="flores")
    response = superuser_client.get(reverse("admin:core_pasteleria_decorationoption_change", args=[rosas.pk]))
    content = response.content.decode()
    assert "es PENDIENTE: la pastelería aún no lo define" in content
    assert "Solo para decoraciones de precio fijo" in content


def test_product_list_shows_pending_for_an_empty_photo(superuser_client):
    response = superuser_client.get(reverse("admin:core_pasteleria_product_changelist"))
    assert "PENDIENTE" in response.content.decode()


def test_policy_form_shows_the_pending_marker_for_the_damaged_stand_policy(superuser_client):
    response = superuser_client.get(reverse("admin:core_pasteleria_policysettings_change", args=[1]))
    assert "PENDIENTE: la pastelería aún no lo define" in response.content.decode()
