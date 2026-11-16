"""Cancelación por el cliente (regla 10; D70): sin cobro antes de pagar, 50% retenido después y antes de la entrega,
y reintegro."""
from decimal import Decimal

import pytest
from django.contrib.auth.models import Permission
from rest_framework.test import APIClient

from core_pasteleria.models import Order, Payment, PolicySettings, ShowcaseInventory
from core_pasteleria.services.orders import cancellation_service, order_observer, order_status
from core_pasteleria.services.orders.order_observer import OrderObserver, StatusChanged
from core_pasteleria.services.payments import payment_service
from tests.test_orders_api import TODAY, body, design_line, offering, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


@pytest.fixture
def cashier(staff_user):
    staff_user.user_permissions.add(Permission.objects.get(codename="register_cash_payment"))
    return type(staff_user).objects.get(pk=staff_user.pk)


def create(api, payload):
    response = post(api, payload)
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


def design_order(api):
    """30 personas: 4 kg con la base de 4 a 5 kg ($70 de depósito)."""
    return create(api, body(design_line()))


def showcase_order(api):
    mini = offering("tres-leches-de-fresa", "mini")
    row = ShowcaseInventory.objects.create(offering=mini, stock_date=TODAY, quantity=2)
    return create(api, body({"kind": "showcase", "offering_id": mini.id, "quantity": 2}, day=TODAY, slot="12:30")), row


def pay(order, cashier):
    payment_service.register_cash_payment(order.pk, actor=cashier)
    order.refresh_from_db()
    return order


def url(order):
    return f"/api/v1/orders/{order.pk}/cancel/"


def cancel(client, order, expected_status=None):
    """`POST orders/<id>/cancel/` con el estado que el cliente vio (por omisión, el de ahora)."""
    status = expected_status or Order.objects.get(pk=order.pk).status
    return client.post(url(order), {"expected_status": status}, format="json")


class Spy(OrderObserver):
    def __init__(self):
        self.events = []

    def update(self, event):
        self.events.append(event)


def test_an_unpaid_order_is_cancelled_without_charge(api):
    order = design_order(api)
    preview = api.get(url(order)).json()
    assert (preview["cancellable"], preview["paid"], preview["retained"], preview["refund"]) == (
        True, "0.00", "0.00", "0.00",
    )
    response = cancel(api, order)
    assert response.status_code == 200, response.json()
    assert response.json()["order"]["status"] == "cancelled"
    order.refresh_from_db()
    assert (order.status, order.cancellation_reason) == ("cancelled", "customer")
    assert not Payment.objects.filter(order=order).exists()


def test_a_paid_order_keeps_half_the_total_and_returns_the_deposit(api, cashier):
    order = pay(design_order(api), cashier)
    preview = api.get(url(order)).json()
    half = (order.subtotal / 2).quantize(Decimal("0.01"))
    assert Decimal(preview["paid"]) == order.pay_today == half + Decimal("70.00")
    assert (Decimal(preview["order_total"]), preview["retention_percent"]) == (order.subtotal, 50)
    assert (Decimal(preview["retained"]), preview["refund"], preview["paid_with"]) == (half, "70.00", "cash")
    response = cancel(api, order)
    assert response.status_code == 200 and response.json()["cancellation"]["refund"] == "70.00"
    refund = Payment.objects.get(order=order, status="refund_required")
    assert (refund.amount, refund.refund_reason, refund.method) == (Decimal("70.00"), "customer_cancelled", "cash")


def test_a_showcase_order_paid_in_full_returns_half_and_restocks(api, cashier):
    order, row = showcase_order(api)
    order = pay(order, cashier)
    assert order.pay_today == order.subtotal
    row.refresh_from_db()
    assert row.quantity == 0
    response = cancel(api, order)
    half = (order.subtotal / 2).quantize(Decimal("0.01"))
    assert Decimal(response.json()["cancellation"]["refund"]) == half
    assert Payment.objects.get(order=order, status="refund_required").amount == half
    row.refresh_from_db()
    assert row.quantity == 2


def test_the_retention_comes_from_the_admin(api, cashier):
    PolicySettings.objects.update(customer_cancel_retention_percent=0)
    order = pay(design_order(api), cashier)
    assert Decimal(api.get(url(order)).json()["refund"]) == order.pay_today


def advance(order, staff_user, *steps):
    for current, new in steps:
        order_status.change_status(order.pk, current, new, actor_id=staff_user.pk)
    order.refresh_from_db()
    return order


