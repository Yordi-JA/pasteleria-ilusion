# Reglas del backend

Complementan el [`AGENTS.md`](../AGENTS.md) de la raíz. Django + Django REST Framework + PostgreSQL.

## Reglas de negocio en el backend

- Toda la lógica de negocio vive en servicios del backend y se prueba: cálculo de kilos, precio por kilo (relleno + pan, combinado +$5), depósito de base, tarifa de envío, anticipo (50% del pedido; base y envío completos y aparte), capacidad de horarios (máximo 3 pedidos por media hora) y anticipación (2 días; vitrina el mismo día con 2 horas si hay pan).
- Las fórmulas de referencia están en `docs/reglas-de-negocio.md`. Las cifras viven en tablas editables desde el admin, no en constantes.
- Restricciones que el backend debe rechazar aunque el frontend las oculte: Red velvet solo seco; Choco-pingüino no envinado; Fresa con yogurt no envinado ni combinado; relleno combinado solo con base Normal y máximo 2 sabores; formas sin mezclar entre pisos; máximo 5 pisos; mínimo 4 kg; cota en línea de 50 kg (PROPUESTA; más que eso, "escríbenos por WhatsApp"); máximo 3 imágenes por envío de referencia; gelatinas en vaso solo en vitrina (no se encargan); Red velvet nunca en vitrina; no hay pastel mini con queso ni con flan.
- Envío de referencia: `en_revision` → `cotizacion_lista`. "Otra decoración" (imagen en el paso 6): el pedido queda en `en_pausa_por_cotizacion`. En ninguno de los dos se cobra nada antes de que la pastelería ponga el precio.
- Pagos en sandbox (Mercado Pago y Stripe) con webhooks idempotentes. Efectivo: el pedido queda apartado y se cancela si no se paga ese día antes de las 22:30.
- Cada webhook verifica la firma sobre el cuerpo crudo (`request.body`) antes de parsearlo. Stripe: `stripe.Webhook.construct_event` con el secreto del endpoint. Mercado Pago (Webhooks, no IPN): HMAC-SHA256 del manifiesto con `id`, `x-request-id` y `ts`, comparado con `hmac.compare_digest` y rechazando `ts` viejos. Además consulta el pago en la API de la pasarela; si la firma falla responde 400 sin cambiar nada. Un pago en línea solo pasa el pedido a `recibido` por un webhook verificado, nunca por la URL de regreso. El efectivo pasa a `recibido` cuando el personal con el permiso `core_pasteleria.registrar_pago_efectivo` registra el cobro.
- El monto lo calcula el servidor desde el pedido guardado (`pricing_service`); se ignora cualquier monto que mande el cliente, y se rechaza un pago cuyo monto o moneda no coincidan con lo que corresponde pagar hoy.
- Nota en PDF con QR que abre `/nota/:token`; el token es `secrets.token_urlsafe(32)` guardado en el pedido (no el id ni un hash del id) y la página muestra solo lo que fija `docs/reglas-de-negocio.md` §11. "Base devuelta" es un `POST` que exige `is_staff` y el permiso `core_pasteleria.registrar_devolucion_base`; registra quién, cuándo y desde qué nota, y es idempotente (una base devuelta no se reembolsa dos veces).
- Datos PENDIENTE: modelos y campos listos, valores vacíos y visibles en el admin; nunca inventados.
- Cancelaciones y devoluciones: el mecanismo existe con parámetros configurables en la base de datos o el admin y con marcador PENDIENTE visible. La política la define la pastelería (`docs/reglas-de-negocio.md`, sección 14); no se inventa.
- Estados del pedido y de la base: los de la sección 12 de `docs/reglas-de-negocio.md` (`apartado`, `recibido`, `en_preparacion`, `listo_para_entregar`, `entregado`, `cancelado`, `en_pausa_por_cotizacion`; la base: `prestada`, `devuelta`; el envío de referencia: `en_revision`, `cotizacion_lista`).

## Estado actual

Hoy `backend/` es solo un esqueleto: los módulos de `core_pasteleria/` tienen un docstring y nada más, y `backend/tests/` está vacío. El proyecto Django (`settings`, `manage.py`, dependencias) se crea en la Etapa 2. Los comandos se agregan aquí cuando existan.

## Estructura obligatoria

```text
backend/
├── core_pasteleria/
│   ├── models.py               # Tablas y relaciones (ORM PostgreSQL)
│   ├── api/                    # Capa de controladores (entrada REST)
│   │   ├── views.py            # Recibe requests HTTP, invoca servicios y retorna responses
│   │   ├── serializers.py      # Validación y transformación de datos JSON (DTOs)
│   │   └── urls.py             # Enrutamiento de endpoints
│   ├── services/               # Capa de servicios (lógica de negocio y patrones)
│   │   ├── pricing_service.py  # Cálculo de precios del cotizador 3D (Strategy)
│   │   ├── warranty_service.py # Reglas de préstamo, retención y devolución de bases
│   │   ├── payments/
│   │   │   └── payment_factory.py  # Factory Method + Adapter (Mercado Pago, Stripe, efectivo)
│   │   └── orders/
│   │       └── order_observer.py   # Observer (cambio de estados, stock y alertas)
│   └── repositories/           # Capa de acceso a datos (aislamiento del ORM)
│       ├── product_repo.py     # Consultas de catálogo y stock en tiempo real
│       └── order_repo.py       # Consultas de pedidos, agenda y garantías
└── tests/                      # pytest + pytest-django
```

