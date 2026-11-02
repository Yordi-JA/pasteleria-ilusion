"""Bloqueo del inicio de sesión del admin por intentos fallidos (django-axes)."""
from datetime import timedelta

import pytest
from axes.helpers import get_client_ip_address
from axes.models import AccessAttempt
from django.contrib.auth import authenticate, get_user_model
from django.test import Client, RequestFactory
from django.utils import timezone

from config.security import normalized_username

LOGIN_URL = "/admin/login/"
PASSWORD = "clave-correcta-segura-123"


@pytest.fixture(autouse=True)
def lockout_settings(settings):
    # Valores fijos para no depender del .env local ni de las variables de entorno.
    settings.AXES_FAILURE_LIMIT = 5
    settings.AXES_COOLOFF_TIME = timedelta(hours=1)
    # Sin proxy: se ignora X-Forwarded-For.
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}


@pytest.fixture
def staff(db):
    return get_user_model().objects.create_user(
        "personal@pasteleria.test", PASSWORD, is_staff=True, is_superuser=True
    )


@pytest.fixture
def other_staff(db):
    return get_user_model().objects.create_user(
        "otro@pasteleria.test", PASSWORD, is_staff=True, is_superuser=True
    )


def _login(email, password, ip="10.0.0.1", forwarded_for=None, client=None):
    client = client or Client()
    extra = {"REMOTE_ADDR": ip}
    if forwarded_for:
        extra["HTTP_X_FORWARDED_FOR"] = forwarded_for
    response = client.post(LOGIN_URL, {"username": email, "password": password}, **extra)
    return client, response


def _is_logged_in(client):
    return "_auth_user_id" in client.session


def _fail(email, times, **kwargs):
    """Intentos con contraseña incorrecta (el quinto ya devuelve 429)."""
    for _ in range(times):
        _login(email, "incorrecta", **kwargs)


def test_correct_login_works_below_the_limit(staff):
    _, response = _login(staff.email, "incorrecta")
    assert response.status_code == 200  # el formulario vuelve a mostrarse
    _fail(staff.email, 3)
    client, response = _login(staff.email, PASSWORD)
    assert response.status_code == 302
    assert _is_logged_in(client)


def test_sixth_attempt_is_rejected_even_with_the_right_password(staff):
    _fail(staff.email, 4)
    # El quinto fallo ya activa el bloqueo.
    _, fifth = _login(staff.email, "incorrecta")
    assert fifth.status_code == 429

    client, response = _login(staff.email, PASSWORD)
    assert response.status_code == 429
    assert not _is_logged_in(client)
    assert "Demasiados intentos fallidos" in response.content.decode()


def test_the_lockout_response_says_how_long_to_wait(staff):
    _fail(staff.email, 5)
    _, response = _login(staff.email, PASSWORD)
    assert response.status_code == 429
    assert response["Retry-After"] == "3600"


def test_a_forged_x_forwarded_for_does_not_restart_the_counter(staff):
    for number in range(5):
        _login(staff.email, "incorrecta", forwarded_for=f"203.0.113.{number}")
    client, response = _login(staff.email, PASSWORD, forwarded_for="198.51.100.77")
    assert response.status_code == 429
    assert not _is_logged_in(client)


def test_the_client_ip_ignores_x_forwarded_for_without_proxies():
    request = RequestFactory().get(
        LOGIN_URL, REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="1.1.1.1, 2.2.2.2"
    )
    assert get_client_ip_address(request) == "10.0.0.1"


