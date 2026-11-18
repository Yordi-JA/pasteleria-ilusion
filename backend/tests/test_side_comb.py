"""Peinado lateral del pastel (tanda 4): los surcos horizontales en los costados de la cobertura.

Va por omisión y el cliente lo puede quitar en el paso 5. No cambia el precio. La pastelería lo ve en el pedido.
"""
import importlib
from types import SimpleNamespace

import pytest
from django.db import connection
from rest_framework.test import APIClient

from core_pasteleria.admin import design_lines
from core_pasteleria.api import note_pdf
from core_pasteleria.models import CakeDesign, Order
from tests.test_orders_api import bakery_clock, many_unpaid_orders  # noqa: F401 - fijan la hora y el tope de pedidos
from tests.test_note_pdf_layout import _design
from tests.test_order_note import note_url, pay, pdf_text
from tests.test_orders_api import body, design_line, post

pytestmark = pytest.mark.django_db

PRICE_URL = "/api/v1/cake-designs/price/"
PRICE_CHOICE = {"kg": 15, "cake_type": "tres_leches", "bread": "chocolate", "filling_base": "queso", "filling_flavors": ["zarzamora"]}
NOT_A_BOOLEAN = "Indica si lleva peinado lateral: true o false."


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


def ordered(client, **changes):
    response = post(client, body(design_line(**changes)))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"]).items.get().design


# --- El pedido ---


def test_a_design_without_the_field_is_combed(api):
    assert ordered(api).side_comb is True


def test_the_customer_can_ask_for_smooth_sides(api):
    assert ordered(api, side_comb=False).side_comb is False
    assert ordered(api, side_comb=True).side_comb is True


def test_the_order_returns_whether_the_cake_is_combed(api):
    design = ordered(api, side_comb=False)
    order = Order.objects.get(items__design=design)
    data = api.get(f"/api/v1/orders/{order.pk}/").json()
    assert data["items"][0]["design"]["side_comb"] is False


@pytest.mark.parametrize("value", ["false", "no", 0, 1, None])
def test_the_order_takes_only_a_real_boolean(api, value):
    response = post(api, body(design_line(side_comb=value)))
    assert response.status_code == 400
    assert response.json()["items"]["0"]["design"]["side_comb"] == [NOT_A_BOOLEAN]


def test_combing_does_not_change_the_order_total(api):
    combed = ordered(api)
    smooth = ordered(api, side_comb=False)
    assert combed.total == smooth.total


# --- El precio ---


@pytest.mark.parametrize("value", [True, False])
def test_the_price_accepts_the_comb_and_it_does_not_change_the_total(value):
    client = APIClient()
    plain = client.post(PRICE_URL, PRICE_CHOICE, format="json")
    with_comb = client.post(PRICE_URL, {**PRICE_CHOICE, "side_comb": value}, format="json")
    assert with_comb.status_code == 200, with_comb.json()
    assert with_comb.json()["total"] == plain.json()["total"]


@pytest.mark.parametrize("value", ["true", 1, None])
def test_the_price_takes_only_a_real_boolean(value):
    response = APIClient().post(PRICE_URL, {**PRICE_CHOICE, "side_comb": value}, format="json")
    assert response.status_code == 400
    assert response.json()["side_comb"] == [NOT_A_BOOLEAN]


# --- Los pedidos de antes y el admin ---


def test_the_migration_gives_existing_designs_the_combing():
    migration = importlib.import_module("core_pasteleria.migrations.0048_cakedesign_side_comb")
    operation = next(op for op in migration.Migration.operations if getattr(op, "name", "") == "side_comb")
    assert operation.field.default is True
    # Con `db_default`, la base llena las filas que ya existían al agregar la columna.
    assert operation.field.db_default is True


def test_the_database_default_is_combed(api):
    design = ordered(api, side_comb=False)
    with connection.cursor() as cursor:
        cursor.execute(f"UPDATE {CakeDesign._meta.db_table} SET side_comb = DEFAULT WHERE id = %s", [design.pk])
    design.refresh_from_db()
    assert design.side_comb is True


def test_the_admin_says_whether_the_sides_are_combed(api):
    combed = next(line for line in design_lines(ordered(api)) if "Cobertura" in line)
    smooth = next(line for line in design_lines(ordered(api, side_comb=False)) if "Cobertura" in line)
    assert combed.endswith(", con peinado lateral")
    assert smooth.endswith(", sin peinado lateral")


# --- La nota en PDF ---


@pytest.mark.parametrize(("side_comb", "phrase"), [(True, "Con peinado lateral."), (False, "Sin peinado lateral.")])
def test_the_pdf_note_says_whether_the_sides_are_combed(side_comb, phrase):
    item = SimpleNamespace(design=_design(side_comb=side_comb, message=None, wafer=False))
    _, description = note_pdf._design_description(item)
    assert description.endswith(f"Decoración: Borde de conchas. {phrase}")


def test_the_pdf_note_keeps_the_comb_with_a_message_of_several_lines():
    item = SimpleNamespace(design=_design(side_comb=False))
    _, description = note_pdf._design_description(item)
    assert description.split("\n")[0].endswith("Decoración: Borde de conchas. Sin peinado lateral.")


def test_the_downloaded_note_carries_the_comb(api):
    order = Order.objects.get(items__design=ordered(api, side_comb=False))
    text = pdf_text(api.get(note_url(pay(order))).content)
    assert b"Sin peinado lateral." in text
