# Estrategia de pruebas

El proyecto prueba la lógica de negocio con `pytest` y `pytest-django`, el recorrido de compra con Playwright y la accesibilidad con una revisión por pantalla. Estado al 4 de noviembre de 2026: hay 687 pruebas de backend recolectadas en `backend/tests/` (686 pasan y 1 se salta sin el build del frontend), que cubren el modelo de usuario, el admin, la configuración, la documentación de la API, la sesión JWT, el hash de contraseñas, el throttling, el catálogo, el inventario y la configuración editable con sus semillas, restricciones y repositorios, el precio de "Diseña tu pastel" y sus opciones, el depósito de la base, el decorador de auditoría, los dos endpoints públicos y el parser JSON; y 2 pruebas de humo con Playwright en `frontend/e2e/`. Las pruebas de la lógica de negocio que faltan llegan con los servicios de las etapas 2 a 4.

## Contenido

- [Principios](#principios)
- [Pruebas unitarias del backend](#pruebas-unitarias-del-backend)
- [Rechazos del backend](#rechazos-del-backend)
- [Prueba de extremo a extremo con Playwright](#prueba-de-extremo-a-extremo-con-playwright)
- [Accesibilidad](#accesibilidad)
- [Casos por confirmar](#casos-por-confirmar)
- [Ver también](#ver-también)

## Principios

- Los valores esperados salen de [`../reglas-de-negocio.md`](../reglas-de-negocio.md). Si una regla cambia, cambia primero ese documento y después la prueba.
- Las pruebas de los servicios no tocan PostgreSQL: usan repositorios en memoria (`MemoryRepo`) inyectados en el servicio ([`arquitectura.md`](arquitectura.md#patrones-de-diseño)).
- Los SDK de Mercado Pago y Stripe se sustituyen por dobles; ninguna prueba hace llamadas de red.
- Las pruebas de tiempo (efectivo apartado, primer horario del día) reciben la hora como parámetro en lugar de leer el reloj.
- Los precios y los límites se leen de la base de datos; las pruebas los cargan como datos de prueba con los valores de las reglas.

## Pruebas unitarias del backend

Herramientas: `pytest` y `pytest-django`, en `backend/tests/`. Los nombres de archivo se definen al crearlos.

### Precio del pastel

Estrategias de `services/pricing_service.py` (fórmula en las reglas, sección 4.6).

| Caso | Entrada | Resultado esperado |
| --- | --- | --- |
| Ejemplo de las reglas | 15 kg, tres leches, pan de chocolate, base con queso, sabor zarzamora | 15 × ($250 + $5) = $3,825 |
| Relleno normal | 10 kg, seco, pan de vainilla, base normal, fresa | 10 × $180 = $1,800 |
| Envinado cuesta más | 10 kg, envinado, pan de vainilla, base normal, durazno | 10 × $200 = $2,000 |
| Relleno combinado | 10 kg, tres leches, vainilla, base normal, durazno y fresa | 10 × ($180 + $5) = $1,850 |
| Combinado con nuez | 10 kg, tres leches, vainilla, base normal, durazno y nuez | 10 × ($190 + $5) = $1,950 |
| Choco-pingüino | 5 kg, tres leches, Choco-pingüino | 5 × $250 = $1,250, sin cobrar relleno |
| Red velvet | 6 kg, seco, Red velvet | 6 × $280 = $1,680, sin cobrar relleno |
| Oblea | Cualquier pedido con oblea | Suma $125 al pedido |
| Estrategia intercambiable | Misma entrada con una estrategia distinta inyectada | El resultado cambia sin tocar `pricing_service.py` |

### Restricciones de pan y relleno

Sección 4.7. Cada opción no disponible se devuelve desactivada con su motivo; no desaparece.

| Caso | Resultado esperado |
| --- | --- |
| Tipo envinado con Choco-pingüino | Rechazado: "No se combina con pastel envinado" |
| Tipo tres leches o envinado con Red velvet | Rechazado: "Solo en pastel seco" |
| Tipo seco con Red velvet | Aceptado |
| Fresa con yogurt en envinado | No disponible |
| Fresa con yogurt más un segundo sabor | Rechazado |
| Relleno combinado con base con queso o con flan | Rechazado; el combinado es solo para la base normal |
| Tres sabores en un relleno combinado | Rechazado; el máximo es 2 |
| Pan Choco-pingüino o Red velvet | El paso de relleno queda incluido y bloqueado |
| Cambiar el tipo de pastel con un pan ya elegido que deja de ser válido | El pan queda marcado como "Hay que cambiarlo" |

### Personas, kilos y pisos

Secciones 3.1 y 3.3.

| Caso | Entrada | Resultado esperado |
| --- | --- | --- |
| Mínimo del pedido | 10 personas | 4 kg |
| Justo en el mínimo | 28 personas | 4 kg |
| Redondeo hacia abajo | 38 personas (5.43 kg) | 5 kg |
| Redondeo hacia arriba | 39 personas (5.57 kg) | 6 kg |
| Cota en línea (PROPUESTA) | 350 personas | 50 kg |
| Pisos recomendados | 14, 15, 18, 25, 30 kg | 1, 2, 3, 4, 5 pisos |
| Una recomendación no bloquea | 10 kg en 2 pisos | Aviso, sugiere 1 piso y se puede continuar |
| Sin aviso | 15 kg en 1 piso | Sin aviso |

### Depósito de la base

Sección 7. El depósito aplica a partir de 4 kg y usa siempre la siguiente base más grande.

| Kilos | Depósito |
| --- | --- |
| 3 | $0 |
| 4 y 5 | $70 |
| 6 y 8 | $90 |
| 9 y 12 | $150 |
| 13 y 15 | $200 |
| 16 y 25 | $250 |
| 26 y 30 | $300 |
| 31 | $350 |
| 50 | $500 |

La prueba recorre de 4 a 50 kg y comprueba que el depósito nunca baja al subir los kilos. Otra comprueba que la fecha límite de devolución es la fecha de entrega más 15 días.

### Anticipo, depósito y envío

Sección 10.

| Caso | Entrada | Resultado esperado |
| --- | --- | --- |
| Ejemplo de las reglas | Pedido $1,000, base $150, envío $80 | Hoy $730 (500 + 150 + 80); el día de la entrega $500 |
| Sin base ni envío | Pedido $1,000 | Hoy $500; el día de la entrega $500 |
| Base y envío fuera del anticipo | Pedido $1,000, base $150, envío $80 | El anticipo sigue en $500 |

Tarifa de envío por distancia (sección 8, aprobada el 31 de octubre de 2026):

| Kilos del pedido | Distancia | Envío |
| --- | --- | --- |
| Menos de 15 | 3 km | $50 |
| Menos de 15 | 3.1 km | $80 |
| Menos de 15 | 6 km | $80 |
| Menos de 15 | 10 km | $130 |
| Menos de 15 | 15 km | $190 |
| Menos de 15 | 15.1 km | Sin tarifa; se contacta por WhatsApp |
| 15 o más | 8 km | $0 |

### Agenda de entregas

Sección 1. La capacidad es de 3 pedidos activos por lapso de 30 minutos, entre 10:30 y 22:00.

| Caso | Resultado esperado |
| --- | --- |
| Tres pedidos en el lapso de 15:00 a 15:30 | Los tres se aceptan |
| Cuarto pedido en ese lapso | Rechazado; el lapso se muestra como "Lleno" |
| Lapso siguiente (15:30 a 16:00) | Sigue disponible |
| Horario fuera de la ventana (10:00 o 22:30) | Rechazado |
| Pedido con 1 día de anticipación | Rechazado |
| Pedido con 2 días de anticipación | Aceptado |
| Pastel de vitrina para llevar hoy | Aceptado si hay en vitrina |
| Encargo de vitrina para hoy a las 14:10 | Primer horario disponible: 16:30 |
| Dos solicitudes simultáneas para el último lugar de un lapso | Solo una se acepta (control de concurrencia en la base) |

### Efectivo apartado

| Caso | Resultado esperado |
| --- | --- |
| Pedido en efectivo sin pago a las 22:31 del mismo día | Pasa a `cancelled` |
| Pedido en efectivo pagado a las 22:00 | Pasa a `received` |
| Pedido en efectivo, al crearse | Queda en `awaiting_payment` |

### Fábrica de pagos sin `if/elif`

Regla de [`arquitectura.md`](arquitectura.md#patrones-de-diseño): queda prohibido instanciar pasarelas con bloques `if/elif/else`.

| Caso | Resultado esperado |
| --- | --- |
| `create_payment_processor("mercadopago")` | Instancia de `MercadoPagoPayment` |
| `create_payment_processor("stripe")` | Instancia de `StripePayment` |
| `create_payment_processor("cash")` | Instancia de `CashPayment` |
| Tipo desconocido | Error explícito, sin instancia |
| Pasarela nueva agregada al registro con `monkeypatch.setitem` | La función la resuelve sin modificarse |
| Inspección del código de `create_payment_processor` con `ast` | No contiene nodos `If` |
| Adapter de Mercado Pago con un SDK simulado | Traduce la respuesta al formato interno `PaymentResult` |

### Observer

| Caso | Resultado esperado |
| --- | --- |
| Observadores suscritos y cambio de estado | Todos reciben el aviso con el estado anterior y el nuevo |
| Pedido de vitrina entra en `awaiting_payment` o `received` (el primero que ocurra) | `InventoryObserver` descuenta las existencias una sola vez |
| Pedido entra en `cancelled` | `InventoryObserver` reintegra las existencias |
| Pedido personalizado | No descuenta vitrina |
| Efectivo: pedido de vitrina apartado, no se paga antes de las 22:30 y pasa a `cancelled` | Existencias descontadas al apartar y reintegradas al cancelar |
| Pedido con base entra en `delivered` | `StandLoanObserver` crea la base `on_loan` con fecha límite igual a la entrega más 15 días y retiene el depósito |
| Evento "base devuelta" | La base pasa a `returned` y el depósito queda reembolsado |
| Segundo evento "base devuelta" | No reembolsa otra vez |
| Cambio de estado | `CustomerNotificationObserver` registra el aviso |

### API y decorador

| Caso | Resultado esperado |
| --- | --- |
| Mismo `Idempotency-Key` enviado dos veces al pago | Un solo cobro y un solo pedido |
| Llaves distintas | Dos cobros |
| Webhook de pago repetido | Se procesa una vez |
| Petición sin token a un endpoint de pedidos | 401 |
| Webhook con firma inválida | 400 y el estado no cambia |
| Webhook con monto o moneda distintos | Se rechaza |
| Petición de pago con un monto alterado por el cliente | Se cobra el monto del servidor |
| Regreso del cliente con `status=approved` sin webhook | El pedido no cambia |
| Listado de pedidos | Respuesta paginada |
| Exceso de peticiones | 429 por throttling |
| `/api/v1/docs/` con personal con sesión | 200 con la documentación |
| `/api/v1/docs/` anónimo o como cliente en producción | 401 o 403 |
| Cliente registra su propio pago en efectivo | 403 |
| `PATCH` de cliente con `status` o `refunded` | El estado no cambia |
| Dos `POST` simultáneos de "Base devuelta" | Un solo reembolso |
| `@audit_operation` | Conserva `__name__` (por `functools.wraps`), registra en `core_pasteleria.audit` el tiempo en milisegundos: INFO `ok`, INFO `rejected:<Clase>` con un error previsto y ERROR con el nombre de la clase ante otro; nunca argumentos ni el mensaje del error |
| `POST /api/v1/cake-designs/price/` sin sesión o con un token vencido | 200; no pide CSRF |
| Cuerpo de más de 16 KB | 413 "La petición es demasiado grande." |
| Formulario o multipart a la API | 415 |
| JSON anidado hasta agotar la recursión | 400 "JSON inválido." |
| Precio con monto mandado por el cliente | Se ignora; el total es el del servidor |
| Decoración fija sin precio | Opciones: `available=false`, "Precio por confirmar"; precio: 400 en `decoration` |

### Rechazos del backend

El backend valida aunque la interfaz ya lo impida.

| Caso | Resultado esperado |
| --- | --- |
| 6 pisos | Rechazado; el máximo es 5 |
| Pisos redondos y rectangulares mezclados | Rechazado |
| 3 kg | Rechazado; el mínimo es 4 kg |
| 51 kg (más que la cota en línea, PROPUESTA) | Aviso de WhatsApp |
| 4 imágenes en un envío de referencia | Rechazado; el máximo es 3 |
| Gelatina en vaso por encargo | Rechazado; solo en vitrina |
| Red velvet en vitrina | Rechazado; solo por encargo |
| Pastel mini con queso | Rechazado |
| Cliente sin permiso registra "Base devuelta" | 403 |
| Cliente pide el pedido de otro | 404 |
| Precio propio de un sabor menor que el precio general de su base, o precio general por encima de un sabor | Rechazado en el admin |

### Seguridad

| Caso | Resultado esperado |
| --- | --- |
| Token de la nota | No se puede derivar del id del pedido |
| Recuperar contraseña | Responde igual exista o no el correo |
| Inicio de sesión repetido | Throttling |
| Intentos de inicio de sesión con `X-Forwarded-For` distinto en cada uno | Igual se limitan |

## Prueba de extremo a extremo con Playwright

Los archivos viven en `frontend/e2e/`. El caso pedido es el ejemplo del Tema 4 del profesor: agregar al carrito y validar el total.

### Recorrido de compra con base en préstamo

1. Abrir la portada y entrar a "Diseña tu pastel".
2. Paso 1: elegir 105 personas (15 kg) y forma redonda.
3. Pasos 2 a 4: tres leches, pan de chocolate, relleno con queso y zarzamora.
4. Paso 5: elegir un color de cobertura.
5. Paso 6: sin decoración. Paso 7: un mensaje y una oblea.
6. Paso 8: revisar y agregar al carrito. El pedido de 15 kg lleva una base en préstamo.
7. Entregar a domicilio y elegir una fecha con 2 días o más de anticipación.
8. Validar con aserciones el desglose del libro de marca ([`../libro-de-marca.md`](../libro-de-marca.md), sección "Pago y entrega").

Valores esperados, con el pedido de 15 kg de las reglas ($3,825) más la oblea ($125) y el depósito de una base de 15 kg ($200):

| Línea del desglose | Valor |
| --- | --- |
| Total del pedido (sin la base) | $3,950 |
| Anticipo (50% del pedido) | $1,975 |
| Depósito de la base | $200 |
| Pagas hoy | $2,175 |
| Resto, el día de la entrega | $1,975 |

Supuestos de esta tabla: la oblea suma $125 al total del pedido, no hay decoración fija (su precio sigue PENDIENTE) y el envío es gratis porque el pedido pesa 15 kg. Al construir la prueba se confirman contra el backend.

Los selectores usan roles y etiquetas accesibles (`getByRole`, `getByLabel`), que son las mismas que exige el libro de marca. Así la prueba también vigila que los controles tengan etiquetas reales.

### Otros recorridos previstos

| Recorrido | Qué valida |
| --- | --- |
| Pago en efectivo | La vista "Tu pedido está apartado" con la etiqueta "Apartado, falta tu pago" y el monto exacto a llevar |
| Lapso lleno | El calendario muestra "Lleno" y no deja elegir el lapso |
| Opción no disponible | Envinado desactiva el Choco-pingüino y muestra su motivo |
| Nota y verificación | El enlace del QR abre "Nota válida" sin mostrar teléfono, correo ni dirección |

## Accesibilidad

El objetivo es WCAG 2.1 nivel AA ([`referencias.md`](referencias.md)). Se revisa cada pantalla a 1440 px y a 390 px, contra sus capturas de escritorio y móvil.

| Criterio | Cómo se revisa |
| --- | --- |
| Contraste | Con los tokens del libro de marca; en la revisión de color de la paleta Fresa y mermelada no quedó ningún texto con contraste insuficiente ([`../bitacora.md`](../bitacora.md), 31 de octubre) |
| Foco visible | Recorrido con el teclado en cada pantalla |
| Navegación con teclado | Todo el flujo de compra y la escena 3D sin ratón |
| Etiquetas reales | Cada campo con su `label`; región principal y enlace "Saltar al contenido" |
| Movimiento reducido | Con `prefers-reduced-motion`, sin animaciones que molesten |
| Estados con palabra | Ningún estado se comunica solo con color |
| Tamaño táctil | Enlaces y deslizadores utilizables en móvil |

La herramienta automática de auditoría (por ejemplo una extensión para Playwright) no está elegida. Se decide al iniciar la Etapa 3.

## Casos por confirmar

Estos casos dependen de decisiones que las reglas no cierran:

- Si un pedido cancelado deja de contar en la capacidad de su lapso (las reglas hablan de pedidos "activos").
- El primer horario de un encargo de hoy cuando la hora actual más 2 h cae exactamente en un lapso.
- El primer horario cuando hora actual más 2 h supera las 22:00.
- Si una falla en un observador debe detener a los demás.
- Cuántos días de gracia hay tras la fecha límite de una base, y qué pasa si regresa dañada (pendiente).
- Envío de un pedido de 15 kg o más a más de 15 km: el código de referencia de la sección 8 devuelve $0.

## Ver también

- [Arquitectura](arquitectura.md)
- [Plan de trabajo](plan-de-trabajo.md)
- [Referencias](referencias.md)
- [Reglas de negocio](../reglas-de-negocio.md)
- [Libro de marca](../libro-de-marca.md)
