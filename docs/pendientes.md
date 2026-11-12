# Pendientes

Lo que quedó abierto y todavía no se programa. Cada punto dice de dónde viene y qué falta para cerrarlo.

## Vista previa con textura de "Diseña tu pastel" (D50)

Lo construido está en D50 ([`proyecto/decisiones.md`](proyecto/decisiones.md)) y se subió a `main` y a Heroku (release v15) el 8 de noviembre de 2026. Las dos correcciones de la dueña a ese aspecto están en D51 (trozos de fruta y choco-vainilla por piso). Quedan estos puntos:

1. Resuelto. La dueña dio el visto bueno al aspecto de los pasos 3, 4 y 5 el 8 de noviembre de 2026, con dos correcciones (los trozos de fruta de durazno y fresa, y el choco-vainilla por piso) que quedaron en D51.
2. Resuelto el 10 de noviembre de 2026 (D52). La dueña pidió grumitos en la fresa con yogurt y trozos de nuez en la nuez: son los estilos `crumbles` y `nut_pieces` de `FillingFlavor.preview_style`. Sus colores están en el punto 14.
3. Aspecto propio del queso y del flan. Hoy la parte de queso o de flan es una franja lisa de crema, sin textura. Falta preguntar a la dueña si debe verse distinta.
4. Resuelto. Los colores de los trozos (durazno `#FBD08F`, fresa `#C8283A`, galleta `#2B1D1A`, choco vainilla `#FFFBFB`, capuchino `#5A3A28` y chocolate `#3A2218`) quedaron dentro del visto bueno del 8 de noviembre. Siguen editables en el admin (`FillingFlavor.preview_color_secondary`).
5. Granillo de dos colores. El granillo alterna el color de los trozos con el color del sabor. Si la dueña quiere dos colores distintos de esos, hace falta un campo más en el modelo.
6. Trozos solo en el costado. Los trozos de fruta (y las rebanadas), la galleta y el granillo están en el costado de la franja del relleno. La vista previa no tiene cara de corte; si algún día la tiene, los trozos no se verán ahí.
7. Fixture de las pruebas E2E. `frontend/e2e/support/cake-design.ts` es una copia de las opciones de la API con los estilos y colores de la semilla. Si la dueña los cambia en el admin, el fixture no cambia solo y las pruebas siguen pasando con los valores viejos. Desde D51 lleva durazno y fresa con `fruit_chunks`; desde D52, los moldes, los estilos nuevos y el relleno incluido de los panes.
8. Resuelto. La revisión de código y la auditoría de seguridad del diff de D50 cerraron el 9 de noviembre de 2026 tras dos rondas, con el veredicto "se puede subir" en la segunda, y sus hallazgos se corrigieron en la rama de D51: `tinted()` partía el pan de un color en dos bloques; `FillingPieces` recalculaba todas las instancias en cada respuesta de precio y no pedía el cuadro con `frameloop="demand"`; el tope de 700 instancias dejaba ralo el piso de abajo; `crumb.ts` tomaba la referencia de la textura al renderizar, repintaba el lienzo al volver al paso 4 y tenía la costura de los poros desfasada; el aviso de pisos quedaba al subir las personas; el admin no validaba el color de los trozos ni el de arriba del pan de dos colores; y `tiers` del precio no tenía cotas. La última corrección (ronda 3) movió esa validación del modelo a los formularios de cambio del admin, porque en el modelo reventaba al guardar desde la lista una fila ya inconsistente (detalle en D51).
9. Resuelto el 11 de noviembre de 2026. El equipo revisó la animación y el rendimiento del 3D en un teléfono real. No se anotaron cifras de cuadros por segundo. El presupuesto de 150 000 triángulos de trozos (D52) se mantiene.
10. Revisión en el sitio desplegado. El 9 de noviembre de 2026, con `curl`, la API de producción ya trae `tier_minimums`, los estilos de relleno y el choco-vainilla en dos colores. Falta abrir https://pasteleriailusion.me/pedido/disena en el navegador y comprobar que la vista previa se ve igual; el despliegue de D51 necesitará además la migración `0016` y la `0017`, y el de D52, de la `0018` a la `0022`.
11. La descripción de los 5 panes sigue vacía en producción (D49). La pastelería la escribe en el admin (`Bread.description`); el paso 3 la muestra cuando existe.
12. Compresión del build (`chore/compresion-assets`). Sigue sin hacerse: el chunk de la escena pesa unos 940 kB sin comprimir y WhiteNoise no comprime lo que sirve del build de Vite (ver "Compresión de los assets del build" en las decisiones abiertas).
13. Al construir el endpoint que guarda un `CakeDesign` o un pedido, debe exigir `tiers` y `form` y revalidarlos en el servidor: hoy `_check_tiers` solo corre si el cliente manda `tiers` y `POST cake-designs/price/` los trata como opcionales porque no cambian el precio (hallazgo de la auditoría de seguridad de D50). Un pedido guardado sin esa revisión podría llevar 5 pisos con 4 kg.
14. Colores nuevos que esperan el visto bueno de la dueña (D52). Se editan en el admin (`FillingFlavor.preview_color_secondary` y `Bread.included_filling_preview_color_secondary`), no son colores de interfaz: los grumitos más rojos de la fresa con yogurt (`#D95F76`, propuesto) y los trozos de nuez (`#7A5230`, propuesto); y dos que reutilizan colores ya aprobados en un uso nuevo: las chispas redondas de chocolate del Choco-pingüino (`#3A2218`, el del chocolate) y el granillo rojo del Red velvet (`#C8283A`, el de la fresa).
15. Tamaños de la vista previa. Los moldes que sembró la `0019` son las medidas que dio la dueña el 10 de noviembre de 2026; si compra uno, lo agrega en el admin ("Moldes") y la vista previa lo toma sin un despliegue. Falta que la dueña confirme que el tamaño que se ve con 4, 8 y 12 kg, con varios pisos y en rectangular le parece fiel.

