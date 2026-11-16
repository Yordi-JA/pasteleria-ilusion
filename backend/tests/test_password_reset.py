"""Recuperar la contraseña (D76): `POST auth/password/reset/` y `POST auth/password/reset/confirm/`.

Pedir el enlace responde siempre lo mismo, exista o no la cuenta. Una cuenta de cliente activa con contraseña recibe un
enlace a `/recuperar#<token>` que vence en 1 hora y sirve una vez; una cuenta solo de Google, un correo que le dice que
entre con Google; el personal y los correos sin cuenta, nada. El correo sale fuera de la petición, para que la respuesta
no tarde más cuando la cuenta existe.
"""
import logging
import re
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from core_pasteleria.api.throttles import SecurityScopedRateThrottle
from tests.test_auth_api import COOKIE, LOGIN_URL, PASSWORD, csrf_client
from tests.test_email_verification import travel

User = get_user_model()

RESET_URL = "/api/v1/auth/password/reset/"
CONFIRM_URL = "/api/v1/auth/password/reset/confirm/"
SITE = "https://pasteleriailusion.me"
LINK = re.compile(r"https://pasteleriailusion\.me/recuperar#([A-Za-z0-9_.:-]+)")
NEW_PASSWORD = "merengue-de-limon-77"
ANSWER = {
    "detail": "Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva.",
    "expires_in_hours": 1,
}
INVALID_LINK = {"detail": "Este enlace ya no sirve: venció, ya se usó o está incompleto.", "code": "invalid_link"}
RATES = {
    "login": "1000/min",
    "register": "1000/min",
    "session": "1000/min",
    "password_reset_email": "1000/min",
    "password_reset_ip": "1000/min",
    "password_reset_confirm": "1000/min",
}


@pytest.fixture(autouse=True)
def reset_settings(settings, monkeypatch):
    settings.EMAIL_ENABLED = True
    settings.SITE_URL = SITE
    settings.AXES_FAILURE_LIMIT = 5
    settings.AXES_COOLOFF_TIME = timedelta(hours=1)
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {**SimpleRateThrottle.THROTTLE_RATES, **RATES})
    monkeypatch.setattr(SecurityScopedRateThrottle, "THROTTLE_RATES", {**SimpleRateThrottle.THROTTLE_RATES, **RATES})


@pytest.fixture
def customer(db):
    return User.objects.create_user(
        "carla@correo.test", PASSWORD, full_name="Carla Ruiz", email_verified_at=timezone.now()
    )


def ask(email, django_capture_on_commit_callbacks, ip="10.0.0.1"):
    with django_capture_on_commit_callbacks(execute=True):
        return csrf_client(ip).post(RESET_URL, {"email": email}, format="json")


def reset_token(customer, django_capture_on_commit_callbacks) -> str:
    response = ask(customer.email, django_capture_on_commit_callbacks)
    assert response.status_code == 200, response.content
    assert len(mail.outbox) == 1, "No llegó el correo con el enlace."
    match = LINK.search(mail.outbox[0].body)
    assert match, mail.outbox[0].body
    return match.group(1)


def confirm(token, password=NEW_PASSWORD, client=None):
    client = client or csrf_client()
    return client, client.post(CONFIRM_URL, {"token": token, "new_password": password}, format="json")


# --- Pedir el enlace ---


@pytest.mark.django_db
def test_a_customer_gets_a_one_hour_link_in_the_fragment(customer, django_capture_on_commit_callbacks):
    response = ask(" CARLA@correo.test ", django_capture_on_commit_callbacks)
    assert response.status_code == 200
    assert response.json() == ANSWER
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.subject == "Recupera tu contraseña"
    assert message.to == [customer.email]
    token = LINK.search(message.body).group(1)
    html, kind = message.alternatives[0]
    assert kind == "text/html" and f"{SITE}/recuperar#{token}" in html
    assert "1 hora" in message.body and "1 hora" in html
    assert "Carla" not in message.body


@pytest.mark.django_db
@pytest.mark.parametrize("who", ["nobody", "staff", "superuser", "inactive", "no_password"])
def test_everyone_else_gets_the_same_answer_and_no_email(who, customer, django_capture_on_commit_callbacks):
    email = customer.email
    if who == "nobody":
        email = "nadie@correo.test"
    elif who == "staff":
        User.objects.filter(pk=customer.pk).update(is_staff=True)
    elif who == "superuser":
        User.objects.filter(pk=customer.pk).update(is_staff=True, is_superuser=True)
    elif who == "inactive":
        User.objects.filter(pk=customer.pk).update(is_active=False)
    elif who == "no_password":
        customer.set_unusable_password()
        customer.save()
    response = ask(email, django_capture_on_commit_callbacks)
    assert response.status_code == 200
    assert response.json() == ANSWER
    assert mail.outbox == []


@pytest.mark.django_db
def test_a_google_only_account_is_told_to_use_google(db, django_capture_on_commit_callbacks):
    User.objects.create_user("gina@gmail.com", None, google_sub="sub-gina", email_verified_at=timezone.now())
    response = ask("gina@gmail.com", django_capture_on_commit_callbacks)
    assert response.json() == ANSWER
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.subject == "Entra con Google"
    assert "Continuar con Google" in message.body
    assert f"{SITE}/entrar" in message.body
    assert "/recuperar#" not in message.body


