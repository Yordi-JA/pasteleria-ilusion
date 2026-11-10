Pastelería Ilusión es una pastelería familiar que hace pasteles artesanales para bodas, XV años y cumpleaños, además de postres y rebanadas del día. La marca se apoya en una idea: la ilusión es lo que se siente antes de soplar las velas. Por eso la "i" del logo es una vela encendida, y por eso el cliente puede ver cómo quedará su pastel antes de pedirlo.

Lema: **Pide un deseo. Del pastel nos encargamos.**

La dirección visual se llama *Betún y duya*: la identidad se arma como se decora un pastel, con campos de color como pisos, bordes de duya entre ellos y los pasteles reales al frente. La marca se nota en cada pantalla; no es un sitio minimalista.

## Voz y tono

- Habla de tú, con calidez y precisión. Escribe como una pastelera que explica lo que va a hornear, no como un anuncio.
- El sitio es el de la pastelería. Ningún texto, metadato ni pie de página menciona un proyecto escolar o académico.
- Describe con ingredientes y medidas reales: "Pan de chocolate con relleno de cajeta y betún de queso crema. Rinde para 20 personas." Nunca "delicioso pastel para tu evento especial".
- Di "pan", nunca "bizcocho": es la palabra que usa la pastelería. Los tipos de pastel son Tres leches, Seco y Envinado; los panes, Vainilla, Chocolate, Choco-vainilla y Choco-pingüino.
- Usa mayúscula inicial en títulos, botones y etiquetas. Nada en mayúsculas sostenidas fuera del logo.
- Sin emojis, sin signos de exclamación dobles y sin diminutivos de producto ("pastelito", "rebanadita").
- No uses la raya (—) en textos de interfaz. Usa coma, punto, dos puntos o paréntesis.
- Cada botón dice exactamente lo que pasa y conserva su nombre en todo el flujo: "Realizar pedido", "Agregar al pedido", "Ver tamaños y sabores", "Ver la vitrina", "Iniciar sesión", "Crear cuenta", "Continuar con Google", "Pagar con Mercado Pago", "Pagar con tarjeta". Nunca "Descubre", "Explora" ni "Comienza". El botón "Agregar al pedido" produce el aviso "Agregado al pedido".
- "Realizar pedido" es la acción para encargar; el cotizador 3D es parte de ese flujo, no una sección aparte.
- Los errores dicen qué pasó y cómo seguir, sin disculparse: "Mercado Pago rechazó el pago. Revisa los datos de la tarjeta o usa otra."
- Nombra cada estado del pedido igual en toda la interfaz, en correos y en el panel del administrador.
- Las bases y stands se prestan con un depósito. Donde se ofrezca uno, di cuánto es, cuándo se devuelve y qué pasa si la base no regresa en buen estado, con los datos que confirme el negocio.
- No publiques testimonios, cifras, años de experiencia, precios ni montos de depósito que el negocio no haya confirmado. Si falta el dato, no se muestra.

## Presencia de marca

