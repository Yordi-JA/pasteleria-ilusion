"""Acceso de clientes por la API: registro, inicio de sesión, renovación y salida (D62).

El access token va en el cuerpo y vive en la memoria del navegador; el refresh va en una
cookie HttpOnly limitada a `/api/v1/auth/` y cada operación que la pone o la lee exige CSRF.
"""
from datetime import timedelta

import pytest
from axes.models import AccessAttempt
from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from core_pasteleria.api.throttles import SecurityScopedRateThrottle

User = get_user_model()

CSRF_URL = "/api/v1/auth/csrf/"
REGISTER_URL = "/api/v1/auth/register/"
LOGIN_URL = "/api/v1/auth/login/"
REFRESH_URL = "/api/v1/auth/refresh/"
LOGOUT_URL = "/api/v1/auth/logout/"
COOKIE = "ilusion_refresh"
PASSWORD = "pastel-de-fresa-2026"


@pytest.fixture(autouse=True)
def auth_settings(settings, monkeypatch):
    # Valores fijos para no depender del .env local.
    settings.AXES_FAILURE_LIMIT = 5
    settings.AXES_COOLOFF_TIME = timedelta(hours=1)
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}
    # Las tasas reales son por hora; aquí, altas, salvo en las pruebas de throttling.
    monkeypatch.setattr(
        SecurityScopedRateThrottle,
        "THROTTLE_RATES",
        {"login": "1000/min", "register": "1000/min", "session": "1000/min"},
    )


def csrf_client(ip="10.0.0.1"):
    """Cliente que exige CSRF como el navegador: pide la cookie y manda el token en el encabezado."""
    client = APIClient(enforce_csrf_checks=True, REMOTE_ADDR=ip)
    response = client.get(CSRF_URL)
    assert response.status_code == 204
    client.credentials(HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
    return client


def register_payload(**overrides):
    return {
        "full_name": "Ana López García",
        "email": "ana@correo.test",
        "phone": "55 1234 5678",
        "password": PASSWORD,
        "accepts_terms": True,
        **overrides,
    }


@pytest.fixture
def customer(db):
    """Un cliente con el correo confirmado (D76): una cuenta sin confirmar no entra con su contraseña."""
    return User.objects.create_user(
        "cliente@correo.test", PASSWORD, full_name="Carla Ruiz", email_verified_at=timezone.now()
    )


# --- CSRF ---


@pytest.mark.django_db
def test_the_csrf_endpoint_sets_the_csrf_cookie():
    client = APIClient()
    response = client.get(CSRF_URL)
    assert response.status_code == 204
    assert client.cookies["csrftoken"].value


@pytest.mark.django_db
@pytest.mark.parametrize("url", [REGISTER_URL, LOGIN_URL, REFRESH_URL, LOGOUT_URL, "/api/v1/auth/google/"])
def test_every_cookie_endpoint_requires_csrf(url):
    response = APIClient(enforce_csrf_checks=True).post(url, {}, format="json")
    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]


# --- Registro ---


@pytest.mark.django_db
def test_register_creates_the_account_without_starting_a_session():
    """Desde D76 la cuenta nace sin confirmar: el registro no abre sesión ni pone la cookie del refresh."""
    client = csrf_client()
    response = client.post(REGISTER_URL, register_payload(email=" Ana@Correo.TEST "), format="json")

    assert response.status_code == 201
    body = response.json()
    assert body == {"email": "ana@correo.test", "expires_in_hours": 24}
    assert "access" not in body
    user = User.objects.get(email="ana@correo.test")
    assert user.check_password(PASSWORD)
    assert user.full_name == "Ana López García" and user.phone == "5512345678"
    assert not user.is_staff
    assert user.email_verified_at is None
    assert COOKIE not in client.cookies


