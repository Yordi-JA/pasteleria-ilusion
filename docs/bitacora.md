# Bitácora del proyecto

Aquí se registran los avances de todas las etapas de Pastelería Ilusión. Las decisiones se registran en [`proyecto/decisiones.md`](proyecto/decisiones.md) y el plan, en [`proyecto/plan-de-trabajo.md`](proyecto/plan-de-trabajo.md).

## Etapa 1: levantamiento, identidad visual y mockup (8 al 31 de octubre)

El registro detallado empieza el 12 de octubre. El kit para el desarrollo se cerró el 1 de noviembre, por eso hay entradas de ese día en esta etapa.

Del 12 de octubre al 1 de noviembre de 2026. Todas las horas son de la Ciudad de México (UTC−6).

### Cómo se reconstruyó

- **Fuentes:** las tres transcripciones de la conversación (12 al 29 de octubre), la sesión actual (29 de octubre al 1 de noviembre), los números de versión de cada publicación (son marcas de tiempo exactas), la hora en el nombre de las capturas que se subieron al chat y la hora de modificación de los archivos de trabajo.
- **Precisión de cada hora:**
  - `19:27` sin símbolo: hora exacta, de una publicación o de un archivo.
  - `≈ 18:06`: hora aproximada, la del turno en que se pidió y se hizo el cambio.
  - Rango ("entre…"): no quedó ninguna marca; se indica el periodo en que ocurrió.
- **Artefactos:**
  - Mockup: https://claude.ai/artifact/PTGBye9Qr2H25X1vAgnEC3
  - Sistema de diseño y libro de marca: https://claude.ai/artifact/D535SPvDnuaR2zQ6WXUKaR
  - Documento para la pastelería: https://claude.ai/artifact/DuAkL6j7DH6agmNjz52qq5

### Resumen

| Fecha | Qué pasó |
| --- | --- |
| Lunes 12 oct | Skills instaladas, dirección "Betún y duya", sistema de diseño, logo con la vela en la i, portada, catálogo, acceso y cuenta. Primer cambio de paleta: de jamaica a durazno |
| Martes 13 oct | Cuenta reorganizada, pago con Stripe y Mercado Pago, carrito, dibujos de línea, barra flotante, revisión de armonía y las 14 vistas pendientes |
| Miércoles 14 oct | Toldo en todas las vistas y pastel 3D en portada, catálogo y acceso |
| 14 al 23 oct | Las seis vistas del pedido personalizado |
| Viernes 23 oct | Pasos de tipo de pastel y de pan con las reglas reales |
| Lunes 26 oct | Relleno, sabores, cobertura, anticipación real, paso de personas, tamaño y forma, y la primera revisión antislop |
| Miércoles 28 oct | Horarios, productos y precios reales, encargo del mismo día, precios por kilo, oblea |
| Jueves 29 oct | Stepper de 8 pasos, editor de la tapa, anticipo y depósito, pedido apartado, accesibilidad, nota en PDF, reglas de negocio, vista previa por etapas, verificación de la nota, esqueletos. En la noche: vitrina sin chocolate, familia de bordes, alturas del lienzo y flama nueva |
| 29 al 31 oct | Exploración de paletas, sin cambios al mockup |
| Sábado 31 oct | Paleta Fresa y mermelada, etiquetas de estado rediseñadas, esqueletos corregidos, formularios móviles, documento para la pastelería, envío aparte del anticipo, inicio del kit |
| Domingo 1 nov | Kit para Claude Code terminado |

---

### Lunes 12 de octubre

