# Pendientes

Lo que quedó abierto y todavía no se programa. Cada punto dice de dónde viene y qué falta para cerrarlo.

## Vista previa con textura de "Diseña tu pastel" (D50)

Lo construido está en D50 ([`proyecto/decisiones.md`](proyecto/decisiones.md)) y se subió a `main` y a Heroku (release v15) el 8 de noviembre de 2026. Las dos correcciones de la dueña a ese aspecto están en D51 (trozos de fruta y choco-vainilla por piso). Quedan estos puntos:

1. Resuelto. La dueña dio el visto bueno al aspecto de los pasos 3, 4 y 5 el 8 de noviembre de 2026, con dos correcciones (los trozos de fruta de durazno y fresa, y el choco-vainilla por piso) que quedaron en D51.
2. Resuelto el 10 de noviembre de 2026 (D52). La dueña pidió grumitos en la fresa con yogurt y trozos de nuez en la nuez: son los estilos `crumbles` y `nut_pieces` de `FillingFlavor.preview_style`. Sus colores están en el punto 13.
3. Aspecto propio del queso y del flan. Hoy la parte de queso o de flan es una franja lisa de crema, sin textura. Falta preguntar a la dueña si debe verse distinta.
4. Resuelto. Los colores de los trozos (durazno `#FBD08F`, fresa `#C8283A`, galleta `#2B1D1A`, choco vainilla `#FFFBFB`, capuchino `#5A3A28` y chocolate `#3A2218`) quedaron dentro del visto bueno del 8 de noviembre. Siguen editables en el admin (`FillingFlavor.preview_color_secondary`).
5. Granillo de dos colores. El granillo alterna el color de los trozos con el color del sabor. Si la dueña quiere dos colores distintos de esos, hace falta un campo más en el modelo.
6. Trozos solo en el costado. Los trozos de fruta (y las rebanadas), la galleta y el granillo están en el costado de la franja del relleno. La vista previa no tiene cara de corte; si algún día la tiene, los trozos no se verán ahí.
7. Fixture de las pruebas E2E. `frontend/e2e/support/cake-design.ts` es una copia de las opciones de la API con los estilos y colores de la semilla. Si la dueña los cambia en el admin, el fixture no cambia solo y las pruebas siguen pasando con los valores viejos. Desde D51 lleva durazno y fresa con `fruit_chunks`; desde D52, los moldes, los estilos nuevos y el relleno incluido de los panes.
8. Resuelto. La revisión de código y la auditoría de seguridad del diff de D50 cerraron el 9 de noviembre de 2026 tras dos rondas, con el veredicto "se puede subir" en la segunda, y sus hallazgos se corrigieron en la rama de D51: `tinted()` partía el pan de un color en dos bloques; `FillingPieces` recalculaba todas las instancias en cada respuesta de precio y no pedía el cuadro con `frameloop="demand"`; el tope de 700 instancias dejaba ralo el piso de abajo; `crumb.ts` tomaba la referencia de la textura al renderizar, repintaba el lienzo al volver al paso 4 y tenía la costura de los poros desfasada; el aviso de pisos quedaba al subir las personas; el admin no validaba el color de los trozos ni el de arriba del pan de dos colores; y `tiers` del precio no tenía cotas. La última corrección (ronda 3) movió esa validación del modelo a los formularios de cambio del admin, porque en el modelo reventaba al guardar desde la lista una fila ya inconsistente (detalle en D51).
9. Resuelto el 11 de noviembre de 2026. El equipo revisó la animación y el rendimiento del 3D en un teléfono real. No se anotaron cifras de cuadros por segundo. El presupuesto de 150 000 triángulos de trozos (D52) se mantiene.
10. Revisión en el sitio desplegado. El 9 de noviembre de 2026, con `curl`, la API de producción ya trae `tier_minimums`, los estilos de relleno y el choco-vainilla en dos colores. Falta abrir https://pasteleriailusion.me/pedido/disena en el navegador y comprobar que la vista previa se ve igual; el despliegue de D51 necesitará además la migración `0016` y la `0017`, y el de D52, de la `0018` a la `0022`.
11. La descripción de los 5 panes sigue vacía en producción (D49). La pastelería la escribe en el admin (`Bread.description`); el paso 3 la muestra cuando existe.
12. Resuelto el 11 de noviembre de 2026 (D56). `npm run build` comprime `dist/` con `frontend/scripts/compress-dist.mjs` (brotli y gzip) y WhiteNoise sirve las variantes. El chunk de la escena pasa de 940 757 bytes a 204 894 con brotli.
13. Colores nuevos que esperan el visto bueno de la dueña (D52). Se editan en el admin (`FillingFlavor.preview_color_secondary` y `Bread.included_filling_preview_color_secondary`), no son colores de interfaz: los grumitos más rojos de la fresa con yogurt (`#D95F76`, propuesto) y los trozos de nuez (`#7A5230`, propuesto); y dos que reutilizan colores ya aprobados en un uso nuevo: las chispas redondas de chocolate del Choco-pingüino (`#3A2218`, el del chocolate) y el granillo rojo del Red velvet (`#C8283A`, el de la fresa).
14. Tamaños de la vista previa. Los moldes que sembró la `0019` son las medidas que dio la dueña el 10 de noviembre de 2026; si compra uno, lo agrega en el admin ("Moldes") y la vista previa lo toma sin un despliegue. Falta que la dueña confirme que el tamaño que se ve con 4, 8 y 12 kg, con varios pisos y en rectangular le parece fiel.

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
10. Si se agrega una CSP, permitir `img-src blob:` para la miniatura de la imagen local. Lo demás de la subida y su revisión en el servidor quedó en D63.

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

## Colores libres de "Diseña tu pastel" (D57)

Lo construido está en D57 ([`proyecto/decisiones.md`](proyecto/decisiones.md)), en la rama `feat/disena-colores-libres`, sin desplegar. Quedan estos puntos:

