"""Fixtures compartidas de las pruebas."""
import importlib
import importlib.util
from pathlib import Path

import environ
import pytest
from django.apps import apps
from django.core.cache import cache, caches


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
        "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
        # Contadores de los throttles de seguridad (acceso, pedidos e imágenes), aparte de los públicos.
        "security": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "security",
        },
    }
    cache.clear()
    caches["security"].clear()


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
    "JWT_SIGNING_KEY": "llave-jwt-de-prueba-" + "y" * 40,
}
OPTIONAL_VARS = [
    "GOOGLE_CLIENT_ID",
    "POSTGRES_TEST_DB",
    "DEBUG",
    "CORS_ALLOWED_ORIGINS",
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    "SECURE_HSTS_PRELOAD",
    "NUM_PROXIES",
    "CANONICAL_HOST",
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
# terminar pytest-django vacía todas las tablas, semilla incluida. Se vuelven a
# correr las migraciones de datos, en el orden de `SEED_MIGRATIONS` (que importa:
# las que actualizan filas, como la `0015` y la `0017`, dependen de las que las
# crean), y la base queda como recién migrada. Por eso cada semilla debe ser
# idempotente: correrla otra vez no duplica filas ni pisa lo que ya cambió otra
# prueba o el admin. Las que crean usan `get_or_create`; las que actualizan filtran
# por el valor sembrado (estilo y color) y solo tocan lo que sigue así.
#
# Toda migración de datos nueva debe agregarse a `SEED_MIGRATIONS` (una prueba de
# `test_seed_migrations.py` falla si falta alguna). Y ninguna prueba debe fijar
# ids a mano: las secuencias de la base no se reinician, así que cambian.
SEED_MIGRATIONS = [
    ("0003_seed_settings", "seed_settings"),
    ("0005_seed_cake_options", "seed_cake_options"),
    ("0007_seed_stands_and_delivery", "seed_stands_and_delivery"),
    ("0009_seed_catalog", "seed_catalog"),
    ("0015_seed_cake_preview_styles", "seed"),
    ("0017_seed_fruit_chunks_style", "seed"),
    ("0019_seed_cake_molds", "seed"),
    ("0021_seed_filling_styles", "seed"),
    ("0023_seed_decoration_designs", "seed"),
    ("0024_seed_rose_decoration", "seed"),
    ("0026_seed_decoration_prices", "seed"),
    ("0033_seed_decoration_accepts_color", "seed"),
]
_db_blocker = None


def _reseed():
    with _db_blocker.unblock():
        for module_name, function_name in SEED_MIGRATIONS:
            module = importlib.import_module(f"core_pasteleria.migrations.{module_name}")
            getattr(module, function_name)(apps, None)


@pytest.fixture(scope="session", autouse=True)
def _remember_db_blocker(django_db_blocker):
    global _db_blocker
    _db_blocker = django_db_blocker
    yield
    _db_blocker = None


@pytest.fixture(scope="session")
def _reseed_around_the_session(django_db_setup, _remember_db_blocker):
    """Deja la base sembrada al abrir y al cerrar la sesión (o el worker de `-n`).

    Al cerrar: pytest-django ordena las pruebas transaccionales al final, y con
    `-n` cada worker puede terminar en una. El gancho de abajo corre después de que
    la sesión ya cerró la base, y con `--reuse-db` esa base vacía sería la de la
    siguiente corrida. Al abrir: una corrida abortada (Ctrl+C, un worker caído)
    no pasó por ese cierre y dejó la base vacía; sembrar otra vez es seguro porque
    cada semilla es idempotente. Depende de `django_db_setup`, así que corre sobre
    la base de pruebas ya creada y su cierre corre antes que el de la base.
    """
    _reseed()
    yield
    _reseed()


def _is_transactional(item):
    marker = item.get_closest_marker("django_db")
    uses_marker = marker is not None and marker.kwargs.get("transaction", False)
    return uses_marker or "transactional_db" in getattr(item, "fixturenames", ())


def _uses_database(item):
    names = getattr(item, "fixturenames", ())
    return item.get_closest_marker("django_db") is not None or any(
        name in names for name in ("db", "transactional_db")
    )


def pytest_collection_modifyitems(items):
    for item in items:
        if _uses_database(item):
            # Al principio: la primera prueba de un proceso la siembra antes de que sus fixtures de función
            # (por ejemplo, una que deja un diseño en PENDIENTE) toquen la base.
            item.fixturenames.insert(0, "_reseed_around_the_session")


@pytest.hookimpl(trylast=True)
def pytest_runtest_teardown(item, nextitem):
    """Vuelve a sembrar justo después de que pytest-django vació las tablas."""
    if nextitem is None or not _is_transactional(item):
        return
    _reseed()
