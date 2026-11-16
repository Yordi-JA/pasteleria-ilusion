"""Correcciones de seguridad del acceso (ronda 1 de revisión de D62)."""
import threading
from datetime import timedelta

import pytest
from axes.models import AccessAttempt
from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection
from django.test import RequestFactory
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from config import security
from core_pasteleria.api.throttles import SecurityScopedRateThrottle
from core_pasteleria.repositories import user_repo
from core_pasteleria.services import auth_service, google_identity

User = get_user_model()

LOGIN_URL = "/api/v1/auth/login/"
REFRESH_URL = "/api/v1/auth/refresh/"
GOOGLE_URL = "/api/v1/auth/google/"
COOKIE = "ilusion_refresh"
PASSWORD = "pastel-de-fresa-2026"
CLIENT_ID = "1234567890-prueba.apps.googleusercontent.com"


@pytest.fixture(autouse=True)
def hardening_settings(settings, monkeypatch):
    settings.AXES_FAILURE_LIMIT = 5
    settings.AXES_COOLOFF_TIME = timedelta(hours=1)
    settings.GOOGLE_CLIENT_ID = CLIENT_ID
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}
    monkeypatch.setattr(
        SecurityScopedRateThrottle,
        "THROTTLE_RATES",
        {"login": "1000/min", "register": "1000/min", "session": "1000/min"},
    )


