"""Configuración de Django: lo que debe fallar, lo que debe quedar activo."""
from datetime import timedelta

import pytest
from django.core.exceptions import ImproperlyConfigured
from rest_framework_simplejwt.settings import api_settings as jwt_settings

def test_valid_environment_loads(load_settings):
    assert load_settings().ALLOWED_HOSTS == ["localhost"]


def test_without_secret_key_it_does_not_start(load_settings):
    with pytest.raises(ImproperlyConfigured, match="SECRET_KEY"):
        load_settings(SECRET_KEY=None)


def test_with_empty_secret_key_it_does_not_start(load_settings):
    with pytest.raises(ImproperlyConfigured, match="SECRET_KEY"):
        load_settings(SECRET_KEY="")


def test_without_allowed_hosts_it_does_not_start(load_settings):
    with pytest.raises(ImproperlyConfigured, match="ALLOWED_HOSTS"):
        load_settings(ALLOWED_HOSTS=None)


def test_with_empty_allowed_hosts_it_does_not_start(load_settings):
    with pytest.raises(ImproperlyConfigured, match="ALLOWED_HOSTS"):
        load_settings(ALLOWED_HOSTS="")


def test_without_database_url_it_does_not_start(load_settings):
    with pytest.raises(ImproperlyConfigured, match="DATABASE_URL"):
        load_settings(DATABASE_URL=None)


def test_database_url_configures_postgresql(load_settings):
    database = load_settings().DATABASES["default"]
    assert database["ENGINE"] == "django.db.backends.postgresql"
    assert (database["NAME"], database["USER"], database["HOST"], database["PORT"]) == (
        "base", "usuario", "localhost", 5432,
    )


def test_hosts_are_read_as_a_list(load_settings):
    settings_module = load_settings(ALLOWED_HOSTS="www.ejemplo.com, api.ejemplo.com")
    assert settings_module.ALLOWED_HOSTS == ["www.ejemplo.com", "api.ejemplo.com"]


def test_debug_is_false_by_default(load_settings):
    assert load_settings().DEBUG is False


def test_debug_turns_on_only_if_the_environment_says_so(load_settings):
    assert load_settings(DEBUG="True").DEBUG is True


def test_production_enables_ssl_hsts_and_secure_cookies(load_settings):
    settings_module = load_settings()
    assert settings_module.SECURE_SSL_REDIRECT is True
    assert settings_module.SECURE_HSTS_SECONDS >= 31536000
    assert settings_module.SESSION_COOKIE_SECURE is True
    assert settings_module.CSRF_COOKIE_SECURE is True


def test_hsts_subdomains_and_preload_are_optional_and_off_by_default(load_settings):
    settings_module = load_settings()
    assert settings_module.SECURE_HSTS_INCLUDE_SUBDOMAINS is False
    assert settings_module.SECURE_HSTS_PRELOAD is False


def test_hsts_subdomains_and_preload_turn_on_with_the_environment(load_settings):
    settings_module = load_settings(
        SECURE_HSTS_INCLUDE_SUBDOMAINS="True", SECURE_HSTS_PRELOAD="True"
    )
    assert settings_module.SECURE_HSTS_INCLUDE_SUBDOMAINS is True
    assert settings_module.SECURE_HSTS_PRELOAD is True


def test_development_does_not_force_https(load_settings):
    settings_module = load_settings(DEBUG="True")
    assert not getattr(settings_module, "SECURE_SSL_REDIRECT", False)
    assert not getattr(settings_module, "SESSION_COOKIE_SECURE", False)
    assert not getattr(settings_module, "CSRF_COOKIE_SECURE", False)


def test_cors_uses_only_the_environment_origins(load_settings):
    origins = "https://www.ejemplo.com,https://otro.ejemplo.com"
    settings_module = load_settings(CORS_ALLOWED_ORIGINS=origins)
    expected = origins.split(",")
    assert settings_module.CORS_ALLOWED_ORIGINS == expected
    assert settings_module.CSRF_TRUSTED_ORIGINS == expected
    assert settings_module.CORS_ALLOW_CREDENTIALS is True
    assert not getattr(settings_module, "CORS_ALLOW_ALL_ORIGINS", False)


