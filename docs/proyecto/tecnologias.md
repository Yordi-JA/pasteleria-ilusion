# Tecnologías

Cada tecnología tiene un rol y una justificación. Las versiones no están fijadas: se fijan en la Etapa 2, al inicializar Django y React. Hasta entonces no se cita ningún número de versión del proyecto.

## Contenido

- [Tabla de tecnologías](#tabla-de-tecnologías)
- [Framework: por qué Django y React](#framework-por-qué-django-y-react)
- [Fuentes tipográficas y licencias](#fuentes-tipográficas-y-licencias)
- [Decisiones abiertas](#decisiones-abiertas)
- [Ver también](#ver-también)

## Tabla de tecnologías

| Tecnología | Rol en el proyecto | Justificación | Versión |
| --- | --- | --- | --- |
| React | Interfaz del sitio, organizada en MVVM | Componentes declarativos y hooks para los view-models; ecosistema para el 3D | Se fija en la Etapa 2 |
| Tailwind CSS | Estilos del frontend, con los tokens de la paleta en `design/tailwind.preset.js` | Los tokens del libro de marca se traducen a clases sin colores sueltos | Se fija en la Etapa 2 |
| `react-three-fiber` y three.js (WebGL) | Vista previa 3D del pastel en "Diseña tu pastel" | Render declarativo de WebGL dentro de React; la escena evoluciona por etapas, de acuerdo con las capturas | Se fija en la Etapa 2 |
| Django | Backend: ORM, admin, autenticación y migraciones | "Batteries included": el ORM y el admin dan la base de datos y la edición de precios y límites sin código extra | Se fija en la Etapa 2 |
| Django REST Framework | API REST bajo `/api/v1/`: serializadores, paginación y throttling | Serializadores como DTOs y vistas que solo coordinan HTTP | Se fija en la Etapa 2 |
| PostgreSQL | Base de datos relacional de productos, pedidos, garantías y agenda | Transacciones ACID para cobros, agenda sin empalmes y depósitos | Se fija en la Etapa 2 |
| SimpleJWT | Autenticación con JWT que liga pedidos y garantías a la cuenta | Integración directa con DRF | Se fija en la Etapa 2 |
| `drf-spectacular` (OpenAPI 3) | Contrato OpenAPI y Swagger UI en `/api/v1/docs/` | Permite probar los endpoints en vivo durante la demostración, con sesión de personal | Se fija en la Etapa 2 |
| SDK de Mercado Pago (`mercadopago`) | Cobros con Mercado Pago en sandbox | Envuelto por un Adapter para no contaminar el dominio | Se fija en la Etapa 4 |
| Stripe | Cobro con tarjeta en sandbox | Se acomoda a la fábrica de pagos con su propio Adapter | Se fija en la Etapa 4 |
| Google Identity Services | Inicio de sesión con Google (OAuth 2.0) | Acceso sin contraseña para quien ya tiene cuenta de Google | Se fija en la Etapa 3 |
| `pytest` y `pytest-django` | Pruebas unitarias y de integración del backend | Permiten probar servicios con repositorios en memoria y la API con la base de pruebas | Se fija en la Etapa 2 |
| Playwright | Pruebas de extremo a extremo en navegador | Cubre el caso "agregar al carrito y validar el total" | Se fija en la Etapa 2 |
| Phosphor Icons (`@phosphor-icons/react`) | Iconos de acción y de estado | Terminales redondeadas que acompañan a Fraunces; el libro de marca la elige en peso Regular | Se fija en la Etapa 2 |
| Fraunces e Instrument Sans | Títulos y cuerpo del sitio | Ver [fuentes tipográficas](#fuentes-tipográficas-y-licencias) | Archivos en `assets/fuentes/` |
| Mermaid | Diagramas de la documentación | GitHub los renderiza sin herramientas extra | No aplica |
| Git y GitHub | Control de versiones y repositorio público | `main` y ramas `tipo/descripcion-corta` por PR, con Conventional Commits en español | No aplica |

Los servicios externos aparecen en el [diagrama de contexto](arquitectura.md#diagrama-de-contexto). Mercado Pago, Stripe y Google se integran en las etapas 3 y 4 del [plan de trabajo](plan-de-trabajo.md#plan-real-en-5-etapas), y su versión se fija al instalarlos.

## Framework: por qué Django y React

- Django incluye el ORM, el panel de administración y el sistema de migraciones. La pastelería edita precios, límites y existencias desde el admin sin un despliegue, que es la regla 2 del proyecto ([`../../AGENTS.md`](../../AGENTS.md#reglas-que-no-se-negocian)).
- Django REST Framework agrega serializadores, autenticación, paginación y throttling sobre el mismo modelo, y `drf-spectacular` documenta el resultado.
- React con hooks encaja con MVVM: la vista es JSX y el hook es el view-model.
- El framework se demuestra instalado y funcionando en las etapas 2 y 3; hoy solo existe el esqueleto de carpetas.

## Fuentes tipográficas y licencias

El libro de marca ([`../libro-de-marca.md`](../libro-de-marca.md), sección "Tipografía") define el uso:

- Los títulos van en Fraunces con los ejes fijos en SOFT 100 y WONK 0. Sus terminales redondeadas parecen trazadas con duya. El archivo `assets/fuentes/Fraunces-Suave.woff2` ya trae esos ejes fijos.
- La interfaz, el cuerpo y los precios van en Instrument Sans, que tiene cifras claras y evita las sans de siempre. El archivo es `assets/fuentes/InstrumentSans.woff2`.

Ambas fuentes se publican con la licencia SIL Open Font License 1.1. Los textos oficiales están en `assets/fuentes/OFL-Fraunces.txt` y `assets/fuentes/OFL-InstrumentSans.txt`. Ninguna declara un Reserved Font Name (la expresión solo aparece en las definiciones estándar de la licencia). `Fraunces-Suave.woff2` es una versión modificada de Fraunces con los ejes SOFT y WONK fijos; como la licencia no reserva ningún nombre, no hace falta cambiarle el nombre, y cada copia que se distribuya debe llevar el aviso de copyright y la licencia.

## Decisiones abiertas

Estas decisiones se toman al inicializar el proyecto en la Etapa 2, salvo que se indique otra etapa. También están en [`decisiones.md`](decisiones.md#decisiones-abiertas).

| Decisión | Contexto |
| --- | --- |
| Tailwind v3 o v4 | El preset `design/tailwind.preset.js` está en formato v3. Al consultarla el 1 de noviembre de 2026, la documentación oficial mostraba Tailwind v4 |
| Versiones de Python y Django | Sin fijar. Al consultarla el 1 de noviembre de 2026, la documentación oficial de Django mostraba la versión 6.1 |
| Herramienta de compilación del frontend | Sin elegir |
| Versión de PostgreSQL | Sin fijar. Al consultarla el 1 de noviembre de 2026, la documentación oficial mostraba la 18 como versión actual |
| PaaS de despliegue | Sin elegir; se decide en la Etapa 2 |
| API de distancias para la tarifa de envío | Las reglas sugieren Google Distance Matrix ([`../reglas-de-negocio.md`](../reglas-de-negocio.md), sección 8); se decide antes de la Etapa 4 |
| Proveedor de correo | Sin elegir |

## Ver también

- [Arquitectura](arquitectura.md)
- [Pruebas](pruebas.md)
- [Decisiones](decisiones.md)
- [Referencias](referencias.md)
- [Libro de marca](../libro-de-marca.md)
