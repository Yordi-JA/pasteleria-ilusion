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

### Miércoles 4 de noviembre: primer despliegue en Heroku, dominio propio y precio de "Diseña tu pastel"

- App `pasteleria-ilusion` en la región `us`, stack `heroku-24`, con los buildpacks `heroku/nodejs` y `heroku/python`, Heroku Postgres `essential-0` (versión 18.4) y un dyno `web` Basic (D38). El dominio es https://pasteleria-ilusion-0994ca356cbc.herokuapp.com/, con sufijo al azar. Variables: `SECRET_KEY`, `ALLOWED_HOSTS`, `NUM_PROXIES=1` y `DATABASE_URL`.
- Release v5 con el commit `4425df7`. La fase `release` aplicó todas las migraciones, incluidas `core_pasteleria` 0002 a 0010 con sus semillas. Gunicorn arrancó con 2 workers y los logs no muestran errores. El equipo creó el superusuario con `heroku run`.
- Verificación con `curl` contra el sitio: las rutas del sitio dan 200 con `X-Frame-Options: DENY` y `Cache-Control: no-cache`; el archivo de `/assets/` da 200 con caché inmutable; `/static/admin/css/base.css` da 200; `/api/v1/docs/` da 401; las rutas inexistentes de la API dan 404 JSON; `/media/x.jpg` y `/robots.txt` dan 404; `http://` redirige con 301 a `https://` y HSTS está presente.
- No verificado: el bloqueo de django-axes en producción (5 fallos, 429 con `Retry-After`), porque bloquearía una hora la IP del equipo. Queda para después, desde otra red, junto con comprobar que el router de Heroku agrega un solo salto a `X-Forwarded-For`.
- Correcciones a la guía de `backend/AGENTS.md` al seguirla (Heroku CLI 11.12.1, Windows con Git Bash): `addons:create` lleva las opciones del add-on después de `--`; en Windows el comando es `python`, no `python3`; `ALLOWED_HOSTS` sale de `heroku info`; `git push heroku main` pide credenciales de `git.heroku.com` (correo de Heroku y salida de `heroku auth:token`) y se corre desde la raíz. La guía ahora fija el dyno con `heroku ps:type web=basic`, explica `heroku git:remote` para otros clones y corrige el motivo de no usar los ganchos de compilación: el buildpack clásico ya corre `collectstatic` y el nuevo (CNB) no tiene esos ganchos.
- Precio y depósito de "Diseña tu pastel" (D39), en la rama `feat/precio-y-deposito`, sin desplegar. `services/pricing_service.py` calcula el precio con estrategias (Strategy) para el pan, el relleno y la decoración; `services/warranty_service.py` da el depósito de la base por kilos; `services/cake_options_service.py` arma las opciones con su disponibilidad y su motivo con las mismas estrategias, así lo que la interfaz desactiva es lo que el servidor rechaza.
- Dos endpoints públicos, sin sesión, sin guardar nada y con el throttle de anónimos: `GET /api/v1/cake-designs/options/` y `POST /api/v1/cake-designs/price/`. El precio devuelve el desglose y el depósito de la base aparte del total, ignora los montos del cliente y junta todos los errores en un solo 400 por campo. La API acepta solo JSON de hasta 16 KB (413 si lo pasa, 415 si no es JSON).
- Una decoración fija sin precio (PENDIENTE) sale desactivada con "Precio por confirmar" y el precio la rechaza. El "Desde $X por kg" del pan usa el relleno más barato del tipo. Un sabor no puede costar menos que el precio general de su base. Las bases no se borran en el admin, solo se desactivan, y `max_online_kg` no pasa de la base activa más grande.
- `@audit_operation` quedó en `services/audit.py`, con INFO para los rechazos previstos y ERROR para lo inesperado, y `LOGGING` manda los registros a la salida estándar de Heroku.
- Pruebas de backend: de 498 a 687 recolectadas.
- Verificación en local: 686 pruebas de pytest pasan y 1 se salta (`tests/test_spa.py:126`, sin build del frontend); `check`, `makemigrations --check --dry-run` y `spectacular --validate --fail-on-warn` salen limpios. Pasó revisión de calidad y auditoría de seguridad, con dos rondas de corrección.
- Dominio propio `pasteleriailusion.me` (D40), registrado en Namecheap con la oferta del GitHub Student Developer Pack: gratis el primer año, con renovación de pago. Se descartó `.com` porque el Pack solo regala el `.me`, y `pasteleriailusion.com.mx` ya lo tiene otra persona. Namecheap obligó a elegir GitHub Pages como opción gratuita; sus registros DNS se reemplazaron por los de Heroku y no se publicó nada ahí.
- En Heroku se agregaron `pasteleriailusion.me` y `www.pasteleriailusion.me` con `heroku domains:add`. En Namecheap, un `ALIAS` en `@` y un `CNAME` en `www` hacia los "DNS Target" de `heroku domains`. El registro `.me` tardó unos 28 minutos en publicar el dominio; mientras tanto el certificado automático quedó en "Failed" y dejó de reintentar, y se resolvió con `heroku certs:auto:refresh`. Let's Encrypt emitió el certificado para los dos dominios (vence el 2 de febrero de 2027; Heroku lo renueva solo). `ALLOWED_HOSTS` lista ahora el host de `herokuapp.com` y los dos dominios.
- Verificado con `curl`: `https://pasteleriailusion.me/` y `https://www.pasteleriailusion.me/` dan 200 con certificado válido; `http://pasteleriailusion.me/catalogo` da 301 a `https://`; `/api/v1/noexiste/` da 404 JSON y `/admin/login/` da 200.
- La dirección principal es `pasteleriailusion.me`, sin `www`. La redirección de `www` con 301 está preparada en código (`WwwRedirectMiddleware` y `CANONICAL_HOST=pasteleriailusion.me`, rama `feat/dominio-canonico`) y falta desplegarla. El host de `herokuapp.com` sigue sirviendo el sitio como respaldo. HSTS con subdominios queda apagado hasta el cierre del proyecto.
- Pruebas de backend con la redirección: de 687 a 716 recolectadas (715 pasan y 1 se salta). Pasó revisión de calidad y auditoría de seguridad, con una ronda de corrección.
- Plan de trabajo: estado actualizado al 4 de noviembre, sin cambiar fechas.

### Jueves 5 de noviembre: datos del negocio, marco del sitio y rutas

- Decisión D41 registrada en [`proyecto/decisiones.md`](proyecto/decisiones.md), fusionada en `main` con el PR #15. `StoreSettings` gana `address` y `whatsapp`, vacíos en la semilla y con PENDIENTE en su `help_text` (migración `0011_store_contact`). Se editan en el admin, en la sección "Datos del negocio (pie del sitio)".
- El WhatsApp va en E.164 sin "+", de 8 a 15 dígitos y sin 0 inicial, para usarlo tal cual en `https://wa.me/<número>`. Se valida en el modelo y con la restricción `storesettings_whatsapp_digits`; no se normaliza el "+" ni los espacios. La dirección rechaza caracteres de control, de formato y separadores de línea, sin restricción en la base.
- `GET /api/v1/store/info/`: público, de solo lectura y sin sesión, con la dirección, el WhatsApp, el horario y los días de anticipación de un pedido. `address` y `whatsapp` salen `null` mientras sigan PENDIENTE. Si falta la fila de configuración responde 500, como los demás endpoints que la leen. Capas: vista, `services/store_info_service.py` y `settings_repo`.
- Throttle propio (`store_info`, 120/min) para que el pie, que se pide en cada carga, no gaste el cupo de anónimos que comparte la calculadora de precio.
- Pruebas de backend con los datos del negocio: de 716 a 801 recolectadas (800 pasan y 1 se salta).
- Dirección y WhatsApp de la pastelería: siguen PENDIENTE ([`reglas-de-negocio.md`](reglas-de-negocio.md), sección 13).
- En la máquina Windows de desarrollo se instaló Node 22 con fnm, sin tocar el Node 24 del sistema.
- Frontend, en la rama `feat/marco-del-sitio` (D42): marco común en `src/views/SiteLayout.tsx` con enlace "Saltar al contenido", franja `mermelada` con los días de anticipación y el WhatsApp, toldo de CSS con rayas `betun` y `fresa-claro` y festones, barra superior fija con `aria-current`, guirnalda de duya y pie. El menú móvil es un `<dialog>` por debajo de 768 px: el mockup cortaba en 600 px, pero entre 601 y 767 los enlaces se partían en dos líneas. La barra es fija porque lo pide el libro de marca, aunque el mockup no la muestra.
- Componente `Duya` con concha, perlas y guirnalda, sin márgenes negativos; la prop `below` pinta el campo de abajo.
- Las 26 rutas del mapa de vistas, cada una con una vista vacía, su `h1` y su `document.title`. Cuando el `h1` del mockup es un dato lleva un marcador `[… por confirmar]`. Los legales son una sola página, `/legal`, con las anclas `#privacidad` y `#terminos`: el mapa decía `/legal/:documento`, y ganó el libro de marca. `useRouteFocus` enfoca `<main>` al navegar y lleva al ancla cuando hay hash.
- Primer cliente HTTP, `src/models/apiClient.ts`, con `apiPath` para que `:slug`, `:id` o `:token` no puedan desviar la petición. `storeInfo.ts` y `useStoreInfo.ts` leen los datos del negocio (D41) con caché de éxitos, corte de 10 s y reintento como máximo cada 60 s. Sin dirección, horario, días de anticipación o WhatsApp, el marco muestra el marcador de pendiente.
- `vite.config.ts`: `server.fs.allow` incluye `../assets/logos`.
- Pruebas E2E: de 15 a 83, con la API simulada en `e2e/support/store-info.ts`, así que no necesitan Django. La suite necesita el servidor de desarrollo. Typecheck, lint y build salen limpios.
- Contradicción del libro de marca: "Presencia de marca" pide el símbolo en el pie, en la confirmación del pedido y junto al depósito de bases, pero también dice "uno por pantalla". Queda como decisión abierta (D42) para resolverla al construir esas vistas.
- Pendiente: perlas de avance, componente de esqueleto, contador del carrito, estado de sesión, contenido real de las vistas, 3D y textos legales.

### Viernes 6 de noviembre: perlas de avance y esqueleto de carga

- Decisión D43 registrada en [`proyecto/decisiones.md`](proyecto/decisiones.md). Rama `feat/perlas-y-esqueleto`.
- Componentes nuevos: `ProgressPearls` (`steps` y `current`, con `current` limitado al rango; perlas `aria-hidden` y texto "Paso n de m:" para el lector de pantalla), `Skeleton` (brillo de 1.4 s que se mueve con `transform` en un `::after` y no se muestra con `prefers-reduced-motion`) y `LoadingRegion` (envoltorio con un `role="status"` hermano del contenedor `aria-busy`). `StoreSkeleton` ahora usa `Skeleton`. El keyframe vive en `frontend/tailwind.config.cjs`; `design/tailwind.preset.js` no cambia.
- Decisión 1: la perla vacía lleva borde `mermelada-suave` en lugar de `relieve`. `relieve` daba 1.39:1 contra `betun` y 1.33:1 contra `nata`, por debajo del 3:1 de WCAG 2.1 1.4.11. El libro de marca se actualiza.
- Decisión 2: sobre el fondo `mermelada` (franja y pie) el esqueleto es liso en `mermelada-suave`, sin brillo ni pulso. Antes pulsaba con `animate-pulse` (D42). El libro de marca anota la excepción al "sin brillos" solo para el esqueleto de carga.
- Desviación de `design/referencia/esqueleto.css`: ahí el `role="status"` va dentro del elemento `aria-busy` y se monta con el texto. Una live region montada con su texto no se anuncia de forma fiable, y algunos lectores ignoran los cambios dentro de un `aria-busy`. `LoadingRegion` queda siempre montada y con el texto vacío al terminar.
- El marco (franja, menú, pie) no usa `role="status"`, para no anunciar en cada página. Qué estado del pedido va con qué perla se decide al construir "Mis pedidos" (Etapa 4).
- Pruebas E2E: de 83 a 91. Typecheck, lint y build salen limpios. `/muestra` revisada en el navegador a 1440 y 390 px, sin desbordamiento horizontal, con foco visible y el cambio de cargando a cargado con teclado.
- PR #17 fusionado en `main` (`2f68b62`) y desplegado en Heroku. Verificado con `curl` contra https://pasteleriailusion.me: las rutas del sitio dan 200; `store/info` y `cake-designs/options` dan 200 con JSON; una ruta inexistente de la API da 404 JSON; `/api/v1/docs/` da 401; `/admin/login/` da 200; `https://www.` y `http://` redirigen con 301 a `https://pasteleriailusion.me`, así que la redirección de `www` de D40 ya está desplegada; HSTS, `X-Frame-Options: DENY` y `Cache-Control: no-cache` presentes. El CSS publicado trae el brillo con `transform`. En el navegador, la franja dice "Pedidos con 2 días de anticipación", el pie muestra "[Dirección por confirmar]" y `/muestra` da la página no encontrada.
- `pytest` no se volvió a correr el 6 de noviembre porque Docker Desktop estaba apagado. El backend no cambió desde el PR #15 (800 pasan y 1 se salta).
- `/favicon.ico` da 404 en producción, como `/robots.txt`. Se resuelve con la portada.
- Cierre de la Etapa 2 el 6 de noviembre, un día antes del plan real, con el visto bueno del equipo. La tabla "Ejecución real" de [`proyecto/plan-de-trabajo.md`](proyecto/plan-de-trabajo.md) lo registra. Orden de la Etapa 3: portada, "Diseña tu pastel" con el 3D, catálogo, ficha, vitrina y rebanadas con sus endpoints, y acceso con Google y correo. El mínimo para la exposición se define al iniciarla, el 8 de noviembre.
- Pendientes que pasan a las siguientes etapas: probar django-axes y `X-Forwarded-For` en producción desde otra red, probar `LoadingRegion` con NVDA o VoiceOver, el símbolo del pie contra "uno por pantalla", la API de distancias (antes de la Etapa 4) y los datos PENDIENTE de la pastelería.

