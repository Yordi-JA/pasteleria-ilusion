"""Fixtures compartidas de las pruebas."""
import importlib
import importlib.util
from pathlib import Path

import environ
import pytest
from django.apps import apps
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _test_environment(settings):
    # Con DEBUG apagado, la configuración exige HTTPS y redirigiría todas las
    # peticiones del cliente de pruebas (que usa http).
    settings.SECURE_SSL_REDIRECT = False
    # Hash rápido: el real (PBKDF2) vuelve lentas las pruebas.
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    # En producción la caché es de base de datos (se prueba aparte); aquí, en
    # memoria, para no exigir la tabla ni acceso a la base en cada prueba. Los
    # contadores del throttling no deben filtrarse entre pruebas.
    settings.CACHES = {
        "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
    }
    cache.clear()


@pytest.fixture
def staff_user(db, django_user_model):
    """Usuario de personal (is_staff), sin ser superusuario."""
    return django_user_model.objects.create_user(
        "personal@pasteleria.test", "clave-de-prueba-123", is_staff=True
    )


@pytest.fixture
def customer_user(db, django_user_model):
    """Cliente de la tienda (no personal)."""
    return django_user_model.objects.create_user(
        "cliente@pasteleria.test", "clave-de-prueba-123"
    )


SETTINGS_PATH = Path(__file__).resolve().parent.parent / "config" / "settings.py"

VALID_ENV = {
    "SECRET_KEY": "clave-de-prueba-" + "x" * 40,
    "ALLOWED_HOSTS": "localhost",
    "DATABASE_URL": "postgres://usuario:clave@localhost:5432/base",
    "NUM_PROXIES": "0",
}
OPTIONAL_VARS = [
    "DEBUG",
    "CORS_ALLOWED_ORIGINS",
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    "SECURE_HSTS_PRELOAD",
    "NUM_PROXIES",
    "AXES_FAILURE_LIMIT",
    "AXES_COOLOFF_MINUTES",
]


@pytest.fixture
def load_settings(monkeypatch):
    """Evalúa config/settings.py en aislamiento y con un entorno controlado.

    Anula la lectura de `.env` para que solo cuente el entorno que se pasa;
    `None` borra la variable.
    """
    monkeypatch.setattr(environ.Env, "read_env", staticmethod(lambda *a, **k: None))

    def load(**env_vars):
        full_env = {**VALID_ENV, **env_vars}
        for name in [*full_env, *OPTIONAL_VARS]:
            monkeypatch.delenv(name, raising=False)
        for name, value in full_env.items():
            if value is not None:
                monkeypatch.setenv(name, value)
        spec = importlib.util.spec_from_file_location("settings_aislado", SETTINGS_PATH)
        settings_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(settings_module)
        return settings_module

    return load


# --- La semilla sobrevive a las pruebas transaccionales ---

# Las pruebas con hilos (`transaction=True`) necesitan filas confirmadas, y al
# terminar pytest-django vacía todas las tablas, semilla incluida. Las migraciones
# de datos usan `get_or_create`, así que basta volver a correrlas: la base queda
# como recién migrada y ninguna prueba depende del orden en que se ejecuten.
#
# Toda migración de datos nueva debe agregarse a `SEED_MIGRATIONS` (una prueba de
# `test_seed_migrations.py` falla si falta alguna). Y ninguna prueba debe fijar
# ids a mano: las secuencias de la base no se reinician, así que cambian.
SEED_MIGRATIONS = [
    ("0003_seed_settings", "seed_settings"),
    ("0005_seed_cake_options", "seed_cake_options"),
    ("0007_seed_stands_and_delivery", "seed_stands_and_delivery"),
    ("0009_seed_catalog", "seed_catalog"),
]
_db_blocker = None


@pytest.fixture(scope="session", autouse=True)
def _remember_db_blocker(django_db_blocker):
    global _db_blocker
    _db_blocker = django_db_blocker
    yield
    _db_blocker = None


def _is_transactional(item):
    marker = item.get_closest_marker("django_db")
    uses_marker = marker is not None and marker.kwargs.get("transaction", False)
    return uses_marker or "transactional_db" in getattr(item, "fixturenames", ())


@pytest.hookimpl(trylast=True)
def pytest_runtest_teardown(item, nextitem):
    """Vuelve a sembrar justo después de que pytest-django vació las tablas."""
    if not _is_transactional(item):
        return
    with _db_blocker.unblock():
        for module_name, function_name in SEED_MIGRATIONS:
            module = importlib.import_module(f"core_pasteleria.migrations.{module_name}")
            getattr(module, function_name)(apps, None)
