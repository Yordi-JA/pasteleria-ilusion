# Edición de las fotos con Gemini

La pastelería toma las fotos de sus pasteles siguiendo [`fotografia.md`](fotografia.md). Este documento dice cómo mejorarlas con Gemini para que todas se vean iguales en el catálogo, sin cambiar el pastel.

## La regla principal

Gemini solo corrige la luz, el color y el fondo. El pastel que sale debe ser el mismo pastel que entró: la misma decoración, la misma fruta en el mismo lugar, los mismos colores de betún y de cajeta, el mismo número de piezas. Si el cliente pide ese pastel, debe recibir lo que vio en la foto.

Gemini no hace:

- Agregar, quitar ni mover decoración, fruta, chispas, flores, letras o figuras.
- "Arreglar" el pastel: tapar una grieta, emparejar el betún, completar una fruta cortada o rellenar un hueco.
- Cambiar el color del pastel para que se vea más apetitoso (una cajeta más dorada, una fresa más roja).
- Cambiar el ángulo, la perspectiva, la forma o el tamaño del pastel.
- Agregar fondos, mesas, manteles, platos, sombras de ambiente o reflejos.

Si una edición cambia algo de esto, se descarta y se vuelve a pedir, o se usa la foto original.

## Qué sí hace Gemini

1. **Luz.** Iguala la exposición para que el pastel se vea bien iluminado, sin zonas quemadas ni muy oscuras. La crema y el merengue deben verse blancos con textura; si se ven como una mancha blanca plana, la luz quedó alta.
2. **Balance de blancos.** Quita los tonos amarillos, azules o verdes que deja la luz del lugar, para que el blanco de la crema se vea blanco neutro.
3. **Contraste y nitidez.** Un ajuste ligero y parejo en toda la foto. Nada de efectos, filtros, viñetas ni desenfoques.
4. **Fondo.** Reemplaza el fondo por un color liso y uniforme, sin sombra, para que el recorte del siguiente paso salga limpio. Para pasteles claros, gris medio (`#808080`); para pasteles oscuros, blanco (`#FFFFFF`). La base o el plato del pastel se queda.

## Lo que Gemini no puede garantizar, y cómo se resuelve

- **Transparencia.** Gemini a veces entrega un fondo con cuadriculado pintado en lugar de un PNG transparente de verdad. Por eso le pedimos un fondo liso y el fondo se quita después, con la función de aislar el sujeto del iPhone o del Mac, Photoshop, Canva o remove.bg (sección "Recorte" de [`fotografia.md`](fotografia.md)).
- **Medidas exactas.** El lienzo de 2000 × 2000 px, el pastel centrado, su base a 160 px del borde inferior y el tamaño máximo (1600 px un pastel completo, 1200 px rebanadas, postres y bases) se ajustan con una herramienta de edición normal, no con Gemini (sección "Exportación" de [`fotografia.md`](fotografia.md)). Así todos los pasteles quedan apoyados en la misma línea del catálogo.
- **Detalles inventados.** Un editor generativo puede redibujar zonas pequeñas sin avisar. Por eso cada foto pasa por la revisión de abajo.

## Instrucción para Gemini

Sube la foto original y pega esta instrucción tal cual:

```text
Edita esta foto de producto de una pastelería. Es una foto real de un pastel que se vende en una tienda en línea, así que el pastel debe quedar exactamente igual.

Haz solo esto:
1. Ajusta la exposición para que el pastel se vea bien iluminado, sin zonas quemadas ni demasiado oscuras. La crema y el merengue deben verse blancos y con textura.
2. Corrige el balance de blancos para que los blancos se vean blanco neutro, sin tonos amarillos, azules ni verdes.
3. Aplica un ajuste ligero y parejo de contraste y nitidez en toda la foto.
4. Reemplaza el fondo por un color liso y uniforme [gris medio #808080 | blanco #FFFFFF], sin sombras, sin degradado y sin textura. Conserva la base o el plato del pastel.

No hagas nada de esto:
- No agregues, quites, muevas ni redibujes decoración, fruta, chispas, flores, letras ni figuras.
- No corrijas defectos del pastel ni rellenes huecos.
- No cambies el color de ninguna parte del pastel más allá de la corrección de balance de blancos.
- No cambies el ángulo, la perspectiva, la forma, el tamaño ni la posición del pastel.
- No agregues sombras, reflejos, mesa, mantel, plato ni ningún objeto.
- No recortes el pastel: debe quedar completo dentro de la foto.

Entrega la imagen en la misma resolución que la original o mayor.
```

Antes de enviarla, deja en el punto 4 solo uno de los dos colores: gris medio para pasteles claros, blanco para pasteles oscuros.

## Revisión de cada foto editada

Abre la foto original y la editada lado a lado, al 100% de zoom, y revisa:

- [ ] La decoración es la misma: cuenta las frutas, los adornos y las rosetas de betún.
- [ ] Cada elemento sigue en su lugar; nada se movió, se duplicó ni desapareció.
- [ ] Los colores del pastel se ven como en la vitrina real, solo con mejor luz.
- [ ] La forma y el ángulo del pastel no cambiaron.
- [ ] El fondo es un solo color liso, sin restos del fondo original ni sombras.
- [ ] No aparecieron objetos, letras ni marcas de agua nuevos.

Si una casilla falla, se descarta la edición. Se puede pedir otra vez a Gemini con una instrucción más corta (por ejemplo, solo luz y balance de blancos), o usar la foto original.

## Pasos completos, en orden

1. La pastelería toma la foto como dice [`fotografia.md`](fotografia.md) y la guarda sin editar en `assets/pasteles/originales/`.
2. Se edita con Gemini usando la instrucción de arriba.
3. Se revisa con la lista de arriba.
4. Se quita el fondo y se revisan los bordes al 100% (sin halo claro ni restos).
5. Se coloca en el lienzo de 2000 × 2000 px: pastel centrado, base a 160 px del borde inferior, tamaño máximo según el tipo.
6. Se exporta en PNG transparente, sRGB, de menos de 1.5 MB.
7. Se nombra como dice [`fotografia.md`](fotografia.md) (para un producto, su identificador del admin, por ejemplo `tres-leches-de-cajeta.png`) y se guarda en `assets/pasteles/`.
8. Se copia a `frontend/public/fotos/` con el mismo nombre y se escribe ese nombre en el campo "archivo de la foto" del producto, o de su presentación si es el mini o la rebanada. Sin ese campo lleno, el sitio sigue mostrando el hueco "Foto del pastel".
