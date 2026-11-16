"""Datos y avisos de la cuenta (`/cuenta/datos`, D72): `GET` y `PATCH account/` y `POST auth/password/`.

Cada cuenta lee y cambia solo lo suyo, con JWT. El correo no se cambia. La preferencia de WhatsApp necesita teléfono.
Cambiar la contraseña sigue las reglas del registro, cierra las demás sesiones y deja abierta la actual con un par
nuevo (el refresh nuevo en la cookie de `auth/`).
"""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from core_pasteleria.api.throttles import (
    PasswordChangeIPThrottle,
    PasswordChangeUserThrottle,
    SecurityScopedRateThrottle,
)
from core_pasteleria.models import Order

User = get_user_model()

ACCOUNT_URL = "/api/v1/account/"
PASSWORD_URL = "/api/v1/auth/password/"
CSRF_URL = "/api/v1/auth/csrf/"
LOGIN_URL = "/api/v1/auth/login/"
REFRESH_URL = "/api/v1/auth/refresh/"
COOKIE = "ilusion_refresh"
PASSWORD = "pastel-de-fresa-2026"
NEW_PASSWORD = "merengue-de-limon-77"
WRONG_CURRENT = "Tu contraseña actual no coincide."
WHATSAPP_NEEDS_PHONE = "Para avisarte por WhatsApp, escribe tu teléfono en tus datos personales."
READ_ONLY = "Este dato no se cambia desde aquí."


@pytest.fixture(autouse=True)
def auth_settings(settings, monkeypatch):
    settings.AXES_FAILURE_LIMIT = 5
    settings.AXES_COOLOFF_TIME = timedelta(hours=1)
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}
    monkeypatch.setattr(
        SecurityScopedRateThrottle,
        "THROTTLE_RATES",
        {"login": "1000/min", "register": "1000/min", "session": "1000/min"},
    )


@pytest.fixture
def customer(db):
    return User.objects.create_user("carla@correo.test", PASSWORD, full_name="Carla Ruiz")


@pytest.fixture
def google_customer(db):
    """Cuenta solo de Google: sin contraseña usable."""
    return User.objects.create_user("gina@gmail.com", None, full_name="Gina Soto", google_sub="google-sub-123")


def signed_in(user, ip="10.0.0.1"):
    """Un navegador con sesión: la cookie del refresh, la de CSRF y el access en `Authorization`."""
    client = APIClient(enforce_csrf_checks=True, REMOTE_ADDR=ip)
    assert client.get(CSRF_URL).status_code == 204
    csrf = client.cookies["csrftoken"].value
    client.credentials(HTTP_X_CSRFTOKEN=csrf)
    response = client.post(LOGIN_URL, {"email": user.email, "password": PASSWORD}, format="json")
    assert response.status_code == 200, response.json()
    client.credentials(HTTP_X_CSRFTOKEN=csrf, HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")
    return client


def bearer(user):
    """Solo el access, sin cookies (una cuenta de Google no entra con contraseña)."""
    from rest_framework_simplejwt.tokens import RefreshToken

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


def with_csrf(client):
    client.get(CSRF_URL)
    return client


def change_password(client, current=PASSWORD, new=NEW_PASSWORD):
    return client.post(PASSWORD_URL, {"current_password": current, "new_password": new}, format="json")


# --- Sin sesión ---


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "url"),
    [("get", ACCOUNT_URL), ("patch", ACCOUNT_URL), ("post", PASSWORD_URL)],
)
def test_without_a_session_the_account_answers_401(method, url):
    response = getattr(APIClient(), method)(url, {}, format="json")
    assert response.status_code == 401


# --- Leer ---


@pytest.mark.django_db
def test_get_returns_the_account_of_whoever_signed_in(customer):
    User.objects.create_user("otra@correo.test", PASSWORD, full_name="Otra Persona", phone="5599999999")
    response = bearer(customer).get(ACCOUNT_URL)
    assert response.status_code == 200
    assert response.json() == {
        "email": "carla@correo.test",
        "full_name": "Carla Ruiz",
        "phone": None,
        "has_password": True,
        "google_linked": False,
        "notify_whatsapp": False,
    }


