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

from config.csp import add_whitenoise_csp

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
    # Content-Security-Policy del sitio y de la API (D62). Lo que sirve WhiteNoise
    # corta antes y la recibe de `_add_whitenoise_headers`.
    "config.csp.ContentSecurityPolicyMiddleware",
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

# Nombre propio de la base de pruebas (opcional). Con `--reuse-db`, dos carpetas
# de trabajo que comparten la misma PostgreSQL se pisarían la base
# `test_<POSTGRES_DB>` si sus migraciones difieren; cada una fija la suya.
# Debe empezar con `test_` y ser distinto de la base de desarrollo: `--create-db`
# borra la base de pruebas y `--reuse-db` la vacía entre pruebas.
if env("POSTGRES_TEST_DB", default=""):
    _test_db_name = env("POSTGRES_TEST_DB")
    if _test_db_name == DATABASES["default"]["NAME"] or not _test_db_name.startswith("test_"):
        raise ImproperlyConfigured(
            "POSTGRES_TEST_DB debe empezar con 'test_' y ser distinta de la base de DATABASE_URL: "
            "las pruebas borran y vacían esa base."
        )
    DATABASES["default"]["TEST"] = {"NAME": _test_db_name}

# --- Caché ---

# Compartida entre procesos y dynos (los contadores del throttling no pueden
# vivir en la memoria de cada proceso). Usa la misma PostgreSQL; la tabla se crea
# con `manage.py createcachetable`.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
        "OPTIONS": {"MAX_ENTRIES": 10000},
    },
    # Contadores de los throttles del acceso (inicio de sesión, registro, sesión),
    # de la creación de pedidos y de la subida de imágenes (`api/throttles.py`),
    # en su propia tabla: cuando la caché pública llega a su máximo borra una parte
    # de sus entradas (cull), y eso no debe reiniciar un contador de seguridad.
    # `createcachetable` (en el release de Heroku) crea las dos tablas.
    "security": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache_security",
        "OPTIONS": {"MAX_ENTRIES": 50000},
    },
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
# En el admin se bloquea la combinación IP + correo y la IP sola (frena el
# rociado de contraseñas desde una IP); en el inicio de sesión de clientes por la
# API, solo IP + correo, y el límite por IP lo pone el throttle `login` (D62). No
# se bloquea el correo desde cualquier IP: así un tercero no puede dejar fuera, a
# propósito, la cuenta de otra persona.
AXES_LOCKOUT_PARAMETERS = "config.security.lockout_parameters"
# La API responde el bloqueo en JSON; el admin, con el texto de siempre.
AXES_LOCKOUT_CALLABLE = "config.security.lockout_response"
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
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ("email", "full_name")},
    },
    # El mínimo (8 por omisión) lo repite la pantalla de registro (D62).
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
    add_whitenoise_csp(headers, path, url)
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

# Tope duro de megapíxeles de una imagen subida (auditoría de D55). El admin edita
# `UploadSettings.max_image_megapixels` (12 al inicio), nunca por encima de este.
# También es `Image.MAX_IMAGE_PIXELS` de Pillow para todo el proceso. Cambiarlo
# exige una migración, igual que `UPLOAD_HARD_LIMIT_MB`.
UPLOAD_HARD_LIMIT_MEGAPIXELS = 40

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

