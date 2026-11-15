"""Ronda 2 de correcciones de la API de pedidos (D63, 14 de noviembre de 2026).

Cancelación de lo vencido con reintegro, cancelar y cotizar desde el registro del pedido en el admin, topes de la
vitrina y de cotizaciones, el cobro de un apartado vencido, el throttle que no gasta cupo en un reintento y el contrato
del pago.
"""
import io
import logging
import threading
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from django.contrib.admin.models import LogEntry
from django.core.management import call_command
from django.db import OperationalError, connection
from rest_framework.test import APIClient

from core_pasteleria.admin import ONE_CHANGE_AT_A_TIME_MESSAGE
from core_pasteleria.api import throttles
from core_pasteleria.models import (
    BreadInventory,
    CakeDesign,
    CustomerImage,
    Inventory,
    Order,
    PolicySettings,
    ShowcaseInventory,
    StoreSettings,
)
from core_pasteleria.repositories import order_repo, product_repo
from core_pasteleria.services.errors import DomainValidationError
from core_pasteleria.services.orders import order_service, order_status, quote_service, schedule_service
from tests.test_order_admin import change_post
from tests.test_orders_api import (
    CDMX,
    IN_TWO_DAYS,
    NOW,
    TODAY,
    body,
    design_line,
    offering,
    post,
    upload_image,
    wafer_layout,
)
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    return client


def at(hour, minute=0, day=TODAY):
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=CDMX)


def mini():
    return offering("tres-leches-de-fresa", "mini")


def showcase_and_same_day_order(api):
    """Un pedido de hoy con una mini de la vitrina y un Choco-pingüino que consume pan del día."""
    pinguino = offering("choco-pinguino")
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=1)
    BreadInventory.objects.create(bread=pinguino.product.bread, stock_date=TODAY, quantity=1)
    lines = ({"kind": "showcase", "offering_id": mini().id}, {"kind": "order", "offering_id": pinguino.id})
    response = post(api, body(*lines, day=TODAY, slot="14:00"))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"]), pinguino.product.bread


def quote_order(api, **changes):
    image_id = upload_image(api, "decoration")
    response = post(api, body(design_line(decoration="otra", decoration_image_id=image_id, **changes)))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"]), image_id


def stock(offering_):
    return Inventory.objects.get(offering=offering_, stock_date=TODAY).quantity


# --- 1. Cancelar lo vencido y reintegrar ---


def test_the_command_cancels_an_expired_order_and_gives_everything_back(api, monkeypatch, capsys):
    order, bread = showcase_and_same_day_order(api)
    wafer_id = upload_image(api, "wafer")
    with_wafer = post(api, body(design_line(wafer=True, wafer_image_id=wafer_id, wafer_layout=wafer_layout()))).json()
    assert (stock(mini()), BreadInventory.objects.get(bread=bread).quantity) == (0, 0)
    monkeypatch.setattr(schedule_service, "bakery_now", lambda: at(12, 31))
    call_command("cancel_expired_orders")
    assert "Pedidos cancelados: 2" in capsys.readouterr().out
    assert set(Order.objects.values_list("status", flat=True)) == {"cancelled"}
    assert (stock(mini()), BreadInventory.objects.get(bread=bread).quantity) == (1, 1)
    # La imagen se borra: ya no la protege su diseño.
    assert not CustomerImage.objects.filter(pk=wafer_id).exists()
    assert CakeDesign.objects.get(item__order_id=with_wafer["id"]).wafer_image_id is None
    assert order.items.count() == 2


def test_the_command_leaves_what_has_not_expired_and_is_idempotent(api, monkeypatch, capsys):
    post(api, body(design_line()))
    monkeypatch.setattr(schedule_service, "bakery_now", lambda: at(12, 29))
    call_command("cancel_expired_orders")
    assert "Pedidos cancelados: 0" in capsys.readouterr().out
    monkeypatch.setattr(schedule_service, "bakery_now", lambda: at(12, 30))
    call_command("cancel_expired_orders")
    call_command("cancel_expired_orders")
    assert capsys.readouterr().out.count("Pedidos cancelados: 1") == 1
    assert Order.objects.get().status == "cancelled"