### Viernes 6 de noviembre (tarde): inicio de la Etapa 3 y API del catálogo

- Decisión D44 registrada en [`proyecto/decisiones.md`](proyecto/decisiones.md): el mínimo para la exposición del 13 de noviembre y el orden de la Etapa 3. Lo obligatorio es el catálogo conectado a la API (portada, catálogo, ficha, vitrina y rebanadas), "Diseña tu pastel" con sus 8 pasos, el precio del backend y la vista previa 3D, y el acceso con correo. Google, la recuperación de contraseña y la verificación del correo entran solo si sobra tiempo. Cierra la decisión abierta "Mínimo para la exposición".
- Decisión D45 y rama `feat/api-catalogo`, sin desplegar. Cinco endpoints públicos de solo lectura: `GET /api/v1/products/` (con `category` y `search`), `products/<slug>/`, `featured-products/`, `showcase/` y `slices/`. Capas: vistas, `services/catalog_service.py` y `product_repo`.
- "Hoy" es la fecha local de la pastelería (`timezone.localdate()`, Ciudad de México): a las 21:30 ya es el día siguiente en UTC. La vitrina y las rebanadas traen esa fecha y separan lo agotado (`stock` 0, `sold_out: true`) de lo que no se cargó hoy, que no sale. El dinero va como texto (`"350.00"`) y la foto, la conservación y el transporte vacíos salen `null` (PENDIENTE).
- Throttle propio, scope `catalog` a 360/min, compartido por los cinco endpoints: la portada pide tres por cada carga del pie (120/min). No gasta el cupo de la calculadora de precio ni el del pie. Sin paginar: son 22 productos y la pantalla los muestra todos.
- "Pasteles de la casa": `Product.featured_on_home` ("destacado en la portada", migración `0012_product_featured_on_home`), editable desde la lista de productos del admin. La semilla no marca ninguno. Salen hasta 4 de los marcados en su orden; sin ninguno marcado, los primeros 4 pasteles del catálogo. La regla quedó en la sección 2 de [`reglas-de-negocio.md`](reglas-de-negocio.md).
- `product_repo` gana `list_featured` y `list_related` acepta la fecha, para que los relacionados de la ficha también digan "En vitrina hoy". Su par en memoria hace lo mismo y una prueba compara los dos.
- Revisión de calidad y auditoría de seguridad sin bloqueos, con una ronda de corrección:
    - La búsqueda no distingue acentos: "pinguino" encuentra "Choco-pingüino" y "limon" lo que diga "limón". Usa la extensión `unaccent` de PostgreSQL (migración `0013_unaccent_extension`, un `CREATE EXTENSION IF NOT EXISTS` que no toca tablas) en la columna y en el término; el repositorio en memoria hace lo mismo.
    - `is_active` dejó de editarse desde la lista de productos del admin: una lista cargada antes de desactivar un producto lo volvía a publicar al guardarla. Se activa o desactiva en el formulario del producto. El admin avisa si hay más de 4 productos activos destacados.
    - Si un pan, una base o un sabor está desactivado, la ficha no lo preelige para "Personalizar este pastel" (`null`). Un producto inactivo no da relacionados, y `list_related` exige `limit`.
- Pruebas de backend: de 801 a 928 recolectadas, todas pasan en local (el test de la SPA que se saltaba ya no se salta porque hay un build del frontend). `check`, `makemigrations --check --dry-run` y `spectacular --validate --fail-on-warn` salen limpios.
- Contradicciones del mockup: la portada pone un postre (Imposible) entre los "Pasteles de la casa", así que el campo admite postres; el respaldo, por decisión del usuario, toma solo pasteles. La vitrina del mockup dice "Pastel mini de cajeta", un nombre que no existe en el catálogo: la API da el producto y la presentación, y la etiqueta la arma el frontend.

### Viernes 6 de noviembre (tarde): carrito mínimo

- Decisión D46 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/carrito-minimo`: carrito en `localStorage` (`ilusion.cart.v1`, líneas con `kind: 'offering'` y el código de presentación de la API, validación defensiva con límites técnicos y en memoria si el navegador bloquea el almacenamiento), compartido desde `SiteLayout` con `CartContext`; cada cambio parte de lo guardado y las pestañas se sincronizan con `storage`. El contador del encabezado sigue el tablero Carrito del mockup ("Carrito, 4 productos"; "Carrito, vacío") y "Agregar al pedido" produce el aviso "Agregado al pedido" en una región `role="status"` siempre montada. `maxQuantity` respeta lo que queda hoy y, si el carrito ya tiene más, el aviso pide revisarlo sin recortar; las reglas no fijan un tope general y no se inventó. Pruebas E2E: de 91 a 122. La pantalla del carrito, las existencias, la entrega y el pago siguen en la Etapa 4.

### Viernes 6 de noviembre (noche): portada

- Decisión D47 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/portada`: la portada conectada a la API, sin desplegar. Hero en `fresa` con el logotipo como `h1`, el lema, "Realizar pedido" y "Ver la vitrina". "Pasteles de la casa" (uno grande y tres en lista), la vitrina en `mermelada` con los chips Todo, Pasteles y Postres y hasta 8 partidas, y "Rebanadas de hoy" con la fecha de la pastelería ("Viernes 6 de noviembre"). Las tres secciones cargan por separado, cada una con su esqueleto, su error con "Volver a intentar" y su aviso de "Agregar al pedido".
- Una sección sin nada cargado hoy no aparece y se lleva sus bordes de duya (decisión del usuario). La vitrina agotada muestra el texto de `VitrinaAgotada`. Las pruebas revisan el orden de los campos de color en cada combinación: nunca quedan dos campos oscuros juntos.
- El pastel del hero es provisional (`HeroCake`, el dibujo de pisos de la marca con su sombra), con la altura de la escena del mockup, para que el pastel 3D de `feat/pastel-3d` lo reemplace sin mover nada.
- Modelos nuevos en el frontend: `catalog.ts` (tipos del contrato, validación defensiva y adaptadores al carrito), `money.ts` ("$350", "$1,250"), `dates.ts` y `offeringLabel` ("Mini de tres leches de durazno"). Componentes nuevos: `ButtonLink`, `TextLink`, `ProductPhoto`, `HeroCake`, `LoadErrorNotice` y el chip `onColor` de `ChoiceOption`. El view-model es `useHome.ts`, con un hook por sección sobre `useRemoteData`.
- Pendientes del carrito de D46: las líneas de una versión más nueva se conservan al escribir, `sync` no pisa la memoria si el almacenamiento falló, y los topes técnicos dan el aviso "No se pudo agregar" en lugar de un error.
- `/robots.txt`, `/favicon.ico`, `/favicon.svg` y `/apple-touch-icon.png` salen de `frontend/public/` y WhiteNoise los sirve desde el build; `index.html` lleva la descripción de la página.
- Pruebas E2E: de 122 a 173. Pruebas de backend: de 928 a 934 (las de los archivos de la raíz del build en `tests/test_spa.py`). Typecheck, lint y build salen limpios, y el build no trae los nombres de las variables de prueba.
- Revisión en el navegador con el backend local y existencias de hoy cargadas en la base de desarrollo (10 presentaciones de vitrina y 5 rebanadas, una agotada en cada una), a 1440 y 390 px contra `001-Main.jpg` y `002-Movil.jpg`. Diferencias que se dejaron a propósito: títulos de sección en 40 px y no 56, "Ver la vitrina" como botón secundario, las rebanadas en `nata` con tarjetas `betun`, el ícono del carrito sin el "+", el hueco de la vitrina dice "Foto del pastel" o "Foto del postre" según la categoría y la vitrina pone lo agotado al final. En móvil, los nombres de la vitrina bajan a 16 px para que "zarzamora" no se parta.
- Ronda de correcciones después de la revisión de código, con decisiones del usuario: el símbolo del pie es parte del marco y no cuenta para "uno por pantalla", y los títulos de sección quedan en 40 px (se cierran las dos decisiones abiertas); la vitrina dice "Agotada por hoy", como las reglas de negocio; las rebanadas se limitan a 4 en la portada, primero las que quedan, con "Ver todas las rebanadas"; y el carrito separa los encargos de la vitrina de hoy (`fulfillment`), una regla nueva en la sección 2 de [`reglas-de-negocio.md`](reglas-de-negocio.md). De la revisión: una lista que llega con entradas y ninguna sirve es un error, las pruebas de los pisos comparan la secuencia completa de `main`, una sección que falló sigue visible si el reintento llega vacío (el foco queda en su título, ahora con anillo de foco), la fila de rebanadas en móvil es enfocable, una foto que no carga cae al hueco, las fechas se prueban en Kiritimati y Los Ángeles, y varios detalles de validación.

### Viernes 6 de noviembre (noche): pastel 3D de la portada

