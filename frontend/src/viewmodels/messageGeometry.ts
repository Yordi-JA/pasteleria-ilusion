import type { MessageLayout } from '../models/cakeDesignLayout.ts'
import { LAYOUT_BOUNDS } from '../models/cakeDesignLayout.ts'
import { clamp, clampCenter } from './lidGeometry.ts'
import type { Lid, Point } from './lidGeometry.ts'

/**
 * La geometría del mensaje sobre la tapa (paso 7, D55): dónde queda cada letra, el contorno que ocupa y cómo se acomoda para
 * no salirse de la tapa. Funciones puras, sin React ni three: las usan el editor, la vista previa y las pruebas. Todo va en
 * centímetros con la `y` hacia arriba, como `lidGeometry.ts`; los giros, en grados hacia la derecha.
 *
 * La letra mide `scale` veces el radio de la parte plana de la tapa. Recto, el texto es una sola línea. En arco, cada letra se pone sobre un
 * arco de círculo cuyo largo es el del texto (así el texto no cambia de largo al curvarse) y cuyo ángulo es `|curve|`
 * medios giros: con 1, el texto da media vuelta. Un `curve` positivo sube el texto en el centro (como un arco); uno negativo
 * lo baja. El texto queda centrado, también en vertical, sobre su posición.
 */

/** Lo que mide el texto con la letra del mensaje, en em (1 em es el alto de la letra): el ancho de cada letra y el total. */
export type MessageMetrics = { widths: number[]; total: number }

/** El cuadro de una línea, en em: de 0.3 bajo la línea base a 0.75 arriba de ella. La línea base queda 0.225 bajo el centro. */
export const LINE_BOX = 1.05
export const BASELINE_BELOW_CENTER = 0.225

export type Glyph = {
  /** Con el texto recto, todo el texto; en arco, una letra. */
  text: string
  /** Su centro respecto al centro del mensaje, en cm. */
  x: number
  y: number
  /** Su giro hacia la derecha, en grados, respecto al giro del mensaje. */
  rotation: number
}

export type MessageGeometry = {
  fontSizeCm: number
  arc: boolean
  glyphs: Glyph[]
  /** El contorno del texto (sin el giro ni la posición del mensaje), para revisar que cabe en la tapa. */
  outline: Point[]
  /** La caja que envuelve ese contorno, en cm: el lienzo de la textura 3D. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

/** Cuántos puntos se toman en cada orilla del texto en arco. */
const OUTLINE_STEPS = 14

export function wordCount(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/u).length
}

/** Mide el texto sin tipografía a la mano (pruebas o antes de cargar la letra): media letra por carácter. */
export function estimatedMetrics(text: string): MessageMetrics {
  const widths = [...text].map(() => 0.5)
  return { widths, total: widths.reduce((sum, width) => sum + width, 0) }
}

export function messageGeometry(layout: MessageLayout, metrics: MessageMetrics, radius: number): MessageGeometry {
  const fontSizeCm = layout.scale * radius
  const width = metrics.total * fontSizeCm
  const half = (LINE_BOX * fontSizeCm) / 2
  const arc = layout.arrangement === 'arc'
  if (!arc || metrics.total === 0) {
    const outline = [
      { x: -width / 2, y: -half },
      { x: width / 2, y: -half },
      { x: width / 2, y: half },
      { x: -width / 2, y: half },
    ]
    return { fontSizeCm, arc: false, glyphs: [{ text: layout.text, x: 0, y: 0, rotation: 0 }], outline, bounds: boundsOf(outline) }
  }
  const direction = layout.curve >= 0 ? 1 : -1
  const span = Math.max(Math.abs(layout.curve), LAYOUT_BOUNDS.minArcCurve) * Math.PI
  const arcRadius = width / span
  // El centro de curvatura está bajo el texto con un arco positivo y arriba con uno negativo.
  const onArc = (angle: number): Point => ({ x: arcRadius * Math.sin(angle), y: direction * arcRadius * (Math.cos(angle) - 1) })
  const sag = arcRadius * (1 - Math.cos(span / 2))
  // Se centra en vertical: con un arco positivo los extremos bajan; con uno negativo, suben.
  const lift = (direction * sag) / 2
  let start = -width / 2
  const glyphs = [...layout.text].map((char, index): Glyph => {
    const advance = metrics.widths[index] * fontSizeCm
    const angle = (start + advance / 2) / arcRadius
    start += advance
    const point = onArc(angle)
    return { text: char, x: point.x, y: point.y + lift, rotation: (direction * (angle * 180)) / Math.PI }
  })
  const along = Array.from({ length: OUTLINE_STEPS + 1 }, (_, step) => -span / 2 + (span * step) / OUTLINE_STEPS)
  const edge = (side: 1 | -1) =>
    along.map((angle): Point => {
      const point = onArc(angle)
      return { x: point.x + side * half * direction * Math.sin(angle), y: point.y + lift + side * half * Math.cos(angle) }
    })
  const outline = [...edge(-1), ...edge(1).reverse()]
  return { fontSizeCm, arc: true, glyphs, outline, bounds: boundsOf(outline) }
}

function boundsOf(points: Point[]) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  }
}

/** El contorno del mensaje con su giro (hacia la derecha), respecto al centro de la tapa y sin su posición. */
export function rotatedOutline(outline: Point[], rotation: number): Point[] {
  const angle = (-rotation * Math.PI) / 180
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
  return outline.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }))
}

/**
 * El mensaje con su tamaño, giro y posición permitidos: todo el contorno del texto dentro de la tapa. Si el texto no cabe ni
 * centrado, la letra se achica (un 7% cada vez) hasta que quepa; la posición se corrige al lugar más cercano que cabe.
 */
export function fitMessage(layout: MessageLayout, metrics: MessageMetrics, lid: Lid): MessageLayout {
  const { min, max } = LAYOUT_BOUNDS.messageScale
  let scale = clamp(layout.scale, min, max)
  const wanted = { x: layout.x * lid.radius, y: layout.y * lid.radius }
  for (let attempt = 0; attempt < 60; attempt++) {
    const outline = rotatedOutline(messageGeometry({ ...layout, scale }, metrics, lid.radius).outline, layout.rotation)
    const center = clampCenter({ kind: 'polygon', points: outline }, lid, wanted)
    if (center) return { ...layout, scale, x: center.x / lid.radius, y: center.y / lid.radius }
    if (scale <= min) break
    scale = Math.max(min, scale * 0.93)
  }
  return { ...layout, scale, x: 0, y: 0 }
}

/** El tamaño más grande de la letra (respecto al radio) que cabe en la tapa con el giro de ahora, para el control de tamaño. */
export function maxMessageScale(layout: MessageLayout, metrics: MessageMetrics, lid: Lid): number {
  const { min, max } = LAYOUT_BOUNDS.messageScale
  const fits = (scale: number) => {
    const outline = rotatedOutline(messageGeometry({ ...layout, scale }, metrics, lid.radius).outline, layout.rotation)
    return clampCenter({ kind: 'polygon', points: outline }, lid, { x: 0, y: 0 }) !== null
  }
  if (fits(max)) return max
  let low: number = min
  let high: number = max
  for (let i = 0; i < 30; i++) {
    const middle = (low + high) / 2
    if (fits(middle)) low = middle
    else high = middle
  }
  return low
}