- El logo principal (`ilusion-logo.svg`) está siempre en el encabezado. El encabezado es una barra flotante: un rectángulo `betun` con borde `relieve` y radio de 24px, separado 16px del borde superior sobre el campo `fresa`, y fijo arriba al hacer scroll. No es una píldora: lleva el logotipo completo, la navegación, la cuenta y el carrito con su contador.
- Bajo la barra `mermelada` cuelga el toldo de la fachada: rayas de 48px en `betun` y `fresa-claro` con remate festoneado (32px en móvil), sobre el campo `fresa`. Es la firma del sitio y va en todas las páginas, incluido el pago. La barra flotante queda 20px debajo del remate (12px en móvil). Se dibuja con CSS, igual que la duya: rayas con `repeating-linear-gradient` y festones con `radial-gradient`, sin imágenes repetidas.
- Arma cada página como pisos de color. Abre con un campo `fresa`; después alterna entre `nata` y `betun`, con una sección destacada en `mermelada` a media página. Nunca pongas dos campos oscuros seguidos. `fresa-claro` no se usa como campo de sección: junto al `fresa` se lee como su extensión y le resta fuerza. Las secciones de contenido descansan en `nata` o `betun`, para que la fresa y la mermelada destaquen como picos.
- Entre dos campos de distinto color va un borde de duya, del color del campo de arriba, como el betún que remata cada piso de un pastel. Hay tres tipos y cada uno tiene su lugar (ver "La duya").
- El gesto de la marca es el pastel recortado apoyado sobre ese borde. Si debajo del borde hay contenido, el pastel lo cruza: la base descansa en el campo de abajo y el pastel sube sobre el de arriba. Si debajo hay controles (filtros, formularios), el pastel solo se apoya en el borde, sin invadirlos. Úsalo en la portada, en el encabezado de cada sección principal y en las vistas de cuenta.
- En la portada, el encabezado del catálogo, su bloque "¿No encuentras el pastel que imaginas?", el inicio de sesión y el registro (con sus estados de carga y error, y el menú móvil abierto sobre la portada), ese pastel es 3D: tres pisos (`betun`, `fresa-claro`, `betun`) con festones de duya, sobre un stand y con vela encendida. Gira despacio, se inclina con el puntero, se arrastra para girarlo y también gira con las flechas izquierda y derecha del teclado (la escena es enfocable y muestra el foco); en la portada, al hacer scroll, los pisos se separan. La cámara mira desde unos 15° arriba. En producción se hace con react-three-fiber y comparte modelo e iluminación con el cotizador.
- El 3D nunca sustituye una foto de producto: catálogo, vitrina, ficha, carrito y pedidos muestran los PNG reales. Tampoco va en entrega ni pago. Con `prefers-reduced-motion` no gira solo, no se inclina, los pisos no se separan y la flama no titila; arrastrarlo y las flechas lo siguen girando, sin inercia, porque es movimiento que inicia y controla la persona (D48). Cada escena se pausa cuando sale de pantalla. No se agrega en otras vistas fuera de estas y de "Diseña tu pastel".
- Cuando una vista tiene una tarjeta principal (inicio de sesión, registro), esa tarjeta es lo único que cruza el borde; el pastel se apoya junto a ella.
- Usa el símbolo (`ilusion-simbolo.svg`) como estampa: en la confirmación del pedido, junto a la información del depósito de bases y en el pie de página. Uno por pantalla.
- El símbolo del pie es parte del marco y no cuenta para "uno por pantalla": la regla aplica a la estampa dentro del contenido. La portada lleva el suyo junto a "Rebanadas de hoy", como el mockup, además del del pie (decisión del usuario, D47).
- Los números grandes en `frambuesa` solo se usan con un ranking real que dé la pastelería. Sin ese dato, la sección de la portada es "Pasteles de la casa", sin números.
- La realidad la ponen los pasteles. Nada de ilustraciones genéricas de repostería, fondos repetidos, degradados ni fotos de banco. Los únicos dibujos permitidos son los de la sección "Dibujos de línea".

## Color

La paleta es **Fresa y mermelada**: cada color sale de un relleno de la casa, y los neutros están teñidos con el tono de la fresa (OKLCH, h≈18), así que todo es una sola familia.

