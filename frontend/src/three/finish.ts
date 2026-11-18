import { useEffect, useMemo } from 'react'
import { CanvasTexture, DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, LinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three'
import type { Texture } from 'three'
import type { CakeFinish } from './cakeShape.ts'
import { seededRandom } from './seededRandom.ts'

/**
 * El acabado de la mermelada y de la cajeta en el costado del relleno (tanda 4), como la miga (`crumb.ts`): una textura
 * generada en un lienzo la primera vez que se pide, sin imágenes que descargar, y que se queda. Es una máscara de
 * luminosidad (blanco con manchas grises), no un color: multiplica el color del relleno, que sigue siendo el del admin, y
 * sirve también de relieve (`bumpMap`). El brillo sale de la rugosidad baja del material y de un entorno gris (`finishEnvironment`):
 * con solo la luz direccional, el costado vertical de una franja nunca da un reflejo. Vive en el chunk de la escena.
 */

const FINISH_SIZE = 256
/** Una repetición cada 0.5 unidades de escena, como la miga: las semillas miden lo mismo en cualquier piso. */
export const FINISH_TILE = 0.5

/** Cómo responde cada acabado a la luz: rugosidad (más baja, más brillo) y cuánto relieve da su textura. */
export const FINISH_LOOKS: Record<CakeFinish, { roughness: number; bumpScale: number; envMapIntensity: number }> = {
  // Mermelada: brillante, con la superficie un poco despareja y las semillas hundidas.
  jam: { roughness: 0.24, bumpScale: 0.9, envMapIntensity: 1 },
  // Cajeta: brillante y lisa, como un jarabe espeso.
  caramel: { roughness: 0.2, bumpScale: 0.25, envMapIntensity: 1 },
}

type Context = CanvasRenderingContext2D

/** Dibuja algo también del otro lado de cada borde que cruza, para que la textura se repita sin costura. */
function wrapped(x: number, y: number, reach: number, draw: (x: number, y: number) => void) {
  const shifts = (at: number) => [0, ...(at - reach < 0 ? [FINISH_SIZE] : []), ...(at + reach > FINISH_SIZE ? [-FINISH_SIZE] : [])]
  for (const dx of shifts(x)) for (const dy of shifts(y)) draw(x + dx, y + dy)
}

/** Una mancha suave, más oscura al centro: gris con `alpha` que se desvanece hasta el borde. */
function softSpot(context: Context, x: number, y: number, rx: number, ry: number, rotation: number, alpha: number) {
  wrapped(x, y, Math.max(rx, ry), (cx, cy) => {
    context.save()
    context.translate(cx, cy)
    context.rotate(rotation)
    context.scale(rx, ry)
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1)
    gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.beginPath()
    context.arc(0, 0, 1, 0, Math.PI * 2)
    context.fill()
    context.restore()
  })
}

/** Una semilla: una elipse chica y oscura, con su forma decidida una sola vez (sus copias del otro lado calzan). */
function seed(context: Context, x: number, y: number, radius: number, alpha: number, random: () => number) {
  const minor = radius * (0.55 + random() * 0.3)
  const rotation = random() * Math.PI
  wrapped(x, y, radius, (cx, cy) => {
    context.fillStyle = `rgba(0, 0, 0, ${alpha})`
    context.beginPath()
    context.ellipse(cx, cy, radius, minor, rotation, 0, Math.PI * 2)
    context.fill()
  })
}

function blankCanvas(): [HTMLCanvasElement, Context | null] {
  const canvas = document.createElement('canvas')
  canvas.width = FINISH_SIZE
  canvas.height = FINISH_SIZE
  const context = canvas.getContext('2d')
  // Blanco: el color del relleno queda tal cual donde no hay manchas.
  if (context) {
    context.fillStyle = 'rgb(255, 255, 255)'
    context.fillRect(0, 0, FINISH_SIZE, FINISH_SIZE)
  }
  return [canvas, context]
}

/** Mermelada: ondas suaves (la superficie despareja), pulpa más oscura y semillas chicas. */
function drawJam(): HTMLCanvasElement {
  const [canvas, context] = blankCanvas()
  if (!context) return canvas
  const random = seededRandom(20261117)
  for (let i = 0; i < 46; i++) {
    softSpot(context, random() * FINISH_SIZE, random() * FINISH_SIZE, 18 + random() * 26, 10 + random() * 16, random() * Math.PI, 0.05 + random() * 0.06)
  }
  // Trocitos de fruta: más chicos y un poco más oscuros.
  for (let i = 0; i < 40; i++) {
    softSpot(context, random() * FINISH_SIZE, random() * FINISH_SIZE, 4 + random() * 4, 3 + random() * 3, random() * Math.PI, 0.18 + random() * 0.12)
  }
  for (let i = 0; i < 220; i++) seed(context, random() * FINISH_SIZE, random() * FINISH_SIZE, 1.5 + random() * 1.5, 0.5 + random() * 0.25, random)
  return canvas
}

