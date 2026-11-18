import { BufferAttribute, BufferGeometry, Color, Shape, SRGBColorSpace } from 'three'
import type { CakeSpread } from './cakeShape.ts'
import { seededRandom } from './seededRandom.ts'

/**
 * La crema untada a mano entre el pan (tanda 4, parte 2): la crema pastelera no se barre perfecta, así que su franja se ve con
 * curvas. Su costado es una malla propia, armada una vez por capa, que sigue el contorno del pan (círculo o el rectángulo de
 * esquinas redondas de la losa):
 *
 * - las orillas de arriba y de abajo pasan un poco sobre el pan con unas pocas ondas suaves (frecuencias enteras, así cierran
 *   la vuelta), y con ellas el grueso cambia alrededor del pastel;
 * - en medio se abomba hacia afuera, más en unos lados que en otros;
 * - en las orillas queda apenas dentro del pan (`SPREAD_INSET`), así sale del pan con un ángulo claro y sin parpadeo.
 *
 * La franja de la capa no cambia: la crema la cubre toda y solo se asoma sobre el pan de junto, sin llegar a la tapa ni a la base
 * del piso, así que el alto del pastel, los pisos y la tapa quedan igual. Todo sale de una semilla por capa: el pastel no cambia
 * entre renders. Sin React; three solo para armar la malla.
 */

/**
 * Cuánto se abomba (`bulge`) y cuánto pasan las orillas sobre el pan (`edge`), en unidades de escena, por nivel: la crema
 * pastelera untada a mano, y la mermelada, la cajeta y las cremas con trozos, apenas (sus trozos tienen que seguir asomando).
 */
export const SPREAD_LEVELS: Record<CakeSpread, { bulge: readonly [number, number]; edge: readonly [number, number] }> = {
  cream: { bulge: [0.006, 0.02], edge: [0.003, 0.024] },
  mild: { bulge: [0.002, 0.007], edge: [0.002, 0.007] },
}
/** Cuánto queda la orilla dentro del pan. */
export const SPREAD_INSET = 0.003

/** Esquinas redondeadas del molde rectangular (la losa del pan y la crema comparten el contorno). */
export const RECT_CORNER = 0.08

/** Una onda suave alrededor del pastel, de 0 a 1: unas pocas senoides de frecuencia entera con fase y peso al azar. */
function wave(random: () => number): (phi: number) => number {
  // De 3 a 7 ondas por vuelta: en la mitad que se ve caben unas pocas, sin parecer ruido.
  const frequencies = [3, 4, 5, 6, 7]
  const terms = Array.from({ length: 3 }, () => {
    const [frequency] = frequencies.splice(Math.floor(random() * frequencies.length), 1)
    return { frequency, phase: random() * Math.PI * 2, weight: 0.5 + random() * 0.5 }
  })
  const total = terms.reduce((sum, term) => sum + term.weight, 0)
  return (phi) => 0.5 + (0.5 * terms.reduce((sum, term) => sum + term.weight * Math.sin(term.frequency * phi + term.phase), 0)) / total
}

/** El untado de una capa: cuánto se abomba y cuánto pasa sobre el pan abajo y arriba, según el ángulo alrededor del piso. */
export type SpreadShape = {
  bulge: (phi: number) => number
  below: (phi: number) => number
  above: (phi: number) => number
}

export function spreadShape(level: CakeSpread, seed: number): SpreadShape {
  const random = seededRandom(seed * 7919 + 17)
  const { bulge, edge } = SPREAD_LEVELS[level]
  const between = ([low, high]: readonly [number, number], at: (phi: number) => number) => (phi: number) => low + (high - low) * at(phi)
  return { bulge: between(bulge, wave(random)), below: between(edge, wave(random)), above: between(edge, wave(random)) }
}

/**
 * Lo que sale la crema del contorno del pan a la altura `y` (desde el pie de su franja, de alto `height`) y en el ángulo `phi`
 * (`atan2(x, z)`, como el cilindro de three): negativo es dentro del pan.
 */
export function spreadOffset(shape: SpreadShape, phi: number, y: number, height: number): number {
  const low = -shape.below(phi)
  const high = height + shape.above(phi)
  if (y <= low || y >= high) return -SPREAD_INSET
  return -SPREAD_INSET + (shape.bulge(phi) + SPREAD_INSET) * Math.sin((Math.PI * (y - low)) / (high - low))
}

