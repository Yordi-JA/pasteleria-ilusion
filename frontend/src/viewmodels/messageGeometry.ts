import type { MessageLayout } from '../models/cakeDesignLayout.ts'
import { LAYOUT_BOUNDS, messageLines } from '../models/cakeDesignLayout.ts'
import { clamp, clampCenter } from './lidGeometry.ts'
import type { Lid, Point } from './lidGeometry.ts'

/**
 * La geometría del mensaje sobre la tapa (paso 7, D55): dónde queda cada letra, el contorno que ocupa y cómo se acomoda para
 * no salirse de la tapa. Funciones puras, sin React ni three: las usan el editor, la vista previa y las pruebas. Todo va en
 * centímetros con la `y` hacia arriba, como `lidGeometry.ts`; los giros, en grados hacia la derecha.
 *
 * La letra mide `scale` veces el radio de la parte plana de la tapa. El texto lleva hasta 3 renglones (`messageLines`, tanda 4),
 * cada uno centrado. Recto, los renglones se apilan a `LINE_HEIGHT` em uno del otro. En arco, cada letra se pone sobre un arco de
 * círculo; con un renglón, el arco mide lo que el texto (así no cambia de largo al curvarse) y su ángulo es `|curve|` medios
 * giros: con 1, el texto da media vuelta. Con varios, cada renglón va en su propio arco, todos con el mismo centro y a
 * `LINE_HEIGHT` em uno del otro: el radio sale del renglón que más pide, así ninguno pasa de ese ángulo. Un `curve` positivo
 * sube el texto en el centro (como un arco) y los renglones de abajo van por dentro; uno negativo lo baja y van por fuera. El
 * bloque queda centrado, también en vertical, sobre su posición.
 */

/** Lo que mide un renglón con la letra del mensaje, en em (1 em es el alto de la letra): el ancho de cada letra y el total. */
export type LineMetrics = { widths: number[]; total: number }
/** Lo que miden los renglones del mensaje (`messageLines`), en orden. */
export type MessageMetrics = { lines: LineMetrics[] }

/** El cuadro de una línea, en em: de 0.3 bajo la línea base a 0.75 arriba de ella. La línea base queda 0.225 bajo el centro. */
export const LINE_BOX = 1.05
export const BASELINE_BELOW_CENTER = 0.225
/** De una línea base a la siguiente, en em (`LINE_HEIGHT_EM` de `design_layout.py`). */
export const LINE_HEIGHT = 1.15

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
  /**
   * Los puntos del contorno de cada renglón (sin el giro ni la posición del mensaje), para revisar que cabe en la tapa. La tapa es
   * convexa, así que basta con que todos queden dentro.
   */
  outline: Point[]
  /** La caja que envuelve ese contorno, en cm: el lienzo de la textura 3D. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

/** Cuántos puntos se toman en cada orilla del texto en arco. */
const OUTLINE_STEPS = 14

export function wordCount(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/u).length
}

/** Mide un renglón sin tipografía a la mano: media letra por carácter. */
function estimatedLine(text: string): LineMetrics {
  const widths = [...text].map(() => 0.5)
  return { widths, total: widths.reduce((sum, width) => sum + width, 0) }
}

/** Mide el texto sin tipografía a la mano (pruebas o antes de cargar la letra): media letra por carácter, renglón por renglón. */
export function estimatedMetrics(text: string): MessageMetrics {
  return { lines: messageLines(text).map(estimatedLine) }
}

/** Un renglón listo para acomodar: su texto, el ancho de cada letra y el total, en cm. */
type Line = { text: string; widths: number[]; width: number }

/** Los renglones del texto con sus medidas; si las medidas no son de ese renglón (otro texto), se estiman. */
function linesOf(text: string, metrics: MessageMetrics, fontSizeCm: number): Line[] {
  const lines = messageLines(text).map((line, index): Line => {
    const measured = metrics.lines[index]
    const usable = measured && measured.widths.length === [...line].length ? measured : estimatedLine(line)
    return { text: line, widths: usable.widths.map((width) => width * fontSizeCm), width: usable.total * fontSizeCm }
  })
  // Sin texto queda una caja vacía en el centro, como antes.
  return lines.length ? lines : [{ text: '', widths: [], width: 0 }]
}