def test_a_quote_without_price_expires_after_24_hours(api, monkeypatch):
    # La vigencia de la cotización está PENDIENTE de la pastelería (decisión 2 del usuario): la prueba fija 24 horas.
    PolicySettings.objects.update(quote_expiry_hours=24)
    order, image_id = quote_order(api)
    assert order_status.cancel_expired_orders(now=NOW + timedelta(hours=23, minutes=59)) == 0
    assert order_status.cancel_expired_orders(now=NOW + timedelta(hours=24)) == 1
    order.refresh_from_db()
    assert order.status == "cancelled"
    assert not CustomerImage.objects.filter(pk=image_id).exists()


def test_while_the_quote_expiry_is_pending_a_quote_never_expires(api):
    assert PolicySettings.objects.get().quote_expiry_hours is None
    order, image_id = quote_order(api)
    assert order_status.cancel_expired_orders(now=NOW + timedelta(days=30)) == 0
    order.refresh_from_db()
    assert order.status == "awaiting_quote"
    assert CustomerImage.objects.filter(pk=image_id).exists()


@pytest.mark.django_db(transaction=True)
def test_two_runs_at_once_cancel_and_restock_once(customer_user):
    api = APIClient()
    api.force_authenticate(customer_user)
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=1)
    created = post(api, body({"kind": "showcase", "offering_id": mini().id}, day=TODAY, slot="12:30"))
    assert created.status_code == 201, created.json()
    results, barrier = [], threading.Barrier(2)

    def run():
        try:
            barrier.wait()
            results.append(order_status.cancel_expired_orders(now=at(13, 0)))
        finally:
            connection.close()

    threads = [threading.Thread(target=run) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results) == [0, 1]
    assert stock(mini()) == 1


# --- 2. Cancelar desde el admin ---


def test_staff_cancels_an_unpaid_order_and_it_gives_everything_back(api, superuser_client):
    order, bread = showcase_and_same_day_order(api)
    assert change_post(superuser_client, order, status="cancelled", **{"items-TOTAL_FORMS": "2", "items-INITIAL_FORMS": "2"}).status_code in (200, 302)
    order.refresh_from_db()
    assert order.status == "cancelled"
    assert (stock(mini()), BreadInventory.objects.get(bread=bread).quantity) == (1, 1)


def test_the_transitions_allow_cancelling_only_before_payment():
    allowed = order_status.ALLOWED_TRANSITIONS
    assert allowed["awaiting_payment"] == ("received", "cancelled")
    assert allowed["awaiting_quote"] == ("cancelled",)
    for status in ("received", "in_preparation", "ready_for_delivery", "delivered", "cancelled"):
        assert "cancelled" not in allowed[status]


# --- 3. Precio de la cotización desde el admin ---


def test_staff_prices_the_quote_and_the_order_awaits_payment(api, superuser_client):
    order, _ = quote_order(api)
    page = superuser_client.get(f"/admin/core_pasteleria/order/{order.pk}/change/").content.decode()
    assert 'name="quoted_decoration_price"' in page
    response = change_post(superuser_client, order, status="awaiting_quote", quoted_decoration_price="300.00")
    assert response.status_code == 302, response.content.decode()[:400]
    order.refresh_from_db()
    design = CakeDesign.objects.get(item__order=order)
    assert (order.status, order.subtotal, design.decoration_price, design.total) == (
        "awaiting_payment", Decimal("1320.00"), Decimal("300.00"), Decimal("1320.00"),
    )
    # 50% de $1,320 más la base de $70. Con precio, vence al cierre del día (decisión 4 del usuario, revisión de la
    # ronda 2): hasta el Observer de la tanda 2 nadie avisa al cliente, y la pastelería le escribe por WhatsApp.
    assert (order.advance, order.pay_today, order.pay_on_delivery) == (Decimal("660.00"), Decimal("730.00"), Decimal("660.00"))
    assert order.payment_due_at == at(22, 30)
    assert order.items.get().line_total == Decimal("1320.00")


