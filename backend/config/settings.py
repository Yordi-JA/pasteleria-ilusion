"""Configuración de Django para Pastelería Ilusión.

Todo lo que cambia por entorno o es secreto se lee de variables de entorno
(`backend/.env` en desarrollo, ignorado por Git). `SECRET_KEY` y
`ALLOWED_HOSTS` no tienen valor por defecto: sin ellos la app no arranca.
"""
import re
from datetime import timedelta
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured
from django.utils.http import is_same_domain

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
# No pisa variables que ya estén en el entorno (por ejemplo, las de Heroku).
environ.Env.read_env(BASE_DIR / ".env")


def env_int(name, **options):
    """Lee un entero del entorno; si no lo es, el mensaje dice cuál variable falló."""
    try:
        return env.int(name, **options)
    except ValueError as error:
        raise ImproperlyConfigured(f"{name} debe ser un número entero.") from error


def env_list(name, **options):
    """Lee una lista separada por comas, sin espacios ni elementos vacíos."""
    return [value.strip() for value in env.list(name, **options) if value.strip()]


# --- Núcleo ---

SECRET_KEY = env("SECRET_KEY")
if not SECRET_KEY:
    raise ImproperlyConfigured("SECRET_KEY no puede estar vacía.")

# False salvo que el entorno diga lo contrario.
DEBUG = env.bool("DEBUG", default=False)

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS no puede estar vacío.")


def _host_allowed(host):
    """True si `ALLOWED_HOSTS` permite el host, como lo decide Django."""
    return any(
        pattern == "*" or is_same_domain(host, pattern.lower())
        for pattern in ALLOWED_HOSTS
    )


# Dirección principal del sitio (por ejemplo, `pasteleriailusion.me`). Opcional:
# vacía, no hay redirección (desarrollo y pruebas). Con valor, `www.` + este host
# redirige con 301 a él (`config.canonical.WwwRedirectMiddleware`).
CANONICAL_HOST = env("CANONICAL_HOST", default="").strip().lower()
if CANONICAL_HOST:
    _host_pattern = r"(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*"
    if not re.fullmatch(_host_pattern, CANONICAL_HOST):
        raise ImproperlyConfigured(
            "CANONICAL_HOST debe ser solo el dominio, sin esquema, puerto ni ruta "
            "(por ejemplo, pasteleriailusion.me)."
        )
    # Con la misma lógica que Django: acepta "*" y patrones como ".dominio.me".
    for _host in (CANONICAL_HOST, f"www.{CANONICAL_HOST}"):
        if not _host_allowed(_host):
            raise ImproperlyConfigured(
                f"ALLOWED_HOSTS debe permitir {_host}: CANONICAL_HOST exige "
                "el dominio canónico y su variante con www."
            )

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # `ArrayField` (tipos de pastel permitidos) y `ExclusionConstraint` (rangos
    # de kilos de las bases sin encimarse).
    "django.contrib.postgres",
    "rest_framework",
    # Sin esta app la lista negra de refresh tokens no ocurre.
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
    # Sirve Swagger UI y ReDoc desde el propio sitio, sin CDN.
    "drf_spectacular_sidecar",
    # Bloqueo de intentos de inicio de sesión fallidos.
    "axes",
    "core_pasteleria",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Redirige www al dominio canónico; antes de WhiteNoise para que también
    # cubra los estáticos y el build de React.
    "config.canonical.WwwRedirectMiddleware",
    # Sirve los estáticos y el build de React; va justo después de la
    # redirección de www, antes de todo lo demás.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    # Antes de CommonMiddleware, como pide django-cors-headers.
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Al final, como pide django-axes.
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --- Base de datos ---

# URL completa; Heroku aporta `DATABASE_URL`.
DATABASES = {"default": env.db("DATABASE_URL")}

# --- Caché ---

# Compartida entre procesos y dynos (los contadores del throttling no pueden
# vivir en la memoria de cada proceso). Usa la misma PostgreSQL; la tabla se crea
# con `manage.py createcachetable`.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
        "OPTIONS": {"MAX_ENTRIES": 10000},
    }
}

# --- Usuario y contraseñas ---

AUTH_USER_MODEL = "core_pasteleria.User"

# Argon2 para las contraseñas nuevas; PBKDF2 queda para verificar (y migrar al
# iniciar sesión) hashes que no sean de Argon2.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
]