1. La pantalla del carrito debe mostrar la muestra de color de cada diseño cuando se construya. Hoy la línea solo lleva los códigos y el "parecido a" en `details`.
2. Quitar la compatibilidad con `list` y con los `slug` de color cuando caduquen los borradores y los carritos viejos. Los TODO están en `frontend/src/models/cakeDesignLayout.ts` (`parseColor`) y en `frontend/src/models/cart.ts` (`hasLegacyColors`).
3. Sugerencia para la dueña: dar de alta "Negro" y "Gris" en el admin ("nombres de color de referencia"), para que el negro y los grises tengan nombre en el "parecido a". Con la lista de la semilla, medida el 11 de noviembre de 2026, también salen mal nombrados el vino (`#800000`) y el verde oscuro (`#006400`), que dan "parecido a café", y el rosa intenso (`#ff69b4`), que da "parecido a rojo": la lista no tiene colores oscuros ni un rosa intenso. Se corrige agregando esos nombres en el admin, sin cambiar código.
4. Grises claros. Con la lista de la semilla, un gris desde alrededor de `#ABABAB` se nombra "parecido a blanco", porque su distancia a "Blanco" baja de 0.25; el negro y los grises más oscuros no tienen nombre. Falta decidir si eso es lo que se quiere. El umbral está en `MAX_NAME_DISTANCE` (`frontend/src/viewmodels/colors.ts`).

## Catálogo y ficha (D59)

Lo construido está en D59 ([`proyecto/decisiones.md`](proyecto/decisiones.md)), en la rama `feat/catalogo`, sin desplegar. Quedan estos puntos:

1. "Pastel mini": el mockup dice "para unas 3 personas", pero las tarjetas de `GET /api/v1/products/` no traen las personas de cada presentación (la ficha sí). Hoy la frase va sin ese dato. Para mostrarlo, la API tendría que agregar `servings` a `CardOfferingSerializer`. El botón "Ver sabores" del mockup no se hizo: no hay una pantalla de sabores del mini, y cada ficha ya ofrece "Mini".
2. "Encargarlo para una fecha" agrega una línea `order` sin fecha. La fecha y la hora, el encargo de hoy con 2 horas de anticipación y la disponibilidad de pan (`Inventory`, D30) son de la entrega (Etapa 4).
3. Fotos de producto: siguen PENDIENTE (el hueco "Foto del pastel"). Van en `frontend/public/fotos/` (D32, D47) con el nombre de [`fotografia.md`](fotografia.md) (D67). La primera es `tres-leches-de-cajeta.jpg`, del 15 de noviembre, y le falta esto:
    - Es un JPG de 2048 × 2048 px, sin fondo transparente y de 1.7 MB; [`fotografia.md`](fotografia.md) pide un PNG transparente de 2000 × 2000 px y de menos de 1.5 MB. Falta el recorte o decidir si el sitio la muestra así mientras tanto.
    - Falta escribir `tres-leches-de-cajeta.jpg` en el campo "archivo de la foto" del producto en el admin, en local y en Heroku. Si se cambia a PNG, el nombre cambia con él.
    - No se sabe si es la foto original o ya editada con Gemini. Si existe la original, va en `assets/pasteles/originales/`.
4. Revisión con datos reales: hecha en local el 12 de noviembre con la vitrina del día (durazno solo con rebanadas, fresa con un completo). Falta revisar en Heroku. El rebanado ya tiene su etiqueta "Rebanado hoy" y su aviso en la ficha (D60).
5. Prueba que ya fallaba: `e2e/cake-designer-lid.spec.ts:210` ("the message stays inside the lid") falla en esta rama con 1 y con 2 workers, y también en 79982c6, antes de D59 (con 1 worker): el contorno del mensaje en su tamaño máximo sale del círculo de la tapa. No es de esta rama; falta revisarla.
6. Carga diferida de las rutas. `App.tsx` importa todas las vistas directamente, así que cada pantalla nueva entra al chunk principal: con D59 pasó de 488.41 kB a 527.76 kB y con D60 a 543.73 kB (medido con `npm run build`), y Vite avisa que pasa de 500 kB. Cargar las rutas con `React.lazy` lo bajaría; no entra en estas ramas.

## Vitrina y rebanadas (D60)

Lo construido está en D60 ([`proyecto/decisiones.md`](proyecto/decisiones.md)), en la rama `feat/vitrina-y-rebanadas`, sin desplegar. Quedan estos puntos:

1. Revisar en Heroku la vitrina y las rebanadas con los datos del día.
2. "Encargarlo completo" en un producto `showcase_only`: el rebanado lleva ese enlace a la ficha, y en un producto que solo se vende en vitrina la ficha no deja encargarlo. Hoy ningún producto `showcase_only` tiene rebanada (son gelatinas en vaso), y la partida de `showcase/` no trae `sales_channel`, así que el frontend no puede ocultar el enlace; si llegara a pasar, `showcase/` tendría que mandar el canal.
3. Si la pastelería quiere que el rebanado agotado se vea distinto (hoy sale como lo demás agotado, sin "Rebanado"), se cambia en `components/ShowcaseShelfItem.tsx`.
4. D59 ya está en Heroku y su ficha dejaba encargar una rebanada, así que un carrito guardado en el navegador puede traer esa línea: la pantalla del carrito (Etapa 4) debe marcarla o quitarla (`isSliceOrder`) antes de llegar al pago. El backend ya la rechaza (D63).
5. Menores que dejó la última revisión del aviso de "Agregar al pedido" (`components/AddToCartNotice.tsx`), que no bloquean:
    - "Cerrar" manda el foco al principio de `main` (`#contenido`), y quien usa el teclado pierde su lugar en la lista. Debería regresar al botón que agregó, si sigue en la página.
    - "Cerrar" está dentro de la región `role="status"`, así que algunos lectores de pantalla lo leen con cada aviso; podría ir fuera de la región, como hermano.
    - El espacio que reserva `scroll-padding-top` se mide una vez por aviso: si se gira el teléfono con el aviso visible, queda unos píxeles descuadrado.

## Etapa 4: lo que dejó la auditoría de seguridad de D55

Lo recomienda la auditoría de seguridad del diseño (D55). Lo del servidor quedó en D63 (puntos 1, 2, 3, 6, 8, 9, 10 y 11 de la lista original); quedan los del frontend.

1. Limpiar las imágenes huérfanas de IndexedDB (`ilusion.designImages`): un barrido al cargar y una caducidad.
2. `readDesignImage` vuelve a validar el blob y lo muestra solo en un `<img>`.
3. Una imagen de 40 megapíxeles tarda en decodificarse en un teléfono. Hay que decodificarla a escala reducida (`createImageBitmap` con `resize`) o bajar el límite a unos 12 megapíxeles para la oblea.

