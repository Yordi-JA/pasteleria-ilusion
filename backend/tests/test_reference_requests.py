"""Envío de referencia y su cotización (regla 9; D70): enviar, cotizar en el admin, aceptar y cancelar."""
import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth.models import Permission
from django.test import Client
from rest_framework.test import APIClient

from core_pasteleria.models import (
    CustomerImage,
    Order,
    PolicySettings,
    ReferenceRequest,
    StoreSettings,
    UploadSettings,
)
from core_pasteleria.services.errors import DomainValidationError
from core_pasteleria.services.orders import reference_service
from tests.test_orders_api import IN_TWO_DAYS, NOW, TODAY, body, design_line, post, upload_image
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería

pytestmark = pytest.mark.django_db

URL = "/api/v1/reference-requests/"


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


@pytest.fixture
def other(django_user_model):
    client = APIClient()
    client.force_authenticate(django_user_model.objects.create_user("otra@pasteleria.test", "clave-de-prueba-123"))
    return client


@pytest.fixture
def quoter(staff_user):
    staff_user.user_permissions.add(Permission.objects.get(codename="set_reference_quote"))
    return type(staff_user).objects.get(pk=staff_user.pk)


def payload(images, **changes):
    return {
        "image_ids": images,
        "description": "La decoración de flores,\npero en tonos durazno y de 2 pisos.",
        "occasion": "quinceanera",
        "people": 40,
        "event_date": IN_TWO_DAYS.isoformat(),
        "budget": "1500.00",
        # El sabor, con las opciones de los pasos 2 a 4 (D70, decisión del usuario del 15 de noviembre de 2026).
        "cake_type": "tres_leches",
        "bread": "chocolate",
        "filling_base": "normal",
        "filling_flavors": ["fresa", "nuez"],
        **changes,
    }


def send(client, data, key=None):
    return client.post(URL, data, format="json", HTTP_IDEMPOTENCY_KEY=key or uuid.uuid4().hex)


def submitted(client, count=2, **changes):
    response = send(client, payload([upload_image(client, "reference") for _ in range(count)], **changes))
    assert response.status_code == 201, response.json()
    return response.json()


def quote(request_id, actor, price="1800.00", note="Dos pisos, flores de betún.", now=None):
    return reference_service.set_quote(request_id, Decimal(price), note, actor=actor, now=now)


def accept(client, request_id, slot="15:00", key=None, **changes):
    data = {"slot_starts_at": slot, "pickup_name": "Ana López García", "pickup_phone": "55 1234 5678", **changes}
    return client.post(f"{URL}{request_id}/accept/", data, format="json", HTTP_IDEMPOTENCY_KEY=key or uuid.uuid4().hex)


# --- Enviar ---


def test_a_reference_is_received_in_review_without_charging(api, customer_user):
    data = submitted(api)
    assert (data["status"], data["status_label"], data["quote"], data["order_id"]) == (
        "in_review", "En revisión", None, None,
    )
    assert (data["people"], data["occasion"], data["occasion_label"], data["budget"]) == (
        40, "quinceanera", "XV años", "1500.00",
    )
    assert data["description"].startswith("La decoración de flores,\npero")
    assert len(data["images"]) == 2
    assert not Order.objects.filter(customer=customer_user).exists()


def test_the_maximum_of_images_comes_from_the_admin(api):
    UploadSettings.objects.update(max_reference_images=2)
    images = [upload_image(api, "reference") for _ in range(3)]
    response = send(api, payload(images))
    assert response.status_code == 400
    assert response.json() == {"image_ids": ["Puedes mandar hasta 2 fotos."]}
    assert not ReferenceRequest.objects.exists()


def test_more_than_the_hard_limit_is_refused_before_the_service(api):
    response = send(api, payload([str(uuid.uuid4()) for _ in range(4)]))
    assert response.status_code == 400 and "image_ids" in response.json()


def test_at_least_one_image_is_needed(api):
    assert send(api, payload([])).json() == {"image_ids": ["Sube al menos una foto de referencia."]}


def test_images_must_be_own_unused_references(api, other):
    decoration = upload_image(api, "decoration")
    foreign = upload_image(other, "reference")
    for image in (decoration, foreign):
        response = send(api, payload([image]))
        assert response.status_code == 400, image
        assert list(response.json()) == ["image_ids"]
    used = submitted(api, count=1)["images"][0]["id"]
    PolicySettings.objects.update(max_quote_orders_per_customer=5)
    assert send(api, payload([used])).status_code == 400


