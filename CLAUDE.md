# Pastelería Ilusión: e-commerce

Sitio de una pastelería familiar real de la Ciudad de México: catálogo, vitrina del día, rebanadas, carrito, pago, cuenta del cliente y **"Diseña tu pastel"**, un pedido personalizado paso a paso con vista previa 3D. Todo el sitio está en español de México. El sitio nunca menciona que es un proyecto escolar.

## Stack

- **Frontend:** React + Tailwind CSS, arquitectura MVVM (vistas sin lógica de negocio; view-models con estado y llamadas a la API). Vista previa 3D con react-three-fiber.
- **Backend:** Django + Django REST Framework, PostgreSQL.
- **Pagos:** Mercado Pago y Stripe, ambos en modo sandbox. Efectivo en la pastelería = pedido apartado.
- **Acceso:** Google (OAuth 2.0) y correo con contraseña.

Estructura: `frontend/` y `backend/` en la raíz (por crear). Los comandos de cada uno se agregan aquí cuando existan.

## Fuentes de verdad (léelas antes de construir algo)

| Necesitas | Lee |
| --- | --- |
| Cómo se comporta algo, precios, límites, cálculos | `docs/reglas-de-negocio.md` |
| Cómo se ve algo: color, tipografía, componentes, redacción | `docs/libro-de-marca.md` |
| Cómo está armada cada pantalla, en escritorio y móvil | `docs/mapa-de-vistas.md` (rutas, archivo fuente y capturas) |
| Tokens listos para usar | `diseno/tokens.css`, `diseno/tailwind.preset.js` |
| Bordes de duya, flama, esqueletos, comportamiento del pastel 3D | `diseno/referencia/` |
| Logos, dibujos de línea y fuentes | `assets/` |

El mockup (`mockup/fuente/*.dc.html`) es la referencia visual de cada pantalla: respeta su estructura, jerarquía y textos. Es HTML de prototipo: no copies su CSS en línea, tradúcelo a componentes con los tokens.

## Reglas que no se negocian

1. **No inventes datos.** Lo marcado como PENDIENTE en las reglas de negocio queda configurable (en la base de datos o el admin) con un marcador visible; nunca un valor supuesto. Esto incluye dirección, WhatsApp y textos legales.
2. **Precios y límites en la base de datos, no en el código.** La pastelería los cambia sin un despliegue.
3. **Solo los tokens de la paleta Fresa y mermelada.** Nada de colores sueltos. Los estados no son pastillas de color (ver libro de marca).
4. **Vocabulario del sitio:** "pedido" (no "pastel personalizado"), "Diseña tu pastel" (nunca "cotizador" en la interfaz), "base" (no "stand"), "cotización" solo para pedidos con foto de referencia. El 3D no se anuncia en títulos ni botones.
5. **Accesibilidad WCAG 2.1 AA:** contraste, foco visible, navegación con teclado, etiquetas reales, `prefers-reduced-motion`. Cada estado lleva palabra, no solo color.
6. **Responsivo de verdad:** cada pantalla tiene su versión móvil en el mockup; constrúyela, no la deduzcas.
7. **Si algo es ambiguo, pregunta** antes de suponer. Si una regla de negocio y el mockup se contradicen, gana la regla de negocio y avisa.

## Cómo trabajar

- Antes de cada pantalla: abre su fila en `docs/mapa-de-vistas.md`, mira sus capturas de escritorio y móvil y lee las reglas que le aplican.
- Al terminar: compárala en el navegador contra las capturas, a 1440 px y 390 px, y revisa contraste y teclado.
- Cambios pequeños y verificables. Cuando una regla cambie, actualiza el documento que la define, no solo el código.

## Skills de diseño

`scripts/instalar-skills.sh` instala en `.claude/skills/` las skills de diseño que se usaron en el mockup (frontend-design se incluye con Claude Code; impeccable, anti-slop, ui-ux-pro-max y otras). Úsalas al construir y revisar interfaz.