- Monta las páginas sobre `nata`. Las tarjetas, el carrito y el panel de "Diseña tu pastel" van en `betun` con borde de 1px en `relieve`.
- `fresa` es el color de la marca: abre las páginas, remata con la duya y destaca bloques. Sobre `fresa` escribe en `mermelada` y usa `mermelada-suave` para el texto secundario (5.5:1).
- `mermelada` es el texto y también el color de acción: botón principal (uno por pantalla), enlaces y anillo de foco. En hover y presionado cambia a `mermelada-profunda`. Usa `mermelada-suave` para descripciones y bordes de campos.
- Sobre campos `mermelada` (barra superior, pie, vitrina de la portada), escribe en `betun` y usa `fresa` para el texto secundario. El botón sobre un campo `mermelada` es `betun` con texto `mermelada`.
- Opción elegida: en tarjetas con radio visible, fondo `betun` y borde de 2px en `mermelada`; en chips sin radio visible, fondo `mermelada` con texto `betun`.
- `frambuesa` es la flama del logo, la vela de los pasteles 3D y los números del ranking. Nunca va en texto corrido ni en botones.
- Los estados no son pastillas de color. El avance de un pedido se muestra con **perlas de avance**: cuatro perlitas (llenas en `mermelada` hasta el paso actual, vacías como anillo hueco con borde `mermelada-suave`) y el estado escrito al lado. Los demás estados ("En revisión", "Depósito retenido", "Apartado, falta tu pago") van como texto en `mermelada`, y los datos de producto ("En vitrina hoy", "Quedan [n]") como texto pequeño en `mermelada-suave`.
- `cajeta` queda para el borde de los avisos que piden atención, `exito` para la palomita de algo confirmado y `error` para fallas. Ningún estado depende solo del color: siempre lleva palabra.
- Sin degradados ni brillos. El tema es claro y fijo. La única excepción es el brillo del esqueleto de carga (ver "Carga de una pantalla con datos").
- Anillo de foco: 2px sólido con 2px de separación, en `mermelada` sobre fondos claros y en `betun` sobre campos `mermelada`.
- La restricción del guinda se levantó por decisión del equipo; la `mermelada` nunca se combina con dorado. Siguen fuera, como acentos, el azul rey, el naranja, el amarillo, el verde brillante, el rosa mexicano intenso y el morado, que en México se leen como colores de partidos o movimientos políticos. Mantén la `fresa` pastel: saturada se acercaría al rosa mexicano.

## Tipografía

- Títulos en Fraunces con los ejes fijos en SOFT 100 y WONK 0. Sus terminales redondeadas parecen trazadas con duya, que es la idea de toda la marca. El archivo `assets/fuentes/Fraunces-Suave.woff2` ya trae esos ejes fijos. Si cargas la fuente desde Google Fonts, aplica `font-variation-settings: "SOFT" 100, "WONK" 0`.
- Interfaz, cuerpo y precios en Instrument Sans. Tiene cifras claras para precios y cantidades, y evita las sans de siempre (Inter, Roboto).
- Usa `display` una sola vez por página. Después `titulo-1` para la página, `titulo-2` para secciones y pasos del cotizador y `titulo-3` para nombres de producto.
- Escribe el cuerpo en `cuerpo`, la letra chica en `nota` y etiquetas, botones y precios en `etiqueta`. Los precios llevan `font-variant-numeric: tabular-nums` para que no bailen al cambiar el cotizador.
- No resaltes una sola palabra de un título con otro color, cursiva o peso.

## La duya

El borde de duya es el elemento decorativo de la marca. Es una familia de tres bordes hechos como con boquilla, y cada uno tiene un lugar fijo para que no se vuelva papel tapiz:

- **Conchas** (36 × 30 px, con surcos en `mermelada` al 14%): bajo el encabezado de la página, donde empieza el contenido.
- **Perlas** (18 × 22 px, con brillo `betun` al 55%): en cambios fuertes de color dentro del contenido, como la vitrina `mermelada` de la portada. Repiten las perlas del pastel 3D.
- **Guirnalda** (96 × 40 px, arcos con una perla en cada unión): siempre el último borde, antes del pie. En las vistas cortas (acceso, estados) es el único borde, aunque no haya encabezado separado.
- Entre dos campos del mismo color o casi el mismo (`nata` y `betun`) no va borde.
- Siempre del color exacto del campo de arriba, en `--c`. La marquesina (el toldo) no es duya y conserva su remate propio.
- En la web: `<div class="duya" style="--c:#…" data-tipo="concha|perlas|guirnalda" aria-hidden="true">`. El elemento conserva 21 px en el flujo y la forma se dibuja en `::before` (y el detalle en `::after`) con `position:absolute; top:-1px`, de modo que cuelga sobre la sección de abajo sin moverla y traslapa 1 px para no dejar costura. No uses márgenes negativos en el borde: se colapsan con el de la sección siguiente y desplazan el contenido.
- La forma es una máscara SVG en mosaicos de tamaño fijo en px (nunca escalados) que incluyen una franja superior continua de 2 a 3 px; así las uniones entre mosaicos no dejan ranuras. El SVG suelto queda para impresión y piezas fijas.
- Nunca va detrás de texto, en vertical ni como fondo repetido.

