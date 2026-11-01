# Pastelería Ilusión: guía para agentes

Sitio de comercio electrónico de una pastelería familiar real de la Ciudad de México: catálogo, vitrina del día, rebanadas, carrito, pago, cuenta del cliente, préstamo de bases con depósito, agenda de entregas y "Diseña tu pastel", un pedido personalizado paso a paso con vista previa. Todo el sitio está en español de México.

Este archivo es la fuente única de instrucciones para cualquier agente. `backend/AGENTS.md` y `frontend/AGENTS.md` agregan las reglas de cada carpeta. Los `CLAUDE.md` solo importan estos archivos.

## Stack

- Frontend: React + Tailwind CSS, arquitectura MVVM, vista previa 3D con react-three-fiber.
- Backend: Django + Django REST Framework (MVT con servicios y repositorios), PostgreSQL, API en `/api/v1/`.
- Pagos: Mercado Pago, tarjeta con Stripe (ambos en sandbox) y efectivo en la pastelería (pedido apartado).
- Acceso: Google (OAuth 2.0) y correo con contraseña, con JWT (SimpleJWT).
- Pruebas: pytest y pytest-django en el backend, Playwright en `frontend/e2e/`.

Las versiones y la herramienta de compilación del frontend aún no se fijan. Se fijan al inicializar Django y React en la Etapa 2. No supongas números de versión.

## Fuentes de verdad

Lee lo que aplique antes de construir.

| Necesitas | Lee |
| --- | --- |
| Cómo se comporta algo, precios, límites, cálculos, estados | [`docs/reglas-de-negocio.md`](docs/reglas-de-negocio.md) |
| Cómo se ve algo: color, tipografía, componentes, redacción | [`docs/libro-de-marca.md`](docs/libro-de-marca.md) |
| Cómo está armada cada pantalla, en escritorio y móvil | [`docs/mapa-de-vistas.md`](docs/mapa-de-vistas.md) (rutas, archivo fuente y capturas) |
| Estructura de código obligatoria y patrones | [`docs/proyecto/arquitectura.md`](docs/proyecto/arquitectura.md) |
| Por qué se decidió algo | [`docs/proyecto/decisiones.md`](docs/proyecto/decisiones.md) |
| Qué se hizo y cuándo | [`docs/bitacora.md`](docs/bitacora.md) |
| Tokens listos para usar | `design/tokens.css`, `design/tailwind.preset.js` |
| Bordes de duya, flama, esqueletos, comportamiento del pastel 3D | `design/referencia/` |
| Logos, dibujos de línea y fuentes | `assets/` |

Si dos fuentes se contradicen, gana la de mayor autoridad y avisas de la contradicción:

1. Reglas de negocio (comportamiento).
2. Libro de marca (aspecto).
3. Arquitectura (estructura del código).
4. Mockup.

El mockup (`mockup/fuente/*.dc.html`) son prototipos HTML de un lienzo de diseño: 120 tableros que forman 60 vistas, en escritorio y móvil, con capturas en `mockup/capturas/`. No son React y no abren solos. Respeta su estructura, jerarquía y textos, pero no copies su CSS en línea: tradúcelo a componentes con los tokens. El frontend se construye desde cero.

## Reglas que no se negocian

1. No inventes datos. Lo marcado PENDIENTE en las reglas de negocio queda configurable (base de datos o admin) con un marcador visible, nunca con un valor supuesto. Incluye dirección, WhatsApp y textos legales.
2. Precios y límites viven en la base de datos, no en el código. La pastelería los cambia sin un despliegue.
3. Solo los tokens de la paleta Fresa y mermelada. Nada de colores sueltos. Los estados no son pastillas de color. Excepciones: el botón de Google Identity Services y los logos oficiales de Mercado Pago y Stripe conservan sus colores (libro de marca, "Inicio de sesión y pagos").
4. Vocabulario del sitio: ver la sección siguiente.
5. Accesibilidad WCAG 2.1 AA: contraste, foco visible, teclado, etiquetas reales y `prefers-reduced-motion`. Cada estado lleva palabra, no solo color.
6. Responsivo de verdad: cada pantalla tiene su versión móvil en el mockup. Constrúyela, no la deduzcas.
7. Si algo es ambiguo, pregunta antes de suponer.
8. Ningún secreto en el repositorio, que es público (ver "Git y secretos").
9. Lo académico (materia, equipo, profesor, rúbrica, plan) vive solo en `README.md` y `docs/proyecto/`. El sitio, sus textos, sus metadatos y el pie nunca mencionan que es un proyecto escolar.