# Google Identity Services (D62): su ventana emergente necesita conservar el
# `opener` (con `same-origin`, el que Django pone por omisión, el acceso no vuelve
# a la página), y Google valida el origen con el `Referer`, que `same-origin` no
# manda a otro sitio. `strict-origin-when-cross-origin` le manda solo el origen.
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin-allow-popups"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

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
        # Catálogo, ficha, pasteles de la casa, vitrina y rebanadas, juntos. La
        # portada pide tres por cada carga del pie: el triple de `store_info`.
        "catalog": "360/min",
        # Acceso (D62), por IP y en la caché `security`. `login` lo comparten el
        # correo y Google: frena el ataque a muchos correos desde una IP, que el
        # bloqueo de axes (IP + correo) no ve. `register` acota cuántos correos se
        # pueden revisar con "Ya hay una cuenta con este correo." (D61).
        # `session`: CSRF, renovación y salida, que cada pestaña pide al cargar.
        # Holgadas para una exposición con público en la misma red (una sola IP):
        # 60 inicios de sesión por hora (ronda 1 de D62). El registro bajó de 30 a
        # 10 por hora con D76: cada registro manda un correo y la cuota diaria del
        # proveedor es corta (ver `ACCOUNT_EMAILS_DAILY_LIMIT`).
        "login": "60/hour",
        "register": "10/hour",
        "session": "120/min",
        # Subida de imágenes de clientes (oblea, "Otra decoración"): por cuenta y,
        # aparte, por IP, para que varias cuentas desde una conexión no sumen cupo,
        # en la caché `security` como el acceso.
        # Cada imagen pesa hasta el máximo del admin y se guarda en PostgreSQL.
        "customer_images_user": "20/hour",
        "customer_images_ip": "40/hour",
        # Crear pedidos (D63): cada pedido aparta un lapso, existencias y pan
        # mientras no se paga. Por cuenta, 10 por hora; por IP, 60 por hora, porque
        # en la exposición muchas personas comparten la red (ronda 2). Un reintento
        # con la misma `Idempotency-Key` no gasta este cupo.
        "orders_create_user": "10/hour",
        "orders_create_ip": "60/hour",
        # Un reintento con una llave que ya tiene pedido responde ese pedido: tiene
        # su propio cupo, holgado, en vez de ninguno (revisión de la ronda 2).
        "orders_retry_user": "120/min",
        # El calendario de la entrega (D66): cada consulta cuenta los pedidos de
        # hasta 42 días. Por cuenta y aparte del cupo general `user`; un mes con
        # sus cambios de mes y recargas tras un "Lleno" cabe holgado.
        "delivery_slots": "30/min",
        # Iniciar un pago (D68): por cuenta, en la caché `security`. Cada intento
        # nuevo crea una preferencia o un PaymentIntent en la pasarela; cambiar de
        # método y reintentar caben holgados. Consultar el estado usa `user`.
        "payments_user": "20/min",
        # Webhooks de las pasarelas, por IP: la firma es la autenticación y solo
        # una notificación firmada consulta a Mercado Pago. Holgado para no perder
        # avisos legítimos; aparte del cupo `anon` del sitio.
        "payment_webhooks": "300/min",
        # Verificación pública de la nota (D69), por IP en la caché `security`. El
        # token no se adivina; el cupo frena a quien pruebe tokens en masa y cabe
        # holgado para el personal que escanea notas en el mostrador.
        "note_verification": "30/min",
        # Envío de referencia (D70), por cuenta en la caché `security`: enviar
        # (cada uno guarda hasta 3 fotos y le pide trabajo a la pastelería) y
        # aceptar la cotización (crea el pedido y aparta el lapso). Un reintento
        # del envío con su misma llave usa `orders_retry_user`.
        "references_create_user": "10/hour",
        "references_accept_user": "20/hour",
        # Cancelar un pedido desde la cuenta (D70), por cuenta.
        "orders_cancel_user": "20/hour",
        # Cambiar la contraseña desde "Datos y avisos" (D72), en la caché `security`:
        # por cuenta, para que un access robado no sirva para probar la contraseña
        # actual sin fin, y por IP, como el inicio de sesión. Holgadas para una
        # persona que se equivoca.
        "password_change_user": "10/hour",
        "password_change_ip": "30/hour",
        # Confirmación del correo y recuperación de la contraseña (D76), en la caché
        # `security`. Pedir un enlace (reenviar la confirmación o recuperar) cuenta por
        # correo, para que nadie llene el buzón de otra persona, y por IP, para que
        # una conexión no reparta correos rotando direcciones (10 por hora, como el
        # registro; por correo, 5, menos que por IP). Encima de los dos va el tope
        # diario de todos los correos de la cuenta (`ACCOUNT_EMAILS_DAILY_LIMIT`).
        # Abrir un enlace cuenta por IP: el token no se adivina, el cupo frena a
        # quien pruebe en masa.
        "verify_resend_email": "5/hour",
        "verify_resend_ip": "10/hour",
        "email_verify": "60/hour",
        "password_reset_email": "5/hour",
        "password_reset_ip": "10/hour",
        "password_reset_confirm": "30/hour",
    },
    # Saltos de proxy delante de la app (en Heroku, 1). Con 0 se ignora
    # X-Forwarded-For y se usa la dirección de la conexión: si no, un cliente
    # falsifica ese encabezado y obtiene un contador nuevo en cada petición.
    "NUM_PROXIES": NUM_PROXIES,
}

# --- SimpleJWT ---

