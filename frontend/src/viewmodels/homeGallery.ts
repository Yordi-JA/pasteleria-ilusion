/**
 * Las fotos de "Hechos en la casa" (portada): lista fija y orden fijo, sin API. Los archivos están en
 * `public/fotos/pedidos/pedido-NN.webp` (lado largo de 1100 px, ya con su orientación correcta). El orden mezcla
 * verticales y apaisadas y separa los colores parecidos; la 32 (una persona) y la 36 (ilegible) no están.
 */
type GalleryEntry = readonly [id: number, width: number, height: number, alt: string]

const ENTRIES: readonly GalleryEntry[] = [
  [8, 1100, 619, 'Pastel rectangular con orilla azul y fruta en una esquina'],
  [2, 619, 1100, 'Pastel de fruta con gelatina roja y betún blanco'],
  [6, 619, 1100, 'Pastel rectangular negro y blanco con la palabra Aniversario'],
  [22, 1100, 618, 'Pastel rectangular con orilla verde y un cerdito'],
  [27, 618, 1100, 'Pastel rectangular con una princesa y orilla rosa'],
  [25, 1100, 618, 'Pastel rectangular amarillo con una excavadora'],
  [18, 618, 1100, 'Pastel rectangular con orilla morada y tres personajes'],
  [4, 619, 1100, 'Pastel cubierto con rebanadas de fruta variada'],
  [31, 1100, 618, 'Pastel rectangular de cumpleaños con una ratoncita de caricatura y orilla rosa'],
  [38, 825, 1100, 'Pastel redondo amarillo con fruta y chocolate'],
  [10, 1100, 619, 'Pastel rectangular con rosas rojas de betún en las esquinas'],
  [29, 825, 1100, 'Pastel de baby shower con orilla azul y un elefante'],
  [42, 825, 1100, 'Pastel redondo con fruta en rebanadas y betún'],
  [24, 1100, 618, 'Pastel de aniversario con rosas blancas'],
  [43, 825, 1100, 'Pastel de fresas con gelatina roja'],
  [35, 618, 1100, 'Pastel blanco de primera comunión con un angelito'],
  [17, 1100, 618, 'Pastel rectangular verde con una imagen navideña'],
  [1, 619, 1100, 'Pastel redondo con orilla rosa y una caricatura'],
  [14, 1100, 825, 'Pastel rectangular con un payaso de caricatura y orilla azul'],
  [45, 825, 1100, 'Pastel de chocolate con fruta fresca'],
  [20, 1100, 618, 'Pastel rectangular con rosas de betún y la leyenda Mis XV años'],
  [33, 618, 1100, 'Pastel rectangular con orilla verde e imagen de videojuego'],
  [11, 619, 1100, 'Pastel con la imagen de una princesa y orilla de merengue'],
  [28, 1080, 731, 'Pastel rectangular con puntos de colores y un adorno de payaso'],
  [41, 825, 1100, 'Pastel redondo con duraznos, kiwi y fresas'],
  [15, 618, 1100, 'Pastel redondo con imagen comestible y orilla rosa'],
  [23, 1003, 798, 'Pastel redondo azul turquesa con moños negros'],
  [16, 618, 1100, 'Pastel rectangular con la Virgen de Guadalupe y orilla rosa'],
  [19, 618, 1100, 'Pastel redondo amarillo con fruta y adornos de chocolate'],
  [37, 1100, 618, 'Pastel redondo con orilla durazno y una imagen de anime'],
  [47, 825, 1100, 'Pastel redondo rosa con una niña dibujada sobre la cubierta azul'],
  [13, 1100, 618, 'Pastel rectangular con un unicornio de colores y confeti'],
  [40, 825, 1100, 'Pastel con betún rosa, fruta y chocolate'],
  [48, 619, 1100, 'Gelatina de molde con duraznos y fresas'],
  [30, 1100, 825, 'Pastel con una cancha de futbol de betún verde'],
  [3, 619, 1100, 'Pastel rectangular con orilla roja y dos personajes de caricatura'],
  [5, 619, 1100, 'Pastel redondo con fruta fresca y puntos de betún'],
  [26, 618, 1100, 'Pastel en forma de corazón con betún rosa y moños'],
  [9, 1100, 618, 'Pastel rectangular con orilla rosa, letras de chocolate y fruta'],
  [39, 826, 1100, 'Pastel redondo con cascarones de chocolate y fruta'],
  [46, 1100, 825, 'Pastel redondo azul con una imagen de anime y grageas'],
  [21, 618, 1100, 'Pastel rectangular de cumpleaños con tres bebés de caricatura y rosas de betún'],
  [44, 825, 1100, 'Pastel de cajeta con fruta y chocolate'],
  [12, 1100, 619, 'Pastel rectangular con orilla amarilla y rebanadas de fruta'],
  [7, 619, 1100, 'Pastel redondo con galleta molida y una imagen comestible'],
  [34, 618, 1100, 'Pastel rectangular de cumpleaños con un personaje azul y orilla morada'],
]

/**
 * Todas las fotos van a un mismo alto (`--foto-alto`), con el borde de arriba y el de abajo en la misma línea, y cada una a su
 * ancho natural: nada se recorta. Antes (20 de noviembre) cada foto llevaba su alto y colgaba en arcos como la guirnalda; la
 * banda quedaba sin una línea de base que la ordenara y con huecos distintos bajo cada foto (correcciones del 21 de noviembre).
 */
const DESKTOP_UNIT = 300
/** El espacio entre fotos (24 px en escritorio) en unidades del alto. */
const GAP_UNITS = 24 / DESKTOP_UNIT

export type GalleryPhoto = {
  id: number
  src: string
  alt: string
  width: number
  height: number
}

export const GALLERY_PHOTOS: readonly GalleryPhoto[] = ENTRIES.map(([id, width, height, alt]) => ({
  id,
  src: `/fotos/pedidos/pedido-${String(id).padStart(2, '0')}.webp`,
  alt,
  width,
  height,
}))

/** Largo de una copia de la lista, con el espacio que sigue a cada foto, en unidades del alto. */
const COPY_UNITS = GALLERY_PHOTOS.reduce((sum, photo) => sum + photo.width / photo.height + GAP_UNITS, 0)

/** Velocidad de la banda en escritorio, en px por segundo, con el alto de 300 px. */
const SPEED = 36

/** Segundos que tarda la banda en recorrer una copia de la lista (la mitad del recorrido total). */
export const GALLERY_DURATION_SECONDS = Math.round((COPY_UNITS * DESKTOP_UNIT) / SPEED)