@pytest.mark.django_db
def test_an_unconfirmed_account_can_also_recover_its_password(customer, django_capture_on_commit_callbacks):
    User.objects.filter(pk=customer.pk).update(email_verified_at=None)
    token = reset_token(customer, django_capture_on_commit_callbacks)
    _, response = confirm(token)
    assert response.status_code == 200
    customer.refresh_from_db()
    # El enlace prueba que controla el correo.
    assert customer.email_verified_at is not None


@pytest.mark.django_db
def test_asking_validates_the_email_format(db):
    response = csrf_client().post(RESET_URL, {"email": "no-es-correo"}, format="json")
    assert response.status_code == 400
    assert "email" in response.json()


@pytest.mark.django_db
def test_asking_requires_csrf(db):
    response = APIClient(enforce_csrf_checks=True).post(RESET_URL, {"email": "a@b.test"}, format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_asking_is_throttled_per_email_across_ips(customer, monkeypatch, django_capture_on_commit_callbacks):
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {**RATES, "password_reset_email": "2/hour"})
    for ip in ("10.0.0.1", "10.0.0.2"):
        assert ask(customer.email, django_capture_on_commit_callbacks, ip=ip).status_code == 200
    blocked = ask("Carla@correo.test", django_capture_on_commit_callbacks, ip="10.0.0.3")
    assert blocked.status_code == 429
    assert int(blocked["Retry-After"]) > 0
    assert ask("otra@correo.test", django_capture_on_commit_callbacks, ip="10.0.0.3").status_code == 200


@pytest.mark.django_db
def test_asking_is_throttled_per_ip_across_emails(db, monkeypatch, django_capture_on_commit_callbacks):
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {**RATES, "password_reset_ip": "2/hour"})
    for number in range(2):
        assert ask(f"nadie{number}@correo.test", django_capture_on_commit_callbacks).status_code == 200
    assert ask("nadie9@correo.test", django_capture_on_commit_callbacks).status_code == 429
    assert ask("nadie9@correo.test", django_capture_on_commit_callbacks, ip="10.0.0.9").status_code == 200


@pytest.mark.django_db
def test_the_email_is_sent_outside_the_request_so_timing_does_not_tell(
    customer, settings, monkeypatch, django_capture_on_commit_callbacks
):
    """Con el envío en segundo plano, la petición no espera al SMTP: tarda lo mismo exista o no la cuenta."""
    settings.EMAIL_SEND_IN_BACKGROUND = True
    started = []

    class HeldThread:
        """Guarda el hilo sin arrancarlo, para ver qué pasa antes de que corra."""

        def __init__(self, target, name=None, daemon=None):
            self.target, self.daemon = target, daemon

        def start(self):
            started.append(self)

    from core_pasteleria.services import email_service

    real_thread = email_service.threading.Thread
    monkeypatch.setattr(email_service.threading, "Thread", HeldThread)
    with django_capture_on_commit_callbacks(execute=True):
        response = csrf_client().post(RESET_URL, {"email": customer.email}, format="json")
        nobody = csrf_client().post(RESET_URL, {"email": "nadie@correo.test"}, format="json")
    assert response.status_code == nobody.status_code == 200
    # La respuesta salió sin mandar nada todavía: solo hay un hilo esperando, y nada para el correo sin cuenta.
    assert mail.outbox == []
    assert len(started) == 1 and started[0].daemon is True
    # El hilo de verdad arma y manda el correo con su propia conexión a la base, y la cierra al terminar.
    worker = real_thread(target=started[0].target)
    worker.start()
    worker.join(timeout=10)
    assert len(mail.outbox) == 1 and mail.outbox[0].to == [customer.email]


# --- Crear la contraseña nueva ---


@pytest.mark.django_db
def test_the_link_sets_the_password_closes_every_session_and_opens_a_new_one(customer, django_capture_on_commit_callbacks):
    old_refresh = RefreshToken.for_user(customer)
    old_access = str(old_refresh.access_token)
    token = reset_token(customer, django_capture_on_commit_callbacks)

    client, response = confirm(token)
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["user"]["email"] == customer.email
    assert AccessToken(body["access"])["user_id"] == str(customer.pk)
    assert client.cookies[COOKIE].value
    customer.refresh_from_db()
    assert customer.check_password(NEW_PASSWORD) and not customer.check_password(PASSWORD)
    # Las sesiones de antes terminaron.
    assert BlacklistedToken.objects.filter(token__jti=old_refresh["jti"]).exists()
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
    assert api.get("/api/v1/account/").status_code == 401
    # Solo queda viva la sesión nueva.
    alive = OutstandingToken.objects.filter(user=customer, blacklistedtoken__isnull=True)
    assert list(alive.values_list("token", flat=True)) == [client.cookies[COOKIE].value]
    # Y la contraseña nueva entra.
    login = csrf_client().post(LOGIN_URL, {"email": customer.email, "password": NEW_PASSWORD}, format="json")
    assert login.status_code == 200


