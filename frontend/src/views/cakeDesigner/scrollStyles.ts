// La tarjeta del paso de "Diseña tu pastel" en escritorio (tanda 3): desde 901 px no pasa del alto de la ventana menos la
// barra superior y 24 px de aire (si la ventana es muy baja, se queda en 22rem), y lo que no cabe se desplaza dentro de ella,
// con el título y "Continuar" a la vista. No es `sticky` (21 de noviembre): una tarjeta fija bajo la barra se quedaba pegada
// a ella en los pasos cortos (del 2 en adelante) mientras la vista previa seguía con la página, y en el paso 1, la más alta
// de la fila, bajaba con la página; ahora todos los pasos bajan con la página como el paso 1. Solo la vista previa queda
// fija (`PREVIEW_COLUMN`, libro de marca, "Cotizador 3D"). En el teléfono no hay desplazamiento dentro de otro: uno dentro
// de otro es peor que el de la página, que ya tiene la barra inferior fija.
export const DESKTOP_COLUMN = 'min-[901px]:max-h-[max(22rem,calc(100dvh-8.5rem))]'

// La barra de desplazamiento con los colores de la paleta, no la gris del sistema: delgada, en `mermelada-suave`, que se
// distingue sobre `betun` y dice que hay más abajo.
export const SCROLLBAR = '[scrollbar-color:theme(colors.mermelada-suave)_transparent] [scrollbar-width:thin]'

// `outline-offset` negativo: el anillo de foco de lo que se desplaza queda dentro de su tarjeta.
export const INNER_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-mermelada'

// La columna de la vista previa solo queda fija y con tope donde caben la vista previa (350 px), el total (unos 130),
// "Tu pastel" con al menos 10rem y los 112 px de arriba más 24 de aire: unos 810 px, que se redondean a 820. En una
// ventana más baja la columna va en el flujo normal, sin tope y con la lista completa, y baja con la página como antes.
// La tarjeta del paso conserva su tope a cualquier alto (`DESKTOP_COLUMN`) y baja con la página.
export const PREVIEW_COLUMN =
  'min-[901px]:[@media(min-height:820px)]:sticky min-[901px]:[@media(min-height:820px)]:top-28 ' +
  'min-[901px]:[@media(min-height:820px)]:max-h-[calc(100dvh-8.5rem)]'

// "Tu pastel" dentro de esa columna con tope: nunca menos de 10rem, y solo su lista se desplaza.
export const SUMMARY_SECTION = 'min-[901px]:[@media(min-height:820px)]:min-h-[10rem]'
export const SUMMARY_LIST = 'min-[901px]:[@media(min-height:820px)]:overflow-y-auto'