## API de pedidos (D63)

Lo construido está en D63 ([`proyecto/decisiones.md`](proyecto/decisiones.md)), en la rama `feat/pedidos-api`, sin desplegar. Quedan estos puntos:

1. Resuelto en la ronda 2 de D63 (14 de noviembre de 2026): el comando `cancel_expired_orders` cancela lo vencido y reintegra lo apartado. El usuario aprobó programarlo en Heroku Scheduler cada 10 minutos; lo hace el equipo al desplegar (comando y verificación en `backend/AGENTS.md`).
2. Resuelto en D68: al elegir efectivo, `payment_due_at` se extiende al cierre del día con `schedule_service.cash_payment_due_at`, sin pasar del lapso ni acortarlo.
3. Resuelto en la ronda 2 de D63: el personal cancela desde el admin un pedido sin pagar o en pausa por cotización, con su reintegro. Cancelar un pedido pagado espera el reembolso (tanda 2).
4. Tanda 2: el estado de la base (`StandLoan`), editable en el mismo registro básico del pedido en el admin, y el Observer que reacciona al cambio de estado que hace el personal ahí.
5. Resuelto en la ronda 2 de D63 (lo decidió el usuario): con el precio que pone la pastelería en el admin, el pedido pasa a `awaiting_payment`. Sigue PENDIENTE cuánto espera sin precio antes de cancelarse (`PolicySettings.quote_expiry_hours`, vacío: mientras tanto no vence).
6. Imágenes huérfanas: una imagen subida que nunca entra en un pedido se queda en PostgreSQL. El tope de 10 por cliente las acota, pero falta un barrido periódico. Heroku Postgres `essential-0` tiene 1 GB.
7. Valores propuestos que la pastelería debe confirmar en el admin: 30 minutos para pagar, 2 pedidos sin pagar por cliente, 60 días a futuro, 20 piezas por línea de encargo, 10 imágenes sin pedido y 12 megapíxeles (los dio el usuario el 14 de noviembre de 2026), y 100 piezas por pedido (lo propuso el equipo, sin cifra del usuario).
8. Unidad del pan para encargos de hoy: se cuenta una pieza de pan por pieza encargada. La unidad sigue siendo una pregunta para la pastelería ("Preguntas del catálogo" en las decisiones abiertas). Sin pan definido para el producto (PENDIENTE en la semilla, salvo Choco-pingüino y Red velvet), no hay encargo para hoy.
9. `DecorationOption.accepts_color` no sale en `GET cake-designs/options/`: el frontend sigue decidiendo por `slug` qué decoraciones llevan color. Si la pastelería marca otra en el admin, el frontend no se entera hasta que la API lo mande.
10. El frontend todavía no usa estos endpoints: falta subir las imágenes, mandar el pedido con `Idempotency-Key`, pedir los lapsos con `kind` y mostrar los errores de los topes.
11. Producción: las migraciones `0032_orders` y `0033_seed_decoration_accepts_color` (eran la `0031` y la `0032`; se renumeraron al fusionar con el acceso, que trae la `0031_user_profile_and_google`) más la `0034_order_round2_policy` de la ronda 2, y Pillow 13.0.0 en el slug (está en `backend/requirements.txt`).
12. Decidido por el usuario el 14 de noviembre de 2026: el primer lapso que se puede elegir empieza por lo menos `payment_window_minutes` (30) después de ahora.
13. Ronda 2: valores propuestos que la pastelería debe confirmar en el admin: 1 pedido esperando cotización por cliente y 10 piezas de la vitrina sin pagar por cliente (los dio el usuario). Los 60 pedidos por hora por IP los decidió el usuario el 14 de noviembre de 2026.
14. Ronda 2: el tope de cotizaciones cuenta las que vencieron y nadie ha cancelado todavía (como mucho 10 minutos, o hasta que el cliente haga otro pedido). Que una cotización con precio no revise el tope de 2 sin pagar lo decidió el usuario el 14 de noviembre de 2026.
15. Resuelto en D68: el `UPDATE` de `cancel_expired_orders` exige que el plazo siga cumplido (`due_by`) y la extensión del efectivo, que todavía no venza.
16. `UploadSettings.daily_upload_mb` y `daily_upload_count` existen desde la `0032_orders` y salen en el admin, pero ningún servicio los usa. Hay que aplicarlos en `customer_image_service` o quitarlos.
17. Revisión de la ronda 2: un solo permiso, `change_order`, cubre cobrar en efectivo, cancelar y cotizar. Desde D68 el efectivo tiene el suyo (`register_cash_payment`); faltan `price_order_quote` y `cancel_order`.
18. Revisión de la ronda 2: `@audit_operation` registra `ok` dentro del `atomic` de `changeform_view` del admin. Si después falla `save_related` o `log_change`, la auditoría dice algo que se deshizo.
19. Revisión de la ronda 2: al ponerle precio, una cotización no vuelve a revisar la anticipación del diseño (2 días); solo revisa que su lapso no haya empezado y que tenga cupo.
20. Riesgo aceptado por el usuario el 14 de noviembre de 2026 (re-auditoría de la ronda 2): con varias cuentas gratis (el registro no verifica el correo) todavía se puede mantener apartada la vitrina, aun con la pausa de 24 horas por cuenta. No hay pérdida de dinero ni de datos; el personal lo atiende cancelando desde el admin y desactivando las cuentas. Se descartaron para esta etapa exigir el correo verificado o Google para la vitrina y un tope de piezas por IP (bloquearía la exposición con el público en una sola red).
21. Valor propuesto por el equipo que la pastelería debe confirmar en el admin: 24 horas de pausa para la vitrina vencida (`PolicySettings.expired_showcase_cooldown_hours`).
22. Producción: la migración `0035_showcase_cooldown_and_cancellation_reason` va junto con la `0034` (punto 11).

Menores de la última revisión de código de la ronda 2 (ninguno bloquea; se anotan sin corregir):

