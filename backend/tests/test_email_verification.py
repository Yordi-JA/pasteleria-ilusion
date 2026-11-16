"""Confirmación del correo al registrarse (D76).

Registrarse con correo crea la cuenta sin confirmar y no abre sesión: llega un correo con un enlace a
`/verificar#<token>` que vence en 24 horas y sirve una sola vez. Al abrirlo, `POST auth/verify/` confirma la cuenta y
no abre sesión (revisión de D76): quien abre el enlace no queda dentro de esa cuenta, así un enlace ajeno no sirve para
meter a nadie en la cuenta de otro. Después se entra con la contraseña. Una cuenta sin confirmar no entra con su
contraseña. Reenviar el enlace responde siempre lo mismo. Todos los correos de la cuenta comparten un tope diario.
"""
import logging
import re
from datetime import datetime, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone
from rest_framework.throttling import SimpleRateThrottle

from core_pasteleria.api.throttles import SecurityScopedRateThrottle
from tests.test_auth_api import COOKIE, LOGIN_URL, PASSWORD, REGISTER_URL, csrf_client, register_payload
from tests.test_google_auth import CLIENT_ID, claims, google_login, google_says  # noqa: F401 - fixture de Google

User = get_user_model()

VERIFY_URL = "/api/v1/auth/verify/"
RESEND_URL = "/api/v1/auth/verify/resend/"
SITE = "https://pasteleriailusion.me"
LINK = re.compile(r"https://pasteleriailusion\.me/verificar#([A-Za-z0-9_.:-]+)")
RESEND_ANSWER = "Si tu cuenta está pendiente de confirmar, te enviamos otro enlace."
INVALID_LINK = {"detail": "Este enlace ya no sirve: venció, ya se usó o está incompleto.", "code": "invalid_link"}
UNVERIFIED = {
    "detail": "Confirma tu correo para entrar. Te enviamos un enlace al crear tu cuenta.",
    "code": "email_unverified",
}
RATES = {
    "login": "1000/min",
    "register": "1000/min",
    "session": "1000/min",
    "email_verify": "1000/min",
    "verify_resend_email": "1000/min",
    "verify_resend_ip": "1000/min",
}


@pytest.fixture(autouse=True)
def verification_settings(settings, monkeypatch):
    settings.EMAIL_ENABLED = True
    settings.SITE_URL = SITE
    settings.GOOGLE_CLIENT_ID = CLIENT_ID
    settings.AXES_FAILURE_LIMIT = 5
    settings.AXES_COOLOFF_TIME = timedelta(hours=1)
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}
    # Las tasas reales son por hora; aquí, altas, salvo en las pruebas de throttling.
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {**SimpleRateThrottle.THROTTLE_RATES, **RATES})
    monkeypatch.setattr(SecurityScopedRateThrottle, "THROTTLE_RATES", {**SimpleRateThrottle.THROTTLE_RATES, **RATES})


def register(django_capture_on_commit_callbacks, client=None, **overrides):
    client = client or csrf_client()
    with django_capture_on_commit_callbacks(execute=True):
        response = client.post(REGISTER_URL, register_payload(**overrides), format="json")
    return client, response


def link_token(message) -> str:
    match = LINK.search(message.body)
    assert match, message.body
    return match.group(1)


@pytest.fixture
def registered(db, django_capture_on_commit_callbacks):
    """Ana se registró: su cuenta sin confirmar y el token del correo que le llegó."""
    _, response = register(django_capture_on_commit_callbacks)
    assert response.status_code == 201, response.json()
    assert len(mail.outbox) == 1, "El registro no mandó el correo para confirmar la cuenta."
    return User.objects.get(email="ana@correo.test"), link_token(mail.outbox[0])


def verify(token, client=None):
    client = client or csrf_client()
    return client, client.post(VERIFY_URL, {"token": token}, format="json")


def resend(email, django_capture_on_commit_callbacks, ip="10.0.0.1"):
    with django_capture_on_commit_callbacks(execute=True):
        return csrf_client(ip).post(RESEND_URL, {"email": email}, format="json")


def travel(monkeypatch, generator_name, delta):
    """Mueve el reloj del generador de tokens (los tokens llevan su hora de emisión)."""
    from core_pasteleria.services import account_tokens

    generator = getattr(account_tokens, generator_name)
    monkeypatch.setattr(generator, "_now", lambda: datetime.now() + delta)