- Decisión D48 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/pastel-3d`: el pastel del hero ya es 3D con react-three-fiber, sin desplegar. Tres pisos (`betun`, `fresa-claro`, `betun`) con dos filas de perlas, base, vela con la flama de la marca y sombra de contacto; gira solo, se inclina hacia el puntero, se arrastra con inercia, gira con las flechas y separa los pisos con el scroll. La cámara mira desde 15° arriba.
- Dependencias fijas: `three` 0.187.0, `@react-three/fiber` 9.8.2 y `@types/three` 0.187.0, sin `@react-three/drei`. La escena va en su propio chunk (247.96 kB con gzip); el chunk principal pasa de 101.89 kB a 103.72 kB.
- El pastel fijo de D47 queda de respaldo mientras llega la escena, sin WebGL 2 y si se pierde el contexto. La caja no cambia (600, 460 y 380 px). La pista "Arrastra el pastel para girarlo." llega con la escena y se oculta en móvil, como en el mockup.
- `src/three/` ya existe: `CakeModel.tsx` (modelo paramétrico que reutilizará "Diseña tu pastel"), `CakeScene.tsx`, `spin.ts` y `palette.ts` (los colores salen de `design/tokens.json`). El view-model es `src/viewmodels/useHeroCake.ts`.
- Con "reducir movimiento" no hay giro solo, inclinación, separación ni titileo; el arrastre y las flechas siguen, sin inercia. La escena se pausa fuera de pantalla y con la pestaña oculta.
- Pruebas E2E: de 173 a 187 (`e2e/hero-cake.spec.ts`, y la prueba del hero de `home.spec.ts` ya espera la pista). Typecheck, lint y build salen limpios; el build avisa que el chunk de la escena pasa de 500 kB.
- Revisión en el navegador con la API simulada, a 1440 y 390 px contra `001-Main.jpg` y `002-Movil.jpg`: inicial, arrastrando, con foco, con los pisos separados y con "reducir movimiento". Se ajustaron la luz (los pisos `betun` se veían grises) y la escala, para igualar la captura.
- Ronda de correcciones del 7 de noviembre (revisión de código, revisión de animación y decisiones del usuario, D48):
    - Movimiento: un `pointercancel` termina sin inercia; el arrastre gira solo después de 4 px horizontales; la velocidad del dedo se mide en una ventana de 80 ms; el giro solo sigue el sentido del último arrastre (sin reversa tras un tirón a la izquierda); el frenado se integra de forma exacta; la flama titila con su propia fase, y solo el primer cuadro después de reanudar acota su intervalo.
    - Entrada de la escena en 250 ms (opacidad y escala de 0.97 a 1, curva `ease-entrada` nueva en `tailwind.config.cjs`) y salida del pastel fijo en 150 ms; nada con "reducir movimiento".
    - `touch-action: pan-y pinch-zoom`, para que el pellizco amplíe sobre el pastel. La escena se llama "Pastel de tres pisos" y la pista la describe (`aria-describedby`); con el foco del teclado, la pista visible dice "Usa las flechas izquierda y derecha para girarlo." (texto pendiente del visto bueno del usuario).
    - Tras perder el contexto, la escena se reintenta cuando la pestaña vuelve a verse; un chunk roto no se reintenta. Si la escena tenía el foco, pasa a "Ver la vitrina".
    - `CakeDesign` pasa a `CakeShape`, en `src/three/cakeShape.ts`, solo tipos. `data-running` solo en desarrollo; se quitó la prueba de la elevación de la cámara, que revisaba una constante. `rootMargin` de 72 px en el `IntersectionObserver`.
    - Decisiones del usuario: con "reducir movimiento", el arrastre y las flechas siguen sin inercia (anotado también en el libro de marca); la compresión del build va en el PR siguiente, `chore/compresion-assets`.
    - Playwright dibuja WebGL con SwiftShader (`--use-angle=swiftshader`, `--enable-unsafe-swiftshader`), y las pruebas del 3D usan `deviceScaleFactor: 1`. La prueba del hero de `home.spec.ts` ya no depende de WebGL.
    - Pruebas E2E: de 187 a 197 (`hero-cake.spec.ts` pasa de 14 a 18 y `spin-model.spec.ts` trae 6); con el tope de cuadros, 199. El chunk principal queda en 103.98 kB con gzip y el de la escena en 248.28 kB.
    - Capturas a 1440, 768 y 390 px: a 768 px, con los pisos separados, la vela queda debajo de la pista y de los botones.
    - Decisión del usuario: el giro solo dibuja unos 30 cuadros por segundo (`frameloop="demand"` con `invalidate()` cada 33 ms) y los gestos, la inercia, la inclinación y el scroll, a la tasa completa. Pruebas nuevas: el tope de cuadros del giro solo y `needsFullRate`; la suite pasa a 199.

### Sábado 7 de noviembre: "Diseña tu pastel", tanda 1

- Decisión D49 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/disena-tu-pastel`, sin desplegar: `/pedido/disena` con los pasos 1 a 5, la barra de 8 pasos (círculos en escritorio, "Paso N de 8" con segmentos en móvil), la vista previa por etapas, el total estimado, "Tu pastel" (tarjeta en escritorio, desplegable en móvil) y la barra inferior fija en móvil. El paso 6 es una tarjeta en construcción.
- Backend: `estimate` en `POST cake-designs/price/` (el "Desde" sin sabor) y `smaller_alternatives` en `GET cake-designs/options/` (pastel de vitrina y mini del catálogo). Pruebas de backend: de 934 a 943.
- Frontend: `models/cakeDesign.ts` y `models/cakeDesignDraft.ts`; `useCakeDesigner`, `useCakeDesignPrice`, `useCakeScene` (sale de `useHeroCake`) y la lógica pura de los pasos; `DesignerCake` y `SceneBoundary`; `ChoiceOption` acepta casillas y chips de dos líneas, y `PageHeader`, las migas de pan.
- Pruebas E2E: `e2e/cake-designer.spec.ts`, con 15 pruebas.
- Ronda de correcciones tras la revisión de código (D49):
    - Los kilos por personas (regla 3.1) pasan al backend: `pricing_service.size_for_people` y `kg_for_people`; la petición del precio manda `people` y la respuesta trae `size` (kilos redondeados, kilos del pedido, mínimo y máximo). El navegador ya no calcula kilos.
    - `estimate` sale de `CakeDesignChoice`: la vista elige `estimate_price` o `calculate_price`, y una elección normal sin sabor sigue siendo inválida.
    - Las opciones traen `unavailable_codes`, y las frases de conflicto se arman con el código.
    - Un precio que falla dice "Sin calcular" con su reintento, en escritorio y en la barra móvil; nunca queda el total viejo como vigente.
    - Fresa con yogurt elegida desactiva "Dos sabores" con su motivo; un sabor guardado que ya no existe no bloquea la lista; el paso 6 no se puede confirmar.
    - La lógica de "Continuar" (lo que falta, el texto del botón, la frase del conflicto y el cambio del borrador) pasa a `cakeDesignSteps.ts`, y el armado de la vista a `cakeDesignSummary.ts`.
    - Pruebas de backend: de 943 a 965. `e2e/cake-designer.spec.ts`: de 15 a 24 pruebas.
- Segunda ronda de correcciones (D49):
    - Los kilos se calculan antes que el precio y un 400 por la elección trae `size`: el paso 1 ya no se traba si el precio falla por la elección. "Continuar" (y Enter en las personas) espera los kilos pendientes en lugar de pedir una segunda pulsación; solo una falla de red deja el reintento.
    - El máximo en línea efectivo (`warranty_service.effective_cake_design_limits`) es el de las opciones, de los kilos por personas y de la revisión de kilos del precio; con kilos que ninguna base activa cubre, el precio dice el máximo efectivo.
    - `is_estimate` en el desglose y en la respuesta; `size_for_people` va auditado; `CakeSize` del precio pasa a `PeopleSize` y `kg_for_people` delega en `size_for_people`.
    - Pruebas de backend: de 965 a 971. `e2e/cake-designer.spec.ts`: de 24 a 27 pruebas.

### Sábado 7 de noviembre (tarde): pisos con mínimos y pastel con textura

- Decisión D50 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/disena-pisos-y-texturas`, subida a `main` (`1164011`) y a Heroku (release v15) el 8 de noviembre. La dueña corrigió la regla 3.3: los kilos por pisos son mínimos que bloquean. Los pisos que no caben se ven desactivados con "Desde 15 kg" y, si bajan las personas, los pisos bajan solos con el aviso "Con 10 kg el pastel va de 1 piso.". El backend valida `tiers` y `form` en el precio y `size` trae `max_tiers`; las opciones traen `tier_minimums`.
- Vista previa: miga en el pan (textura generada en un lienzo), choco-vainilla en dos colores (`Bread.preview_color_bottom`), rellenos con rebanadas de fruta, trozos de galleta o granillo (`FillingFlavor.preview_style` y `preview_color_secondary`, migraciones `0014` y `0015`), con queso o con flan con la crema abajo y el sabor arriba, y la cobertura sin perlas.
- Correcciones de la revisión: "Continuar" no corre dos veces, un cambio durante la espera no se pierde, un rechazo dice su motivo sin reintento y sin bases activas el mensaje dice que no hay pedidos en línea.
- Pruebas de backend: de 971 a 998. `e2e/cake-designer.spec.ts`: de 27 a 30 pruebas.

### Lunes 9 de noviembre: trozos de fruta y choco-vainilla por piso

- El domingo 8 de noviembre la dueña dio el visto bueno al aspecto de los pasos 3, 4 y 5 de "Diseña tu pastel" (D50), con los colores de los trozos incluidos, y pidió dos correcciones. Decisión D51 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/disena-fruta-y-choco-vainilla`, sin desplegar.
- Durazno y fresa llevan trozos de fruta picada con volumen (`FillingPreviewStyle.FRUIT_CHUNKS`, migración `0016`; la `0017` los pasa del estilo `fruit_slices` solo si siguen como los sembró la `0015`). El trozo es un cubo redondeado y brillante, hundido a medias en el relleno, en una malla instanciada con posiciones fijas por semilla.
- Choco-vainilla: en cada piso, todo el pan de abajo del relleno es vainilla y todo el de arriba, chocolate (antes cada bloque se partía en dos y el piso se veía con cuatro franjas). Los `help_text` de `Bread.preview_color` y `preview_color_bottom` dicen lo mismo.
- Pruebas: `tests/test_fruit_chunks_migration.py` (6) y `e2e/cake-design-preview.spec.ts` (9, la vista previa como datos).
- Ronda de revisión y auditoría de D50 (9 de noviembre), corregida en la misma rama: el pan de un color con matiz ya da un solo bloque por lado; `FillingPieces` no recalcula las instancias en cada respuesta de precio y pide el cuadro con `invalidate()`; el tope de instancias sube a 1 000; la miga (`crumb.ts`) se dibuja una vez y se queda, sin cuenta de usuarios, con la costura de los poros calzada; el aviso de pisos se borra al cambiar las personas; el admin valida el color de los trozos y el de arriba del pan de dos colores; `tiers` del precio acepta de 1 a 20. Ver D51.
- La revisión cerró ese mismo día tras dos rondas con el veredicto "se puede subir" del revisor y del auditor, más una corrección final: la validación del color de los trozos y del color de arriba pasó del modelo (`clean()`) a los formularios de cambio del admin (`BreadForm`, `FillingFlavorForm`), porque en el modelo reventaba (500) al reordenar o desactivar desde la lista una fila ya inconsistente. Se aclararon el docstring de la `0017` y el comentario de `SEED_MIGRATIONS`. Pruebas de backend: 1 018.
- Ajuste de los trozos de fruta tras verlos en capturas a 1440 px y 390 px (más grandes, más densos y con el tono sesgado a oscurecer). Chunk de la escena: de 940.23 kB a 940.75 kB (de 250.96 kB a 251.24 kB con gzip).
- Pruebas: backend de 998 a 1 016 (1 018 tras la corrección final); `e2e/cake-designer.spec.ts`, de 30 a 31, y `e2e/cake-design-preview.spec.ts`, 9 nuevas.

### Martes 10 de noviembre: moldes reales, encuadre, giro en dos ejes y rellenos nuevos

- La dueña revisó la vista previa de "Diseña tu pastel" (D50 y D51). Decisión D52 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/disena-moldes-y-rellenos`, sin desplegar.
- El tamaño del pastel sigue los kilos con los moldes de la pastelería: modelo `CakeMold` editable en el admin, sembrado en la migración `0019` y expuesto como `cake_molds` en `GET /api/v1/cake-designs/options/`. Todos los pisos miden lo mismo de alto, el rectangular toma su proporción de los moldes y con varios pisos cada uno es más chico que el de abajo.
- La cámara conserva la escala de un pastel grande de un piso, con el pastel centrado, y se aleja solo cuando no cabe. El arrastre gira en los dos ejes (la elevación va de -10° a 82°; en táctil, un gesto que empieza en vertical es el scroll) y las flechas de arriba y abajo cambian la elevación. La portada no cambia.
- Rellenos: capas delgadas de crema pastelera arriba y abajo del sabor, grumitos en la fresa con yogurt, trozos de nuez, más fruta y más galleta, y el relleno de Choco-pingüino (chispas redondas de chocolate) y de Red velvet (granillo rojo) se ve desde la elección del pan (`Bread.included_filling_preview_style`, migraciones `0020` y `0021`). Los colores nuevos esperan el visto bueno de la dueña (pendiente 14).
- Pruebas: backend de 1 018 a 1 043; E2E nuevas en `cake-design-preview.spec.ts`, `spin-model.spec.ts`, `cake-designer.spec.ts` y `hero-cake.spec.ts` (la portada no cambia).
- Chunk de la escena: de 940.75 kB (251.24 kB con gzip) a 947.04 kB (253.30 kB con gzip) y el principal, de 402.79 kB a 405.67 kB.

### Martes 10 de noviembre: decoración (paso 6 de "Diseña tu pastel")

- Decisión D53 en [`proyecto/decisiones.md`](proyecto/decisiones.md), misma rama, sin desplegar. El paso 6 ya existe: "Sin decoración", "Patrón con duya" con cuatro diseños (borde de conchas, rosetones, festones colgantes y olanes), flores, chispas y "Otra decoración".
- Backend: la migración de datos `0023_seed_decoration_designs` renombra `duya` como "Borde de conchas", agrega `rosetones`, `festones` y `olanes` sin precio y reordena, sin pisar lo que la pastelería haya editado. No hay cambios de API ni de esquema: el precio ya aceptaba `decoration`. Cada diseño sale PENDIENTE ("Precio por confirmar") hasta que la pastelería capture su precio.
- Color de la duya y de las rosas: "Automático" (tonos más oscuro y más claro de la cobertura, calculados en OKLab) o uno de los 11 colores de la cobertura. Las hojas van siempre en verde y las chispas no llevan selector.
- "Otra decoración": la imagen se elige y se revisa en el navegador (JPG, PNG o WebP, hasta 5 MB, propuesta por confirmar), con miniatura, "Quitar" y el aviso de pausa; no se sube, y tras recargar el paso pide elegirla otra vez.
- Vista previa: cada diseño se dibuja con mallas instanciadas sobre la cobertura de todos los pisos (las rosas, en una fila en el borde de arriba de cada piso) y cuenta contra el presupuesto de 150 000 triángulos.
- Pendientes nuevos en [`pendientes.md`](pendientes.md) (sección de D53): precios, límite de la imagen, almacenamiento y visto bueno de la dueña.

### Martes 10 de noviembre: precios de la decoración, tipos de chispas y grupos desplegables (D54)

- La dueña confirmó los precios: Rosas $120 y todo lo demás incluido (D54, regla 6.1). Migración `0025` (quita `decorationoption_single_included`, agrega `preview_flavor` y `preview_bread`) y migración de datos `0026_seed_decoration_prices`, que no pisa lo editado en el admin. En la base local, las seis filas con el precio de prueba de $1.00 se regresaron a vacío antes de migrar.
- Chispas: tres tipos (capuchino, chocolate y choco-vainilla) que copian el estilo y los colores del sabor o del pan de la pastelería; van solo en los costados, no en la cara de arriba. `GET /api/v1/cake-designs/options/` suma `preview_flavor` y `preview_bread` a cada decoración.
- Paso 6: "Patrón con duya" y "Chispas" son un radio más de la lista y sus diseños se despliegan solo al elegirlos.
- Rosas y rosetones (corrección de la revisión de D53): la fila de rosas y de rosetones en rectangular ya no se encima en las esquinas; en un escalón angosto la rosa se achica y queda dentro del escalón; `displayFileName` devuelve `null` si solo quedan U+200D.

### Miércoles 11 de noviembre: mensaje, oblea, anticipo configurable y perla al agregar (D55)

- Decisión D55 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/disena-mensaje-y-oblea`, sin desplegar: el paso 7 (mensaje con letra Dancing Script, color en tres modos y arco; oblea hoja o círculo con giro y encuadre) y el paso 8 (revisión con "Cambiar" por renglón), con las cotas de carta y de tapa revisadas también en el servidor (`services/design_layout.py`).
- Migración `0029`: `CakeDesignSettings.wafer_price` pasa a anulable (vacío es PENDIENTE) y `PolicySettings.advance_percent` (50 al inicio, de 1 a 100) calcula el anticipo en `services/payment_summary.py`. Con "Otra decoración", el pedido queda en pausa sin cobro.
- La vela se quitó de todo el sitio, incluido el pastel 3D de la portada. La flama sigue en el logo, el sello y el dibujo de línea.
- Al "Agregar al pedido", una perla de duya vuela al carrito en 550 ms (`CartFlightContext`, `CartPearls.tsx`); con "reducir movimiento" no vuela.
- Pruebas: 1 207 de pytest. E2E nuevas: `e2e/cake-designer-lid.spec.ts` y `e2e/add-to-cart-flight.spec.ts`. Antes de la perla, la suite completa con 2 workers dio 390 de 391; la que falló (`cake-designer.spec.ts:955`) pasó sola. Con la perla, 2 workers dieron 22 fallas por tiempo con WebGL por software, que pasan con 1 worker; la suite completa con 1 worker queda en la descripción del PR.
- Revisión en un teléfono real: los pendientes de animación y de rendimiento del 3D y de la decoración quedan resueltos. La lista de la Etapa 4 que dejó la auditoría de seguridad está en [`pendientes.md`](pendientes.md).

