import { useEffect, useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import type { Texture } from 'three'
import { brandColor } from './palette.ts'
import { seededRandom } from './seededRandom.ts'

/**
 * La miga del pan de "Diseña tu pastel" (D50), como textura generada en un lienzo (sin imágenes que descargar), y el
 * generador con semilla que comparten la miga, los trozos del relleno y la decoración (`seededRandom.ts`). Vive en el
 * chunk diferido de la escena.
 */

const CRUMB_SIZE = 256
/** Una repetición de la miga cada 0.5 unidades de escena (50 px del prototipo). */
export const CRUMB_TILE = 0.5

function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')
}

/**
 * La miga: fondo `betun` con poros en `mermelada` de varios tamaños y transparencias, dibujados también del otro lado
 * de cada borde para que la textura se repita sin costura. Es casi blanca, así el color del pan (que multiplica)
 * manda; también sirve de relieve (`bumpMap`).
 */
function drawCrumb(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = CRUMB_SIZE
  canvas.height = CRUMB_SIZE
  const context = canvas.getContext('2d')
  if (!context) return canvas
  context.fillStyle = brandColor('betun')
  context.fillRect(0, 0, CRUMB_SIZE, CRUMB_SIZE)
  const pore = rgb(brandColor('mermelada'))
  const random = seededRandom(20261107)
  const dot = (x: number, y: number, radius: number, alpha: number) => {
    context.fillStyle = `rgba(${pore}, ${alpha})`
    // La forma del poro se decide una sola vez: sus copias al otro lado del borde son idénticas y la costura calza.
    const minor = radius * (0.6 + random() * 0.5)
    const rotation = random() * Math.PI
    // El semieje mayor no pasa de 1.1 veces el radio: solo se copia del otro lado lo que cruza el borde.
    const reach = radius * 1.1
    const shifts = (at: number) => [0, ...(at - reach < 0 ? [CRUMB_SIZE] : []), ...(at + reach > CRUMB_SIZE ? [-CRUMB_SIZE] : [])]
    for (const dx of shifts(x)) {
      for (const dy of shifts(y)) {
        context.beginPath()
        context.ellipse(x + dx, y + dy, radius, minor, rotation, 0, Math.PI * 2)
        context.fill()
      }
    }
  }
  // Manchas suaves (la esponja no es pareja) y luego poros chicos y medianos.
  for (let i = 0; i < 70; i++) dot(random() * CRUMB_SIZE, random() * CRUMB_SIZE, 6 + random() * 10, 0.03 + random() * 0.04)
  for (let i = 0; i < 1400; i++) dot(random() * CRUMB_SIZE, random() * CRUMB_SIZE, 0.6 + random() * 1.6, 0.1 + random() * 0.22)
  for (let i = 0; i < 160; i++) dot(random() * CRUMB_SIZE, random() * CRUMB_SIZE, 2 + random() * 2.5, 0.12 + random() * 0.15)
  return canvas
}

// Un solo lienzo y una sola textura base para toda la escena, que se dibujan la primera vez que se piden y se quedan
// (256 x 256 px, unos 256 kB): volver al paso 4 desde el 5 no repinta los miles de poros. La base nunca se dibuja en
// la escena, solo da su imagen a los clones, así que no ocupa la GPU; cada clon libera la suya al desmontarse.
let template: CanvasTexture | null = null

function crumbTemplate(): CanvasTexture {
  if (!template) {
    template = new CanvasTexture(drawCrumb())
    template.colorSpace = SRGBColorSpace
    template.wrapS = RepeatWrapping
    template.wrapT = RepeatWrapping
    template.anisotropy = 4
  }
  return template
}

/**
 * La miga con la repetición de una capa: un clon que comparte la imagen (se sube una vez a la GPU) y lleva su propia
 * repetición. Crearlo no toma ninguna cuenta (un render descartado no deja nada), y al desmontar la capa se libera su
 * textura en la GPU; la imagen compartida se libera sola cuando el último clon la suelta.
 */
export function useCrumbTexture(enabled: boolean, repeatX: number, repeatY: number): Texture | null {
  const texture = useMemo(() => {
    if (!enabled) return null
    const clone = crumbTemplate().clone()
    clone.repeat.set(repeatX, repeatY)
    return clone
  }, [enabled, repeatX, repeatY])
  useEffect(
    () => () => {
      texture?.dispose()
    },
    [texture],
  )
  return texture
}