- **18:34** Skills de diseño instaladas para la sesión: taste-skill, awesome-design-md, emilkowalski/skills, anti-slop, ui-ux-pro-max e impeccable.
- **≈ 18:49 a 19:11** Definiciones del proyecto: pastelería real sin identidad visual, dirección visual "Betún y duya", logo con la i de "ilusión" como vela encendida, acceso con Google, pagos en sandbox de Mercado Pago y Stripe, el sitio nunca menciona que es un proyecto escolar, las fotos de los pasteles las toma el equipo.
- **19:02 a 19:14** Sistema de diseño creado: tokens, libro de marca, guía de fotografía y logos.
- **19:27** Portada, escritorio y móvil (primera versión, en jamaica).
- **19:32 y 19:35** Portada: se quita la cinta; el pastel baja directo sobre "Lo más pedido".
- **19:40 y 19:44** Catálogo, escritorio y móvil. La navegación cambia "Diseñar mi pastel" por "Realizar pedido", y la vitrina se vuelve sección propia.
- **19:45** Lema nuevo en todo el mockup y en el sistema de diseño: "Pide un deseo. Del pastel nos encargamos."
- **19:52** Inicio de sesión y "Mi cuenta".
- **19:55** Revisión de UI/UX del acceso: vistas separadas de "Inicia sesión" y "Crea tu cuenta", con acceso por correo además de Google.
- **19:57** Pastel de betún en las vistas de acceso, para no perder la presencia de la marca.
- **23:35 a 23:59** Cambio de paleta: se descarta el jamaica porque se leía como color de partido político. Se prueban Menta y merengue y Zarzamora, y se elige **Durazno**, aplicado a todas las vistas.

### Martes 13 de octubre

- **00:00** Revisión de las vistas que quedaron pegadas al chocolate. Títulos nuevos: "Qué gusto verte de nuevo." y "Una cuenta para todos tus pedidos."
- **≈ 00:07 a 00:17** "Mi cuenta": revisión con impeccable; pestañas en escritorio y menú lateral en móvil; "Datos y avisos" en una sola vista; menú de la cuenta como tablero móvil propio; barra de estado y estado "Entregado" corregidos.
- **12:14** Primera vista de pago, con Stripe y Mercado Pago.
- **12:20** Pago rediseñado: Mercado Pago como botón, tarjetas alineadas, sin pastel en el encabezado.
- **12:28** Borde de duya sin uniones; ejemplos en todos los campos de formulario.
- **12:45** Carrito; la barra chocolate regresa al pago.
- **≈ 17:51 a 17:56** Dibujos de línea de repostería y barra de navegación flotante. Revisión de armonía: un solo ancla visual por campo y el borde de duya que tapaba tarjetas corregido.
- **Entre 18:12 y 23:14** Barra de navegación móvil de una fila con menú lateral, y las 14 vistas pendientes: entrega, confirmación, pago rechazado, ficha, vitrina, rebanadas, detalle del pedido, recuperar contraseña, verificar correo, bases, página no encontrada y estados vacíos.
- **23:16** Prueba del toldo en la portada.

### Miércoles 14 de octubre

- **11:03** Toldo en las 25 vistas, con la barra flotante separada de él.
- **11:08** "Lo más pedido" regresa a fondo mantequilla (el durazno claro se confundía con el encabezado, 1.4:1).
- **11:15** Prueba de la portada con pastel 3D. Después, el 3D en portada, catálogo, inicio de sesión y registro.

### Entre el 14 y el 23 de octubre

- Sin hora registrada: las seis vistas del pedido personalizado (elegir camino, cotizador, revisión, enviar referencia, solicitud enviada y cotización lista).

### Viernes 23 de octubre

- **≈ 11:08 a 11:16** Diseño del flujo del pedido: vista previa a la izquierda y formulario por tarjetas a la derecha, con pasos plegados como resumen y dos caminos (foto de referencia o diseño propio).
- **11:44** Pasos de tipo de pastel (tres leches, seco, envinado) y de pan con el Choco-pingüino; "pan" en lugar de "bizcocho" en todo el mockup.

### Lunes 26 de octubre

- **Tarde, antes de las 22:04** Choco-pingüino no disponible en envinado; relleno en dos niveles (base y sabor); Fresa con yogurt; sabores reales de cada base; paso de cobertura (crema pastelera, 11 colores).
- **22:07** Anticipación real en 36 vistas: pedidos con 2 días, vitrina el mismo día.
- **Entre 22:07 y 22:30** Paso de personas (1 kg para 7 personas, mínimo 4 kg, redondeo de .5 hacia arriba), Fresa con yogurt y Nuez como sabores normales, relleno combinado.
- **22:30** Paso 1 "Tamaño y forma": molde redondo y rectangular, hasta 5 pisos, con el 3D de cada forma.
- **23:07 a 23:09** Las 10 correcciones de la revisión antislop: enlaces sin destino, estados de carga y error, contenido inventado, teclado en el 3D, entre otras. Aparecen las vistas de conflicto, pisos, rectangular, vitrina agotada y legales.

### Miércoles 28 de octubre