### Miércoles 11 de noviembre: compresión del build (D56)

- Decisión D56 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `chore/compresion-assets`, sin desplegar: `frontend/scripts/compress-dist.mjs` corre al final de `npm run build` y escribe variantes `.br` y `.gz` junto a cada archivo de `dist/` que pese 1 KiB o más. WhiteNoise las sirve según `Accept-Encoding`.
- Resultados: el chunk de la escena pasa de 940 757 bytes a 204 894 (brotli) y 248 290 (gzip); el principal, de 402 795 a 102 794 (brotli) y 120 197 (gzip); el CSS, de 34 590 a 6 566 (brotli) y 7 537 (gzip).
- Pruebas: 37 en `tests/test_spa.py`. La prueba que descomprime el build real falló a propósito con un `.br` corrupto, para comprobar que sí detecta el daño.
- Cierra la decisión abierta de la compresión, que sale de la tabla. Pendiente 12 resuelto.

### Miércoles 11 de noviembre: colores libres en "Diseña tu pastel" (D57)

- Decisión D57 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/disena-colores-libres`, sin desplegar: la cobertura, el color de la decoración con duya o rosas y el texto del mensaje se eligen con un selector libre (`frontend/src/components/ColorPicker.tsx`). La lista de 11 colores queda como nombres de referencia para el "parecido a" de la revisión y del carrito.
- Backend: migración `0030_coverage_color_reference_names`, que solo cambia nombres y `help_text` en el admin. API: `message_layout.color` acepta `custom` con `#RRGGBB`, y `list` da 400.
- Compatibilidad: los borradores con el `slug` de un color se migran a su código; las líneas viejas del carrito se descartan y sus imágenes se borran de IndexedDB.
- Pendientes nuevos en [`pendientes.md`](pendientes.md): la muestra en el carrito, quitar la compatibilidad, los grises claros que se nombran "parecido a blanco" y la sugerencia de dar de alta "Negro" y "Gris". La revalidación de la cobertura y la decoración en el servidor entra en la Etapa 4.
- Pruebas: `frontend/e2e/color-picker.spec.ts` (26 pruebas). La suite del diseñador y el carrito con 1 worker dio 230 de 230.

### Jueves 12 de noviembre: catálogo, ficha y "Personalizar este pastel" (D59)

- Decisión D59 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/catalogo`, sin desplegar. `/catalogo` y `/pasteles/:slug` dejan de ser vistas vacías y usan la API de D45 sin cambios en el backend.
- Catálogo: pasteles y postres con sus conteos, "Pastel mini" con el precio de la API, la sección "¿No encuentras el pastel que imaginas?" y la barra de filtros fija. La categoría va en `?categoria=` y la búsqueda en `?buscar=`, 300 ms después de la última tecla (el pendiente de D45), con tope de 80 caracteres. Cada consulta cancela la anterior. Hay estados de carga, de error y sin resultados, y una región que anuncia cuántos resultados hay.
- Ficha: presentaciones con peso y personas, "Hoy, de la vitrina" o "Encargarlo para una fecha" con su motivo cuando no aplica, cantidad y "Agregar al pedido" al carrito de D46. Conservación y Transporte sin dato llevan el marcador de pendiente. También el 404 ("No encontramos este producto"), el error con reintento y el esqueleto.
- "Personalizar este pastel" abre "Diseña tu pastel" con el tipo, el pan y el relleno del producto. Si ya había un diseño a medias, pregunta "Seguir con mi diseño" o "Empezar con <producto>". El parámetro `?pastel=` se quita de la URL.
- Piezas compartidas para la vitrina: `ProductCard`, `FilterChips`, `SearchField`, `ProductGridSkeleton`, `QuantityStepper`, `Breadcrumb` y `LeadDays`.
- El encabezado del catálogo y "¿No encuentras el pastel que imaginas?" llevan el pastel 3D de la portada en la escena chica, sin separar los pisos con el scroll (libro de marca, "Presencia de marca"). Pendientes en [`pendientes.md`](pendientes.md): "para unas 3 personas" del mini, la fecha del encargo (Etapa 4) y la carga diferida de las rutas.
- Revisión de yordick-puerco: sin hallazgos graves. Se corrigieron los nueve menores y los dos detalles: atrás restaura el texto de la búsqueda, una racha de chips deja una sola entrada en el historial, el prellenado sin tipo no elige pan ni relleno, un postre se trata como no encontrado y el reintento conserva el foco.
- Segunda ronda de la revisión: el reintento del prellenado ya no pasa por el esqueleto ni pierde el foco, volver con atrás termina una racha de chips, el contenedor del aviso tiene nombre y anillo de foco, y el pastel 3D del catálogo no sobresale de su caja.
- Pruebas: 45 E2E nuevas (`catalog.spec.ts`, `catalog-cake.spec.ts`, `product-detail.spec.ts` y `design-prefill.spec.ts`), con la API simulada en `e2e/support/products.ts`. La suite completa, por partes y con 2 workers, pasó salvo dos pruebas: `cake-designer-lid.spec.ts:210`, que también falla en 79982c6 (exportado con `git archive`), y `site-frame.spec.ts:197`, que falló con Django apagado y pasó 2 de 2 al repetirla. La comparación con el mockup a 1440 y 390 px se hizo con esa API simulada y después con Django y la vitrina real del día.

### Jueves 12 de noviembre: un pastel por sabor, el rebanado, la vitrina y las rebanadas (D60)

- Decisión D60 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/vitrina-y-rebanadas`, sin desplegar. Reglas nuevas del usuario en la sección 2 de [`reglas-de-negocio.md`](reglas-de-negocio.md): un pastel completo por sabor, casi siempre rebanadas de un solo pastel, y el rebanado, que se ve completo pero completo solo se encarga. Contradicen al mockup `Rebanadas.dc.html` (siete sabores a la vez); ganó la regla.
- Backend: `Inventory.clean()` rechaza un completo con más de 1 pieza y completo y rebanadas del mismo producto el mismo día, en los productos con rebanada; la lista de "Vitrina de hoy" no valida las filas que nadie editó. `showcase/` incluye al rebanado con `sliced: true` y las tarjetas y la ficha agregan `sliced_today`.
- Frontend: `/vitrina` y `/rebanadas` conectadas a la API con sus estados (cargando, error, vacía, agotada); la tarjeta del rebanado ("Rebanado", "Ver las rebanadas" y "Encargarlo completo") en la portada y en `/vitrina`; "Rebanado hoy" en el catálogo y la ficha, con el aviso "Hoy se vende en rebanadas"; `/rebanadas` con una tarjeta ancha cuando hay un solo sabor.
- Pruebas: pytest nuevas del inventario, del servicio y de la API; E2E nuevas en `showcase.spec.ts` y `slices.spec.ts` y casos del rebanado en el catálogo, la ficha, la portada y el modelo. También las dos pruebas más fuertes que dejó la revisión de D59: el foco en el aviso de `design-prefill.spec.ts` y dos casos del historial en `catalog.spec.ts`.
- Ronda de revisión y de comparación visual (13 de noviembre): "Dejar rebanarlo" (un completo vendido no impide rebanar otro pastel del mismo sabor ese día), candado del producto en `Inventory.clean()` contra dos altas a la vez, la vitrina muestra solo al rebanado si un dato trae completo y rebanadas, la lista de "Vitrina de hoy" ya no da 500 con un error de `offering`, el aviso de "Agregar al pedido" queda fijo bajo la barra en `/vitrina` y `/rebanadas`, las tarjetas de una fila de la vitrina miden lo mismo y la portada usa la tarjeta ancha con un solo sabor de rebanadas.
- Tercera ronda (13 de noviembre): las rebanadas solo se venden de la vitrina del día (decisión del dueño), así que la ficha ofrece "Rebanada" solo con rebanadas cargadas hoy y no deja encargarla; el aviso fijo lleva "Cerrar" y reserva su alto para el foco del teclado; el formulario del inventario bloquea primero el producto y luego la fila; y el mensaje de completo y rebanadas dice cómo seguir ("pon el completo en 0 si ya se vendió, o bórralo si no salió").

### Viernes 13 de noviembre: cierre de la Etapa 3

- La Etapa 3 cierra el 13 de noviembre, la fecha del plan real, con el visto bueno del equipo. La fila 3 de "Ejecución real" en [`proyecto/plan-de-trabajo.md`](proyecto/plan-de-trabajo.md) y el estado del [`README.md`](../README.md) quedan al día. El registro de cambios del plan no cambia: el movimiento del acceso ya está en la fila del 12 de noviembre (D58).
- Qué quedó: los PR #22 a #30 están en `main` y en Heroku. Son la portada con el pastel 3D, "Diseña tu pastel" en 8 pasos, la compresión del build, el catálogo y la ficha, y la vitrina, las rebanadas y el rebanado.
- Verificación: pytest dio 1286 passed y 1 skipped (la prueba de brotli). `npm run typecheck`, `npm run lint` y `npm run build` pasan. Las E2E se corrieron por pantalla, con 131 de 131 en vitrina, rebanadas, catálogo, ficha, portada y carrito en la última rama. Cada rama pasó revisión de código hasta "ship". Las pantallas se compararon con las capturas a 1440 y 390 px. El 3D se revisó en un teléfono real el 11 de noviembre.
- Decisiones: D58 (el acceso con correo pasa a la Etapa 4) y las reglas de D60: un pastel completo por sabor, con los minis fuera de la regla; el rebanado se deduce de las rebanadas; un completo vendido no impide rebanar otro pastel; y las rebanadas se venden solo de la vitrina del día.
- Pasa a la Etapa 4: el acceso con correo; el backend del pedido debe rechazar encargos de rebanada y el carrito debe quitar las líneas viejas de rebanada; el tope de un completo al reintegrar existencias; y la carga diferida de las rutas (el chunk principal pasó de 488 kB a 544 kB).
- Pendiente de la dueña: fotos de productos, precio de la oblea y visto bueno de las decoraciones. Hay además dos contradicciones del libro de marca por resolver: si la etiqueta "En vitrina hoy" lleva o no el fondo `fresa-claro`, y el dibujo del toldo en el encabezado de la vitrina.
- Pruebas intermitentes: `cake-designer-lid.spec.ts:210` y `cake-designer.spec.ts:452` fallan a veces y también fallan en `main`.
- Sigue pendiente revisar la vitrina en Heroku con los datos del día.