@pytest.mark.django_db
def test_a_google_account_says_it_has_no_password_and_is_linked(google_customer):
    body = bearer(google_customer).get(ACCOUNT_URL).json()
    assert body["has_password"] is False
    assert body["google_linked"] is True
    assert "google_sub" not in body and "id" not in body


# --- Cambiar datos y avisos ---


@pytest.mark.django_db
def test_patch_saves_the_name_the_phone_and_the_whatsapp_preference(customer):
    response = bearer(customer).patch(
        ACCOUNT_URL,
        {"full_name": "  Carla   Ruiz  Peña ", "phone": "55 1234-5678", "notify_whatsapp": True},
        format="json",
    )
    assert response.status_code == 200, response.json()
    assert response.json()["full_name"] == "Carla Ruiz Peña"
    assert response.json()["phone"] == "5512345678"
    assert response.json()["notify_whatsapp"] is True
    customer.refresh_from_db()
    assert (customer.full_name, customer.phone, customer.notify_whatsapp) == ("Carla Ruiz Peña", "5512345678", True)


@pytest.mark.django_db
def test_the_phone_can_be_cleared(customer):
    customer.phone = "5512345678"
    customer.save()
    response = bearer(customer).patch(ACCOUNT_URL, {"phone": ""}, format="json")
    assert response.status_code == 200
    assert response.json()["phone"] is None


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("payload", "field", "message"),
    [
        ({"full_name": ""}, "full_name", "Escribe tu nombre."),
        ({"full_name": "   "}, "full_name", "Escribe tu nombre."),
        ({"full_name": "a" * 151}, "full_name", "Escribe tu nombre en 150 caracteres o menos."),
        ({"full_name": 123}, "full_name", "Escribe un texto."),
        ({"full_name": "Ana‮López"}, "full_name", "Escribe tu nombre solo con letras, espacios y signos comunes."),
        ({"phone": "55 1234 567"}, "phone", "Escribe 10 dígitos, por ejemplo 55 1234 5678."),
        ({"phone": "55123456789"}, "phone", "Escribe 10 dígitos, por ejemplo 55 1234 5678."),
        ({"phone": "abcdefghij"}, "phone", "Escribe 10 dígitos, por ejemplo 55 1234 5678."),
        ({"notify_whatsapp": "quizá"}, "notify_whatsapp", "Elige sí o no."),
    ],
)
def test_patch_validates_each_field_in_spanish(customer, payload, field, message):
    response = bearer(customer).patch(ACCOUNT_URL, payload, format="json")
    assert response.status_code == 400
    assert response.json()[field] == [message]
    customer.refresh_from_db()
    assert customer.full_name == "Carla Ruiz" and customer.phone == ""


@pytest.mark.django_db
def test_whatsapp_without_a_phone_is_a_validation_error(customer):
    response = bearer(customer).patch(ACCOUNT_URL, {"notify_whatsapp": True}, format="json")
    assert response.status_code == 400
    assert response.json() == {"notify_whatsapp": [WHATSAPP_NEEDS_PHONE]}
    customer.refresh_from_db()
    assert customer.notify_whatsapp is False


@pytest.mark.django_db
def test_clearing_the_phone_while_whatsapp_is_on_is_a_validation_error(customer):
    customer.phone, customer.notify_whatsapp = "5512345678", True
    customer.save()
    response = bearer(customer).patch(ACCOUNT_URL, {"phone": ""}, format="json")
    assert response.status_code == 400
    assert response.json() == {"notify_whatsapp": [WHATSAPP_NEEDS_PHONE]}
    customer.refresh_from_db()
    assert customer.phone == "5512345678"


