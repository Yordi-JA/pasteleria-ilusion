# Reglas del frontend

Complementan el [`AGENTS.md`](../AGENTS.md) de la raíz. React + Tailwind CSS + react-three-fiber.

## Reglas de interfaz

- Tailwind con el preset `design/tailwind.preset.js`; las fuentes vienen de `assets/fuentes/` (Fraunces con eje SOFT=100 ya fijado e Instrument Sans). No cargues fuentes de Google.
- Componentes base antes que pantallas: botón (uno principal por pantalla), campo con etiqueta y error, tarjeta con borde `relieve`, opción elegible (tarjeta con radio o chip), borde de duya, perlas de avance, esqueleto de carga, aviso, barra superior con toldo y pie.
- **Bordes de duya** (`design/referencia/duya.css`): conchas bajo el encabezado, perlas en cambios fuertes de color, guirnalda siempre antes del pie; ninguno entre secciones del mismo fondo. Nunca márgenes negativos en el borde.
- **Estados:** perlas de avance para el pedido; texto en `mermelada` para los demás estados; datos de producto como texto pequeño en `mermelada-suave`. Sin pastillas de color. Excepción: "Apartado, falta tu pago" va como aviso con borde `cajeta` (libro de marca, "Pago y entrega"), nunca en `exito`.
- **Esqueletos de carga** con la misma estructura que la pantalla real (encabezado y bordes incluidos), `aria-busy` y texto para lectores de pantalla.
- **Móvil (hasta 600 px):** el contenido desplegado dentro de una opción no lleva sangría; las tarjetas anidadas bajan su relleno a 16 px; los ejemplos de los campos caben completos.
- **Diseña tu pastel:** stepper de 8 pasos a todo el ancho, una sola tarjeta por paso, panel "Tu pastel" con "Cambiar", y la vista previa que evoluciona por etapas (ver `design/referencia/pastel-css3d.js` y las capturas). En producción la vista previa es react-three-fiber; los precios los calcula el backend, el frontend solo los muestra.
- Redacción: frases cortas, tú, sin signos de exclamación ni relleno; ver la sección de redacción del libro de marca.

## Estado actual

El proyecto React está inicializado (Etapa 2): Vite + React + TypeScript, Tailwind CSS v3 con el preset `design/tailwind.preset.js`, React Router y Playwright (solo Chromium). Las versiones están fijas, sin `^` ni `~`, en `package.json` y `package-lock.json`. Node 22 (`.nvmrc`, `engines.node >= 22`).

Hoy hay una ruta raíz (`src/views/Home.tsx`, componente `Home`) y una ruta comodín (`src/views/NotFound.tsx`, componente `NotFound`), ambas mínimas, y una prueba de humo en `e2e/smoke.spec.ts`. La prueba de la ruta comodín está en `e2e/not-found.spec.ts`. Hay cinco componentes base en `src/components/` (botón `Button`, campo `TextField`, tarjeta `Card`, opción elegible `ChoiceOption` y aviso `Notice`), y la página `/muestra` (`src/views/ComponentSample.tsx`, con su view-model `useComponentSample`) que los muestra en todos sus estados; solo existe en desarrollo (`import.meta.env.DEV`) y no entra al build. Su prueba está en `e2e/muestra.spec.ts`. Los avisos usan íconos de `@phosphor-icons/react` (D36). Faltan el resto de los componentes base (duya, perlas, esqueleto, barra superior con toldo y pie), las rutas de `docs/mapa-de-vistas.md` y la vista previa 3D (react-three-fiber y cliente HTTP se instalan cuando se usen).

Detalles de la configuración:

- Las fuentes se cargan con `@font-face` en `src/index.css` desde `assets/fuentes/`, sin copiarlas. Vite las empaqueta con hash en el build y `vite.config.ts` permite servir esa carpeta en desarrollo (`server.fs.allow`).
- El servidor de desarrollo escucha en `127.0.0.1:5173` y reenvía `/api` a `http://127.0.0.1:8000` (la API vive en el mismo origen, D15).
- El linter es oxlint (`.oxlintrc.json`), el que trae la plantilla de Vite. Sin Prettier.
- `npm run build` deja el sitio en `frontend/dist/` (ignorada por Git).

## Comandos

Desde `frontend/`. Primero activa Node 22 (el Node del sistema es 18):

```bash
source ~/.nvm/nvm.sh && nvm use
```

| Comando | Qué hace |
| --- | --- |
| `npm ci` | Instala exactamente las dependencias del `package-lock.json` (usa `npm install <paquete>` solo para agregar uno) |
| `npm run dev` | Servidor de desarrollo en http://127.0.0.1:5173 |
| `npm run typecheck` | Revisa los tipos (`tsc -b`) |
| `npm run lint` | Revisa el código con oxlint |
| `npm run build` | Typecheck y build de producción en `dist/` |
| `npm run preview` | Sirve `dist/` para revisarlo |
| `npx playwright install chromium` | Una sola vez: descarga Chromium para las pruebas (sin `--with-deps`) |
| `npm run test:e2e` | Pruebas E2E con Playwright; levanta el servidor de desarrollo si no está corriendo |

## Estructura MVVM

| Carpeta | Papel | Contenido | No lleva |
| --- | --- | --- | --- |
| `src/models/` | Model | Cliente HTTP de `/api/v1/` y tipos de datos | Estado de interfaz |
| `src/viewmodels/` | ViewModel | Custom hooks (`useAlgo`) con el estado observable, las llamadas a `models/` y la lógica de vista | JSX |
| `src/views/` | View | Una página por ruta de `docs/mapa-de-vistas.md`, en JSX declarativo | Lógica de negocio ni llamadas a la API |
| `src/components/` | Componentes base del libro de marca | Botón, campo, tarjeta, duya, perlas, esqueleto, aviso, barra superior y pie | Llamadas a la API |
| `src/three/` | Escena react-three-fiber del pastel | La escena, que recibe el diseño por props | Llamadas a la API ni cálculo de precios |
| `e2e/` | Pruebas | Playwright | |

El flujo va en un solo sentido: una vista usa un view-model, el view-model usa un modelo, y el modelo habla con la API.

## Reglas de código

- El estado compartido (sesión, carrito) se acota a lo necesario. No hay un estado global para todo: es el antipatrón Estado Global.
- Los precios siempre vienen del backend. El frontend los muestra y no los recalcula.
- Los colores salen solo de los tokens del preset; nada de valores sueltos. Excepciones: el botón de Google Identity Services y los logos oficiales de Mercado Pago y Stripe conservan sus colores (libro de marca, "Inicio de sesión y pagos").
- El access token vive solo en memoria; el refresh lo pone el backend en una cookie HttpOnly. Nunca se guarda un token en `localStorage` ni `sessionStorage`.
- Solo llaves públicas en las variables de entorno del frontend (ver [`AGENTS.md`](../AGENTS.md) de la raíz, "Git y secretos").
- Los datos de tarjeta se capturan solo con los componentes oficiales de Stripe y Mercado Pago; nunca con un formulario propio de número de tarjeta.
- Cada pantalla se compara con sus capturas de escritorio y móvil, a 1440 px y a 390 px, y se revisan contraste y teclado.
- Las pruebas E2E con Playwright viven en `e2e/`. El detalle está en [`docs/proyecto/pruebas.md`](../docs/proyecto/pruebas.md).

Más contexto: [`docs/proyecto/arquitectura.md`](../docs/proyecto/arquitectura.md).