@pytest.mark.django_db
def test_the_link_works_only_once(customer, django_capture_on_commit_callbacks):
    token = reset_token(customer, django_capture_on_commit_callbacks)
    assert confirm(token)[1].status_code == 200
    _, again = confirm(token, password="otra-clave-de-pastel-88")
    assert again.status_code == 400
    assert again.json() == INVALID_LINK
    customer.refresh_from_db()
    assert customer.check_password(NEW_PASSWORD)


@pytest.mark.django_db
def test_the_link_expires_after_one_hour(customer, monkeypatch, django_capture_on_commit_callbacks):
    token = reset_token(customer, django_capture_on_commit_callbacks)
    travel(monkeypatch, "password_reset_tokens", timedelta(hours=1, minutes=1))
    _, response = confirm(token)
    assert response.json() == INVALID_LINK
    customer.refresh_from_db()
    assert customer.check_password(PASSWORD)


@pytest.mark.django_db
def test_changing_the_password_another_way_breaks_the_link(customer, django_capture_on_commit_callbacks):
    token = reset_token(customer, django_capture_on_commit_callbacks)
    customer.set_password("cambiada-por-otro-lado-5")
    customer.save()
    assert confirm(token)[1].json() == INVALID_LINK


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("password", "message", "code"),
    [
        ("corta", "Te faltan caracteres: el mínimo es 8.", "password_too_short"),
        ("password123", "Esa contraseña es muy común. Elige otra.", "password_too_common"),
        ("carla@correo.test", "Se parece mucho a tu correo o a tu nombre. Elige otra.", "password_too_similar"),
    ],
)
def test_the_new_password_follows_the_registration_rules_and_keeps_the_link(
    customer, password, message, code, django_capture_on_commit_callbacks
):
    token = reset_token(customer, django_capture_on_commit_callbacks)
    _, response = confirm(token, password=password)
    assert response.status_code == 400
    assert message in response.json()["new_password"]
    assert code in response.json()["codes"]["new_password"]
    assert COOKIE not in response.cookies
    # El enlace sigue sirviendo para intentarlo otra vez.
    assert confirm(token)[1].status_code == 200


@pytest.mark.django_db
def test_a_verification_token_does_not_reset_the_password(customer):
    from core_pasteleria.services import account_tokens

    User.objects.filter(pk=customer.pk).update(email_verified_at=None)
    customer.refresh_from_db()
    token = account_tokens.email_verification_tokens.make(customer)
    assert confirm(token)[1].json() == INVALID_LINK


@pytest.mark.django_db
def test_a_staff_account_cannot_use_a_reset_link(staff_user):
    from core_pasteleria.services import account_tokens

    token = account_tokens.password_reset_tokens.make(staff_user)
    assert confirm(token)[1].json() == INVALID_LINK


@pytest.mark.django_db
def test_confirming_requires_csrf(db):
    response = APIClient(enforce_csrf_checks=True).post(CONFIRM_URL, {"token": "x", "new_password": NEW_PASSWORD}, format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_confirming_is_throttled_per_ip(customer, monkeypatch, django_capture_on_commit_callbacks):
    token = reset_token(customer, django_capture_on_commit_callbacks)
    monkeypatch.setattr(SecurityScopedRateThrottle, "THROTTLE_RATES", {**RATES, "password_reset_confirm": "2/hour"})
    client = csrf_client()
    for _ in range(2):
        confirm("no-sirve", client=client)
    assert confirm(token, client=client)[1].status_code == 429


@pytest.mark.django_db
def test_the_logs_never_carry_the_token_or_the_email(customer, caplog, django_capture_on_commit_callbacks):
    with caplog.at_level(logging.INFO):
        token = reset_token(customer, django_capture_on_commit_callbacks)
        ask("nadie@correo.test", django_capture_on_commit_callbacks)
        confirm(token)
    text = "\n".join(f"{record.getMessage()} {record.__dict__}" for record in caplog.records)
    assert token not in text
    assert customer.email not in text and "nadie@correo.test" not in text
    done = [r for r in caplog.records if r.name == "core_pasteleria.audit" and "reset_password" in r.getMessage()]
    assert done and done[-1].result == "ok" and done[-1].user_id == customer.pk


@pytest.mark.django_db
def test_the_link_is_checked_again_under_the_lock(customer, monkeypatch, django_capture_on_commit_callbacks):
    """Otra petición usó el enlace mientras tanto: con la fila bloqueada ya no vale y no cambia nada."""
    from core_pasteleria.repositories import user_repo
    from core_pasteleria.services import account_link_service

    token = reset_token(customer, django_capture_on_commit_callbacks)
    stale = User.objects.get(pk=customer.pk)
    User.objects.filter(pk=customer.pk).update(password=User.objects.get(pk=customer.pk).password + "x")
    monkeypatch.setattr(user_repo, "get_by_id", lambda user_id: stale)
    with pytest.raises(account_link_service.InvalidLink):
        account_link_service.reset_password(token, new_password=NEW_PASSWORD)
    assert not User.objects.get(pk=customer.pk).check_password(NEW_PASSWORD)