TO_PREPARATION = ("received", "in_preparation")
TO_READY = ("in_preparation", "ready_for_delivery")
TO_DELIVERED = ("ready_for_delivery", "delivered")


@pytest.mark.parametrize("steps", [(TO_PREPARATION,), (TO_PREPARATION, TO_READY)], ids=["in_preparation", "ready"])
def test_a_paid_order_is_cancelled_at_any_moment_before_delivery_keeping_half(api, cashier, staff_user, steps):
    # Decisión del usuario del 15 de noviembre de 2026 (D70): se cancela en cualquier momento; pagado, se retiene 50%.
    order = advance(pay(design_order(api), cashier), staff_user, *steps)
    preview = api.get(url(order)).json()
    half = (order.subtotal / 2).quantize(Decimal("0.01"))
    assert (preview["cancellable"], preview["reason"], Decimal(preview["retained"]), preview["refund"]) == (
        True, None, half, "70.00",
    )
    response = cancel(api, order)
    assert response.status_code == 200, response.json()
    order.refresh_from_db()
    assert (order.status, order.cancellation_reason) == ("cancelled", "customer")
    assert Payment.objects.get(order=order, status="refund_required").amount == Decimal("70.00")


def test_a_delivered_order_cannot_be_cancelled(api, cashier, staff_user):
    order = advance(pay(design_order(api), cashier), staff_user, TO_PREPARATION, TO_READY, TO_DELIVERED)
    preview = api.get(url(order)).json()
    assert (preview["cancellable"], preview["reason"]) == (False, "not_cancellable")
    response = cancel(api, order)
    assert response.status_code == 409 and response.json()["code"] == "not_cancellable"
    order.refresh_from_db()
    assert order.status == "delivered"
    assert not Payment.objects.filter(order=order, status="refund_required").exists()


def test_the_preview_has_no_deadline(api, cashier):
    preview = api.get(url(pay(design_order(api), cashier))).json()
    assert "cancellable_until" not in preview


def test_cancelling_twice_says_it_is_already_cancelled(api):
    order = design_order(api)
    cancel(api, order)
    response = cancel(api, order)
    assert response.status_code == 409 and response.json()["code"] == "already_cancelled"


def test_someone_elses_order_is_404(api, django_user_model):
    order = design_order(api)
    other = APIClient()
    other.force_authenticate(django_user_model.objects.create_user("otra@pasteleria.test", "clave-de-prueba-123"))
    assert other.get(url(order)).status_code == 404
    assert cancel(other, order).status_code == 404
    order.refresh_from_db()
    assert order.status == "awaiting_payment"


def test_the_cancellation_goes_through_the_observers(api, customer_user, cashier):
    order = pay(design_order(api), cashier)
    spy = Spy()
    subject = order_observer.build_order_subject()
    subject.subscribe(spy)
    cancellation_service.cancel_order(customer_user.pk, order.pk, "received", events=subject)
    assert [(type(event), event.previous_status, event.new_status, event.actor_id) for event in spy.events] == [
        (StatusChanged, "received", "cancelled", customer_user.pk)
    ]


def test_a_quote_order_without_price_is_cancelled_without_charge(api):
    from tests.test_orders_api import upload_image

    image = upload_image(api, "decoration")
    order = create(api, body(design_line(decoration="otra", decoration_image_id=image)))
    assert order.status == "awaiting_quote"
    assert cancel(api, order).status_code == 200
    order.refresh_from_db()
    assert order.status == "cancelled"


def test_a_stale_preview_does_not_cancel_a_order_that_got_paid(api, cashier):
    order = design_order(api)
    assert api.get(url(order)).json()["status"] == "awaiting_payment"
    pay(order, cashier)
    response = cancel(api, order, "awaiting_payment")
    assert response.status_code == 409, response.json()
    assert response.json() == {
        "detail": "El pedido cambió mientras lo revisabas. Revisa otra vez antes de cancelar.",
        "code": "stale_preview",
    }
    order.refresh_from_db()
    assert order.status == "received"
    assert not Payment.objects.filter(order=order, status="refund_required").exists()
    assert cancel(api, order, "received").status_code == 200


def test_cancelling_without_the_status_that_was_seen_is_rejected(api):
    order = design_order(api)
    for body in (None, {}, {"expected_status": ""}, {"expected_status": 5}):
        response = api.post(url(order), body, format="json")
        assert response.status_code == 400, body
        assert "expected_status" in response.json()
    order.refresh_from_db()
    assert order.status == "awaiting_payment"
