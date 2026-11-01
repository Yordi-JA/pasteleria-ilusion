# Prompt maestro

Pega el bloque de abajo como primer mensaje en Claude Code, desde la raíz del repositorio, después de correr `bash scripts/instalar-skills.sh`.

---

Vas a construir el sitio de Pastelería Ilusión, una pastelería familiar real de la Ciudad de México. Trabaja como orquestador: planea, delega en subagentes las tareas que se puedan separar (frontend, backend, revisión de diseño, pruebas) y verifica tú cada entrega antes de darla por buena.

**Antes de escribir código**
1. Lee `CLAUDE.md`, `docs/reglas-de-negocio.md`, `docs/libro-de-marca.md` y `docs/mapa-de-vistas.md`, y revisa las capturas de `mockup/capturas/`.
2. Revisa que las skills de `.claude/skills/` estén disponibles; úsalas al construir y al revisar interfaz (impeccable, antislop, ui-ux-pro-max).
3. Escríbeme un plan corto: estructura del repositorio, modelos de datos, endpoints principales y orden de las pantallas. Dime cualquier contradicción o hueco que encuentres en los documentos. Espera mi aprobación.

**Fases** (al cerrar cada una, muéstrame qué quedó, cómo lo verificaste y qué decisiones tomaste; espera mi visto bueno antes de la siguiente)
1. **Base.** `frontend/` (React, Tailwind con `diseno/tailwind.preset.js`, MVVM) y `backend/` (Django, DRF, PostgreSQL). Componentes base del libro de marca: botones, campos, tarjetas, opciones elegibles, bordes de duya, perlas de avance, esqueletos, avisos, barra superior con toldo y pie. Una página de muestra con todos ellos.
2. **Catálogo.** Modelos de productos e inventario; portada, catálogo, vitrina, rebanadas y ficha de producto, con sus estados de carga, vacío y agotado. Admin para que la pastelería edite productos, precios y existencias.
3. **Cuenta y compra.** Acceso con Google y con correo (registro, verificación, recuperar), carrito, entrega (horarios con capacidad, domicilio con tarifa por distancia), pago en sandbox con Mercado Pago y Stripe, efectivo como pedido apartado, confirmación, "Mis pedidos", detalle con perlas de avance y bases.
4. **Diseña tu pastel.** Los 8 pasos con todas sus reglas y restricciones validadas en el backend, precios calculados por el backend, vista previa con react-three-fiber que evoluciona por etapas como en las capturas, revisión y paso al carrito.
5. **Referencia y nota.** Pedido con foto de referencia (pausa hasta cotizar), cotización, nota en PDF con QR y su página de verificación, registro de devolución de bases para el personal.
6. **Cierre.** Accesibilidad WCAG 2.1 AA en todas las pantallas, pruebas de la lógica de negocio, revisión con antislop e impeccable, y una lista de lo que quedó PENDIENTE de datos de la pastelería.

**Reglas para todo el trabajo**
- No inventes datos: lo PENDIENTE queda configurable y visible en el admin.
- Construye cada pantalla en escritorio y en móvil, y compárala contra sus dos capturas.
- Si dudas entre dos interpretaciones, pregúntame; no elijas en silencio.
- El sitio nunca menciona que es un proyecto escolar.