def test_origins_ignore_spaces_and_empty_items(load_settings):
    settings_module = load_settings(CORS_ALLOWED_ORIGINS="https://a.com, https://b.com,")
    assert settings_module.CORS_ALLOWED_ORIGINS == ["https://a.com", "https://b.com"]


def test_production_rejects_non_https_origins(load_settings):
    with pytest.raises(ImproperlyConfigured, match="https"):
        load_settings(CORS_ALLOWED_ORIGINS="https://a.com,http://b.com")


def test_development_accepts_http_origins(load_settings):
    settings_module = load_settings(DEBUG="True", CORS_ALLOWED_ORIGINS="http://localhost:5173")
    assert settings_module.CORS_ALLOWED_ORIGINS == ["http://localhost:5173"]


def test_without_origins_in_the_environment_cors_allows_none(load_settings):
    settings_module = load_settings()
    assert settings_module.CORS_ALLOWED_ORIGINS == []
    assert settings_module.CSRF_TRUSTED_ORIGINS == []


def test_time_zone_and_language(settings):
    assert settings.TIME_ZONE == "America/Mexico_City"
    assert settings.USE_TZ is True
    assert settings.LANGUAGE_CODE == "es-mx"


def test_jwt_has_short_access_rotation_and_blacklist(settings):
    assert "rest_framework_simplejwt.token_blacklist" in settings.INSTALLED_APPS
    minutes = jwt_settings.ACCESS_TOKEN_LIFETIME.total_seconds() / 60
    assert 5 <= minutes <= 15
    assert jwt_settings.ROTATE_REFRESH_TOKENS is True
    assert jwt_settings.BLACKLIST_AFTER_ROTATION is True


def test_argon2_is_the_main_hasher(load_settings):
    hashers = load_settings().PASSWORD_HASHERS
    assert hashers[0] == "django.contrib.auth.hashers.Argon2PasswordHasher"
    assert "django.contrib.auth.hashers.PBKDF2PasswordHasher" in hashers


def test_num_proxies_is_read_from_the_environment(load_settings):
    assert load_settings(NUM_PROXIES="1").REST_FRAMEWORK["NUM_PROXIES"] == 1
    assert load_settings(NUM_PROXIES="0").REST_FRAMEWORK["NUM_PROXIES"] == 0


def test_num_proxies_is_required_in_production(load_settings):
    with pytest.raises(ImproperlyConfigured, match="NUM_PROXIES"):
        load_settings(NUM_PROXIES=None)


def test_num_proxies_defaults_to_zero_in_development(load_settings):
    settings_module = load_settings(DEBUG="True", NUM_PROXIES=None)
    assert settings_module.REST_FRAMEWORK["NUM_PROXIES"] == 0


@pytest.mark.parametrize("value", ["", "uno"])
def test_num_proxies_must_be_an_integer(load_settings, value):
    with pytest.raises(ImproperlyConfigured, match="NUM_PROXIES"):
        load_settings(NUM_PROXIES=value)


@pytest.mark.parametrize("debug", [None, "True"])
def test_negative_num_proxies_is_rejected_in_any_environment(load_settings, debug):
    with pytest.raises(ImproperlyConfigured, match="NUM_PROXIES"):
        load_settings(DEBUG=debug, NUM_PROXIES="-1")


@pytest.mark.parametrize("debug", [None, "True"])
def test_proxy_ssl_header_is_trusted_only_with_at_least_one_proxy(load_settings, debug):
    behind_proxy = load_settings(DEBUG=debug, NUM_PROXIES="1")
    assert behind_proxy.SECURE_PROXY_SSL_HEADER == ("HTTP_X_FORWARDED_PROTO", "https")
    no_proxy = load_settings(DEBUG=debug, NUM_PROXIES="0")
    assert not hasattr(no_proxy, "SECURE_PROXY_SSL_HEADER")