- **17:42** Horarios de la pastelería y de entrega, kilos recomendados por número de pisos, Red velvet.
- **18:00** Catálogo y ficha con productos y precios reales.
- **18:03** Encargo de vitrina para el mismo día, con 2 horas de anticipación y si hay pan.
- **18:08** Productos reales en vitrina, rebanadas y portada; solicitudes de cotización en "Mis pedidos".
- **18:09** Libro de marca al día: estados, horarios y páginas legales.
- **18:59 a 19:04** Precios por kilo en el pedido y el pan dividido en dos grupos ("Para combinar con un relleno" y "Con relleno incluido").
- **≈ 22:19** Oblea de $125, hasta tamaño carta, en cualquier pastel; decoraciones fijas como opciones (patrón con duya, flores, chispas).

### Jueves 29 de octubre

- **≈ 13:26 a 13:29** Respuestas de la pastelería aplicadas: un piso puede pasar de 12 kg, los kilos por piso son recomendaciones, cota en línea de 50 kg (350 personas), sí hay entrega a domicilio. El editor de la tapa (mensaje y oblea) ya está en el lienzo.
- **≈ 13:37** Revisión de UI/UX del pedido: se propone el stepper horizontal.
- **16:13** **Stepper horizontal de 8 pasos** en los 18 tableros del pedido: una sola tarjeta por paso, siempre en el mismo lugar, "Tu pastel" a la izquierda con "Cambiar", y el antiguo paso 6 dividido en "Decoración" y "Mensaje y oblea".
- **16:14** Libro de marca actualizado con el stepper.
- **≈ 18:04 a 18:06** Anticipo del 50% también para la vitrina encargada; el depósito de la base se paga completo y aparte; tarifa de envío por distancia (propuesta); efectivo como **pedido apartado** que se cancela si no se paga ese día antes de las 22:30.
- **≈ 20:44 a 20:48** Calendario de entrega con los días no disponibles y su motivo; títulos corregidos (sin saltos de h1 a h3); región principal y enlace "Saltar al contenido" en todas las vistas; tamaño táctil en enlaces y deslizadores; **nota en PDF** tamaño carta; libro de marca al día; se crea **`reglas-de-negocio.md`**.
- **≈ 21:05 a 21:10** **Vista previa por etapas**: primero solo el pan, luego su color, el relleno al centro, la cobertura, la decoración, la tapa y el pastel completo con vela.
- **≈ 21:31** Fondo de la vista previa sin degradado: tarjeta clara con borde suave, dentro de la paleta.
- **≈ 22:11 a 22:20** Se quita "Pasteles para tu evento" de la portada; **página de verificación de la nota** (el QR abre el estado de la base); **esqueletos de carga** de catálogo, vitrina, ficha, cuenta y detalle del pedido.
- **22:24** Versión de cierre de la parte anterior de la conversación (mockup v1793334267, libro de marca v1793334299).

Durante el 26 y el 29 de octubre, sin hora registrada, también se hicieron: vocabulario unificado ("pedido", "base", "Diseña tu pastel"), el 3D fuera de títulos y botones, "Como en la pastelería" eliminado, textos sobreexplicativos recortados, opción elegida con fondo y borde de 2 px, ficha con tres caminos (vitrina hoy, encargar, personalizar) y sin ingredientes, y el borde de duya medido en el navegador.

#### Jueves 29 de octubre, noche (sesión actual)