## Dibujos de línea

Seis dibujos propios, cada uno tomado de algo real de la pastelería: la vela del logo (`dibujo-vela.svg`), la duya (`dibujo-duya.svg`), la base que se presta (`dibujo-base.svg`), el toldo de la fachada (`dibujo-toldo.svg`), una rebanada (`dibujo-rebanada.svg`) y un pastel de pisos (`dibujo-pisos.svg`).

- Trazo de 2px con puntas redondas, en `mermelada` sobre campos claros (30% de opacidad) o en `betun` sobre `mermelada` (22%).
- Un solo ancla visual por campo de color: o el pastel, o un dibujo, nunca los dos. Donde hay pastel (portada, catálogo, acceso, registro) no hay dibujos.
- Uno por campo, siempre en la misma posición: 112px, sin rotar, alineado al borde derecho de la columna de contenido y centrado en vertical. El texto del campo deja 144px libres a la derecha para él.
- El contenedor del dibujo va detrás del contenido con `z-index: -1` dentro de la sección (que crea su propio contexto con `position: relative; z-index: 2`). No subas el contenido con `z-index`, porque el borde de duya quedaría encima de tarjetas y pasteles.
- Nunca detrás de texto, sobre controles ni en la vista de pago.
- Elige el que corresponde al contenido: el pastel de pisos en "Mis pedidos", la base en "Bases en préstamo", la vela en "Datos y avisos", la rebanada en el carrito. El toldo y la duya quedan para estados vacíos y confirmaciones.
- En pantallas de menos de 600px se ocultan: no hay márgenes libres.
- No dibujes otros (cupcakes, batidores, rodillos) ni los repitas como papel tapiz.

## Espaciado, radios y sombras

- Espacia con `espacio-1`, `espacio-2`, `espacio-4`, `espacio-6` y `espacio-12`. Entre secciones de una página va siempre `espacio-12`.
- `radio-sm` para campos, etiquetas y chips; `radio-md` para botones, tarjetas y paneles; `radio-lg` para tarjetas grandes y el lienzo del cotizador. Nada en forma de píldora, salvo el botón oficial de Google.
- Solo las capas que flotan sobre la página llevan `sombra-flotante`: carrito lateral, menús y modales. Las tarjetas se separan con su borde `relieve`, no con sombra.
- Los pasteles recortados llevan una sombra de contacto para verse apoyados: una elipse bajo la base, de 70% del ancho del pastel, en `mermelada` al 16% de opacidad (`color-mix(in srgb, var(--mermelada) 16%, transparent)`) con `filter: blur(12px)`. No uses `drop-shadow` sobre el PNG: hace flotar el pastel.
- Los botones y opciones táctiles miden al menos 44px de alto.

## Logo

- `ilusion-logo.svg` es el logo principal: el descriptor "PASTELERÍA" sobre la palabra "ilusión", en `mermelada` con la flama en `frambuesa`. Úsalo en el encabezado, sobre campos `fresa` y en documentos.
- `ilusion-palabra.svg` es solo la palabra. Úsalo cuando el espacio es bajo o cuando "pastelería" ya se lee cerca.
- `ilusion-logo-una-tinta.svg` es todo en `mermelada`, para impresiones de una tinta: sellos de goma, cajas kraft y etiquetas.
- `ilusion-logo-sobre-chocolate.svg` es la versión en negativo: palabra en `betun` y flama en `fresa` sobre fondo `mermelada`, para empaques y redes.
- `ilusion-simbolo.svg` es la vela dentro del sello festoneado `fresa`. Úsalo como favicon, avatar de redes, etiqueta de caja y estampa, sobre fondos claros o `mermelada`.
- La i del logo no lleva punto: lleva una flama trazada como con duya. Su borde izquierdo son dos ondas de betún, de mayor a menor, como el remate de un pastel; la punta se quiebra en S hacia la derecha, como cuando la llama titila; y el núcleo hueco se inclina en la misma dirección. Se lee como flama a cualquier tamaño, pero no es la gota genérica de vela: nunca la sustituyas por un ícono de flama. La flama va en `frambuesa` sobre fondos claros, en `fresa` sobre `mermelada` y en `mermelada` en la versión de una tinta.
- La misma flama se usa en toda la marca: la vela de los pasteles 3D (cuerpo `frambuesa`, núcleo `fresa`, con un titileo suave que se detiene con "reducir movimiento"), el sello y el dibujo de línea de la vela (solo el contorno, porque a ese tamaño el núcleo no se distingue).
- El logo está convertido a trazos. No lo reescribas con la fuente, porque la flama no existe en la tipografía.
- Deja libre alrededor al menos la altura de la flama. Tamaños mínimos: 120px de ancho para el logo, 96px para la palabra y 24px para el símbolo (más chico se confunde con el icono de información).
- No lo estires, no le pongas sombras ni efectos, no cambies el color de la flama y no lo coloques sobre una foto sin un fondo liso detrás.

