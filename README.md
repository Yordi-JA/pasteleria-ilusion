# Pastelería Ilusión

Sitio de comercio electrónico de una pastelería familiar de la Ciudad de México: catálogo, pedidos a medida y préstamo de bases con depósito.

## Contenido

- [Qué es](#qué-es)
- [Materia y equipo](#materia-y-equipo)
- [Objetivos](#objetivos)
- [Qué ofrece el sitio](#qué-ofrece-el-sitio)
- [Stack](#stack)
- [Arquitectura](#arquitectura)
- [Estado por etapa](#estado-por-etapa)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Cómo correrlo](#cómo-correrlo)
- [Documentación](#documentación)
- [Pendientes de la pastelería](#pendientes-de-la-pastelería)
- [Licencias](#licencias)

## Qué es

Pastelería Ilusión es una pastelería real, familiar, de la Ciudad de México. Este repositorio contiene su sitio web: los clientes consultan el catálogo y la vitrina del día, diseñan su pastel paso a paso, pagan en línea o apartan su pedido para pagar en efectivo, y la pastelería gestiona pedidos, inventario, entregas y bases prestadas desde el admin.

Todo el sitio está en español de México.

## Materia y equipo

Proyecto final de Negocios Electrónicos y Desarrollo Web, semestre 2027-1, grupo 3. Universidad Nacional Autónoma de México, Facultad de Ingeniería. Profesor: Mtro. Gerardo Gabriel Carrasco Zúñiga.

Equipo 02:

- Jaramillo Rodríguez Leslie Citlalli
- Jiménez Ayala Yordi Josué
- Salas Hernández Camila Alexandra

## Objetivos

Objetivo general: aplicar los conceptos de la materia para desarrollar una aplicación web de comercio electrónico que digitalice las ventas, el control de inventario y la gestión de pedidos de una pastelería local.

Objetivos específicos:

1. Catálogo digital con precios y disponibilidad en tiempo real, para compra inmediata o apartado sin ir al local.
2. Cotización, compra y pago en línea de uno o más pasteles o servicios, con carrito.
3. Pedidos a medida ("Diseña tu pastel") con precio exacto calculado por el servidor y, como complemento, una vista previa interactiva del pastel (WebGL, react-three-fiber).
4. Garantías digitales para el préstamo de bases: comprobantes en PostgreSQL ligados a la cuenta del cliente, con reembolso del depósito al devolver la base.
5. Agenda de entregas sin empalmes, con fecha propuesta por el sistema o por el cliente.
6. Cancelaciones y devoluciones claras y funcionales.

El detalle y su relación con las pantallas está en [`docs/proyecto/objetivos.md`](docs/proyecto/objetivos.md).

## Qué ofrece el sitio

- Catálogo y vitrina del día: pasteles, rebanadas y productos de precio fijo, con existencias y disponibilidad.
- "Diseña tu pastel" y envío de referencia: un pedido personalizado en 8 pasos, con una vista previa que se arma con cada paso y precio calculado por el servidor. Con una foto de referencia, la pastelería cotiza el pedido.
- Préstamo de bases con depósito: cada base prestada queda registrada en la cuenta del cliente, con nota en PDF, código QR y reembolso al devolverla.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | React, Tailwind CSS, react-three-fiber (MVVM) |
| Backend | Django, Django REST Framework (MVT con servicios y repositorios) |
| Base de datos | PostgreSQL |
| Pagos | Mercado Pago y Stripe en sandbox; efectivo como pedido apartado |
| Acceso | Google (OAuth 2.0) y correo con contraseña, con JWT |
| Contrato de la API | OpenAPI con drf-spectacular y Swagger UI |
| Pruebas | pytest, pytest-django y Playwright |

Las versiones se fijaron el 2 de noviembre de 2026 (D24 y D25) y están en `backend/requirements.txt` y `frontend/package.json`. El detalle y la justificación están en [`docs/proyecto/tecnologias.md`](docs/proyecto/tecnologias.md).

## Arquitectura

El frontend sigue MVVM: los hooks (view-models) llevan el estado y hablan con el cliente HTTP, y las vistas solo pintan. El backend es MVT con una capa de servicios para las reglas de negocio y otra de repositorios para el acceso a datos, con los patrones Factory Method, Adapter, Strategy, Observer, Repository y Decorator. Los diagramas y las decisiones están en [`docs/proyecto/arquitectura.md`](docs/proyecto/arquitectura.md).

![Diagrama de contexto. El cliente usa el frontend; el personal usa el admin de Django y el frontend. El frontend habla con el backend (/api/v1/) por HTTP con JSON y JWT. El backend usa PostgreSQL, Mercado Pago y Stripe en sandbox, Google Identity Services, el envío de correos y una API de distancias, estos dos últimos por definir. La tarea programada cancel_unpaid_cash_orders actúa sobre la API.](docs/proyecto/diagramas/contexto.svg)

## Estado por etapa

| Etapa | Fechas (2026) | Contenido | Estado |
| --- | --- | --- | --- |
| 1 | 08 al 31 de octubre | Reglas de negocio, identidad visual, libro de marca, mockup y arquitectura | Completada |
| 2 | 01 al 07 de noviembre | Backend (Django, PostgreSQL, modelos, repositorios, servicios, API en `/api/v1/`, Swagger, admin) y, en paralelo, frontend (React, Tailwind con el preset, componentes base, rutas); despliegue del esqueleto en una PaaS (ya en Heroku: https://pasteleriailusion.me, D38 y D40); servicios de precio y depósito de la base, con `GET /api/v1/cake-designs/options/` y `POST /api/v1/cake-designs/price/` (D39); datos del negocio con `GET /api/v1/store/info/` (D41); marco del sitio (barra con toldo, menú móvil, duya y pie) y las 26 rutas del mapa de vistas con su título (D42); perlas de avance y esqueleto de carga (D43) | Completada el 6 de noviembre |
| 3 | 08 al 13 de noviembre | Pantallas conectadas a la API, acceso, "Diseña tu pastel" con react-three-fiber. Hasta ahora: el mínimo para la exposición y el orden de la etapa (D44); la API pública del catálogo con `GET /api/v1/products/`, `products/<slug>/`, `featured-products/`, `showcase/` y `slices/`, y "Pasteles de la casa" elegidos en el admin (D45) | En curso |
| 4 | 14 al 19 de noviembre | Carrito, entrega y agenda, pagos, Observer, garantías de bases con nota PDF y QR, referencia, cancelaciones | Por iniciar |
| 5 | 20 al 23 de noviembre | Cierre: verificación (pruebas en el sitio desplegado, accesibilidad, video de respaldo), reporte final con referencias en APA, presentación, ensayo, etiqueta del commit final y zip del código | Por iniciar |

El código se congela el 19 de noviembre: del 19 al 23 solo se corrigen fallas, y desde el 24 no se cambia código. La exposición es el 24 o el 26 de noviembre (se planea para el 24) y la entrega, con reporte, código y presentación, el 26.

El plan completo, con la comparación contra el plan original de 8 semanas, está en [`docs/proyecto/plan-de-trabajo.md`](docs/proyecto/plan-de-trabajo.md).

## Estructura del repositorio

```text
.
├── AGENTS.md                 # Guía para agentes (CLAUDE.md la importa)
├── backend/
│   ├── core_pasteleria/      # Esqueleto: models, api/, services/, repositories/
│   └── tests/                # pytest
├── frontend/
│   ├── src/                  # models/, viewmodels/, views/, components/, three/
│   └── e2e/                  # Playwright
├── docs/
│   ├── proyecto/             # Documentos del proyecto
│   └── ...                   # Reglas de negocio, libro de marca, mapa de vistas, fotografía, bitácora
├── design/                   # Tokens, preset de Tailwind y código de referencia
├── assets/                   # Logos, motivos, dibujos de línea y fuentes
├── mockup/                   # Fuente HTML del mockup y capturas
└── scripts/                  # instalar-skills.sh
```

`backend/` y `frontend/` están inicializados desde el 2 de noviembre: Django con el modelo de usuario, el esquema del catálogo, el inventario y la configuración editable (con su semilla, admin y repositorios) y la API base, y React con Tailwind, el router y las pruebas de humo. Las pantallas y los modelos del negocio se construyen en las etapas 2 a 4.

## Cómo correrlo

Requisitos: Python 3.11, Docker con Compose y Node 22 (por ejemplo, con nvm).

1. **Backend**, desde `backend/`:
   ```bash
   python3.11 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   cp .env.example .env          # trae las variables, casi todas vacías: llénalas (ver abajo)
   docker compose up -d --wait   # PostgreSQL 18 en 127.0.0.1:5433; espera a que esté lista
   .venv/bin/python manage.py migrate
   .venv/bin/python manage.py createsuperuser
   .venv/bin/python manage.py runserver
   ```
2. **Frontend**, desde `frontend/`:
   ```bash
   nvm use                       # Node 22, según .nvmrc
   npm ci
   npm run dev                   # http://127.0.0.1:5173, reenvía /api a Django
   ```
3. **Pruebas:** `.venv/bin/pytest` en `backend/`, con la base arriba y `backend/.env` creado; `npm run test:e2e` en `frontend/` (la primera vez, `npx playwright install chromium`).

Valores mínimos de `backend/.env` para desarrollo (sin ellos Django no arranca):

```bash
SECRET_KEY=          # genera una: python3.11 -c "import secrets; print(secrets.token_urlsafe(50))"
DEBUG=True           # solo en desarrollo; sin él Django exige HTTPS
ALLOWED_HOSTS=localhost,127.0.0.1
POSTGRES_DB=ilusion
POSTGRES_USER=ilusion
POSTGRES_PASSWORD=   # una clave sin caracteres especiales de URL (por ejemplo, hexadecimal)
DATABASE_URL=postgres://ilusion:<POSTGRES_PASSWORD>@127.0.0.1:5433/ilusion
```

`DATABASE_URL` debe coincidir con las `POSTGRES_*` y el puerto. El resto de las variables y su explicación están en `backend/.env.example` y en la sección "Comandos" de [`backend/AGENTS.md`](backend/AGENTS.md#comandos) y [`frontend/AGENTS.md`](frontend/AGENTS.md#comandos). `.env` nunca se versiona.

El mockup (`mockup/fuente/*.dc.html`) son prototipos HTML de un lienzo de diseño, no una aplicación React; sus capturas están en `mockup/capturas/`.

## Documentación

| Documento | Contenido |
| --- | --- |
| [`docs/proyecto/objetivos.md`](docs/proyecto/objetivos.md) | Objetivo general y objetivos específicos |
| [`docs/proyecto/arquitectura.md`](docs/proyecto/arquitectura.md) | Arquitectura, estructura de código y patrones |
| [`docs/proyecto/plan-de-trabajo.md`](docs/proyecto/plan-de-trabajo.md) | Plan original contra plan real |
| [`docs/proyecto/tecnologias.md`](docs/proyecto/tecnologias.md) | Tecnologías, rol y justificación |
| [`docs/proyecto/pruebas.md`](docs/proyecto/pruebas.md) | Estrategia de pruebas |
| [`docs/proyecto/decisiones.md`](docs/proyecto/decisiones.md) | Registro de decisiones |
| [`docs/proyecto/referencias.md`](docs/proyecto/referencias.md) | Referencias |
| [`docs/reglas-de-negocio.md`](docs/reglas-de-negocio.md) | Precios, límites, cálculos, estados y pendientes |
| [`docs/libro-de-marca.md`](docs/libro-de-marca.md) | Color, tipografía, componentes, redacción y accesibilidad |
| [`docs/mapa-de-vistas.md`](docs/mapa-de-vistas.md) | Cada pantalla con su ruta, archivo fuente y capturas |
| [`docs/fotografia.md`](docs/fotografia.md) | Cómo deben ser las fotos de producto |
| [`docs/bitacora.md`](docs/bitacora.md) | Bitácora de trabajo |
| [`design/`](design/) | `tokens.json`, `tokens.css`, `tailwind.preset.js` y código de referencia |
| [`AGENTS.md`](AGENTS.md) | Instrucciones para agentes; hay otro en `backend/` y otro en `frontend/` |

## Pendientes de la pastelería

Faltan datos que solo la pastelería puede dar: precio de las decoraciones fijas, repartidor, vigencia de la cotización, políticas de cambios y cancelaciones, dirección, WhatsApp y textos legales. Están en la [sección 14 de las reglas de negocio](docs/reglas-de-negocio.md#14-lista-de-pendientes). El sitio los deja configurables y visibles, sin inventarlos.

## Licencias

- Fraunces e Instrument Sans se distribuyen bajo la licencia SIL Open Font License 1.1. Los textos de licencia están en [`assets/fuentes/OFL-Fraunces.txt`](assets/fuentes/OFL-Fraunces.txt) y [`assets/fuentes/OFL-InstrumentSans.txt`](assets/fuentes/OFL-InstrumentSans.txt).
- Los logos, los dibujos y la marca son de Pastelería Ilusión.
- El repositorio no declara una licencia de uso.