- **23:02 a 23:05** **Vitrina sin bloque chocolate** (vitrina y vitrina agotada): productos sobre el fondo claro, sin el borde chocolate intermedio, filtros como chips, repisa en `relieve`, tarjetas de precio con borde, estado agotado en chocolate sobre claro. Regla agregada al libro de marca (23:05). La sección de vitrina de la portada se queda en chocolate por decisión del equipo.
- **23:12** **Familia de bordes de duya** probada en la portada: conchas bajo el encabezado, perlas en cambios fuertes de color, guirnalda antes del pie. Se corrige un desplazamiento del pie de 18 px causado por márgenes negativos que se colapsaban.
- **23:14 a 23:19** Familia aplicada a las 60 vistas con borde (51 conchas, 4 perlas, 60 guirnaldas; en vistas cortas la guirnalda es el único borde) y costura de 1 px corregida. Sección "La duya" reescrita en el libro de marca (23:19).
- **≈ 23:19 a 23:22** **Tableros cortados en el lienzo** corregidos: las vistas con listas de datos se medían con una sola tarjeta. Catálogo móvil de 4,629 a 13,063 px, catálogo de 3,553 a 6,230, portada móvil de 4,616 a 5,852, portada de 3,833 a 4,226, "Mis pedidos" móvil de 2,836 a 3,165, y los dos menús abiertos. Las cuatro filas de abajo bajan unos 4,000 px con sus títulos.
- **≈ 23:22 a 23:33** **Flama nueva del logo**: de la gota genérica a una flama con dos ondas de betún en el borde izquierdo, punta en S y núcleo inclinado (antes se descartaron versiones que parecían almendra, hoja o semilla). Aplicada en los cinco logos y el sello (23:29), el logo y el sello del mockup en 61 vistas, la vela de los pasteles 3D en 31 vistas y el dibujo de línea de la vela (23:33). Libro de marca actualizado (23:33).

### Entre el 29 de octubre (23:33) y el 31 de octubre (14:10)

- Sin cambios al mockup. Lista de pendientes y exploración de paletas alternativas (Zarzamora, Fresa con yogurt y Fiesta), con revisión de contraste.

### Sábado 31 de octubre

- **14:10** Reinstalación de ui-ux-pro-max e impeccable para fundamentar la paleta. Dos propuestas en OKLCH: Durazno afinado y Fresa y mermelada.
- **14:15 a 14:17** **Paleta Fresa y mermelada** aplicada a 124 archivos del mockup (8,115 colores reemplazados, cero textos con contraste insuficiente), logo y sello en los colores nuevos. Se detecta que la mermelada cae en la zona del guinda, restringida en `tokens.json`; el equipo decide conservarla.
- **14:21 a 14:27** **Etiquetas de estado rediseñadas** (28 etiquetas): perlas de avance para el pedido (Recibido, En preparación, Listo, Entregado), estados como texto en mermelada, datos de producto como texto pequeño, "Quedan [n]" junto al precio en rebanadas y portada. Ya no queda ninguna pastilla de color.
- **≈ 14:27 a 14:30** Sistema de diseño en Fresa y mermelada: tokens renombrados (`nata`, `fresa`, `fresa-claro`, `mermelada`, `mermelada-suave`, `mermelada-profunda`, `frambuesa`), nota de la restricción del guinda actualizada, sección de color reescrita, logos y dibujos de línea recoloreados.
- **14:34 a 14:36** **Esqueleto de la ficha rehecho** con su campo de fresa, borde de conchas y sección de detalles, como la ficha real. Los cinco marcos móviles de los esqueletos ahora muestran el esqueleto (antes cargaban la vista normal).
- **14:41 a 14:45** **Formularios en móvil**: sin sangría izquierda en el contenido desplegado de las opciones, relleno de 16 px en tarjetas anidadas, ejemplos de los campos más cortos. En 390 px, el campo de la calle pasa de 226 a 272 px. Aplicado en la entrega y los 18 pasos del pedido; regla en el libro de marca (14:45). La altura de 8,000 px que el equipo puso al catálogo móvil se conserva.
- **Entre 14:45 y 19:41** Documento para la pastelería con los datos del sitio y las preguntas pendientes.
- **≈ 19:41 a 19:42** Respuestas de la pastelería aplicadas: bases y tarifa de envío aprobadas, Choco-pingüino al mismo precio en seco y tres leches, y **el envío se cobra completo y aparte del 50%**. Fila de envío en entrega, pago, pago rechazado, procesando, confirmación, pedido apartado y detalle; se quita la fila contradictoria "Entrega: Sin costo"; notas del carrito y del pago actualizadas. `reglas-de-negocio.md` y el documento para la pastelería al día.
- **19:55** Inicio del kit para Claude Code: 119 capturas de todas las vistas.

### Domingo 1 de noviembre

- **11:34** **Kit para Claude Code** terminado (`ilusion-claude-code.zip`): `CLAUDE.md`, reglas por carpeta, prompt maestro, mapa de vistas, tokens en CSS y Tailwind, código de referencia, recursos, mockup y capturas, script de skills.
- **≈ 11:45** Esta bitácora.

### Pendientes al cierre

