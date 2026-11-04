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


def test_decoration_list_shows_pending_where_the_price_is_empty(superuser_client):
    response = superuser_client.get(reverse(DECORATIONS_URL))
    assert response.status_code == 200
    assert price_cells(response) == {
        "Sin decoración": "Incluido",
        "Patrón con duya": "PENDIENTE",
        "Flores": "PENDIENTE",
        "Chispas": "PENDIENTE",
        "Otra decoración": "Por cotizar",
    }
    assert response.content.decode().count("PENDIENTE") >= 3


def test_decoration_list_shows_the_price_once_it_is_set(superuser_client):
    DecorationOption.objects.filter(slug="flores").update(price=Decimal("90"))
    response = superuser_client.get(reverse(DECORATIONS_URL))
    assert price_cells(response)["Flores"] == "$90.00"
    assert price_cells(response)["Chispas"] == "PENDIENTE"


def test_pending_price_filter_lists_only_fixed_decorations_without_a_price(superuser_client):
    response = superuser_client.get(reverse(DECORATIONS_URL), {"price": "pending"})
    assert sorted(price_cells(response)) == ["Chispas", "Flores", "Patrón con duya"]
    assert "Con precio pendiente" in response.content.decode()


def test_pending_price_filter_drops_a_decoration_once_it_has_a_price(superuser_client):
    DecorationOption.objects.filter(slug="duya").update(price=Decimal("60"))
    response = superuser_client.get(reverse(DECORATIONS_URL), {"price": "pending"})
    assert sorted(price_cells(response)) == ["Chispas", "Flores"]


def test_list_without_the_filter_shows_every_decoration(superuser_client):
    assert len(superuser_client.get(reverse(DECORATIONS_URL)).context["cl"].result_list) == 5


def test_decoration_form_explains_that_an_empty_price_is_pending(superuser_client):
    duya = DecorationOption.objects.get(slug="duya")
    response = superuser_client.get(reverse("admin:core_pasteleria_decorationoption_change", args=[duya.pk]))
    content = response.content.decode()
    assert "es PENDIENTE: la pastelería aún no lo define" in content
    assert "Solo para decoraciones de precio fijo" in content


def test_product_list_shows_pending_for_an_empty_photo(superuser_client):
    response = superuser_client.get(reverse("admin:core_pasteleria_product_changelist"))
    assert "PENDIENTE" in response.content.decode()


def test_policy_form_shows_the_pending_marker_for_the_damaged_stand_policy(superuser_client):
    response = superuser_client.get(reverse("admin:core_pasteleria_policysettings_change", args=[1]))
    assert "PENDIENTE: la pastelería aún no lo define" in response.content.decode()
