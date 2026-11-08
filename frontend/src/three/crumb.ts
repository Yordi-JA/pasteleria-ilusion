import { useEffect, useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import type { Texture } from 'three'
import { brandColor } from './palette.ts'

/**
 * La miga del pan de "Diseña tu pastel" (D50), como textura generada en un lienzo (sin imágenes que descargar), y el
 * generador con semilla que comparten la miga y los trozos del relleno. Vive en el chunk diferido de la escena.
 */

/** Generador pseudoaleatorio con semilla (mulberry32): el mismo número da siempre las mismas posiciones. */
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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
    for (const dx of [-CRUMB_SIZE, 0, CRUMB_SIZE]) {
      for (const dy of [-CRUMB_SIZE, 0, CRUMB_SIZE]) {
        context.beginPath()
        context.ellipse(x + dx, y + dy, radius, radius * (0.6 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2)
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

// Un solo lienzo y una sola textura base para toda la escena, contados por uso: se liberan cuando nadie los usa.
let shared: { texture: CanvasTexture; users: number } | null = null

function acquireCrumb(): CanvasTexture {
  if (!shared) {
    const texture = new CanvasTexture(drawCrumb())
    texture.colorSpace = SRGBColorSpace
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.anisotropy = 4
    shared = { texture, users: 0 }
  }
  shared.users += 1
  return shared.texture
}

function releaseCrumb() {
  if (!shared) return
  shared.users -= 1
  if (shared.users <= 0) {
    shared.texture.dispose()
    shared = null
  }
}

/**
 * La miga con la repetición de una capa: un clon que comparte la imagen (se sube una vez a la GPU) y lleva su propia
 * repetición. Se libera al desmontar la capa.
 */
export function useCrumbTexture(enabled: boolean, repeatX: number, repeatY: number): Texture | null {
  const texture = useMemo(() => {
    if (!enabled) return null
    const clone = acquireCrumb().clone()
    clone.repeat.set(repeatX, repeatY)
    return clone
  }, [enabled, repeatX, repeatY])
  useEffect(
    () => () => {
      if (!texture) return
      texture.dispose()
      releaseCrumb()
    },
    [texture],
  )
  return texture
}