@pytest.mark.django_db
def test_the_refresh_cookie_is_httponly_lax_and_limited_to_the_auth_path(settings, customer):
    settings.REFRESH_COOKIE_SECURE = True
    client = csrf_client()
    client.post(LOGIN_URL, {"email": customer.email, "password": PASSWORD}, format="json")
    cookie = client.cookies[COOKIE]
    assert cookie["httponly"] is True
    assert cookie["samesite"] == "Lax"
    assert cookie["path"] == "/api/v1/auth/"
    assert cookie["secure"] is True
    assert int(cookie["max-age"]) == 7 * 24 * 3600


@pytest.mark.django_db
def test_the_phone_is_optional():
    response = csrf_client().post(REGISTER_URL, register_payload(phone=""), format="json")
    assert response.status_code == 201
    assert User.objects.get(email="ana@correo.test").phone == ""


@pytest.mark.django_db
@pytest.mark.parametrize("phone", ["55 1234 567", "+52 55 1234 5678", "55-1234-56789", "55l2345678"])
def test_a_phone_that_is_not_ten_digits_is_rejected(phone):
    response = csrf_client().post(REGISTER_URL, register_payload(phone=phone), format="json")
    assert response.status_code == 400
    assert response.json()["phone"] == ["Escribe 10 dígitos, por ejemplo 55 1234 5678."]


@pytest.mark.django_db
def test_an_email_that_already_has_an_account_says_so_with_its_code(customer):
    response = csrf_client().post(REGISTER_URL, register_payload(email="CLIENTE@correo.test"), format="json")
    assert response.status_code == 400
    body = response.json()
    assert body["email"] == ["Ya hay una cuenta con este correo."]
    assert body["codes"]["email"] == ["email_taken"]
    assert User.objects.count() == 1


@pytest.mark.django_db
def test_a_taken_email_and_a_short_password_come_back_together(customer):
    """Como el mockup RegistroError: los dos errores en la misma respuesta."""
    response = csrf_client().post(
        REGISTER_URL, register_payload(email=customer.email, password="corta"), format="json"
    )
    assert response.status_code == 400
    body = response.json()
    assert body["email"] == ["Ya hay una cuenta con este correo."]
    assert body["password"] == ["Te faltan caracteres: el mínimo es 8."]
    assert body["codes"] == {"email": ["email_taken"], "password": ["password_too_short"]}


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("password", "message"),
    [
        ("password123", "Esa contraseña es muy común. Elige otra."),
        ("8364920571", "Usa también letras, no solo números."),
        ("ana@correo.test", "Se parece mucho a tu correo o a tu nombre. Elige otra."),
    ],
)
def test_weak_passwords_are_explained_in_spanish(password, message):
    response = csrf_client().post(REGISTER_URL, register_payload(password=password), format="json")
    assert response.status_code == 400
    assert message in response.json()["password"]


@pytest.mark.django_db
def test_the_terms_must_be_accepted():
    response = csrf_client().post(REGISTER_URL, register_payload(accepts_terms=False), format="json")
    assert response.status_code == 400
    assert response.json()["accepts_terms"] == [
        "Acepta los términos y el aviso de privacidad para crear tu cuenta."
    ]
    assert not User.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize("full_name", ["", "   ", "Ana\u0000López", "a" * 151])
def test_the_full_name_is_required_and_clean(full_name):
    response = csrf_client().post(REGISTER_URL, register_payload(full_name=full_name), format="json")
    assert response.status_code == 400
    assert "full_name" in response.json()


@pytest.mark.django_db
def test_register_ignores_privilege_fields():
    response = csrf_client().post(
        REGISTER_URL, register_payload(is_staff=True, is_superuser=True), format="json"
    )
    assert response.status_code == 201
    user = User.objects.get()
    assert not user.is_staff and not user.is_superuser


# --- Inicio de sesión ---


@pytest.mark.django_db
def test_login_returns_the_access_the_user_and_the_cookie(customer):
    client = csrf_client()
    response = client.post(LOGIN_URL, {"email": " CLIENTE@correo.test", "password": PASSWORD}, format="json")
    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {"email": "cliente@correo.test", "full_name": "Carla Ruiz", "phone": None}
    assert AccessToken(body["access"])["user_id"] == str(customer.pk)
    assert client.cookies[COOKIE].value
    customer.refresh_from_db()
    assert customer.last_login is not None