## Vocabulario e idioma

En la interfaz:

- "Pedido", no "pastel personalizado".
- "Diseña tu pastel", nunca "cotizador".
- "Base", no "stand".
- "Pan", nunca "bizcocho".
- "Cotización" solo para el pedido con foto de referencia.
- El 3D no se anuncia en títulos ni botones.

En código, documentación técnica y reporte académico sí se puede decir "cotizador 3D".

Idioma del código: los identificadores del dominio van en español (`PagoBase`, `cobrar`, `crear_procesador_pago`, `REGISTRO_PASARELAS`, modelos y campos). Los nombres de archivo y sufijos técnicos que fija la arquitectura van en inglés (`pricing_service.py`, `product_repo.py`, `order_observer.py`). Comentarios y docstrings en español. Los nombres de clase que fija `docs/proyecto/arquitectura.md` (`OrderSubject`, `*Payment`, `*Observer`, `*Adapter`) son fijos y llevan el sufijo técnico en inglés.

Abierto: el modelo `Cotizaciones3D` choca con el significado de "cotización" del envío de referencia. Se resuelve en la Etapa 2 y la decisión se registra en `docs/proyecto/decisiones.md`.

## Arquitectura en corto

- Frontend en MVVM: `models/` (cliente HTTP y tipos), `viewmodels/` (hooks con estado y lógica de vista), `views/` (JSX sin lógica de negocio). Detalle en [`frontend/AGENTS.md`](frontend/AGENTS.md).
- Backend en MVT con capas: `api/` coordina HTTP, `services/` aplica las reglas de negocio, `repositories/` es la única capa que toca el ORM. Detalle en [`backend/AGENTS.md`](backend/AGENTS.md).
- Patrones obligatorios: Factory Method con Adapter para pagos, Strategy para el precio, Observer para los eventos del pedido (cambio de estado y base devuelta), Repository para el acceso a datos y Decorator para auditar operaciones.
- Antipatrones prohibidos:
  - Patrón Cosmético: una "fábrica" que solo hace `if/elif`.
  - Objeto Dios: una clase o módulo que concentra todo.
  - Estado Global: un estado compartido para todo en lugar de acotarlo.
  - Sobreingeniería: capas o abstracciones que nada necesita.

El diagrama, los contratos y la justificación están en [`docs/proyecto/arquitectura.md`](docs/proyecto/arquitectura.md).

## Cómo trabajar