23. `repositories/order_repo.py` (`count_unpaid_orders` y `count_unpaid_showcase_pieces`): la rama de `also_order_ids` no filtra por estado. Si otro proceso cancela o cobra un vencido que la limpieza no pudo cancelar, sus piezas cuentan de más (nunca de menos), y solo después de un error de la base. Arreglo: agregar `status=unpaid_status` a esa rama.
24. `models.py` (`order_cancellation_reason_known`): la restricción no amarra el motivo al estado; un pedido que no está cancelado podría tener `expired`. Arreglo: `Q(cancellation_reason="") | Q(status="cancelled", cancellation_reason__in=...)`.
25. `admin.py` (`OrderAdmin`): `cancellation_reason` no se muestra, así que el personal no ve por qué se canceló un pedido ni por qué un cliente está en pausa. Arreglo: agregarlo como campo de solo lectura.
26. `admin.py` (`quote_expiry_notice`): lee `PolicySettings` con el ORM en lugar de `settings_repo.get_policy_settings()`.

## Acceso de clientes: lo que dejó la revisión de código (D62 y D65)

Menores de la segunda ronda de revisión de la rama `feat/acceso`. Ninguno bloquea; se anotan sin corregir.

1. `frontend/src/models/session.ts` (`login`, `register` y `loginWithGoogle`): no toman `REFRESH_LOCK` ni suben `generation`. Si la persona sale y entra de nuevo mientras responde una renovación vieja, esa renovación puede cerrar la sesión nueva (con la limpieza de `logout` o con su `Set-Cookie`). Arreglo: pasar las tres por `withRefreshLock`.
2. `backend/core_pasteleria/services/auth_service.py` (después de `authenticate`): no se revisa otra vez `_is_staff(user)`. Es defensa en profundidad.
3. `backend/core_pasteleria/repositories/user_repo.py` (`_revoke_all_sessions`): no bloquea las filas. Con `remove_password=False`, un refresh que rota a la vez que se liga Google deja un `OutstandingToken` vivo.
4. `backend/tests/conftest.py`: agregar a `item.fixturenames` no es API pública de pytest. Alternativa: una fixture autouse de función que pida la de sesión con `request.getfixturevalue`.
5. `backend/core_pasteleria/services/google_identity.py` (`[:150]` después de `clean_name`): puede partir un grafema (un emoji o una letra con marcas combinantes).

Menores de la revisión de los arreglos de la ronda 2:

6. `frontend/src/models/session.ts` (`getJsonWithSession`): si la persona sale mientras una petición de la cuenta espera la renovación, `signOutLocally()` corre otra vez aunque el estado ya sea `anonymous`. Borra `signedOutFrom` y puede mandarla a `/entrar` en vez de a la portada. Arreglo: llamarla solo si el estado no es `anonymous`.
7. `frontend/src/models/session.ts` (`getJsonWithSession`): con un access al que le quedan menos de 30 s y una renovación que recibe 429, la petición falla con 503 aunque el token todavía sirve. Arreglo: si el resultado es `'transient'` y el access no ha vencido, usarlo.
8. `frontend/src/models/session.ts` (`getJsonWithSession`): una falla de red o un tiempo límite en la petición de la cuenta lanza el `TypeError` o el `DOMException` del navegador, no un `ApiError`. Ya era así antes de la ronda 2. Cuando "Mis pedidos" use `getJsonWithSession`, su view-model debe tratar un 503 y una falla de red como error de carga con "Volver a intentar".
9. `backend/config/settings.py` (`POSTGRES_TEST_DB`): el valor no se recorta. Uno con un espacio al inicio se rechaza con el mensaje de "debe empezar con test_", que confunde pero no daña nada.

E2E inestables bajo carga (pasan solos): `e2e/access.spec.ts:125` (un `page.goto` que pasa de 30 s) y `e2e/access.spec.ts:372`. Hay que vigilarlos en la corrida completa.

## Prueba E2E que falla también en `main`

`e2e/cake-designer-lid.spec.ts`, "the message stays inside the lid: more size is capped at what fits", falla de forma repetible. El 14 de noviembre de 2026 se corrió en un worktree limpio de `main` (commit `5bc1acb`, puerto 5180) y falló dos de dos veces con `inside` en `false` (línea 226), igual que en `feat/acceso`; no es una regresión del acceso (D62).

Causa probable, sin confirmar: la prueba mide las cuatro esquinas del rectángulo del texto en el navegador (`getBoundingClientRect`) contra el círculo de la tapa, y el tope del control "Tamaño" sale de `fitMessage` con las medidas estimadas de `messageMetrics.ts` (Dancing Script). Si la caja real del texto con `Feliz cumpleaños muy querida Ana` en el máximo es más grande que la estimada (por la fuente que se dibuja con WebGL y SVG en Chromium de Playwright en Windows, o porque el contorno del rectángulo ya es más estricto que lo que `fitMessage` garantiza), las esquinas salen del círculo. Falta medir la caja real contra la estimada en el máximo, y decidir si se ajusta la estimación o la prueba (que mida el contorno de los glifos y no el rectángulo).

## Carrito y entrega: lo que dejó la revisión (D66)

Se anotaron sin arreglar en la revisión de código y la auditoría de seguridad de `feat/carrito-entrega` (14 de noviembre de 2026):

1. `frontend/src/viewmodels/useDelivery.ts`: al crear el pedido, `cart.clear()` vacía todo el carrito, también las líneas que otra pestaña agregó mientras se enviaba el pedido. Habría que quitar solo las líneas que se mandaron.
2. Dos pestañas que crean un pedido a la vez mandan llaves distintas y hacen dos pedidos. Lo acota el tope de 2 pedidos sin pagar y el segundo vence a los 30 minutos (D66).
3. `frontend/src/models/orders.ts`: el corte de 20 s de `POST orders/` incluye la renovación del token, si toca renovar. Con una renovación lenta queda menos tiempo para la creación.
4. `frontend/src/viewmodels/useDeliveryCalendar.ts`: `firstMonth` se fija al montar la pantalla. Si la pestaña queda abierta de un mes a otro, "Mes anterior" deja volver a un mes que ya pasó (sus días salen no disponibles).
5. Retención de `Order.pickup_name` y `Order.pickup_phone`: son datos de un tercero y cuánto se guardan es PENDIENTE de la pastelería (sección 8 de [`reglas-de-negocio.md`](reglas-de-negocio.md)).
6. La nota en PDF de la tanda 3 debe escapar `pickup_name` al armarse (es texto del cliente).
7. `frontend/src/models/checkout.ts`: si la persona recarga a mitad de la creación y el refresh de la sesión ya venció, cerrar la sesión olvida la llave (`resetPurchase`) y el siguiente intento lleva otra; si el primer pedido sí se creó, queda un duplicado, acotado por el tope de 2 sin pagar.
8. `frontend/src/models/checkout.ts` (`purchaseFingerprint`): la huella usa el nombre de quien recoge recortado pero sin juntar los espacios de en medio, y el servidor sí los junta. "Ana  López" y "Ana López" dan dos huellas (dos llaves) para el mismo pedido.

