"""Envío de referencia con sabor, base por personas y fotos para quien cotiza (D70, decisiones del usuario del 15 de
noviembre de 2026)."""
import pytest
from django.contrib.auth.models import Permission
from django.test import Client

from core_pasteleria.models import ReferenceRequest, StandLoan
from core_pasteleria.services.orders import order_status
from core_pasteleria.services.payments import payment_service
from tests.test_orders_api import upload_image
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería
from tests.test_reference_requests import URL, accept, api, payload, quote, quoter, send, submitted  # noqa: F401

pytestmark = pytest.mark.django_db


def refused(api, **changes):
    response = send(api, payload([upload_image(api, "reference")], **changes))
    assert response.status_code == 400, response.json()
    return response.json()


def admin_client(user):
    client = Client()
    client.force_login(user)
    return client


def photo_url(request_id, image_id):
    return f"/admin/core_pasteleria/referencerequest/{request_id}/photos/{image_id}/"


# --- Sabor ---


def test_the_request_keeps_the_flavor_with_its_names(api):
    data = submitted(api)
    assert (data["cake_type"], data["cake_type_label"], data["bread"], data["bread_name"]) == (
        "tres_leches", "Tres leches", "chocolate", "Chocolate",
    )
    assert (data["filling_base"], data["filling_base_name"]) == ("normal", "Normal")
    assert (data["filling_flavors"], data["filling_flavor_names"]) == (["fresa", "nuez"], ["Fresa", "Nuez"])
    request = ReferenceRequest.objects.get(pk=data["id"])
    assert (request.bread.slug, request.filling_base.slug, request.first_flavor.slug, request.second_flavor.slug) == (
        "chocolate", "normal", "fresa", "nuez",
    )


def test_a_bread_with_its_filling_has_no_filling_base(api):
    data = submitted(api, cake_type="seco", bread="red_velvet", filling_base=None, filling_flavors=[])
    assert (data["bread_name"], data["filling_base"], data["filling_base_name"], data["filling_flavor_names"]) == (
        "Red velvet", None, None, [],
    )


def test_the_bread_is_required(api):
    assert "bread" in refused(api, bread=None)


def test_red_velvet_is_only_for_seco(api):
    assert refused(api, bread="red_velvet", filling_base=None, filling_flavors=[])["bread"] == [
        "Red velvet: solo en pastel seco."
    ]


def test_choco_pinguino_does_not_go_with_envinado(api):
    errors = refused(api, cake_type="envinado", bread="choco_pinguino", filling_base=None, filling_flavors=[])
    assert errors["bread"] == ["Choco-pingüino: no se combina con pastel envinado."]


def test_a_bread_with_its_filling_takes_no_other(api):
    errors = refused(api, bread="choco_pinguino", filling_base="normal", filling_flavors=["fresa"])
    assert errors["filling_base"] == ["Este pan ya trae su relleno; no se elige otro."]


def test_only_the_normal_base_is_combined(api):
    assert "filling_flavors" in refused(api, filling_base="queso", filling_flavors=["chocolate", "zarzamora"])


def test_fresa_con_yogurt_is_not_combined(api):
    assert "filling_flavors" in refused(api, filling_flavors=["fresa_yogurt", "nuez"])


def test_a_bread_that_does_not_exist_is_refused(api):
    assert refused(api, bread="pan-de-elote")["bread"] == ["Ese pan no existe o no está disponible."]


# --- Base por personas ---


def test_the_stand_is_assigned_from_the_people(api):
    # 40 personas: 6 kg (regla 3.1), base de 6 a 8 kg con $90 de depósito (regla 7).
    data = submitted(api)
    assert (data["kg"], data["stand"]) == (6, {"min_kg": 6, "max_kg": 8, "deposit": "90.00"})


def test_too_many_people_are_refused_like_a_design(api):
    errors = refused(api, people=400)
    assert errors["people"] == ["En línea el máximo es 50 kg. Para más, escríbenos por WhatsApp."]