def test_the_quote_price_is_only_editable_while_awaiting_a_quote(api, superuser_client):
    response = post(api, body(design_line()))
    order = Order.objects.get(pk=response.json()["id"])
    page = superuser_client.get(f"/admin/core_pasteleria/order/{order.pk}/change/").content.decode()
    assert 'name="quoted_decoration_price"' not in page


def test_a_customer_has_one_quote_at_a_time_apart_from_the_unpaid_cap(api):
    quote_order(api)
    second_image = upload_image(api, "decoration")
    second = post(api, body(design_line(decoration="otra", decoration_image_id=second_image)))
    assert "cotización" in second.json()["non_field_errors"][0]
    # Las cotizaciones ya no cuentan para el tope de 2 sin pagar.
    catalog = {"kind": "order", "offering_id": offering("tres-leches-de-durazno").id}
    assert [post(api, body(catalog)).status_code for _ in range(2)] == [201, 201]


def test_an_order_takes_a_single_quoted_decoration(api):
    first, second = upload_image(api, "decoration"), upload_image(api, "decoration")
    response = post(
        api,
        body(
            design_line(decoration="otra", decoration_image_id=first),
            design_line(people=40, decoration="otra", decoration_image_id=second),
        ),
    )
    assert response.json()["items"]["1"]["design"]["decoration"] == ["Un pedido lleva una sola decoración por cotizar."]


# --- 4. Vitrina: tope de piezas apartadas y margen para pagar ---


def test_a_customer_has_at_most_ten_showcase_pieces_unpaid(api):
    assert PolicySettings.objects.get().max_unpaid_showcase_pieces == 10
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=20)
    assert post(api, body({"kind": "showcase", "offering_id": mini().id, "quantity": 6}, day=TODAY, slot="12:30")).status_code == 201
    second = post(api, body({"kind": "showcase", "offering_id": mini().id, "quantity": 5}, day=TODAY, slot="13:00"))
    assert "10 piezas de la vitrina" in second.json()["non_field_errors"][0]


def test_the_earliest_slot_leaves_time_to_pay(api, monkeypatch):
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=2)
    monkeypatch.setattr(schedule_service, "bakery_now", lambda: at(15, 29))
    too_soon = post(api, body({"kind": "showcase", "offering_id": mini().id}, day=TODAY, slot="15:30"))
    # Un 201 también trae `delivery_date`: sin el código, la revisión pasaba sin probar nada.
    assert too_soon.status_code == 400 and "delivery_date" in too_soon.json()
    ok = post(api, body({"kind": "showcase", "offering_id": mini().id}, day=TODAY, slot="16:00"))
    assert ok.status_code == 201, ok.json()
    assert datetime.fromisoformat(ok.json()["payment_due_at"]) == at(15, 59)


# --- 5. Cobrar un apartado vencido ---


def test_receiving_an_expired_order_checks_its_slot_again(api, django_user_model, staff_user):
    StoreSettings.objects.update(max_orders_per_slot=1)
    late = Order.objects.get(pk=post(api, body(design_line())).json()["id"])
    Order.objects.filter(pk=late.pk).update(payment_due_at=NOW - timedelta(minutes=1))
    other = APIClient()
    other.force_authenticate(django_user_model.objects.create_user("otra@pasteleria.test", "clave-123"))
    assert post(other, body(design_line())).status_code == 201
    with pytest.raises(DomainValidationError) as full:
        order_status.change_status(late.pk, "awaiting_payment", "received", actor_id=staff_user.pk, now=NOW)
    assert "lleno" in full.value.errors["status"][0]
    Order.objects.exclude(pk=late.pk).update(status="cancelled")
    order_status.change_status(late.pk, "awaiting_payment", "received", actor_id=staff_user.pk, now=NOW)
    assert Order.objects.get(pk=late.pk).status == "received"


