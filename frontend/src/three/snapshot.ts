/**
 * La miniatura del pastel para el carrito (tanda 4): un recuadro del lienzo de la escena, recién dibujado, copiado a un
 * lienzo 2D chico sobre el fondo `harina` y codificado como WebP (o JPEG si el navegador no codifica WebP).
 *
 * Lo que se copia es el cuadro que se acaba de dibujar en la misma tarea: sin `preserveDrawingBuffer` el navegador solo
 * borra el lienzo de WebGL después de mostrarlo, así que dibujar y leer enseguida da el pastel, sin el costo de conservar
 * el búfer en cada cuadro.
 */

/** Lado de la miniatura en px: entre 160 y 200, el doble de lo que se ve en el carrito (100 px). */
export const THUMBNAIL_SIDE = 180
/** Calidad de WebP y JPEG: unos 10 KB para un pastel de 180 px. */
const QUALITY = 0.8

/** El recuadro del lienzo que se copia, en px del búfer de dibujo, con el origen arriba a la izquierda. */
export type CanvasRegion = { x: number; y: number; side: number }

/**
 * La miniatura de `region` de `source` como dirección `data:`. Lanza si el navegador no deja leer el lienzo (quien llama
 * decide qué hacer: el pastel entra al carrito sin ella).
 */
export function encodeThumbnail(source: HTMLCanvasElement, region: CanvasRegion, background: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = THUMBNAIL_SIDE
  canvas.height = THUMBNAIL_SIDE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('El navegador no dio un lienzo 2D para la miniatura.')
  // El fondo opaco: el JPEG no tiene transparencia (saldría negro) y el pastel se ve igual que sobre el hueco de la foto.
  context.fillStyle = background
  context.fillRect(0, 0, THUMBNAIL_SIDE, THUMBNAIL_SIDE)
  context.drawImage(source, region.x, region.y, region.side, region.side, 0, 0, THUMBNAIL_SIDE, THUMBNAIL_SIDE)
  const webp = canvas.toDataURL('image/webp', QUALITY)
  // Un navegador que no codifica WebP devuelve PNG, mucho más pesado.
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', QUALITY)
}