@pytest.mark.django_db
def test_turning_whatsapp_off_and_clearing_the_phone_together_is_fine(customer):
    customer.phone, customer.notify_whatsapp = "5512345678", True
    customer.save()
    response = bearer(customer).patch(ACCOUNT_URL, {"phone": "", "notify_whatsapp": False}, format="json")
    assert response.status_code == 200
    customer.refresh_from_db()
    assert (customer.phone, customer.notify_whatsapp) == ("", False)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload",
    [
        {"email": "otra@correo.test"},
        {"is_staff": True},
        {"full_name": "Carla Nueva", "is_superuser": True},
        {"google_sub": "x", "password": "nueva-clave-123"},
        {"has_password": False, "google_linked": True},
    ],
)
def test_read_only_and_unknown_fields_are_rejected_and_nothing_changes(customer, payload):
    response = bearer(customer).patch(ACCOUNT_URL, payload, format="json")
    assert response.status_code == 400
    for key in payload:
        if key != "full_name":
            assert response.json()[key] == [READ_ONLY]
    customer.refresh_from_db()
    assert customer.email == "carla@correo.test"
    assert customer.full_name == "Carla Ruiz"
    assert not customer.is_staff and not customer.is_superuser
    assert customer.google_sub is None
    assert customer.check_password(PASSWORD)


@pytest.mark.django_db
def test_patch_changes_only_the_account_that_signed_in(customer):
    other = User.objects.create_user("otra@correo.test", PASSWORD, full_name="Otra Persona")
    assert bearer(customer).patch(ACCOUNT_URL, {"full_name": "Carla Cambiada"}, format="json").status_code == 200
    other.refresh_from_db()
    assert other.full_name == "Otra Persona"


@pytest.mark.django_db
def test_the_database_rejects_whatsapp_without_a_phone(customer):
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.filter(pk=customer.pk).update(notify_whatsapp=True, phone="")


@pytest.mark.django_db
def test_the_model_explains_whatsapp_without_a_phone(customer):
    from django.core.exceptions import ValidationError

    customer.notify_whatsapp = True
    with pytest.raises(ValidationError) as error:
        customer.full_clean()
    assert error.value.message_dict["notify_whatsapp"] == [WHATSAPP_NEEDS_PHONE]


# --- Cambiar la contraseña ---


@pytest.mark.django_db
def test_changing_the_password_keeps_this_session_and_closes_the_others(customer):
    here = signed_in(customer)
    elsewhere = signed_in(customer, ip="10.0.0.2")
    old_cookie = here.cookies[COOKIE].value

    response = change_password(here)
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["user"] == {"email": "carla@correo.test", "full_name": "Carla Ruiz", "phone": None}
    assert body["access_expires_in"] == 600
    new_cookie = response.cookies[COOKIE]
    assert new_cookie.value and new_cookie.value != old_cookie
    assert new_cookie["path"] == "/api/v1/auth/" and new_cookie["httponly"] is True

    customer.refresh_from_db()
    assert customer.check_password(NEW_PASSWORD) and not customer.check_password(PASSWORD)

    # Esta sesión sigue: el access nuevo sirve y su refresh renueva.
    here.credentials(HTTP_X_CSRFTOKEN=here.cookies["csrftoken"].value, HTTP_AUTHORIZATION=f"Bearer {body['access']}")
    assert here.get(ACCOUNT_URL).status_code == 200
    assert here.post(REFRESH_URL, format="json").status_code == 200

    # La otra sesión terminó: su access ya no vale y su refresh está en la lista negra.
    assert elsewhere.get(ACCOUNT_URL).status_code == 401
    assert elsewhere.post(REFRESH_URL, format="json").status_code == 401
    assert BlacklistedToken.objects.filter(token__token=old_cookie).exists()