def test_an_order_the_command_cancelled_cannot_be_received(api, staff_user):
    order = Order.objects.get(pk=post(api, body(design_line())).json()["id"])
    order_status.cancel_expired_orders(now=NOW + timedelta(hours=1))
    with pytest.raises(DomainValidationError):
        order_status.change_status(order.pk, "awaiting_payment", "received", actor_id=staff_user.pk, now=NOW)


# --- 7. Throttle de creación ---


def test_the_creation_rates_are_separate():
    from django.conf import settings

    rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    assert (rates["orders_create_user"], rates["orders_create_ip"]) == ("10/hour", "60/hour")


def test_a_retry_with_the_same_key_does_not_spend_the_quota(api, monkeypatch):
    monkeypatch.setattr(throttles.OrderCreateUserThrottle, "rate", "1/min")
    first = post(api, body(design_line()), key="reintento-0001")
    again = post(api, body(design_line()), key="reintento-0001")
    new = post(api, body(design_line()), key="otra-llave-0002")
    assert (first.status_code, again.status_code, new.status_code) == (201, 200, 429)


# --- 8. Admin: validación y cambio que llegó tarde ---


def test_an_invalid_transition_is_a_field_error_without_a_log_entry(api, superuser_client):
    order = Order.objects.get(pk=post(api, body(design_line())).json()["id"])
    response = change_post(superuser_client, order, status="delivered")
    assert response.status_code == 200
    assert response.context["adminform"].form.errors["status"]
    assert not LogEntry.objects.exists()


def test_a_stale_change_shows_only_the_error(api, superuser_client, monkeypatch):
    order = Order.objects.get(pk=post(api, body(design_line())).json()["id"])
    monkeypatch.setattr(order_repo, "change_status", lambda *args, **kwargs: False)
    response = change_post(superuser_client, order, status="received")
    texts = [str(message) for message in response.wsgi_request._messages]
    assert texts == [order_status.STALE_MESSAGE]
    assert not LogEntry.objects.exists()


# --- 9. Contrato del pago ---


def test_the_payment_says_what_is_paid_in_full(api):
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=1)
    response = post(api, body({"kind": "showcase", "offering_id": mini().id}, day=TODAY, slot="12:30"))
    assert response.json()["payment"]["paid_in_full"] == "130.00"
    assert post(api, body(design_line())).json()["payment"]["paid_in_full"] == "0.00"


# --- 10. El lapso fuera de la agenda es un error del pedido ---


def test_a_slot_past_the_window_is_an_order_error(api, customer_user, monkeypatch):
    monkeypatch.setattr(
        schedule_service, "find_slot", lambda on_date, starts_at, *args: schedule_service.Slot(starts_at, starts_at.replace(minute=30))
    )
    request = order_service.OrderRequest(
        idempotency_key="fuera-de-rango-1",
        fulfillment="pickup",
        pickup_name="Ana López García",
        pickup_phone="5512345678",
        delivery_date=TODAY + timedelta(days=61),
        slot_starts_at=datetime.strptime("15:00", "%H:%M").time(),
        items=(order_service.LineRequest(kind="order", offering_id=offering("tres-leches-de-durazno").id),),
    )
    with pytest.raises(order_service.OrderValidationError) as error:
        order_service.create_order(customer_user.pk, request, now=NOW)
    assert "delivery_date" in error.value.errors


# --- 11. Casos que agregó la implementación de la ronda 2 ---


def test_staff_cancels_a_quote_and_its_image_is_deleted(api, superuser_client):
    order, image_id = quote_order(api)
    assert change_post(superuser_client, order, status="cancelled").status_code == 302
    order.refresh_from_db()
    assert order.status == "cancelled"
    assert not CustomerImage.objects.filter(pk=image_id).exists()