/** Un punto del contorno del pan y su normal hacia afuera, en el plano del piso (x, z). */
export type OutlinePoint = { x: number; z: number; nx: number; nz: number }

/** El contorno de un piso redondo, como `CylinderGeometry` (x = sen θ, z = cos θ). */
export function roundOutline(radius: number, count = 96): OutlinePoint[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2
    return { x: Math.sin(a) * radius, z: Math.cos(a) * radius, nx: Math.sin(a), nz: Math.cos(a) }
  })
}

type Split = 'whole' | 'left' | 'right'

/** La losa rectangular con las esquinas de afuera redondeadas, en el plano (x, y) de `Shape`; `split` dice qué mitad (o toda). */
export function rectShape(halfW: number, halfD: number, split: Split): Shape {
  const x0 = split === 'right' ? 0 : -halfW
  const x1 = split === 'left' ? 0 : halfW
  const left = split === 'right' ? 0 : RECT_CORNER
  const right = split === 'left' ? 0 : RECT_CORNER
  const shape = new Shape()
  shape.moveTo(x0 + left, -halfD)
  shape.lineTo(x1 - right, -halfD)
  shape.quadraticCurveTo(x1, -halfD, x1, -halfD + right)
  shape.lineTo(x1, halfD - right)
  shape.quadraticCurveTo(x1, halfD, x1 - right, halfD)
  shape.lineTo(x0 + left, halfD)
  shape.quadraticCurveTo(x0, halfD, x0, halfD - left)
  shape.lineTo(x0, -halfD + left)
  shape.quadraticCurveTo(x0, -halfD, x0 + left, -halfD)
  return shape
}

/**
 * El contorno de un piso rectangular, el mismo de la losa del pan: puntos a la misma distancia (así las esquinas llevan los
 * suyos). La losa se gira para crecer hacia arriba, y la `y` de `Shape` queda como `-z` de la escena.
 */
export function rectOutline(halfW: number, halfD: number): OutlinePoint[] {
  const perimeter = 4 * (halfW + halfD)
  const count = Math.min(320, Math.max(120, Math.round(perimeter / 0.03)))
  const points = rectShape(halfW, halfD, 'whole')
    .getSpacedPoints(count)
    .slice(0, count)
    .map((point) => ({ x: point.x, z: -point.y }))
  return points.map((point, i) => {
    const before = points[(i - 1 + count) % count]
    const after = points[(i + 1) % count]
    // La normal es la tangente girada; el contorno es convexo y centrado, así que la de afuera se aleja del centro.
    let [nx, nz] = [after.z - before.z, -(after.x - before.x)]
    const length = Math.hypot(nx, nz) || 1
    ;[nx, nz] = [nx / length, nz / length]
    if (nx * point.x + nz * point.z < 0) [nx, nz] = [-nx, -nz]
    return { ...point, nx, nz }
  })
}

/** Anillos de vértices de abajo hacia arriba: bastan para la curva del abombado en una franja delgada. */
const RINGS = 9

/**
 * Cuánto del color del relleno toma la crema pastelera que toca una mermelada o una cajeta (tanda 4): `near` junto al relleno y
 * `far` del lado del pan. Poco, para que se siga viendo crema (pálida, opaca y mate); el brillo es solo del relleno.
 */
export const CREAM_TINT = { near: 0.34, far: 0.12 }

/** Los canales de un `#rrggbb`, de 0 a 1. */
function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
}

/** La crema con `amount` del color del relleno, en sRGB de 0 a 1: la misma mezcla que `resolveColor` de la paleta. */
export function tintedCream(cream: string, flavor: string, amount: number): [number, number, number] {
  const [base, toward] = [channels(cream), channels(flavor)]
  return base.map((value, i) => value + (toward[i] - value) * amount) as [number, number, number]
}

/**
 * El tinte de una capa untada, ya resuelto a `#rrggbb`: el color de la crema (el de su material), el del relleno de cada mitad
 * (`null` sin tinte), de qué lado de x queda la primera mitad (`1`, x positiva, en el cilindro redondo; `-1` en la losa) y de qué
 * lado está el relleno.
 */
export type SpreadTint = {
  cream: string
  colors: readonly (string | null)[]
  firstHalf: 1 | -1
  toward: 'above' | 'below'
}

/**
 * Los colores por vértice del tinte: lo que multiplica el color del material (la crema) para dar la crema teñida, en el espacio
 * lineal en que three los usa. Una mitad sin tinte queda en 1, sin cambio.
 */
