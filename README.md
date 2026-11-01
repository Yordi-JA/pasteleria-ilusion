# Kit de Pastelería Ilusión para Claude Code

Todo lo necesario para construir el sitio con Claude Code: reglas de negocio, libro de marca, tokens, recursos, el mockup completo con capturas y las instrucciones para el agente.

## Cómo empezar

1. Copia el contenido de esta carpeta en la raíz del repositorio del proyecto (incluida la carpeta oculta `.claude/`).
2. Instala las skills de diseño: `bash scripts/instalar-skills.sh` (requiere git).
3. Abre Claude Code en la raíz y pega el bloque de `PROMPT_MAESTRO.md`.

La primera vez, Claude Code puede pedir confirmar que confías en la carpeta; acéptalo para que cargue `CLAUDE.md`, las reglas y las skills.

## Qué hay aquí

| Carpeta o archivo | Contenido |
| --- | --- |
| `CLAUDE.md` | Contexto que Claude Code carga en cada sesión: proyecto, stack, fuentes de verdad y reglas que no se negocian |
| `.claude/rules/` | Reglas que se cargan solo al trabajar en `frontend/` o en `backend/` |
| `PROMPT_MAESTRO.md` | El primer mensaje para Claude Code, con las fases del trabajo |
| `docs/reglas-de-negocio.md` | Precios, límites, cálculos y pendientes de la pastelería |
| `docs/libro-de-marca.md` | Color, tipografía, componentes, redacción y accesibilidad |
| `docs/mapa-de-vistas.md` | Cada pantalla con su ruta sugerida, archivo fuente y capturas |
| `docs/fotografia.md` | Cómo deben ser las fotos de producto |
| `diseno/` | `tokens.json`, `tokens.css`, `tailwind.preset.js` y código de referencia (duya, flama, esqueletos, pastel 3D) |
| `assets/` | Logos, dibujos de línea y fuentes |
| `mockup/fuente/` | Las 120 vistas del mockup en HTML y el índice del lienzo |
| `mockup/capturas/` | Captura de cada vista en escritorio (1200 px) y móvil (390 px) |
| `scripts/instalar-skills.sh` | Instala 13 skills de diseño en `.claude/skills/` (`--todas` para instalar todo) |

## Pendientes de la pastelería

Están en la sección 14 de `docs/reglas-de-negocio.md`: precio de las decoraciones fijas, repartidor, vigencia de la cotización, políticas de cambios y cancelaciones, dirección, WhatsApp y textos legales. El sitio se construye con esos datos configurables, sin inventarlos.

## Licencias de las fuentes

Fraunces e Instrument Sans se distribuyen con la licencia SIL Open Font License 1.1.