def test_a_quote_is_priced_once_and_never_after_its_slot(api, staff_user):
    order, _ = quote_order(api)
    quote_service.price_quote(order.pk, Decimal("300.00"), actor_id=staff_user.pk, now=NOW)
    with pytest.raises(DomainValidationError) as again:
        quote_service.price_quote(order.pk, Decimal("400.00"), actor_id=staff_user.pk, now=NOW)
    assert again.value.errors["quoted_decoration_price"] == [order_status.STALE_MESSAGE]
    assert CakeDesign.objects.get(item__order=order).decoration_price == Decimal("300.00")
    late, _ = quote_order(api)
    with pytest.raises(DomainValidationError) as passed:
        quote_service.price_quote(late.pk, Decimal("300.00"), actor_id=staff_user.pk, now=NOW + timedelta(days=3))
    assert "ya pasó" in passed.value.errors["quoted_decoration_price"][0]


def test_staff_cannot_price_and_cancel_at_once(api, superuser_client):
    order, _ = quote_order(api)
    response = change_post(superuser_client, order, status="cancelled", quoted_decoration_price="300.00")
    texts = [str(message) for message in response.wsgi_request._messages]
    assert texts == [ONE_CHANGE_AT_A_TIME_MESSAGE]
    order.refresh_from_db()
    assert order.status == "awaiting_quote"
    assert not LogEntry.objects.exists()


# --- 12. Revisión de la ronda 2 ---


@pytest.mark.django_db(transaction=True)
def test_cancelling_and_creating_the_same_lines_at_once_does_not_deadlock(customer_user, django_user_model, monkeypatch):
    """La cancelación devuelve en el orden de la creación (vitrina por id, luego pan por id): sin candados en cruz."""
    flan, pinguino = offering("flan-napolitano", "large"), offering("choco-pinguino")
    # El encargo (con pan) tiene un id menor que la vitrina: así el orden viejo, por presentación, cruzaba los candados.
    assert pinguino.id < flan.id
    ShowcaseInventory.objects.create(offering=flan, stock_date=TODAY, quantity=2)
    BreadInventory.objects.create(bread=pinguino.product.bread, stock_date=TODAY, quantity=2)
    lines = ({"kind": "showcase", "offering_id": flan.id}, {"kind": "order", "offering_id": pinguino.id})
    first = APIClient()
    first.force_authenticate(customer_user)
    created = post(first, body(*lines, day=TODAY, slot="14:00"))
    assert created.status_code == 201, created.json()
    other = APIClient()
    other.force_authenticate(django_user_model.objects.create_user("al-mismo-tiempo@pasteleria.test", "clave-123"))
    # Cada hilo se detiene después de su primer candado de existencias, para que los dos lo tengan a la vez.
    barrier, paused, errors, responses = threading.Barrier(2), set(), [], []
    real = {name: getattr(product_repo, name) for name in ("restock_showcase", "release_bread", "decrement_showcase_stock")}

    def pause_after(name):
        def wrapper(*args, **kwargs):
            result = real[name](*args, **kwargs)
            if threading.current_thread().name not in paused:
                paused.add(threading.current_thread().name)
                try:
                    barrier.wait(timeout=2)
                except threading.BrokenBarrierError:
                    pass  # El otro hilo espera este candado: es lo esperado, sin cruce.
            return result

        return wrapper

    for name in real:
        monkeypatch.setattr(product_repo, name, pause_after(name))

    def run(action):
        try:
            action()
        except Exception as error:  # noqa: BLE001 - la prueba recoge el error del hilo
            errors.append(error)
        finally:
            connection.close()

    def cancel():
        order_status.change_status(created.json()["id"], "awaiting_payment", "cancelled", actor_id=customer_user.pk)

    def create():
        responses.append(post(other, body(*lines, day=TODAY, slot="14:30")).status_code)

    threads = [
        threading.Thread(target=run, args=(action,), name=name) for name, action in (("cancel", cancel), ("create", create))
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    assert responses == [201]
    assert Order.objects.get(pk=created.json()["id"]).status == "cancelled"
    assert stock(flan) == 1


def test_retries_have_their_own_quota(api):
    assert post(api, body(design_line()), key="reintento-cupo-1").status_code == 201
    codes = [post(api, body(design_line()), key="reintento-cupo-1").status_code for _ in range(121)]
    assert codes[:120] == [200] * 120
    assert codes[120] == 429


def test_a_retry_returns_the_order_even_with_another_body(api):
    created = post(api, body(design_line()), key="reintento-cuerpo-1").json()
    again = post(api, {"items": "otro cuerpo"}, key="reintento-cuerpo-1")
    assert again.status_code == 200
    assert again.json()["id"] == created["id"]


def test_a_new_order_first_cancels_the_customers_expired_ones(api):
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=20)
    held = post(api, body({"kind": "showcase", "offering_id": mini().id, "quantity": 10}, day=TODAY, slot="12:30"))
    assert held.status_code == 201
    Order.objects.filter(pk=held.json()["id"]).update(payment_due_at=NOW - timedelta(minutes=1))
    again = post(api, body({"kind": "showcase", "offering_id": mini().id, "quantity": 10}, day=TODAY, slot="13:00"))
    # Las primeras 10 vuelven a la vitrina antes de revisar el tope. Desde la re-auditoría, además, siguen contando
    # durante la pausa (decisión 1 del usuario), así que las otras 10 no se apartan.
    assert again.status_code == 400
    assert Order.objects.get(pk=held.json()["id"]).status == "cancelled"
    assert stock(mini()) == 20