@pytest.mark.django_db
@pytest.mark.parametrize(
    "credentials",
    [
        {"email": "cliente@correo.test", "password": "incorrecta"},
        {"email": "nadie@correo.test", "password": PASSWORD},
    ],
)
def test_a_wrong_email_or_password_gives_the_same_answer(customer, credentials):
    response = csrf_client().post(LOGIN_URL, credentials, format="json")
    assert response.status_code == 401
    assert response.json() == {
        "detail": "El correo o la contraseña no coinciden.",
        "code": "invalid_credentials",
    }
    assert COOKIE not in response.cookies


@pytest.mark.django_db
def test_an_inactive_account_cannot_log_in(customer):
    customer.is_active = False
    customer.save()
    response = csrf_client().post(LOGIN_URL, {"email": customer.email, "password": PASSWORD}, format="json")
    assert response.status_code == 401


@pytest.mark.django_db
def test_a_google_account_without_password_cannot_log_in_with_a_password(db):
    User.objects.create_user("google@correo.test", None)
    response = csrf_client().post(LOGIN_URL, {"email": "google@correo.test", "password": PASSWORD}, format="json")
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


@pytest.mark.django_db
def test_an_empty_password_is_a_format_error_not_an_attempt(customer):
    response = csrf_client().post(LOGIN_URL, {"email": customer.email, "password": ""}, format="json")
    assert response.status_code == 400
    assert not AccessAttempt.objects.exists()


@pytest.mark.django_db
def test_login_does_not_accept_non_string_credentials(customer):
    response = csrf_client().post(LOGIN_URL, {"email": ["a"], "password": 123}, format="json")
    assert response.status_code == 400


# --- Bloqueo por intentos (django-axes, D34 y D62) ---


def _api_login(email, password, ip="10.0.0.1"):
    return csrf_client(ip).post(LOGIN_URL, {"email": email, "password": password}, format="json")


@pytest.mark.django_db
def test_five_failures_lock_that_email_from_that_ip_with_a_json_429(customer):
    for _ in range(4):
        assert _api_login(customer.email, "incorrecta").status_code == 401
    fifth = _api_login(customer.email, "incorrecta")
    assert fifth.status_code == 429

    response = _api_login(customer.email, PASSWORD)
    assert response.status_code == 429
    assert response["Retry-After"] == "3600"
    assert response.json() == {
        "detail": "Demasiados intentos fallidos. Intenta de nuevo más tarde.",
        "code": "locked_out",
    }
    assert COOKIE not in response.cookies


@pytest.mark.django_db
def test_the_locked_email_still_logs_in_from_another_ip(customer):
    for _ in range(5):
        _api_login(customer.email, "incorrecta", ip="10.0.0.1")
    assert _api_login(customer.email, PASSWORD, ip="10.0.0.2").status_code == 200


@pytest.mark.django_db
def test_failures_on_many_emails_do_not_lock_the_ip_for_other_customers(customer):
    """Con CGNAT muchos clientes comparten IP: la API no bloquea la IP sola (eso es del throttle)."""
    for number in range(6):
        _api_login(f"nadie{number}@correo.test", "incorrecta", ip="10.0.0.1")
    assert _api_login(customer.email, PASSWORD, ip="10.0.0.1").status_code == 200


@pytest.mark.django_db
def test_the_admin_still_locks_the_ip_alone_and_counts_api_failures(customer):
    staff = User.objects.create_user("personal@correo.test", PASSWORD, is_staff=True, is_superuser=True)
    for number in range(5):
        _api_login(f"nadie{number}@correo.test", "incorrecta", ip="10.0.0.1")
    response = Client(REMOTE_ADDR="10.0.0.1").post(
        "/admin/login/", {"username": staff.email, "password": PASSWORD}
    )
    assert response.status_code == 429
    assert "Demasiados intentos fallidos" in response.content.decode()