Faltan en el árbol `apps.py`, `admin.py`, `migrations/` y el paquete del proyecto Django (`settings`, `urls`, `wsgi`). Se agregan a mano en la Etapa 2; no se usa `startapp`, porque falla al encontrar archivos que ya existen.

## Capas

- `api/views.py` solo coordina HTTP y llama a `services/`.
- `services/` aplica las reglas de negocio y llama a `repositories/`.
- Solo `repositories/` toca el ORM (`Modelo.objects...`); excepción: `admin.py` (D18).
- Nunca se devuelven instancias crudas del modelo: entradas y salidas pasan por `api/serializers.py`.
- Un módulo que acumula responsabilidades de varias capas es un Objeto Dios; sepáralo.

## Patrones

### Factory Method y Adapter (pagos)

En `services/payments/payment_factory.py`:

- Clase abstracta `PagoBase(ABC)` con el método `cobrar(monto, payload)`.
- Diccionario `REGISTRO_PASARELAS` que asocia el tipo de pago con su clase.
- Función de fábrica `crear_procesador_pago(tipo)` que busca en el registro y devuelve la instancia.
- Está prohibido elegir la pasarela con `if/elif/else`: sería un Patrón Cosmético.
- El registro incluye Mercado Pago, Stripe y efectivo.
- `MercadoPagoAdapter` envuelve el SDK `mercadopago` y traduce sus respuestas al formato interno de `core_pasteleria`. Stripe tiene su adaptador equivalente. El dominio nunca importa los SDK directamente.
- Los datos de tarjeta nunca tocan nuestro servidor: Stripe con Elements o Checkout y Mercado Pago con Checkout Pro o Bricks. El `payload` solo lleva tokens o ids de la pasarela.

### Strategy (precio)

En `services/pricing_service.py`, el precio se calcula con estrategias intercambiables (clases o funciones inyectadas) para pan (incremento por kilo o precio completo de Choco-pingüino y Red velvet), relleno por tipo y base, sabor especial, combinado, oblea y decoraciones fijas (precio PENDIENTE). Sin cadenas `if/elif`. Las cifras salen de las tablas editables, no de constantes. La pastelería no ha definido descuentos y no se inventan; el diseño admite agregar una estrategia si los define.

### Observer (eventos del pedido: cambio de estado y base devuelta)

En `services/orders/order_observer.py`:

- `OrderSubject` mantiene los observadores y expone `suscribir(observador)`.
- Notifica eventos, no solo estados: "estado cambiado" y "base devuelta". Cada observador recibe el evento sin que el sujeto dependa de él.
- `NotificacionClienteObserver` avisa cada cambio de estado y la confirmación de agenda.
- `InventarioObserver` descuenta las existencias de vitrina cuando el pedido entra en `apartado` o `recibido` (lo que ocurra primero) y las reintegra al entrar en `cancelado`. Los pedidos personalizados no descuentan vitrina; el consumo de pan es una decisión abierta.
- `GarantiaBaseObserver`: al entrar en `entregado` crea la base `prestada` con fecha límite (entrega + 15 días) y retiene el depósito. Con el evento "base devuelta", que emite `warranty_service` cuando el personal registra la devolución, marca la base `devuelta` y el depósito reembolsado. Solo `warranty_service.registrar_devolucion(token, actor)` emite "base devuelta": vuelve a verificar `actor.has_perm("core_pasteleria.registrar_devolucion_base")`, bloquea la base con `select_for_update` y la pasa de `prestada` a `devuelta` en la misma transacción que el registro de auditoría; el evento lleva el `actor`.
- Los estados del pedido son los de `docs/reglas-de-negocio.md`, sección 12.

### Repository

Cada repositorio se puede sustituir. Los servicios reciben el repositorio por parámetro para inyectar un `RepoMemoria` en las pruebas y probar la lógica sin PostgreSQL.

### Decorator

`@auditar_operacion` usa `functools.wraps`, mide el tiempo en milisegundos y registra en el logger de Django. Se aplica al cálculo del precio (`pricing_service`) y al cobro (`PagoBase.cobrar`). Registra nombre, duración, id del pedido y resultado; nunca argumentos, payloads, tokens ni datos personales.

## API