def test_the_client_ip_is_the_one_the_proxy_added(settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
    request = RequestFactory().get(
        LOGIN_URL, REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="falsa, 9.9.9.9"
    )
    assert get_client_ip_address(request) == "9.9.9.9"


@pytest.mark.parametrize("forwarded_for", ["no-es-una-ip", "1.1.1.1, 999.1.1.1", "9.9.9.9:443"])
def test_an_invalid_ip_falls_back_to_the_connection_address(settings, forwarded_for):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
    request = RequestFactory().get(
        LOGIN_URL, REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR=forwarded_for
    )
    assert get_client_ip_address(request) == "10.0.0.1"


def test_an_invalid_forwarded_ip_does_not_break_the_login(settings, staff):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
    _, response = _login(staff.email, "incorrecta", forwarded_for="no-es-una-ip")
    assert response.status_code == 200  # no es un 500
    assert AccessAttempt.objects.get().ip_address == "10.0.0.1"


def test_failures_are_recorded_with_the_real_ip_not_the_forged_one(staff):
    _login(staff.email, "incorrecta", ip="10.0.0.1", forwarded_for="1.2.3.4")
    assert AccessAttempt.objects.get().ip_address == "10.0.0.1"


def test_email_case_does_not_split_the_counter(staff):
    for email in ["PERSONAL@pasteleria.test", "Personal@Pasteleria.Test"]:
        _fail(email, 2)
    _, fifth = _login(" personal@PASTELERIA.test ", "incorrecta")
    assert fifth.status_code == 429
    assert set(AccessAttempt.objects.values_list("username", flat=True)) == {staff.email}


def test_a_locked_email_is_not_locked_from_another_ip(staff):
    _fail(staff.email, 5, ip="10.0.0.1")
    _, locked = _login(staff.email, PASSWORD, ip="10.0.0.1")
    assert locked.status_code == 429

    client, response = _login(staff.email, PASSWORD, ip="10.0.0.2")
    assert response.status_code == 302
    assert _is_logged_in(client)


def test_five_failures_from_one_ip_with_different_emails_lock_that_ip(staff, other_staff):
    for number in range(5):
        _login(f"nadie{number}@pasteleria.test", "incorrecta", ip="10.0.0.1")
    # Ni siquiera una cuenta real, con su contraseña correcta, entra desde esa IP.
    for account in (staff, other_staff):
        client, response = _login(account.email, PASSWORD, ip="10.0.0.1")
        assert response.status_code == 429
        assert not _is_logged_in(client)


def test_another_ip_can_still_log_in_while_an_ip_is_locked(staff, other_staff):
    for number in range(5):
        _login(f"nadie{number}@pasteleria.test", "incorrecta", ip="10.0.0.1")
    client, response = _login(staff.email, PASSWORD, ip="10.0.0.2")
    assert response.status_code == 302
    assert _is_logged_in(client)


def test_a_successful_login_does_not_erase_previous_failures(staff):
    _fail(staff.email, 3)
    client, response = _login(staff.email, PASSWORD)
    assert response.status_code == 302
    assert _is_logged_in(client)
    assert AccessAttempt.objects.get().failures_since_start == 3

    # Los fallos siguen contando: dos más completan los cinco de la IP.
    _fail(staff.email, 2)
    _, response = _login(staff.email, PASSWORD)
    assert response.status_code == 429


def test_a_valid_login_does_not_reset_the_failures_against_another_account(staff, other_staff):
    # Quien tiene cuenta no puede reiniciar el contador de su IP entre ataques
    # a la cuenta de otra persona.
    _fail(staff.email, 4, ip="10.0.0.1")
    client, response = _login(other_staff.email, PASSWORD, ip="10.0.0.1")
    assert response.status_code == 302
    assert _is_logged_in(client)

    _, response = _login(staff.email, "incorrecta", ip="10.0.0.1")
    assert response.status_code == 429
    victim_client, response = _login(staff.email, PASSWORD, ip="10.0.0.1")
    assert response.status_code == 429
    assert not _is_logged_in(victim_client)


@pytest.mark.parametrize("value", [123, ["a@pasteleria.test"], {"a": 1}, b"a@pasteleria.test"])
def test_a_non_string_username_is_none_not_an_error(value, db):
    request = RequestFactory().post("/")
    assert normalized_username(request, {"email": value}) is None
    assert normalized_username(request, {"username": value}) is None


def test_username_is_none_when_there_is_no_email(db):
    request = RequestFactory().post("/")
    assert normalized_username(request, {}) is None
    assert normalized_username(request, None) is None
    assert normalized_username(request, {"email": "  "}) is None
    assert normalized_username(request, {"email": " Ana@X.com "}) == "ana@x.com"


def test_attempts_during_the_lockout_do_not_extend_it(staff):
    _fail(staff.email, 5)
    attempt = AccessAttempt.objects.get()
    recorded_at, failures = attempt.attempt_time, attempt.failures_since_start

    for _ in range(3):
        _, response = _login(staff.email, "incorrecta")
        assert response.status_code == 429
    attempt.refresh_from_db()
    assert attempt.attempt_time == recorded_at
    assert attempt.failures_since_start == failures

    # Pasada la hora desde el último fallo registrado, vuelve a entrar.
    AccessAttempt.objects.update(attempt_time=timezone.now() - timedelta(minutes=61))
    client, response = _login(staff.email, PASSWORD)
    assert response.status_code == 302
    assert _is_logged_in(client)


def test_authenticate_by_email_keyword_counts_per_email_not_globally(staff, other_staff):
    # El inicio de sesión de la API llama a authenticate(email=...), sin `username`.
    def attempt(email, password, ip):
        request = RequestFactory().post("/", REMOTE_ADDR=ip)
        return authenticate(request, email=email, password=password)

    for _ in range(5):
        assert attempt(staff.email, "incorrecta", "10.0.0.1") is None
    assert set(AccessAttempt.objects.values_list("username", flat=True)) == {staff.email}

    # Otro correo desde otra IP no queda bloqueado.
    assert attempt(other_staff.email, PASSWORD, "10.0.0.2") == other_staff
    # Y el correo bloqueado tampoco lo está desde otra IP.
    assert attempt(staff.email, PASSWORD, "10.0.0.2") == staff
    # Pero sí desde la IP bloqueada.
    assert attempt(staff.email, PASSWORD, "10.0.0.1") is None
