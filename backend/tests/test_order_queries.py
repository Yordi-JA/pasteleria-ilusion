"""Consultas de un pedido con 3 diseños: las opciones, los moldes y los colores se leen una vez por pedido (D63)."""
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from tests.test_orders_api import body, design_line, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db

# Medido el 14 de noviembre de 2026: 85 consultas antes de la ronda 1 de correcciones y 36 después.
MAX_QUERIES = 40


def test_an_order_with_three_designs_reads_each_option_table_once(customer_user):
    api = APIClient()
    api.force_authenticate(customer_user)
    designs = [design_line(people=people) for people in (30, 45, 60)]
    with CaptureQueriesContext(connection) as queries:
        response = post(api, body(*designs))
    assert response.status_code == 201, response.json()
    print(f"\nconsultas de un pedido con 3 diseños: {len(queries)}")
    assert len(queries) <= MAX_QUERIES
