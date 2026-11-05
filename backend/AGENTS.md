# Reglas del backend

Complementan el [`AGENTS.md`](../AGENTS.md) de la raíz. Django + Django REST Framework + PostgreSQL.

## Reglas de negocio en el backend

- Toda la lógica de negocio vive en servicios del backend y se prueba: cálculo de kilos, precio por kilo (relleno + pan, combinado +$5), depósito de base, tarifa de envío, anticipo (50% del pedido; base y envío completos y aparte), capacidad de horarios (máximo 3 pedidos por media hora) y anticipación (2 días; vitrina el mismo día con 2 horas si hay pan).
- Las fórmulas de referencia están en `docs/reglas-de-negocio.md`. Las cifras viven en tablas editables desde el admin, no en constantes.
- Restricciones que el backend debe rechazar aunque el frontend las oculte: Red velvet solo seco; Choco-pingüino no envinado; Fresa con yogurt no envinado ni combinado; relleno combinado solo con base Normal y máximo 2 sabores; formas sin mezclar entre pisos; máximo 5 pisos; mínimo 4 kg; cota en línea de 50 kg (PROPUESTA; más que eso, "escríbenos por WhatsApp"); máximo 3 imágenes por envío de referencia; gelatinas en vaso solo en vitrina (no se encargan); Red velvet nunca en vitrina; no hay pastel mini con queso ni con flan.
- Envío de referencia: `in_review` → `quote_ready`. "Otra decoración" (imagen en el paso 6): el pedido queda en `awaiting_quote`. En ninguno de los dos se cobra nada antes de que la pastelería ponga el precio.
- Pagos en sandbox (Mercado Pago y Stripe) con webhooks idempotentes. Efectivo: el pedido queda apartado y se cancela si no se paga ese día antes de la hora de cierre (`StoreSettings.store_closes_at`, 22:30 al inicio).
- Cada webhook verifica la firma sobre el cuerpo crudo (`request.body`) antes de parsearlo. Stripe: `stripe.Webhook.construct_event` con el secreto del endpoint. Mercado Pago (Webhooks, no IPN): HMAC-SHA256 del manifiesto con `id`, `x-request-id` y `ts`, comparado con `hmac.compare_digest` y rechazando `ts` viejos. Además consulta el pago en la API de la pasarela; si la firma falla responde 400 sin cambiar nada. Un pago en línea solo pasa el pedido a `received` por un webhook verificado, nunca por la URL de regreso. El efectivo pasa a `received` cuando el personal con el permiso `core_pasteleria.register_cash_payment` registra el cobro.
- El monto lo calcula el servidor desde el pedido guardado (`pricing_service`); se ignora cualquier monto que mande el cliente, y se rechaza un pago cuyo monto o moneda no coincidan con lo que corresponde pagar hoy.
- Nota en PDF con QR que abre `/nota/:token`; el token es `secrets.token_urlsafe(32)` guardado en el pedido (no el id ni un hash del id) y la página muestra solo lo que fija `docs/reglas-de-negocio.md` §11. "Base devuelta" es un `POST` que exige `is_staff` y el permiso `core_pasteleria.register_stand_return`; registra quién, cuándo y desde qué nota, y es idempotente (una base devuelta no se reembolsa dos veces).
- Datos PENDIENTE: modelos y campos listos, valores vacíos y visibles en el admin; nunca inventados.
- Cancelaciones y devoluciones: el mecanismo existe con parámetros configurables en la base de datos o el admin y con marcador PENDIENTE visible. La política la define la pastelería (`docs/reglas-de-negocio.md`, sección 14); no se inventa.
- Estados del pedido y de la base: los de la sección 12 de `docs/reglas-de-negocio.md`, con su etiqueta en español (`awaiting_payment` "Apartado, falta tu pago", `received`, `in_preparation`, `ready_for_delivery`, `delivered`, `cancelled`, `awaiting_quote`; la base: `on_loan`, `returned`; el envío de referencia: `in_review`, `quote_ready`).

## Estado actual

El proyecto Django está inicializado (Etapa 2, solo la inicialización): paquete `config/` (`settings.py`, `urls.py`, `wsgi.py`, `asgi.py`), `manage.py`, `requirements.txt` (producción) y `requirements-dev.txt` (pruebas) con versiones exactas (Django 5.2 LTS, Python 3.11), PostgreSQL 18 en Docker (`compose.yaml`) y pytest contra esa base. Existe el modelo `core_pasteleria.User` (correo único como `USERNAME_FIELD`, sin username, registrado en el admin) con su migración `0001_initial`. `/api/v1/docs/` (Swagger UI) y `/api/v1/schema/` son solo para personal. El proyecto está listo para Heroku (D26): WhiteNoise sirve los estáticos y el build de React, `config/views.py` devuelve su `index.html` para las rutas del sitio, la caché del throttling es de base de datos y la raíz del repositorio trae `Procfile`, `package.json`, `requirements.txt`, `.python-version` y `.slugignore`. El inicio de sesión del admin se protege con django-axes. Ver "Despliegue en Heroku".