/** Cajeta: vetas anchas y alargadas, apenas más oscuras, como el jarabe que se asienta; sin trozos. */
function drawCaramel(): HTMLCanvasElement {
  const [canvas, context] = blankCanvas()
  if (!context) return canvas
  const random = seededRandom(20261118)
  for (let i = 0; i < 34; i++) {
    // Casi horizontales: la cajeta se extiende a lo largo de la franja.
    softSpot(context, random() * FINISH_SIZE, random() * FINISH_SIZE, 40 + random() * 50, 7 + random() * 10, (random() - 0.5) * 0.5, 0.035 + random() * 0.035)
  }
  return canvas
}

const DRAW: Record<CakeFinish, () => HTMLCanvasElement> = { jam: drawJam, caramel: drawCaramel }

const ENVIRONMENT_WIDTH = 64
const ENVIRONMENT_HEIGHT = 32
/**
 * De dónde llega el reflejo: a la izquierda y al frente, como la luz de la escena, pero baja, cerca del horizonte, para que la
 * vea el costado vertical de la franja (la luz direccional está demasiado alta para eso).
 */
export const GLOSS_WINDOW = (() => {
  const length = Math.hypot(-0.55, 0.3, 0.8)
  return [-0.55 / length, 0.3 / length, 0.8 / length] as const
})()
/** Lo que mide la ventana (radio en radianes) y su brillo: chica y muy clara, como una ventana real, para dar un reflejo sin aclarar todo el relleno. */
const WINDOW_RADIUS = 0.2
const WINDOW_LEVEL = 7
/** El resto del entorno, casi oscuro. */
const AMBIENT_LEVEL = 0.03

/**
 * La luz del entorno en una dirección, en unidades lineales (más de 1 en la ventana): casi oscuro, con una ventana chica y muy
 * clara. Solo es luz gris que reflejan la mermelada y la cajeta; no es un color.
 */
export function environmentLevel(x: number, y: number, z: number): number {
  const cos = x * GLOSS_WINDOW[0] + y * GLOSS_WINDOW[1] + z * GLOSS_WINDOW[2]
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)))
  return AMBIENT_LEVEL + WINDOW_LEVEL * Math.exp(-((angle / WINDOW_RADIUS) ** 2))
}

let environment: DataTexture | null = null

/**
 * El entorno que reflejan los acabados, en proyección equirrectangular (64 x 32 px en medio flotante, 16 kB): se arma una sola
 * vez y se queda.
 * three lo prefiltra con PMREM la primera vez que lo dibuja y guarda el resultado; no hay costo por cuadro aparte del muestreo.
 */
export function finishEnvironment(): DataTexture {
  if (!environment) {
    const data = new Uint16Array(ENVIRONMENT_WIDTH * ENVIRONMENT_HEIGHT * 4)
    for (let row = 0; row < ENVIRONMENT_HEIGHT; row++) {
      // Como `equirectUv` de three: v = asin(y) / π + 0.5 y u = atan2(z, x) / 2π + 0.5. La fila 0 es la de abajo.
      const latitude = ((row + 0.5) / ENVIRONMENT_HEIGHT - 0.5) * Math.PI
      for (let column = 0; column < ENVIRONMENT_WIDTH; column++) {
        const longitude = ((column + 0.5) / ENVIRONMENT_WIDTH - 0.5) * Math.PI * 2
        const level = environmentLevel(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude))
        const at = (row * ENVIRONMENT_WIDTH + column) * 4
        data[at] = data[at + 1] = data[at + 2] = DataUtils.toHalfFloat(level)
        data[at + 3] = DataUtils.toHalfFloat(1)
      }
    }
    environment = new DataTexture(data, ENVIRONMENT_WIDTH, ENVIRONMENT_HEIGHT, RGBAFormat, HalfFloatType)
    environment.mapping = EquirectangularReflectionMapping
    environment.magFilter = LinearFilter
    environment.minFilter = LinearFilter
    environment.needsUpdate = true
  }
  return environment
}

/** El lienzo de un acabado. Siempre el mismo dibujo (semilla fija). */
export function drawFinish(finish: CakeFinish): HTMLCanvasElement {
  return DRAW[finish]()
}

// Una textura base por acabado para toda la escena, que se dibuja la primera vez que se pide y se queda (256 x 256 px, unos
// 256 kB cada una). La base nunca se dibuja, solo da su imagen a los clones; cada clon libera la suya al desmontarse.
const templates = new Map<CakeFinish, CanvasTexture>()

function finishTemplate(finish: CakeFinish): CanvasTexture {
  let template = templates.get(finish)
  if (!template) {
    template = new CanvasTexture(drawFinish(finish))
    template.colorSpace = SRGBColorSpace
    template.wrapS = RepeatWrapping
    template.wrapT = RepeatWrapping
    template.anisotropy = 4
    templates.set(finish, template)
  }
  return template
}

/**
 * La textura de un acabado con la repetición de una capa: un clon que comparte la imagen (se sube una vez a la GPU), como
 * `useCrumbTexture`. Sin acabado, `null`.
 */
export function useFinishTexture(finish: CakeFinish | null, repeatX: number, repeatY: number): Texture | null {
  const texture = useMemo(() => {
    if (!finish) return null
    const clone = finishTemplate(finish).clone()
    clone.repeat.set(repeatX, repeatY)
    return clone
  }, [finish, repeatX, repeatY])
  useEffect(
    () => () => {
      texture?.dispose()
    },
    [texture],
  )
  return texture
}