def test_a_quote_does_not_hold_its_slot_and_pricing_checks_it(api, django_user_model, staff_user):
    StoreSettings.objects.update(max_orders_per_slot=1)
    order, _ = quote_order(api)
    other = APIClient()
    other.force_authenticate(django_user_model.objects.create_user("mismo-lapso@pasteleria.test", "clave-123"))
    assert post(other, body(design_line())).status_code == 201
    with pytest.raises(DomainValidationError) as full:
        quote_service.price_quote(order.pk, Decimal("300.00"), actor_id=staff_user.pk, now=NOW)
    assert "WhatsApp" in full.value.errors["quoted_decoration_price"][0]
    order.refresh_from_db()
    assert order.status == "awaiting_quote"


def test_pricing_a_quote_is_audited_with_its_amounts(api, staff_user, caplog):
    order, _ = quote_order(api)
    with caplog.at_level(logging.INFO, logger="core_pasteleria.audit"):
        quote_service.price_quote(order.pk, Decimal("300.00"), actor_id=staff_user.pk, now=NOW)
    record = next(r for r in caplog.records if r.operation.endswith("price_quote"))
    assert (record.order_id, record.decoration_price, record.pay_today) == (order.pk, "300.00", "730.00")


def test_the_cancellation_is_audited_with_the_order_ids(api, caplog):
    order = Order.objects.get(pk=post(api, body(design_line())).json()["id"])
    with caplog.at_level(logging.INFO, logger="core_pasteleria.audit"):
        assert order_status.cancel_expired_orders(now=NOW + timedelta(hours=1)) == 1
    record = next(r for r in caplog.records if "cancel_expired" in r.operation and r.result == "ok")
    assert record.order_ids == [order.pk]


