/**
 * El encuadre de las imágenes fijas del catálogo (D86). Hasta la tanda 5 copiaba el de las fotos de `public/fotos/` (un cuadrado
 * de 1200 px con el pastel al 80 % del ancho y un tercio vacío arriba), y en la tarjeta el pastel se veía chico y bajo. Desde la
 * tanda 6 la imagen se recorta al pastel: 1200 × 1000 px, la proporción de la caja de la tarjeta grande (360/300), fondo
 * transparente, el pastel con su charola de 1140 px de ancho (el 95 %), centrado, y la charola en el borde de abajo. Así llena la
 * caja y sobresale de la tarjeta. Sin React ni three; `captureStill` solo usa lienzos 2D.
 */

/**
 * Las medidas de la imagen en px: su ancho y su alto, el ancho del pastel, su borde de abajo y el margen mínimo de arriba. Son las
 * de `MODEL_FRAME` en `viewmodels/productPhoto.ts`, que acomoda las fotos a este encuadre (`cake-render.spec.ts` lo revisa).
 */
export const STILL_FRAME = { width: 1200, height: 1000, cakeWidth: 1140, bottom: 1000, top: 24 } as const

/** Un rectángulo en px, con el origen arriba a la izquierda. */
export type Box = { x: number; y: number; width: number; height: number }

/**
 * Lo que cuenta como pastel: los píxeles con al menos este alfa. La escena de la imagen no lleva sombra de contacto (la tarjeta
 * pone la suya bajo la foto), así que basta con dejar fuera el borde casi invisible del suavizado.
 */
export const OPAQUE_ALPHA = 8

/**
 * La caja de los píxeles opacos de una imagen RGBA (`ImageData.data`), o `null` si no hay ninguno. `alpha` es el mínimo que
 * cuenta como opaco.
 */
export function opaqueBounds(data: ArrayLike<number>, width: number, height: number, alpha = OPAQUE_ALPHA): Box | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] < alpha) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Dónde va el pastel en la imagen: escalado a `frame.cakeWidth` de ancho, centrado y con su borde de abajo en `frame.bottom`. Si
 * así no cabe arriba (un pastel muy alto), se achica hasta dejar `frame.top` de margen, sin moverlo de abajo.
 */
export function placeInFrame(bounds: Pick<Box, 'width' | 'height'>, frame: typeof STILL_FRAME = STILL_FRAME): Box {
  const scale = Math.min(frame.cakeWidth / bounds.width, (frame.bottom - frame.top) / bounds.height)
  const width = bounds.width * scale
  const height = bounds.height * scale
  return { x: (frame.width - width) / 2, y: frame.bottom - height, width, height }
}

function context2d(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('El navegador no dio un lienzo 2D para la imagen del modelo.')
  return context
}

/**
 * La imagen fija de lo que hay en `source` (el lienzo de la escena recién dibujado, en la misma tarea): busca el pastel por su
 * alfa, lo acomoda con `placeInFrame` sobre un lienzo transparente de `STILL_FRAME` y lo codifica como WebP. Lanza si no hay
 * pastel o si el navegador no codifica WebP (la imagen sería otra cosa con nombre `.webp`).
 */
export function captureStill(source: HTMLCanvasElement, quality = 0.9): string {
  const copy = context2d(source.width, source.height)
  copy.drawImage(source, 0, 0)
  const bounds = opaqueBounds(copy.getImageData(0, 0, source.width, source.height).data, source.width, source.height)
  if (!bounds) throw new Error('La escena no dibujó ningún pastel.')
  const target = placeInFrame(bounds)
  const frame = context2d(STILL_FRAME.width, STILL_FRAME.height)
  frame.imageSmoothingQuality = 'high'
  frame.drawImage(copy.canvas, bounds.x, bounds.y, bounds.width, bounds.height, target.x, target.y, target.width, target.height)
  const url = frame.canvas.toDataURL('image/webp', quality)
  if (!url.startsWith('data:image/webp')) throw new Error('El navegador no codifica WebP.')
  return url
}