# --- Bloqueo del inicio de sesión (django-axes) ---

# Registra los intentos en la base (no en la caché): sobreviven a que la caché
# descarte entradas y el personal los ve y desbloquea desde el admin.
AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]
AXES_FAILURE_LIMIT = env_int("AXES_FAILURE_LIMIT", default=5)
_axes_cooloff_minutes = env_int("AXES_COOLOFF_MINUTES", default=60)
if AXES_FAILURE_LIMIT < 1 or _axes_cooloff_minutes < 1:
    raise ImproperlyConfigured(
        "AXES_FAILURE_LIMIT y AXES_COOLOFF_MINUTES deben ser al menos 1."
    )
AXES_COOLOFF_TIME = timedelta(minutes=_axes_cooloff_minutes)
# Se bloquea la combinación IP + correo y la IP sola (frena el rociado de
# contraseñas desde una IP). No se bloquea el correo desde cualquier IP: así un
# tercero no puede dejar fuera, a propósito, la cuenta de una persona del personal.
AXES_LOCKOUT_PARAMETERS = [["ip_address", "username"], "ip_address"]
# El bloqueo termina a la hora del último fallo registrado: los intentos que
# llegan durante el bloqueo no lo alargan.
AXES_RESET_COOL_OFF_ON_FAILURE_DURING_LOCKOUT = False
# La respuesta de bloqueo avisa cuántos segundos esperar.
AXES_ENABLE_RETRY_AFTER_HEADER = True
# Un acceso correcto NO borra los fallos: axes borra también los de la IP sola,
# y quien tuviera una cuenta podría reiniciar el contador de la IP entre
# ataques a otra cuenta. Los fallos vencen solos con el enfriamiento.
AXES_RESET_ON_SUCCESS = False
# La IP y el correo se resuelven con las reglas de config/security.py.
AXES_CLIENT_IP_CALLABLE = "config.security.client_ip"
AXES_USERNAME_CALLABLE = "config.security.normalized_username"
AXES_COOLOFF_MESSAGE = "Demasiados intentos fallidos. Intenta de nuevo más tarde."

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- Idioma y zona horaria ---

LANGUAGE_CODE = "es-mx"
TIME_ZONE = "America/Mexico_City"
USE_I18N = True
USE_TZ = True

# --- Archivos ---

STATIC_URL = "static/"
# Destino de `collectstatic` (admin, sidecar de Swagger); ignorado por Git.
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Con compresión, sin manifiesto: el manifiesto exige haber corrido
    # `collectstatic` incluso para renderizar el admin en las pruebas.
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# Build de React (`npm run build` en frontend/). WhiteNoise lo sirve desde la
# raíz del sitio (`/assets/...`) y `config.views.spa_index` devuelve su
# `index.html` para las rutas del sitio.
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    WHITENOISE_ROOT = FRONTEND_DIST


def _is_immutable_file(path, url):
    """Los archivos de `assets/` de Vite llevan el hash en el nombre."""
    return url.startswith("/assets/")


WHITENOISE_IMMUTABLE_FILE_TEST = _is_immutable_file


def _add_whitenoise_headers(headers, path, url):
    """Encabezados de lo que WhiteNoise sirve, que corta el middleware antes de
    `XFrameOptionsMiddleware`."""
    headers["X-Frame-Options"] = "DENY"
    if url == "/index.html":
        # Referencia archivos con hash nuevo en cada despliegue.
        headers["Cache-Control"] = "no-cache"


WHITENOISE_ADD_HEADERS_FUNCTION = _add_whitenoise_headers

# Solo guarda las subidas de clientes. `MEDIA_URL` no se define ni se enruta:
# los archivos salen por un endpoint con permisos.
MEDIA_ROOT = BASE_DIR / "media"

# Tope duro, en MB, del tamaño de cada imagen subida (D31). El admin edita el
# máximo en `UploadSettings.max_upload_mb`, pero nunca puede pasar de este valor.
# Cambiarlo exige una migración: el valor queda en el validador y en la
# restricción de la base de `UploadSettings`.
UPLOAD_HARD_LIMIT_MB = 10

# Tope duro de imágenes por envío de referencia (regla 9: máximo 3). El admin
# edita `UploadSettings.max_reference_images`, pero nunca puede pasar de aquí.
# Cambiarlo exige una migración, igual que `UPLOAD_HARD_LIMIT_MB`.
UPLOAD_HARD_LIMIT_IMAGES = 3

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Proxies de confianza ---