# --- Registro ---


@pytest.mark.django_db
def test_register_creates_the_account_unconfirmed_and_does_not_open_a_session(django_capture_on_commit_callbacks):
    client, response = register(django_capture_on_commit_callbacks, email=" Ana@Correo.TEST ")
    assert response.status_code == 201
    # Lo que `/verificar` necesita: a qué correo se mandó y en cuántas horas vence (el mockup: "Vence en [n] horas").
    assert response.json() == {"email": "ana@correo.test", "expires_in_hours": 24}
    assert COOKIE not in client.cookies
    assert "ilusion_session" not in client.cookies
    user = User.objects.get(email="ana@correo.test")
    assert user.email_verified_at is None
    assert user.check_password(PASSWORD)


@pytest.mark.django_db
def test_register_sends_the_confirmation_email_with_the_link_in_the_fragment(registered):
    user, token = registered
    message = mail.outbox[0]
    assert message.subject == "Confirma tu cuenta"
    assert message.to == [user.email]
    assert f"{SITE}/verificar#{token}" in message.body
    html, kind = message.alternatives[0]
    assert kind == "text/html"
    assert f"{SITE}/verificar#{token}" in html
    assert "24 horas" in message.body and "24 horas" in html
    # Ningún texto libre del cliente llega al correo (D70): el saludo es fijo.
    assert "Ana López García" not in message.body and "Ana López García" not in html


@pytest.mark.django_db
def test_an_email_that_already_has_an_account_still_says_so_and_sends_nothing(registered, django_capture_on_commit_callbacks):
    mail.outbox.clear()
    _, response = register(django_capture_on_commit_callbacks, email="ANA@correo.test")
    assert response.status_code == 400
    assert response.json()["codes"]["email"] == ["email_taken"]
    assert mail.outbox == []


# --- Confirmar ---


@pytest.mark.django_db
def test_the_link_confirms_the_account_without_opening_a_session(registered):
    """Contra el inicio de sesión forzado: el enlace confirma el correo, pero no mete a nadie en la cuenta."""
    user, token = registered
    client, response = verify(token)
    assert response.status_code == 200, response.json()
    assert response.json() == {"email_verified": True}
    assert COOKIE not in response.cookies and "ilusion_session" not in response.cookies
    assert COOKIE not in client.cookies
    user.refresh_from_db()
    assert user.email_verified_at is not None
    assert user.last_login is None


@pytest.mark.django_db
def test_confirming_another_account_keeps_the_session_the_browser_already_had(registered):
    """El enlace de otra cuenta no cierra ni cambia la sesión abierta en ese navegador."""
    _, token = registered
    carla = User.objects.create_user("carla@correo.test", PASSWORD, email_verified_at=timezone.now())
    client = csrf_client()
    assert client.post(LOGIN_URL, {"email": carla.email, "password": PASSWORD}, format="json").status_code == 200
    cookie = client.cookies[COOKIE].value

    _, response = verify(token, client)
    assert response.status_code == 200
    assert COOKIE not in response.cookies
    assert client.cookies[COOKIE].value == cookie
    renewed = client.post("/api/v1/auth/refresh/", format="json")
    assert renewed.status_code == 200
    assert renewed.json()["user"]["email"] == carla.email


@pytest.mark.django_db
def test_the_link_works_only_once(registered):
    _, token = registered
    assert verify(token)[1].status_code == 200
    _, again = verify(token)
    assert again.status_code == 400
    assert again.json() == INVALID_LINK
    assert COOKIE not in again.cookies


@pytest.mark.django_db
def test_the_link_expires_after_24_hours(registered, monkeypatch):
    user, token = registered
    travel(monkeypatch, "email_verification_tokens", timedelta(hours=24, minutes=1))
    _, response = verify(token)
    assert response.status_code == 400
    assert response.json() == INVALID_LINK
    user.refresh_from_db()
    assert user.email_verified_at is None


@pytest.mark.django_db
def test_the_link_still_works_just_before_24_hours(registered, monkeypatch):
    _, token = registered
    travel(monkeypatch, "email_verification_tokens", timedelta(hours=23, minutes=59))
    assert verify(token)[1].status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize("mangle", [lambda t: t[:-1] + ("0" if t[-1] != "0" else "1"), lambda t: "x" + t, lambda t: "", lambda t: "a.b-c", lambda t: "zz.1-2"])