@pytest.mark.django_db
def test_a_wrong_current_password_fails_and_changes_nothing(customer):
    client = signed_in(customer)
    outstanding = OutstandingToken.objects.filter(user=customer, blacklistedtoken__isnull=True).count()
    response = change_password(client, current="no-es-la-mia-123")
    assert response.status_code == 400
    assert response.json()["current_password"] == [WRONG_CURRENT]
    assert response.json()["codes"]["current_password"] == ["wrong_password"]
    assert COOKIE not in response.cookies
    customer.refresh_from_db()
    assert customer.check_password(PASSWORD)
    assert OutstandingToken.objects.filter(user=customer, blacklistedtoken__isnull=True).count() == outstanding
    assert client.get(ACCOUNT_URL).status_code == 200


@pytest.mark.django_db
def test_a_google_only_account_cannot_change_a_password_and_gets_the_same_answer(customer, google_customer):
    google = with_csrf(bearer(google_customer))
    google.credentials(
        HTTP_AUTHORIZATION=google._credentials["HTTP_AUTHORIZATION"], HTTP_X_CSRFTOKEN=google.cookies["csrftoken"].value
    )
    google_response = change_password(google, current="cualquier-cosa-123")
    wrong_response = change_password(signed_in(customer), current="cualquier-cosa-123")

    assert google_response.status_code == wrong_response.status_code == 400
    assert google_response.json() == wrong_response.json()
    google_customer.refresh_from_db()
    assert not google_customer.has_usable_password()


@pytest.mark.django_db
def test_a_staff_account_gets_the_same_answer_and_its_password_is_not_checked(staff_user):
    client = with_csrf(bearer(staff_user))
    client.credentials(
        HTTP_AUTHORIZATION=client._credentials["HTTP_AUTHORIZATION"], HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value
    )
    response = change_password(client, current="clave-de-prueba-123")
    assert response.status_code == 400
    assert response.json()["current_password"] == [WRONG_CURRENT]
    staff_user.refresh_from_db()
    assert staff_user.check_password("clave-de-prueba-123")


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("new", "message", "code"),
    [
        ("corta", "Te faltan caracteres: el mínimo es 8.", "password_too_short"),
        ("12345678901", "Usa también letras, no solo números.", "password_entirely_numeric"),
        ("password123", "Esa contraseña es muy común. Elige otra.", "password_too_common"),
        ("carla@correo.test", "Se parece mucho a tu correo o a tu nombre. Elige otra.", "password_too_similar"),
    ],
)
def test_the_new_password_follows_the_registration_rules(customer, new, message, code):
    response = change_password(signed_in(customer), new=new)
    assert response.status_code == 400
    assert message in response.json()["new_password"]
    assert code in response.json()["codes"]["new_password"]
    customer.refresh_from_db()
    assert customer.check_password(PASSWORD)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("payload", "field", "message"),
    [
        ({"new_password": NEW_PASSWORD}, "current_password", "Escribe tu contraseña actual."),
        ({"current_password": "", "new_password": NEW_PASSWORD}, "current_password", "Escribe tu contraseña actual."),
        ({"current_password": PASSWORD}, "new_password", "Escribe la contraseña nueva."),
        ({"current_password": PASSWORD, "new_password": "x" * 129}, "new_password", "Usa 128 caracteres o menos."),
    ],
)
def test_the_password_form_needs_both_fields(customer, payload, field, message):
    response = signed_in(customer).post(PASSWORD_URL, payload, format="json")
    assert response.status_code == 400
    assert response.json()[field] == [message]


@pytest.mark.django_db
def test_changing_the_password_requires_csrf(customer):
    client = signed_in(customer)
    client.credentials(HTTP_AUTHORIZATION=client._credentials["HTTP_AUTHORIZATION"])
    response = change_password(client)
    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]
    customer.refresh_from_db()
    assert customer.check_password(PASSWORD)


@pytest.mark.django_db
def test_changing_the_password_is_throttled_per_account(customer, monkeypatch):
    monkeypatch.setattr(PasswordChangeUserThrottle, "THROTTLE_RATES", {"password_change_user": "2/hour"})
    client = signed_in(customer)
    for _ in range(2):
        assert change_password(client, current="no-es-la-mia-123").status_code == 400
    response = change_password(client)
    assert response.status_code == 429
    assert int(response["Retry-After"]) > 0
    customer.refresh_from_db()
    assert customer.check_password(PASSWORD)