def test_axes_defaults(load_settings):
    module = load_settings()
    assert module.AXES_FAILURE_LIMIT == 5
    assert module.AXES_COOLOFF_TIME == timedelta(hours=1)
    assert module.AXES_LOCKOUT_PARAMETERS == [["ip_address", "username"], "ip_address"]
    assert module.AXES_RESET_COOL_OFF_ON_FAILURE_DURING_LOCKOUT is False
    assert module.AXES_ENABLE_RETRY_AFTER_HEADER is True
    assert module.AUTHENTICATION_BACKENDS[0] == "axes.backends.AxesStandaloneBackend"
    assert module.MIDDLEWARE[-1] == "axes.middleware.AxesMiddleware"
    assert "axes" in module.INSTALLED_APPS


def test_axes_limits_come_from_the_environment(load_settings):
    module = load_settings(AXES_FAILURE_LIMIT="3", AXES_COOLOFF_MINUTES="15")
    assert module.AXES_FAILURE_LIMIT == 3
    assert module.AXES_COOLOFF_TIME == timedelta(minutes=15)


@pytest.mark.parametrize(
    "env_vars",
    [
        {"AXES_FAILURE_LIMIT": "0"},
        {"AXES_COOLOFF_MINUTES": "0"},
        {"AXES_FAILURE_LIMIT": "-3"},
    ],
)
def test_axes_limits_must_be_positive(load_settings, env_vars):
    with pytest.raises(ImproperlyConfigured, match="AXES"):
        load_settings(**env_vars)


def test_cache_is_a_shared_database_cache(load_settings):
    default = load_settings().CACHES["default"]
    assert default["BACKEND"] == "django.core.cache.backends.db.DatabaseCache"
    assert default["LOCATION"] == "django_cache"


@pytest.mark.django_db
def test_database_cache_works_with_the_createcachetable_table(settings, load_settings):
    from django.core.cache import cache
    from django.core.management import call_command

    settings.CACHES = load_settings().CACHES
    call_command("createcachetable")
    call_command("createcachetable")  # es idempotente: se corre en cada release
    cache.set("contador", 2, 60)
    assert cache.get("contador") == 2
    assert cache.incr("contador") == 3


def test_whitenoise_goes_right_after_security_middleware(settings):
    middleware = settings.MIDDLEWARE
    assert middleware.index("whitenoise.middleware.WhiteNoiseMiddleware") == (
        middleware.index("django.middleware.security.SecurityMiddleware") + 1
    )


def test_static_files_are_collected_into_staticfiles(settings):
    assert settings.STATIC_ROOT.name == "staticfiles"
    assert settings.FRONTEND_DIST.parts[-2:] == ("frontend", "dist")


def test_drf_paginates_and_throttles_by_default(settings):
    drf = settings.REST_FRAMEWORK
    assert drf["PAGE_SIZE"]
    assert drf["DEFAULT_PAGINATION_CLASS"]
    assert drf["DEFAULT_THROTTLE_CLASSES"]
    assert {"anon", "user"} <= set(drf["DEFAULT_THROTTLE_RATES"])


@pytest.mark.django_db
def test_tests_run_against_postgresql(django_db_blocker):
    from django.db import connection

    assert connection.vendor == "postgresql"


def test_no_migrations_are_missing(db):
    from django.core.management import call_command

    call_command("makemigrations", "--check", "--dry-run")


@pytest.mark.parametrize("name", ["AXES_FAILURE_LIMIT", "AXES_COOLOFF_MINUTES"])
@pytest.mark.parametrize("value", ["", "cinco", "1.5"])
def test_axes_limits_must_be_integers(load_settings, name, value):
    with pytest.raises(ImproperlyConfigured, match=f"{name} debe ser un número entero"):
        load_settings(**{name: value})
