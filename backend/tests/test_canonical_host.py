"""Redirección 301 de www al dominio canónico."""
from urllib.parse import urlsplit

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.test import Client

CANONICAL = "pasteleriailusion.me"
HEROKU = "pasteleria-ilusion-0994ca356cbc.herokuapp.com"


@pytest.fixture
def canonical(settings):
    settings.ALLOWED_HOSTS = [CANONICAL, f"www.{CANONICAL}", HEROKU]
    settings.CANONICAL_HOST = CANONICAL


def _get(path, host):
    # Cliente nuevo: el middleware lee la configuración al construirse.
    return Client().get(path, HTTP_HOST=host)


def test_www_redirects_to_canonical_https_with_path_and_query(canonical):
    response = _get("/catalogo/tartas?pagina=2&q=fresa", f"www.{CANONICAL}")
    assert response.status_code == 301
    assert response["Location"] == f"https://{CANONICAL}/catalogo/tartas?pagina=2&q=fresa"


def test_www_root_redirects_to_canonical_root(canonical):
    response = _get("/", f"www.{CANONICAL}")
    assert (response.status_code, response["Location"]) == (301, f"https://{CANONICAL}/")


def test_www_host_is_case_insensitive(canonical):
    response = _get("/x", f"WWW.{CANONICAL.upper()}")
    assert (response.status_code, response["Location"]) == (301, f"https://{CANONICAL}/x")


def test_www_assets_are_redirected_too(canonical):
    response = _get("/assets/app-12345678.js", f"www.{CANONICAL}")
    assert response.status_code == 301
    assert response["Location"] == f"https://{CANONICAL}/assets/app-12345678.js"


def test_www_redirects_any_method(canonical):
    response = Client().post("/api/v1/algo", HTTP_HOST=f"www.{CANONICAL}")
    assert response.status_code == 301


def _assert_passes_through(response):
    assert "Location" not in response
    assert response.status_code not in (301, 400)


@pytest.mark.parametrize("host", [f"www.{CANONICAL}:443", f"www.{CANONICAL}."])
def test_www_with_port_or_trailing_dot_is_redirected(canonical, host):
    response = _get("/catalogo?q=1", host)
    assert response.status_code == 301
    assert response["Location"] == f"https://{CANONICAL}/catalogo?q=1"


@pytest.mark.parametrize(
    "path",
    [
        "//evil.com",
        "/" + chr(92) + "evil.com",
        "/%2F%2Fevil.com",
        "/@evil.com",
        "/x?next=%0d%0aSet-Cookie:a=b",
    ],
)
def test_hostile_paths_never_leave_the_canonical_host(canonical, path):
    # PATH_INFO directo: el cliente de pruebas interpretaría "//evil.com" como host.
    path_info, _, query = path.partition("?")
    response = Client().get(
        "/", HTTP_HOST=f"www.{CANONICAL}", PATH_INFO=path_info, QUERY_STRING=query
    )
    location = urlsplit(response["Location"])
    assert response.status_code == 301
    assert (location.scheme, location.netloc) == ("https", CANONICAL)
    assert response["Location"].startswith(f"https://{CANONICAL}/")


def test_canonical_host_passes_through(canonical):
    _assert_passes_through(_get("/no-existe", CANONICAL))


def test_herokuapp_host_passes_through(canonical):
    _assert_passes_through(_get("/no-existe", HEROKU))


def test_disallowed_host_is_rejected_not_redirected(canonical):
    response = _get("/", "www.otro-dominio.com")
    assert response.status_code == 400
    assert "Location" not in response


def test_without_canonical_host_nothing_is_redirected(settings):
    settings.ALLOWED_HOSTS = [f"www.{CANONICAL}"]
    settings.CANONICAL_HOST = ""
    _assert_passes_through(_get("/no-existe", f"www.{CANONICAL}"))


def test_canonical_host_is_empty_by_default(load_settings):
    assert load_settings().CANONICAL_HOST == ""


def test_canonical_host_is_read_and_normalized(load_settings):
    module = load_settings(
        ALLOWED_HOSTS=f"{CANONICAL},www.{CANONICAL}", CANONICAL_HOST=f" {CANONICAL.upper()} "
    )
    assert module.CANONICAL_HOST == CANONICAL


@pytest.mark.parametrize(
    "value",
    [
        f"https://{CANONICAL}",
        f"{CANONICAL}:8000",
        f"{CANONICAL}/ruta",
        "pasteleria ilusion.me",
        "-x.me",
        "a..me",
    ],
)
def test_invalid_canonical_host_does_not_start(load_settings, value):
    with pytest.raises(ImproperlyConfigured, match="CANONICAL_HOST"):
        load_settings(ALLOWED_HOSTS=f"{CANONICAL},localhost", CANONICAL_HOST=value)


def test_canonical_host_outside_allowed_hosts_does_not_start(load_settings):
    with pytest.raises(ImproperlyConfigured, match="ALLOWED_HOSTS"):
        load_settings(ALLOWED_HOSTS="localhost", CANONICAL_HOST=CANONICAL)


def test_allowed_hosts_without_www_does_not_start(load_settings):
    with pytest.raises(ImproperlyConfigured, match=f"www.{CANONICAL}"):
        load_settings(ALLOWED_HOSTS=CANONICAL, CANONICAL_HOST=CANONICAL)


@pytest.mark.parametrize("allowed", [f".{CANONICAL}", "*"])
def test_allowed_hosts_patterns_cover_canonical_and_www(load_settings, allowed):
    assert load_settings(ALLOWED_HOSTS=allowed, CANONICAL_HOST=CANONICAL).CANONICAL_HOST == CANONICAL


def test_middleware_goes_right_after_security_and_before_whitenoise(load_settings):
    middleware = load_settings().MIDDLEWARE
    assert middleware[:3] == [
        "django.middleware.security.SecurityMiddleware",
        "config.canonical.WwwRedirectMiddleware",
        "whitenoise.middleware.WhiteNoiseMiddleware",
    ]