## Fotografía

- Los pasteles son PNG recortados con fondo transparente: solo el pastel, sin mesa ni fondo. Son los protagonistas de cada página y se muestran grandes, sin marco.
- En las tarjetas del catálogo, el pastel se apoya sobre la tarjeta `betun` y puede sobresalir de su borde superior.
- Cómo tomarlas, recortarlas y nombrarlas está en la sección "Fotografía de producto".
- Mientras falte una foto, marca el hueco con una silueta de pastel en `fresa-claro` o `relieve` y el texto "Foto del pastel" en `nota`. No uses fotos de banco ni imágenes generadas como si fueran sus pasteles.

## Catálogo y vitrina

- La vitrina muestra lo que hay hoy para llevar. El catálogo muestra cada producto como sale a vitrina: los pasteles son de tres leches (el Choco-pingüino, seco). Una línea al inicio explica que cualquier sabor se puede pedir en seco o envinado al personalizarlo; no se listan todas las combinaciones.
- En el catálogo, los productos que hoy están en la vitrina llevan la etiqueta "En vitrina hoy" (`fresa-claro` con texto `mermelada`). Las gelatinas en vaso llevan "Solo en vitrina" porque no se hacen por pedido; el Red velvet lleva "Solo por encargo" y nunca aparece en la vitrina.
- La página de vitrina va sobre el fondo claro de la página (`nata`), sin bloques `mermelada` a media página. Cada fila de productos se apoya en una repisa `relieve` con sombra suave, y el precio va en una tarjeta `betun` con borde `relieve`.
- La ficha de cada pastel ofrece tres caminos: llevarlo hoy de la vitrina, encargarlo tal cual para una fecha (para el mismo día, con 2 horas de anticipación y si hay pan) o personalizarlo. Personalizar abre el cotizador con ese sabor prellenado, y la ficha avisa antes las condiciones: desde 4 kg, precio por kilo y 2 días de anticipación.
- La barra de filtros queda fija arriba al hacer scroll: tipo de producto y búsqueda. No hay filtros por ocasión.

## Inicio de sesión y pagos

- Se entra con Google o con correo y contraseña. El catálogo y la vitrina se ven sin cuenta; para realizar un pedido se necesita una.
- El botón "Continuar con Google" lo dibuja la propia librería de Google (Google Identity Services) con su diseño oficial. No lo pintes con los tokens de la marca.
- Al pagar, el cliente elige entre dos opciones del mismo peso visual: Mercado Pago y tarjeta (Stripe). Muestra el logo oficial de cada servicio sin cambiarle el color. El botón final repite la opción elegida: "Pagar con Mercado Pago" o "Pagar con tarjeta".

## Iconografía

- El sistema todavía no tiene iconos propios. Usa Phosphor en peso Regular y en `mermelada` (o `sobre-color` sobre campos `mermelada`): sus terminales redondeadas acompañan a Fraunces suave y tiene versión para React (`@phosphor-icons/react`).
- Usa iconos solo donde ayudan a una acción o a un estado: carrito, cuenta, entrega, fecha del evento, estado del pedido, base prestada.
- No uses iconos decorativos de repostería (cupcake, batidor, rodillo) ni destellos o estrellas para "magia". Los dibujos de línea de la marca no son iconos: decoran márgenes y nunca acompañan una acción.

## Cotizador 3D