- Todo bajo `/api/v1/`, por ejemplo `/api/v1/productos/`, `/api/v1/pedidos/` y `/api/v1/garantias/`.
- El checkout lee el encabezado `Idempotency-Key` para impedir cobros o pedidos duplicados.
- Autenticación con JWT (SimpleJWT), que vincula pedidos y garantías a la cuenta del cliente. Access de 5 a 15 min con `ROTATE_REFRESH_TOKENS` y `BLACKLIST_AFTER_ROTATION`; el refresh va en cookie `HttpOnly; Secure; SameSite=Lax` limitada a la ruta de autenticación y su endpoint exige token CSRF.
- Con `rest_framework_simplejwt.token_blacklist` en `INSTALLED_APPS` (sin ella la lista negra no ocurre). El frontend y la API comparten sitio: mismo dominio propio (`www.` y `api.`) o la API bajo `/api` en el mismo origen; nunca dos subdominios de una PaaS (sus dominios por defecto son sitios distintos y la cookie `SameSite=Lax` no viajaría). `CORS_ALLOW_CREDENTIALS = True` con la misma lista en `CSRF_TRUSTED_ORIGINS`; nunca `SameSite=None`. SimpleJWT no lee cookies: las vistas propias de refresh y logout leen la cookie y exigen CSRF de forma explícita (`csrf_protect`), porque las `APIView` de DRF están exentas; el logout borra la cookie y pone el refresh en la lista negra.
- CORS con `CORS_ALLOWED_ORIGINS` leído del entorno, nunca `CORS_ALLOW_ALL_ORIGINS`.
- Los repositorios filtran por dueño: pedidos, bases, cotizaciones y fotos se consultan con el usuario de la petición; un recurso ajeno responde 404, no 403. Ningún endpoint de cliente acepta `cliente_id`. El personal usa endpoints aparte con permiso propio.
- Los serializadores de cliente declaran `estado`, `reembolsado`, depósitos y montos como solo lectura. El estado del pedido y de la base cambia solo por servicios (`warranty_service`, webhook verificado, acciones del personal), nunca por un `PATCH` genérico ni por edición directa en el admin.
- Google: el backend verifica el ID token (`google.oauth2.id_token.verify_oauth2_token`, audiencia = nuestro client ID) y solo acepta `email_verified`; nunca confía en un correo enviado por el frontend. Una cuenta con contraseña no se vincula a Google hasta verificar su correo; al vincular se invalidan las sesiones previas.
- Recuperar contraseña responde siempre lo mismo, exista o no el correo.
- Paginación en DRF y throttling con alcance propio (`ScopedRateThrottle`) para inicio de sesión, registro, recuperación de contraseña, refresh y subida de fotos, más estricto que el general. El inicio de sesión del admin de Django se protege aparte (por ejemplo, con django-axes). `NUM_PROXIES` (DRF) y el conteo de proxies de django-axes se fijan al número real de saltos de la PaaS; el inicio de sesión se limita también por correo, no solo por IP.
- Contrato OpenAPI con drf-spectacular y Swagger UI en `/api/v1/docs/`.

## Subidas

Fotos de referencia, imágenes de "otra decoración" y obleas: solo JPEG, PNG o WebP verificados abriendo el archivo con Pillow (no por extensión ni `Content-Type`), con tamaño máximo configurable desde el admin, re-codificadas sin metadatos EXIF y guardadas con nombre aleatorio (`uuid4`). No se sirven desde `/media/` público: se entregan por un endpoint que verifica que sean del cliente o que quien pide sea personal, con `Content-Disposition` y `X-Content-Type-Options: nosniff`. Las notas PDF se generan en memoria o dentro de `MEDIA_ROOT`. Además del límite del admin hay un tope duro en el código o el proxy (por ejemplo, 10 MB) que el admin no puede superar. `MEDIA_URL` no se enruta ni se sirve en ningún entorno: todo archivo de cliente sale por el endpoint con permisos.

## Pruebas

pytest y pytest-django, en `backend/tests/`. Cubren las estrategias de precio, la resolución de pasarelas sin `if/elif`, los observadores, los bloqueos de horario de la agenda y el cálculo de retención y reembolso de bases. El detalle está en [`docs/proyecto/pruebas.md`](../docs/proyecto/pruebas.md).

## Configuración

Todo lo que cambia por entorno o es secreto se lee de variables de entorno (`.env`, ignorado por Git): `SECRET_KEY`, credenciales de PostgreSQL, llaves sandbox de Mercado Pago y Stripe, `STRIPE_WEBHOOK_SECRET`, la clave secreta de webhooks de Mercado Pago, client secret de Google. Se versiona `.env.example` con solo los nombres. `backend/media/` nunca se versiona.

- `DEBUG` es `False` salvo que el entorno diga lo contrario; `SECRET_KEY` y `ALLOWED_HOSTS` no tienen valor por defecto y la app no arranca sin ellos.
- En producción: `SECURE_SSL_REDIRECT`, HSTS, `SESSION_COOKIE_SECURE` y `CSRF_COOKIE_SECURE`; `/api/v1/docs/` solo para personal.
- `TIME_ZONE = "America/Mexico_City"` con `USE_TZ = True`.
- La cancelación de apartados vencidos (22:30) es un comando de gestión idempotente, `cancelar_apartados_vencidos`, que corre periódicamente. Cómo se programa depende del PaaS (decisión abierta).

Más contexto: [`docs/proyecto/arquitectura.md`](../docs/proyecto/arquitectura.md).