def test_one_failing_order_does_not_stop_the_run(api, monkeypatch, caplog):
    broken = Order.objects.get(pk=post(api, body(design_line())).json()["id"])
    fine = Order.objects.get(pk=post(api, body(design_line(people=40))).json()["id"])
    real = order_repo.list_reserved_lines

    def fail_for_one(order_id, **kwargs):
        if order_id == broken.pk:
            raise OperationalError("se cayó la conexión")
        return real(order_id, **kwargs)

    monkeypatch.setattr(order_repo, "list_reserved_lines", fail_for_one)
    assert order_status.cancel_expired_orders(now=NOW + timedelta(hours=1)) == 1
    assert Order.objects.get(pk=broken.pk).status == "awaiting_payment"
    assert Order.objects.get(pk=fine.pk).status == "cancelled"
    assert any(str(broken.pk) in r.getMessage() and "OperationalError" in r.getMessage() for r in caplog.records)


# --- 13. Re-auditoría de la ronda 2: pausa contra acaparar la vitrina y avisos ---


def showcase_pieces(api, quantity, slot):
    return post(api, body({"kind": "showcase", "offering_id": mini().id, "quantity": quantity}, day=TODAY, slot=slot))


def test_expired_showcase_pieces_keep_counting_for_the_cooldown(api):
    assert PolicySettings.objects.get().expired_showcase_cooldown_hours == 24
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=20)
    held = showcase_pieces(api, 10, "12:30")
    assert held.status_code == 201
    assert order_status.cancel_expired_orders(now=at(12, 31)) == 1
    # Las 10 piezas vuelven a la vitrina, pero siguen contando para su tope durante 24 horas.
    assert stock(mini()) == 20
    blocked = showcase_pieces(api, 1, "13:00")
    assert blocked.status_code == 400
    assert "10 piezas de la vitrina" in blocked.json()["non_field_errors"][0]
    Order.objects.filter(pk=held.json()["id"]).update(status_changed_at=NOW - timedelta(hours=24, minutes=1))
    assert showcase_pieces(api, 10, "13:00").status_code == 201


def test_a_staff_cancellation_does_not_start_the_cooldown(api, staff_user):
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=20)
    held = showcase_pieces(api, 10, "12:30")
    order_status.change_status(held.json()["id"], "awaiting_payment", "cancelled", actor_id=staff_user.pk, now=NOW)
    assert showcase_pieces(api, 10, "13:00").status_code == 201


def test_pieces_of_an_expired_order_that_could_not_be_cancelled_still_count(api, monkeypatch):
    ShowcaseInventory.objects.create(offering=mini(), stock_date=TODAY, quantity=20)
    held = showcase_pieces(api, 10, "12:30")
    Order.objects.filter(pk=held.json()["id"]).update(payment_due_at=NOW - timedelta(minutes=1))

    def broken(order_id, **kwargs):
        raise OperationalError("se cayó la conexión")

    monkeypatch.setattr(order_repo, "list_reserved_lines", broken)
    blocked = showcase_pieces(api, 1, "13:00")
    assert blocked.status_code == 400
    assert "10 piezas de la vitrina" in blocked.json()["non_field_errors"][0]


def test_a_new_order_without_expired_ones_writes_no_cleanup_audit_line(api, caplog):
    with caplog.at_level(logging.INFO, logger="core_pasteleria.audit"):
        assert post(api, body(design_line())).status_code == 201
    assert not [r for r in caplog.records if "cancel" in getattr(r, "operation", "")]


def test_the_admin_says_the_quote_expiry_is_pending(api, superuser_client):
    order, _ = quote_order(api)
    policy_page = superuser_client.get("/admin/core_pasteleria/policysettings/1/change/").content.decode()
    order_page = superuser_client.get(f"/admin/core_pasteleria/order/{order.pk}/change/").content.decode()
    assert "Vigencia de la cotización" in policy_page and "PENDIENTE, no vence" in policy_page
    assert "Vigencia de la cotización" in order_page and "PENDIENTE, no vence" in order_page
    PolicySettings.objects.update(quote_expiry_hours=24)
    assert "PENDIENTE, no vence" not in superuser_client.get("/admin/core_pasteleria/policysettings/1/change/").content.decode()
    assert "PENDIENTE, no vence" not in superuser_client.get(f"/admin/core_pasteleria/order/{order.pk}/change/").content.decode()