def test_a_tampered_or_incomplete_link_is_rejected(registered, mangle):
    user, token = registered
    _, response = verify(mangle(token))
    assert response.status_code == 400
    assert response.json() == INVALID_LINK or "token" in response.json()
    user.refresh_from_db()
    assert user.email_verified_at is None


@pytest.mark.django_db
def test_a_password_reset_token_does_not_confirm_the_account(registered, django_capture_on_commit_callbacks):
    """Los dos enlaces se firman con sales distintas: uno no sirve en lugar del otro."""
    user, _ = registered
    from core_pasteleria.services import account_tokens

    reset_token = account_tokens.password_reset_tokens.make(user)
    _, response = verify(reset_token)
    assert response.status_code == 400
    assert response.json() == INVALID_LINK


@pytest.mark.django_db
def test_an_inactive_account_cannot_be_confirmed(registered):
    user, token = registered
    User.objects.filter(pk=user.pk).update(is_active=False)
    assert verify(token)[1].json() == INVALID_LINK


@pytest.mark.django_db
def test_confirming_requires_csrf(registered):
    _, token = registered
    from rest_framework.test import APIClient

    response = APIClient(enforce_csrf_checks=True).post(VERIFY_URL, {"token": token}, format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_confirming_is_throttled_per_ip(registered, monkeypatch):
    monkeypatch.setattr(SecurityScopedRateThrottle, "THROTTLE_RATES", {**RATES, "email_verify": "2/hour"})
    client = csrf_client()
    for _ in range(2):
        verify("no-sirve", client)
    assert verify(registered[1], client)[1].status_code == 429


# --- Iniciar sesión sin confirmar ---


@pytest.mark.django_db
def test_an_unconfirmed_account_with_the_right_password_is_told_to_confirm(registered):
    user, _ = registered
    response = csrf_client().post(LOGIN_URL, {"email": user.email, "password": PASSWORD}, format="json")
    assert response.status_code == 403
    assert response.json() == UNVERIFIED
    assert COOKIE not in response.cookies
    user.refresh_from_db()
    assert user.last_login is None


@pytest.mark.django_db
def test_an_unconfirmed_account_with_a_wrong_password_answers_like_any_wrong_password(registered):
    """No revela qué cuentas existen ni si están confirmadas."""
    user, _ = registered
    unconfirmed = csrf_client().post(LOGIN_URL, {"email": user.email, "password": "incorrecta"}, format="json")
    nobody = csrf_client().post(LOGIN_URL, {"email": "nadie@correo.test", "password": "incorrecta"}, format="json")
    assert unconfirmed.status_code == nobody.status_code == 401
    assert unconfirmed.json() == nobody.json() == {
        "detail": "El correo o la contraseña no coinciden.",
        "code": "invalid_credentials",
    }


# --- Tope diario de los correos de la cuenta ---


@pytest.mark.django_db
def test_the_daily_cap_counts_the_four_kinds_and_then_sends_nothing(settings, caplog, django_capture_on_commit_callbacks):
    """Rotar direcciones no agota la cuota del proveedor: al tope ya no sale ningún correo de la cuenta."""
    settings.ACCOUNT_EMAILS_DAILY_LIMIT = 4
    User.objects.create_user("gina@gmail.com", None, google_sub="sub-gina", email_verified_at=timezone.now())
    User.objects.create_user("carla@correo.test", PASSWORD, email_verified_at=timezone.now())
    register(django_capture_on_commit_callbacks)  # Confirma tu cuenta
    resend("ana@correo.test", django_capture_on_commit_callbacks)  # otro enlace
    with django_capture_on_commit_callbacks(execute=True):
        reset = csrf_client().post("/api/v1/auth/password/reset/", {"email": "carla@correo.test"}, format="json")
        google = csrf_client().post("/api/v1/auth/password/reset/", {"email": "gina@gmail.com"}, format="json")
    assert reset.status_code == google.status_code == 200
    assert [message.subject for message in mail.outbox] == [
        "Confirma tu cuenta",
        "Confirma tu cuenta",
        "Recupera tu contraseña",
        "Entra con Google",
    ]

    with caplog.at_level(logging.WARNING, logger="core_pasteleria.emails"):
        blocked = resend("ana@correo.test", django_capture_on_commit_callbacks)
    assert blocked.status_code == 200
    assert blocked.json() == {"detail": RESEND_ANSWER, "expires_in_hours": 24}
    assert len(mail.outbox) == 4
    warnings = [record for record in caplog.records if record.levelno == logging.WARNING]
    assert warnings, "Llegar al tope debe dejar un WARNING."
    text = " ".join(f"{record.getMessage()} {record.__dict__}" for record in warnings)
    assert "ana@correo.test" not in text and "#" not in text


@pytest.mark.django_db
def test_at_the_cap_registering_still_creates_the_account_and_answers_the_same(settings, django_capture_on_commit_callbacks):
    settings.ACCOUNT_EMAILS_DAILY_LIMIT = 1
    register(django_capture_on_commit_callbacks, email="primera@correo.test")
    _, response = register(django_capture_on_commit_callbacks, email="segunda@correo.test")
    assert response.status_code == 201
    assert response.json() == {"email": "segunda@correo.test", "expires_in_hours": 24}
    assert User.objects.filter(email="segunda@correo.test", email_verified_at__isnull=True).exists()
    assert [message.to for message in mail.outbox] == [["primera@correo.test"]]


def test_the_daily_cap_defaults_to_150_and_reads_the_environment(load_settings):
    assert load_settings().ACCOUNT_EMAILS_DAILY_LIMIT == 150
    assert load_settings(ACCOUNT_EMAILS_DAILY_LIMIT="40").ACCOUNT_EMAILS_DAILY_LIMIT == 40


def test_asking_for_links_is_limited_to_10_per_hour_per_ip(load_settings):
    rates = load_settings().REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    assert rates["register"] == rates["verify_resend_ip"] == rates["password_reset_ip"] == "10/hour"
    # Por correo, menos que por IP: un solo buzón no recibe más que lo que deja una conexión.
    assert rates["verify_resend_email"] == rates["password_reset_email"] == "5/hour"


@pytest.mark.django_db
def test_after_confirming_the_password_logs_in(registered):
    user, token = registered
    verify(token)
    response = csrf_client().post(LOGIN_URL, {"email": user.email, "password": PASSWORD}, format="json")
    assert response.status_code == 200


# --- Google ---


@pytest.mark.django_db
def test_a_new_google_account_is_born_confirmed(google_says):
    google_says(claims())
    assert google_login()[1].status_code == 200
    assert User.objects.get().email_verified_at is not None


@pytest.mark.django_db
def test_google_confirms_an_unconfirmed_password_account_it_links(google_says, django_capture_on_commit_callbacks):
    _, response = register(django_capture_on_commit_callbacks, email="ana@gmail.com")
    assert response.status_code == 201
    google_says(claims())
    _, response = google_login()
    assert response.status_code == 200
    assert response.json()["password_removed"] is True
    user = User.objects.get(email="ana@gmail.com")
    assert user.email_verified_at is not None
    assert user.google_sub == "110000000000000000001"


# --- Reenviar el enlace ---


@pytest.mark.django_db
def test_resend_mails_a_new_link_to_an_unconfirmed_account(registered, django_capture_on_commit_callbacks):
    user, _ = registered
    mail.outbox.clear()
    response = resend(" ANA@correo.test ", django_capture_on_commit_callbacks)
    assert response.status_code == 200
    assert response.json() == {"detail": RESEND_ANSWER, "expires_in_hours": 24}
    assert [message.to for message in mail.outbox] == [[user.email]]
    assert verify(link_token(mail.outbox[0]))[1].status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize("who", ["nobody", "confirmed", "staff", "inactive", "google"])
def test_resend_answers_the_same_and_sends_nothing_otherwise(who, registered, django_capture_on_commit_callbacks):
    user, token = registered
    email = {"nobody": "nadie@correo.test"}.get(who, user.email)
    if who == "confirmed":
        verify(token)
    elif who == "staff":
        User.objects.filter(pk=user.pk).update(is_staff=True)
    elif who == "inactive":
        User.objects.filter(pk=user.pk).update(is_active=False)
    elif who == "google":
        email = "gina@gmail.com"
        User.objects.create_user(email, None, google_sub="sub-gina", email_verified_at=timezone.now())
    mail.outbox.clear()
    response = resend(email, django_capture_on_commit_callbacks)
    assert response.status_code == 200
    assert response.json() == {"detail": RESEND_ANSWER, "expires_in_hours": 24}
    assert mail.outbox == []


@pytest.mark.django_db
def test_resend_validates_the_email_format(db):
    response = csrf_client().post(RESEND_URL, {"email": "no-es-correo"}, format="json")
    assert response.status_code == 400
    assert "email" in response.json()


@pytest.mark.django_db
def test_resend_is_throttled_per_email_across_ips(registered, monkeypatch, django_capture_on_commit_callbacks):
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {**RATES, "verify_resend_email": "2/hour"})
    for ip in ("10.0.0.1", "10.0.0.2"):
        assert resend("ana@correo.test", django_capture_on_commit_callbacks, ip=ip).status_code == 200
    blocked = resend("ANA@correo.test", django_capture_on_commit_callbacks, ip="10.0.0.3")
    assert blocked.status_code == 429
    assert int(blocked["Retry-After"]) > 0
    # Otro correo tiene su propio contador.
    assert resend("otra@correo.test", django_capture_on_commit_callbacks, ip="10.0.0.3").status_code == 200


