"""Observer de los eventos del pedido (D68): `OrderSubject`, `InventoryObserver` y `CustomerNotificationObserver`.

El cambio de estado notifica a los observadores dentro de la misma transacción del `UPDATE` condicional (nota de D63):
el reintegro de la vitrina al cancelar es ahora de `InventoryObserver`, y si un observador falla, el estado no cambia.
"""
import logging
from datetime import timedelta

import pytest
from rest_framework.test import APIClient

from core_pasteleria.models import Inventory, Order, ShowcaseInventory
from core_pasteleria.services.orders import order_observer, order_status
from core_pasteleria.services.orders.order_observer import (
    CustomerNotificationObserver,
    InventoryObserver,
    OrderObserver,
    OrderSubject,
    StatusChanged,
    StandLoanObserver,
    CustomerEmailObserver,
    StripeCheckoutObserver,
)
from tests.test_orders_api import NOW, TODAY, body, design_line, offering, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


class Spy(OrderObserver):
    def __init__(self):
        self.events = []

    def update(self, event):
        self.events.append(event)


class Broken(OrderObserver):
    def update(self, event):
        raise RuntimeError("falla del observador")


def showcase_order(api):
    mini = offering("tres-leches-de-fresa", "mini")
    ShowcaseInventory.objects.create(offering=mini, stock_date=TODAY, quantity=1)
    response = post(api, body({"kind": "showcase", "offering_id": mini.id}, day=TODAY, slot="14:00"))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"]), mini


def test_the_subject_notifies_every_subscriber_in_order():
    subject, first, second = OrderSubject(), Spy(), Spy()
    subject.subscribe(first)
    subject.subscribe(second)
    event = StatusChanged(1, "awaiting_payment", "received", None, NOW)
    subject.notify(event)
    assert first.events == [event] and second.events == [event]


def test_the_default_subject_has_the_inventory_notification_stripe_stand_loan_and_email_observers():
    subject = order_observer.build_order_subject()
    kinds = [type(observer) for observer in subject._observers]
    assert kinds == [
        InventoryObserver, CustomerNotificationObserver, StripeCheckoutObserver, StandLoanObserver, CustomerEmailObserver
    ]


def test_a_status_change_notifies_the_event_with_who_and_both_states(api, staff_user):
    order = Order.objects.get(pk=post(api, body(design_line())).json()["id"])
    spy, subject = Spy(), OrderSubject()
    subject.subscribe(spy)
    order_status.change_status(order.pk, "awaiting_payment", "cancelled", actor_id=staff_user.pk, now=NOW, events=subject)
    assert spy.events == [StatusChanged(order.pk, "awaiting_payment", "cancelled", staff_user.pk, NOW)]


def test_cancelling_gives_the_showcase_back_through_the_inventory_observer(api, staff_user):
    order, mini = showcase_order(api)
    assert Inventory.objects.get(offering=mini, stock_date=TODAY).quantity == 0
    # Sin `InventoryObserver` suscrito no hay reintegro: el efecto ya no vive en `order_status`.
    order_status.change_status(order.pk, "awaiting_payment", "cancelled", actor_id=staff_user.pk, now=NOW, events=OrderSubject())
    assert Inventory.objects.get(offering=mini, stock_date=TODAY).quantity == 0


def test_a_failing_observer_undoes_the_status_change(api, staff_user):
    order, mini = showcase_order(api)
    subject = order_observer.build_order_subject()
    subject.subscribe(Broken())
    with pytest.raises(RuntimeError):
        order_status.change_status(order.pk, "awaiting_payment", "cancelled", actor_id=staff_user.pk, now=NOW, events=subject)
    order.refresh_from_db()
    assert order.status == "awaiting_payment"
    # El reintegro del primer observador también se deshizo: la misma transacción.
    assert Inventory.objects.get(offering=mini, stock_date=TODAY).quantity == 0


def test_the_expiry_command_notifies_without_an_actor(api):
    order = Order.objects.get(pk=post(api, body(design_line())).json()["id"])
    spy, subject = Spy(), order_observer.build_order_subject()
    subject.subscribe(spy)
    order_status.cancel_expired_order_ids(now=NOW + timedelta(hours=1), events=subject)
    assert [(event.order_id, event.new_status, event.actor_id) for event in spy.events] == [(order.pk, "cancelled", None)]


def test_the_customer_notice_is_logged_after_commit_without_personal_data(api, staff_user, caplog, django_capture_on_commit_callbacks):
    order = Order.objects.get(pk=post(api, body(design_line())).json()["id"])
    with caplog.at_level(logging.INFO, logger="core_pasteleria.notifications"):
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            order_status.change_status(order.pk, "awaiting_payment", "cancelled", actor_id=staff_user.pk, now=NOW)
        assert not [r for r in caplog.records if r.name == "core_pasteleria.notifications"]
        for callback in callbacks:
            callback()
    notices = [r for r in caplog.records if r.name == "core_pasteleria.notifications"]
    assert len(notices) == 1 and notices[0].order_id == order.pk and notices[0].new_status == "cancelled"
    assert "@" not in notices[0].getMessage()