@pytest.mark.django_db
def test_changing_the_password_is_throttled_per_ip_across_accounts(customer, monkeypatch):
    monkeypatch.setattr(PasswordChangeIPThrottle, "THROTTLE_RATES", {"password_change_ip": "2/hour"})
    other = User.objects.create_user("otra@correo.test", PASSWORD, full_name="Otra Persona")
    assert change_password(signed_in(customer), current="no-es-la-mia-123").status_code == 400
    assert change_password(signed_in(other), current="no-es-la-mia-123").status_code == 400
    assert change_password(signed_in(other)).status_code == 429
    # Otra IP tiene su propio contador.
    assert change_password(signed_in(other, ip="10.0.0.9")).status_code == 200


@pytest.mark.django_db
def test_the_password_throttles_count_in_the_security_cache():
    assert PasswordChangeUserThrottle.cache._alias == "security"
    assert PasswordChangeIPThrottle.cache._alias == "security"


# --- Admin ---


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    return client


@pytest.mark.django_db
def test_the_user_admin_shows_the_whatsapp_preference_read_only(superuser_client, customer):
    customer.phone, customer.notify_whatsapp = "5512345678", True
    customer.save()
    html = superuser_client.get(f"/admin/core_pasteleria/user/{customer.pk}/change/").content.decode()
    assert "Avisos por WhatsApp" in html
    assert "5512345678" in html
    assert 'name="notify_whatsapp"' not in html
    assert 'name="phone"' not in html


@pytest.mark.django_db
def test_the_order_admin_shows_the_customer_phone_and_whatsapp_preference(superuser_client, customer, monkeypatch):
    from core_pasteleria.services.orders import schedule_service
    from tests.test_orders_api import NOW, body, design_line, post

    monkeypatch.setattr(schedule_service, "bakery_now", lambda: NOW)
    customer.phone, customer.notify_whatsapp = "5587654321", True
    customer.save()
    api = APIClient()
    api.force_authenticate(customer)
    created = post(api, body(design_line()))
    assert created.status_code == 201, created.json()
    order = Order.objects.get(pk=created.json()["id"])

    html = superuser_client.get(f"/admin/core_pasteleria/order/{order.pk}/change/").content.decode()
    assert "Teléfono del cliente" in html and "5587654321" in html
    assert "Avisos por WhatsApp" in html
    assert "Sí, escríbele por WhatsApp" in html


# --- Revisión única (D72): ramas concurrentes, auditoría, candado y llaves de solo lectura ---


@pytest.mark.django_db
def test_the_patch_also_reports_read_only_keys_when_a_known_field_fails(customer):
    response = bearer(customer).patch(ACCOUNT_URL, {"phone": "123", "email": "x"}, format="json")
    assert response.status_code == 400
    assert response.json()["phone"] == ["Escribe 10 dígitos, por ejemplo 55 1234 5678."]
    assert response.json()["email"] == [READ_ONLY]


@pytest.mark.django_db
def test_whatsapp_on_while_another_request_cleared_the_phone_is_a_field_error(customer):
    """La base rechaza el cruce (`user_whatsapp_needs_phone`) y el servicio lo dice en `notify_whatsapp`."""
    from core_pasteleria.services import account_service
    from core_pasteleria.services.errors import DomainValidationError

    customer.phone = "5512345678"
    customer.save()
    User.objects.filter(pk=customer.pk).update(phone="")

    with pytest.raises(DomainValidationError) as error:
        account_service.update_account(customer, {"notify_whatsapp": True})
    assert error.value.errors == {"notify_whatsapp": [WHATSAPP_NEEDS_PHONE]}
    customer.refresh_from_db()
    assert customer.phone == "" and customer.notify_whatsapp is False


