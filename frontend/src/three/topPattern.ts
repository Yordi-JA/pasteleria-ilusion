import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { Texture } from 'three'
import { seededRandom } from './seededRandom.ts'
import type { TopPatternKind } from './topPatternKinds.ts'

/**
 * El dibujo de toda la tapa de las fotos nuevas (22 de noviembre), en un lienzo transparente que va sobre un disco encima de la tapa
 * (`SampleDetails.tsx`): solo el trazo, del color de los hilos de la muestra; lo demás deja ver la tapa. El centro del lienzo es el
 * centro de la tapa y su orilla, la orilla de la parte plana. Semillas fijas: siempre el mismo dibujo. Como `sideTexture.ts`, se dibuja
 * la primera vez que se pide.
 *
 * - `web`: la telaraña plumeada de fresa: vueltas de arcos entre rayos, con la punta de cada arco hacia el centro, como el chocolate
 *   que se arrastra con un palillo desde el centro.
 * - `feathers`: las plumas en espiral de cajeta: vueltas de ganchos blancos que se tuercen en espiral, más grandes hacia la orilla.
 * - `marble`: el jaspeado en espiral de zarzamora: trazos curvos del color de los hilos (blanco) sobre la tapa de salsa, en brazos que
 *   salen torcidos del centro a la orilla, cada brazo en tramos de ancho desparejo, como la crema que arrastra la espátula.
 */

export const TOP_PATTERN_SIZE = 1024
const C = TOP_PATTERN_SIZE / 2
/** El radio del dibujo en el lienzo: casi todo el lado. */
const R = C * 0.985

/** Las medidas de cada dibujo, en parte del radio y en píxeles del lienzo. */
const WEB = { spokes: 16, rings: 12, from: 0.09, dip: 0.14, width: 6 }
const FEATHERS = { rings: [0.28, 0.44, 0.6, 0.76, 0.91] as const, perRing: [10, 15, 20, 25, 30] as const, twist: 0.7, width: 22 }
const MARBLE = { arms: 58, from: 0.08, twist: 2.1, pieces: 4, width: [12, 32] as const }

type Context = CanvasRenderingContext2D

function polar(r: number, a: number): [number, number] {
  return [C + Math.sin(a) * r * R, C - Math.cos(a) * r * R]
}

function drawWeb(context: Context) {
  context.lineWidth = WEB.width
  for (let k = 0; k < WEB.rings; k++) {
    const r = WEB.from + ((1 - WEB.from) * (k + 1)) / WEB.rings
    context.beginPath()
    const steps = WEB.spokes * 24
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2
      // Entre dos rayos el arco sale hacia la orilla; en cada rayo se hunde hacia el centro, en punta.
      const between = Math.abs(Math.sin((WEB.spokes * a) / 2))
      const [x, y] = polar(r * (1 - WEB.dip * (1 - between ** 0.7)), a)
      if (i === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.stroke()
  }
}

function drawFeathers(context: Context) {
  const random = seededRandom(17)
  context.lineWidth = FEATHERS.width
  FEATHERS.rings.forEach((ring, k) => {
    const count = FEATHERS.perRing[k]
    const offset = random() * Math.PI * 2
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2
      const size = 0.09 + 0.07 * ring
      context.beginPath()
      // Un gancho: sale hacia afuera torcido en espiral y se curva de regreso, como la pluma que deja el palillo.
      for (let s = 0; s <= 20; s++) {
        const t = s / 20
        const r = ring - size * 0.6 + size * 1.4 * Math.sin((t * Math.PI) / 1.15)
        const turn = a + FEATHERS.twist * size * 2.2 * t - 0.12 * Math.sin(t * Math.PI)
        const [x, y] = polar(r, turn)
        if (s === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.stroke()
    }
  })
}

function drawMarble(context: Context) {
  const random = seededRandom(19)
  for (let i = 0; i < MARBLE.arms; i++) {
    const a = (i / MARBLE.arms) * Math.PI * 2 + random() * 0.1
    const from = MARBLE.from + random() * 0.12
    // Cada brazo en tramos: un trazo curvo que se angosta en sus puntas, con un hueco corto antes del siguiente.
    for (let k = 0; k < MARBLE.pieces; k++) {
      const [t0, t1] = [k / MARBLE.pieces + random() * 0.05, (k + 1) / MARBLE.pieces - 0.04 - random() * 0.05]
      const wide = MARBLE.width[0] + random() * (MARBLE.width[1] - MARBLE.width[0])
      context.globalAlpha = 0.75 + random() * 0.25
      for (let s = 0; s < 12; s++) {
        const [u0, u1] = [t0 + ((t1 - t0) * s) / 12, t0 + ((t1 - t0) * (s + 1)) / 12]
        const at = (t: number) => polar(from + (1 - from) * t, a + MARBLE.twist * t * t)
        const [x0, y0] = at(u0)
        const [x1, y1] = at(u1)
        context.lineWidth = wide * (0.35 + 0.65 * Math.sin((Math.PI * (s + 0.5)) / 12))
        context.beginPath()
        context.moveTo(x0, y0)
        context.lineTo(x1, y1)
        context.stroke()
      }
    }
  }
  context.globalAlpha = 1
}

const DRAW: Record<TopPatternKind, (context: Context) => void> = { web: drawWeb, feathers: drawFeathers, marble: drawMarble }

/** El lienzo del dibujo de ese tipo y color (`#rrggbb`): transparente salvo el trazo. */
export function drawTopPattern(kind: TopPatternKind, color: string): HTMLCanvasElement {
  const element = document.createElement('canvas')
  element.width = TOP_PATTERN_SIZE
  element.height = TOP_PATTERN_SIZE
  const context = element.getContext('2d')
  if (!context) return element
  context.strokeStyle = color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  // Solo dentro de la parte plana de la tapa.
  context.beginPath()
  context.arc(C, C, R, 0, Math.PI * 2)
  context.clip()
  DRAW[kind](context)
  return element
}

/** La textura del dibujo; se libera al cambiar o al desmontar. */
export function useTopPattern(kind: TopPatternKind | null, color: string | null): Texture | null {
  const texture = useMemo(() => {
    if (!kind || !color) return null
    const created = new CanvasTexture(drawTopPattern(kind, color))
    created.colorSpace = SRGBColorSpace
    created.anisotropy = 4
    return created
  }, [kind, color])
  useEffect(
    () => () => {
      texture?.dispose()
    },
    [texture],
  )
  return texture
}
