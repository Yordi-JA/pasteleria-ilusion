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
  [31, 1100, 618, 'Pastel rectangular con una imagen de colores y orilla rosa'],
  [38, 825, 1100, 'Pastel redondo amarillo con fruta y chocolate'],
  [10, 1100, 619, 'Pastel rectangular con rosas rojas de betún en las esquinas'],
  [29, 825, 1100, 'Pastel de baby shower con orilla azul y un elefante'],
  [42, 825, 1100, 'Pastel redondo con fruta en rebanadas y betún'],
  [24, 1100, 618, 'Pastel de aniversario con rosas blancas'],
  [43, 825, 1100, 'Pastel de fresas con gelatina roja'],
  [35, 618, 1100, 'Pastel blanco de primera comunión con un angelito'],
  [17, 1100, 618, 'Pastel rectangular verde con una imagen navideña'],
  [1, 619, 1100, 'Pastel redondo con orilla rosa y una caricatura'],
  [14, 1100, 825, 'Pastel rectangular con una imagen infantil y orilla azul'],
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
  [47, 825, 1100, 'Pastel redondo azul con una imagen infantil y orilla rosa'],
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
  [21, 618, 1100, 'Pastel rectangular rosa con una imagen infantil'],
  [44, 825, 1100, 'Pastel de cajeta con fruta y chocolate'],
  [12, 1100, 619, 'Pastel rectangular con orilla amarilla y rebanadas de fruta'],
  [7, 619, 1100, 'Pastel redondo con galleta molida y una imagen comestible'],
  [34, 618, 1100, 'Pastel rectangular con orilla morada y una imagen azul'],
]

// Valores fijos que se repiten con periodos distintos (5, 7 y 9): cada foto queda con su altura, su desnivel y su
// inclinación, siempre los mismos, sin azar y sin depender del render.
const SCALES = [1, 0.88, 1.1, 0.94, 1.04]
const OFFSETS = [0.04, 0.26, 0.12, 0.3, 0.18, 0.06, 0.22]
const TILTS = [-2.4, 1.6, -0.8, 2.6, -1.8, 0.9, 2.1, -1.2, 1.3]

/** Alto de una foto en unidades del alto base: una apaisada ancha mide menos que una vertical, para no dominar la banda. */
function baseHeight(ratio: number): number {
  if (ratio <= 1) return 1
  return ratio <= 1.5 ? 0.8 : 0.62
}

export type GalleryPhoto = {
  id: number
  src: string
  alt: string
  width: number
  height: number
  /** Alto en múltiplos de `--foto-alto`. */
  heightUnits: number
  /** Desnivel desde arriba, en múltiplos de `--foto-alto`. */
  offsetUnits: number
  /** Inclinación en grados. */
  tilt: number
}

export const GALLERY_PHOTOS: readonly GalleryPhoto[] = ENTRIES.map(([id, width, height, alt], index) => {
  const ratio = width / height
  return {
    id,
    src: `/fotos/pedidos/pedido-${String(id).padStart(2, '0')}.webp`,
    alt,
    width,
    height,
    heightUnits: baseHeight(ratio) * SCALES[index % SCALES.length],
    offsetUnits: OFFSETS[index % OFFSETS.length],
    tilt: TILTS[index % TILTS.length],
  }
})

/** Velocidad de la banda en escritorio, en px por segundo, con el alto base de 340 px. */
const SPEED = 36
const DESKTOP_UNIT = 340
const GAP_UNITS = 24 / DESKTOP_UNIT

/** Segundos que tarda la banda en recorrer una copia de la lista (la mitad del recorrido total). */
export const GALLERY_DURATION_SECONDS = Math.round(
  (GALLERY_PHOTOS.reduce((sum, photo) => sum + photo.heightUnits * (photo.width / photo.height) + GAP_UNITS, 0) * DESKTOP_UNIT) / SPEED,
)