## Pagos (D68)

Lo construido está en D68 ([`proyecto/decisiones.md`](proyecto/decisiones.md)), en la rama `feat/pagos`, probado solo con los SDK simulados. Quedan estos puntos:

1. Probar con las cuentas sandbox, cuando existan: que la firma de Mercado Pago llegue con `ts` en segundos o en milisegundos (se aceptan los dos), que la `notification_url` con `source_news=webhooks` llegue firmada, que `init_point` sirva con las credenciales de prueba (no se usa `sandbox_init_point`) y que `auto_return` acepte la URL de regreso.
2. Si Mercado Pago reenvía una notificación con su `ts` original (reintenta cada 15 minutos si no recibe 200), la tolerancia de 300 s la rechaza. Hay que confirmarlo con el sandbox y, si pasa, ampliar la tolerancia: la seguridad no depende del `ts`, porque el pago siempre se consulta en la API.
3. Reembolso: un pago `refund_required` lo devuelve el personal a mano desde el panel de la pasarela. Una consecuencia de D63 pedía reembolsarlo en automático. El usuario decidió el 15 de noviembre de 2026 dejarlo a mano y agregar al final, solo si el 18 sobra tiempo después de la tanda 3, un botón "Reembolsar" en el admin que devuelva el pago por la API de la pasarela (un método `refund` en cada adaptador, un estado `refunded` con su migración, el permiso y la auditoría). El reembolso automático, sin una persona que lo decida, se descartó.
4. Resuelto el 15 de noviembre de 2026 (punto 21).
5. `CustomerNotificationObserver` solo registra el aviso en el logger `core_pasteleria.notifications`: no hay correo.
6. Resuelto el 15 de noviembre de 2026: `StandLoanObserver` y el evento "base devuelta" llegaron con `StandLoan` (D69).
7. Producción: la migración `0037_payments`, las dos dependencias nuevas, las cuatro variables en Heroku (`heroku config:set`) y las URL de los webhooks en los paneles de Mercado Pago (evento "Pagos") y de Stripe (`payment_intent.succeeded` y `payment_intent.payment_failed`).
8. Frontend: hecho el 15 de noviembre (`/pedido/pago` y `/pedido/apartado`, D68). Lo que quedó es lo de los puntos 12 a 19.
9. Propuesto por el equipo, sin cifra del usuario: 20 inicios de pago por minuto por cuenta (`payments_user`) y 300 notificaciones por minuto por IP en los webhooks (`payment_webhooks`).
10. Un intento con otro método en el mismo pedido (por ejemplo, Stripe después de Mercado Pago) deja abiertos los dos. Si el cliente paga los dos, el segundo queda `refund_required`.
11. Como el punto 18 de la API de pedidos: el registro del efectivo deja `ok` en la auditoría de `change_status` dentro de la transacción; si después falla la fila del pago, la auditoría dice algo que se deshizo.
12. Resuelto el 15 de noviembre de 2026: los logos oficiales de Mercado Pago y Stripe están en `assets/logos/`, sin modificar, y la pantalla de pago los muestra como imagen, sin cambiarles el color (libro de marca, "Inicio de sesión y pagos"). `mercado-pago.svg` viene del kit oficial de logos de Mercado Pago 2025 (mercadopago.com.mx/mp/logo-oficial), versión digital RGB a color, horizontal. `stripe.svg` viene del Stripe logo kit (stripe.com/newsroom/brand-assets), wordmark en Blurple para fondos claros.
13. Probar el pago en el navegador con las cuentas sandbox: Stripe Elements con `pk_test_` en `VITE_STRIPE_PUBLISHABLE_KEY`, una tarjeta que pide 3D Secure (por ejemplo, 4000 0027 6000 3184) y una que se rechaza, y Checkout Pro con su comprador de prueba, incluido el regreso con `?pedido=`. Las pruebas E2E usan un Stripe.js falso y la API simulada; la CSP con Stripe.js solo se probó en pytest.
14. Producción: `VITE_STRIPE_PUBLISHABLE_KEY` en Heroku antes del build (el buildpack de Node la lee al compilar), la pareja pública de `STRIPE_SECRET_KEY`.
15. Instrument Sans no carga dentro de los iframes de Stripe (la fuente es de nuestro origen y Stripe la pediría sin CORS): los campos de la tarjeta usan la pila de respaldo de `tokens.css` ("Segoe UI", system-ui). Para igualarla, servir la fuente con CORS y pasarla en `fonts` de Elements.
16. La confirmación (`/pedido/confirmacion`) es de la tanda 3. El pago lleva ahí con `?pedido=<id>` cuando el servidor dice `received`, y por ahora la vista muestra su título y el número de pedido, sin consultar la API.
17. Diferencias con el mockup por las reglas: la línea de tiempo del apartado no marca "Recibido" (regla 12: se recibe al registrar el pago; el mockup lo pinta hecho); el resumen del pago no lleva "Cambiar" en la entrega (el pedido ya existe y apartó su lapso; cambiarlo pide un endpoint) ni la fila "Productos", que sin envío repite el total; el envío solo aparece si cuesta algo (D66).
18. Propuesto por el equipo, sin cifra del usuario: después de Stripe o al volver de Mercado Pago, la pantalla consulta el pago cada 2.5 s hasta 24 veces (unos 60 s); si se agota, lo dice y deja "Volver a consultar".
19. Las llaves de idempotencia del pago van en `sessionStorage` (`ilusion.payment.v1`: el id del pedido y una llave por método, sin datos de la cuenta) y se borran con `resetPurchase`. En otra pestaña o en otro navegador se pide otra llave: si alguien paga el mismo pedido en dos lugares, el segundo cobro queda `refund_required` (punto 10).
20. Las llaves de pago viven en `sessionStorage` y guardan un solo pedido (`frontend/src/models/checkout.ts`). Una pestaña nueva o un `resetPurchase` abren un segundo PaymentIntent del mismo pedido. Se podría reusar en el servidor el intento abierto de Stripe del pedido (`payment_service.py`).
21. Resuelto el 15 de noviembre de 2026. `StripeCheckoutObserver` (`order_observer.py`), suscrito en `build_order_subject`, cancela en Stripe los PaymentIntent abiertos (`pending` o `failed`) del pedido que pasa a `cancelled`, después del commit, con `cancellation_reason=abandoned`. Es de mejor esfuerzo: si Stripe falla o el PaymentIntent ya se cobró, queda un WARNING con el id del pedido y del PaymentIntent y el pedido sigue cancelado; un cobro que ya entró lo deja el webhook en `refund_required`, como antes. La fila `Payment` conserva su estado (sin estado nuevo ni migración). Sin las llaves de Stripe no hace nada. La preferencia de Mercado Pago sigue venciendo sola.
22. En `payment_repo.py`, Mercado Pago sin `checkout_id` marca el intento abierto más reciente, aunque el pago venga de una preferencia anterior. La otra fila se queda `pending`.
23. En `frontend/src/viewmodels/paymentView.ts`, un `refund_required` como último intento manda a la pantalla de reembolso aunque el pedido siga en `awaiting_payment`, como en el caso `amount_mismatch`.
24. En `frontend/src/viewmodels/paymentView.ts`, `isReservedInCash` solo mira el último intento. Después del efectivo, abrir Mercado Pago y abandonarlo pierde el aviso del apartado.
25. En `frontend/src/viewmodels/useCardPayment.ts`, reconfirmar un PaymentIntent que ya se cobró, cuyo webhook no ha llegado, muestra un error de tarjeta en lugar de esperar al servidor.
26. En `payment_service.py` (`apply_notice`), un cobro aprobado con `unknown_order` u `order_mismatch` no deja fila `Payment`, solo la auditoría. Conviene un WARNING con `provider_payment_id`.
27. En `payment_views.py`, el tope de 64 KB de los webhooks solo revisa `Content-Length`.
28. En `admin.py`, `DuplicatePayment` al registrar el efectivo (`payment_service.register_cash_payment`) daría 500. Hoy no se alcanza.
29. Resuelto el 15 de noviembre de 2026. Una firma rechazada responde el mismo 400 y deja un WARNING en `core_pasteleria.api.payment_views` con el método, el motivo (`missing`, `malformed`, `mismatch`, `stale` o `bad_body`) y la referencia (el `x-request-id` de Mercado Pago o el `id` del evento de Stripe, solo si tiene la forma de un id). Nunca el secreto, el encabezado de la firma ni el cuerpo. Un secreto mal configurado se ve en `heroku logs` como `mismatch`.
30. Resuelto el 15 de noviembre de 2026. Con `STRIPE_SECRET_KEY` en `sk_live_` o `rk_live_`, la app no arranca y el mensaje dice que el proyecto solo usa llaves de prueba. En Mercado Pago no se revisa: el prefijo no distingue de forma confiable la llave de prueba de la real.
31. En `mercadopago_adapter.py`, un `ts=` vacío duplicado responde 500 en lugar de 400. Solo pasa con una firma válida.
32. Falta confirmar en la documentación de Mercado Pago que cada reintento del webhook llega con un `ts` nuevo, por la ventana de 300 s (punto 2).
33. En `frontend/src/models/payments.ts`, `safeCheckoutUrl` solo exige `https:`. Se podría limitar a los hosts de Mercado Pago.
34. Varias cuentas que eligen efectivo pueden acaparar lapsos hasta el cierre (`payment_service.py`). Está acotado por el tope de pedidos sin pagar y por el throttle.
35. En `stripe_adapter.py`, se usa `amount` en lugar de `amount_received`.