def test_the_quote_adds_the_whole_deposit_to_pay_today(api, quoter):
    data = submitted(api)
    quote(data["id"], quoter, price="1800.00")
    detail = api.get(f"{URL}{data['id']}/").json()["quote"]
    assert (detail["price"], detail["stand_deposit"], detail["advance"]) == ("1800.00", "90.00", "900.00")
    assert (detail["pay_today"], detail["pay_on_delivery"]) == ("990.00", "900.00")


def test_the_accepted_order_carries_the_stand_and_the_flavor(api, quoter):
    data = submitted(api)
    quote(data["id"], quoter)
    order = accept(api, data["id"]).json()
    assert (order["stand_deposit"], order["subtotal"], order["payment"]["pay_today"]) == ("90.00", "1800.00", "990.00")
    assert [(stand["kg"], stand["deposit"], stand["status"]) for stand in order["stands"]] == [(6, "90.00", None)]
    reference = order["items"][0]["reference"]
    assert (reference["people"], reference["kg"], reference["bread_name"], reference["filling_flavor_names"]) == (
        40, 6, "Chocolate", ["Fresa", "Nuez"],
    )
    assert reference["stand"] == {"min_kg": 6, "max_kg": 8, "deposit": "90.00"}


def test_delivering_the_accepted_order_lends_its_stand(api, quoter, staff_user):
    staff_user.user_permissions.add(Permission.objects.get(codename="register_cash_payment"))
    cashier = type(staff_user).objects.get(pk=staff_user.pk)
    data = submitted(api)
    quote(data["id"], quoter)
    order_id = accept(api, data["id"]).json()["id"]
    payment_service.register_cash_payment(order_id, actor=cashier)
    for current, new in (("received", "in_preparation"), ("in_preparation", "ready_for_delivery"),
                         ("ready_for_delivery", "delivered")):
        order_status.change_status(order_id, current, new, actor_id=cashier.pk)
    loan = StandLoan.objects.get(order_id=order_id)
    assert (loan.reference_request_id, loan.design_id, loan.deposit) == (data["id"], None, 90)
    stands = api.get(f"/api/v1/orders/{order_id}/").json()["stands"]
    assert [(stand["kg"], stand["status"]) for stand in stands] == [(6, "on_loan")]
    loans = api.get("/api/v1/stand-loans/").json()["results"]
    assert [(row["order_id"], row["kg"], row["deposit"]) for row in loans] == [(order_id, 6, "90.00")]


# --- Fotos para quien cotiza ---


def test_whoever_quotes_sees_the_request_photos_in_the_admin(api, quoter):
    data = submitted(api)
    client = admin_client(quoter)
    image_id = data["images"][0]["id"]
    response = client.get(photo_url(data["id"], image_id))
    assert response.status_code == 200 and response["Content-Type"] == "image/png"
    assert response["X-Content-Type-Options"] == "nosniff"
    page = client.get(f"/admin/core_pasteleria/referencerequest/{data['id']}/change/").content.decode()
    assert photo_url(data["id"], image_id) in page
    assert "Chocolate" in page and "Fresa, Nuez" in page


def test_staff_without_the_permission_gets_403(api, staff_user):
    data = submitted(api)
    staff_user.user_permissions.add(Permission.objects.get(codename="view_referencerequest"))
    response = admin_client(staff_user).get(photo_url(data["id"], data["images"][0]["id"]))
    assert response.status_code == 403


def test_a_design_image_is_403_even_with_the_permission(api, quoter):
    data = submitted(api)
    design_image = upload_image(api, "decoration")
    assert admin_client(quoter).get(photo_url(data["id"], design_image)).status_code == 403


def test_a_photo_of_another_request_is_403(api, quoter):
    first = submitted(api)
    api.post(f"{URL}{first['id']}/cancel/")
    second = submitted(api)
    first_photo = upload_image(api, "reference")
    assert admin_client(quoter).get(photo_url(second["id"], first_photo)).status_code == 403