def csrf_client(ip="10.0.0.1"):
    client = APIClient(enforce_csrf_checks=True, REMOTE_ADDR=ip)
    client.get("/api/v1/auth/csrf/")
    client.credentials(HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
    return client


def api_login(email, password, ip="10.0.0.1", client=None):
    client = client or csrf_client(ip)
    return client.post(LOGIN_URL, {"email": email, "password": password}, format="json")


@pytest.fixture
def staff(db):
    return User.objects.create_user("personal@correo.test", PASSWORD, is_staff=True)


@pytest.fixture
def customer(db):
    # Con el correo confirmado (D76): una cuenta sin confirmar no entra con su contraseña.
    return User.objects.create_user("cliente@correo.test", PASSWORD, email_verified_at=timezone.now())


# --- 1. La API no verifica la contraseña del personal y cuenta el intento como fallo ---


def test_four_failures_and_the_right_staff_password_lock_like_five_failures(staff):
    for _ in range(4):
        assert api_login(staff.email, "incorrecta").status_code == 401
    response = api_login(staff.email, PASSWORD)
    assert response.status_code == 429
    assert response.json()["code"] == "locked_out"


def test_five_right_staff_passwords_by_the_api_end_in_a_lockout(staff):
    statuses = [api_login(staff.email, PASSWORD).status_code for _ in range(5)]
    assert statuses == [401, 401, 401, 401, 429]
    assert AccessAttempt.objects.get().failures_since_start == 5


def test_the_staff_password_is_never_checked_by_the_api(staff, monkeypatch):
    checked = []
    original = User.check_password
    monkeypatch.setattr(User, "check_password", lambda self, raw: checked.append(self.email) or original(self, raw))
    assert api_login(staff.email, PASSWORD).status_code == 401
    assert checked == []


def test_a_staff_lockout_still_answers_429_before_anything_else(staff):
    for _ in range(5):
        api_login(staff.email, "incorrecta")
    assert api_login(staff.email, PASSWORD).status_code == 429


# --- 4 y 5. Rotación atómica y "otra pestaña la rotó" solo por 60 s ---


def test_a_refresh_used_twice_is_rotated_once(customer):
    raw = str(RefreshToken.for_user(customer))
    auth_service.renew_session(raw)
    with pytest.raises(auth_service.SessionExpired) as error:
        auth_service.renew_session(raw)
    assert error.value.keep_cookie is True


def test_a_refresh_blacklisted_more_than_a_minute_ago_deletes_the_cookie(customer):
    refresh = RefreshToken.for_user(customer)
    refresh.blacklist()
    BlacklistedToken.objects.update(blacklisted_at=timezone.now() - timedelta(seconds=61))
    client = csrf_client()
    client.cookies[COOKIE] = str(refresh)
    response = client.post(REFRESH_URL, format="json")
    assert response.status_code == 401
    assert response.cookies[COOKIE].value == ""
    assert response.cookies["ilusion_session"].value == ""


@pytest.mark.django_db(transaction=True)
def test_two_simultaneous_renewals_of_one_refresh_give_one_session(customer):
    raw = str(RefreshToken.for_user(customer))
    results = []
    barrier = threading.Barrier(2)

    def renew():
        try:
            barrier.wait()
            auth_service.renew_session(raw)
            results.append("ok")
        except auth_service.SessionExpired:
            results.append("expired")
        finally:
            connection.close()

    threads = [threading.Thread(target=renew) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results) == ["expired", "ok"]


# --- 7. Entrar otra vez pone en la lista negra el refresh anterior de la cookie ---


def test_logging_in_again_blacklists_the_previous_cookie(customer):
    client = csrf_client()
    api_login(customer.email, PASSWORD, client=client)
    old = client.cookies[COOKIE].value
    assert api_login(customer.email, PASSWORD, client=client).status_code == 200
    assert BlacklistedToken.objects.filter(token__token=old).exists()
    assert client.cookies[COOKIE].value != old


# --- 8. Ligar Google y cerrar las sesiones van juntos ---


def test_linking_google_is_undone_if_revoking_the_sessions_fails(customer, monkeypatch):
    RefreshToken.for_user(customer)

    def broken(*args, **kwargs):
        raise IntegrityError("falla de prueba")

    monkeypatch.setattr(BlacklistedToken.objects, "bulk_create", broken)
    with pytest.raises(IntegrityError):
        user_repo.link_google(customer, sub="sub-1", full_name="", remove_password=True)
    customer.refresh_from_db()
    assert customer.google_sub is None
    assert customer.check_password(PASSWORD)


def test_linking_google_revokes_every_outstanding_refresh(customer):
    tokens = [RefreshToken.for_user(customer) for _ in range(3)]
    tokens[0].blacklist()
    user_repo.link_google(customer, sub="sub-1", full_name="", remove_password=True)
    assert BlacklistedToken.objects.count() == 3
    assert OutstandingToken.objects.filter(user=customer, blacklistedtoken__isnull=True).count() == 0


# --- 9. Solo el choque del correo (o de la cuenta de Google) es "correo con cuenta" ---


def test_another_integrity_error_is_not_reported_as_a_taken_email(db):
    with pytest.raises(IntegrityError):
        user_repo.create_customer(email="ana@correo.test", password=PASSWORD, full_name="Ana", phone="551234567")


def test_a_duplicate_email_or_google_account_is_a_taken_email(customer):
    with pytest.raises(user_repo.EmailTakenError):
        user_repo.create_customer(email=customer.email, password=PASSWORD, full_name="Otra")
    User.objects.create_user("g@correo.test", None, google_sub="sub-9")
    with pytest.raises(user_repo.EmailTakenError):
        user_repo.create_customer(email="h@correo.test", password=None, full_name="", google_sub="sub-9")


# --- 13. Google Workspace solo responde por correos de su dominio; el nombre se limpia ---


def google_claims(**overrides):
    return {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "110000000000000000001",
        "email": "ana@gmail.com",
        "email_verified": True,
        "name": "Ana López",
        **overrides,
    }


@pytest.mark.parametrize(
    ("email", "hd", "authoritative"),
    [
        ("ana@pasteleria.test", "pasteleria.test", True),
        ("ana@ventas.pasteleria.test", "pasteleria.test", True),
        ("ana@otro.test", "pasteleria.test", False),
        ("ana@mipasteleria.test", "pasteleria.test", False),
    ],
)
def test_hd_only_vouches_for_its_own_domain(monkeypatch, email, hd, authoritative):
    monkeypatch.setattr(google_identity, "verify_with_google", lambda credential, client_id: google_claims(email=email, hd=hd))
    assert google_identity.verify_credential("abc", client_id=CLIENT_ID).authoritative is authoritative


def test_an_account_whose_email_is_outside_the_hd_domain_is_not_linked(db, monkeypatch):
    User.objects.create_user("ana@otro.test", PASSWORD)
    monkeypatch.setattr(google_identity, "verify_with_google", lambda credential, client_id: google_claims(email="ana@otro.test", hd="pasteleria.test"))
    response = csrf_client().post(GOOGLE_URL, {"credential": "x"}, format="json")
    assert response.status_code == 409
    assert response.json()["code"] == "account_exists"


def test_the_google_name_loses_control_and_format_characters(monkeypatch):
    monkeypatch.setattr(
        google_identity, "verify_with_google", lambda credential, client_id: google_claims(name="Ana‮\u0000 López​")
    )
    assert google_identity.verify_credential("abc", client_id=CLIENT_ID).name == "Ana López"


# --- 14. IPv6 se agrupa por /64 ---


@pytest.mark.parametrize(
    ("raw", "grouped"),
    [
        ("10.0.0.1", "10.0.0.1"),
        ("2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:db8:1:2::"),
        ("2001:db8:1:2::1", "2001:db8:1:2::"),
        ("::ffff:10.0.0.7", "10.0.0.7"),
        ("no-es-una-ip", "no-es-una-ip"),
    ],
)
def test_group_ip_keeps_ipv4_and_takes_the_ipv6_slash_64(raw, grouped):
    assert security.group_ip(raw) == grouped


def test_the_lockout_ip_groups_ipv6_by_slash_64(settings):
    request = RequestFactory().post("/", REMOTE_ADDR="2001:db8:1:2:aaaa::1")
    assert security.client_ip(request) == "2001:db8:1:2::"


def test_the_security_throttle_counts_a_whole_ipv6_slash_64_together(customer, monkeypatch):
    monkeypatch.setattr(SecurityScopedRateThrottle, "THROTTLE_RATES", {"login": "2/hour", "session": "1000/min"})
    assert api_login(customer.email, "incorrecta", ip="2001:db8:1:2::1").status_code == 401
    assert api_login(customer.email, "incorrecta", ip="2001:db8:1:2::2").status_code == 401
    assert api_login(customer.email, PASSWORD, ip="2001:db8:1:2::3").status_code == 429
    # Otra /64 tiene su propio contador.
    assert api_login(customer.email, PASSWORD, ip="2001:db8:1:3::1").status_code == 200