- El cotizador avanza en 8 pasos: Tamaño y forma, Tipo de pastel, Pan, Relleno, Cobertura, Decoración, Mensaje y oblea, Revisión. La base no es un paso: se asigna sola según los kilos y aparece en la revisión como depósito.
- Un stepper horizontal a todo el ancho muestra el avance con los mismos círculos del flujo de compra: completado en `mermelada` con palomita, actual con anillo `fresa-claro`, incluido con candado y siguiente en espera. Los pasos completados se pueden tocar para regresar; los siguientes no.
- A la derecha se ve solo la tarjeta del paso actual, siempre en el mismo lugar: nunca se apilan pasos. A la izquierda, fija al hacer scroll, la vista previa en una tarjeta `betun` con borde `relieve` (igual que las tarjetas de abajo), el total estimado y "Tu pastel", que lista lo elegido en cada paso con "Cambiar". "Tu pastel" no se muestra mientras está vacío.
- En móvil, el stepper se reduce a "Paso 3 de 8: Pan" con una barra de 8 segmentos, y "Tu pastel" se abre como desplegable. La vista previa queda fija arriba y una barra inferior muestra el total y el botón para continuar.
- Al avanzar, la tarjeta entra desde la derecha; al regresar, desde la izquierda. Con "reducir movimiento", solo cambia sin animación. Al cambiar de paso, el foco va al título del paso nuevo.
- El pastel 3D evoluciona con cada paso, nunca aparece terminado desde el inicio. Paso 1: solo el pan de vainilla, con su forma y sus pisos. Paso 2: el pan toma un matiz según el tipo (tres leches más claro, envinado con tono vino). Paso 3: cambia el color del pan (vainilla dorado, chocolate café, choco-vainilla con el pan de abajo de vainilla y el de arriba de chocolate en cada piso, Choco-pingüino oscuro, Red velvet rojo). Paso 4: el relleno se ve como una franja al centro de cada piso, por el costado; con dos sabores, mitad y mitad; con queso o flan, una capa de crema alrededor. Paso 5: la crema pastelera cubre el pan en su color, con el borde inferior de duya. Paso 6: la decoración (flores, chispas o patrón con duya). Paso 7: mensaje y oblea sobre la tapa, con la cámara desde arriba. Paso 8: el pastel completo con cámara intermedia, y la vela aparece hasta este momento.
- Escenario de la vista previa: una tarjeta `betun` con borde `relieve` y `radio-lg`, como el resto de las tarjetas de la página, para que se sienta parte de ella. Sin degradados, mostrador, mantel ni bordes de duya en el fondo: la duya es del pastel. El pastel se apoya en su plato con una sombra de contacto.
- Nada de etiquetas ni insignias sobre la imagen. Lo que haya que explicar va en la tarjeta del paso, donde se lee (en el paso 1: "La vista previa se irá armando con cada paso. Por ahora, solo el pan."). Las notas hablan de "la vista previa", nunca de "la izquierda", porque en móvil está arriba.
- Al cambiar un color o agregar una capa, la transición dura 300 ms; con "reducir movimiento", cambia sin animación.
- Una opción que no aplica se muestra desactivada y dice por qué ("No se combina con pastel envinado"); nunca desaparece. Si un cambio invalida algo ya elegido, se avisa antes de continuar y el botón dice qué va a pasar ("Continuar y elegir otro pan").
- La cámara del cotizador usa el mismo ángulo que las fotos del catálogo (unos 15° desde arriba, de frente) para que el pastel 3D y los reales se vean del mismo modo.
- Las opciones (pisos, tamaño, sabor, relleno, decoración) son chips en `radio-sm`; la elegida se llena de `mermelada` con texto `betun`, como en el resto de los chips (ver "Componentes").
- El precio estimado se actualiza en `titulo-3` con cifras tabulares, junto al botón "Agregar al pedido".

## Estados