## Decoración del paso 6 de "Diseña tu pastel" (D53)

Lo construido está en D53 ([`proyecto/decisiones.md`](proyecto/decisiones.md)), en la rama `feat/disena-moldes-y-rellenos`, sin desplegar. Quedan estos puntos:

1. Precios de las decoraciones: resueltos el 10 de noviembre de 2026 (D54). Rosas $120 fijos; borde de conchas, rosetones, festones, olanes y los tres tipos de chispas, incluidos. Si la pastelería cambia uno, lo hace en el admin ("Decoraciones") sin un despliegue.
2. Límite de la imagen de "Otra decoración". Las reglas no lo dicen. La interfaz revisa en el navegador JPG, PNG o WebP de hasta 5 MB, el mismo valor que `backend/AGENTS.md` fija al inicio para las imágenes de clientes (D31). La pastelería debe confirmar el límite; cuando exista el endpoint, saldrá de la configuración del admin y el servidor volverá a revisar el archivo abriéndolo con Pillow.
3. Dónde se guarda la imagen. Hoy solo vive en la memoria de la pestaña y se pierde al recargar (el paso lo dice). Se sube cuando exista el pedido (Etapa 4), junto con la decisión del almacenamiento ("Almacenamiento de las fotos de los clientes" en las decisiones abiertas).
4. El pedido debe llevar el diseño y el color. El `Order` de la Etapa 4 guarda `decoration` (el identificador) y `decorationColor` (`null` es automático), y el servidor vuelve a calcular el precio con `calculate_price`; con "Otra decoración" el pedido pasa a `awaiting_quote`. La salida de ese estado sigue en el punto 6 de la sección 14 de las reglas.
5. Visto bueno de la dueña al aspecto. Faltan sus opiniones sobre cómo se ve cada diseño en la vista previa (conchas, rosetones, festones, olanes, rosas y chispas) y sobre el criterio de los tonos automáticos (más oscuro y más claro del color de la cobertura).
6. Fixture de las pruebas E2E. `frontend/e2e/support/cake-design.ts` copia las 10 decoraciones que deja la `0026`; si la dueña cambia nombres o descripciones en el admin, el fixture no cambia solo.
7. Resuelto el 11 de noviembre de 2026. El equipo revisó el rendimiento de la decoración en un teléfono real. No se anotaron cifras de cuadros por segundo. La decoración comparte el presupuesto de 150 000 triángulos del punto 9 de la sección anterior.
8. Producción. El despliegue necesita la migración `0023` (y, antes, de la `0018` a la `0022` de D52).
9. Resuelto. La prueba intermitente `e2e/hero-cake.spec.ts` "leaving and coming back to the portada three times leaves exactly one canvas" fallaba también en `main` (5 de 8 repeticiones sueltas, comparadas con un worktree de `main` el 10 de noviembre de 2026), así que no era de D53. La causa era el tiempo: cuatro cargas de la escena con WebGL por software tardan unos 8 s cada una y la prueba se quedaba al borde de los 30 s por omisión (y de los 5 s de la espera de que el `canvas` desaparezca). Ahora tiene 90 s en total y 15 s en esa espera: 8 de 8 repeticiones pasan. No hubo fuga de la escena.
10. La subida real de la imagen (Etapa 4), recomendaciones de la auditoría de seguridad de D53. La revisión del navegador (firma, tamaño y píxeles de la cabecera) es una comodidad, no una defensa: el servidor debe, como mínimo:
    - verificar el contenido abriendo el archivo con Pillow, no por extensión ni por `Content-Type`;
    - fijar `Image.MAX_IMAGE_PIXELS` (y tratar `DecompressionBombWarning` como error);
    - rechazar por tamaño antes de leer el cuerpo (`Content-Length` y un tope duro), con el parser multipart propio de `backend/AGENTS.md`;
    - volver a codificar la imagen sin metadatos EXIF;
    - guardarla con un nombre de `uuid4`, y conservar el nombre original solo como metadato limpio (sin caracteres de control ni de formato), solo para mostrarlo;
    - entregarla únicamente al dueño del pedido o al personal, por un endpoint con permisos, con `Content-Disposition`, `X-Content-Type-Options: nosniff` y CSP;
    - limitar las subidas por usuario y por IP (`ScopedRateThrottle`);
    - revalidar en el servidor `decoration`, `decorationColor`, `tiers` y `form` (el color debe ser uno de los de la cobertura o `null`);
    - si se agrega una CSP, permitir `img-src blob:` para la miniatura de la imagen local.