# Llave propia para firmar los JWT (D62): cambiarla cierra todas las sesiones de
# clientes sin tocar `SECRET_KEY` (que firma las sesiones del admin y el CSRF), y
# una filtración de una no compromete la otra. Obligatoria con DEBUG apagado; en
# desarrollo, si falta, se usa `SECRET_KEY`.
JWT_SIGNING_KEY = env("JWT_SIGNING_KEY", default="").strip()
if not JWT_SIGNING_KEY:
    if not DEBUG:
        raise ImproperlyConfigured(
            "JWT_SIGNING_KEY es obligatoria con DEBUG apagado (aleatoria, de 50 caracteres o más)."
        )
    JWT_SIGNING_KEY = SECRET_KEY
elif JWT_SIGNING_KEY == SECRET_KEY:
    raise ImproperlyConfigured("JWT_SIGNING_KEY debe ser distinta de SECRET_KEY.")
elif len(JWT_SIGNING_KEY) < 50:
    raise ImproperlyConfigured("JWT_SIGNING_KEY debe tener al menos 50 caracteres.")

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    # Los tokens llevan una huella de la contraseña: al cambiarla, los access
    # emitidos antes dejan de valer, y la renovación rechaza el refresh (D62).
    "CHECK_REVOKE_TOKEN": True,
    "SIGNING_KEY": JWT_SIGNING_KEY,
}

# Cookie del refresh (D15, D62): HttpOnly, SameSite=Lax y solo en las rutas de
# acceso; Secure fuera de desarrollo (el servidor de Vite y runserver van por http).
# Con Secure lleva el prefijo `__Secure-`: el navegador no acepta esa cookie si no
# llegó por HTTPS, así una red que inyecte HTTP no la puede plantar.
REFRESH_COOKIE_PATH = "/api/v1/auth/"
REFRESH_COOKIE_SECURE = not DEBUG
REFRESH_COOKIE_NAME = "__Secure-ilusion_refresh" if REFRESH_COOKIE_SECURE else "ilusion_refresh"

# --- Google Identity Services ---

# Client ID de OAuth (público: el frontend lo lleva en VITE_GOOGLE_CLIENT_ID). Es la
# audiencia que el backend exige en el ID token. Vacío: el acceso con Google
# responde 503 y el sitio sigue con el correo.
GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID", default="").strip()
if GOOGLE_CLIENT_ID and not GOOGLE_CLIENT_ID.endswith(".apps.googleusercontent.com"):
    raise ImproperlyConfigured(
        "GOOGLE_CLIENT_ID debe ser el ID de cliente de OAuth (termina en "
        ".apps.googleusercontent.com), nunca el secreto."
    )

# --- Pagos (D68) ---

# Llaves secretas de las pasarelas, en sandbox durante el proyecto. Cada método
# necesita las dos de su pasarela (el cobro y la clave de su webhook): si falta
# una, ese método responde 503 y los demás siguen funcionando. Nunca van al
# frontend; ahí solo va la llave pública de Stripe (`pk_`).
MERCADOPAGO_ACCESS_TOKEN = env("MERCADOPAGO_ACCESS_TOKEN", default="").strip()
MERCADOPAGO_WEBHOOK_SECRET = env("MERCADOPAGO_WEBHOOK_SECRET", default="").strip()
STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY", default="").strip()
STRIPE_WEBHOOK_SECRET = env("STRIPE_WEBHOOK_SECRET", default="").strip()
if STRIPE_SECRET_KEY and not STRIPE_SECRET_KEY.startswith(("sk_", "rk_")):
    raise ImproperlyConfigured(
        "STRIPE_SECRET_KEY debe ser la llave secreta (sk_...) o restringida (rk_...), nunca la pública (pk_...)."
    )
# El proyecto solo cobra en sandbox: una llave real cobraría dinero de verdad. En Mercado Pago el prefijo no
# distingue de forma confiable la llave de prueba de la real (las cuentas de prueba también usan `APP_USR-`), así
# que ahí no se revisa.
if STRIPE_SECRET_KEY.startswith(("sk_live_", "rk_live_")):
    raise ImproperlyConfigured(
        "STRIPE_SECRET_KEY es una llave real (sk_live_ o rk_live_): el proyecto solo usa llaves de prueba "
        "(sk_test_ o rk_test_)."
    )
if STRIPE_WEBHOOK_SECRET and not STRIPE_WEBHOOK_SECRET.startswith("whsec_"):
    raise ImproperlyConfigured("STRIPE_WEBHOOK_SECRET es el secreto del webhook de Stripe (whsec_...).")