## Nota y bases (D69)

Lo construido está en D69 ([`proyecto/decisiones.md`](proyecto/decisiones.md)), en la rama `feat/tanda-3`. Quedan estos puntos:

1. Frontend: hecho (la confirmación, "Mis pedidos", el detalle, "Bases en préstamo" y `/nota/:token`). Falta compararlo en el sitio desplegado con datos reales.
2. La línea de tiempo del detalle (mockup `DetallePedido`) pone la fecha y hora de cada estado. El pedido solo guarda desde cuándo está en el actual (`status_changed_at`) y cuándo se confirmó el pago (`paid_with.paid_at`); las fechas de los estados intermedios piden un historial de estados que no existe.
3. Revisar la nota impresa contra la captura 027: no se pudo abrir el PDF en una vista previa durante el trabajo. La revisaron las pruebas (tamaño carta, número, URL del QR, marcadores y datos de la pastelería), no el ojo.
4. Probar que el QR se lea con un teléfono (va en el color `mermelada` sobre blanco, con corrección de errores M).
5. Propuesto por el equipo, sin cifra del usuario: 30 verificaciones por minuto por IP (`note_verification`).
6. La nota no incrusta fuentes: un carácter fuera de Windows-1252 del mensaje sale como "?". Si la pastelería quiere la tipografía de la marca, hay que conseguir sus `ttf` (no se convirtieron los `woff2`).
7. Qué pasa si la base regresa dañada sigue PENDIENTE (regla 7): hoy la devolución siempre reembolsa el depósito completo.
8. `CustomerNotificationObserver` no avisa la devolución de la base; solo los cambios de estado.
9. Producción: la migración `0038_stand_loans`, `reportlab` y dar el permiso `register_stand_return` al personal que recibe bases.
10. "Volver a pedir" de los pedidos anteriores (mockup `Cuenta`) no está: armar el carrito desde un pedido pide decidir qué pasa con los precios de hoy, la vitrina del día y los diseños con imagen. Por ahora cada pedido anterior lleva "Ver pedido".
11. El detalle muestra la fecha solo del pago y del estado actual; los pasos intermedios ya pasados dicen "hecho" sin fecha hasta que exista el historial del punto 2.
12. La confirmación dice "Te enviamos la confirmación a <correo>", como el mockup: depende de que el correo de confirmación del pedido esté funcionando en producción.
13. El encabezado de la cuenta pone el avatar arriba del saludo; el mockup lo pone a la izquierda en escritorio. Es de D62 y no se cambió aquí.
14. "Mis pedidos" separa en curso y anteriores solo con las páginas ya cargadas: un pedido en curso muy viejo (más de 20 pedidos después) aparece al pedir "Ver más pedidos".
10. Frontend de `/cuenta/bases`: el submenú de la cuenta (Mis pedidos, Bases en préstamo, Datos y avisos) y el botón del menú móvil que muestra el mockup no están en la pantalla; llegan con el trabajo de "Mis pedidos".
11. `/cuenta/bases`: el mockup dice "Regrésala hasta 15 días después de la entrega". Los días salen de `PolicySettings.stand_return_days` y la API no los manda, así que el texto dice "antes de la fecha límite de tu pedido". Si se quiere la cifra, la API tiene que darla. "Cómo devolver una base" y "Ver las condiciones del préstamo" llevan a `/bases`, que sigue vacía (BasesInfo).
12. `/nota/:token`: se quitó del mockup "¿Trabajas en la pastelería? Inicia sesión para registrar la devolución", porque la devolución se registra en el admin (D64) y la página no lleva botón (D69). Falta decidir si se deja un enlace a `/admin/`.

