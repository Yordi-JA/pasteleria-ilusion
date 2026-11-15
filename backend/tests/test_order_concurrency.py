"""Dos pedidos a la vez no pasan del cupo del lapso ni venden la misma pieza (regla 1, D63).

Pruebas con hilos y transacciones reales: cada hilo crea su pedido con su propia conexión, y todos arrancan juntos.
"""
import threading
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.db import connection

from core_pasteleria.models import Inventory, Order, ProductOffering, ShowcaseInventory, StoreSettings
from core_pasteleria.services.orders import order_service
from core_pasteleria.services.orders.order_lines import LineRequest

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=ZoneInfo("America/Mexico_City"))
TODAY = NOW.date()


def run_together(count, create):
    """Corre `create(i)` en `count` hilos que arrancan juntos; devuelve lo que regresó o lanzó cada uno."""
    barrier = threading.Barrier(count)
    results = [None] * count

    def worker(index):
        try:
            barrier.wait()
            results[index] = create(index)
        except Exception as error:  # noqa: BLE001 - la prueba revisa qué lanzó cada hilo.
            results[index] = error
        finally:
            connection.close()

    threads = [threading.Thread(target=worker, args=(index,)) for index in range(count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return results


def request(line, day, slot, key=None):
    return order_service.OrderRequest(
        idempotency_key=key or uuid.uuid4().hex,
        fulfillment="pickup",
        pickup_name="Ana López García",
        pickup_phone="5512345678",
        delivery_date=day,
        slot_starts_at=datetime.strptime(slot, "%H:%M").time(),
        items=(line,),
    )


def customers(django_user_model, count):
    return [django_user_model.objects.create_user(f"cliente{i}@pasteleria.test", "clave-123") for i in range(count)]


def created(results):
    return [result for result in results if isinstance(result, tuple) and result[1]]


@pytest.mark.django_db(transaction=True)
def test_four_orders_at_once_never_pass_a_slot_of_three(django_user_model):
    assert StoreSettings.objects.get().max_orders_per_slot == 3
    people = customers(django_user_model, 4)
    durazno = ProductOffering.objects.get(product__slug="tres-leches-de-durazno", presentation="whole")
    line = LineRequest(kind="order", offering_id=durazno.id)
    results = run_together(
        4, lambda i: order_service.create_order(people[i].pk, request(line, TODAY + timedelta(days=2), "15:00"), now=NOW)
    )
    refused = [r for r in results if isinstance(r, order_service.OrderValidationError)]
    assert len(created(results)) == 3, results
    assert [r.errors for r in refused] == [{"slot_starts_at": [order_service.SLOT_FULL_MESSAGE]}]
    assert Order.objects.count() == 3


@pytest.mark.django_db(transaction=True)
def test_three_orders_for_the_last_piece_sell_it_once(django_user_model):
    people = customers(django_user_model, 3)
    mini = ProductOffering.objects.get(product__slug="tres-leches-de-fresa", presentation="mini")
    ShowcaseInventory.objects.create(offering=mini, stock_date=TODAY, quantity=1)
    line = LineRequest(kind="showcase", offering_id=mini.id)
    results = run_together(3, lambda i: order_service.create_order(people[i].pk, request(line, TODAY, "12:30"), now=NOW))
    assert len(created(results)) == 1, results
    assert Inventory.objects.get(offering=mini, stock_date=TODAY).quantity == 0
    assert Order.objects.count() == 1


@pytest.mark.django_db(transaction=True)
def test_a_double_click_with_the_same_key_makes_one_order(django_user_model):
    (person,) = customers(django_user_model, 1)
    durazno = ProductOffering.objects.get(product__slug="tres-leches-de-durazno", presentation="whole")
    same = request(LineRequest(kind="order", offering_id=durazno.id), TODAY + timedelta(days=2), "15:00", key="doble-clic-1")
    results = run_together(2, lambda i: order_service.create_order(person.pk, same, now=NOW))
    assert sorted(result[1] for result in results) == [False, True], results
    assert results[0][0].id == results[1][0].id
    assert Order.objects.count() == 1


@pytest.mark.django_db(transaction=True)
def test_two_orders_with_the_same_pieces_in_reverse_order_do_not_deadlock(django_user_model):
    """Las existencias se bloquean siempre por id, sin importar el orden de las líneas: no se esperan en cruz."""
    people = customers(django_user_model, 2)
    mini = ProductOffering.objects.get(product__slug="tres-leches-de-fresa", presentation="mini")
    other = ProductOffering.objects.get(product__slug="tres-leches-de-durazno", presentation="mini")
    for piece in (mini, other):
        ShowcaseInventory.objects.create(offering=piece, stock_date=TODAY, quantity=2)
    lines = [
        (LineRequest(kind="showcase", offering_id=mini.id), LineRequest(kind="showcase", offering_id=other.id)),
        (LineRequest(kind="showcase", offering_id=other.id), LineRequest(kind="showcase", offering_id=mini.id)),
    ]

    def create(index):
        request = order_service.OrderRequest(
            idempotency_key=uuid.uuid4().hex,
            fulfillment="pickup",
            pickup_name="Ana López García",
            pickup_phone="5512345678",
            delivery_date=TODAY,
            # Lapsos distintos: el candado del lapso no los pone en fila y solo queda el orden de las existencias.
            slot_starts_at=datetime.strptime(("12:30", "13:00")[index], "%H:%M").time(),
            items=lines[index],
        )
        return order_service.create_order(people[index].pk, request, now=NOW)

    results = run_together(2, create)
    assert len(created(results)) == 2, results
    stock = dict(Inventory.objects.filter(offering__in=[mini, other], stock_date=TODAY).values_list("offering", "quantity"))
    assert stock == {mini.id: 0, other.id: 0}
