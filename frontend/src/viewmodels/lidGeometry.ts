import type { WaferLayout, WaferShape } from '../models/cakeDesignLayout.ts'

/**
 * La geometría de la tapa del último piso y de la oblea sobre ella (paso 7, regla 6.3, D55). Funciones puras, sin React ni
 * three: las usan el editor de vista superior, la vista previa y las pruebas. Todo va en centímetros, con el origen en el
 * centro de la tapa y la `y` hacia arriba (la vista superior, con el frente del pastel abajo); los giros, en grados hacia la
 * derecha. Las posiciones que se guardan van relativas al radio de la parte plana de la tapa (`radius`), sin el canto
 * redondeado del piso.
 *
 * Límite de la hoja carta: no tiene orientación (se imprime a lo largo o a lo ancho), así que una hoja cabe si su lado
 * largo no pasa del lado largo de la carta y su lado corto no pasa del lado corto; un círculo cabe por su diámetro, contra el
 * lado corto. La forma tampoco se sale de la tapa, con su giro: todas sus esquinas (o su círculo) quedan dentro.
 */

/** La tapa del último piso: redonda (`halfX` y `halfY` valen el radio) o rectangular (la mitad del largo y del ancho). */
export type Lid = {
  form: 'round' | 'rectangular'
  halfX: number
  halfY: number
  /** El radio de referencia de las posiciones relativas: el radio en redondo; en rectangular, la mitad del ancho. */
  radius: number
}

export type Point = { x: number; y: number }

/** La hoja carta que fija la pastelería (`wafer_max_width_cm` y `wafer_max_height_cm`). */
export type WaferLimits = { waferMaxWidthCm: number; waferMaxHeightCm: number }

const EPSILON = 1e-6
const toRadians = (degrees: number) => (degrees * Math.PI) / 180
/** Los lados de la hoja carta, del corto al largo, sin importar cuál es el ancho y cuál el alto. */
const letterSides = (limits: WaferLimits) => ({
  short: Math.min(limits.waferMaxWidthCm, limits.waferMaxHeightCm),
  long: Math.max(limits.waferMaxWidthCm, limits.waferMaxHeightCm),
})

/** El radio de la tapa más chica que cabe en ella: lo que un círculo no puede pasar, como diámetro. */
const inscribedRadius = (lid: Lid) => Math.min(lid.halfX, lid.halfY)

export function insideLid(lid: Lid, point: Point, tolerance = EPSILON): boolean {
  if (lid.form === 'round') return Math.hypot(point.x, point.y) <= lid.radius + tolerance
  return Math.abs(point.x) <= lid.halfX + tolerance && Math.abs(point.y) <= lid.halfY + tolerance
}

/** Las esquinas de una hoja respecto a su centro, con su giro (hacia la derecha) ya aplicado. */
export function sheetCorners(widthCm: number, heightCm: number, rotation: number): Point[] {
  const angle = -toRadians(rotation)
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const x = (sx * widthCm) / 2
    const y = (sy * heightCm) / 2
    return { x: x * cos - y * sin, y: x * sin + y * cos }
  })
}

/** Una figura que se mueve sobre la tapa: un círculo de ese radio o un polígono (las esquinas respecto a su centro). */
export type Footprint = { kind: 'circle'; r: number } | { kind: 'polygon'; points: Point[] }

export function waferFootprint(wafer: Pick<WaferLayout, 'shape' | 'widthCm' | 'heightCm' | 'rotation'>): Footprint {
  return wafer.shape === 'circle'
    ? { kind: 'circle', r: wafer.widthCm / 2 }
    : { kind: 'polygon', points: sheetCorners(wafer.widthCm, wafer.heightCm, wafer.rotation) }
}

/** Si la figura cabe en la tapa puesta en el centro. Con esto basta: si cabe en algún lugar, cabe en el centro (la figura de una oblea es simétrica). */
export function fitsCentered(footprint: Footprint, lid: Lid): boolean {
  if (footprint.kind === 'circle') return footprint.r <= inscribedRadius(lid) + EPSILON
  return footprint.points.every((point) => insideLid(lid, point))
}

/** Si la oblea respeta la hoja carta, en cualquier orientación. */
export function fitsLetter(shape: WaferShape, widthCm: number, heightCm: number, limits: WaferLimits): boolean {
  const { short, long } = letterSides(limits)
  if (shape === 'circle') return widthCm <= short + EPSILON
  return Math.max(widthCm, heightCm) <= long + EPSILON && Math.min(widthCm, heightCm) <= short + EPSILON
}

/**
 * El centro más cercano a `center` donde la figura queda dentro de la tapa, o `null` si no cabe en ningún lugar. En una
 * tapa rectangular es una caja y el resultado es exacto; en una redonda, cada punto de la figura limita el centro a un
 * círculo y se proyecta sobre todos hasta que el centro cumple con todos.
 */