# --- Correo (D70) ---

# SMTP por variables de entorno, sin atarse a un proveedor (Brevo, Gmail u otro).
# Sin EMAIL_HOST: en desarrollo los correos salen en la consola; en producción
# no se envía nada y queda un INFO en el registro (`EMAIL_ENABLED` apagado).
# Los correos son de mejor esfuerzo: una falla del SMTP no deshace nada.
EMAIL_HOST = env("EMAIL_HOST", default="").strip()
EMAIL_PORT = env_int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="").strip()
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
# Corto: el correo sale después del commit, en la misma petición (un webhook o
# el admin), y un SMTP lento no debe dejarla esperando.
EMAIL_TIMEOUT = env_int("EMAIL_TIMEOUT", default=5)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="").strip() or "webmaster@localhost"
if EMAIL_TIMEOUT < 1:
    raise ImproperlyConfigured("EMAIL_TIMEOUT debe ser al menos 1 segundo.")
if EMAIL_HOST and DEFAULT_FROM_EMAIL == "webmaster@localhost":
    raise ImproperlyConfigured("Con EMAIL_HOST, DEFAULT_FROM_EMAIL es obligatorio (el remitente de los correos).")
if EMAIL_HOST:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
elif DEBUG:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
else:
    EMAIL_BACKEND = "django.core.mail.backends.dummy.EmailBackend"
EMAIL_ENABLED = bool(EMAIL_HOST) or DEBUG
if EMAIL_HOST and not DEBUG and not CANONICAL_HOST:
    raise ImproperlyConfigured(
        "Con EMAIL_HOST y DEBUG apagado, CANONICAL_HOST es obligatorio: sin él, los enlaces de los correos y el QR "
        "de la nota apuntarían a localhost."
    )
# El dominio de los enlaces de los correos, nunca el de la petición: el canónico
# (D40) o, sin él, el frontend de desarrollo.
SITE_URL = f"https://{CANONICAL_HOST}" if CANONICAL_HOST else "http://127.0.0.1:5173"
# Los correos de la cuenta (confirmar el correo y recuperar la contraseña, D76) se
# arman y se envían en un hilo aparte, después de responder: así la respuesta tarda
# lo mismo exista o no la cuenta (el SMTP no la delata). Las pruebas lo apagan.
EMAIL_SEND_IN_BACKGROUND = True
# Tope diario de todos los correos de la cuenta juntos (confirmar, reenviar,
# recuperar y "Entra con Google", D76), en la caché `security`. Rotar direcciones
# (`victima+1@...`) no esquiva los throttles por correo; este tope protege la cuota
# diaria del proveedor (Brevo gratuito: unos 300), que comparten los correos del
# pedido y del pago. Al llegar al tope no sale nada y queda un WARNING.
ACCOUNT_EMAILS_DAILY_LIMIT = env_int("ACCOUNT_EMAILS_DAILY_LIMIT", default=150)
if ACCOUNT_EMAILS_DAILY_LIMIT < 1:
    raise ImproperlyConfigured("ACCOUNT_EMAILS_DAILY_LIMIT debe ser al menos 1.")

# --- Enlaces de la cuenta (D76) ---

# Cuánto vale cada enlace, en segundos; los dos son de un solo uso. Los fijó el
# usuario el 16 de noviembre de 2026. Cada generador de tokens lee el suyo:
# confirmar el correo no depende del plazo de la recuperación.
EMAIL_VERIFICATION_TIMEOUT = 24 * 60 * 60
PASSWORD_RESET_TIMEOUT = 60 * 60

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
    # Tres campos `status` con choices distintos (pedido, pago y base, D69): la
    # base lleva su propio nombre para que el de los otros no cambie.
    "ENUM_NAME_OVERRIDES": {
        "StandLoanStatusEnum": "core_pasteleria.models.StandLoanStatus",
        # D70: el estado del envío de referencia, el cuarto `status`.
        "ReferenceRequestStatusEnum": "core_pasteleria.models.ReferenceRequestStatus",
        # D70: el método de pago sale también en `paid_with` de la cancelación.
        "PaymentMethodEnum": "core_pasteleria.models.PaymentMethod",
        # El estado del pedido sale en el pedido y en la vista previa de la cancelación.
        "OrderStatusEnum": "core_pasteleria.models.OrderStatus",
    },
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
