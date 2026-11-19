import { useEffect, useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import type { Texture } from 'three'
import type { SideTextureKind } from './cakeShape.ts'
import { seededRandom } from './seededRandom.ts'

/**
 * La textura del costado de la cobertura en las imágenes del catálogo (tanda 4b), como el acabado del relleno (`finish.ts`): un
 * lienzo que se dibuja la primera vez que se pide y se queda. Es una máscara de luminosidad que multiplica el color de la cobertura
 * y le da relieve (`bumpMap`): el encaje de duya (zigzag cerrado) de la foto de fresa, las marcas de espátula y las crestas
 * diagonales de la cajeta. Semillas fijas; se repite sin costura.
 */

const SIZE = 256

/** Cuánto mide una repetición en unidades de escena y cuánto relieve da. */
export const SIDE_TEXTURE_LOOKS: Record<SideTextureKind, { tile: number; bumpScale: number }> = {
  lace: { tile: 0.35, bumpScale: 1.6 },
  spatula: { tile: 0.9, bumpScale: 0.8 },
  ridges: { tile: 0.7, bumpScale: 3 },
}

type Context = CanvasRenderingContext2D

function canvas(fill: number): [HTMLCanvasElement, Context | null] {
  const element = document.createElement('canvas')
  element.width = SIZE
  element.height = SIZE
  const context = element.getContext('2d')
  if (context) {
    context.fillStyle = `rgb(${fill}, ${fill}, ${fill})`
    context.fillRect(0, 0, SIZE, SIZE)
  }
  return [element, context]
}

/** Dibuja algo nueve veces, corrido un lado del lienzo en cada dirección, para que se repita sin costura. */
function tiled(context: Context, draw: () => void) {
  for (const dx of [-SIZE, 0, SIZE]) {
    for (const dy of [-SIZE, 0, SIZE]) {
      context.save()
      context.translate(dx, dy)
      draw()
      context.restore()
    }
  }
}

/** Encaje de duya: hilos de crema que serpentean sin cruzarse mucho, cada uno con su sombra abajo. */
function drawLace(): HTMLCanvasElement {
  const [element, context] = canvas(226)
  if (!context) return element
  const random = seededRandom(5)
  const paths: [number, number][][] = []
  for (let k = 0; k < 46; k++) {
    let [x, y] = [random() * SIZE, random() * SIZE]
    let heading = random() * Math.PI * 2
    let turn = 0
    const path: [number, number][] = [[x, y]]
    for (let i = 0; i < 90; i++) {
      turn = turn * 0.8 + (random() - 0.5) * 0.9
      heading += turn
      x += Math.cos(heading) * 3
      y += Math.sin(heading) * 3
      path.push([x, y])
    }
    paths.push(path)
  }
  const stroke = (shade: number, width: number, offset: number) =>
    tiled(context, () => {
      context.strokeStyle = `rgb(${shade}, ${shade}, ${shade})`
      context.lineWidth = width
      context.lineCap = 'round'
      context.lineJoin = 'round'
      for (const path of paths) {
        context.beginPath()
        path.forEach(([x, y], i) => (i === 0 ? context.moveTo(x, y + offset) : context.lineTo(x, y + offset)))
        context.stroke()
      }
    })
  stroke(196, 3.2, 1.4)
  stroke(255, 2.2, 0)
  return element
}

/** Marcas de espátula: barridos alargados, casi horizontales, unos más claros y otros más oscuros. */
function drawSpatula(): HTMLCanvasElement {
  const [element, context] = canvas(238)
  if (!context) return element
  const random = seededRandom(9)
  const smears = Array.from({ length: 46 }, () => ({
    x: random() * SIZE,
    y: random() * SIZE,
    rx: 40 + random() * 80,
    ry: 5 + random() * 12,
    rotation: (random() - 0.5) * 0.7,
    light: random() < 0.5,
    alpha: 0.12 + random() * 0.2,
  }))
  tiled(context, () => {
    for (const smear of smears) {
      context.save()
      context.translate(smear.x, smear.y)
      context.rotate(smear.rotation)
      context.scale(smear.rx, smear.ry)
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1)
      const tone = smear.light ? '255, 255, 255' : '0, 0, 0'
      gradient.addColorStop(0, `rgba(${tone}, ${smear.light ? smear.alpha * 3 : smear.alpha})`)
      gradient.addColorStop(1, `rgba(${tone}, 0)`)
      context.fillStyle = gradient
      context.beginPath()
      context.arc(0, 0, 1, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }
  })
  return element
}

/** Crestas diagonales en S, como las levanta la espátula en la cajeta: dos por repetición, a unos 45°. */
function drawRidges(): HTMLCanvasElement {
  const [element, context] = canvas(255)
  if (!context) return element
  const image = context.createImageData(SIZE, SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE
      const v = y / SIZE
      const wave = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (2 * (u + v) + 0.12 * Math.sin(Math.PI * 2 * v)))
      const level = 190 + 65 * wave ** 1.6
      const at = (y * SIZE + x) * 4
      image.data[at] = image.data[at + 1] = image.data[at + 2] = level
      image.data[at + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  return element
}

const DRAW: Record<SideTextureKind, () => HTMLCanvasElement> = { lace: drawLace, spatula: drawSpatula, ridges: drawRidges }

/** El lienzo de una textura del costado. Siempre el mismo dibujo (semilla fija). */
export function drawSideTexture(kind: SideTextureKind): HTMLCanvasElement {
  return DRAW[kind]()
}

const templates = new Map<SideTextureKind, CanvasTexture>()

function template(kind: SideTextureKind): CanvasTexture {
  let texture = templates.get(kind)
  if (!texture) {
    texture = new CanvasTexture(drawSideTexture(kind))
    texture.colorSpace = SRGBColorSpace
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.anisotropy = 4
    templates.set(kind, texture)
  }
  return texture
}

/** La textura del costado con su repetición: un clon que comparte la imagen, como `useFinishTexture`. Sin textura, `null`. */
export function useSideTexture(kind: SideTextureKind | null, repeatX: number, repeatY: number): Texture | null {
  const texture = useMemo(() => {
    if (!kind) return null
    const clone = template(kind).clone()
    clone.repeat.set(repeatX, repeatY)
    return clone
  }, [kind, repeatX, repeatY])
  useEffect(
    () => () => {
      texture?.dispose()
    },
    [texture],
  )
  return texture
}