## Referencia, correo y cancelación (D70)

Lo construido está en D70 ([`proyecto/decisiones.md`](proyecto/decisiones.md)), en la rama `feat/tanda-3`. Quedan estos puntos:

1. Resuelto (frontend, segunda ronda de D70): "Mis pedidos" lista las solicitudes en revisión y con su cotización en "Solicitudes de cotización", bajo los pedidos en curso, como el mockup `Cuenta`; una aceptada se ve solo como su pedido, y una cancelada va en "Solicitudes anteriores" (historial, con su estado, su fecha y su enlace; decisión del usuario). Pide solo la primera página de `GET reference-requests/` (20): una solicitud en curso más vieja que las 20 más nuevas no saldría. Antes decía: falta la lista de solicitudes en "Mis pedidos". "Envía tu referencia", "Solicitud enviada", "Cotización lista" y "Aceptar y pagar" ya están (ver los puntos 13 a 20); el botón "Cancelar pedido" del detalle, también (ver el punto 12).
2. Resuelto (decisión del usuario, segunda ronda de D70): el cliente cancela en cualquier momento antes de la entrega; `customer_cancel_cutoff_hours` se quitó. Resuelto también en el frontend: se quitaron `cancellable_until` y los motivos `in_preparation` y `too_late`, y el detalle de un pedido entregado muestra la frase de `not_cancellable` sin botón.
3. Resuelto (segunda ronda de D70): quien tiene `set_reference_quote` ve las fotos de la solicitud en el admin, y solo esas.
4. Resuelto en el backend (segunda ronda de D70): la base sale de las personas y la cotización trae `stand_deposit` con `pay_today` que lo suma. Resuelto también en el frontend: "Base para [n] kg" con su depósito y "Pagas hoy" en `/cuenta/cotizaciones/:id`, y el sabor en el formulario, en la enviada y en la cotización. Las solicitudes de antes de la `0040` no tienen sabor ni base (`bread` y `kg` en `null`, depósito 0).
5. Proveedor de correo sin decidir (Brevo o Gmail por SMTP): en Heroku hay que definir `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` y `DEFAULT_FROM_EMAIL`. Sin ellas no sale ningún correo. Verificar SPF y DKIM del dominio con el proveedor.
6. El correo sale en la misma petición después del commit (un webhook o el admin): con `EMAIL_TIMEOUT` de 5 s, un SMTP caído alarga esa respuesta hasta 5 s por correo. Una cola de tareas lo resolvería, pero agrega un servicio.
7. Propuestos por el equipo, sin cifra del usuario: 1 solicitud en revisión a la vez (reutiliza `max_quote_orders_per_customer`) y los throttles `references_create_user` (10 por hora), `references_accept_user` (20 por hora) y `orders_cancel_user` (20 por hora).
8. Una cotización vencida no se cancela sola ni libera nada (no aparta nada); solo deja de poder aceptarse.
9. No hay correo de la cancelación ni de la devolución.
10. Producción: las migraciones `0039_reference_requests_and_cancellation` y `0040_reference_flavor_stand_and_cancellation`, y dar el permiso `set_reference_quote` al personal que cotiza.
11. Las pruebas se escribieron junto con el código y no se vieron en rojo antes (ver la bitácora).
12. Frontend de la cancelación: ningún mockup trae el botón ni el diálogo, así que son de diseño propio con los componentes existentes; falta que el equipo los revise. Si la vista previa falla (red o 5xx), el detalle no muestra el botón ni avisa. No hay "Cancelar" desde "Mis pedidos", solo desde el detalle. El aviso de éxito usa lo mostrado en el diálogo, no los montos de la respuesta del `POST`.
13. La API no publica `UploadSettings.max_reference_images` ni `max_upload_mb`: el navegador usa 3 fotos (el tope duro y la regla 9) y 5 MB (la semilla), y dice "Hasta 3 fotos, JPG, PNG o WebP de hasta 5 MB cada una". Si el admin cambia esos valores, el texto no cambia: el servidor rechaza con su mensaje. Sumarlos a `GET store/info/` (backend) resolvería las dos cosas.
14. La subida no muestra el avance en bytes, solo "Subiendo tus fotos (1 de 2)…": `requestWithSession` usa `fetch`.
15. El mockup `Referencia` pide la ocasión dos veces (chips y lista); queda solo la lista, con las nueve ocasiones de la API. Falta que el equipo lo revise.
16. `/cuenta/cotizaciones/:id` no muestra "Decoración" del mockup (la API da un solo precio); "Base para [n] kg" ya está (punto 4) ni el dibujo del pastel del encabezado (no hay ese dibujo de línea en `LineDrawing`).
17. "Cancelar solicitud" es de diseño propio (confirmación en la misma tarjeta, sin `<dialog>`); "Cancelar pedido" del detalle usa un `<dialog>`. Falta que el equipo decida si deben verse iguales.
18. Resuelto (frontend, segunda ronda de D70): en `/pedido/entrega?cotizacion=` la barra dice "Volver a la cotización" y lleva a la solicitud; la confirmación y el detalle nombran la línea `reference` con su `product_name` ("Pastel según tu referencia") y su sabor.
19. La llave de idempotencia de la referencia y de aceptar (`ilusion.reference.v1`, `ilusion.quoteAccept.v1`) no se borra al cerrar la sesión, como sí lo hace `resetPurchase`: es un UUID y un hash, sin datos de la cuenta, y el servidor guarda la llave por cliente. Si se quiere, `session.ts` puede llamar a `forgetAttempt` en la salida.
20. Las fotos de la solicitud se piden una por una con la sesión cada vez que se abre la pantalla (sin caché, `Cache-Control: private, no-store`).
21. Resuelto en el backend y en el frontend (segunda ronda de D70). Cambio de contrato pedido por el usuario: la solicitud suma el sabor (`bread`, `filling_base`, `filling_flavors`, con las reglas de los pasos 3 y 4 de "Diseña tu pastel" y sus errores bajo cada campo), la respuesta trae `bread_name`, `filling_base_name` y `filling_flavor_names` para "Solicitud enviada" y la cotización, y la cotización trae la base (kg y depósito) aparte del precio, con `pay_today` que ya suma el depósito. Resuelto en el backend: el contrato pide también `cake_type` (obligatorio, ver D70) y la base va en `kg`, `stand` (`min_kg`, `max_kg`, `deposit`) y `quote.stand_deposit`. El frontend ya lo usa (ver D70, "Frontend: segunda ronda").
22. El correo "Tu cotización está lista" dice el precio, no el depósito de la base ni lo que se paga hoy.
23. Al cancelar un pedido pagado desde `in_preparation` o `ready_for_delivery`, la vitrina y el pan vuelven al inventario como antes de pagar (`InventoryObserver`), aunque la pastelería ya haya empezado el pastel. No hay correo de esa cancelación.