- Antes de cada pantalla, abre su fila en `docs/mapa-de-vistas.md`, mira sus capturas de escritorio y móvil y lee las reglas que le aplican.
- El 3D es un complemento. Ponlo solo en los 8 pasos de "Diseña tu pastel" y en las vistas que enumera `docs/libro-de-marca.md` (sección "Presencia de marca"), en escritorio y en móvil como lo muestra el mockup. No lo agregues en ninguna otra vista, tampoco en la elección del pedido ni en el envío de referencia.
- Al terminar una pantalla, compárala en el navegador contra las capturas, con la ventana a 1440 px y a 390 px, y revisa contraste y teclado. Las capturas de escritorio miden 1200 px de ancho (el ancho del contenido); los tableros del lienzo miden 1440 px.
- Haz cambios pequeños y verificables.
- Cuando una regla cambie, actualiza el documento que la define, no solo el código.
- Cada decisión nueva se registra en `docs/proyecto/decisiones.md`.
- Al cerrar una tarea, anota el avance en `docs/bitacora.md` y actualiza el estado en `README.md`.
- Al cerrar una etapa del plan, informa qué quedó, cómo lo verificaste y qué decidiste, y espera el visto bueno antes de seguir con la siguiente. Con el visto bueno, anota la fecha real de cierre y lo que se movió en la tabla "Ejecución real" de [`docs/proyecto/plan-de-trabajo.md`](docs/proyecto/plan-de-trabajo.md). No cambies las fechas del baseline ni las del plan real: un cambio al plan real necesita una decisión nueva en `docs/proyecto/decisiones.md` y una fila en el registro de cambios del plan.
- Del 19 al 23 de noviembre de 2026 solo corrige fallas; no agregues funciones ni pantallas. Desde el 24 de noviembre no cambies código.
- Si una regla de negocio y el mockup se contradicen, gana la regla y avisas.

## Git y secretos

- La rama principal es `main`. El trabajo va en ramas `tipo/descripcion-corta` (`feat/`, `fix/`, `docs/`, `chore/`, `test/`, `refactor/`) que entran por pull request.
- Commits en Conventional Commits con la descripción en español, por ejemplo `feat(pedidos): valida el máximo de 5 pisos`. Commits pequeños.
- El repositorio es público: https://github.com/Yordi-JA/pasteleria-ilusion. Las llaves sandbox de Mercado Pago y Stripe, el client secret de Google, la `SECRET_KEY` de Django y las credenciales de la base de datos van en `.env`, que Git ignora.
- Se versiona `.env.example` con solo los nombres de las variables.
- En el frontend solo van llaves públicas (la `pk_` de Stripe, la Public Key de Mercado Pago, el client ID de Google): toda variable de entorno que lee el frontend termina en el código que se publica (en Vite, las `VITE_*`). Las llaves secretas viven solo en el `.env` del backend.
- Toda credencial descargada (JSON de Google, llaves) va en `secrets/`, que Git ignora. Los volcados de base de datos van en `backend/respaldos/`, también ignorada.
- `backend/media/` (fotos de referencia y otras subidas de clientes) nunca se versiona.
- Los agentes no hacen commits, push ni etiquetas, no generan el zip de entrega, no crean el repositorio y no se agregan como coautores (sin `Co-Authored-By`). Preparan los cambios y entregan al equipo los comandos de git.

## Comandos

Aún no existen. El proyecto Django y el proyecto React se inicializan en la Etapa 2; sus comandos de instalación, ejecución y pruebas se agregan aquí y en el AGENTS.md de cada carpeta cuando existan.

## Skills de diseño (solo Claude Code)

`bash scripts/instalar-skills.sh` instala en `.claude/skills/` las skills de diseño que se usaron en el mockup (requiere git; `--todas` instala el conjunto completo). Esa carpeta no se versiona. Úsalas al construir y revisar interfaz. Otros agentes pueden ignorar esta sección.

## Mapa del repositorio

| Ruta | Contenido |
| --- | --- |
| `backend/core_pasteleria/` | Esqueleto de la app Django: `models.py`, `api/`, `services/`, `repositories/` |
| `backend/tests/` | Pruebas de pytest |
| `frontend/src/` | `models/`, `viewmodels/`, `views/`, `components/`, `three/` |
| `frontend/e2e/` | Pruebas de Playwright |
| `docs/` | Reglas de negocio, libro de marca, mapa de vistas, fotografía y bitácora |
| `docs/proyecto/` | Documentos del proyecto: objetivos, arquitectura, plan, tecnologías, pruebas, decisiones y referencias |
| `design/` | Tokens, preset de Tailwind y código de referencia |
| `assets/` | Logos, motivos, dibujos de línea y fuentes |
| `mockup/` | Fuente HTML del mockup y sus capturas |
| `scripts/` | `instalar-skills.sh` |
