"""Acceso con Google (D62): verificación del ID token y cómo se liga con una cuenta existente.

Las pruebas no llaman a Google: sustituyen la verificación de la firma y prueban lo que el sitio
decide con las claims ya verificadas. `test_the_adapter_*` revisan lo que se le pide a google-auth.
"""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from google.auth import exceptions as google_exceptions
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from core_pasteleria.api.throttles import SecurityScopedRateThrottle
from core_pasteleria.services import google_identity

User = get_user_model()

GOOGLE_URL = "/api/v1/auth/google/"
CLIENT_ID = "1234567890-prueba.apps.googleusercontent.com"
COOKIE = "ilusion_refresh"
PASSWORD = "pastel-de-fresa-2026"


@pytest.fixture(autouse=True)
def google_settings(settings, monkeypatch):
    settings.GOOGLE_CLIENT_ID = CLIENT_ID
    settings.AXES_COOLOFF_TIME = timedelta(hours=1)
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}
    monkeypatch.setattr(
        SecurityScopedRateThrottle,
        "THROTTLE_RATES",
        {"login": "1000/min", "register": "1000/min", "session": "1000/min"},
    )


def claims(**overrides):
    return {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "110000000000000000001",
        "email": "ana@gmail.com",
        "email_verified": True,
        "name": "Ana López",
        **overrides,
    }


@pytest.fixture
def google_says(monkeypatch):
    """Hace que la verificación de Google devuelva estas claims (o lance este error)."""
    calls = []

    def set_result(result):
        def fake_verify(credential, client_id):
            calls.append((credential, client_id))
            if isinstance(result, Exception):
                raise result
            return result

        monkeypatch.setattr(google_identity, "verify_with_google", fake_verify)
        return calls

    return set_result


def google_login(credential="token-de-google"):
    client = APIClient(enforce_csrf_checks=True, REMOTE_ADDR="10.0.0.1")
    client.get("/api/v1/auth/csrf/")
    client.credentials(HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
    return client, client.post(GOOGLE_URL, {"credential": credential}, format="json")


@pytest.mark.django_db
def test_without_client_id_google_is_unavailable(settings, google_says):
    settings.GOOGLE_CLIENT_ID = ""
    calls = google_says(claims())
    _, response = google_login()
    assert response.status_code == 503
    assert response.json()["code"] == "google_disabled"
    assert calls == []


@pytest.mark.django_db
def test_a_new_google_account_is_created_without_password(google_says):
    calls = google_says(claims(email="Ana@Gmail.com"))
    client, response = google_login()

    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {"email": "ana@gmail.com", "full_name": "Ana López", "phone": None}
    assert body["password_removed"] is False
    user = User.objects.get()
    assert user.google_sub == "110000000000000000001"
    assert not user.has_usable_password()
    assert AccessToken(body["access"])["user_id"] == str(user.pk)
    assert client.cookies[COOKIE].value
    # La audiencia es nuestro client ID, nunca un valor que mande el navegador.
    assert calls == [("token-de-google", CLIENT_ID)]


@pytest.mark.django_db
def test_the_next_google_login_finds_the_account_by_sub_even_if_the_email_changed(google_says):
    google_says(claims())
    google_login()
    google_says(claims(email="ana.nueva@gmail.com", name="Otro nombre"))
    _, response = google_login()
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "ana@gmail.com"
    assert User.objects.count() == 1


@pytest.mark.django_db
def test_a_password_account_is_linked_and_its_unverified_password_removed(google_says):
    """Contra la cuenta pre-secuestrada: quien la registró con contraseña nunca probó que el correo era suyo."""
    user = User.objects.create_user("ana@gmail.com", PASSWORD, full_name="Ana")
    old_refresh = RefreshToken.for_user(user)
    old_access = str(old_refresh.access_token)
    google_says(claims())

    _, response = google_login()
    assert response.status_code == 200
    assert response.json()["password_removed"] is True
    user.refresh_from_db()
    assert user.google_sub == "110000000000000000001"
    assert not user.has_usable_password()
    assert user.full_name == "Ana"  # no se pisa el nombre que ya tenía
    # Las sesiones anteriores terminan: el refresh queda en la lista negra y el access deja de valer.
    assert BlacklistedToken.objects.filter(token__jti=old_refresh["jti"]).exists()
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
    assert api.get("/api/v1/schema/").status_code == 401


@pytest.mark.django_db
def test_a_workspace_email_is_also_linked(google_says):
    User.objects.create_user("ana@pasteleria.test", PASSWORD)
    google_says(claims(email="ana@pasteleria.test", hd="pasteleria.test"))
    _, response = google_login()
    assert response.status_code == 200
    assert response.json()["password_removed"] is True


@pytest.mark.django_db
def test_when_google_is_not_authoritative_for_the_email_it_is_not_linked(google_says):
    user = User.objects.create_user("ana@correo.test", PASSWORD)
    google_says(claims(email="ana@correo.test"))
    _, response = google_login()
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Ya hay una cuenta con este correo. Entra con tu correo y contraseña.",
        "code": "account_exists",
    }
    user.refresh_from_db()
    assert user.google_sub is None
    assert user.check_password(PASSWORD)


@pytest.mark.django_db
def test_a_non_gmail_address_can_still_create_a_new_account(google_says):
    google_says(claims(email="ana@correo.test"))
    _, response = google_login()
    assert response.status_code == 200
    assert User.objects.get().email == "ana@correo.test"