El esquema del catálogo, el inventario y la configuración editable (D32) está implementado en `core_pasteleria/models.py`, con sus migraciones `0002` a `0010` (esquema y semilla por paso; la semilla llega sola a producción con `migrate`, ver [`docs/proyecto/esquema-catalogo.md`](../docs/proyecto/esquema-catalogo.md)), su admin en `admin.py` y sus pruebas: 4 configuraciones de una sola fila, las opciones y precios de "Diseña tu pastel", `CakeStand` y `DeliveryFeeBand`, `Product`, `CatalogPrice` y `ProductOffering`, e `Inventory` por día con los proxies "Vitrina de hoy" y "Pan de hoy". Lo que la pastelería aún no define queda vacío y el admin lo muestra como "PENDIENTE". Los repositorios `product_repo`, `cake_option_repo` y `settings_repo` devuelven `dataclass` inmutables (`repositories/records.py`) y tienen su par en memoria (`repositories/memory.py`).

Primeros servicios y endpoints (Etapa 2, adelanto de la Etapa 3 en la parte de "Diseña tu pastel"): `services/pricing_service.py` calcula el precio de "Diseña tu pastel" con estrategias (Strategy) y devuelve un desglose inmutable; `services/cake_options_service.py` arma las opciones con su disponibilidad y su motivo, con las mismas estrategias; `services/warranty_service.py` da el depósito de la base por kilos (`get_stand_deposit`); `services/audit.py` tiene `@audit_operation` (Decorator), aplicado al cálculo del precio; `services/errors.py` tiene `DomainValidationError`, cuyos errores por campo la API devuelve como 400. Endpoints públicos (sin autenticación, `AllowAny`, solo `AnonRateThrottle`), de solo lectura y sin guardar nada, bajo la ruta de diseños de D29: `GET /api/v1/cake-designs/options/` y `POST /api/v1/cake-designs/price/` (desglose más el depósito de la base, que va aparte del total; ignora cualquier monto que mande el cliente, y forma y pisos, que no cambian el precio). Las opciones que la pastelería desactiva en el admin no se listan; "nunca desaparecen" aplica a las que un conflicto de tipo vuelve no elegibles. Panes, bases y sabores traen `allowed_cake_types` y `unavailable_reasons` por tipo de pastel, calculados con las mismas funciones con que el precio rechaza (una prueba recorre cada pan, base, sabor y tipo); un pan de incremento sin ninguna base disponible en un tipo, o una base sin precio general o sin sabores de ese tipo, quedan "No disponible en pastel <tipo>". Una decoración de precio fijo sin precio (PENDIENTE) sale con `available=false` y "Precio por confirmar" y el cálculo la rechaza; "Otra decoración" marca `requires_quote` y no se suma. `limits.max_online_kg` de las opciones es el máximo que de verdad se puede pedir: el menor entre la configuración y la base activa más grande (0 si no hay bases activas). La vista de precio revisa el precio y la base y devuelve sus errores juntos en un 400 (los de formato, como un tipo de dato equivocado, salen antes en su propio 400; un campo lleva el motivo del primer paso que lo rechazó). El admin no deja borrar tamaños de base (se desactivan); `CakeStand.clean()`, al guardar un tamaño, no deja que el `min_kg` más chico de la tabla (activas o no) quede arriba de `min_custom_kg` (cambiar `min_custom_kg` no lo revisa); `CakeDesignSettings.clean()` no deja fijar `max_online_kg` por encima de la base activa más grande, y sin bases activas no deja cambiarlo (solo lo revisa en el alta o si ese campo cambia); y `FillingPrice.clean()` no deja que un sabor cueste menos que el precio general de su base en el mismo tipo de pastel (lo revisa de los dos lados). Todavía no hay `Order`, `CakeDesign`, `StandLoan`, `DeliverySlot`, `ReferenceRequest` ni `Quote`: los pagos, los observadores del pedido y `order_repo.py` siguen siendo esqueleto. Faltan también el inicio de sesión con cookie de refresh y Google, y el comando `seed_demo_inventory`. La app `pasteleria-ilusion` está desplegada en Heroku (https://pasteleria-ilusion-0994ca356cbc.herokuapp.com/, D38); los despliegues siguientes los hace el equipo desde `main` actualizado con `git push heroku main` (en un clon nuevo, primero `heroku git:remote -a pasteleria-ilusion`).

## Comandos

Todos desde `backend/`. El proyecto requiere Python 3.11 y Docker con Compose.

```bash
# Entorno virtual e instalación (versiones exactas; incluye pytest).
# Producción instala solo requirements.txt.
python3.11 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

# Configuración local: copia la plantilla y llena todos los valores
# (en desarrollo, con DEBUG=True)
cp .env.example .env

# Base de datos (PostgreSQL 18 en 127.0.0.1:${POSTGRES_PORT:-5433})
docker compose up -d --wait   # espera el estado "healthy"
docker compose ps             # opcional: ver el estado
docker compose logs db
docker compose down      # detiene; los datos siguen en el volumen
# docker compose down -v borra el volumen y todos los datos de desarrollo

# Django
.venv/bin/python manage.py check
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createcachetable  # tabla de la caché del throttling
.venv/bin/python manage.py createsuperuser   # pide correo y contraseña
.venv/bin/python manage.py runserver

# Pruebas (necesitan la base arriba y backend/.env)
.venv/bin/pytest

# Sitio completo como en producción (build de React + gunicorn), sin Heroku.
# `.env` trae DEBUG=True y un origen http:// de CORS, que producción rechaza:
# se sobrescriben aquí. Sin X-Forwarded-Proto: https, el sitio redirige a https.
(cd ../frontend && source ~/.nvm/nvm.sh && nvm use 22 && npm ci && npm run build)
DEBUG=False ALLOWED_HOSTS=127.0.0.1 NUM_PROXIES=0 CORS_ALLOWED_ORIGINS= \
  .venv/bin/python manage.py collectstatic --noinput
DEBUG=False ALLOWED_HOSTS=127.0.0.1 NUM_PROXIES=0 CORS_ALLOWED_ORIGINS= \
  .venv/bin/gunicorn config.wsgi --bind 127.0.0.1:8000
curl -H 'X-Forwarded-Proto: https' http://127.0.0.1:8000/catalogo
```

Notas:

- `backend/.env` debe definir `SECRET_KEY` (aleatoria), `ALLOWED_HOSTS`, `DEBUG=True` (solo en desarrollo; sin él Django se comporta como producción y exige HTTPS), `DATABASE_URL` y `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (los usa `compose.yaml`). `DATABASE_URL` debe coincidir con las `POSTGRES_*` y el puerto. Usa una contraseña sin caracteres especiales de URL (por ejemplo, hexadecimal). Sin `SECRET_KEY` o `ALLOWED_HOSTS` Django no arranca.
- El puerto 5432 suele estar ocupado en la máquina de desarrollo: `compose.yaml` usa 5433 por defecto, configurable con `POSTGRES_PORT`.
- La imagen `postgres:18` guarda los datos en `/var/lib/postgresql` (el volumen se monta ahí, no en `.../data`).
- Las pruebas crean y borran su propia base `test_<POSTGRES_DB>`; el usuario de `POSTGRES_USER` es superusuario de la imagen, así que tiene permiso.
- Para revisar la configuración de producción: `DEBUG=False ALLOWED_HOSTS=ejemplo.com NUM_PROXIES=1 CORS_ALLOWED_ORIGINS= .venv/bin/python manage.py check --deploy` (`NUM_PROXIES` es obligatorio con `DEBUG` apagado).
- WhiteNoise avisa `No directory at: .../backend/staticfiles/` hasta que se corre `collectstatic`; en desarrollo y en las pruebas es inofensivo (`pytest.ini` lo filtra).
- Las contraseñas se guardan con Argon2 (`argon2-cffi`); los hashes PBKDF2 existentes se verifican y se actualizan al iniciar sesión.
- Los access tokens llevan una huella de la contraseña (`CHECK_REVOKE_TOKEN`): al cambiarla dejan de valer. El serializador de refresh de SimpleJWT no revisa esa huella, así que un refresh viejo aún renueva, pero el access que entrega es rechazado; la vista de refresh futura debe rechazarlo de forma explícita.
- Permisos del personal en el admin: quien no es superusuario no ve ni edita al personal ni a los superusuarios, no puede cambiar `is_staff`, `is_superuser`, grupos ni permisos, no puede cambiar el correo ni la contraseña de un cliente (la vista de cambio de contraseña responde 403) y no puede dar de alta usuarios (el alta fija una contraseña que el personal conocería). Solo puede, por ejemplo, activar o desactivar la cuenta de un cliente. El admin de Grupos (y sus permisos) es solo para superusuarios. Los permisos `*_user` y `*_group` que se asignen a otro personal no cambian esto.
- Throttling: `NUM_PROXIES` (variable de entorno; obligatoria con `DEBUG=False`, 0 por defecto solo en desarrollo, negativo no se acepta) fija cuántos proxies de confianza hay delante de la app: 0 en desarrollo y 1 en Heroku. Con 0 DRF ignora `X-Forwarded-For` y cuenta por la dirección de la conexión; si el valor es menor que los proxies reales (por ejemplo, 0 detrás de Heroku), todos cuentan como un solo cliente, el router; si es mayor, DRF toma una dirección que el atacante controla en `X-Forwarded-For` y el límite se evade. Los contadores viven en una caché compartida de base de datos (`DatabaseCache`, tabla `django_cache`, que se crea con `createcachetable`), no en la memoria de cada proceso: con varios workers o dynos la memoria local multiplicaría el límite. Se eligió sobre Redis porque no agrega un servicio de pago y la carga es pequeña; si el throttling pesara, se cambia solo `CACHES`. django-axes para el inicio de sesión del admin va con el inicio de sesión.
- El esquema y Swagger UI (`/api/v1/schema/`, `/api/v1/docs/`; la interfaz sale del propio sitio con `drf-spectacular-sidecar`, sin CDN) responden 401 a anónimos y 403 a quien no es personal. En el navegador entra con la sesión del admin (`/admin/`); con herramientas, un access token como `Bearer`.

## Estructura obligatoria

```text
backend/
├── core_pasteleria/
│   ├── models.py               # Tablas y relaciones (ORM PostgreSQL)
│   ├── api/                    # Capa de controladores (entrada REST)
│   │   ├── views.py            # Recibe requests HTTP, invoca servicios y retorna responses
│   │   ├── serializers.py      # Validación y transformación de datos JSON (DTOs)
│   │   ├── parsers.py          # JSON con tope de 16 KB (413 si lo pasa, 415 si no es JSON)
│   │   └── urls.py             # Enrutamiento de endpoints
│   ├── services/               # Capa de servicios (lógica de negocio y patrones)
│   │   ├── pricing_service.py  # Cálculo de precios del cotizador 3D (Strategy)
│   │   ├── cake_options_service.py # Opciones de "Diseña tu pastel" con disponibilidad y motivo
│   │   ├── warranty_service.py # Reglas de préstamo, retención y devolución de bases
│   │   ├── audit.py            # @audit_operation (Decorator)
│   │   ├── errors.py           # DomainValidationError: errores por campo que la API vuelve 400
│   │   ├── payments/
│   │   │   └── payment_factory.py  # Factory Method + Adapter (Mercado Pago, Stripe, efectivo)
│   │   └── orders/
│   │       └── order_observer.py   # Observer (cambio de estados, stock y alertas)
│   └── repositories/           # Capa de acceso a datos (aislamiento del ORM)
│       ├── product_repo.py     # Consultas de catálogo y stock en tiempo real
│       └── order_repo.py       # Consultas de pedidos, agenda y garantías
└── tests/                      # pytest + pytest-django
```

`apps.py`, `admin.py`, `migrations/` y el paquete del proyecto Django (`config/`) se agregaron a mano en la Etapa 2; no se usa `startapp`, porque falla al encontrar archivos que ya existen.

## Capas

- `api/views.py` solo coordina HTTP y llama a `services/`.
- `services/` aplica las reglas de negocio y llama a `repositories/`.
- Solo `repositories/` toca el ORM (`Modelo.objects...`); excepción: `admin.py` (D18). Otra excepción: el `clean()` de un modelo puede consultar otros modelos para validar (por ejemplo, `CakeDesignSettings.clean()` lee `CakeStand`, `CakeStand.clean()` lee `CakeDesignSettings` y `FillingPrice.clean()` lee los otros precios de su base).
- Nunca se devuelven instancias crudas del modelo: entradas y salidas pasan por `api/serializers.py`.
- Un módulo que acumula responsabilidades de varias capas es un Objeto Dios; sepáralo.

## Patrones

### Factory Method y Adapter (pagos)

En `services/payments/payment_factory.py`:

- Clase abstracta `BasePayment(ABC)` con el método `charge(amount, payload)`.
- Diccionario `PAYMENT_GATEWAY_REGISTRY` que asocia el tipo de pago con su clase.
- Función de fábrica `create_payment_processor(payment_type)` que busca en el registro y devuelve la instancia.
- Está prohibido elegir la pasarela con `if/elif/else`: sería un Patrón Cosmético.
- El registro incluye Mercado Pago (`mercadopago`), Stripe (`stripe`) y efectivo (`cash`).
- `MercadoPagoAdapter` envuelve el SDK `mercadopago` y traduce sus respuestas al formato interno de `core_pasteleria`. Stripe tiene su adaptador equivalente. El dominio nunca importa los SDK directamente.
- Los datos de tarjeta nunca tocan nuestro servidor: Stripe con Elements o Checkout y Mercado Pago con Checkout Pro o Bricks. El `payload` solo lleva tokens o ids de la pasarela.

### Strategy (precio)

En `services/pricing_service.py`, el precio se calcula con estrategias intercambiables (clases o funciones inyectadas) para pan (incremento por kilo o precio completo de Choco-pingüino y Red velvet), relleno por tipo y base, sabor especial, combinado, oblea y decoraciones fijas (precio PENDIENTE). Sin cadenas `if/elif`. Las cifras salen de las tablas editables, no de constantes. La pastelería no ha definido descuentos y no se inventan; el diseño admite agregar una estrategia si los define.

Implementado así: `BREAD_PRICING_STRATEGIES` (por `BreadPricingMode`) y `DECORATION_PRICING_STRATEGIES` (por `DecorationPricing`) son los registros; `FillingPricing` es la estrategia del relleno (precio general de la base para el tipo, el mayor precio propio de los sabores que lo tengan y el cargo por combinado de la base con dos sabores). `calculate_price(choice, cake_options=..., settings=...)` recibe los repositorios por parámetro, valida por separado los kilos, el pan con su relleno y la decoración y lanza `CakeDesignError` con todos los errores por campo (`PendingPriceError` si solo falla una decoración sin precio). Una prueba revisa que los registros cubran todos los valores de los choices y que ni `pricing_service` ni `cake_options_service` tengan cadenas `elif`. Las estrategias de decoración exponen `is_price_pending(decoration)`, que las opciones leen para `price_pending`.

### Observer (eventos del pedido: cambio de estado y base devuelta)

En `services/orders/order_observer.py`:

- `OrderSubject` mantiene los observadores y expone `subscribe(observer)`.
- Notifica eventos, no solo estados: "estado cambiado" y "base devuelta". Cada observador recibe el evento sin que el sujeto dependa de él.
- `CustomerNotificationObserver` avisa cada cambio de estado y la confirmación de agenda.
- `InventoryObserver` descuenta las existencias de vitrina cuando el pedido entra en `awaiting_payment` o `received` (lo que ocurra primero) y las reintegra al entrar en `cancelled`. Los pedidos personalizados no descuentan vitrina (D14). Los pedidos de "Diseña tu pastel" tampoco descuentan el pan del inventario: solo los encargos de vitrina del mismo día lo consumen (D30).
- `StandLoanObserver`: al entrar en `delivered` crea la base `on_loan` con fecha límite (entrega + 15 días) y retiene el depósito. Con el evento "base devuelta", que emite `warranty_service` cuando el personal registra la devolución, marca la base `returned` y el depósito reembolsado. Solo `warranty_service.register_stand_return(token, actor)` emite "base devuelta": vuelve a verificar `actor.has_perm("core_pasteleria.register_stand_return")`, bloquea la base con `select_for_update` y la pasa de `on_loan` a `returned` en la misma transacción que el registro de auditoría; el evento lleva el `actor`.
- Los estados del pedido son los de `docs/reglas-de-negocio.md`, sección 12.

### Repository

Cada repositorio se puede sustituir. Los servicios reciben el repositorio por parámetro para inyectar un `MemoryRepo` en las pruebas y probar la lógica sin PostgreSQL.

### Decorator

`@audit_operation` usa `functools.wraps`, mide el tiempo en milisegundos y registra en el logger de Django. Se aplica al cálculo del precio (`pricing_service`) y al cobro (`BasePayment.charge`). Registra nombre, duración y resultado, y el id del pedido cuando existe; nunca argumentos, payloads, tokens ni datos personales.

Vive en `services/audit.py` y escribe en el logger `core_pasteleria.audit`: INFO con `ok` si termina bien; INFO con `rejected:<Clase>` si lanza uno de los errores previstos que se le pasan (`@audit_operation(expected_errors=(DomainValidationError,))` en el precio: una elección que no cumple las reglas no es una falla); ERROR con el nombre de la clase ante cualquier otra excepción. El error se vuelve a lanzar igual y no se registra su mensaje ni su traza. Los campos `operation`, `duration_ms` y `result` van también como atributos del registro. El cálculo del precio no tiene pedido, así que no registra id; el id del pedido se agregará con el cobro.

## API

- Todo bajo `/api/v1/`, por ejemplo `/api/v1/products/`, `/api/v1/orders/` y `/api/v1/stand-loans/`.
- El checkout lee el encabezado `Idempotency-Key` para impedir cobros o pedidos duplicados.
- Autenticación con JWT (SimpleJWT), que vincula pedidos y garantías a la cuenta del cliente. Access de 5 a 15 min con `ROTATE_REFRESH_TOKENS` y `BLACKLIST_AFTER_ROTATION`; el refresh va en cookie `HttpOnly; Secure; SameSite=Lax` limitada a la ruta de autenticación y su endpoint exige token CSRF.
- Con `rest_framework_simplejwt.token_blacklist` en `INSTALLED_APPS` (sin ella la lista negra no ocurre). El frontend y la API comparten sitio: mismo dominio propio (`www.` y `api.`) o la API bajo `/api` en el mismo origen; nunca dos subdominios de una PaaS (sus dominios por defecto son sitios distintos y la cookie `SameSite=Lax` no viajaría). `CORS_ALLOW_CREDENTIALS = True` con la misma lista en `CSRF_TRUSTED_ORIGINS`; nunca `SameSite=None`. SimpleJWT no lee cookies: las vistas propias de refresh y logout leen la cookie y exigen CSRF de forma explícita (`csrf_protect`), porque las `APIView` de DRF están exentas; el logout borra la cookie y pone el refresh en la lista negra.
- CORS con `CORS_ALLOWED_ORIGINS` leído del entorno, nunca `CORS_ALLOW_ALL_ORIGINS`.
- Los repositorios filtran por dueño: pedidos, bases, diseños de pastel, envíos de referencia y fotos se consultan con el usuario de la petición; un recurso ajeno responde 404, no 403. Ningún endpoint de cliente acepta `customer_id`. El personal usa endpoints aparte con permiso propio.
- Los serializadores de cliente declaran `status`, `refunded`, depósitos y montos como solo lectura. El estado del pedido y de la base cambia solo por servicios (`warranty_service`, webhook verificado, acciones del personal), nunca por un `PATCH` genérico ni por edición directa en el admin.
- Google: el backend verifica el ID token (`google.oauth2.id_token.verify_oauth2_token`, audiencia = nuestro client ID) y solo acepta `email_verified`; nunca confía en un correo enviado por el frontend. Una cuenta con contraseña no se vincula a Google hasta verificar su correo; al vincular se invalidan las sesiones previas.
- Recuperar contraseña responde siempre lo mismo, exista o no el correo.
- Paginación en DRF y throttling con alcance propio (`ScopedRateThrottle`) para inicio de sesión, registro, recuperación de contraseña, refresh y subida de fotos, más estricto que el general. El inicio de sesión del admin de Django se protege aparte con django-axes (ver Configuración). `NUM_PROXIES` (DRF) y la IP de django-axes se fijan al número real de saltos de la PaaS; el inicio de sesión se limita también por correo, no solo por IP.
- Contrato OpenAPI con drf-spectacular y Swagger UI en `/api/v1/docs/`.
- La API solo acepta JSON (`DEFAULT_PARSER_CLASSES` = `core_pasteleria.api.parsers.BoundedJSONParser`): formularios y multipart responden 415; un cuerpo de más de 16 KB, 413 ("La petición es demasiado grande."): primero por el `Content-Length` declarado y, como defensa en profundidad, sin leer nunca más del tope (un cuerpo chunked no llega al parser: DRF lo da como `{}`); un JSON tan anidado que agota la recursión, 400 ("JSON inválido."). Las subidas de imágenes declararán su propio parser multipart con su tope.
- `PublicReadOnlyView` (`api/views.py`) es la base de las vistas públicas: sin autenticación ni sesión (un token vencido no da 401 y no hay CSRF que pedir), `AllowAny` y solo la tasa de anónimos. Es solo para operaciones sin efectos; lo que persista usa autenticación y CSRF.

## Subidas

Fotos de referencia, imágenes de "otra decoración" y obleas: solo JPEG, PNG o WebP verificados abriendo el archivo con Pillow (no por extensión ni `Content-Type`), con tamaño máximo configurable desde el admin (5 MB al inicio, D31), re-codificadas sin metadatos EXIF y guardadas con nombre aleatorio (`uuid4`). No se sirven desde `/media/` público: se entregan por un endpoint que verifica que sean del cliente o que quien pide sea personal, con `Content-Disposition` y `X-Content-Type-Options: nosniff`. Las notas PDF se generan en memoria o dentro de `MEDIA_ROOT`. Además del límite del admin hay un tope duro en el código o el proxy de 10 MB que el admin no puede superar. `MEDIA_URL` no se enruta ni se sirve en ningún entorno: todo archivo de cliente sale por el endpoint con permisos.

## Pruebas

pytest y pytest-django, en `backend/tests/`. Cubren las estrategias de precio, la resolución de pasarelas sin `if/elif`, los observadores, los bloqueos de horario de la agenda y el cálculo de retención y reembolso de bases. El detalle está en [`docs/proyecto/pruebas.md`](../docs/proyecto/pruebas.md).

## Configuración

Todo lo que cambia por entorno o es secreto se lee de variables de entorno (`.env`, ignorado por Git): `SECRET_KEY`, credenciales de PostgreSQL, llaves sandbox de Mercado Pago y Stripe, `STRIPE_WEBHOOK_SECRET`, la clave secreta de webhooks de Mercado Pago, client secret de Google. Se versiona `.env.example` con solo los nombres. `backend/media/` nunca se versiona.

- `DEBUG` es `False` salvo que el entorno diga lo contrario; `SECRET_KEY` y `ALLOWED_HOSTS` no tienen valor por defecto y la app no arranca sin ellos.
- En producción: `SECURE_SSL_REDIRECT`, HSTS, `SESSION_COOKIE_SECURE` y `CSRF_COOKIE_SECURE`; `/api/v1/docs/` solo para personal.
- `NUM_PROXIES` es obligatorio con `DEBUG=False` y no puede ser negativo (ni un valor que no sea entero) en ningún entorno. `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")` se activa solo con `NUM_PROXIES >= 1`, en cualquier entorno: confiar en el proxy se decide en un único lugar, y solo es seguro detrás de un proxy que reescriba ese encabezado, como el de Heroku.
- Inicio de sesión del admin con django-axes: 5 intentos fallidos (`AXES_FAILURE_LIMIT`) bloquean 1 hora (`AXES_COOLOFF_MINUTES`, en minutos); ambas variables son opcionales, deben ser enteros y al menos 1. Se bloquea la combinación IP + correo y la IP sola. La IP sola frena el rociado de contraseñas (un correo distinto en cada intento) y acota los registros a 5 por IP y hora; su costo es que 5 fallos de cualquiera bloquean a todo el personal que comparta esa IP (por ejemplo, una oficina). No se bloquea el correo desde cualquier IP, para que un tercero no pueda dejar fuera a propósito la cuenta de una persona del personal; la combinación IP + correo ya queda cubierta por el bloqueo de la IP. El bloqueo termina a la hora del último fallo registrado: los intentos durante el bloqueo no lo alargan (`AXES_RESET_COOL_OFF_ON_FAILURE_DURING_LOCKOUT = False`), y la respuesta 429 trae `Retry-After` con la duración total del enfriamiento. La IP sale de `NUM_PROXIES` (`config/security.py`), así que un `X-Forwarded-For` falso no reinicia el contador; si el valor no es una IP, se usa la dirección de la conexión. El correo se normaliza (mayúsculas y espacios no evaden el bloqueo) y se lee de `email`, `username` o el POST; sin correo, o si el valor no es texto, queda en `None`. Los intentos se guardan en la base, no en la caché. Un acceso correcto no borra los fallos (`AXES_RESET_ON_SUCCESS = False`): los fallos solo vencen por tiempo, con el enfriamiento de 1 hora. Si lo borrara, axes también borraría los fallos de la IP sola, y quien tuviera una cuenta podría reiniciar el contador entre ataques a la cuenta de otra persona (20 fallos sin bloqueo); una persona que se equivoca y luego acierta sigue acumulando sus fallos hasta que vencen. Con django-axes, `authenticate()` exige el parámetro `request`.
- Desbloquear: el personal con acceso al admin lo hace en "Access attempts" (borrando el registro). Desde la consola de Heroku: `heroku run "cd backend && python manage.py axes_reset_ip <ip>"`, `axes_reset_username <correo>` o `axes_reset` para todos (los tres existen en django-axes 9.0.0). El permiso `view_accessattempt` deja ver los correos de personal que fallaron: no se lo des a quien no deba verlos. Los registros de acceso (`AccessLog`) se limpian con `axes_reset_logs --age 90`.
- `TIME_ZONE = "America/Mexico_City"` con `USE_TZ = True`.
- `LOGGING` escribe a la salida estándar (lo que junta `heroku logs`), sin propagarse a la raíz: el logger `core_pasteleria` (y la auditoría, `core_pasteleria.audit`) en INFO; `django.request` en ERROR, para que los 500 dejen su traza aunque `DEBUG` esté apagado; y `django.security` en WARNING (por ejemplo, un `Host` no permitido o un CSRF fallido).
- La cancelación de apartados vencidos (después de `StoreSettings.store_closes_at`, 22:30 al inicio, editable por el grupo "Precios") es un comando de gestión idempotente, `cancel_unpaid_cash_orders`, que corre periódicamente. En Heroku se programa con Heroku Scheduler (D26).

## Despliegue en Heroku

Un solo servicio (D26): Django sirve el build de React y la API bajo `/api`, en el mismo origen. Heroku Postgres aporta `DATABASE_URL`; Heroku Scheduler programará los comandos periódicos.

### Estructura del monorepo

Heroku detecta los buildpacks desde la raíz del repositorio, así que ahí viven los archivos de despliegue:

| Archivo | Para qué |
| --- | --- |
| `package.json`, `package-lock.json` | Hacen que el buildpack de Node corra `heroku-postbuild`: `npm ci --prefix frontend --include=dev --ignore-scripts`, `npm run build --prefix frontend` y, al final, borra `frontend/node_modules`. Deja el build en `frontend/dist/`. |
| `requirements.txt` | Solo `-r backend/requirements.txt`: el buildpack de Python instala solo las dependencias de producción. |
| `.python-version` | `3.11`. |
| `Procfile` | `web`: gunicorn con `config.wsgi` desde `backend/`. `release`: `migrate` y `createcachetable` antes de cada versión nueva (ambos son idempotentes). |
| `.slugignore` | Deja fuera del slug `mockup/` y `docs/`, que no se leen ni en el build ni en ejecución. Heroku lo aplica **antes** del buildpack (Slug Compiler), así que `design/` y `assets/` no pueden ir ahí: el build de Tailwind y las fuentes los leen. |

`collectstatic` lo corre solo el buildpack de Python: busca `manage.py` hasta 3 niveles de profundidad (`backend/manage.py`) y junta los estáticos en `backend/staticfiles/`. No va en el `release`, porque ese dyno se descarta y los archivos no llegan a los dynos `web`. No se usan los ganchos `bin/pre_compile` ni `bin/post_compile`: el buildpack clásico de Python, que es el que usa la app (D38), ya corre `collectstatic` solo, y el buildpack nuevo (CNB) no tiene esos ganchos, así que depender de ellos impediría migrar. Para que `collectstatic` corra durante el build, las variables `SECRET_KEY`, `ALLOWED_HOSTS`, `NUM_PROXIES` y `DATABASE_URL` deben estar definidas antes del primer `git push` (Heroku las expone durante el build, y los settings las exigen para cargar).

Se descartó desplegar solo `backend/` con `git subtree push`: el build de React tendría que estar versionado, y `frontend/dist/` está ignorado. Se descartó también separar el frontend en otra app: rompe el mismo origen (D15) y duplica la configuración.

### Qué sirve cada capa

- WhiteNoise, justo después de `SecurityMiddleware`, sirve `/static/` (admin, sidecar de Swagger, desde `backend/staticfiles/`) y el contenido de `frontend/dist/` en la raíz (`/assets/...`, con caché inmutable porque Vite pone el hash en el nombre). Corta la petición antes de `XFrameOptionsMiddleware`, así que `WHITENOISE_ADD_HEADERS_FUNCTION` pone `X-Frame-Options: DENY` a todo lo que sirve, y `Cache-Control: no-cache` a `/index.html`.
- `config/views.py` (`spa_index`) devuelve `frontend/dist/index.html`, sin caché, para cualquier ruta que no sea `/api/`, `/admin/`, `/static/` ni `/media/` y que no parezca un archivo (`/robots.txt`, `/assets/falta.js` dan 404). Una ruta del sitio que no existe responde 200 con el index y el router de React muestra su pantalla de "no encontrada".
- Las rutas inexistentes de la API (incluida `/api` sin barra) responden 404 en JSON (`{"detail": "No encontrado."}`).
- `/media/` no se enruta ni se sirve.

### Buildpacks (el orden importa)

1. `heroku/nodejs`: construye el frontend primero.
2. `heroku/python`: instala Django y corre `collectstatic`. Va al final.

### Variables de entorno de producción

| Variable | Valor |
| --- | --- |
| `SECRET_KEY` | Aleatoria y larga (por ejemplo, `python -c "import secrets; print(secrets.token_urlsafe(50))"`). No se versiona. |
| `ALLOWED_HOSTS` | El dominio de la app sin esquema, tomado del "Web URL" de `heroku info`, separado por comas si hay más. Heroku agrega un sufijo al azar (`<app>-<hash>.herokuapp.com`; hoy `pasteleria-ilusion-0994ca356cbc.herokuapp.com`), así que no se arma con el nombre de la app. |
| `NUM_PROXIES` | `1`: el router de Heroku es el único salto. Obligatorio. |
| `DATABASE_URL` | La pone el add-on Heroku Postgres; no se escribe a mano. |
| `DEBUG` | No definirla (queda en `False`). |
| `CORS_ALLOWED_ORIGINS` | No definirla: mismo origen, la lista va vacía. |
| `SECURE_HSTS_INCLUDE_SUBDOMAINS`, `SECURE_HSTS_PRELOAD` | No definirlas (quedan en `False`). Se activan solo con un dominio propio que sirva todo por HTTPS. |
| `AXES_FAILURE_LIMIT`, `AXES_COOLOFF_MINUTES` | No definirlas salvo que se quieran otros valores (por defecto 5 intentos y 60 minutos). |
| `WEB_CONCURRENCY` | Opcional; Heroku la fija según el tipo de dyno y gunicorn la lee. |

Las variables de los pagos y de Google se agregan con esas funciones. `POSTGRES_*` son solo del `compose.yaml` local.

### Comandos que corre el equipo

En Windows (Git Bash) no existe `python3`: cámbialo por `python` en el `config:set` antes de copiarlo.

```bash
heroku create <nombre-de-la-app>
# en un clon que no corrió heroku create: heroku git:remote -a <nombre-de-la-app>
heroku buildpacks:add --index 1 heroku/nodejs
heroku buildpacks:add --index 2 heroku/python
heroku info -a <nombre-de-la-app>                  # copia el dominio del "Web URL" para ALLOWED_HOSTS
# Las opciones del add-on van después de `--`; `--version=18` antes falla con "Nonexistent flag".
heroku addons:create heroku-postgresql:essential-0 -a <nombre-de-la-app> --wait -- --version=18
heroku config:set SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')" \
  ALLOWED_HOSTS=<dominio-de-heroku-info> NUM_PROXIES=1
git push heroku main                               # desde la raíz del repositorio
heroku ps:type web=basic -a <nombre-de-la-app>   # D38: Basic, no Eco
heroku run "cd backend && python manage.py createsuperuser"
heroku logs --tail
```

Notas:

- La primera vez, `git push heroku main` pide credenciales de `git.heroku.com`: el usuario es el correo de Heroku y la contraseña, la salida de `heroku auth:token`. Corre ese comando en una terminal propia, porque el token da acceso a la cuenta. Git Credential Manager lo guarda.

Si el build falla con `ImproperlyConfigured`, falta una de las variables que los settings exigen para cargar (`SECRET_KEY`, `ALLOWED_HOSTS`, `NUM_PROXIES`, `DATABASE_URL`): el mensaje dice cuál; se define y se vuelve a hacer el push.

Verificación tras el primer despliegue (revisar también el log del build: debe decir que `collectstatic` copió archivos), con el dominio del "Web URL" de `heroku info`: `curl -I https://<dominio-de-heroku-info>/` (200, `text/html`), `/index.html` (200 con `X-Frame-Options: DENY` y `Cache-Control: no-cache`), `/catalogo` (200), `/assets/<archivo del build>` (200, `immutable`), `/static/admin/css/base.css` (200: si falta, `collectstatic` no corrió y el admin y Swagger salen sin estilos), `/api/v1/docs/` (401), `/api/v1/noexiste/` y `/api` (404 JSON), `/media/x.jpg` (404) y `/admin/login/` (200, y tras 5 fallos seguidos desde una IP, 429 con `Retry-After`), `/robots.txt` (404), `curl -I http://<dominio-de-heroku-info>/` (301 a `https://`, sin bucle) y `Strict-Transport-Security: max-age=31536000`.

### Verificado en local y pendiente

Verificado en local, sin Heroku: el script `heroku-postbuild` en una copia limpia (con `--ignore-scripts`), `collectstatic`, `createcachetable`, gunicorn con `DEBUG=False`, `check --deploy` y las pruebas de `tests/test_spa.py`, `tests/test_settings.py` y `tests/test_login_lockout.py`.

Verificado en Heroku el 4 de noviembre de 2026 (release v5, commit `4425df7`, D38), con la app en la región `us`, el stack `heroku-24` y los buildpacks clásicos del registro (`heroku/nodejs`, `heroku/python`):

- El buildpack de Python encontró `backend/manage.py` y corrió `collectstatic`, y `frontend/dist/` llegó al slug: `/static/admin/css/base.css` y `/assets/index-<hash>.js` (en v5, `index-CAwvpzXc.js`) responden 200.
- `.python-version` con `3.11` y `-r backend/requirements.txt` desde la raíz se resolvieron en `heroku-24`.
- Heroku Postgres `essential-0`, versión 18.4 (el mismo mayor que desarrollo), con 1 GB y 20 conexiones. El plan cuesta alrededor de $0.007 por hora, con máximo de $5 al mes, según `heroku addons:plans heroku-postgresql`.
- La fase `release` corre `migrate --noinput` y `createcachetable` encadenados con `&&`; ambos terminaron sin error, porque la release v5 quedó como actual. Aplicó todas las migraciones, incluidas `core_pasteleria` 0002 a 0010 con sus semillas. Gunicorn arrancó con 2 workers y los logs no muestran errores.
- Con `curl`: `/`, `/index.html` y `/catalogo` dan 200 HTML con `X-Frame-Options: DENY` y `Cache-Control: no-cache`; el archivo de `/assets/` da 200 con `Cache-Control: max-age=315360000, public, immutable`; `/api/v1/docs/` da 401; `/api/v1/noexiste/` y `/api` dan 404 JSON; `/media/x.jpg` y `/robots.txt` dan 404; `/admin/login/` da 200; `http://` redirige con 301 a `https://`; HSTS trae `max-age=31536000`; el 301 sin bucle muestra que llega `X-Forwarded-Proto` y que `SECURE_PROXY_SSL_HEADER` funciona.

Pendiente:

- El bloqueo de django-axes en producción (5 fallos, luego 429 con `Retry-After`). No se probó porque bloquearía una hora la IP del equipo; se prueba después, desde otra red.
- Que el router de Heroku agregue un solo salto a `X-Forwarded-For`, que es la base de `NUM_PROXIES=1` y de la IP que usan django-axes y el throttling. Se comprueba junto con el bloqueo de django-axes: en el admin, "Access attempts" debe registrar la IP real del equipo y no un `X-Forwarded-For` falso enviado en la petición.
- La programación en Heroku Scheduler de `cancel_unpaid_cash_orders`, `flushexpiredtokens` y `axes_reset_logs --age 90`.

Más contexto: [`docs/proyecto/arquitectura.md`](../docs/proyecto/arquitectura.md).