def test_the_event_needs_two_days(api):
    image = upload_image(api, "reference")
    response = send(api, payload([image], event_date=(TODAY + timedelta(days=1)).isoformat()))
    assert response.json() == {"event_date": ["Los pedidos se hacen con al menos 2 días de anticipación. Elige otra fecha."]}
    too_far = (TODAY + timedelta(days=61)).isoformat()
    assert list(send(api, payload([image], event_date=too_far)).json()) == ["event_date"]


def test_the_same_key_returns_the_same_request(api):
    key = uuid.uuid4().hex
    first = send(api, payload([upload_image(api, "reference")]), key=key)
    again = send(api, {"nada": True}, key=key)
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["id"] == first.json()["id"]
    assert ReferenceRequest.objects.count() == 1


def test_the_key_is_required(api):
    response = api.post(URL, payload([upload_image(api, "reference")]), format="json")
    assert response.status_code == 400 and "idempotency_key" in response.json()


def test_one_request_in_review_at_a_time(api):
    submitted(api)
    response = send(api, payload([upload_image(api, "reference")]))
    assert response.status_code == 400 and "non_field_errors" in response.json()


def test_a_description_with_control_characters_is_refused(api):
    response = send(api, payload([upload_image(api, "reference")], description="Hola‮"))
    assert list(response.json()) == ["description"]


def test_anonymous_gets_401():
    assert APIClient().get(URL).status_code == 401


# --- Dueño ---


def test_only_the_owner_sees_and_acts_on_a_request(api, other, quoter):
    data = submitted(api)
    quote(data["id"], quoter)
    assert other.get(f"{URL}{data['id']}/").status_code == 404
    assert accept(other, data["id"]).status_code == 404
    assert other.post(f"{URL}{data['id']}/cancel/").status_code == 404
    assert other.get(URL).json()["count"] == 0
    assert api.get(URL).json()["results"][0]["id"] == data["id"]


# --- Cotizar en el admin ---


def test_the_admin_quotes_with_the_permission(api, quoter):
    data = submitted(api)
    client = Client()
    client.force_login(quoter)
    url = f"/admin/core_pasteleria/referencerequest/{data['id']}/change/"
    response = client.post(url, {"quoted_price": "1800.00", "quote_note": "Dos pisos."})
    assert response.status_code == 302
    request = ReferenceRequest.objects.get(pk=data["id"])
    assert (request.status, request.quoted_price, request.quote_note, request.quoted_by_id) == (
        "quote_ready", Decimal("1800.00"), "Dos pisos.", quoter.pk,
    )
    detail = api.get(f"{URL}{data['id']}/").json()
    assert detail["status"] == "quote_ready"
    assert detail["quote"]["price"] == "1800.00" and detail["quote"]["pay_today"] == "990.00"


def test_the_admin_without_the_permission_cannot_quote(api, staff_user):
    data = submitted(api)
    client = Client()
    client.force_login(staff_user)
    response = client.post(f"/admin/core_pasteleria/referencerequest/{data['id']}/change/", {"quoted_price": "10"})
    assert response.status_code == 403
    assert ReferenceRequest.objects.get(pk=data["id"]).status == "in_review"
    with pytest.raises(DomainValidationError):
        quote(data["id"], staff_user)


def test_a_price_of_zero_is_refused(api, quoter):
    data = submitted(api)
    with pytest.raises(DomainValidationError):
        quote(data["id"], quoter, price="0")


# --- Vigencia ---


def test_without_validity_the_quote_does_not_expire_and_says_pending(api, quoter):
    data = submitted(api)
    quote(data["id"], quoter, now=NOW - timedelta(days=30))
    detail = api.get(f"{URL}{data['id']}/").json()["quote"]
    assert (detail["expires_at"], detail["expired"], detail["validity_pending"]) == (None, False, True)
    assert accept(api, data["id"]).status_code == 201


def test_an_expired_quote_cannot_be_accepted(api, quoter):
    PolicySettings.objects.update(reference_quote_valid_hours=2)
    data = submitted(api)
    quote(data["id"], quoter, now=NOW - timedelta(hours=3))
    detail = api.get(f"{URL}{data['id']}/").json()["quote"]
    assert (detail["expired"], detail["validity_pending"]) == (True, False)
    response = accept(api, data["id"])
    assert response.status_code == 409 and response.json()["code"] == "quote_expired"
    assert not Order.objects.exists()