@pytest.mark.django_db
@pytest.mark.parametrize("privilege", [{"is_staff": True}, {"is_superuser": True, "is_staff": True}])
def test_a_staff_account_is_never_linked(google_says, privilege):
    staff = User.objects.create_user("duena@gmail.com", PASSWORD, **privilege)
    google_says(claims(email="duena@gmail.com"))
    _, response = google_login()
    assert response.status_code == 409
    assert response.json()["code"] == "account_exists"
    staff.refresh_from_db()
    assert staff.check_password(PASSWORD)
    assert staff.google_sub is None


@pytest.mark.django_db
def test_an_account_linked_to_another_google_account_is_a_conflict(google_says):
    User.objects.create_user("ana@gmail.com", None, google_sub="otro-sub")
    google_says(claims())
    _, response = google_login()
    assert response.status_code == 409
    assert response.json()["code"] == "google_conflict"


@pytest.mark.django_db
@pytest.mark.parametrize("linked", [True, False])
def test_an_inactive_account_cannot_enter_with_google(google_says, linked):
    User.objects.create_user(
        "ana@gmail.com", None, is_active=False, google_sub="110000000000000000001" if linked else None
    )
    google_says(claims())
    _, response = google_login()
    assert response.status_code == 403
    assert response.json()["code"] == "inactive"


@pytest.mark.django_db
@pytest.mark.parametrize("verified", [False, None, "true"])
def test_an_unverified_google_email_is_rejected(google_says, verified):
    google_says(claims(email_verified=verified))
    _, response = google_login()
    assert response.status_code == 400
    assert response.json()["code"] == "google_email_unverified"
    assert not User.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize("missing", ["sub", "email"])
def test_claims_without_sub_or_email_are_invalid(google_says, missing):
    data = claims()
    del data[missing]
    google_says(data)
    _, response = google_login()
    assert response.status_code == 400
    assert response.json()["code"] == "google_invalid"


@pytest.mark.django_db
def test_an_invalid_token_is_rejected(google_says):
    google_says(ValueError("Token expired"))
    _, response = google_login()
    assert response.status_code == 400
    assert response.json() == {
        "detail": "No pudimos confirmar tu cuenta de Google. Inténtalo de nuevo.",
        "code": "google_invalid",
    }


@pytest.mark.django_db
def test_when_google_cannot_be_reached_it_says_so(google_says):
    google_says(google_exceptions.TransportError("timeout"))
    _, response = google_login()
    assert response.status_code == 503
    assert response.json()["code"] == "google_unavailable"


@pytest.mark.django_db
@pytest.mark.parametrize("credential", ["", "x" * 5000])
def test_the_credential_has_bounds(google_says, credential):
    calls = google_says(claims())
    _, response = google_login(credential)
    assert response.status_code == 400
    assert calls == []


@pytest.mark.django_db
def test_google_shares_the_login_throttle(google_says, monkeypatch):
    monkeypatch.setattr(SecurityScopedRateThrottle, "THROTTLE_RATES", {"login": "2/hour", "session": "1000/min"})
    google_says(claims())
    google_login()
    google_login()
    _, response = google_login()
    assert response.status_code == 429


# --- El adaptador de google-auth ---


def test_the_adapter_checks_audience_and_uses_a_timeout(monkeypatch):
    received = {}

    def fake_verify_oauth2_token(token, request, audience=None, clock_skew_in_seconds=0):
        received.update(token=token, request=request, audience=audience, skew=clock_skew_in_seconds)
        return claims()

    monkeypatch.setattr(google_identity.id_token, "verify_oauth2_token", fake_verify_oauth2_token)
    assert google_identity.verify_with_google("abc", CLIENT_ID)["sub"] == "110000000000000000001"
    assert received["token"] == "abc"
    assert received["audience"] == CLIENT_ID
    assert 0 < received["skew"] <= 30
    assert received["request"].timeout == google_identity.GOOGLE_TIMEOUT_SECONDS
    assert google_identity.GOOGLE_TIMEOUT_SECONDS <= 10


def test_the_adapter_rejects_an_empty_audience():
    with pytest.raises(google_identity.GoogleSignInDisabled):
        google_identity.verify_credential("abc", client_id="")


@pytest.mark.parametrize(
    ("email", "extra", "authoritative"),
    [
        ("ana@gmail.com", {}, True),
        ("ana@googlemail.com", {}, True),
        ("ana@empresa.test", {"hd": "empresa.test"}, True),
        ("ana@correo.test", {}, False),
        ("ana@gmail.com.evil.test", {}, False),
    ],
)
def test_the_identity_knows_when_google_is_authoritative(monkeypatch, email, extra, authoritative):
    monkeypatch.setattr(google_identity, "verify_with_google", lambda credential, client_id: claims(email=email, **extra))
    identity = google_identity.verify_credential("abc", client_id=CLIENT_ID)
    assert identity.authoritative is authoritative


@pytest.mark.django_db
def test_a_google_account_promoted_to_staff_no_longer_opens_a_site_session(google_says):
    User.objects.create_user("ana@gmail.com", None, google_sub="110000000000000000001", is_staff=True)
    google_says(claims())
    _, response = google_login()
    assert response.status_code == 409
    assert response.json()["code"] == "account_exists"