- Precio de las decoraciones fijas.
- Repartidor propio o aplicación.
- Vigencia de una cotización por referencia.
- Políticas de cambios y cancelaciones, y base dañada (texto base por preparar).
- Dirección, WhatsApp, aviso de privacidad y términos (texto base por preparar).
- Título "Para borrar" que quedó en el lienzo.

## Etapa 2: backend, base de datos y frontend base (1 al 7 de noviembre)

### Domingo 1 de noviembre: repositorio y documentación

- Repositorio git inicializado para publicarse como público en GitHub (Yordi-JA/pasteleria-ilusion): https://github.com/Yordi-JA/pasteleria-ilusion. El `.gitignore` excluye secretos y datos de clientes y se reforzó en la revisión de seguridad.
- Esqueleto de `backend/core_pasteleria` (capas `api`, `services` y `repositories`) y de `frontend/src` en MVVM (`models`, `viewmodels`, `views`, `components`, `three`), con `frontend/e2e` para las pruebas.
- `AGENTS.md` como fuente única de instrucciones para agentes, en la raíz, `backend/` y `frontend/`; cada carpeta tiene un `CLAUDE.md` que lo importa.
- Documentación del proyecto en `docs/proyecto/`: objetivos, arquitectura, plan de trabajo, tecnologías, pruebas, decisiones y referencias.
- `CONTEXTO_INICIAL.md` y `PROMPT_MAESTRO.md` se absorben en `AGENTS.md` y `docs/proyecto/` y salen del árbol de trabajo; quedan en el primer commit del repositorio.
- Revisión de calidad y de seguridad del entregable.
- Licencias OFL de Fraunces e Instrument Sans guardadas en `assets/fuentes/`; ninguna declara un Reserved Font Name.
- Decisiones D13 a D18 registradas en [`proyecto/decisiones.md`](proyecto/decisiones.md).
- Corrección D1: la paleta es "Fresa y mermelada"; "Noche y Caramelo" y `design.md` no existen.
- Corrección D2: el mockup es diseño en prototipos HTML, no código React; el frontend arranca en la Etapa 2.
- Plan actualizado con el frontend en paralelo al backend.
- La carpeta `diseno/` se renombra a `design/` y se corrigen sus rutas en la documentación (D21).
- El 3D se presenta como complemento en el README, los objetivos, `AGENTS.md` y el libro de marca; el objetivo 3 se reformula como diseño de pedidos a medida con precio exacto (D22).
- Calendario del plan real ajustado para tener los entregables listos el 23 de noviembre, con exposición el 24 o el 26 y entrega el 26 (D23). Las etapas 3 a 5 pasan a 8 al 13, 14 al 19 y 20 al 23 de noviembre; el baseline no cambia. Se agrega la tabla "Ejecución real" a `plan-de-trabajo.md`.

### Lunes 2 de noviembre: inicialización de backend y frontend

