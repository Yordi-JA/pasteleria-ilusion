# Esquema del catálogo, el inventario y la configuración editable

Diseño aprobado el 2 de noviembre de 2026 (D32 en [`decisiones.md`](decisiones.md)) para la app `core_pasteleria`. Es la guía para implementarlo; el código manda cuando exista. Los identificadores van en inglés (D29) y todo texto visible (`verbose_name`, `help_text`, mensajes) en español.

No cubre `Order`, `OrderItem`, `CakeDesign`, `StandLoan`, `DeliverySlot`, `ReferenceRequest` ni `Quote`, que vienen después, pero el esquema está pensado para servirles.

## Contenido

- [Lo que condiciona el diseño](#lo-que-condiciona-el-diseño)
- [Convenciones comunes](#convenciones-comunes)
- [Opciones fijas en código](#opciones-fijas-en-código)
- [Configuración de una sola fila](#configuración-de-una-sola-fila)
- [Opciones y precios de "Diseña tu pastel"](#opciones-y-precios-de-diseña-tu-pastel)
- [Bases y envío](#bases-y-envío)
- [Catálogo](#catálogo)
- [Inventario](#inventario)
- [Dónde vive cada regla](#dónde-vive-cada-regla)
- [PENDIENTE](#pendiente)
- [Datos iniciales](#datos-iniciales)
- [Repositorios](#repositorios)
- [Alternativas descartadas](#alternativas-descartadas)
- [Respuestas del equipo y preguntas para la pastelería](#respuestas-del-equipo-y-preguntas-para-la-pastelería)
- [Orden de implementación y pruebas](#orden-de-implementación-y-pruebas)

## Lo que condiciona el diseño

- **Precios por grupo, ventas por sabor.** El mockup muestra un pastel por sabor, con su ruta `/pasteles/:slug`, su foto y sus existencias ("Quedan [n]"), incluso los mini. Las reglas fijan el precio por grupo ("Pastel de sabor normal $350 / $35"). Por eso se separan producto, presentación a la venta y precio de catálogo.
- **Bases reales y depósitos aprobados.** `/bases` lista 5 bases reales (4–5, 6–8, 10–12, 15 y 20–25 kg). Los rangos intermedios salen de "la siguiente base más grande" y los de 26–50 kg son depósitos aprobados sin base física descrita.
- **La vista previa 3D necesita identificadores y colores.** `design/referencia/pastel-css3d.js` asigna color a cada pan, sabor de relleno y color de cobertura; cada opción lleva un `slug` estable y un color de vista previa guardado en la base.
- **No hay dónde guardar fotos subidas desde el admin.** Heroku borra el disco de la app en cada reinicio y `MEDIA_URL` no se sirve. Las fotos de producto son archivos estáticos del frontend (ver `docs/fotografia.md`).
- **Las semillas llegan solas a producción.** El `Procfile` corre `migrate` en el `release`, así que una migración de datos siembra producción sin pasos manuales.

## Convenciones comunes

- Dinero en `DecimalField(max_digits=8, decimal_places=2)` con `CheckConstraint` `>= 0` (o `> 0` donde un cero no tiene sentido).
- Kilos enteros en `PositiveSmallIntegerField`; pesos aproximados (2.7) en `DecimalField(4, 1)`.
- Clase abstracta `OrderedOption` con `sort_order` (`PositiveSmallIntegerField`, "orden", 0 por defecto) e `is_active` (`BooleanField`, "activo", `True` por defecto).
- En Django 5.2, `CheckConstraint(condition=...)` (el argumento `check=` está obsoleto desde 5.1).
- Agregar `"django.contrib.postgres"` a `INSTALLED_APPS` (para `ArrayField` y `ExclusionConstraint`).
- Agregar en `settings.py` `UPLOAD_HARD_LIMIT_MB = 10` (D31) y `UPLOAD_HARD_LIMIT_IMAGES = 3` (regla 9): los topes duros que el admin no puede rebasar. Cambiar cualquiera exige una migración, porque el valor queda en el validador y en la restricción de la base.
- Las horas (`TimeField`) son hora local de `America/Mexico_City`; los servicios las combinan con la fecha usando `ZoneInfo(settings.TIME_ZONE)`.

## Opciones fijas en código

`TextChoices` para lo que el código necesita conocer (geometría 3D, flujo o estados). Sabores, panes y productos no van aquí: son filas editables.

| Clase | Valores (código → etiqueta) | Por qué va en código |
| --- | --- | --- |
| `CakeType` | `tres_leches` "Tres leches", `seco` "Seco", `envinado` "Envinado" | Excepción de D29: códigos en español |
| `CakeShape` | `round` "Redondo", `rectangular` "Rectangular" | La geometría 3D depende de la forma. La usará `CakeDesign` |
| `ProductCategory` | `cake` "Pastel", `dessert` "Postre" | Filtros fijos del mockup (Todo / Pasteles / Postres) |
| `SalesChannel` | `showcase_and_order` "Vitrina y por encargo", `order_only` "Solo por encargo", `showcase_only` "Solo en vitrina" | Cada valor activa una validación distinta |
| `Presentation` | `whole` "Completo", `large` "Grande", `mini` "Mini", `slice` "Rebanada", `individual` "Individual", `cup` "Vaso" | Decide en qué pantalla aparece cada presentación |
| `BreadPricingMode` | `extra_per_kg` "Incremento por kilo", `full_price_per_kg` "Precio completo por kilo (relleno incluido)" | Elige la estrategia de precio desde un registro, sin `if/elif` |
| `DecorationPricing` | `included` "Incluido", `fixed` "Precio fijo", `quote` "Por cotizar" | Elige la estrategia de precio y el paso a `awaiting_quote` |
| `StandOrigin` | `bakery` "Pastelería", `approved` "Aprobada" | Solo `bakery` se muestra en `/bases` |
| `InventoryKind` | `showcase` "Existencia de vitrina", `bread` "Pan para encargos de hoy" | Distingue los dos usos de `Inventory` |

## Configuración de una sola fila

Clase abstracta `SingletonSettings`: `CheckConstraint(condition=Q(pk=1), name="%(app_label)s_%(class)s_singleton")`, `save()` fija `pk=1`, el admin no deja agregar ni borrar y la lista abre directo la única fila. La migración de datos crea la fila. Sin `django-solo`.

### `StoreSettings` ("horarios y entregas")

| Campo | Tipo | `verbose_name` | Inicial |
| --- | --- | --- | --- |
| `store_opens_at` | TimeField | abre | 10:00 |
| `store_closes_at` | TimeField | cierra (también es la hora límite del pago en efectivo) | 22:30 |
| `first_slot_starts_at` | TimeField | primer horario de entrega | 10:30 |
| `last_slot_starts_at` | TimeField | último horario de entrega (inicio del lapso) | 22:00 |
| `slot_minutes` | PositiveSmallInteger | minutos por lapso | 30 |
| `max_orders_per_slot` | PositiveSmallInteger | pedidos activos por lapso | 3 |
| `custom_lead_days` | PositiveSmallInteger | días de anticipación de un pedido | 2 |
| `same_day_showcase_lead_hours` | PositiveSmallInteger | horas de anticipación de un encargo de vitrina para hoy | 2 |
| `free_delivery_from_kg` | PositiveSmallInteger | envío gratis desde (kg) | 15 |

Restricciones: `opens < closes`, `opens <= first_slot <= last_slot < closes`, `slot_minutes > 0`, `max_orders_per_slot > 0`.

### `CakeDesignSettings` ("Diseña tu pastel")

| Campo | Tipo | `verbose_name` | Inicial |
| --- | --- | --- | --- |
| `people_per_kg` | PositiveSmallInteger | personas por kilo | 7 |
| `min_custom_kg` | PositiveSmallInteger | kilos mínimos de un pedido | 4 |
| `max_online_kg` | PositiveSmallInteger | kilos máximos en línea (`help_text`: "PROPUESTA: falta que la pastelería lo valide") | 50 |
| `wafer_price` | Decimal(8,2) | precio de la oblea | 125.00 |
| `wafer_max_width_cm` / `wafer_max_height_cm` | Decimal(4,1) | ancho y alto máximos de la oblea (cm) | 21.6 / 27.9 |
| `message_suggested_max_words` | PositiveSmallInteger | palabras sugeridas para el mensaje (no bloquea) | 4 |

Restricciones: todos `> 0`, `max_online_kg >= min_custom_kg`, `wafer_price >= 0`.

`clean()`: `max_online_kg` no puede pasar de lo que cubre la base activa más grande, y sin bases activas no se puede fijar (D39); solo se revisa en el alta o cuando ese campo cambia. Las opciones de "Diseña tu pastel" anuncian el máximo efectivo, el menor entre este campo y esa base (0 si no hay bases activas).

### `PolicySettings` ("políticas")

| Campo | Tipo | `verbose_name` | Inicial |
| --- | --- | --- | --- |
| `stand_return_days` | PositiveSmallInteger | días para devolver la base | 15 |
| `damaged_stand_policy` | TextField, `blank=True` | qué pasa si la base regresa dañada | vacío = PENDIENTE |

Aquí entrarán después las políticas pendientes de D5 (cancelaciones, vigencia de la cotización).

### `UploadSettings` ("subidas")

| Campo | Tipo | `verbose_name` | Inicial |
| --- | --- | --- | --- |
| `max_upload_mb` | PositiveSmallInteger, `MaxValueValidator(settings.UPLOAD_HARD_LIMIT_MB)` | tamaño máximo por imagen (MB) | 5 |
| `max_reference_images` | PositiveSmallInteger, `MaxValueValidator(settings.UPLOAD_HARD_LIMIT_IMAGES)` | imágenes por envío de referencia | 3 |

Restricciones: `1 <= max_upload_mb <= 10` y `1 <= max_reference_images <= 3` (los topes duros también en la base). 1 MB = 1,048,576 bytes.

## Opciones y precios de "Diseña tu pastel"

### `Bread` ("pan"), hereda de `OrderedOption`

- `name` CharField(60) único, "nombre"; `slug` SlugField(60) único, "identificador" (lo usan la vista previa y "Personalizar este pastel"; de solo lectura en el admin tras crearlo); `description` CharField(120) opcional.
- `pricing_mode`: choices `BreadPricingMode`, "cómo se cobra".
- `price_per_kg`: Decimal(8,2), "precio por kilo" (incremento o precio completo según el modo).
- `included_filling`: CharField(120) opcional, "relleno incluido" (por ejemplo "Crema de chocolate sabor helado").
- `allowed_cake_types`: `ArrayField(CharField(choices=CakeType))`, "tipos de pastel en que se ofrece"; por defecto los tres; en el admin, casillas (`CheckboxSelectMultiple`).
- `preview_color`: CharField(7) opcional, validado `#RRGGBB`, "color en la vista previa".
- Restricciones: `price_per_kg >= 0`; con `full_price_per_kg`, `included_filling != ''` y `price_per_kg > 0`; con `extra_per_kg`, `included_filling == ''`; `allowed_cake_types__len__gt=0` (confirmar con prueba que un arreglo vacío da 0 y no NULL); `allowed_cake_types__contained_by` los tres códigos.

### `FillingBase` ("base de relleno"), hereda de `OrderedOption`

- `name` y `slug` únicos, `description` y `preview_color` opcionales.
- `max_flavors`: PositiveSmallInteger, "máximo de sabores" (Normal 2; con queso y con flan 1).
- `combined_extra_per_kg`: Decimal(8,2), "cargo por relleno combinado, por kg" (Normal 5; las demás 0).
- Restricciones: `1 <= max_flavors <= 2` (la vista previa parte mitad y mitad); `combined_extra_per_kg >= 0`; `max_flavors = 1` obliga a `combined_extra_per_kg = 0`.

### `FillingFlavor` ("sabor de relleno"), hereda de `OrderedOption`

- `name` y `slug` únicos, `preview_color` opcional.
- `bases`: M2M a `FillingBase`, `related_name="flavors"`, "bases en que se ofrece" (no vacío, validado en `clean()` del admin).
- `is_combinable`: Bool, `True` por defecto, "se puede combinar".
- `allowed_cake_types`: igual que en `Bread`, con las mismas restricciones.

### `FillingPrice` ("precio del relleno por kilo")

Copia la tabla 4.5 de las reglas.

- `cake_type` (choices `CakeType`), `base` (FK `FillingBase`, PROTECT), `flavor` (FK `FillingFlavor`, PROTECT, `null=True`: vacío = precio general de la base; con sabor = sabor con precio propio), `price_per_kg` Decimal(8,2) `> 0`.
- Dos `UniqueConstraint` parciales: `(cake_type, base)` donde `flavor IS NULL` (impide dos precios generales iguales) y `(cake_type, base, flavor)` donde `flavor IS NOT NULL`. No se usa `nulls_distinct=False`: exige PostgreSQL 15 y los servidores anteriores lo ignoran en silencio.
- `clean()`: el sabor pertenece a la base y su `allowed_cake_types` incluye `cake_type`. Un sabor con precio propio no puede costar menos que el precio general de su base en el mismo tipo, y tampoco se puede subir el precio general por encima de un sabor (se revisa de los dos lados, D39).
- Regla del servicio: una base está disponible en un tipo si tiene su fila general y al menos un sabor que se ofrezca en ese tipo; un sabor con fila propia reemplaza el precio general; con dos sabores se toma el mayor y se suma `base.combined_extra_per_kg` (así sale "Nuez + $5").

### `TierRecommendation` ("recomendación de pisos")

- `tiers` PositiveSmallInteger único `>= 1`, "pisos"; `recommended_min_kg` PositiveSmallInteger, "kilos recomendados desde"; `recommended_max_kg` PositiveSmallInteger `null=True`, "hasta (referencia)", solo informativo.
- Restricción: `recommended_max_kg IS NULL OR >= recommended_min_kg`; `clean()` revisa que los kilos crezcan con los pisos.
- El máximo de pisos es el `tiers` más alto de la tabla (una sola fuente, sin un "5" aparte).

### `CoverageColor` ("color de cobertura"), hereda de `OrderedOption`

- `name` y `slug` únicos; `preview_color` CharField(7) **obligatorio**. La cobertura "crema pastelera" es una sola opción y no lleva tabla.

### `DecorationOption` ("decoración"), hereda de `OrderedOption`

- `name` y `slug` únicos (la vista previa traduce el `slug` a una geometría), `description` CharField(120).
- `pricing`: choices `DecorationPricing`; `price`: Decimal(8,2) `null=True, blank=True`, `help_text` "PENDIENTE si está vacío".
- Restricciones: `Q(pricing="fixed") | Q(price__isnull=True)`; `price IS NULL OR price > 0`; `UniqueConstraint(fields=["pricing"], condition=Q(pricing="included"))` y otra igual para `quote` (un solo "Sin decoración" y un solo "Otra decoración").

## Bases y envío

### `CakeStand` ("base")

Es un tamaño de base con su depósito, no cada base física.

- `min_kg`, `max_kg` PositiveSmallInteger, "desde (kg)" y "hasta (kg)"; `deposit` Decimal(8,2) `>= 0`; `origin` choices `StandOrigin`; `description` CharField(120) opcional ("Madera forrada en aluminio"); `is_active`.
- Restricciones: `min_kg <= max_kg`; `UniqueConstraint(max_kg)`; `ExclusionConstraint` contra rangos encimados con `Func(F("min_kg"), F("max_kg"), Value("[]"), function="int4range")` y `RangeOperators.OVERLAPS` (GiST sobre un rango, sin `btree_gist`).
- El admin no deja borrar tamaños de base, solo desactivarlos. `clean()`: al guardar un tamaño, el `min_kg` más chico de la tabla, contando los inactivos, no puede quedar por encima de `min_custom_kg` (D39); cambiar `min_custom_kg` no lo revisa.
- La etiqueta "Base para 4 a 5 kg" se arma en el serializador.
- Regla del servicio: el depósito es el del tamaño activo con el `max_kg` más chico que sea `>= kg`; si `kg` es menor que el `min_kg` más chico de toda la tabla (activas o no), no hay base (así "aplica desde 4 kg" sale del dato); si ningún tamaño activo alcanza los kilos, el precio responde 400 en `kg` ("No hay una base para N kg. Escríbenos por WhatsApp."). El admin advierte si el `max_kg` activo más alto es menor que `max_online_kg`.
- Filas iniciales (10): `bakery` 4–5 $70, 6–8 $90, 10–12 $150, 15–15 $200, 20–25 $250; `approved` 26–30 $300, 31–35 $350, 36–40 $400, 41–45 $450, 46–50 $500. Los rangos 9, 13–14 y 16–19 no llevan fila: los cubre la regla de la siguiente base.

### `DeliveryFeeBand` ("tarifa de envío por distancia")

- `max_km` Decimal(5,1) único `> 0`, "hasta (km)"; `fee` Decimal(8,2) `>= 0`, "costo de envío".
- Filas iniciales: 3 km → $50, 6 → $80, 10 → $130, 15 → $190. Más allá de la última, "Por WhatsApp" (el servicio devuelve `None`). La fórmula de referencia se queda solo en las reglas.

## Catálogo

### `Product` ("producto"), hereda de `OrderedOption`

- `name` CharField(80) único; `slug` SlugField(80) único, "identificador en la dirección" (`/pasteles/:slug`); `category` choices `ProductCategory`, `db_index`; `sales_channel` choices `SalesChannel`, por defecto `showcase_and_order`.
- `summary` CharField(160), "descripción corta" (tarjeta); `description` TextField opcional (ficha).
- `cake_type` choices `CakeType` `null=True`; `bread`, `filling_base`, `filling_flavor` FK PROTECT `null=True` (para "Personalizar este pastel", la etiqueta "Tres leches con queso" y el pan de los encargos del mismo día).
- `storage_notes`, `transport_notes` TextField opcionales, "conservación" y "transporte" (vacíos = PENDIENTE; la ficha oculta la sección si están vacíos).
- `photo` CharField(120) opcional, "archivo de la foto": solo el nombre de un archivo estático del frontend, validado con `^[a-z0-9][a-z0-9-]*\.(webp|jpg|jpeg|png|avif)\Z` (nunca una URL ni una ruta).
- Restricciones: un postre lleva `cake_type`, `bread`, `filling_base` y `filling_flavor` vacíos; un sabor exige base; una base exige tipo; un pan exige tipo.
- `clean()`: el sabor pertenece a la base; pan y sabor permitidos en ese tipo; un pan de precio completo no lleva base; un producto `order_only` no puede tener existencias de vitrina.
- Índice: `(category, is_active, sort_order)`.

### `CatalogPrice` ("precio de catálogo")

Cada fila es una celda de la tabla de la sección 2 de las reglas.

- `name` CharField(80) único ("Pastel de sabor normal, completo"); `amount` Decimal(8,2) `> 0`; `approx_weight_kg` Decimal(4,1) `null=True`; `servings` PositiveSmallInteger `null=True`; `sort_order`.
- Filas iniciales (20): normal completo 350 (2.7 kg, 19 personas) / rebanada 35; con queso o flan completo 420 (2.7 kg, 19) / rebanada 40; Choco-pingüino completo 350 (2.7 kg, 19) / rebanada 35; Red velvet completo 450 (peso vacío); mini 130 (3 personas); Imposible 350 / 35; Posible 350 / 35; Flan napolitano grande 360 / individual 35; Tarta de frutas grande 290 / mini 35; Gelatina de molde 290; Mosaico con crema 20, Mosaico con yogurt 20, Duvalín 25.

### `ProductOffering` ("presentación a la venta")

- `product` FK CASCADE `related_name="offerings"`; `presentation` choices `Presentation`; `price` FK `CatalogPrice` PROTECT; `photo` CharField(120) opcional, con la misma validación que la del producto (si tiene valor, reemplaza la foto del producto en esa presentación); `is_active`, `sort_order`.
- `UniqueConstraint(product, presentation)`. Unas 47 filas iniciales.
- "No hay mini con queso ni con flan" se cumple porque esa fila no existe (una prueba de la semilla lo vigila).

## Inventario

### `Inventory` ("inventario")

Una sola tabla, porque las reglas la nombran así para los dos usos.

- `kind` choices `InventoryKind`; `offering` FK `ProductOffering` PROTECT `null=True`; `bread` FK `Bread` PROTECT `null=True`; `stock_date` DateField, "día", por defecto `timezone.localdate`; `quantity` PositiveIntegerField; `updated_at` auto_now.
- Restricciones: una de dos (`kind='showcase'` con `offering` y sin `bread`, o `kind='bread'` con `bread` y sin `offering`); `UniqueConstraint(offering, stock_date, condition=Q(offering__isnull=False))`; `UniqueConstraint(bread, stock_date, condition=Q(bread__isnull=False))`. Índice `(stock_date, kind)`.
- Es por día: lo que no se cargó para hoy no aparece en vitrina ni en rebanadas. Fila de hoy con cantidad > 0: "Quedan [n]" y "En vitrina hoy"; con 0: "Agotada por hoy".
- Descuento atómico: `filter(pk=…, quantity__gte=n).update(quantity=F("quantity") - n)`. Si no actualiza ninguna fila, está agotado.
- En el admin, dos proxies: "Vitrina de hoy" y "Pan de hoy", filtrados por `kind`, con el día de hoy por defecto y la cantidad editable en la lista (`list_editable`).
- Bloqueo optimista: la pastelería edita la cantidad absoluta, pero un pedido puede descontar o devolver piezas mientras tanto. Cada escritura de los repositorios sube `updated_at` (`updated_at=Now()`); la lista y el formulario llevan un campo oculto con el `updated_at` de la carga y, si una fila que se editó ya es otra al guardar, no escriben nada y piden recargar ("Las existencias cambiaron mientras editabas; recarga la página"). Solo se revisan y se bloquean (`select_for_update`, hasta terminar la petición) las filas editadas: una venta en una fila que no se tocó no rechaza el guardado de las demás. Para saber qué se editó, la cantidad lleva su valor inicial oculto; el formulario de cambio, que siempre escribe la fila, la revisa siempre.
- Guardia de lectura: un producto `order_only` nunca muestra existencias de vitrina, aunque alguien las escriba fuera del admin (`product_repo` y su par en memoria las dan como `None`).
- Los pedidos de "Diseña tu pastel" no descuentan vitrina ni pan (D14, D30). El pan solo lo consume un encargo de vitrina para hoy.

## Dónde vive cada regla

| Regla | Dónde vive |
| --- | --- |
| Horario 10:00–22:30; el efectivo vence a las 22:30 | `StoreSettings.store_opens_at` y `store_closes_at` |
| Ventana 10:30–22:00 en lapsos de 30 min | `first_slot_starts_at`, `last_slot_starts_at`, `slot_minutes`; los lapsos los genera un servicio |
| Máximo 3 pedidos activos por lapso | `max_orders_per_slot`; el conteo con `select_for_update` en `order_repo` (con `DeliverySlot`) |
| 2 días de anticipación | `custom_lead_days` y validación en servicio |
| Vitrina hoy si hay | `Inventory` (`showcase`, hoy) con cantidad > 0 |
| Encargo de vitrina hoy con 2 h si hay pan | `same_day_showcase_lead_hours` + `Inventory` (`bread`, hoy) + `Product.bread` |
| Primer horario = ahora + 2 h, al siguiente lapso | Servicio que recibe la hora como parámetro |
| Precios completos, rebanada, mini e individual | `CatalogPrice` y `ProductOffering` |
| "Solo en vitrina" / "Solo por encargo"; Red velvet nunca en vitrina | `Product.sales_channel`, validación en servicio y en `clean()` de `Inventory` |
| No hay mini con queso ni con flan | Dato: esa `ProductOffering` no existe |
| ~2.7 kg y ~19 personas; mini ~3 personas | `CatalogPrice.approx_weight_kg` y `servings` |
| "Personalizar este pastel" con el sabor elegido | `Product.cake_type`, `bread`, `filling_base`, `filling_flavor` |
| 7 personas por kilo, redondeo half-up | `people_per_kg`; `ROUND_HALF_UP` en servicio |
| Mínimo 4 kg; cota de 50 kg (PROPUESTA) | `min_custom_kg`, `max_online_kg`; más de la cota responde "escríbenos por WhatsApp" |
| Redondo y rectangular; formas sin mezclar | `CakeShape`; `CakeDesign` tendrá un solo `shape` |
| Máximo 5 pisos; kilos recomendados (aviso) | `TierRecommendation` |
| Panes, incrementos y precios completos | `Bread` y el registro de estrategias |
| Choco-pingüino y Red velvet saltan el relleno | `Bread.pricing_mode = full_price_per_kg` + `included_filling` |
| Red velvet solo seco; Choco-pingüino no envinado; Fresa con yogurt no envinado | Datos en `allowed_cake_types` + validación en servicio; la interfaz las muestra desactivadas con su motivo |
| Fresa con yogurt no se combina | `FillingFlavor.is_combinable = False` |
| Combinado solo con base Normal, máximo 2 sabores, +$5/kg | `FillingBase.max_flavors` y `combined_extra_per_kg` |
| Precio por kilo por tipo, base y sabor especial | `FillingPrice` |
| Los 11 colores de cobertura | `CoverageColor` |
| Decoraciones; "otra" lleva a `awaiting_quote` | `DecorationOption` |
| Mensaje: sugerencia de 4 palabras; oblea $125 tamaño carta | `CakeDesignSettings` |
| Depósitos y "siguiente base más grande"; 15 días | `CakeStand` + servicio; `PolicySettings.stand_return_days` |
| Envío: recoger sin costo, gratis desde 15 kg, bandas, más de 15 km por WhatsApp | Servicio, `free_delivery_from_kg`, `DeliveryFeeBand` |
| 5 MB editable, tope de 10 MB; máximo 3 imágenes | `UploadSettings` + `UPLOAD_HARD_LIMIT_MB` y `UPLOAD_HARD_LIMIT_IMAGES` + `CheckConstraint`. El tope de bytes lo aplica la etapa de subida, no el serializador (DRF ya leyó el cuerpo): rechaza por `Content-Length` y con un `FileUploadHandler` que aborta al pasar el límite |

Las restricciones que el backend debe rechazar (lista de `backend/AGENTS.md`) son datos más una validación en el servicio, que rechaza aunque el frontend las oculte. Una prueba de la migración de datos comprueba que los valores sembrados cumplen cada regla.

## PENDIENTE

- **En este alcance:** precios de patrón con duya, flores y chispas; política de base dañada; fotos de producto; conservación y transporte; base física para 26–50 kg; peso del Red velvet completo. La cota de 50 kg es PROPUESTA (tiene valor, con marca en el `help_text`).
- **Modelo:** `null=True, blank=True` (o `blank=True` en textos), sin valor por defecto y nunca 0. `help_text`: "PENDIENTE: la pastelería aún no lo define. Déjalo vacío; no pongas un valor supuesto."
- **Admin:** `empty_value_display = "PENDIENTE"` y filtro lateral "Con precio pendiente" (`price__isnull`).
- **API:** el serializador manda `price: null` y `price_pending: true`.
- **Interfaz:** las decoraciones sin precio se muestran desactivadas con "Precio por confirmar"; nunca se cobran como $0.
- **Servicio:** si una opción sin precio llega al cálculo, lanza `PendingPriceError`.

## Datos iniciales

Migraciones de datos (`RunPython`), no fixtures: llegan igual a producción, desarrollo y pruebas, sin pasos manuales. Usan `apps.get_model` y `get_or_create` por `slug` o `name`, nunca `update_or_create`, para no pisar lo que editó la pastelería. La reversa es `RunPython.noop`.

Se implementó un par de migraciones (esquema y semilla) por paso, para que cada paso quedara verde y se pudiera revertir por separado. Son 9 migraciones en lugar de las 4 previstas:

- `0002_settings` y `0003_seed_settings`: las 4 configuraciones y su fila.
- `0004_cake_options` y `0005_seed_cake_options`: 5 panes, 3 bases de relleno, 10 sabores con su M2M, 14 `FillingPrice`, 5 `TierRecommendation`, 11 colores y 5 decoraciones (3 con precio vacío).
- `0006_stands_and_delivery` y `0007_seed_stands_and_delivery`: 10 `CakeStand` y 4 bandas de envío.
- `0008_catalog` y `0009_seed_catalog`: 20 `CatalogPrice`, los productos del mockup (14 pasteles y 8 postres) y sus 47 `ProductOffering`.
- `0010_inventory`: `Inventory` y sus proxies. El inventario no se siembra.

Los valores vienen de `docs/reglas-de-negocio.md`; las descripciones cortas, del mockup; los colores de vista previa, de `pastel-css3d.js`: el primer tono de cada pan, sabor y color de cobertura, y el tono de la capa de crema de las bases con queso y con flan (`BASEREL`). La base Normal y el pan Choco-vainilla no tienen color propio en el prototipo y quedan vacíos. El inventario no se siembra; para la demo, un comando `seed_demo_inventory` que se niega a correr con `DEBUG=False`.

## Repositorios

Devuelven dataclasses inmutables (no instancias del modelo), para que `MemoryRepo` devuelva los mismos tipos y los servicios se prueben sin PostgreSQL. Ninguno guarda estado entre peticiones.

- **`product_repo.py`:** `list_catalog(category=None, search=None, on_date)`, `get_product_by_slug(slug, on_date)`, `list_showcase(on_date, category=None)`, `list_slices(on_date)`, `list_related(product_id, limit=3)`, `get_offering(offering_id)`; existencias: `get_showcase_stock`, `decrement_showcase_stock(offering_id, date, qty) -> bool`, `restock_showcase`, `get_bread_availability`, `consume_bread -> bool`, `release_bread`.
- **`cake_option_repo.py`:** `list_breads()`, `list_filling_bases_with_flavors()`, `get_filling_price_table() -> dict[(cake_type, base_slug, flavor_slug | None), Decimal]`, `list_coverage_colors()`, `list_decorations()`, `list_tier_recommendations()`.
- **`settings_repo.py`:** `get_store_settings()`, `get_cake_design_settings()`, `get_policy_settings()`, `get_upload_settings()`, `list_stand_sizes(active_only=True)`, `list_delivery_bands()`.

Detalles de la implementación (el código manda):

- `list_catalog` recibe `on_date` como argumento con nombre y obligatorio: `list_catalog(*, on_date, category=None, search=None)`.
- `restock_showcase` y `release_bread` devuelven `bool` y no crean la fila del día: si no se cargó nada para esa fecha, no hay existencias que devolver (`False`).
- `list_showcase` excluye las rebanadas y `list_slices` solo las incluye; las dos incluyen las agotadas (cantidad 0). Qué presentaciones salen en cada pantalla (flan individual, tarta mini) sigue siendo la pregunta 6 para la pastelería.
- El filtro "Con precio pendiente" del admin de decoraciones cuenta solo las de precio fijo sin precio: "Sin decoración" y "Otra decoración" tienen el precio vacío a propósito.
- El admin de una configuración de una sola fila solo deja agregar si la tabla quedó vacía.

## Alternativas descartadas

1. Una sola configuración con todo (Objeto Dios); tabla clave–valor sin tipos; precios en `JSONField`.
2. `CakeType` como tabla (D29 fija los códigos); un motor genérico de restricciones (sobreingeniería).
3. Disponibilidad deducida solo de que exista una fila de precio (implícita para el admin).
4. Precio guardado en cada presentación sin `CatalogPrice` (16 ediciones para subir un precio).
5. Centavos enteros (el admin mostraría 35000 para $350).
6. Inventario como contador sin fecha; dos tablas de inventario.
7. Guardar los coeficientes de la fórmula de envío; `ImageField` para fotos de producto; fixtures; `django-solo`.

## Respuestas del equipo y preguntas para la pastelería

**Respondidas por el equipo (D32):** inventario por día; fotos de producto como archivos estáticos del frontend; decoraciones sin precio desactivadas con "Precio por confirmar"; Fresa con yogurt desactivada en envinado (se corrigió la regla 4.7); el último lapso empieza a las 22:00; la hora límite del efectivo es `store_closes_at`; conservación y transporte por producto; color de vista previa en la base; grupos de permisos "Mostrador" (inventario) y "Precios" (precios y configuración), creados por un superusuario (D27). Por defecto, mientras no se diga otra cosa: `CakeStand` es un tamaño sin contar unidades físicas; el mensaje lleva un tope técnico de caracteres que se fija con `CakeDesign`; la ocasión (6.4) va en código; sin campo de repartidor ni de tope de km para el envío gratis.

**Para la pastelería (quedan PENDIENTE y configurables):**

1. Unidad del pan para encargos de hoy (por tipo de pan, total o sí/no) y si el mini lo consume.
2. Con qué pan se hace cada pastel de vitrina (`Product.bread` queda vacío hasta saberlo; solo Choco-pingüino y Red velvet lo traen sembrado, porque la regla 4.3 fija su pan).
3. Qué sabores salen en vitrina como pastel completo (se siembran los 8 del mockup) y a qué precio si se agregan Fresa con yogurt o Nuez.
4. Si hay mini de todos esos sabores (se siembra el mismo conjunto).
5. Mosaico con yogurt: un producto o uno por sabor (se siembra uno).
6. Qué se muestra en vitrina y qué en rebanadas (flan individual y tarta mini).
7. Qué peso cuenta para el envío gratis desde 15 kg y el peso del Red velvet completo.
8. Qué base física se presta para 26–50 kg.
9. Salida de `awaiting_quote` (sección 14 de las reglas).

## Orden de implementación y pruebas

Antes de empezar: `django.contrib.postgres` y `UPLOAD_HARD_LIMIT_MB` en settings; al terminar, actualizar la tabla de entidades de [`arquitectura.md`](arquitectura.md#entidades-previstas), el estado de `backend/AGENTS.md` y la bitácora.

1. **Opciones en código, `OrderedOption`, `SingletonSettings` y las 4 configuraciones, con semilla y admin.** Pruebas: segunda fila → `IntegrityError`; el admin no deja agregar ni borrar; la base rechaza `opens >= closes` y `max_upload_mb = 11`, y el formulario también; los valores sembrados coinciden con las reglas.
2. **`Bread`, `FillingBase`, `FillingFlavor`, `FillingPrice`, `TierRecommendation`, `CoverageColor`, `DecorationOption`, con semilla.** Pruebas: pan de precio completo sin relleno incluido rechazado; `max_flavors = 3` rechazado; cargo de combinado con `max_flavors = 1` rechazado; dos filas generales iguales en `FillingPrice` rechazadas; decoración incluida con precio rechazada y segundo "incluido" rechazado; `allowed_cake_types` vacío rechazado; `clean()` rechaza un precio de sabor en un tipo no permitido; la tabla sembrada es igual a la 4.5 y las restricciones sembradas cumplen las reglas.
3. **`CakeStand` y `DeliveryFeeBand`, con semilla.** Pruebas: rangos encimados y `min > max` rechazados; depósito por kilos: 3 → sin base, 9 → $150, 13 → $200, 16 → $250, 26 → $300, 50 → $500; bandas: 3 km → $50, 3.1 → $80, 15.1 → sin banda.
4. **`Product`, `CatalogPrice`, `ProductOffering`, con semilla.** Pruebas: postre con tipo de pastel, sabor sin base y presentación repetida rechazados; sin mini con queso o flan; gelatinas en vaso `showcase_only`; Red velvet `order_only`; 14 pasteles y 8 postres.
5. **`Inventory` y los proxies del admin.** Pruebas: "una de dos" entre vitrina y pan; una fila por presentación y día; cantidad negativa rechazada; descuento atómico (con 1 pieza, de dos descuentos solo pasa uno, prueba transaccional); `clean()` rechaza vitrina para `order_only`; "hoy" en zona de Ciudad de México (a las 23:30 locales sigue siendo el mismo día).
6. **Repositorios** con sus dataclasses y `MemoryRepo`. Pruebas de consultas contra PostgreSQL: catálogo, ficha, vitrina, rebanadas, relacionados y tabla de precios.
7. **Admin de PENDIENTE.** Prueba: la lista de decoraciones muestra "PENDIENTE" con el precio vacío y el filtro "Con precio pendiente" funciona.
