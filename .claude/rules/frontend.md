---
paths:
  - "frontend/**"
---
# Reglas del frontend

- Tailwind con el preset `diseno/tailwind.preset.js`; las fuentes vienen de `assets/fuentes/` (Fraunces con eje SOFT=100 ya fijado e Instrument Sans). No cargues fuentes de Google.
- Componentes base antes que pantallas: botón (uno principal por pantalla), campo con etiqueta y error, tarjeta con borde `relieve`, opción elegible (tarjeta con radio o chip), borde de duya, perlas de avance, esqueleto de carga, aviso, barra superior con toldo y pie.
- **Bordes de duya** (`diseno/referencia/duya.css`): conchas bajo el encabezado, perlas en cambios fuertes de color, guirnalda siempre antes del pie; ninguno entre secciones del mismo fondo. Nunca márgenes negativos en el borde.
- **Estados:** perlas de avance para el pedido; texto en `mermelada` para los demás estados; datos de producto como texto pequeño en `mermelada-suave`. Sin pastillas de color.
- **Esqueletos de carga** con la misma estructura que la pantalla real (encabezado y bordes incluidos), `aria-busy` y texto para lectores de pantalla.
- **Móvil (hasta 600 px):** el contenido desplegado dentro de una opción no lleva sangría; las tarjetas anidadas bajan su relleno a 16 px; los ejemplos de los campos caben completos.
- **Diseña tu pastel:** stepper de 8 pasos a todo el ancho, una sola tarjeta por paso, panel "Tu pastel" con "Cambiar", y la vista previa que evoluciona por etapas (ver `diseno/referencia/pastel-css3d.js` y las capturas). En producción la vista previa es react-three-fiber; los precios los calcula el backend, el frontend solo los muestra.
- Redacción: frases cortas, tú, sin signos de exclamación ni relleno; ver la sección de redacción del libro de marca.