- Decisiones D24 a D28 registradas en [`proyecto/decisiones.md`](proyecto/decisiones.md): versiones del backend y del frontend, despliegue en Heroku como un solo servicio, modelo de usuario con correo y seguridad de la sesión y de las credenciales. D24 y D25 reemplazan a D12. Salen de las decisiones abiertas Tailwind, versiones, herramienta de compilación y PaaS.
- Node 22 LTS instalado con nvm en la máquina de desarrollo; el Node del sistema era 18.
- Backend: proyecto Django 5.2 LTS (paquete `config/`) con PostgreSQL 18 en Docker, DRF, SimpleJWT con lista negra, CORS, Swagger en `/api/v1/docs/` solo para el personal y servido desde el propio sitio, contraseñas con Argon2 y el modelo de usuario con correo (hoy `User`, D29) en su primera migración. 79 pruebas con pytest contra PostgreSQL al cierre de la auditoría.
- Frontend: Vite, React y TypeScript con Node 22, Tailwind v3 con el preset, fuentes de `assets/fuentes/`, React Router con la raíz provisional y la página no encontrada (textos del mockup), oxlint y dos pruebas E2E con Playwright.
- Revisión de código y auditoría de seguridad, tres rondas. Se corrigieron Swagger desde un CDN sin versión fija, tokens vigentes tras un cambio de contraseña, una escalada a superusuario en el admin y la unicidad del correo sin distinguir mayúsculas, entre otros.
- Comandos documentados en `AGENTS.md`, `backend/AGENTS.md`, `frontend/AGENTS.md` y la sección "Cómo correrlo" del README; versiones en [`proyecto/tecnologias.md`](proyecto/tecnologias.md).
- Decisiones D29 a D31 registradas en [`proyecto/decisiones.md`](proyecto/decisiones.md): identificadores del dominio en inglés (D29, reemplaza a D7; `Cotizaciones3D` pasa a `CakeDesign`), los pedidos de "Diseña tu pastel" no descuentan el pan del inventario (D30) y tamaño máximo de las subidas de 5 MB al inicio, editable en el admin (D31). Pregunta abierta para la pastelería: a qué estado sale `awaiting_quote` (antes `en_pausa_por_cotizacion`) cuando da el precio; queda en [`reglas-de-negocio.md`](reglas-de-negocio.md), sección 14.
- Código y documentos renombrados al inglés con un glosario único (D29). En la sección 12 de las reglas se explicitó cómo pasa un pedido a `received` (webhook verificado o cobro en efectivo registrado por el personal), tomado de D18 y `backend/AGENTS.md`, sin cambiar ninguna regla.
- Por la tarde: esquema del catálogo, el inventario y la configuración editable aprobado (D32; se corrige la regla 4.7). Despliegue en Heroku preparado en código y probado en local con gunicorn (D33), con django-axes adelantado para el inicio de sesión (D34). Quedan como decisiones abiertas dónde guardar las fotos de los clientes en Heroku, la compresión de los assets y las preguntas del catálogo para la pastelería.
- Por la noche: los seis diagramas de `proyecto/arquitectura.md` pasan de Mermaid a dibujos a mano alzada en Excalidraw con la paleta Fresa y mermelada, con su fuente editable y su SVG en `proyecto/diagramas/` y un texto alternativo cada uno (D35). El Gantt del plan sigue en Mermaid, ahora con la paleta. Revisados con antislop: contraste AA en todas las combinaciones y un solo significado por estilo de flecha.

### Martes 3 de noviembre: catálogo, inventario y configuración editable

- Esquema aprobado en D32 implementado en `backend/core_pasteleria` en siete pasos, cada uno con sus pruebas y la suite completa en verde: las cuatro configuraciones de una sola fila, las opciones y precios de "Diseña tu pastel", `CakeStand` y `DeliveryFeeBand`, el catálogo (`Product`, `CatalogPrice`, `ProductOffering`), `Inventory` por día con descuento atómico y los proxies del admin, los repositorios con sus `dataclass` y su par en memoria, y el admin de PENDIENTE.
- Migraciones `0002` a `0010`: un par de esquema y semilla por paso. Las semillas usan `get_or_create` (no pisan lo que edite la pastelería), se pueden volver a correr y llegan a producción con el `migrate` del `release`. Los datos pendientes quedan vacíos: precios de decoraciones fijas, política de base dañada, fotos, conservación y transporte, pan de cada pastel y peso del Red velvet.
- `django.contrib.postgres` y `UPLOAD_HARD_LIMIT_MB = 10` agregados a la configuración.
- Revisión de código y auditoría de seguridad del esquema, con correcciones en el mismo día: bloqueo optimista en el inventario del admin (la pastelería no pisa un descuento que no vio), tope duro de 3 imágenes por envío de referencia, unicidad de `FillingPrice` sin `nulls_distinct` (valía solo desde PostgreSQL 15), validación del nombre de archivo de las fotos, guardia de lectura para que Red velvet no aparezca en la vitrina y semillas que no vuelven a poner lo que la pastelería quitó. Las pruebas transaccionales vuelven a sembrar al terminar, así que no dependen del orden.
- Pruebas de backend: de 150 a 498.
- Frontend, en la rama `feat/componentes-base` (PR aparte): componentes base `Button`, `TextField`, `Card`, `ChoiceOption` y `Notice`, con íconos de Phosphor (2.1.10), y la página `/muestra`, que solo existe en desarrollo (D36). El libro de marca documenta el botón secundario y el aviso de información, y se corrigió la contradicción sobre el chip elegido. Pruebas E2E: de 2 a 15. Revisión de código en dos rondas.
- Pendiente de la pastelería (sin cambios): las preguntas de [`proyecto/esquema-catalogo.md`](proyecto/esquema-catalogo.md). Siguen los servicios (precio, depósito, envío, capacidad de horarios) y los endpoints.