- Toda vista que muestra datos tiene estado vacío, de carga y de error.
- Vacío: un dibujo de línea centrado, una frase concreta y una o dos salidas ("Ver la vitrina", "Realizar pedido").
- Carga de una acción (calcular, procesar un pago): texto que dice qué está pasando ("Preparando la vista previa…", "Calculando…", "Procesando pago…") y el control afectado deshabilitado.
- Carga de una pantalla con datos (catálogo, vitrina, ficha, mis pedidos, detalle del pedido): esqueleto que imita la forma real de la pantalla, en `harina` sobre `nata`, con un brillo suave de 1.4 s que se detiene con "reducir movimiento". Sobre un campo `mermelada` (franja y pie) el esqueleto es liso, en `mermelada-suave`, sin brillo. El encabezado de la página se muestra completo; solo los datos van en esqueleto. La sección lleva `aria-busy="true"` y un texto para lector de pantalla que dice qué se carga ("Cargando el catálogo…").
- Error: un aviso con `role="alert"` en `error` que dice qué pasó y cómo seguir. En el inicio de sesión no se señala cuál campo falló, para no revelar si el correo existe.

## Horarios

- La pastelería abre todos los días, de 10:00 a 22:30. Los pedidos se programan cada media hora, de 10:30 a 22:00, con un máximo de 3 pedidos por media hora.
- Los horarios se agrupan en Mañana, Tarde y Noche para no mostrar todas las opciones juntas. Los llenos se muestran como "Lleno" y no se pueden elegir.

## Páginas legales

- El aviso de privacidad y los términos viven en una sola página, con anclas `#privacidad` y `#terminos`. El texto lo redacta la pastelería; nunca se inventa.

## Pago y entrega

- Todo resumen de compra usa el mismo desglose: "Total del pedido" (sin la base), luego "Anticipo (50% del pedido)", "Depósito de la base" y "Pagas hoy" en negritas, y al final "Resto, el día de la entrega". El carrito ya avisa del anticipo antes de llegar al pago.
- Los botones de pago dicen el monto exacto: "Pagar $X con tarjeta", "Pagar $X con Mercado Pago".
- El pago en efectivo aparta el pedido: la vista "Tu pedido está apartado" usa la etiqueta "Apartado, falta tu pago" en `cajeta` (nunca en `exito`, que es para lo resuelto) y dice que el pedido se cancela si no se paga ese día.
- La fecha de entrega se elige en un calendario. Los días que no se pueden elegir se muestran desactivados con su motivo (ya pasó, necesita 2 días, lleno) y una leyenda los explica.
- La entrega a domicilio pide calle y número, colonia, código postal, alcaldía y referencias; muestra la distancia y el costo calculados, y la tabla de costos por distancia en un desplegable.

## Nota de pedido (PDF)

- Tamaño carta, fondo blanco para imprimir, con el encabezado en `betun` y una línea de 3 px en `fresa` debajo (sin bordes de duya, que impresos se ven extraños).
- Orden: logo y número de nota; cliente y entrega en dos columnas; tabla de detalle; desglose del pago; recuadro de la base en `cajeta` con la fecha límite y renglones para que la pastelería registre la devolución; código para verificarla y datos de la pastelería al pie.
- Se descarga desde la confirmación y desde el detalle del pedido.

## Accesibilidad

- Toda vista tiene una región `<main id="contenido">` y un enlace "Saltar al contenido" que aparece al recibir el foco con Tab.
- Los títulos no saltan niveles: un h1 por vista y luego h2, h3 en orden. El tamaño visual lo da el estilo, no la etiqueta.
- Todo lo que se toca mide al menos 44 px de alto, incluidos los enlaces del pie, las migas de pan y los deslizadores. Los enlaces dentro de un párrafo quedan exentos.

## Redacción

- Se dice **pedido**, no "pastel personalizado" ("Pedidos desde 4 kg"). Si la pregunta ya dice "pedido", la respuesta no lo repite.
- **Cotización** solo para el envío de referencia, donde la pastelería pone el precio. El flujo de armar el pastel se llama "Diseña tu pastel", nunca "cotizador".
- Se dice **base**, nunca "base o stand".
- El 3D es parte de la página: no se anuncia en títulos ni botones ("Diseña tu pastel", no "Diseña tu pastel en 3D"), y la carga dice "Preparando la vista previa…".
- Nunca se asume que el cliente ya fue a la pastelería ("como en la pastelería", "tu sabor de siempre").
- Una nota existe solo si dice algo que la interfaz no muestra. Fuera las que repiten precios o etiquetas, explican lo evidente o narran el sistema ("La fecha respeta los días de anticipación").
- Botones de navegación: "Ir a inicio", no "Ir a la portada".