@pytest.mark.django_db
def test_resend_is_throttled_per_ip_across_emails(db, monkeypatch, django_capture_on_commit_callbacks):
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {**RATES, "verify_resend_ip": "2/hour"})
    for number in range(2):
        assert resend(f"nadie{number}@correo.test", django_capture_on_commit_callbacks).status_code == 200
    assert resend("nadie9@correo.test", django_capture_on_commit_callbacks).status_code == 429
    assert resend("nadie9@correo.test", django_capture_on_commit_callbacks, ip="10.0.0.9").status_code == 200


@pytest.mark.django_db
def test_resend_requires_csrf(db):
    from rest_framework.test import APIClient

    response = APIClient(enforce_csrf_checks=True).post(RESEND_URL, {"email": "ana@correo.test"}, format="json")
    assert response.status_code == 403


# --- Sin el token ni el correo en los registros ---


@pytest.mark.django_db
def test_the_logs_never_carry_the_token_or_the_email(caplog, django_capture_on_commit_callbacks):
    with caplog.at_level(logging.INFO):
        _, response = register(django_capture_on_commit_callbacks)
        token = link_token(mail.outbox[0])
        resend("ana@correo.test", django_capture_on_commit_callbacks)
        verify(token)
    text = "\n".join(f"{record.getMessage()} {record.__dict__}" for record in caplog.records)
    assert token not in text
    assert "ana@correo.test" not in text
    user = User.objects.get(email="ana@correo.test")
    verified = [r for r in caplog.records if r.name == "core_pasteleria.audit" and "verify_email" in r.getMessage()]
    assert verified and verified[-1].result == "ok" and verified[-1].user_id == user.pk


