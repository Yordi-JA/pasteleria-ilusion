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