## Correos y "Cómo llegar" (D71)

1. Mejora futura: un mapa embebido junto a la dirección. Pide abrir `frame-src` a Google en la CSP del sitio (D62), carga cookies de terceros (el aviso de privacidad tendría que decirlo) y no está en el mockup. Hoy "Cómo llegar" abre Google Maps en otra pestaña.
2. Los correos se revisaron rendidos en Chromium a 600 y 375 px, no en Gmail, Outlook ni Apple Mail reales. Falta mandarlos a una cuenta de cada uno (Brevo ya envía, D70) y revisar el modo oscuro de Gmail y de Apple Mail, que puede invertir los colores aunque el correo pida `color-scheme: light`.
3. Las fuentes de la marca no cargan en la mayoría de los clientes: los títulos caen a Georgia y el texto a Segoe UI, Helvetica o Arial.
4. El logo del correo se lee de `SITE_URL/correo/ilusion-logo.png`: hasta desplegar esta rama, los correos de Heroku lo muestran roto (con su `alt`). Si cambia `assets/logos/ilusion-logo.svg`, hay que volver a rendir el PNG.
5. La nota en PDF muestra la dirección, pero no "Cómo llegar": un enlace en un documento para imprimir no sirve, y el QR ya apunta a la verificación.
6. El formato "55 1234 5678" del WhatsApp en los correos es solo para números de México (52 y 10 dígitos); el sitio sigue mostrando "+52...", como antes.

## Revisión de la tanda 3

Menores de la revisión única de la tanda 3 (D70) que no se arreglaron:

1. `quote_note` reinicia `quoted_at` y reenvía el correo.
2. Aceptar no fija el precio que vio el cliente (mandar `quoted_at` o `expected_price` y responder 409).
3. `CancellationTerms` conserva `delivery_date` y `slot_starts_at`, que ya no se usan.
4. El texto "se devuelve el depósito" no menciona el envío.
5. El correo síncrono en `on_commit` alarga el webhook hasta 5 s.
6. Faltan pruebas: cancelación con envío, pedido de cotización con depósito, PaymentIntent cancelado al cancelar pagado, tope de pedidos sin pagar al aceptar, `KEY_IN_USE`, recotizar una solicitud aceptada y cancelar mientras se acepta.
7. `paid_at` sale de `updated_at`.
8. Enviar y aceptar referencia no limitan por IP.
9. El PDF solo gasta el throttle general `user`.

## `/pedido`: dibujo de la tarjeta "Diseña tu pastel"

1. El mockup `PedidoElegir` usa un pastel de línea de dos pisos con vela que no está en `assets/motivos/` ni en `LineDrawing`. Mientras tanto la tarjeta lleva el icono `Cake` de Phosphor (Regular, `mermelada`). Falta que se dibuje `dibujo-pastel.svg` en el estilo de los motivos y se agregue a `LineDrawing`.

## `/cuenta/datos` (D72)

Menores de la revisión única de "Datos y avisos" que no se implementaron:

1. Mandar un correo al dueño de la cuenta cuando cambian su contraseña o su teléfono, para que note un cambio que no hizo (CWE-778, registro insuficiente de eventos de seguridad).
2. Sin `navigator.locks` (el sitio abierto por `http://<IP>`), otra pestaña puede rotar la cookie vieja mientras se cambia la contraseña y cerrar la sesión: avisar "Vuelve a entrar con tu contraseña nueva" en ese caso.
3. Contar en django-axes los fallos de la contraseña actual de `POST auth/password/`; hoy solo los limita el throttle por cuenta y por IP.
4. Pruebas de `changePassword` (`models/session.ts`) para el 401 que renueva y reintenta, el segundo 401 que cierra la sesión y "la persona salió mientras llegaba" (cierra la cookie nueva).
5. Un `StrictBooleanField` para `notify_whatsapp`: el `BooleanField` de DRF acepta `"true"`, `1` o `"sí"`.
6. Una base común para los errores por campo con código, en lugar de `PasswordChangeError(RegistrationError)`.
7. Avisar a las otras pestañas del nombre nuevo (`BroadcastChannel`); hoy lo toman al renovar la sesión o al recargar.