export function messageGeometry(layout: MessageLayout, metrics: MessageMetrics, radius: number): MessageGeometry {
  const fontSizeCm = layout.scale * radius
  const lines = linesOf(layout.text, metrics, fontSizeCm)
  const half = (LINE_BOX * fontSizeCm) / 2
  const step = LINE_HEIGHT * fontSizeCm
  // Cuánto sube cada renglón desde el centro del bloque: el de en medio, nada; el primero, lo más.
  const rise = (index: number) => ((lines.length - 1) / 2 - index) * step
  if (layout.arrangement !== 'arc' || lines.every((line) => line.width === 0)) {
    const glyphs = lines.map((line, index): Glyph => ({ text: line.text, x: 0, y: rise(index), rotation: 0 }))
    const outline = lines.flatMap((line, index) => {
      const [w, y] = [line.width / 2, rise(index)]
      return [
        { x: -w, y: y - half },
        { x: w, y: y - half },
        { x: w, y: y + half },
        { x: -w, y: y + half },
      ]
    })
    return { fontSizeCm, arc: false, glyphs, outline, bounds: boundsOf(outline) }
  }
  const direction = layout.curve >= 0 ? 1 : -1
  const span = Math.max(Math.abs(layout.curve), LAYOUT_BOUNDS.minArcCurve) * Math.PI
  // Los arcos comparten el centro: el de en medio tiene radio `middle` y cada renglón se aleja `rise` hacia afuera del centro
  // (con un arco positivo el centro queda abajo y el primer renglón va por fuera). `middle` es el más chico con el que ningún
  // renglón pasa del ángulo del arco; con un renglón es el de antes, el largo del texto entre el ángulo.
  const offset = (index: number) => direction * rise(index)
  const middle = Math.max(...lines.map((line, index) => (line.width > 0 ? line.width / span - offset(index) : -Infinity)))
  const radii = lines.map((_, index) => middle + offset(index))
  // El ángulo de cada renglón: su largo entre su radio (el que más pide llega justo a `span`).
  const spans = lines.map((line, index) => (line.width > 0 ? line.width / radii[index] : 0))
  // Con el centro de los arcos en el origen, un punto de un arco a ese ángulo.
  const onArc = (arcRadius: number, angle: number): Point => ({ x: arcRadius * Math.sin(angle), y: direction * arcRadius * Math.cos(angle) })
  // Se centra en vertical lo que recorren las líneas de los renglones: con un arco positivo los extremos bajan; con uno negativo, suben.
  const heights = radii.flatMap((arcRadius, index) => [direction * arcRadius, direction * arcRadius * Math.cos(spans[index] / 2)])
  const lift = -(Math.min(...heights) + Math.max(...heights)) / 2
  const glyphs = lines.flatMap((line, index) => {
    let start = -line.width / 2
    return [...line.text].map((char, position): Glyph => {
      const advance = line.widths[position]
      const angle = (start + advance / 2) / radii[index]
      start += advance
      const point = onArc(radii[index], angle)
      return { text: char, x: point.x, y: point.y + lift, rotation: (direction * (angle * 180)) / Math.PI }
    })
  })
  const outline = lines.flatMap((_, index) => {
    const along = Array.from({ length: OUTLINE_STEPS + 1 }, (__, i) => -spans[index] / 2 + (spans[index] * i) / OUTLINE_STEPS)
    const edge = (side: 1 | -1) =>
      along.map((angle): Point => {
        const point = onArc(radii[index], angle)
        return { x: point.x + side * half * direction * Math.sin(angle), y: point.y + lift + side * half * Math.cos(angle) }
      })
    return [...edge(-1), ...edge(1).reverse()]
  })
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
 * `minScale` es la letra mínima de la pastelería (tanda 2): la letra nunca baja de ahí; si así no cabe, queda centrada en el
 * mínimo y `messageFits` lo dice.
 */
export function fitMessage(layout: MessageLayout, metrics: MessageMetrics, lid: Lid, minScale = 0): MessageLayout {
  const { max } = LAYOUT_BOUNDS.messageScale
  const min = Math.min(max, Math.max(LAYOUT_BOUNDS.messageScale.min, minScale))
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

/** Si el mensaje cabe en la tapa, centrado y con su giro, con esa escala de la letra. */
export function messageFits(layout: MessageLayout, metrics: MessageMetrics, lid: Lid, scale: number): boolean {
  const outline = rotatedOutline(messageGeometry({ ...layout, scale }, metrics, lid.radius).outline, layout.rotation)
  return clampCenter({ kind: 'polygon', points: outline }, lid, { x: 0, y: 0 }) !== null
}

/** El tamaño más grande de la letra (respecto al radio) que cabe en la tapa con el giro de ahora, para el control de tamaño. */
export function maxMessageScale(layout: MessageLayout, metrics: MessageMetrics, lid: Lid): number {
  const { min, max } = LAYOUT_BOUNDS.messageScale
  const fits = (scale: number) => messageFits(layout, metrics, lid, scale)
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