@pytest.mark.django_db
def test_api_failures_are_recorded_with_the_normalized_email(customer):
    _api_login(" CLIENTE@Correo.test ", "incorrecta")
    assert list(AccessAttempt.objects.values_list("username", flat=True)) == ["cliente@correo.test"]


# --- Throttling por IP ---


@pytest.mark.django_db
def test_login_is_throttled_per_ip_across_emails(customer, monkeypatch):
    monkeypatch.setattr(SecurityScopedRateThrottle, "THROTTLE_RATES", {"login": "3/hour", "session": "1000/min"})
    for number in range(3):
        assert _api_login(f"otro{number}@correo.test", "incorrecta").status_code == 401
    response = _api_login(customer.email, PASSWORD)
    assert response.status_code == 429
    assert int(response["Retry-After"]) > 0
    # Otra IP tiene su propio contador.
    assert _api_login(customer.email, PASSWORD, ip="10.0.0.9").status_code == 200


@pytest.mark.django_db
def test_register_is_throttled_per_ip(monkeypatch):
    monkeypatch.setattr(SecurityScopedRateThrottle, "THROTTLE_RATES", {"register": "2/hour", "session": "1000/min"})
    client = csrf_client()
    for number in range(2):
        client.post(REGISTER_URL, register_payload(email=f"ana{number}@correo.test"), format="json")
    response = client.post(REGISTER_URL, register_payload(email="ana9@correo.test"), format="json")
    assert response.status_code == 429
    assert not User.objects.filter(email="ana9@correo.test").exists()


@pytest.mark.django_db
def test_security_throttles_use_their_own_cache_alias():
    from django.core.cache import caches

    assert SecurityScopedRateThrottle.cache._alias == "security"
    assert caches["security"] is not caches["default"]


# --- Renovación ---


def _logged_in_client(user, ip="10.0.0.1"):
    client = csrf_client(ip)
    response = client.post(LOGIN_URL, {"email": user.email, "password": PASSWORD}, format="json")
    assert response.status_code == 200
    return client


@pytest.mark.django_db
def test_refresh_rotates_the_cookie_and_returns_a_new_access(customer):
    client = _logged_in_client(customer)
    old_cookie = client.cookies[COOKIE].value

    response = client.post(REFRESH_URL, format="json")
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == customer.email
    assert AccessToken(body["access"])["user_id"] == str(customer.pk)
    assert client.cookies[COOKIE].value != old_cookie
    # El refresh anterior queda en la lista negra.
    assert BlacklistedToken.objects.filter(token__token=old_cookie).exists()


@pytest.mark.django_db
def test_a_rotated_refresh_cannot_be_used_again_and_keeps_the_new_cookie(customer):
    client = _logged_in_client(customer)
    old_cookie = client.cookies[COOKIE].value
    client.post(REFRESH_URL, format="json")

    replay = csrf_client()
    replay.cookies[COOKIE] = old_cookie
    response = replay.post(REFRESH_URL, format="json")
    assert response.status_code == 401
    # Código propio: sin `navigator.locks`, el sitio reintenta una vez con la cookie nueva.
    assert response.json()["code"] == "session_rotated"
    # Otra pestaña pudo haberlo rotado: no se borra la cookie (sería la nueva).
    assert COOKIE not in response.cookies


@pytest.mark.django_db
def test_refresh_without_cookie_is_401():
    response = csrf_client().post(REFRESH_URL, format="json")
    assert response.status_code == 401
    assert response.json() == {"detail": "Tu sesión terminó. Vuelve a entrar.", "code": "session_expired"}


@pytest.mark.django_db
def test_a_tampered_refresh_is_rejected_and_its_cookie_deleted():
    client = csrf_client()
    client.cookies[COOKIE] = "no-es-un-token"
    response = client.post(REFRESH_URL, format="json")
    assert response.status_code == 401
    assert response.cookies[COOKIE].value == ""