## Diseña tu pastel: pasos 7 y 8 (D55)

Lo construido está en D55 ([`proyecto/decisiones.md`](proyecto/decisiones.md)), en la rama `feat/disena-mensaje-y-oblea`, sin desplegar. Quedan estos puntos:

1. Límite de la imagen de la oblea. La interfaz usa 5 MB, el mismo valor propuesto para "Otra decoración" (sección anterior, punto 2). La pastelería debe confirmarlo. El servidor usa otro tope en la subida (ver la sección de la Etapa 4).
2. Oblea en carta cualquier orientación. La regla 6.3 dice "hoja carta (21.6 × 27.9 cm)" y la implementación acepta la carta en cualquier orientación (`design_layout.py`, `models/cakeDesignLayout.ts`). Falta que la pastelería confirme que es así.
3. Precio de la oblea. `CakeDesignSettings.wafer_price` queda PENDIENTE hasta que la pastelería lo capture en el admin; mientras tanto la oblea sale desactivada con "Precio por confirmar".
4. Botón "Agregar al pedido" al final de la tarjeta en móvil. Falta que alguien de la pastelería u otra persona usuaria confirme en un teléfono real que lo encuentra sin buscarlo.
5. Menores aceptados de la revisión final de D55, que no bloquean:
    - `useCartFlight.ts` no limpia `lastButton` después de `launch`.
    - En el paso 8, el origen de la perla se lee después del `await` de IndexedDB: un clic en otro botón durante el guardado cambia el origen.
    - `closest('button')` no reconoce un elemento con `role="button"`.
    - No se comprueba que WAAPI exista en el navegador.
    - `message_layout.color` responde en inglés ante un sustituto (salida del validador del servidor).
6. Salvedad de Unicode. Python 3.11 trae Unicode 14. Un emoji que el navegador acepta, pero que es más reciente que esa versión, lo rechaza el servidor (`design_layout.py`).
7. Prueba inestable: `e2e/cake-designer.spec.ts:955` se pasa del tiempo con 2 workers, por el WebGL por software. Pasó 3 de 3 cuando se corrió sola.
8. Contexto seguro. `crypto.randomUUID()` solo existe en contexto seguro. En desarrollo, abrir el sitio por `http://<IP>:5173` lo rompe: usa `http://localhost:5173` o un túnel.
9. Migración `0029_wafer_price_pending_and_advance_percent` en Heroku antes del despliegue de D55.

## Etapa 4: lo que dejó la auditoría de seguridad de D55

Lo recomienda la auditoría de seguridad del diseño (D55). Son requisitos de la Etapa 4, no trabajo de esta rama.

1. El endpoint del pedido revalida todo en el servidor: `calculate_price`, `check_wafer_layout`, `check_message_layout` y `payment_for_design`. Nunca lee del cliente `total`, `baseDeposit`, `requiresQuote` ni `designId`.
2. Mapear el snapshot del cliente (camelCase) campo por campo, sin pasarlo entero al modelo.
3. Validar la oblea contra la tapa real. Hoy solo la revisa el frontend, que conoce el molde y el giro.
4. Limpiar las imágenes huérfanas de IndexedDB (`ilusion.designImages`): un barrido al cargar y una caducidad.
5. `readDesignImage` vuelve a validar el blob y lo muestra solo en un `<img>`.
6. Subida de imágenes (oblea y "Otra decoración"):
    - Pillow con `Image.MAX_IMAGE_PIXELS` alineado a 40 megapíxeles;
    - quitar los metadatos EXIF al volver a codificar;
    - nombre de archivo con `uuid4`;
    - endpoint con revisión de dueño o de personal;
    - `X-Content-Type-Options: nosniff`;
    - throttle;
    - tope de 10 MB en el servidor. La interfaz revisa 5 MB; las dos cifras están por confirmar.
7. Una imagen de 40 megapíxeles tarda en decodificarse en un teléfono. Hay que decodificarla a escala reducida (`createImageBitmap` con `resize`) o bajar el límite a unos 12 megapíxeles para la oblea.
