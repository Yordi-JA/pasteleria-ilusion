// Las dos columnas de "Diseña tu pastel" en escritorio (tanda 3): la tarjeta del paso y la de la vista previa con "Tu
// pastel". Desde 901 px la vista previa va al lado (la cuadrícula de `CakeDesigner`): cada columna queda fija bajo la barra
// superior (`top-28`) y no pasa del alto de la ventana menos esa barra y 24 px de aire; si la ventana es muy baja, se queda
// en 22rem y la página baja lo que falte. Como ninguna columna es más alta que la ventana, la página no baja más allá de
// donde las dos se quedan fijas y la vista previa no se esconde bajo la barra. En el teléfono no hay desplazamiento dentro
// de otro: uno dentro de otro es peor que el de la página, que ya tiene la barra inferior fija.
export const DESKTOP_COLUMN = 'min-[901px]:sticky min-[901px]:top-28 min-[901px]:max-h-[max(22rem,calc(100dvh-8.5rem))]'

// La barra de desplazamiento con los colores de la paleta, no la gris del sistema: delgada, en `mermelada-suave`, que se
// distingue sobre `betun` y dice que hay más abajo.
export const SCROLLBAR = '[scrollbar-color:theme(colors.mermelada-suave)_transparent] [scrollbar-width:thin]'

// `outline-offset` negativo: el anillo de foco de lo que se desplaza queda dentro de su tarjeta.
export const INNER_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-mermelada'

// La columna de la vista previa solo queda fija y con tope donde caben la vista previa (350 px), el total (unos 130),
// "Tu pastel" con al menos 10rem y los 112 px de arriba más 24 de aire: unos 810 px, que se redondean a 820. En una
// ventana más baja la columna va en el flujo normal, sin tope y con la lista completa, y baja con la página como antes.
// La tarjeta del paso conserva su tope a cualquier alto (`DESKTOP_COLUMN`).
export const PREVIEW_COLUMN =
  'min-[901px]:[@media(min-height:820px)]:sticky min-[901px]:[@media(min-height:820px)]:top-28 ' +
  'min-[901px]:[@media(min-height:820px)]:max-h-[calc(100dvh-8.5rem)]'

// "Tu pastel" dentro de esa columna con tope: nunca menos de 10rem, y solo su lista se desplaza.
export const SUMMARY_SECTION = 'min-[901px]:[@media(min-height:820px)]:min-h-[10rem]'
export const SUMMARY_LIST = 'min-[901px]:[@media(min-height:820px)]:overflow-y-auto'
