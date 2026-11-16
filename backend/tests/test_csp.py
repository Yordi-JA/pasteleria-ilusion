"""Content-Security-Policy del sitio y de la API (pendiente de D28, cerrado en D62)."""
import pytest
from django.test import Client

from config.csp import API_POLICY, SITE_POLICY, add_whitenoise_csp


def directives(policy):
    return {part.split()[0]: part.split()[1:] for part in (p.strip() for p in policy.split(";")) if part}


@pytest.fixture
def built_index(settings, tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>x</title>", encoding="utf-8")
    settings.FRONTEND_DIST = tmp_path


def test_the_site_policy_allows_only_our_origin_google_identity_services_and_stripe_js():
    policy = directives(SITE_POLICY)
    assert policy["default-src"] == ["'self'"]
    # Stripe.js (D68, pago con tarjeta): su script, sus iframes (los campos y la verificación 3D Secure de
    # `hooks.stripe.com`) y su API. Es la lista de Stripe para Stripe.js, sin Google Maps (no se usa el Address Element).
    assert policy["script-src"] == ["'self'", "https://accounts.google.com/gsi/client", "https://js.stripe.com", "https://*.js.stripe.com"]
    assert policy["style-src"] == ["'self'", "https://accounts.google.com/gsi/style"]
    assert policy["frame-src"] == [
        "https://accounts.google.com/gsi/",
        "https://js.stripe.com",
        "https://*.js.stripe.com",
        "https://hooks.stripe.com",
    ]
    # La vista previa usa imágenes locales (`blob:`) y la duya, SVG en `data:`.
    assert policy["img-src"] == ["'self'", "data:", "blob:"]
    assert policy["connect-src"] == ["'self'", "blob:", "https://accounts.google.com/gsi/", "https://api.stripe.com"]
    assert policy["object-src"] == ["'none'"]
    assert policy["base-uri"] == ["'none'"]
    assert policy["frame-ancestors"] == ["'none'"]
    assert policy["form-action"] == ["'self'"]


def test_no_directive_allows_inline_code_or_eval():
    for policy in (SITE_POLICY, API_POLICY):
        assert "unsafe-inline" not in policy
        assert "unsafe-eval" not in policy
        assert "*" not in policy.replace("*.", "")


def test_the_api_policy_forbids_everything():
    assert directives(API_POLICY) == {"default-src": ["'none'"], "frame-ancestors": ["'none'"]}


def test_the_spa_index_carries_the_site_policy(client, built_index):
    response = client.get("/entrar")
    assert response.status_code == 200
    assert response["Content-Security-Policy"] == SITE_POLICY


def test_api_responses_carry_the_api_policy(client):
    response = client.get("/api/v1/no-existe/")
    assert response["Content-Security-Policy"] == API_POLICY


@pytest.mark.django_db
def test_api_json_responses_carry_the_api_policy(client):
    response = client.get("/api/v1/auth/csrf/")
    assert response["Content-Security-Policy"] == API_POLICY


@pytest.mark.parametrize("path", ["/admin/login/", "/api/v1/docs/"])
@pytest.mark.django_db
def test_the_admin_and_swagger_keep_their_inline_code_without_this_policy(client, path):
    # Swagger UI y el admin traen código en línea: quedan fuera hasta que tengan su propia política.
    assert "Content-Security-Policy" not in client.get(path)


def test_whitenoise_html_gets_the_site_policy_and_assets_do_not_need_it():
    headers = {}
    add_whitenoise_csp(headers, "/x/index.html", "/index.html")
    assert headers["Content-Security-Policy"] == SITE_POLICY
    asset_headers = {}
    add_whitenoise_csp(asset_headers, "/x/a.js", "/assets/a.js")
    assert "Content-Security-Policy" not in asset_headers


def test_google_popups_keep_their_opener_and_get_our_origin(client, built_index):
    """Google Identity Services pide `same-origin-allow-popups` y un `Referer` con el origen."""
    response = client.get("/entrar")
    assert response["Cross-Origin-Opener-Policy"] == "same-origin-allow-popups"
    assert response["Referrer-Policy"] == "strict-origin-when-cross-origin"
