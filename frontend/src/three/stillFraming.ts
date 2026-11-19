/**
 * El encuadre de las imágenes fijas del catálogo (D86): cada imagen del modelo se acomoda como las fotos de `public/fotos/`,
 * medidas en las 8 (análisis del 18 de noviembre de 2026): un cuadrado de 1200 px con fondo transparente, el pastel con su base
 * de 958 px de ancho (el 80 %), centrado, y su borde de abajo en y = 1101. Así la imagen del modelo ocupa en la tarjeta el mismo
 * lugar que la foto. Sin React ni three; `captureStill` solo usa lienzos 2D.
 */

/** Las medidas de las fotos en px: el lado del cuadrado, el ancho del pastel, su borde de abajo y el margen mínimo de arriba. */
export const PHOTO_FRAME = { side: 1200, width: 958, bottom: 1101, top: 40 } as const

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
 * Dónde va el pastel en el cuadrado de la foto: escalado a `frame.width` de ancho, centrado y con su borde de abajo en
 * `frame.bottom`. Si así no cabe arriba (un pastel muy alto), se achica hasta dejar `frame.top` de margen, sin moverlo de abajo.
 */
export function placeInFrame(bounds: Pick<Box, 'width' | 'height'>, frame: typeof PHOTO_FRAME = PHOTO_FRAME): Box {
  const scale = Math.min(frame.width / bounds.width, (frame.bottom - frame.top) / bounds.height)
  const width = bounds.width * scale
  const height = bounds.height * scale
  return { x: (frame.side - width) / 2, y: frame.bottom - height, width, height }
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
 * alfa, lo acomoda con `placeInFrame` sobre un cuadrado transparente y lo codifica como WebP. Lanza si no hay pastel o si el
 * navegador no codifica WebP (la imagen sería otra cosa con nombre `.webp`).
 */
export function captureStill(source: HTMLCanvasElement, quality = 0.9): string {
  const copy = context2d(source.width, source.height)
  copy.drawImage(source, 0, 0)
  const bounds = opaqueBounds(copy.getImageData(0, 0, source.width, source.height).data, source.width, source.height)
  if (!bounds) throw new Error('La escena no dibujó ningún pastel.')
  const target = placeInFrame(bounds)
  const frame = context2d(PHOTO_FRAME.side, PHOTO_FRAME.side)
  frame.imageSmoothingQuality = 'high'
  frame.drawImage(copy.canvas, bounds.x, bounds.y, bounds.width, bounds.height, target.x, target.y, target.width, target.height)
  const url = frame.canvas.toDataURL('image/webp', quality)
  if (!url.startsWith('data:image/webp')) throw new Error('El navegador no codifica WebP.')
  return url
}