### Viernes 13 de noviembre: inicio de la Etapa 4 (D61)

- Decisión D61 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/acceso`: el usuario definió el mínimo para la exposición de la Etapa 4 (14 al 19 de noviembre; el 19 se congela el código), como pidió D58.
- Obligatorio: acceso con correo y con Google (JWT); carrito y entrega con "Recoger en la pastelería" y la agenda sin empalmes (lapsos de 30 minutos, máximo 3 pedidos por lapso, 2 días de anticipación); pedido creado en el servidor, que recalcula el precio y revalida el diseño; pago con Mercado Pago, Stripe y efectivo (Factory Method y Adapter, `Idempotency-Key`, webhooks verificados); Observer del pedido; nota en PDF con QR, `/nota/:token` y devolución de la base; "Mis pedidos"; cancelaciones; envío de referencia y cotización.
- Solo si sobra tiempo: entrega a domicilio con una API de rutas (mientras tanto se remite a WhatsApp), recuperación de contraseña y verificación del correo.
- Acceso: el registro con un correo ya usado muestra "Ya hay una cuenta con este correo." con un límite de intentos por IP. El inicio de sesión de clientes bloquea IP + correo tras los fallos de D34, con un límite general por IP. El admin sigue bloqueando por IP sola.
- Las imágenes de clientes se guardan en PostgreSQL, ya validadas, porque Heroku borra el disco en cada reinicio.
- Orden: tanda 1, el acceso y la API de pedidos en paralelo; tanda 2, el carrito, la entrega, los tres pagos y el Observer; tanda 3, la confirmación, la nota con QR, "Mis pedidos", las cancelaciones y el envío de referencia.
- Salen tres filas de las decisiones abiertas (registro con correo ya usado, bloqueo por IP en el login de clientes y fotos de los clientes), y "API de distancias" pasa a "Solo si sobra tiempo en la Etapa 4". La etapa queda muy cargada: si el 18 de noviembre falta algo obligatorio, se avisa al equipo para decidir qué se recorta.

### Viernes 13 de noviembre: acceso de clientes con correo y con Google (D62)

- Decisión D62 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/acceso` (tanda 1 de D61).
- Backend: `/api/v1/auth/` con `csrf/`, `register/`, `login/`, `google/`, `refresh/` y `logout/`. El access va en el cuerpo y el refresh en una cookie HttpOnly limitada a `/api/v1/auth/`, con rotación, lista negra y CSRF en cada operación que la toca. La renovación rechaza un refresh de antes de un cambio de contraseña. Los JWT se firman con `JWT_SIGNING_KEY`. django-axes bloquea por ruta: IP + correo en la API de clientes e IP sola además en el admin; los throttles `login`, `register` y `session` viven en su propia caché. Google se verifica con `google-auth` y se liga con una cuenta de correo solo si Google es la autoridad del correo; la contraseña anterior deja de servir. La sesión del sitio es solo de clientes. CSP para el sitio y la API, con lo que pide Google Identity Services. Migración `0031_user_profile_and_google` (nombre, teléfono y cuenta de Google).
- Frontend: `/entrar` y `/registro` con sus estados de error del mockup y el pastel 3D en la escena chica, el botón oficial de Google (oculto sin `VITE_GOOGLE_CLIENT_ID`), la sesión en memoria con renovación entre pestañas, `?volver=`, las rutas de la cuenta protegidas, y el encabezado y el menú móvil con la sesión ("Mi cuenta" y "Cerrar sesión"). El carrito no cambia al entrar ni al salir.
- Variables nuevas para Heroku: `JWT_SIGNING_KEY` (obligatoria), `GOOGLE_CLIENT_ID` y `VITE_GOOGLE_CLIENT_ID`. Orígenes autorizados en Google Cloud en D62.
- Fuera: recuperar la contraseña y verificar el correo (D61). Verificado en local, sin desplegar.
- Ronda 1 de correcciones (14 de noviembre), tras la revisión de código y la auditoría de seguridad: la API ya no revisa la contraseña de una cuenta del personal (el intento cuenta como fallo en django-axes), la rotación del refresh es atómica, un refresh rotado conserva la cookie solo 60 s, entrar de nuevo cierra el refresh anterior, ligar Google y cerrar sesiones van en una transacción, `hd` solo responde por su dominio, IPv6 cuenta por /64, la cookie se llama `__Secure-ilusion_refresh` en producción y los throttles suben a 60, 30 y 120 para la exposición. En el sitio: una renovación que llega después de "Cerrar sesión" ya no reabre la sesión, un 429 o un 5xx al renovar no la cierran, salir sin red lo avisa, y volver a la cuenta tras salir pide entrar. `pip-audit` sin vulnerabilidades. Detalle en D62.

### Viernes 13 de noviembre: API de pedidos, agenda e imágenes de clientes (D63)

- Decisión D63 en [`proyecto/decisiones.md`](proyecto/decisiones.md), rama `feat/pedidos-api`, sin desplegar. Es la parte del backend del mínimo de pedidos de D61. El frontend no cambia.
- Modelos `Order`, `OrderItem`, `CakeDesign`, `DeliverySlot` y `CustomerImage` (migración `0031_orders`, hoy `0032_orders`) y el admin del pedido en solo lectura.
- `POST/GET /api/v1/orders/` y `GET /api/v1/orders/<id>/`, con JWT e `Idempotency-Key`. El servidor recalcula el precio, la base y el anticipo, aparta el lapso, la vitrina y el pan de hoy en una sola transacción, y crea el pedido en `awaiting_payment` (con caducidad al cierre) o en `awaiting_quote`. La entrega a domicilio remite a WhatsApp.
- `GET /api/v1/delivery-slots/`: los lapsos del día con su anticipación por tipo de línea y el cupo de 3.
- `POST` y `GET /api/v1/customer-images/`: imágenes de la oblea y de "Otra decoración" en PostgreSQL. Pillow las valida (40 megapíxeles) y las vuelve a codificar sin EXIF; el tamaño máximo se revisa antes de leer el cuerpo, solo las ven su dueño y el personal, y hay throttle por usuario y por IP. Dependencia nueva: Pillow 13.0.0.
- El "parecido a" y la oblea contra la tapa real se calculan en el servidor. `restock_showcase` respeta un pastel por sabor.
- Reglas: las secciones 2 y 12 de [`reglas-de-negocio.md`](reglas-de-negocio.md) dicen ahora que la vitrina de hoy no se junta con un diseño y que `awaiting_payment` cubre también el pago en línea sin confirmar.
- Pendientes cerrados en [`pendientes.md`](pendientes.md): el 13 de D50, el 10 de D53, el 2 y el 5 de D60 y los puntos 1, 2, 3, 6, 8, 9, 10 y 11 de la auditoría de D55.
- Pruebas: 1 395 de pytest pasan y 3 se saltan (sin build del frontend); antes eran 1 284. `manage.py check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` pasan sin avisos.

### Sábado 14 de noviembre: sin vistas del personal (D64)

- Decisión D64 en [`proyecto/decisiones.md`](proyecto/decisiones.md): para terminar a tiempo, desde hoy no se construyen vistas, pantallas ni endpoints para el personal. La tomó el usuario.
- El admin de Django (precios, productos, vitrina, configuración y su bloqueo por IP) no se toca y las vistas nuevas no lo mencionan. La sesión del sitio sigue siendo solo de clientes (D62).
- Las tres acciones del personal de D61 se hacen desde el registro básico del pedido en el admin: registrar el pago en efectivo de un apartado, marcar la base como devuelta (con el depósito reembolsado) y poner el precio de un envío de referencia. El Observer reacciona igual que con un pago en línea.
- `/nota/:token` solo verifica la nota, sin el botón "Base devuelta". D61 lleva la nota "Reemplazado en parte por D64" y la sección 11 de [`reglas-de-negocio.md`](reglas-de-negocio.md) lleva su excepción.
- Motivo: la Etapa 4 quedó muy cargada, el código se congela el 19 de noviembre y las vistas del personal no se iban a mostrar en la exposición.

### Sábado 14 de noviembre: pedidos sin vistas del personal, topes del admin y ronda 1 de correcciones (D63)

- Cambio de alcance del usuario: el proyecto no construye vistas, pantallas ni endpoints nuevos del personal. El admin del pedido queda como registro básico, con las líneas en solo lectura y el estado como único campo editable. Ahí se registran el cobro en efectivo y lo demás del personal. Las imágenes de los clientes solo las ven su dueño y el superusuario.
- Decisiones del usuario, registradas en D63 y en las secciones 1, 10 y 12 de [`reglas-de-negocio.md`](reglas-de-negocio.md):
  - Topes en el admin, con valores propuestos: 2 pedidos sin pagar por cliente, 60 días a futuro y 10 imágenes sin pedido.
  - La vitrina de hoy no se junta con un diseño.
  - Lo de la vitrina de hoy se paga completo.
  - El pedido sin pagar vence a los 30 minutos y nunca después de su lapso; con efectivo (tanda 2), al cierre del día.
- Ronda 1 de correcciones de la revisión de código y la auditoría de seguridad:
  - Throttle `orders_create`, 10 por hora por cuenta y por IP.
  - Topes de piezas por línea (20) y por pedido (100, propuesto por el equipo), y montos que no caben: 400, nunca 500.
  - Imágenes: 12 MP configurables, MPO como JPEG, EXIF dañado (400), tope después de volver a codificar, `Cache-Control: private, no-store`. El pico de memoria con 12 MP bajó de 143 MB a 51 MB.
  - La misma imagen en dos líneas: 400.
  - Transiciones del estado en el admin con `ALLOWED_TRANSITIONS`, sin cancelar mientras no haya reintegro, y auditadas.
  - El fin del lapso, de la cuadrícula vigente.
  - La lista paginada en el repositorio.
  - De 85 a 36 consultas en un pedido con 3 diseños.
  - El color de una decoración que no lo admite: 400.
  - Prueba de dos pedidos con las mismas piezas en orden inverso.
- Migraciones: la `0031_orders` (hoy `0032_orders`) se regeneró con los topes y `DecorationOption.accepts_color`. La `0032_seed_decoration_accepts_color` (hoy `0033_seed_decoration_accepts_color`) es nueva y está en `SEED_MIGRATIONS`.
- Pruebas: 1 434 de pytest pasan y 3 se saltan (sin build del frontend). `manage.py check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` pasan sin avisos.

### Sábado 14 de noviembre: pruebas del backend en paralelo (D65)

- Decisión D65 en [`proyecto/decisiones.md`](proyecto/decisiones.md): `pytest-xdist` 3.8.0 (con `execnet` 2.1.2) en `requirements-dev.txt`, `--reuse-db` en `pytest.ini` y `-n auto` solo cuando se pide.
- Tiempos con las 1428 pruebas: 37.7 s en serie con base nueva, 34.7 s en serie con base reutilizada y de 19.8 a 24.4 s con `-n auto`. Mismos conteos en los tres modos: 1428 pasan y 1 se salta.
- `POSTGRES_TEST_DB` (opcional) fija el nombre de la base de pruebas, para que dos carpetas de trabajo sobre la misma PostgreSQL no se pisen. Caso nuevo en `backend/tests/test_settings.py`.
- Corrección en `backend/tests/conftest.py`: con la base reutilizada, terminar en una prueba transaccional dejaba la semilla vacía. Ahora una fixture de sesión la resiembra al cerrar. No cambia ninguna prueba.
- Con `--reuse-db`, hay que correr `pytest --create-db` al cambiar, agregar o renumerar migraciones y al cambiar de rama.
- Ronda 2 de revisión: `POSTGRES_TEST_DB` debe empezar con `test_` y ser distinta de la base de `DATABASE_URL` (dos casos nuevos en `test_settings.py`), y la fixture de sesión de `conftest.py` también resiembra al abrir, para que una corrida abortada no deje la base vacía.
- Ronda 2 del acceso (D62): una renovación pasajera (429, 5xx o sin red) ya no cierra la sesión al pedir un recurso de la cuenta; `getJsonWithSession` falla con un 503. Prueba nueva en `e2e/session-model.spec.ts`.
- `e2e/cake-designer-lid.spec.ts` "more size is capped at what fits" falla también en `main` (`5bc1acb`); quedó en `docs/pendientes.md` junto con los menores de la revisión del acceso.

### Sábado 14 de noviembre: `main` con el acceso (D62 y D65) entra en `feat/pedidos-api`