# Saltos de proxy delante de la app (en Heroku, 1). Es el único lugar donde se
# decide en qué proxy confiar: de aquí salen la identidad del cliente para el
# throttling y django-axes, y el encabezado que marca la conexión como HTTPS.
# Obligatorio en producción: un valor equivocado evade los límites o los aplica
# a todos los clientes como si fueran uno. En desarrollo (sin proxy), 0.
NUM_PROXIES = env_int("NUM_PROXIES", default=0) if DEBUG else env_int("NUM_PROXIES")
if NUM_PROXIES < 0:
    raise ImproperlyConfigured("NUM_PROXIES no puede ser negativo.")

if NUM_PROXIES >= 1:
    # El router de Heroku termina el TLS y avisa con este encabezado; sin él,
    # SECURE_SSL_REDIRECT redirige en bucle. Solo es seguro detrás de un proxy
    # que lo reescriba, como el de Heroku: por eso depende de NUM_PROXIES.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# --- Seguridad en producción (DEBUG apagado) ---

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    # Opcionales: abarcan todos los subdominios (y la lista de precarga de los
    # navegadores, difícil de revertir), así que se activan a propósito.
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(
        "SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False
    )
    SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# --- CORS y CSRF ---

# Solo los orígenes del entorno; nunca CORS_ALLOW_ALL_ORIGINS.
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = list(CORS_ALLOWED_ORIGINS)

if not DEBUG:
    insecure_origins = [o for o in CORS_ALLOWED_ORIGINS if not o.startswith("https://")]
    if insecure_origins:
        raise ImproperlyConfigured(
            "En producción CORS_ALLOWED_ORIGINS solo admite orígenes https://."
        )

# --- Django REST Framework ---

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    # Seguro por defecto: los endpoints públicos lo declaran de forma explícita.
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    # Solo JSON y con tope de tamaño y de anidación; formularios y multipart
    # responden 415. Las subidas de imágenes declaran su propio parser y tope.
    "DEFAULT_PARSER_CLASSES": ["core_pasteleria.api.parsers.BoundedJSONParser"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    # Límite general. Los alcances estrictos (inicio de sesión, registro,
    # recuperación, refresh, subida de fotos) se agregan con cada endpoint.
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
        "user": "120/min",
        # El pie del sitio (`/api/v1/store/info/`): aparte del cupo anónimo.
        "store_info": "120/min",
    },
    # Saltos de proxy delante de la app (en Heroku, 1). Con 0 se ignora
    # X-Forwarded-For y se usa la dirección de la conexión: si no, un cliente
    # falsifica ese encabezado y obtiene un contador nuevo en cada petición.
    "NUM_PROXIES": NUM_PROXIES,
}

# --- SimpleJWT ---

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    # Los tokens llevan una huella de la contraseña: al cambiarla, los access
    # emitidos antes dejan de valer.
    "CHECK_REVOKE_TOKEN": True,
}

# --- drf-spectacular ---

SPECTACULAR_SETTINGS = {
    "TITLE": "API de Pastelería Ilusión",
    "DESCRIPTION": "Contrato OpenAPI de la API bajo /api/v1/.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # Recursos de la interfaz servidos localmente, no desde un CDN.
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "REDOC_DIST": "SIDECAR",
    # El esquema y Swagger UI son solo para personal (is_staff). El navegador
    # entra con la sesión del admin; las herramientas, con un access token.
    "SERVE_PERMISSIONS": ["rest_framework.permissions.IsAdminUser"],
    "SERVE_AUTHENTICATION": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
}

# --- Registro (logging) ---

# A la salida estándar, que es lo que Heroku junta en `heroku logs`. Sin esto,
# Django solo escribe a consola con DEBUG y los INFO de la auditoría se pierden.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "{levelname} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "formatter": "plain",
        },
    },
    "loggers": {
        # Auditoría (`core_pasteleria.audit`) y demás registros de la app.
        "core_pasteleria": {"handlers": ["console"], "level": "INFO", "propagate": False},
        # Los 500 dejan rastro con su traza aunque DEBUG esté apagado.
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
        # Avisos de seguridad (por ejemplo, un `Host` no permitido o un CSRF fallido).
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