function tintColors(tint: SpreadTint, outline: readonly OutlinePoint[], columns: number, levels: readonly number[]): Float32Array {
  const linear = (rgb: readonly number[]) => new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace)
  const cream = linear(channels(tint.cream))
  const colors = new Float32Array(columns * levels.length * 3).fill(1)
  for (let i = 0; i < columns; i++) {
    const point = outline[i % outline.length]
    const half = tint.colors.length === 2 && Math.sign(point.x) === -tint.firstHalf ? 1 : 0
    const flavor = tint.colors[half]
    if (!flavor) continue
    levels.forEach((level, j) => {
      const near = tint.toward === 'above' ? level : 1 - level
      const mixed = linear(tintedCream(tint.cream, flavor, CREAM_TINT.far + (CREAM_TINT.near - CREAM_TINT.far) * near))
      colors.set([mixed.r / cream.r, mixed.g / cream.g, mixed.b / cream.b], (i * levels.length + j) * 3)
    })
  }
  return colors
}

/**
 * El costado untado de una capa de alto `height`, con el pie de su franja en `y = 0`. Las coordenadas de textura van en unidades
 * de escena (el largo del contorno y la altura), como la losa rectangular. Sin tapas: las orillas quedan dentro del pan. Con
 * `tint`, lleva colores por vértice (`color`) con la crema teñida por el relleno.
 */
export function spreadGeometry(outline: readonly OutlinePoint[], height: number, shape: SpreadShape, tint?: SpreadTint): BufferGeometry {
  const columns = outline.length + 1
  const positions = new Float32Array(columns * RINGS * 3)
  const uvs = new Float32Array(columns * RINGS * 2)
  let along = 0
  for (let i = 0; i < columns; i++) {
    const point = outline[i % outline.length]
    if (i > 0) {
      const previous = outline[i - 1]
      along += Math.hypot(point.x - previous.x, point.z - previous.z)
    }
    const phi = Math.atan2(point.x, point.z)
    const low = -shape.below(phi)
    const high = height + shape.above(phi)
    for (let j = 0; j < RINGS; j++) {
      const y = low + ((high - low) * j) / (RINGS - 1)
      // Las orillas, justo en `low` y `high`, caen dentro del pan.
      const offset = spreadOffset(shape, phi, Math.min(high, Math.max(low, y)), height)
      const at = i * RINGS + j
      positions.set([point.x + point.nx * offset, y, point.z + point.nz * offset], at * 3)
      uvs.set([along, y], at * 2)
    }
  }
  const indices: number[] = []
  for (let i = 0; i < columns - 1; i++) {
    for (let j = 0; j < RINGS - 1; j++) {
      const [a, b] = [i * RINGS + j, (i + 1) * RINGS + j]
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  if (tint) {
    // Cada anillo va a la misma fracción de su franja en toda la vuelta: de 0 (la orilla de abajo) a 1 (la de arriba).
    const levels = Array.from({ length: RINGS }, (_, j) => j / (RINGS - 1))
    geometry.setAttribute('color', new BufferAttribute(tintColors(tint, outline, columns, levels), 3))
  }
  // El sentido de las caras depende del sentido del contorno: se mira la primera y, si apunta hacia adentro, se voltean todas.
  const [ax, , az] = [positions[0], positions[1], positions[2]]
  const [bx, by, bz] = [positions[RINGS * 3], positions[RINGS * 3 + 1], positions[RINGS * 3 + 2]]
  const [cx, cy, cz] = [positions[3], positions[4], positions[5]]
  const [ux, uy, uz] = [bx - ax, by - positions[1], bz - az]
  const [vx, vy, vz] = [cx - ax, cy - positions[1], cz - az]
  const [fx, fz] = [uy * vz - uz * vy, ux * vy - uy * vx]
  if (fx * outline[0].nx + fz * outline[0].nz < 0) {
    for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]]
  }
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  // La costura (la primera y la última columna son el mismo lugar) lleva la normal promedio de los dos lados.
  const normal = geometry.getAttribute('normal')
  for (let j = 0; j < RINGS; j++) {
    const [first, last] = [j, (columns - 1) * RINGS + j]
    const average = [0, 1, 2].map((c) => (normal.getComponent(first, c) + normal.getComponent(last, c)) / 2)
    const length = Math.hypot(...average) || 1
    for (const at of [first, last]) normal.setXYZ(at, average[0] / length, average[1] / length, average[2] / length)
  }
  return geometry
}