- Las dos ramas tenían una `0031`. La de pedidos pasa a `0032_orders` (después de la `0031_user_profile_and_google` del acceso) y la semilla a `0033_seed_decoration_accepts_color`, también en `SEED_MIGRATIONS` de `backend/tests/conftest.py`.
- Los throttles de pedidos y de imágenes (`orders_create`, `customer_images_user` y `customer_images_ip`) cuentan ahora en `CACHES["security"]` y agrupan IPv6 por /64 con `config.security.group_ip`, como los del acceso; las tasas no cambian. Dos pruebas nuevas en `backend/tests/test_order_limits.py`. Detalle en D63.
- D63 queda entre D62 y D64 en [`proyecto/decisiones.md`](proyecto/decisiones.md), y `backend/AGENTS.md`, `pendientes.md` y `proyecto/arquitectura.md` juntan lo de las dos ramas.
- Pruebas: 1 580 de pytest pasan y 3 se saltan (sin build del frontend), con `--create-db -n auto`. `manage.py check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` pasan sin avisos; `npm run typecheck` pasa.

### Sábado 14 de noviembre: ronda 2 de la API de pedidos (D63)

- Decisiones del usuario, en D63 y en las secciones 1, 6.1, 10, 12 y 14 de [`reglas-de-negocio.md`](reglas-de-negocio.md):
  - Con el precio que pone el personal en el admin, un pedido `awaiting_quote` pasa a `awaiting_payment` con su plazo para pagar. El precio solo se edita mientras el pedido espera cotización.
  - Cuánto espera una cotización sin precio queda PENDIENTE (`PolicySettings.quote_expiry_hours`, vacío); mientras tanto no vence.
  - El personal cancela desde el admin solo antes del pago, con el reintegro del lapso, la vitrina y el pan.
  - Topes nuevos por cliente: 1 pedido esperando cotización y 10 piezas de la vitrina sin pagar.
- Comando `cancel_expired_orders` (antes planeado como `cancel_unpaid_cash_orders`): cancela lo vencido con el mismo reintegro y borra las imágenes de sus diseños. Es idempotente y seguro con dos corridas a la vez. Falta programarlo en Heroku Scheduler.
- También: cobrar un apartado vencido revisa otra vez el cupo de su lapso; el primer lapso deja completos los 30 minutos para pagar; una decoración por cotizar por pedido; `orders_create_user` (10/hora) y `orders_create_ip` (60/hora); un reintento con la misma `Idempotency-Key` no gasta cupo; el admin muestra solo el error de un cambio rechazado y no lo anota en el historial; `payment.paid_in_full` en la respuesta; un lapso fuera de los días que se reservan es un 400.
- Migración `0034_order_round2_policy` (`quote_expiry_hours` vacío y dos textos de ayuda).
- Pruebas: `backend/tests/test_order_round2.py` (24: las 20 de la revisión y 4 nuevas). Antes de implementar fallaban 22 y pasaban 2 contra el código del commit `0420e87`. Se ajustaron pruebas de la ronda 1 que contradecían las decisiones (detalle en D63). La suite da 1 604 de pytest que pasan y 3 que se saltan (sin build del frontend), con `--create-db -n auto`. `manage.py check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` pasan sin avisos.

### Sábado 14 de noviembre: arreglos de la revisión de la ronda 2 de pedidos (D63)

- La revisión de código y la auditoría de seguridad de la ronda 2 no dejaron hallazgos que bloquearan. Se corrigieron los tres mayores:
  - Cancelar devuelve la vitrina por id, después el pan por id y al final las imágenes, el orden de la creación. Con el orden anterior, cancelar y crear la misma combinación a la vez daba un deadlock.
  - Un reintento con una `Idempotency-Key` usada tiene su propio throttle, `orders_retry_user` (120 por minuto), y recibe su pedido antes de que se valide el cuerpo.
  - Al hacer un pedido, primero se cancelan con su reintegro los apartados vencidos del mismo cliente, cada uno en su transacción y antes de la de creación. Antes, una cuenta podía apartar otras 10 piezas de la vitrina con las primeras 10 todavía fuera.
- Decisiones del usuario, en D63 y en las secciones 1, 6.1, 10 y 12 de [`reglas-de-negocio.md`](reglas-de-negocio.md): una cotización con precio se paga hasta el cierre del día; un pedido en pausa por cotización no ocupa lapso y el cupo se revisa al ponerle precio; se confirman el primer lapso con 30 minutos para pagar, los 60 pedidos por hora por IP y que la cotización con precio no revise el tope de 2 sin pagar; `cancel_expired_orders` se programará en Heroku Scheduler cada 10 minutos.
- Menores: la auditoría de `price_quote` registra el precio y lo que se paga hoy, y la de la cancelación, los ids. Un error en un pedido ya no corta la corrida del comando.
- Quedan anotados en [`pendientes.md`](pendientes.md): permisos propios para cotizar y cancelar, la auditoría que se escribe dentro de la transacción del admin y la anticipación que no se revisa al cotizar. En D63 queda el reembolso automático de un pago que llega para un pedido ya cancelado (tanda 2).
- Pruebas: 8 nuevas en `backend/tests/test_order_round2.py`, todas en rojo antes de su arreglo, y se ajustó la del precio de la cotización (vence a las 22:30, no a los 30 minutos). La suite da 1 612 de pytest que pasan y 3 que se saltan (sin build del frontend), con `-n auto`. `manage.py check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` pasan sin avisos.

### Sábado 14 de noviembre: re-auditoría de la ronda 2 de pedidos (D63)

- La re-revisión de código dio "ship". La re-auditoría de seguridad dejó un riesgo, y el usuario lo decidió: una pausa por cuenta contra acaparar la vitrina. Las piezas de los pedidos que la cuenta dejó vencer siguen contando para su tope de 10 durante 24 horas (`PolicySettings.expired_showcase_cooldown_hours`, propuesto por el equipo). No cuentan las cancelaciones del personal. `Order.cancellation_reason` distingue una de otra (migración `0035_showcase_cooldown_and_cancellation_reason`).
- Riesgo aceptado por el usuario: con varias cuentas todavía se puede apartar la vitrina; el personal lo atiende desde el admin. Quedó en D63 y en [`pendientes.md`](pendientes.md).
- El admin muestra "Vigencia de la cotización: PENDIENTE, no vence" mientras `quote_expiry_hours` esté vacío, en las políticas y en el pedido que espera cotización.
- Menores: la limpieza de vencidos al crear un pedido ya no escribe en la auditoría si no canceló nada; un vencido que no se pudo cancelar sigue contando para los topes; se aclararon las descripciones de la creación y del plazo de la cotización; el inicio del lapso de una cotización sale de `schedule_service.starts_at`.
- Pruebas: 5 nuevas en `backend/tests/test_order_round2.py` (4 en rojo antes del cambio; la de la cancelación del personal ya pasaba y queda como guarda) y se ajustó la de la limpieza de vencidos, que ahora rechaza las otras 10 piezas por la pausa. La suite da 1 617 de pytest que pasan y 3 que se saltan (sin build del frontend), con `--create-db -n auto`. `manage.py check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` pasan sin avisos.

### Sábado 14 de noviembre: carrito, entrega y creación del pedido (D66)

- Decisiones del usuario, en D66 y en la sección 8 de [`reglas-de-negocio.md`](reglas-de-negocio.md): el pedido guarda quién recoge (nombre y teléfono); la entrega a domicilio se ve desactivada y se coordina por WhatsApp; el calendario marca los días llenos con una sola consulta por mes; un carrito con la vitrina de hoy y un pastel diseñado no continúa hasta quitar uno.
- Backend: `Order.pickup_name` y `Order.pickup_phone` (migración `0036_order_pickup`, con la restricción de 10 dígitos), exigidos en `POST orders/`, en la respuesta y en el admin en solo lectura. `GET delivery-slots/` pasa a `?start=&end=&kind=` (hasta 42 días) y responde cada día con su motivo (`too_soon`, `full`, `too_far`) y sus lapsos; la consulta de un día (`?date=`) se reemplazó.
- Frontend: `/carrito` con cada tipo de línea, cantidades, "Quitar", "Editar pedido" de un pastel diseñado, el depósito de la base aparte, el total estimado y el estado vacío; `/pedido/entrega` (pide sesión) con el marco de la compra, recoger en la pastelería, el calendario con "Lleno", los horarios por mañana, tarde y noche, quién recoge y el resumen. "Continuar al pago" sube las imágenes de los diseños, crea el pedido con `Idempotency-Key`, vacía el carrito y va a `/pedido/pago` (que sigue vacía); con "Otra decoración" el pedido queda en pausa por cotización y la entrega lo dice.
- Pruebas: 36 nuevas o reescritas de pytest (`test_order_pickup.py`, el calendario en `test_schedule_service.py` y `test_orders_api.py`, y el ajuste de `test_order_limits.py`), en rojo antes del cambio; la suite da 1 650 que pasan con `--create-db -n auto`. E2E: `checkout-cart.spec.ts` (9) y `checkout-delivery.spec.ts` (13). La suite completa de Playwright dio 566 de 567 con un servidor nuevo (`E2E_PORT=5180`); la que falla, "the message stays inside the lid" de `cake-designer-lid.spec.ts`, también falla con el código de `main` (`da872b9`). `manage.py check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` pasan sin avisos; `npm run typecheck` y `npm run lint`, limpios.
- La migración `0036` corrió en Heroku con el despliegue del carrito: la fase `release` del `Procfile` hace `migrate`. En la base de desarrollo se corre con `manage.py migrate`. Faltan los pagos (la otra mitad de la tanda 2).

### Sábado 14 de noviembre: arreglos de la revisión del carrito y la entrega (D66)

- Mayores (revisión de código): la llave de idempotencia ahora va con la huella de lo que se pide (fecha, lapso, quién recoge y líneas), guardada como hash; si algo cambia, es otro intento con otra llave. Un reintento que recibe un pedido que ya no nace (`cancelled`) no cuenta como creado: el carrito se queda y la pantalla dice "Ese pedido ya venció. Vuelve a intentarlo para hacer uno nuevo.".
- Seguridad: cerrar la sesión (aquí o en otra pestaña) olvida la compra en curso; `GET delivery-slots/` tiene su throttle por cuenta (`delivery_slots`, 30 por minuto, caché `security`); los nombres (quien recoge, registro y Google) aceptan como mucho 2 marcas combinantes seguidas.
- Menores: tabulador itinerante real en el calendario, los controles del mes junto al error de carga, errores de DRF en lista ubicados por línea, llaves por posición en la lista de errores y `earliest_date` en `null` cuando ya no se reserva.
- Anotado en [`pendientes.md`](pendientes.md): vaciar el carrito borra lo que otra pestaña agregó, dos pestañas hacen dos pedidos, el corte de 20 s incluye la renovación, `firstMonth` fijo, la retención de quien recoge (PENDIENTE, también en la sección 8 de las reglas) y escapar `pickup_name` en la nota PDF.
- Pruebas, escritas antes del arreglo: 5 de pytest en `backend/tests/test_checkout_review.py` (las 5 en rojo antes) y 7 E2E en `frontend/e2e/checkout-review.spec.ts` (6 en rojo antes; la de "la misma huella conserva la llave y no guarda datos personales" pasa antes y después, como guarda). La suite de pytest da 1 655 que pasan con `-n auto`; `check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` limpios; `npm run typecheck` y `npm run lint` limpios.

### Sábado 14 de noviembre: re-revisión del carrito y la entrega (D66)

- Mayor: un reintento con la llave de un apartado vencido, antes de que corra `cancel_expired_orders`, recibía el pedido todavía `awaiting_payment`, se vaciaba el carrito y se mandaba a pagar. Ahora `order_service.find_order_by_key` cancela antes los vencidos del cliente, con su reintegro, cuando el pedido encontrado ya pasó su plazo, y responde `cancelled`; el navegador sigue el camino de "Ese pedido ya venció". Igual que la creación, ese reintento cancela también los demás vencidos del cliente.
- Anotado en [`pendientes.md`](pendientes.md): la recarga a mitad de la creación con el refresh vencido olvida la llave, y la huella no junta los espacios del nombre.
- Pruebas, escritas antes del arreglo: 2 de pytest en `backend/tests/test_checkout_review.py` (la del reintento vencido en rojo, `'awaiting_payment' == 'cancelled'`; la del reintento a tiempo pasa antes y después, como guarda) La suite de pytest da 1 657 que pasan con `-n auto`.
- Ronda 3 (aprobado por el usuario): el navegador decide si un pedido es vigente solo por su estado, nunca por su reloj; el vencimiento lo decide el servidor. Prueba nueva en `frontend/e2e/checkout-review.spec.ts`: con el reloj del dispositivo 2 horas adelantado, un 201 en `awaiting_payment` llega a `/pedido/pago`. `find_order_by_key` toma la hora antes de leer el pedido.


### Domingo 15 de noviembre: edición de fotos con Gemini y nombres por producto (D67)