@pytest.mark.django_db
def test_clearing_the_phone_while_another_request_turned_whatsapp_on_is_a_field_error(customer):
    from core_pasteleria.services import account_service
    from core_pasteleria.services.errors import DomainValidationError

    customer.phone = "5512345678"
    customer.save()
    User.objects.filter(pk=customer.pk).update(notify_whatsapp=True)

    with pytest.raises(DomainValidationError) as error:
        account_service.update_account(customer, {"phone": ""})
    assert error.value.errors == {"notify_whatsapp": [WHATSAPP_NEEDS_PHONE]}
    customer.refresh_from_db()
    assert customer.phone == "5512345678" and customer.notify_whatsapp is True


def _audit(caplog, operation):
    return [record for record in caplog.records if record.name == "core_pasteleria.audit" and record.operation.endswith(operation)]


@pytest.mark.django_db
def test_the_audit_records_only_the_user_id_of_an_account_update(customer, caplog):
    import logging

    from core_pasteleria.services import account_service
    from core_pasteleria.services.errors import DomainValidationError

    caplog.set_level(logging.INFO, logger="core_pasteleria.audit")
    account_service.update_account(customer, {"full_name": "Carla Nueva"})
    with pytest.raises(DomainValidationError):
        account_service.update_account(customer, {"notify_whatsapp": True})

    ok, rejected = _audit(caplog, "update_account")
    assert (ok.result, ok.user_id) == ("ok", customer.pk)
    assert (rejected.result, rejected.user_id) == ("rejected:DomainValidationError", customer.pk)
    for record in (ok, rejected):
        message = record.getMessage()
        assert f"user_id={customer.pk}" in message
        assert "carla" not in message.lower() and "Carla" not in message


@pytest.mark.django_db
def test_the_audit_records_only_the_user_id_of_a_password_change(customer, caplog):
    import logging

    from core_pasteleria.services import auth_service

    caplog.set_level(logging.INFO, logger="core_pasteleria.audit")
    with pytest.raises(auth_service.PasswordChangeError):
        auth_service.change_password(customer, current_password="no-es-la-mia-123", new_password=NEW_PASSWORD)
    auth_service.change_password(customer, current_password=PASSWORD, new_password=NEW_PASSWORD)

    rejected, ok = _audit(caplog, "change_password")
    assert (rejected.result, rejected.user_id) == ("rejected:PasswordChangeError", customer.pk)
    assert (ok.result, ok.user_id) == ("ok", customer.pk)
    for record in (ok, rejected):
        message = record.getMessage()
        assert "carla@correo.test" not in message and PASSWORD not in message and NEW_PASSWORD not in message


@pytest.mark.django_db
def test_the_current_password_is_checked_again_under_the_lock(customer):
    """Otra petición cambió la contraseña entre la revisión y el guardado: la de esta ya no es la actual."""
    from core_pasteleria.services import auth_service

    stale = User.objects.get(pk=customer.pk)
    customer.set_password("otra-clave-de-pastel-77")
    customer.save()

    with pytest.raises(auth_service.PasswordChangeError) as error:
        auth_service.change_password(stale, current_password=PASSWORD, new_password=NEW_PASSWORD)
    assert error.value.errors == {"current_password": [WRONG_CURRENT]}
    customer.refresh_from_db()
    assert customer.check_password("otra-clave-de-pastel-77")


@pytest.mark.django_db
def test_a_failed_password_save_leaves_the_instance_with_the_old_hash(customer, monkeypatch):
    from core_pasteleria.repositories import user_repo
    from core_pasteleria.services import auth_service

    def broken(_user):
        raise RuntimeError("la lista negra falló")

    monkeypatch.setattr(user_repo, "_revoke_all_sessions", broken)
    old_hash = customer.password
    with pytest.raises(RuntimeError):
        auth_service.change_password(customer, current_password=PASSWORD, new_password=NEW_PASSWORD)
    assert customer.password == old_hash
    customer.refresh_from_db()
    assert customer.check_password(PASSWORD)