export function clampCenter(footprint: Footprint, lid: Lid, center: Point): Point | null {
  if (footprint.kind === 'circle') {
    if (lid.form === 'round') {
      const room = lid.radius - footprint.r
      if (room < -EPSILON) return null
      const distance = Math.hypot(center.x, center.y)
      const scale = distance > room && distance > 0 ? Math.max(room, 0) / distance : 1
      return { x: center.x * scale, y: center.y * scale }
    }
    const room = { x: lid.halfX - footprint.r, y: lid.halfY - footprint.r }
    if (room.x < -EPSILON || room.y < -EPSILON) return null
    return { x: clamp(center.x, -room.x, room.x), y: clamp(center.y, -room.y, room.y) }
  }
  const { points } = footprint
  if (lid.form === 'rectangular') {
    const [minX, maxX] = [Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x))]
    const [minY, maxY] = [Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y))]
    const [lowX, highX, lowY, highY] = [-lid.halfX - minX, lid.halfX - maxX, -lid.halfY - minY, lid.halfY - maxY]
    if (lowX > highX + EPSILON || lowY > highY + EPSILON) return null
    return { x: clamp(center.x, lowX, Math.max(lowX, highX)), y: clamp(center.y, lowY, Math.max(lowY, highY)) }
  }
  let current = { ...center }
  for (let pass = 0; pass < 80; pass++) {
    let moved = false
    for (const point of points) {
      const dx = current.x + point.x
      const dy = current.y + point.y
      const distance = Math.hypot(dx, dy)
      if (distance > lid.radius + EPSILON / 10) {
        const scale = lid.radius / distance
        current = { x: dx * scale - point.x, y: dy * scale - point.y }
        moved = true
      }
    }
    if (!moved) break
  }
  return points.every((point) => insideLid(lid, { x: current.x + point.x, y: current.y + point.y }, 1e-4)) ? current : null
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** El mayor valor de `0` a `high` para el que `ok` se cumple, si `ok` se cumple hasta cierto punto y deja de cumplirse (bisección). */
function largest(high: number, ok: (value: number) => boolean): number {
  if (ok(high)) return high
  let [low, top] = [0, high]
  for (let i = 0; i < 40; i++) {
    const middle = (low + top) / 2
    if (ok(middle)) low = middle
    else top = middle
  }
  return low
}

/** La oblea con su tamaño recortado a la hoja carta (sin cambiar de orientación: la ancha sigue ancha). */
function cappedToLetter(layout: WaferLayout, limits: WaferLimits): [number, number] {
  const { short, long } = letterSides(limits)
  if (layout.shape === 'circle') return [Math.min(layout.widthCm, short), Math.min(layout.widthCm, short)]
  return layout.widthCm >= layout.heightCm
    ? [Math.min(layout.widthCm, long), Math.min(layout.heightCm, short)]
    : [Math.min(layout.widthCm, short), Math.min(layout.heightCm, long)]
}

/** La oblea con su tamaño, giro y posición permitidos: la hoja carta, la tapa y su lugar. Nunca cambia la forma ni el encuadre. */
export function fitWafer(layout: WaferLayout, lid: Lid, limits: WaferLimits): WaferLayout {
  const [letterW, letterH] = cappedToLetter(layout, limits)
  // Si ni centrada cabe en la tapa, se achica en la misma proporción hasta que quepa.
  const factor = largest(1, (candidate) => fitsCentered(waferFootprint({ ...layout, widthCm: letterW * candidate, heightCm: letterH * candidate }), lid))
  const [widthCm, heightCm] = [letterW * factor, letterH * factor]
  const center = clampCenter(waferFootprint({ ...layout, widthCm, heightCm }), lid, { x: layout.x * lid.radius, y: layout.y * lid.radius })
  return { ...layout, widthCm, heightCm, x: (center?.x ?? 0) / lid.radius, y: (center?.y ?? 0) / lid.radius }
}

export type WaferAxis = 'size' | 'width' | 'height'

/**
 * Lo más que puede medir la oblea en ese eje con su forma y su giro de ahora, sin pasar de la carta ni de la tapa. `size` es
 * el lado más largo con la misma proporción (en un círculo, el diámetro).
 */
export function maxWaferCm(layout: WaferLayout, lid: Lid, limits: WaferLimits, axis: WaferAxis): number {
  const ok = (widthCm: number, heightCm: number) =>
    fitsLetter(layout.shape, widthCm, heightCm, limits) && fitsCentered(waferFootprint({ ...layout, widthCm, heightCm }), lid)
  const high = letterSides(limits).long
  if (axis === 'width') return largest(high, (widthCm) => ok(widthCm, layout.heightCm))
  if (axis === 'height') return largest(high, (heightCm) => ok(layout.widthCm, heightCm))
  // Un círculo es siempre cuadrado; una hoja conserva su proporción.
  const wide = layout.widthCm >= layout.heightCm
  const [ratioW, ratioH] = layout.shape === 'circle' ? [1, 1] : wide ? [1, layout.heightCm / layout.widthCm] : [layout.widthCm / layout.heightCm, 1]
  return largest(high, (side) => ok(side * ratioW, side * ratioH))
}

/** Un acomodo de oblea nuevo: círculo de un tamaño que se vea bien en la tapa, centrado, con la imagen cubriéndolo justo. */
export function initialWafer(lid: Lid, limits: WaferLimits): WaferLayout {
  const diameter = Math.min(letterSides(limits).short, inscribedRadius(lid) * 1.2)
  return fitWafer(
    { shape: 'circle', widthCm: diameter, heightCm: diameter, rotation: 0, x: 0, y: 0, imageZoom: 1, imageX: 0, imageY: 0 },
    lid,
    limits,
  )
}

/** Cambia la forma conservando lo que se pueda: de círculo a hoja, el diámetro pasa a ser el ancho y el alto. No la ajusta a la tapa. */
export function withShape(layout: WaferLayout, shape: WaferShape): WaferLayout {
  const side = Math.max(layout.widthCm, layout.heightCm)
  return { ...layout, shape, widthCm: shape === 'circle' ? side : layout.widthCm, heightCm: shape === 'circle' ? side : layout.heightCm }
}