- Nuevo [`fotografia-edicion.md`](fotografia-edicion.md): Gemini solo corrige luz, balance de blancos, contraste ligero y fondo liso, sin cambiar el pastel. Trae la instrucción para pegar, la lista de revisión contra la original y los pasos en orden hasta el campo del admin. [`fotografia.md`](fotografia.md) lo enlaza.
- Nombres de archivo (D67): la foto de un producto del catálogo usa su identificador del admin (`tres-leches-de-cajeta.png`, con `-mini`, `-rebanada` y `-corte`). Se descartó `Cajeta_Vitrina.jpg` porque el admin no acepta mayúsculas ni guion bajo y porque el sabor solo no distingue entre los dos productos de cajeta.
- Primera foto real: "Tres leches de cajeta", renombrada a `tres-leches-de-cajeta.jpg` en `assets/pasteles/` y `frontend/public/fotos/`. Le falta el recorte a PNG transparente y que alguien escriba su nombre en el admin; anotado en [`pendientes.md`](pendientes.md).
- El `README.md` suma `fotografia-edicion.md` a la tabla de documentos.

### Domingo 15 de noviembre: pagos, webhooks y Observer del pedido (D68)

- Backend de la segunda mitad de la tanda 2, en `feat/pagos`: la fábrica de pagos (`BasePayment`, `PAYMENT_GATEWAY_REGISTRY`, `create_payment_processor`) con `MercadoPagoPayment`, `StripePayment` y `CashPayment`, y los adaptadores de los SDK `mercadopago` 3.6.0 y `stripe` 17.0.0. Modelo `Payment` (migración `0037_payments`) con restricciones únicas contra el doble registro y el permiso `core_pasteleria.register_cash_payment`.
- Endpoints: `POST` y `GET /api/v1/orders/<id>/payment/` (con `Idempotency-Key`, throttle `payments_user`) y los webhooks `POST /api/v1/payments/webhooks/mercadopago/` y `.../stripe/`, verificados con la firma y idempotentes. El efectivo extiende el plazo al cierre sin pasar del lapso; el personal lo registra cambiando el estado en el admin. Un pago que llega para un pedido cancelado o ya pagado queda para reembolso, sin revivir el pedido.
- Observer: `OrderSubject`, `InventoryObserver` (toma el reintegro al cancelar) y `CustomerNotificationObserver`, notificados dentro de la transacción del cambio de estado. `StandLoanObserver` espera a `StandLoan` (tanda 3).
- Se cerró la carrera del pendiente 15 de D63: la cancelación de lo vencido y la extensión del efectivo son `UPDATE` condicionales que se excluyen.
- Pruebas: 77 nuevas de pytest. En rojo antes de su código: las del Observer (5 de 7; las otras 2 son estructurales), la fábrica (7 de 11 con un esqueleto vacío), el inicio del pago (la ruta daba 404), el admin del efectivo (4 de 6) y la carrera (2 de 2). Las de los webhooks se escribieron después de las vistas; al correrlas encontraron tres fallas reales (los `StripeObject` de Stripe 17 no tienen `.get`, un `ts` armado al recolectar y el aviso después del commit) y dos pruebas existentes del admin marcaron que el efectivo debía pasar por `order_status.change_status`. `.venv/Scripts/python.exe -m pytest -n auto` da 1 734 que pasan; `manage.py check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` pasan sin avisos. Todo con los SDK simulados: no hay cuentas sandbox todavía.

### Domingo 15 de noviembre: pantallas del pago y del apartado (D68)

- Frontend de los pagos, en `feat/pagos`, sobre la API de D68: `/pedido/pago` con Mercado Pago (redirección a Checkout Pro), la tarjeta con Stripe Elements (Card Elements, `confirmCardPayment` y 3D Secure de Stripe) y "Apartar y pagar en efectivo", con el desglose de `order.payment` (el porcentaje sale de la API). `/pedido/apartado` muestra el monto, la hora del plazo del servidor y la dirección de `GET store/info/`. Las dos rutas piden sesión y leen el pedido de `?pedido=<id>`; la entrega navega con ese parámetro.
- Estados según el servidor: procesando (después de Stripe o al volver de Mercado Pago, con una consulta cada 2.5 s hasta 24 y "Volver a consultar"), rechazado, vencido, por reembolsar (con el WhatsApp o su marcador) y apartado. Un pedido pagado lleva a `/pedido/confirmacion?pedido=<id>`, que por ahora muestra el número (la confirmación completa es de la tanda 3).
- Una llave de idempotencia por pedido y por método en `sessionStorage` (`ilusion.payment.v1`), borrada con `resetPurchase`. Stripe.js (`@stripe/stripe-js` 10.3.0 con `pure` y `@stripe/react-stripe-js` 7.1.0) llega en un chunk diferido de 20 kB, solo a `/pedido/pago` y solo si la tarjeta se ofrece; sin `VITE_STRIPE_PUBLISHABLE_KEY` la tarjeta se ve desactivada. Los Card Elements no leen `appearance`: reciben `style` con los colores de `design/tokens.json`.
- CSP: Stripe.js en `script-src`, `frame-src` (con `hooks.stripe.com` para 3D Secure) y `connect-src`, con la lista de Stripe sin Google Maps.
- Pruebas: 37 E2E nuevas (`checkout-payment.spec.ts` y `checkout-reserved.spec.ts`, con la API y un Stripe.js falso en `e2e/support/payments.ts`), las 37 en rojo contra las vistas vacías antes del código; la de la CSP en pytest, en rojo antes del cambio. `routes.spec.ts`, `checkout-delivery.spec.ts` y `checkout-review.spec.ts` se ajustaron a la sesión y a `?pedido=57`. Comparación con las capturas 018, 019, 025, 026, 030, 031, 098 y 099 a 1440 y 390 px; las diferencias por las reglas están en D68 y en [`pendientes.md`](pendientes.md) ("Pagos (D68)", puntos 12 a 19).

### Domingo 15 de noviembre: revisión única de los pagos (D68)

- Las dos revisiones (código y seguridad) no encontraron bloqueantes, y la de seguridad dio "ship".
- Mayor corregido (M1): repetir una `Idempotency-Key` con un intento abierto volvía a entregar el `client_secret` de Stripe aunque el pedido ya estuviera cancelado. `start_payment` revisa ahora que el pedido siga pagable antes de repetir un intento abierto. Cuatro pruebas nuevas en `backend/tests/test_payments_api.py`, en rojo antes del arreglo.
- Los menores quedaron anotados en [`pendientes.md`](pendientes.md), sección "Pagos (D68)", puntos 20 a 35. Se corrigió además un comentario viejo del admin sobre el Observer.

### Domingo 15 de noviembre: tres menores de la revisión de los pagos (D68)

- Con el visto bueno del usuario se corrigieron los puntos 21, 29 y 30 de [`pendientes.md`](pendientes.md) ("Pagos (D68)"). Cancelar un pedido cancela en Stripe sus PaymentIntent abiertos, después del commit y sin revertir nada si Stripe falla (`StripeCheckoutObserver`). Una firma de webhook rechazada deja un WARNING con el método, el motivo y la referencia, sin secretos. Una `STRIPE_SECRET_KEY` real (`sk_live_` o `rk_live_`) impide arrancar.
- Pruebas: 26 nuevas en `backend/tests/test_stripe_intent_cancel.py`, `test_payment_webhooks.py` y `test_payments_api.py`, y la del sujeto de `test_order_observer.py` ajustada al tercer observador. 20 de las nuevas y la del sujeto estuvieron en rojo antes del arreglo; las otras 6 son de guarda y pasaban desde antes (sin llaves, con Mercado Pago, con efectivo o con un intento cerrado no se llama a Stripe; `sk_test_` y `rk_test_` siguen arrancando). `.venv/Scripts/python.exe -m pytest -n auto` da 1 765 que pasan; `manage.py check`, `makemigrations --check --dry-run` y `spectacular --validate --fail-on-warn` pasan sin avisos.

### Domingo 15 de noviembre: nota en PDF, verificación y bases prestadas (D69)

- Backend del paquete A de la tanda 3, en `feat/tanda-3`: `StandLoan` (migración `0038_stand_loans`) con `StandLoanObserver` (presta la base al entregar el pedido, fecha límite = entrega + `stand_return_days`) y el evento "base devuelta", que emite solo `warranty_service.register_stand_return` cuando el personal con `register_stand_return` cambia el estado en el admin. Auditada, idempotente y sin pantallas nuevas (D64).
- Endpoints: `GET /api/v1/orders/<id>/note.pdf` (nota carta con QR, solo el dueño, desde `received`), `GET /api/v1/notes/<token>/` (pública, throttle por IP, sin teléfono, correo ni dirección) y `GET /api/v1/stand-loans/`. El pedido suma `status_label`, `status_changed_at`, `note_available`, `paid_with`, `stands` y los nombres de las opciones del diseño.
- Dependencia nueva: `reportlab` 5.1.0. Fuentes base del PDF, porque las de la marca solo están en `woff2`.
- Pruebas: 36 nuevas de pytest en `tests/test_stand_loans.py` y `tests/test_order_note.py`, primero en rojo: al recolectar fallaban por los nombres que no existían; con el modelo, la migración y esqueletos vacíos, 26 fallaron por su aserción y 9 de guarda pasaban (sin préstamo sin base, sin nota antes del pago, 404 de un token desconocido). La del mensaje con emoji se escribió después del código. `test_order_observer.py` ajustó la lista del sujeto a `StandLoanObserver` y `test_order_queries.py` el tope de consultas (2 fijas más). `.venv/Scripts/python.exe -m pytest -n auto` da 1 801 que pasan; `manage.py check`, `makemigrations --check --dry-run` y `spectacular --validate --fail-on-warn` pasan sin avisos.

### Domingo 15 de noviembre: pantallas de Bases en préstamo y de la verificación de la nota (D69)

- `/cuenta/bases`: las bases prestadas (con su pedido, depósito, fecha límite y los días que faltan o el aviso de que ya pasó) y las devueltas, con los estados vacío, cargando y error. Modelo `models/standLoans.ts` (sigue las páginas de 20 en 20), view-model `useStandLoans.ts` y vista `AccountBases.tsx`.
- `/nota/:token`: la página pública que abre el QR. Muestra "Nota válida" con pedido, fecha, cliente, entrega, base y depósito; distingue nota no válida (404), demasiadas consultas (429) y falla de red. Modelo `models/notes.ts` (solo lee lo que muestra: aunque la API mandara teléfono o correo, no se pintan), view-model `useNoteVerification.ts` y vista `NoteVerification.tsx`.
- Componente nuevo `FactTable` (renglones de etiqueta y valor como tabla). El submenú de la cuenta no está en `/cuenta/bases`: lo trae el trabajo de "Mis pedidos".
- Pruebas: 16 de Playwright en `e2e/stand-loans.spec.ts` y `e2e/note-verification.spec.ts`, con la API simulada en `e2e/support/stand-notes.ts`. Primero 15 fallaron y 1 pasaba (el acceso sin sesión, que ya lo resolvía `RequireSession`); ahora pasan las 16.

### Domingo 15 de noviembre: confirmación, Mis pedidos y detalle del pedido (D69)

- `/pedido/confirmacion` se verifica contra el servidor (`GET orders/<id>/`): pagado, muestra el número, la línea de tiempo, el resumen, la base y "Descargar nota (PDF)"; sin pagar, regresa a `/pedido/pago`; ajeno o inexistente, "No encontramos tu pedido". La ruta pasó dentro de `RequireSession`.
- `/cuenta`: pedidos en curso y anteriores con su estado en palabras (perlas desde que se paga, aviso `cajeta` para "Apartado, falta tu pago"), "Ver más pedidos" con el foco en el primer pedido nuevo, y los estados vacío, cargando y error. El submenú de la cuenta (pestañas en escritorio, menú "Tu cuenta" en móvil) vive en `AccountHeader`, así que también aparece en "Bases en préstamo".
- `/cuenta/pedidos/:id`: línea de tiempo (solo con las fechas que da la API), partidas con los nombres del diseño, entrega y pago, base con su aviso de regreso, WhatsApp y la nota. La nota se descarga con `fetch` y la sesión (`requestWithSession` suma `as: 'blob'` y `trailingSlash: false`).
- Pruebas: 30 nuevas de Playwright (10, 13 y 7) en `e2e/account-orders.spec.ts`, `e2e/order-detail.spec.ts` y `e2e/order-confirmation.spec.ts`, con la API simulada en `e2e/support/account-orders.ts`. Primero fallaron todas por la falta de las pantallas; ahora pasan. `routes.spec.ts` abre sesión para la confirmación y espera "Pedido #123"; dos pruebas de `session-model.spec.ts` usaban `/cuenta` como vista que no pide pedidos y pasaron a `/cuenta/datos`.
- `npm run typecheck`, `npm run lint` y `npm run build` pasan. La suite completa (`E2E_PORT=5181 npx playwright test --workers=4`, unos 12 minutos) dio 654 que pasan y 4 que fallan: la del mensaje de la tapa (ya fallaba en `main`), `site-frame` del enlace "Saltar al contenido" (inestable bajo carga; pasa sola) y las dos de `session-model` que contaban los pedidos de `/cuenta`. Corregidas esas dos, `session-model.spec.ts`, `site-frame.spec.ts` y `cake-designer-lid.spec.ts` juntas dan 77 que pasan y la de la tapa que falla.
- Revisión visual con capturas de Playwright a 1440 y 390 px contra `009`, `010`, `015`, `023`, `024`, `038` y `039`. Diferencias: sin "Volver a pedir", sin la fila "Productos" del desglose y el avatar arriba del saludo (D62). Pendientes en "Nota y bases (D69)".

