# Anexo técnico de la presentación

Respaldo para las preguntas del profesor y para cualquier IA que necesite el detalle. Está ordenado por los temas del curso. Cada tema dice qué vimos en clase, dónde se aplica en el proyecto (con rutas del repositorio) y por qué. Lo que no se aplicó se dice tal cual. El guion hablado está en [`guion.md`](guion.md).

Todas las rutas son relativas a la raíz del repositorio, salvo los enlaces, que son relativos a este archivo. Los números de decisión (D24, D68...) son los de [`../decisiones.md`](../decisiones.md).

## Contenido

- [Diagramas](#diagramas)
- [Tema 1. Negocios electrónicos](#tema-1-negocios-electrónicos)
- [Tema 2. Aplicaciones empresariales](#tema-2-aplicaciones-empresariales)
- [Tema 3. Patrones de diseño](#tema-3-patrones-de-diseño)
- [Tema 4. Herramientas de desarrollo](#tema-4-herramientas-de-desarrollo)
- [Tema 5. Web services](#tema-5-web-services)
- [Tema 6. Calidad de software](#tema-6-calidad-de-software)
- [Cifras de pruebas por fecha](#cifras-de-pruebas-por-fecha)
- [Trabajo a futuro](#trabajo-a-futuro)
- [Lo que el proyecto no hace](#lo-que-el-proyecto-no-hace)

## Diagramas

Cada diagrama tiene una versión técnica, que documenta el código y vive en `docs/proyecto/diagramas/`, y una simplificada, sin nombres de código, para la presentación en `docs/proyecto/presentacion/diagramas/` (D102). Las dos usan la paleta Fresa y mermelada (D35 y D102). El PNG simplificado es el que se sube a Canva.

| Tema | Versión técnica | Versión simplificada |
| --- | --- | --- |
| Contexto | [`../diagramas/contexto.svg`](../diagramas/contexto.svg) | [`diagramas/contexto.png`](diagramas/contexto.png) |
| Capas de una petición | [`../diagramas/capas-peticion.svg`](../diagramas/capas-peticion.svg) | [`diagramas/capas.png`](diagramas/capas.png) |
| Pagos (Factory Method y Adapter) | [`../diagramas/fabrica-pagos.svg`](../diagramas/fabrica-pagos.svg) | [`diagramas/pagos.png`](diagramas/pagos.png) |
| Avisos del pedido (Observer) | [`../diagramas/observer-pedido.svg`](../diagramas/observer-pedido.svg) | [`diagramas/avisos-pedido.png`](diagramas/avisos-pedido.png) |
| Estados del pedido | [`../diagramas/estados-pedido.svg`](../diagramas/estados-pedido.svg) | [`diagramas/estados-pedido.png`](diagramas/estados-pedido.png) |
| Estados de la base | [`../diagramas/estados-base.svg`](../diagramas/estados-base.svg) | [`diagramas/estados-base.png`](diagramas/estados-base.png) |

Las fuentes editables son los `.excalidraw` del mismo nombre. El texto explicativo de cada diagrama técnico está en [`../arquitectura.md`](../arquitectura.md).

## Tema 1. Negocios electrónicos

### 1.1 y 1.2 Fundamentos y comercio electrónico

- Qué vimos: definición de comercio electrónico, características y virtudes, y el impacto de la pandemia en el consumo.
- Dónde se aplica: todo el sitio es un comercio electrónico de tipo negocio a consumidor (B2C). El catálogo y la vitrina están en `backend/core_pasteleria/services/catalog_service.py` y `backend/core_pasteleria/repositories/product_repo.py`, y en el frontend en `frontend/src/views/Catalog.tsx` y `frontend/src/views/Showcase.tsx`.
- Por qué: el cliente consulta disponibilidad y precio sin ir al local. El inventario de la vitrina se consulta en tiempo real y se descuenta de forma atómica (D14, `InventoryObserver` en `backend/core_pasteleria/services/orders/order_observer.py`).

### 1.2.1 Sistemas de pago electrónicos

- Qué vimos: pago electrónico, tarjetas, seguridad (CVV, certificados), intermediarios como Mercado Pago.
- Dónde se aplica: tres formas de pago (D3): Mercado Pago, tarjeta con Stripe y efectivo en la pastelería. Código en `backend/core_pasteleria/services/payments/` (`payment_factory.py`, `mercadopago_adapter.py`, `stripe_adapter.py`, `payment_service.py`, `results.py`). Los webhooks están en `backend/core_pasteleria/api/payment_views.py` y se enrutan en `backend/core_pasteleria/api/urls.py` (`payments/webhooks/mercadopago/` y `payments/webhooks/stripe/`). En el frontend, `frontend/src/views/Payment.tsx` y `frontend/src/models/stripeCard.ts`.
- Por qué: dos intermediarios reconocidos cubren tarjeta y cuenta digital, y el efectivo cubre a quien paga en el local. Ambos servicios corren en sandbox. Los datos de tarjeta solo pasan por los componentes de Stripe y Mercado Pago, y el frontend nunca captura el número (`frontend/AGENTS.md`).
- No se aplicó: CoDi, DiMo, PayPal, Apple Pay, Google Wallet ni Bitcoin. No hay registro de que se hayan evaluado.

### 1.2.2 Estrategia e implementación

- Qué vimos: e-commerce, e-marketing, e-business, modelos de negocio y Canvas.
- Dónde se aplica: el modelo es venta directa con anticipo (`PolicySettings.advance_percent`, hoy 50%; [`../../reglas-de-negocio.md`](../../reglas-de-negocio.md), sección 10). La estrategia de desarrollo es iterativa por etapas ([`../plan-de-trabajo.md`](../plan-de-trabajo.md)).
- Por qué: un anticipo reduce el riesgo de que el cliente no recoja un pastel hecho a su medida.
- No se aplicó: un Canvas formal no está en el repositorio. La diapositiva 5 del guion propone uno mínimo, por confirmar con el equipo. Tampoco hay e-marketing, SEO ni publicidad. Solo existe `frontend/public/robots.txt` y el título de cada página (D47).

### 1.2.3 Infraestructura

- Qué vimos: etapas de la infraestructura (mainframe a nube y SaaS), redes y mensajería, HTML y JavaScript.
- Dónde se aplica: el sitio corre en la nube con Heroku (D26 y D38), con Heroku Postgres. El `Procfile` define el proceso web con gunicorn y la fase `release` que migra la base. Un solo servicio sirve el build de React y la API bajo `/api` (D26).
- Por qué: un solo origen permite la cookie `SameSite=Lax` del refresh de la sesión (D15), y los créditos del GitHub Student Developer Pack cubren el costo.

### 1.3 Perspectiva administrativa

- Qué vimos: pagos internacionales (IBAN, SWIFT) y publicidad.
- Dónde se aplica: no se aplica. Todo es en pesos mexicanos (`MXN`, `backend/core_pasteleria/services/payments/results.py`) y no hay publicidad.
- Por qué: la pastelería vende en la Ciudad de México.

### 1.3.2 Aspectos legales

- Qué vimos: Ley Federal de Protección al Consumidor, Ley Federal de Protección de Datos Personales, derechos ARCO, PROFECO, PCI DSS.
- Dónde se aplica:
    - PCI DSS: el sitio no guarda ni procesa datos de tarjeta. Lo hacen los componentes de Stripe y Mercado Pago. No se hizo una evaluación formal.
    - Aviso de privacidad y términos: existe la ruta `/legal` con las anclas `#privacidad` y `#terminos` (`frontend/src/views/Legal.tsx`). Su texto es PENDIENTE: lo redacta la pastelería y el sitio muestra un marcador visible, sin inventar nada ([`../../reglas-de-negocio.md`](../../reglas-de-negocio.md), secciones 13 y 14).
    - Datos personales: una nota guarda el nombre con la inicial del apellido y no muestra teléfono, correo ni dirección al verificar el QR (`backend/core_pasteleria/services/orders/note_service.py`; regla 11). Cuánto tiempo se conservan el nombre y el teléfono de quien recoge es PENDIENTE (regla 8).
    - Derechos del consumidor: cancelación y devolución con un mecanismo configurable. El cliente cancela antes de la entrega y, si ya pagó, la pastelería retiene el 50% del pedido (D70). El texto de la política de cambios y qué pasa con una base dañada son PENDIENTES (regla 14).
- No hay en el repositorio una revisión contra la Ley Federal de Protección de Datos Personales en Posesión de los Particulares ni contra PROFECO. No se citan en [`../referencias.md`](../referencias.md). Si el profesor pregunta, la respuesta honesta es que los textos legales están pendientes de la pastelería y el sitio los deja visibles como pendientes.

### 1.4 e-gobierno

- No aplica. El proyecto es de comercio, no de gobierno. Se podría comparar G2C con B2C: aquí la relación es negocio a consumidor.

## Tema 2. Aplicaciones empresariales

El proyecto no integra ningún ERP, SCM ni CRM comercial. Lo que sí tiene son funciones equivalentes en pequeño.

| Tema de clase | Qué hay en el proyecto | Dónde |
| --- | --- | --- |
| SCM (cadena de suministro) | Inventario de la vitrina por día y de pan para encargos del mismo día, con descuento atómico. No hay proveedores ni compras | `backend/core_pasteleria/repositories/product_repo.py`, `backend/core_pasteleria/models.py` (`Inventory`) |
| ERP | No se usa. El admin de Django cubre pedidos, precios, existencias y bases. Es un sistema a la medida, no un ERP | `backend/core_pasteleria/admin.py` |
| CRM | No se usa. Hay cuenta de cliente con historial de pedidos y preferencia de avisos, sin segmentación ni campañas | `backend/core_pasteleria/services/account_service.py`, `frontend/src/views/MyOrders.tsx` |
| Motores de búsqueda empresarial | No aplica. La búsqueda del catálogo se quitó (D77) | |
| EAI | Hay integración con servicios externos mediante API REST y JSON: Google, Mercado Pago, Stripe y correo | `backend/core_pasteleria/services/google_identity.py`, `services/payments/`, `services/email_service.py` |

Sobre EAI: el patrón de publicar y suscribir de la clase se parece al Observer del pedido, pero ocurre dentro de un mismo proceso, sin una cola de mensajes (no hay RabbitMQ ni Kafka). Los correos salen en la misma petición, sin cola. La cancelación de pedidos vencidos sale de un comando programado con Heroku Scheduler (`backend/core_pasteleria/management/commands/cancel_expired_orders.py`, D63 y D26). Corre cada 10 minutos: los registros de Heroku del 22 de noviembre de 2026 lo confirman.

Por qué no hay ERP, CRM ni SCM: una pastelería familiar con un solo local no los necesita, y adoptarlos sería sobreingeniería, uno de los antipatrones del Tema 3.

## Tema 3. Patrones de diseño

### 3.1 Patrones comunes (GoF)

Referencia: Gamma et al. (1994). Cada patrón se usa porque resuelve un problema concreto y evita un antipatrón.

| Patrón | Dónde | Cómo | Antipatrón que evita |
| --- | --- | --- | --- |
| Factory Method | `backend/core_pasteleria/services/payments/payment_factory.py` | `BasePayment` (clase abstracta), `PAYMENT_GATEWAY_REGISTRY` (constante inmutable: `MappingProxyType`) y `create_payment_processor(payment_type)` que busca la clase en el registro, sin `if/elif`. La llave es `PaymentMethod` en `backend/core_pasteleria/models.py`. Prueba: `backend/tests/test_payment_factory.py` | Patrón cosmético |
| Adapter | `backend/core_pasteleria/services/payments/mercadopago_adapter.py` y `stripe_adapter.py` | Cada adaptador envuelve el SDK de su proveedor y devuelve el formato interno `PaymentResult` (`results.py`). `CashPayment` no necesita adaptador porque no hay servicio externo | Dominio acoplado a la respuesta de un proveedor |
| Strategy | `backend/core_pasteleria/services/pricing_service.py` | Estrategias elegidas desde registros, sin cadenas de `if`: relleno (`FillingPricing`), pan (`ExtraPerKgBreadPricing`, `FullPriceBreadPricing`), decoración (`IncludedDecorationPricing`, `FixedDecorationPricing`, `QuoteDecorationPricing`) y tamaño (`ByWeightSizePricing`, `SmallSizePricing`). Prueba: `backend/tests/test_pricing_service.py` | Cadenas `if/elif`; patrón cosmético |
| Observer | `backend/core_pasteleria/services/orders/order_observer.py` | `OrderSubject` mantiene los observadores y notifica eventos (estado cambiado, base devuelta, referencia recibida y cotización lista). Observadores: `InventoryObserver`, `CustomerNotificationObserver`, `CustomerEmailObserver`, `StripeCheckoutObserver` y `StandLoanObserver`. Prueba: `backend/tests/test_order_observer.py` | Objeto Dios |
| Decorator | `backend/core_pasteleria/services/audit.py` | `@audit_operation` mide el tiempo y registra en el logger `core_pasteleria.audit` sin guardar argumentos ni datos personales. Prueba: `backend/tests/test_audit.py` | Mezclar registro y lógica de negocio |
| Singleton | No se usa de forma explícita. Las configuraciones de una sola fila (`StoreSettings`, `PolicySettings`...) son tablas de una fila, que se parece pero no es el patrón | `backend/core_pasteleria/models.py` | |

Los patrones que fija [`../arquitectura.md`](../arquitectura.md) son estos cinco más Repository. Los nombres de clase `OrderSubject`, `*Payment`, `*Observer` y `*Adapter` son fijos por la arquitectura.

### 3.2 Patrones web

| Familia | Patrón | Dónde |
| --- | --- | --- |
| Presentación | MVT (Django) | `backend/core_pasteleria/` con `models.py`, `api/views.py` y `api/urls.py`. Las vistas son de API, sin plantillas, salvo los correos (`backend/core_pasteleria/templates/core_pasteleria/emails/`) |
| Presentación | MVVM (React) | `frontend/src/models/`, `viewmodels/` y `views/`, con `components/` y `three/`. Una vista usa un view-model, este usa un modelo, y el modelo habla con la API (`frontend/AGENTS.md`) |
| Enrutamiento | Front Controller | `backend/core_pasteleria/api/urls.py`; en el frontend, React Router |
| Enrutamiento | Middleware pipeline | Los middleware de Django en `backend/config/settings.py` (sesión, CSRF, axes, CORS) |
| Acceso a datos | Repository | `backend/core_pasteleria/repositories/` (`product_repo.py`, `order_repo.py`, `payment_repo.py`, `stand_loan_repo.py`...). Es la única capa que toca el ORM. Hay repositorios en memoria en `repositories/memory.py` para probar servicios sin PostgreSQL |
| Acceso a datos | Active Record | El ORM de Django (`models.py`) es Active Record; la capa de repositorios lo aísla |
| Acceso a datos | Unit of Work | No se implementó como tal. Las transacciones usan las de Django y la agenda usa control de concurrencia en la base (D63) |
| API REST | Recursos y verbos | `backend/core_pasteleria/api/urls.py` (`products/`, `orders/`, `stand-loans/`...) |
| API REST | DTO y Serializer | `backend/core_pasteleria/api/serializers.py`, `payment_serializers.py`, `reference_serializers.py`, `account_serializers.py` y `auth_serializers.py`. Nunca se devuelve una instancia cruda del modelo |
| API REST | Paginación | `PageNumberPagination` con `PAGE_SIZE` de 20 en `backend/config/settings.py`. Los listados de pedidos van paginados |
| API REST | Idempotencia | El encabezado `Idempotency-Key` en la creación del pedido y en el pago (`backend/core_pasteleria/api/views.py`, `api/payment_views.py`, `services/orders/order_service.py`, `services/payments/payment_service.py`). Los webhooks también son idempotentes (`backend/tests/test_payment_webhooks.py`) |
| API REST | Versionado | Todas las rutas bajo `/api/v1/` |
| API REST | API Gateway, BFF | No se usan. Un solo servicio sirve el sitio y la API |
| Resiliencia | Retry con backoff, Circuit Breaker, Bulkhead | No se usan. Hay cortes de tiempo en el cliente HTTP y el correo es de mejor esfuerzo (una falla del correo deja un aviso y no deshace el pedido) |
| Rendimiento | Throttling | `DEFAULT_THROTTLE_CLASSES` y `DEFAULT_THROTTLE_RATES` en `backend/config/settings.py`, y alcances propios en `backend/core_pasteleria/api/throttles.py` |
| Rendimiento | Cache-Aside, CQRS, colas | No se usan. Hay una caché compartida para los límites de intentos (D33) |
| Rendimiento | Carga diferida | La escena 3D se carga en un chunk aparte con `React.lazy` (D48) |

### 3.3 Antipatrones y cómo se evitaron

| Antipatrón | Cómo se evitó |
| --- | --- |
| Patrón cosmético | La fábrica de pagos busca en un registro y una prueba revisa con `ast` que `create_payment_processor` no contenga nodos `If` ([`../pruebas.md`](../pruebas.md), "Fábrica de pagos sin if/elif") |
| Objeto Dios | El pedido no descuenta stock, avisa al cliente y activa garantías en un solo servicio: cada responsabilidad es un observador |
| Estado global | El estado compartido del frontend (sesión, carrito) está acotado; `PAYMENT_GATEWAY_REGISTRY` es una constante inmutable (`frontend/AGENTS.md`, "Reglas de código") |
| Sobreingeniería | Solo se usan los patrones que resuelven un problema; no hay microservicios, colas ni caché de datos. D37 descarta FastAPI como segundo servicio |
| Golden Hammer | Se usó el framework que ya trae lo que se necesitaba, y se comparó con FastAPI antes de decidir (D37) |
| Copiar sin contexto | Del mockup se copia la estructura y los textos, no el CSS en línea. Se traduce a componentes con los tokens (`AGENTS.md`) |

Una reserva honesta: los números de diapositiva del material de clase que cita [`../arquitectura.md`](../arquitectura.md) vienen de las notas del equipo y no se contrastaron con el material.

## Tema 4. Herramientas de desarrollo

### 4.1.1 Frameworks

- Qué vimos: framework contra biblioteca; React, Django y Django REST Framework entre los ejemplos.
- Dónde se aplica: Django 5.2.18 LTS y Django REST Framework 3.18.3 (`backend/requirements.txt`); React 19.3.1, Vite 8.3.5, TypeScript 7.0.2, React Router 8.5.1 y Tailwind CSS 3.4.19 (`frontend/package.json`); `@react-three/fiber` 9.8.2 y `three` 0.187.0 para el 3D. El renderizado es del lado del cliente (SPA); el build de React lo sirve Django con WhiteNoise.
- Por qué: [`../tecnologias.md`](../tecnologias.md), sección "Framework: por qué Django y React". Django da ORM, admin y migraciones, y la regla 2 del proyecto exige que la pastelería edite precios sin un despliegue. FastAPI se consideró y se descartó (D37).
- Instalado y demostrado: ambos proyectos corren y pasan sus pruebas. Se demuestra en vivo en la demo.
- No se aplicó: SSR, SSG ni Next.js, porque el sitio es una SPA que habla con una API.

### 4.1.2 Pruebas y DevOps

- Qué vimos: pruebas unitarias, de integración y de interfaz; pytest y Playwright; PaaS (Heroku); Git y GitHub; contenedores.
- Dónde se aplica:
    - pytest y pytest-django en `backend/tests/` (configuración en `backend/pytest.ini`).
    - Playwright en `frontend/e2e/`, con la API simulada en `frontend/e2e/support/` (configuración en `frontend/playwright.config.ts`).
    - Heroku: `Procfile` en la raíz (D26, D33, D38 y D40); dominio https://pasteleriailusion.me.
    - Docker: solo para PostgreSQL de desarrollo (`backend/compose.yaml`).
    - Git y GitHub: repositorio público, ramas `tipo/descripcion-corta` que entran por pull request a `main` con Conventional Commits en español ([`../../../AGENTS.md`](../../../AGENTS.md), "Git y secretos" y "Pull requests").
- No se aplicó: CI/CD. No hay flujos de trabajo en `.github/` y las pruebas se corren a mano. El despliegue se hace a mano a Heroku. Tampoco hay pruebas de carga, BDD, Selenium, Kubernetes ni Jenkins.
- Productividad e IA: ver [Tema 6.2](#62-tendencias-actuales).

### 4.2 API

- Qué vimos: REST, endpoints y versionado, OpenAPI y Swagger, OAuth 2.0 y JWT, validación y serialización, limitación de tasa.
- Dónde se aplica:
    - REST con JSON bajo `/api/v1/` (`backend/core_pasteleria/api/urls.py`).
    - Contrato OpenAPI con `drf-spectacular` en `/api/v1/schema/` y Swagger UI en `/api/v1/docs/`, esta última solo para el personal con sesión (D28; `SPECTACULAR_SETTINGS` en `backend/config/settings.py`).
    - JWT con SimpleJWT: el access token vive solo en memoria del navegador y el refresh va en una cookie HttpOnly, Secure y SameSite=Lax con rotación, lista negra y CSRF (D15 y D62; `frontend/src/models/session.ts`, `backend/core_pasteleria/api/auth_views.py`).
    - OAuth 2.0 con Google Identity Services: el backend verifica el ID token (`backend/core_pasteleria/services/google_identity.py`, ruta `auth/google/`). Una cuenta de correo se liga a Google solo si Google es la autoridad del correo (D62). Referencia: RFC 6749 (Hardt, 2012).
    - Validación: serializadores, un parser que limita el JSON a 16 KB (`backend/core_pasteleria/api/parsers.py`) y subidas validadas por contenido (D63).
    - Limitación: throttling por alcance y bloqueo por intentos con django-axes (D34 y D62).
- No se aplicó: GraphQL, gRPC, WebSocket, API Keys ni un API Gateway comercial.

### 4.3 IDE y herramientas para APIs

- Qué se usa: Swagger UI del propio contrato OpenAPI. No hay registro en el repositorio de qué IDE se usó ni de Postman. Por confirmar con el equipo.

## Tema 5. Web services

- REST (5.1): sí se aplica. Es el estilo de la API propia y el de las integraciones. Ver Tema 4.2 y 3.2.
- SOAP, WSDL, UDDI, SOA semántico (5.2): no se aplicó.
- Por qué: el curso mismo señala la transición de SOAP a REST (tendencias, 6.2). Mercado Pago, Stripe y Google ofrecen APIs REST con JSON, de modo que no había ningún servicio SOAP que consumir. El proyecto no expone servicios a otras empresas, así que no hay un contrato WSDL que publicar.
- Lo más cercano a un contrato formal: el esquema OpenAPI que genera `drf-spectacular` (D28), que cumple un papel parecido al de un WSDL pero para REST.
- Relación con SOA: el backend separa capas (`api/`, `services/`, `repositories/`), pero es un monolito modular, no un conjunto de servicios con un bus.

## Tema 6. Calidad de software

### 6.1 Calidad y normas

ISO/IEC 25010: el proyecto no la usa como marco formal ni se evaluó contra ella. La tabla relaciona sus características con lo que el proyecto sí hace, solo como lectura del equipo, sin medición.

| Característica | Qué hay | Dónde |
| --- | --- | --- |
| Adecuación funcional | Reglas de negocio validadas con la pastelería y probadas | [`../../reglas-de-negocio.md`](../../reglas-de-negocio.md), `backend/tests/` |
| Eficiencia de desempeño | Build comprimido con brotli y gzip (D56), escena 3D en un chunk diferido (D48), presupuesto de 150 000 triángulos por escena | `frontend/scripts/compress-dist.mjs`, `frontend/src/three/pieceBudget.ts`. No hay pruebas de carga |
| Compatibilidad | Probado en Chromium; la transición entre vistas solo se probó ahí (D100) | `frontend/playwright.config.ts` |
| Capacidad de interacción y accesibilidad | Objetivo WCAG 2.1 AA: contraste con tokens, foco visible, teclado, etiquetas reales y `prefers-reduced-motion` | [`../pruebas.md`](../pruebas.md), "Accesibilidad" |
| Fiabilidad | Pagos idempotentes, webhooks repetidos procesados una vez, agenda con control de concurrencia | `backend/tests/test_payment_webhooks.py` |
| Seguridad | Sesión con cookie HttpOnly, CSRF, CSP, Argon2 para contraseñas, bloqueo por intentos, webhooks con firma, pedir un recurso ajeno devuelve 404 | [`../arquitectura.md`](../arquitectura.md), "Seguridad"; D28, D34 y D62 |
| Mantenibilidad | Capas con responsabilidades fijas, repositorios en memoria para pruebas, identificadores en inglés (D29) | [`../arquitectura.md`](../arquitectura.md) |
| Portabilidad | Un solo servicio en Heroku; la base local en Docker | `Procfile`, `backend/compose.yaml` |

Sobre la accesibilidad, [`../pruebas.md`](../pruebas.md) dice que la herramienta automática de auditoría no está elegida. Lo que consta es una revisión por pantalla a 1440 px y a 390 px con el teclado, y una revisión de contraste de la paleta (bitácora del 31 de octubre). La revisión final de accesibilidad figura en la Etapa 5 del plan. No afirmar un resultado que no esté registrado.

ISO/IEC 25012 (calidad de datos), blockchain, microservicios, alta disponibilidad (regla de los nueves) y DevSecOps formal: no aplican o no se midieron. El despliegue es un solo dyno Basic en Heroku (D38), sin balanceo ni réplica, y la escalabilidad no se probó. Lo único que se hizo por escalabilidad es el límite de intentos y la caché compartida para el throttling (D33).

Pruebas (ISTQB): hay pruebas funcionales (precio, agenda, pagos, observadores), estructurales de poca profundidad y no funcionales de seguridad (webhooks con firma inválida, monto alterado, throttling). No hay pruebas de rendimiento.

Metodología: iterativa por etapas con una revisión al cierre de cada una y decisiones registradas; no se usó Scrum ni Kanban formal. Por confirmar si el equipo quiere presentarlo como ágil.

### 6.2 Tendencias actuales

- Agentes de código y `AGENTS.md`: el repositorio tiene un [`../../../AGENTS.md`](../../../AGENTS.md) en la raíz como fuente única de instrucciones para cualquier agente, y otros en `backend/` y `frontend/`. Los `CLAUDE.md` solo lo importan (D8). Define el vocabulario, las reglas que no se negocian y las prohibiciones (los agentes no hacen commits ni push ni se agregan como coautores, D16). Esto corresponde a la tendencia de la clase sobre agentes y `AGENTS.md`.
- Qué hicieron los agentes y cómo se revisó: por confirmar con el equipo. El repositorio documenta las reglas, no cuánto del código escribió un agente.
- Contract-first y OpenAPI: parcial. El contrato se genera desde el código con `drf-spectacular`; no se escribe antes (no es contract-first).
- Monolito modular frente a microservicios: se eligió un monolito modular con capas (D26, D37), en línea con el caso de la clase.
- Playwright con agentes de IA: no se usó el servidor MCP ni los agentes de pruebas de Playwright. Se usa Playwright de forma convencional.
- SOAP a REST: ver [Tema 5](#tema-5-web-services).
- IoT, Edge AI: no aplican.

## Cifras de pruebas por fecha

Los documentos del repositorio dan cifras de fechas distintas. No mezclarlas.

| Fecha | Qué | Cifra | Fuente |
| --- | --- | --- | --- |
| 6 de noviembre de 2026 | Pruebas de backend recolectadas; Playwright | 934 de backend; 173 de Playwright | [`../pruebas.md`](../pruebas.md), párrafo inicial |
| 6 de noviembre de 2026 | Cierre de la Etapa 2 | 801 de backend y 91 E2E | [`../plan-de-trabajo.md`](../plan-de-trabajo.md), Etapa 2 |
| 13 de noviembre de 2026 | Cierre de la Etapa 3 | de 801 a 1286 de backend que pasan, una se salta | [`../plan-de-trabajo.md`](../plan-de-trabajo.md), Etapa 3 |
| 22 de noviembre de 2026, local | `pytest -n auto --create-db` desde `backend/` | 2375 pasaron | [`../pruebas.md`](../pruebas.md); [`../../bitacora.md`](../../bitacora.md) |
| 22 de noviembre de 2026, local | Playwright, 29 archivos con `--workers=3` | 509 de 514 pasaron | Las mismas |

Las cinco fallas de Playwright del 22 de noviembre: tres pasaron al correrlas solas (`e2e/cake-designer.spec.ts:670`, `e2e/cake-render.spec.ts:99` y `e2e/hero-cake.spec.ts:295`) y dos fallan por el tiempo de 30 segundos bajo carga, también con el código de `main` (`e2e/access.spec.ts:134` y `e2e/product-model.spec.ts:98`).

Lo que no se verificó: Heroku, un teléfono real, Gmail en iOS u Outlook con tema oscuro, y la transición entre vistas fuera de Chromium.

## Trabajo a futuro

Cada punto se verificó contra el código el 22 de noviembre de 2026. Fuentes: [`../../pendientes.md`](../../pendientes.md), [`../../reglas-de-negocio.md`](../../reglas-de-negocio.md) (secciones 8, 9, 10 y 14), la tabla "Decisiones abiertas" de [`../decisiones.md`](../decisiones.md) y las cajas punteadas de [`../diagramas/contexto.svg`](../diagramas/contexto.svg). Tamaño: chico (menos de un día), mediano (de uno a tres días) o grande (más de tres días); es una estimación del guion, no del equipo, y queda por confirmar.

### Personal

| Punto | Decisión | Qué existe hoy | Qué falta | Tamaño |
| --- | --- | --- | --- | --- |
| Vistas del personal en el sitio | D64 | El personal usa solo el admin: `backend/core_pasteleria/admin.py` cobra en efectivo (cambio de estado a "Recibido"), registra "Base devuelta" (`StandLoanAdmin`), cotiza (`quoted_decoration_price`, "Envíos de referencia") y cancela antes del pago. La sesión del sitio es solo de clientes (D62) y `/nota/:token` solo verifica | Sesión y rutas protegidas para el personal en el frontend, endpoints con permiso propio fuera de `admin.py`, y las vistas. El diagrama de contexto lo dibuja punteado | Grande |
| Reembolso desde el admin | D68, D70 | Un pago `refund_required` lo devuelve el personal a mano en el panel de la pasarela. No hay un método `refund` en `services/payments/mercadopago_adapter.py` ni en `stripe_adapter.py` | Un método `refund` por adaptador, un estado `refunded` con migración, el permiso, la auditoría y el botón. El usuario lo dejó solo si sobraba tiempo. Un pedido pagado no se cancela desde el admin mientras tanto (`services/orders/order_status.py`) | Mediano |
| Permisos separados | D63 ronda 2 | `change_order` cubre cotizar y cancelar; el efectivo tiene `register_cash_payment` | Los permisos `price_order_quote` y `cancel_order` | Chico |
| Historial de estados | D69 | `Order.status_changed_at` y la fecha del pago (`paid_with`) | Una tabla de cambios de estado para mostrar la fecha de cada paso en `frontend/src/views/OrderDetail.tsx` | Mediano |

### Cliente

| Punto | Decisión | Qué existe hoy | Qué falta | Tamaño |
| --- | --- | --- | --- | --- |
| Cotización: ida y vuelta | D63 (ronda 2), D70 | Envío de referencia completo: `ReferenceRequest` (`in_review`, `quote_ready`, `accepted`, `cancelled`), cotización en el admin con permiso `set_reference_quote`, correos `REFERENCE_RECEIVED` y `QUOTE_READY` (`CustomerEmailObserver` en `backend/core_pasteleria/services/orders/order_observer.py`), `/cuenta/cotizaciones/:id` con base y "Pagas hoy", "Aceptar y pagar" (`POST reference-requests/<id>/accept/`) y "Cancelar solicitud". Un pedido con "Otra decoración" nace `awaiting_quote` y `services/orders/quote_service.py` lo pasa a `awaiting_payment` al poner el precio; el detalle ofrece entonces el enlace de pago | (1) "Pedir un cambio" y "Escribir por WhatsApp" abren WhatsApp: no hay contraoferta ni versiones de la cotización en el sitio. (2) El pedido en `awaiting_quote` no manda correo al recibir precio: `CustomerEmailObserver.ORDER_EMAILS` solo cubre `received` y `ready_for_delivery`. (3) Una cotización no vence ni cancela sola: `PolicySettings.reference_quote_valid_hours` y `quote_expiry_hours` están vacíos (PENDIENTE de la pastelería), y `cancel_expired_orders` solo cancela cotizaciones sin precio si el segundo tiene valor. (4) Menores de la revisión de D70: recotizar reinicia `quoted_at` y reenvía el correo, aceptar no fija el precio que vio el cliente, y el correo de cotización no dice el depósito ni lo que se paga hoy | Mediano; el vencimiento depende de una respuesta de la pastelería |
| Volver a pedir | D69 | Los pedidos anteriores llevan "Ver pedido" | Armar el carrito desde un pedido, decidiendo qué pasa con precios de hoy, vitrina del día y diseños con imagen | Mediano |
| Correo de la cuenta y cuentas sin confirmar | D72, D76 | El correo es de solo lectura en `/cuenta/datos`; el superusuario puede cambiarlo en el admin. Las cuentas sin confirmar se quedan. `backend/core_pasteleria/management/commands/` solo tiene `cancel_expired_orders.py` | Cambio de correo con verificación y un comando que purgue las cuentas viejas sin confirmar, con un plazo que decide el equipo | Mediano |
| Correos que faltan | D70, D72 | Salen el de pago recibido, pedido listo, referencia recibida y cotización lista | Correo al cancelar o devolver, al devolver una base y al cambiar la contraseña o el teléfono | Chico a mediano |
| Avisos por WhatsApp | regla 15 | `User.notify_whatsapp` es solo una preferencia | Un envío automático (por ejemplo, la API de WhatsApp Business). No se planea sin que la pastelería lo pida | Grande |

### Entrega y logística

| Punto | Decisión | Qué existe hoy | Qué falta | Tamaño |
| --- | --- | --- | --- | --- |
| API de rutas para la entrega a domicilio | D61, D66 | La tarifa aprobada vive en `DeliveryFeeBand` (`models.py`); `GET delivery-slots/` da el calendario; en `/pedido/entrega` la opción a domicilio sale desactivada con enlace a WhatsApp. No hay código de distancia en el backend | Elegir la API (las reglas sugieren Google Distance Matrix), pedir la dirección del cliente, calcular km, aplicar `DeliveryFeeBand` y guardar dirección y costo en el pedido. Implica datos personales nuevos y su aviso de privacidad | Grande |
| Repartidor propio o aplicación | reglas 14, punto 2 | Sin dato | La respuesta de la pastelería: con repartidor propio, la tarifa debería subir | Dato de la pastelería |
| Envío gratis de 15 kg o más a más de 15 km | decisiones abiertas | El código de referencia de la sección 8 devuelve $0 | La respuesta de la pastelería | Dato de la pastelería |
| Mapa dentro del sitio | D71 | "Cómo llegar" abre Google Maps en otra pestaña | Abrir `frame-src` en la CSP (`backend/config/csp.py`) y avisarlo en el aviso de privacidad | Chico |

### Negocio y legal

| Punto | Decisión | Qué existe hoy | Qué falta | Tamaño |
| --- | --- | --- | --- | --- |
| Aviso de privacidad y términos | reglas 13 y 14 | `/legal` con las anclas `#privacidad` y `#terminos` (`frontend/src/views/Legal.tsx`) y marcador visible | El texto. El equipo prepara un texto base y la pastelería lo completa | Contenido, no código |
| Política de cambios, base dañada y base fuera de plazo | D5, reglas 14 | `PolicySettings.damaged_stand_policy` vacío; `/bases` muestra "[Condiciones por confirmar]". La devolución siempre reembolsa el depósito completo (`services/warranty_service.py`). Sin días de gracia | La política de la pastelería y, si cobra un descuento, un cálculo en `warranty_service.py` | Chico, tras la respuesta |
| Conservación de datos de quien recoge | reglas 8 | `Order.pickup_name` y `Order.pickup_phone` se guardan con el pedido | Un plazo y un borrado o anonimizado programado | Chico a mediano |
| Datos de catálogo | D77, D78, reglas 14 | Los campos existen y están vacíos o propuestos | Precio de "Tres leches de nuez" (`CatalogPrice.amount`), peso del pastel mini, precio de las rosas del mini (`DecorationOption.mini_price`) y descripciones reales de cada pastel, que la pastelería escribe en el admin (por confirmar cuáles ya se escribieron) | Dato de la pastelería |
| Valores propuestos | D63, D70 | En `PolicySettings` y `UploadSettings`: 30 minutos para pagar, 2 pedidos sin pagar, 60 días a futuro, 24 horas de pausa de la vitrina, 5 MB por imagen y otros | Que la pastelería los confirme o los cambie en el admin | Dato de la pastelería |

### Operación y calidad

| Punto | Decisión | Qué existe hoy | Qué falta | Tamaño |
| --- | --- | --- | --- | --- |
| Limpiezas programadas | D26, D63 | `cancel_expired_orders` ya corre en Heroku Scheduler cada 10 minutos: los registros del 22 al 23 de noviembre de 2026 muestran 93 corridas de `scheduler@addons.heroku.com`, todas con salida 0. También corre al crear un pedido, para los vencidos de su cliente | Programar `flushexpiredtokens` y `axes_reset_logs --age 90`, que no aparecen en esos registros (decisiones abiertas de [`../decisiones.md`](../decisiones.md), fila de endurecimiento) | Chico |
| Integración continua | D11 | Git, ramas y PR; sin `.github/` | Un flujo que corra pytest, `typecheck`, `lint` y Playwright en cada PR | Mediano |
| Carga diferida de rutas | pendientes D59 | `frontend/src/App.tsx` importa todas las vistas; solo las rutas de desarrollo usan `lazy` | `React.lazy` por ruta. El chunk principal pasó de 488 kB a 544 kB al cierre de la Etapa 3 | Chico |
| Imágenes huérfanas | D63, D55 | Tope de 10 por cliente; `UploadSettings.daily_upload_mb` y `daily_upload_count` no se usan en `services/customer_image_service.py` | Un barrido periódico en PostgreSQL y en IndexedDB (`ilusion.designImages`), y aplicar o quitar esos dos campos | Mediano |
| Correos en cola | D70, D76 | Salen en la misma petición con corte de 5 s; los de la cuenta, en un hilo `daemon` que se pierde si el dyno reinicia | Una cola de tareas, que agrega un servicio | Grande |
| Endurecimiento | D28, D40 | CSP del sitio y la API, bloqueo por intentos, llaves separadas | Sesión más corta y CSP para el admin y Swagger; HSTS con subdominios al cierre | Chico a mediano |
| Verificaciones que no se hicieron | pendientes D68, D71, [`../pruebas.md`](../pruebas.md) | Pruebas con SDK simulados y Playwright en Chromium | Pagos con cuentas sandbox de punta a punta (incluido 3D Secure y los webhooks firmados), Heroku con las últimas migraciones, un teléfono real, correos en Gmail y Outlook, y auditoría de accesibilidad con herramienta automática | Mediano |
| Deuda de pruebas | pendientes | `e2e/cake-designer-lid.spec.ts:210` falla desde antes en `main`; `e2e/access.spec.ts:134` y `e2e/product-model.spec.ts:98` fallan por tiempo bajo carga | Arreglar la estimación del contorno del mensaje y subir los tiempos | Chico a mediano |
| Archivos grandes | pendientes D78 | `backend/core_pasteleria/services/pricing_service.py` mezcla reglas del catálogo (según `pendientes.md`, más de 1000 líneas; no se contó) | Separarlo después del congelamiento para no caer en el antipatrón de Objeto Dios | Mediano |

### Puntos de `pendientes.md` que ya estaban hechos y no se listan

- Precios de decoraciones (D54), colores y aspecto de la vista previa (D51 y D52) y compresión del build (D56).
- Comando `cancel_expired_orders`, programado en Heroku Scheduler cada 10 minutos; extensión del plazo del efectivo (D68), cancelación del personal antes del pago.
- `StandLoanObserver`, el evento "base devuelta" y el cancelado de PaymentIntent (`StripeCheckoutObserver`).
- Pantallas de pago, confirmación, "Mis pedidos", detalle, "Bases en préstamo" y `/nota/:token`; lista de solicitudes de cotización; cancelación sin corte de horas por el cliente.
- Base y sabor dentro de la solicitud de referencia; fotos de la solicitud para quien cotiza; confirmar el correo y recuperar la contraseña (D76); dirección y WhatsApp (dados el 15 de noviembre); proveedor de correo (Brevo, D70).
- Las muestras de color en el carrito, que D99 quitó de la interfaz.

## Lo que el proyecto no hace

Para responder con honestidad si el profesor pregunta por algo que no está:

- Entrega a domicilio en línea: la pantalla la muestra desactivada y remite a WhatsApp (D66). La API de rutas queda a futuro.
- Vistas del personal dentro del sitio: el personal trabaja solo en el admin de Django (D64).
- Reembolsos automáticos: los hace el personal a mano desde el panel de la pasarela (D68, D70).
- Política de cambios, base dañada y aviso de privacidad y términos: PENDIENTES de la pastelería.
- Pagos reales: Mercado Pago y Stripe están en sandbox.
- WhatsApp automático: el sitio no manda mensajes de WhatsApp (regla 15).
- CI/CD, pruebas de carga, alta disponibilidad y accesibilidad con herramienta automática.