### Miércoles 4 de noviembre: primer despliegue en Heroku y precio de "Diseña tu pastel"

- App `pasteleria-ilusion` en la región `us`, stack `heroku-24`, con los buildpacks `heroku/nodejs` y `heroku/python`, Heroku Postgres `essential-0` (versión 18.4) y un dyno `web` Basic (D38). El dominio es https://pasteleria-ilusion-0994ca356cbc.herokuapp.com/, con sufijo al azar. Variables: `SECRET_KEY`, `ALLOWED_HOSTS`, `NUM_PROXIES=1` y `DATABASE_URL`.
- Release v5 con el commit `4425df7`. La fase `release` aplicó todas las migraciones, incluidas `core_pasteleria` 0002 a 0010 con sus semillas. Gunicorn arrancó con 2 workers y los logs no muestran errores. El equipo creó el superusuario con `heroku run`.
- Verificación con `curl` contra el sitio: las rutas del sitio dan 200 con `X-Frame-Options: DENY` y `Cache-Control: no-cache`; el archivo de `/assets/` da 200 con caché inmutable; `/static/admin/css/base.css` da 200; `/api/v1/docs/` da 401; las rutas inexistentes de la API dan 404 JSON; `/media/x.jpg` y `/robots.txt` dan 404; `http://` redirige con 301 a `https://` y HSTS está presente.
- No verificado: el bloqueo de django-axes en producción (5 fallos, 429 con `Retry-After`), porque bloquearía una hora la IP del equipo. Queda para después, desde otra red, junto con comprobar que el router de Heroku agrega un solo salto a `X-Forwarded-For`.
- Correcciones a la guía de `backend/AGENTS.md` al seguirla (Heroku CLI 11.12.1, Windows con Git Bash): `addons:create` lleva las opciones del add-on después de `--`; en Windows el comando es `python`, no `python3`; `ALLOWED_HOSTS` sale de `heroku info`; `git push heroku main` pide credenciales de `git.heroku.com` (correo de Heroku y salida de `heroku auth:token`) y se corre desde la raíz. La guía ahora fija el dyno con `heroku ps:type web=basic`, explica `heroku git:remote` para otros clones y corrige el motivo de no usar los ganchos de compilación: el buildpack clásico ya corre `collectstatic` y el nuevo (CNB) no tiene esos ganchos.
- Pendiente: decidir el dominio propio antes de la Etapa 3.
- Precio y depósito de "Diseña tu pastel" (D39), en la rama `feat/precio-y-deposito`, sin desplegar. `services/pricing_service.py` calcula el precio con estrategias (Strategy) para el pan, el relleno y la decoración; `services/warranty_service.py` da el depósito de la base por kilos; `services/cake_options_service.py` arma las opciones con su disponibilidad y su motivo con las mismas estrategias, así lo que la interfaz desactiva es lo que el servidor rechaza.
- Dos endpoints públicos, sin sesión, sin guardar nada y con el throttle de anónimos: `GET /api/v1/cake-designs/options/` y `POST /api/v1/cake-designs/price/`. El precio devuelve el desglose y el depósito de la base aparte del total, ignora los montos del cliente y junta todos los errores en un solo 400 por campo. La API acepta solo JSON de hasta 16 KB (413 si lo pasa, 415 si no es JSON).
- Una decoración fija sin precio (PENDIENTE) sale desactivada con "Precio por confirmar" y el precio la rechaza. El "Desde $X por kg" del pan usa el relleno más barato del tipo. Un sabor no puede costar menos que el precio general de su base. Las bases no se borran en el admin, solo se desactivan, y `max_online_kg` no pasa de la base activa más grande.
- `@audit_operation` quedó en `services/audit.py`, con INFO para los rechazos previstos y ERROR para lo inesperado, y `LOGGING` manda los registros a la salida estándar de Heroku.
- Pruebas de backend: de 498 a 687 recolectadas.
- Verificación en local: 686 pruebas de pytest pasan y 1 se salta (`tests/test_spa.py:126`, sin build del frontend); `check`, `makemigrations --check --dry-run` y `spectacular --validate --fail-on-warn` salen limpios. Pasó revisión de calidad y auditoría de seguridad, con dos rondas de corrección.