# --- Admin y migración ---


@pytest.mark.django_db
def test_the_user_admin_shows_when_the_email_was_confirmed_read_only(client, registered):
    user, token = registered
    verify(token)
    client.force_login(User.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123"))
    html = client.get(f"/admin/core_pasteleria/user/{user.pk}/change/").content.decode()
    assert "Correo confirmado" in html
    assert 'name="email_verified_at' not in html


@pytest.mark.django_db
def test_the_migration_confirms_the_accounts_that_already_existed():
    """Las cuentas de antes ya entraban: la migración las marca confirmadas, con la hora de la migración."""
    assert "email_verified_at" in [field.name for field in User._meta.get_fields()]
    import importlib

    from django.apps import apps

    migration = importlib.import_module("core_pasteleria.migrations.0043_user_email_verified_at")
    old = User.objects.create_user("antes@correo.test", PASSWORD)
    earlier = timezone.now() - timedelta(days=3)
    kept = User.objects.create_user("ya@correo.test", PASSWORD, email_verified_at=earlier)
    migration.confirm_existing_accounts(apps, None)
    old.refresh_from_db()
    kept.refresh_from_db()
    assert old.email_verified_at is not None
    assert kept.email_verified_at == earlier


@pytest.mark.django_db
def test_the_link_is_checked_again_under_the_lock(registered, monkeypatch):
    """Dos peticiones con el mismo enlace: la que llega con la cuenta ya confirmada en la base no abre otra sesión."""
    from core_pasteleria.repositories import user_repo
    from core_pasteleria.services import account_link_service

    user, token = registered
    stale = User.objects.get(pk=user.pk)
    User.objects.filter(pk=user.pk).update(email_verified_at=timezone.now())
    monkeypatch.setattr(user_repo, "get_by_id", lambda user_id: stale)
    with pytest.raises(account_link_service.InvalidLink):
        account_link_service.verify_email(token)