@pytest.mark.django_db
def test_a_refresh_from_before_a_password_change_is_rejected_explicitly(customer):
    """Pendiente de D28: SimpleJWT lo renovaba aunque el access que entregaba ya no servía."""
    client = _logged_in_client(customer)
    old_cookie = client.cookies[COOKIE].value
    customer.set_password("otra-clave-de-pastel-77")
    customer.save()

    response = client.post(REFRESH_URL, format="json")
    assert response.status_code == 401
    assert response.cookies[COOKIE].value == ""
    assert BlacklistedToken.objects.filter(token__token=old_cookie).exists()


@pytest.mark.django_db
def test_refresh_of_a_deactivated_account_is_rejected(customer):
    client = _logged_in_client(customer)
    customer.is_active = False
    customer.save()
    assert client.post(REFRESH_URL, format="json").status_code == 401


@pytest.mark.django_db
def test_refresh_of_a_deleted_account_is_rejected(customer):
    client = _logged_in_client(customer)
    customer.delete()
    assert client.post(REFRESH_URL, format="json").status_code == 401


@pytest.mark.django_db
def test_an_access_token_is_not_accepted_as_refresh(customer):
    client = csrf_client()
    client.cookies[COOKIE] = str(RefreshToken.for_user(customer).access_token)
    assert client.post(REFRESH_URL, format="json").status_code == 401


# --- Salida ---


@pytest.mark.django_db
def test_logout_blacklists_the_refresh_and_deletes_the_cookie(customer):
    client = _logged_in_client(customer)
    cookie = client.cookies[COOKIE].value

    response = client.post(LOGOUT_URL, format="json")
    assert response.status_code == 204
    assert response.cookies[COOKIE].value == ""
    assert response.cookies[COOKIE]["path"] == "/api/v1/auth/"
    assert BlacklistedToken.objects.filter(token__token=cookie).exists()

    again = csrf_client()
    again.cookies[COOKIE] = cookie
    assert again.post(REFRESH_URL, format="json").status_code == 401


@pytest.mark.django_db
def test_logout_without_session_is_still_204():
    assert csrf_client().post(LOGOUT_URL, format="json").status_code == 204


# --- Pista de sesión para el navegador ---

HINT = "ilusion_session"


@pytest.mark.django_db
def test_a_session_also_sets_a_readable_hint_without_the_token(customer, settings):
    """El sitio solo pide `refresh` al cargar si esta pista existe: sin ella, un visitante no gasta peticiones."""
    settings.REFRESH_COOKIE_SECURE = True
    client = _logged_in_client(customer)
    hint = client.cookies[HINT]
    assert hint.value == "1"
    assert hint["httponly"] == ""
    assert hint["path"] == "/"
    assert hint["samesite"] == "Lax"
    assert hint["secure"] is True
    assert int(hint["max-age"]) == 7 * 24 * 3600


@pytest.mark.django_db
def test_logout_and_an_invalid_refresh_delete_the_hint(customer):
    client = _logged_in_client(customer)
    assert client.post(LOGOUT_URL, format="json").cookies[HINT].value == ""

    stale = csrf_client()
    stale.cookies[HINT] = "1"
    assert stale.post(REFRESH_URL, format="json").cookies[HINT].value == ""


# --- La sesión del sitio es solo de clientes ---


@pytest.mark.django_db
@pytest.mark.parametrize("privilege", [{"is_staff": True}, {"is_staff": True, "is_superuser": True}])
def test_staff_accounts_cannot_open_a_site_session(privilege):
    """El personal entra solo por el admin (con su bloqueo por IP); la API no le abre sesión ni confirma su contraseña."""
    staff = User.objects.create_user("personal@correo.test", PASSWORD, **privilege)
    response = csrf_client().post(LOGIN_URL, {"email": staff.email, "password": PASSWORD}, format="json")
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"
    assert COOKIE not in response.cookies


@pytest.mark.django_db
def test_a_staff_refresh_is_not_renewed():
    staff = User.objects.create_user("personal@correo.test", PASSWORD, is_staff=True)
    client = csrf_client()
    client.cookies[COOKIE] = str(RefreshToken.for_user(staff))
    assert client.post(REFRESH_URL, format="json").status_code == 401
