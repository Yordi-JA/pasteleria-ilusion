# Tecnologías

Cada tecnología tiene un rol y una justificación. Las versiones se fijaron el 2 de noviembre de 2026, al inicializar Django y React (D24 y D25 en [`decisiones.md`](decisiones.md)). Las de las tecnologías que aún no se instalan se fijan al instalarlas. La fuente exacta de cada versión es `backend/requirements.txt` y `frontend/package.json`.

## Contenido

- [Tabla de tecnologías](#tabla-de-tecnologías)
- [Framework: por qué Django y React](#framework-por-qué-django-y-react)
- [Fuentes tipográficas y licencias](#fuentes-tipográficas-y-licencias)
- [Decisiones abiertas](#decisiones-abiertas)
- [Ver también](#ver-también)

## Tabla de tecnologías

| Tecnología | Rol en el proyecto | Justificación | Versión |
| --- | --- | --- | --- |
| React | Interfaz del sitio, organizada en MVVM | Componentes declarativos y hooks para los view-models; ecosistema para el 3D | 19.3.1 |
| TypeScript | Lenguaje del frontend; tipos de los contratos de la API en `models/` | Detecta errores al conectar pantallas con la API | 7.0.2 |
| Vite | Servidor de desarrollo y build del frontend | SPA servida desde el mismo origen que la API (D15, D26) | 8.3.5 (Node 22 LTS) |
| React Router | Rutas de [`../mapa-de-vistas.md`](../mapa-de-vistas.md) | Rutas anidadas (`/cuenta/...`) y 404 sin piezas extra | 8.5.1 |
| oxlint | Lint del frontend | Viene con la plantilla de Vite; typescript-eslint aún no soporta TypeScript 7 (D25) | 1.89.0 |
| Tailwind CSS | Estilos del frontend, con los tokens de la paleta en `design/tailwind.preset.js` | Los tokens del libro de marca se traducen a clases sin colores sueltos | 3.4.19 |
| `react-three-fiber` y three.js (WebGL) | Vista previa 3D del pastel en "Diseña tu pastel" | Render declarativo de WebGL dentro de React; la escena evoluciona por etapas, de acuerdo con las capturas | Se fija al instalarla (Etapa 3) |
| Django | Backend: ORM, admin, autenticación y migraciones | "Batteries included": el ORM y el admin dan la base de datos y la edición de precios y límites sin código extra | 5.2.18 LTS (Python 3.11) |
| Django REST Framework | API REST bajo `/api/v1/`: serializadores, paginación y throttling | Serializadores como DTOs y vistas que solo coordinan HTTP | 3.18.3 |
| PostgreSQL | Base de datos relacional de productos, pedidos, garantías y agenda | Transacciones ACID para cobros, agenda sin empalmes y depósitos | 18 (Docker en desarrollo, Heroku Postgres en producción) |
| SimpleJWT | Autenticación con JWT que liga pedidos y garantías a la cuenta | Integración directa con DRF | 5.5.1 |
| `drf-spectacular` (OpenAPI 3) y `drf-spectacular-sidecar` | Contrato OpenAPI y Swagger UI en `/api/v1/docs/` | Permite probar los endpoints en vivo durante la demostración, con sesión de personal; el sidecar sirve Swagger UI desde el propio sitio (D28) | 0.30.0 y 2026.10.1 |
| django-environ | Lectura de `.env` y de `DATABASE_URL` | Entiende el `DATABASE_URL` de Heroku y respeta las variables del entorno (D24) | 0.14.0 |
| django-cors-headers | CORS con orígenes explícitos del entorno | Solo para desarrollo; en producción el origen es el mismo (D26) | 4.9.0 |
| argon2-cffi | Hash de contraseñas con Argon2 | Resiste mejor el crackeo con GPU que PBKDF2 (D28) | 25.1.0 |
| Docker | PostgreSQL de desarrollo (`backend/compose.yaml`) | La base local sin instalar PostgreSQL en la máquina | No aplica |
| Heroku | Despliegue: un servicio con Django y el build de React, Heroku Postgres y Scheduler | Créditos del GitHub Student Developer Pack; un solo origen cumple D15 (D26) | No aplica |
| SDK de Mercado Pago (`mercadopago`) | Cobros con Mercado Pago en sandbox | Envuelto por un Adapter para no contaminar el dominio | Se fija en la Etapa 4 |
| Stripe | Cobro con tarjeta en sandbox | Se acomoda a la fábrica de pagos con su propio Adapter | Se fija en la Etapa 4 |
| Google Identity Services | Inicio de sesión con Google (OAuth 2.0) | Acceso sin contraseña para quien ya tiene cuenta de Google | Se fija en la Etapa 3 |
| `pytest` y `pytest-django` | Pruebas unitarias y de integración del backend | Permiten probar servicios con repositorios en memoria y la API con la base de pruebas | 9.2.0 y 4.14.0 |
| Playwright | Pruebas de extremo a extremo en navegador | Cubre el caso "agregar al carrito y validar el total" | 1.64.1 (Chromium) |
| Phosphor Icons (`@phosphor-icons/react`) | Iconos de acción y de estado | Terminales redondeadas que acompañan a Fraunces; el libro de marca la elige en peso Regular | Se fija al instalarla |
| Fraunces e Instrument Sans | Títulos y cuerpo del sitio | Ver [fuentes tipográficas](#fuentes-tipográficas-y-licencias) | Archivos en `assets/fuentes/` |
| Mermaid | Diagramas de la documentación | GitHub los renderiza sin herramientas extra | No aplica |
| Git y GitHub | Control de versiones y repositorio público | `main` y ramas `tipo/descripcion-corta` por PR, con Conventional Commits en español | No aplica |

Los servicios externos aparecen en el [diagrama de contexto](arquitectura.md#diagrama-de-contexto). Mercado Pago, Stripe y Google se integran en las etapas 3 y 4 del [plan de trabajo](plan-de-trabajo.md#plan-real-en-5-etapas), y su versión se fija al instalarlos.

## Framework: por qué Django y React

- Django incluye el ORM, el panel de administración y el sistema de migraciones. La pastelería edita precios, límites y existencias desde el admin sin un despliegue, que es la regla 2 del proyecto ([`../../AGENTS.md`](../../AGENTS.md#reglas-que-no-se-negocian)).
- Django REST Framework agrega serializadores, autenticación, paginación y throttling sobre el mismo modelo, y `drf-spectacular` documenta el resultado.
- React con hooks encaja con MVVM: la vista es JSX y el hook es el view-model.
- El framework se demuestra instalado y funcionando en las etapas 2 y 3. Desde el 2 de noviembre ambos proyectos están inicializados, con sus pruebas en verde.

## Fuentes tipográficas y licencias

El libro de marca ([`../libro-de-marca.md`](../libro-de-marca.md), sección "Tipografía") define el uso:

- Los títulos van en Fraunces con los ejes fijos en SOFT 100 y WONK 0. Sus terminales redondeadas parecen trazadas con duya. El archivo `assets/fuentes/Fraunces-Suave.woff2` ya trae esos ejes fijos.
- La interfaz, el cuerpo y los precios van en Instrument Sans, que tiene cifras claras y evita las sans de siempre. El archivo es `assets/fuentes/InstrumentSans.woff2`.

Ambas fuentes se publican con la licencia SIL Open Font License 1.1. Los textos oficiales están en `assets/fuentes/OFL-Fraunces.txt` y `assets/fuentes/OFL-InstrumentSans.txt`. Ninguna declara un Reserved Font Name (la expresión solo aparece en las definiciones estándar de la licencia). `Fraunces-Suave.woff2` es una versión modificada de Fraunces con los ejes SOFT y WONK fijos; como la licencia no reserva ningún nombre, no hace falta cambiarle el nombre, y cada copia que se distribuya debe llevar el aviso de copyright y la licencia.

## Decisiones abiertas

Versiones, herramienta de compilación, Tailwind y PaaS ya se decidieron (D24 a D26). Quedan abiertas estas. También están en [`decisiones.md`](decisiones.md#decisiones-abiertas).

| Decisión | Contexto |
| --- | --- |
| API de distancias para la tarifa de envío | Las reglas sugieren Google Distance Matrix ([`../reglas-de-negocio.md`](../reglas-de-negocio.md), sección 8); se decide antes de la Etapa 4 |
| Proveedor de correo | Sin elegir |

## Ver también

- [Arquitectura](arquitectura.md)
- [Pruebas](pruebas.md)
- [Decisiones](decisiones.md)
- [Referencias](referencias.md)
- [Libro de marca](../libro-de-marca.md)