## Componentes

- Opción elegida en tarjetas con radio o casilla visible: fondo `betun` y borde de 2 px `mermelada`; el punto del radio marca la selección. Nunca fondo `fresa-claro`, que compite con los campos de adentro.
- Opción elegida en chips sin radio visible (horarios, pisos): fondo `mermelada` con texto `betun`. Sobre un campo `mermelada` (los filtros de la vitrina de la portada), como en el mockup: sin elegir, borde `fresa` y texto `betun`; elegido, fondo `fresa-claro`, borde de 2 px `betun` y texto `mermelada`, con el anillo de foco en `betun` (D47).
- Botones: el principal (uno por pantalla) es `mermelada` con texto `betun`; el secundario es `betun` con borde de 2 px `mermelada` y texto `mermelada`, para acciones que acompañan al principal ("Ver la vitrina" junto a "Realizar pedido"); sobre campos `mermelada`, `betun` con texto `mermelada`. Texto en `etiqueta` y alto mínimo de 44 px. En hover se subraya el texto, y deshabilitado lleva borde discontinuo `relieve` y fondo `harina`: ningún estado depende solo del color.
- Avisos: llevan un ícono Phosphor de 22 px en el color del borde (salvo el de información, que va en `mermelada`, porque `relieve` no tiene contraste suficiente), un título en negritas que nombra el estado y, si hace falta, un texto en `nota`. El de información (sin urgencia, como el aviso de los pisos que bajaron solos en "Diseña tu pastel", D50) lleva borde de 1 px `relieve`; el de atención, borde de 2 px `cajeta`; el de algo confirmado, borde de 2 px `exito` con palomita; el de falla, borde de 2 px `error` y `role="alert"`. Los demás usan `role="status"`.
- Borde de duya: siempre del color exacto de la sección de la que cuelga.
- Vistas de acceso (iniciar sesión, crear cuenta, recuperar y verificar): un solo fondo `fresa` de arriba abajo, con la tarjeta completa dentro, sin franjas intermedias.
- "Mis pedidos": el pedido en curso es una tarjeta compacta (número, estado, qué lleva, fecha, lo que resta y "Ver pedido"); la línea de tiempo y el desglose van en el detalle.
- La ocasión del pastel (cumpleaños, boda, XV años…) se pregunta en el pedido, opcional, en la revisión y en el envío de referencia. La portada no tiene sección de eventos.
- Contenido que se despliega dentro de una opción (la dirección de entrega, el mensaje, la oblea): en escritorio lleva sangría para alinearse con el texto junto al radio; en móvil (hasta 600 px) no lleva sangría y usa el mismo margen de 16 px que la tarjeta, para que los campos aprovechen el ancho.
- Tarjetas anidadas en móvil: la exterior baja su relleno a 16 px, porque cada nivel suma margen y los campos terminan apretados a la derecha.
- Los ejemplos de los campos caben completos en el ancho móvil ("Ej. Insurgentes Sur 1234", no "Ej. Av. Insurgentes Sur 1234, int. 5").

## Formularios

- Todo campo lleva etiqueta visible arriba y un ejemplo del formato en el placeholder: "Ej. Ana López García", "nombre@correo.com", "Ej. 55 1234 5678", "MM / AA". El ejemplo complementa a la etiqueta; nunca la reemplaza.
- Si el formato no es obvio, agrega una ayuda debajo en `nota`: "10 dígitos", "3 dígitos al reverso de tu tarjeta". Enlázala al campo con `aria-describedby`.
- El placeholder va en `mermelada-suave` (5.8:1 sobre `harina`), con `opacity: 1` para que el navegador no lo aclare.
- Los datos que ya conocemos (por ejemplo, el correo de una cuenta de Google) se muestran como valor, no como ejemplo.
- En el pago no se dibuja el pastel en el encabezado: el foco es terminar la compra.