def test_a_quote_within_its_validity_can_be_accepted(api, quoter):
    PolicySettings.objects.update(reference_quote_valid_hours=2)
    data = submitted(api)
    quote(data["id"], quoter, now=NOW - timedelta(hours=1))
    assert api.get(f"{URL}{data['id']}/").json()["quote"]["expired"] is False
    assert accept(api, data["id"]).status_code == 201


# --- Aceptar ---


def test_accepting_creates_a_normal_unpaid_order_with_the_quoted_price(api, quoter, customer_user):
    data = submitted(api)
    quote(data["id"], quoter)
    response = accept(api, data["id"], slot="15:00")
    assert response.status_code == 201, response.json()
    order = response.json()
    assert (order["status"], order["delivery_date"], order["slot_starts_at"]) == (
        "awaiting_payment", IN_TWO_DAYS.isoformat(), "15:00",
    )
    assert (order["pickup_name"], order["pickup_phone"], order["subtotal"]) == ("Ana López García", "5512345678", "1800.00")
    assert order["payment"]["pay_today"] == "990.00" and order["payment"]["pay_on_delivery"] == "900.00"
    assert [(item["kind"], item["line_total"], item["design"]) for item in order["items"]] == [
        ("reference", "1800.00", None)
    ]
    request = ReferenceRequest.objects.get(pk=data["id"])
    assert (request.status, request.order_id) == ("accepted", order["id"])
    assert api.get(f"{URL}{data['id']}/").json()["order_id"] == order["id"]


def test_accepting_twice_returns_the_same_order(api, quoter):
    data = submitted(api)
    quote(data["id"], quoter)
    first = accept(api, data["id"])
    again = accept(api, data["id"])
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["id"] == first.json()["id"]
    assert Order.objects.count() == 1


def test_accepting_into_a_full_slot_is_refused(api, quoter):
    PolicySettings.objects.update(max_unpaid_orders_per_customer=5)
    StoreSettings.objects.update(max_orders_per_slot=1)
    assert post(api, body(design_line(), day=IN_TWO_DAYS, slot="15:00")).status_code == 201
    data = submitted(api)
    quote(data["id"], quoter)
    response = accept(api, data["id"], slot="15:00")
    assert response.status_code == 400 and list(response.json()) == ["slot_starts_at"]
    assert ReferenceRequest.objects.get(pk=data["id"]).status == "quote_ready"
    assert accept(api, data["id"], slot="15:30").status_code == 201


def test_the_slot_must_be_on_the_event_day(api, quoter):
    data = submitted(api)
    quote(data["id"], quoter)
    other_day = (IN_TWO_DAYS + timedelta(days=1)).isoformat()
    assert list(accept(api, data["id"], delivery_date=other_day).json()) == ["delivery_date"]
    assert accept(api, data["id"], delivery_date=IN_TWO_DAYS.isoformat()).status_code == 201


def test_a_request_without_quote_cannot_be_accepted(api):
    data = submitted(api)
    response = accept(api, data["id"])
    assert response.status_code == 409 and response.json()["code"] == "quote_not_ready"


def test_the_calendar_offers_the_event_day_for_a_reference(api):
    response = api.get(
        "/api/v1/delivery-slots/", {"start": IN_TWO_DAYS.isoformat(), "end": IN_TWO_DAYS.isoformat(), "kind": "reference"}
    )
    assert response.status_code == 200 and response.json()["days"][0]["available"] is True


def test_the_cart_cannot_send_a_reference_line(api):
    response = post(api, body({"kind": "reference", "quantity": 1}))
    assert response.status_code == 400 and "kind" in response.json()["items"]["0"]


# --- Cancelar ---


def test_cancelling_a_request_deletes_its_photos(api, quoter):
    data = submitted(api)
    response = api.post(f"{URL}{data['id']}/cancel/")
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    assert not CustomerImage.objects.filter(pk__in=[image["id"] for image in data["images"]]).exists()
    assert api.post(f"{URL}{data['id']}/cancel/").status_code == 200


def test_an_accepted_request_is_cancelled_from_its_order(api, quoter):
    data = submitted(api)
    quote(data["id"], quoter)
    accept(api, data["id"])
    response = api.post(f"{URL}{data['id']}/cancel/")
    assert response.status_code == 409 and response.json()["code"] == "already_accepted"