### Domingo 15 de noviembre: envío de referencia, correos y cancelación por el cliente (D70)

- Backend de los paquetes B y C de la tanda 3, en `feat/tanda-3`, con la migración `0039_reference_requests_and_cancellation`.
- Envío de referencia: `ReferenceRequest` (`in_review`, `quote_ready`, `accepted`, `cancelled`), `reference_repo` y `reference_service`. Endpoints `GET/POST /api/v1/reference-requests/` (con `Idempotency-Key`), `GET reference-requests/<id>/`, `POST reference-requests/<id>/accept/` (con `Idempotency-Key`; crea el pedido `awaiting_payment` con la línea `reference`) y `POST reference-requests/<id>/cancel/`. El personal cotiza en el admin, "Envíos de referencia", con el permiso `set_reference_quote`.
- Correo: SMTP por variables de entorno, `services/email_service.py`, cuatro plantillas en texto y HTML y `CustomerEmailObserver` después del commit.
- Cancelación por el cliente: `services/orders/cancellation_service.py`, `GET` y `POST /api/v1/orders/<id>/cancel/`, con el 50% retenido de un pedido pagado y el pago `refund_required` (`customer_cancelled`). El corte desde `in_preparation` y las horas antes de la entrega (vacías) son propuesta del equipo, por confirmar.
- Pruebas: 51 nuevas de pytest en `tests/test_reference_requests.py`, `test_customer_emails.py` y `test_customer_cancellation.py`. Por el límite de turnos se escribieron después del código, no en rojo primero: ninguna se vio fallar por su aserción antes de su implementación. Al correrlas encontraron dos fallas reales (la auditoría usaba la llave `created`, reservada del `LogRecord`, y su descripción no aceptaba un resultado `None` de un recurso ajeno), ya corregidas. Se ajustaron `test_customer_images_api.py` y `test_order_observer.py`. La suite da 1 852 que pasan.

### Domingo 15 de noviembre: cancelar pedido desde el detalle (D70, frontend)

- `/cuenta/pedidos/:id` muestra "Cancelar pedido" cuando `GET orders/<id>/cancel/` dice que se puede, con un `<dialog>` modal (foco atrapado, Esc cierra, el foco vuelve al botón) que dice "No se cobra nada" o lo que retiene la pastelería y lo que se devuelve, y hasta cuándo si la API lo da. Sin poder cancelar, muestra el `message`; ya cancelado, nada. Al confirmar, el detalle pasa a "Cancelado" con un aviso `role="status"` y, si hay devolución, que está pendiente. Un 409 muestra su `detail` y vuelve a pedir el pedido; 429, 5xx y sin red se dicen en el diálogo.
- Archivos: `models/accountOrders.ts`, `viewmodels/cancelView.ts`, `useOrderCancellation.ts`, `views/orders/CancelOrder.tsx`.
- Pruebas: 13 en `e2e/order-cancel.spec.ts` (API en `e2e/support/order-cancel.ts`). Primero fallaron 12 y pasaba 1 (el pedido ya cancelado, que no muestra nada); ahora pasan las 13 y las 13 de `order-detail.spec.ts`.

### Domingo 15 de noviembre: envío de referencia y cotización (D70, frontend)

- `/pedido/referencia`: fotos con vista previa, quitar, tope de 3 y el error en su renglón (mockup `ReferenciaError`), qué tomar de ellas, ocasión, personas, fecha del evento y presupuesto. Las fotos se suben al enviar (`purpose=reference`) y la solicitud va con `Idempotency-Key` por intento (`ilusion.reference.v1`). Las dos rutas de la referencia pasaron dentro de `RequireSession`.
- `/pedido/referencia/enviada`: el número, "Qué sigue" con el correo de la cuenta y lo que se mandó, con las fotos pedidas con la sesión.
- `/cuenta/cotizaciones/:id`: en revisión, cotización lista (precio, nota, anticipo, resto y vigencia con `Pending`), aceptada y cancelada; "Pedir un cambio" y "Escribir por WhatsApp"; "Cancelar solicitud" con confirmación en la tarjeta.
- "Aceptar y pagar": `/pedido/entrega?cotizacion=<id>` con el día del evento fijo (`views/delivery/QuoteDelivery.tsx`, `useQuoteDelivery`, `useDaySlots`), `accept/` con su llave (`ilusion.quoteAccept.v1`) y luego `/pedido/pago?pedido=<id>`. El pago acepta la línea `reference`. La entrega del carrito no cambió.
- Pruebas: 31 de Playwright nuevas en `e2e/reference-upload.spec.ts` (12), `e2e/reference-quote.spec.ts` (12) y `e2e/reference-accept.spec.ts` (7), con la API simulada en `e2e/support/references.ts`. Se escribieron primero: contra el código de antes fallaron todas menos la que revisa que la entrega del carrito sigue igual. Ahora pasan las 31, junto con `checkout-delivery.spec.ts`, `checkout-payment.spec.ts` y `routes.spec.ts` (104 de 104, `E2E_PORT=5183`). `npm run typecheck`, `npm run lint` y `npm run build` pasan. La suite completa no terminó: el sistema la detuvo por falta de memoria, sin fallas que mostrar.
- Revisión visual con capturas de Playwright a 1440 y 390 px contra `090`, `093`, `094`, `095`, `104` y `105`. Diferencias: una sola lista de ocasiones, sin "Decoración" ni "Base para [n] kg" en la cotización y sin el dibujo del pastel del encabezado. Pendientes en "Referencia, correo y cancelación (D70)".
- Queda por hacer el cambio de contrato que pidió el usuario (sabor y base de la cotización); ver pendientes.

### Domingo 15 de noviembre: sabor, base y fotos de la referencia; cancelar antes de la entrega (D70, segunda ronda)

- Cuatro decisiones del usuario, en el backend, con la migración `0040_reference_flavor_stand_and_cancellation`: la solicitud lleva el sabor (`cake_type`, `bread`, `filling_base`, `filling_flavors`, revisados con la regla 4.7 por `pricing_service.check_size_and_flavor`); la base sale de las personas y su depósito va aparte en la cotización y en `pay_today`, y el pedido aceptado la lleva hasta el préstamo al entregarse (`StandLoan.reference_request`); el personal con `set_reference_quote` ve las fotos de la solicitud en el admin; y el cliente cancela en cualquier momento antes de la entrega (se quitó `customer_cancel_cutoff_hours`).
- Pruebas primero: 18 en `tests/test_reference_flavor_and_stand.py` y 4 en `test_customer_cancellation.py` (cancelar desde `in_preparation` y `ready_for_delivery`, rechazar `delivered`, sin `cancellable_until`), más dos de `test_reference_requests.py` que pasan de `pay_today` $900 a $990. Contra el código de antes fallaron 23 por su aserción (201 donde se esperaba 400, 302 donde se esperaba 403, campos que faltaban, $900 en lugar de $990, `cancellable` en `False`); pasaba solo la de `delivered`, que ya se rechazaba. Ahora pasan todas: la suite da 1 870, y `manage.py check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` no dan avisos.

### Domingo 15 de noviembre: sabor, base, solicitudes y cancelación en el frontend (D70, segunda ronda)

- `/pedido/referencia` pide el tipo de pastel, el pan y el relleno con las opciones y los componentes de los pasos 2 a 4 de "Diseña tu pastel" (`useReferenceFlavor`, sobre un borrador mínimo). Un pan de relleno incluido no deja elegir relleno; un tipo nuevo quita lo que ya no admite y dice por qué; los 400 del sabor van bajo su grupo. Las transiciones del relleno se sacaron de `useCakeDesigner` a `cakeDesignChoices.ts` para que las usen los dos.
- La enviada y la cotización muestran el tipo, el pan y el relleno; la cotización suma "Base para [n] kg" con su depósito y "Pagas hoy" (`pay_today` de la API, con la base). Una solicitud de antes de la `0040` se ve sin esos renglones.
- La línea `reference` del pedido se llama "Pastel según tu referencia" con su sabor en la confirmación, el detalle y el pago.
- Cancelación: sin `cancellable_until` ni los motivos `in_preparation` y `too_late`; el detalle de un pedido entregado muestra la frase de `not_cancellable`.
- "Mis pedidos" lista las solicitudes en revisión y cotizadas bajo los pedidos en curso; una aceptada solo se ve como su pedido.
- En `/pedido/entrega?cotizacion=<id>` la barra dice "Volver a la cotización".
- Pruebas primero: 11 nuevas de Playwright (3 en `reference-upload.spec.ts`, 1 en `reference-quote.spec.ts`, 1 en `reference-accept.spec.ts`, 1 en `order-detail.spec.ts`, 2 en `order-cancel.spec.ts` y 3 en `account-orders.spec.ts`) y otras reescritas para el contrato nuevo (el sabor en `fillForm`, la base y "Pagas hoy" en la cotización y la entrega, la carrera de la cancelación con un pedido entregado); se quitaron las de `cancellable_until` y del motivo `in_preparation`. Contra el código de antes fallaron por su aserción, salvo cancelar desde "En preparación" con el 50%, que el frontend ya permitía con la vista previa del servidor. `order-detail.spec.ts` simula la vista previa de la cancelación en su `beforeEach`. Ahora pasan los seis archivos (`--workers=2`, `E2E_PORT=5185`), con `cake-designer.spec.ts` y `cake-designer-lid.spec.ts` salvo "the message stays inside the lid", que ya fallaba en `main`. `npm run typecheck`, `npm run lint` y `npm run build`, limpios.
- Revisión visual con capturas de Playwright a 1440 y 390 px contra `090`/`091`, `094`/`095` y `009`/`010`.

### Domingo 15 de noviembre: revisión única de la tanda 3 (D70)

- Cancelación con una vista previa vieja: `POST orders/<id>/cancel/` lleva `expected_status` (el estado que mostró el diálogo). Si el pedido cambió, 409 `stale_preview` sin cancelar ni retener; sin el campo, 400. El frontend lo manda y ya cierra el diálogo con ese 409.
- `/nota/:token` ya no falla antes de la entrega: una base con `status` y `status_label` en `null` dice "Se presta al entregar" y "Regrésala antes del" con la fecha prevista.
- Correos: se quitó el nombre de la cuenta y el saludo es "Hola."; ningún otro texto libre del cliente aparece en las plantillas (la nota del personal sí).
- Menores: el QR de la nota usa `SITE_URL`; con `DEBUG` apagado y `EMAIL_HOST`, falta de `CANONICAL_HOST` lanza `ImproperlyConfigured`; `docs/reglas-de-negocio.md` ya no llama propuesta al corte de la cancelación.
- "Mis pedidos" muestra las solicitudes canceladas en "Solicitudes anteriores" (decisión del usuario); las aceptadas siguen como pedido.
- Pruebas primero, vistas en rojo antes del cambio. Los menores que quedan están en `docs/pendientes.md`, "Revisión de la tanda 3".


### Domingo 15 de noviembre: pago con tarjeta de Stripe en 502 (D68)

- En Heroku, pagar con tarjeta respondía 502 `gateway_error`: Stripe rechazaba `payment_method_types` ("no longer supported"). `StripeAdapter.create_checkout` manda ahora `automatic_payment_methods` con `enabled: True` y `allow_redirects: "never"`, y se actualizó el docstring del módulo.
- Prueba primero: `test_stripe_charges_the_advance_plus_the_stand_deposit_in_cents` revisa que se mande `automatic_payment_methods` y no `payment_method_types`; falló con el código anterior y pasa con el cambio.

### Domingo 15 de noviembre: logos oficiales de Mercado Pago y Stripe en el pago (D68)

- `assets/logos/mercado-pago.svg` (kit oficial de logos de Mercado Pago 2025, digital RGB a color, horizontal) y `assets/logos/stripe.svg` (Stripe logo kit, wordmark Blurple), copiados sin modificar.
- `/pedido/pago`: el logo de Mercado Pago va dentro de su botón, con `alt=""` porque el texto del botón ya lo nombra; "Procesado por" muestra el logo de Stripe con `alt="Stripe"`. Se importan como imagen para no cambiarles el color (libro de marca, "Inicio de sesión y pagos").
- Pruebas: una E2E nueva en `checkout-payment.spec.ts`, en rojo antes del cambio; `checkout-payment` y `checkout-reserved` dan 38 de 38. `npm run typecheck`, `npm run lint` y `npm run build` limpios. Cierra el punto 12 de "Pagos (D68)" en `pendientes.md`.
