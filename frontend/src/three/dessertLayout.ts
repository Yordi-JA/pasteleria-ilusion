import { BOARD, PLATE_GAP } from './cakeMetrics.ts'
import type { Circle, Content } from './cakeMetrics.ts'
import type { ShapeColor } from './cakeShape.ts'
import type { DessertKind, DessertShape, FlanShape, MiniTartShape, MosaicCupShape } from './dessertShape.ts'
import { MeshBuilder, pieceTriangles } from './fruit.ts'
import type { FruitLayout, FruitMesh, FruitPiece, FruitPlacement } from './fruit.ts'
import { resolveColor } from './palette.ts'
import { TRIANGLE_BUDGET } from './pieceBudget.ts'
import { boardProfile } from './sampleDetails.ts'
import { seededRandom } from './seededRandom.ts'

/**
 * Las medidas y la geometría de los postres (D95), sin React ni three: los perfiles que `DessertModel.tsx` gira con un torno, las
 * mallas con colores por vértice (la masa festoneada de la tarta, el caramelo que escurre y el charco), dónde va cada cubo de
 * gelatina y cada pieza de fruta, desde dónde se ve cada postre y lo que ocupa para el encuadre (`cakeMetrics.ts`). Todo va en cm: el
 * modelo escala el grupo con `unitsPerCm`; la charola del flan es la de los pasteles, en unidades de escena. Las medidas las tomé de las fotos de la pastelería (`assets/Catalogo/`), con la tapa del vaso,
 * la tarta y el flan de tamaño individual. Lo que se reparte sale de una semilla fija: el mismo postre da siempre lo mismo.
 */

type Vec3 = [number, number, number]
type RGB = [number, number, number]
/** Un punto de un perfil de torno: radio y altura, en cm. */
export type ProfilePoint = [number, number]

/** Segmentos alrededor de cada torno: redondo de cerca sin pasarse de triángulos. */
export const LATHE_SEGMENTS = 72

const lerp = (from: number, to: number, t: number) => from + (to - from) * t

function rgb(color: ShapeColor): RGB {
  const hex = resolveColor(color)
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB
}
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/** Triángulos de un torno de `points` puntos. */
const latheTriangles = (points: number) => (points - 1) * LATHE_SEGMENTS * 2

// ---------------------------------------------------------------------------------------------------------------------------
// Gelatina mosaico en vaso

/** El vaso de 10 oz de la foto: 5.6 cm de fondo, 7.8 cm de boca y 9.2 cm de alto, con la tapa plana encima. */
export const MOSAIC_CUP = { bottomRadius: 2.8, topRadius: 3.9, height: 9.2, lidRadius: 4.15, lidTop: 9.55, fill: 8.75 } as const

/** Lo de abajo de la tapa: el escalón de la cara plana. Ningún cubo llega aquí. */
export const LID_UNDERSIDE = MOSAIC_CUP.lidTop - 0.12

/**
 * Lo que comparten todos los vasos de cubos: la capa translúcida pegada al vaso (`skin`, en cm de la pared), lo que cualquier esquina de
 * un cubo se separa de la pared (`clear`), y lo más bajo (`bottom`, sobre el fondo) y lo más alto (`ceiling`, bajo la tapa) a lo que
 * llega una esquina.
 */
const MOSAIC_CUBES = { skin: 0.05, clear: 0.07, bottom: 0.3, ceiling: MOSAIC_CUP.fill + 0.3 } as const

export type MosaicStyle = NonNullable<MosaicCupShape['style']>

/**
 * Cómo es cada estilo de vaso. Los cubos caen como en una gelatina de verdad: cada uno con su giro en los tres ejes, a distintas
 * alturas, ángulos y profundidades (`depth`, cuánto más adentro de la pared), de tamaños parecidos pero no iguales (`size` ±
 * `sizeJitter`), repartidos por `slots` franjas de altura barajadas, y `top` asomando por arriba; nunca se enciman (`spacing`). La base
 * es un núcleo opaco a `core` de la pared, del que asoman los cubos, y una o más capas translúcidas (`liquid`: a cuántos cm de la pared
 * y con qué opacidad), de afuera hacia adentro: un cubo detrás de dos capas se ve más velado que uno pegado al vaso. `tries` es
 * cuántos lugares se prueban para un cubo antes de dejarlo fuera. `veil` es
 * cuánto se mezcla el color de cada cubo con el de la base (de menos a más, más abajo): el cubo se ve envuelto por el líquido; sin
 * él, el cubo conserva su color. `cream` da la forma y el brillo de la base.
 *
 * - `solid`, la gelatina mosaico (amarilla): cubos grandes que asoman de una gelatina firme con ondas entre ellos.
 * - `creamy`, crema o yogurt: cubos del mismo tamaño que en la gelatina firme, acomodados hasta más adentro (`bed`), en un líquido
 *   espeso y opaco con el mismo cuerpo de la gelatina firme (panza, cara de arriba abombada con menisco, brillo y sombreado) a 0.62 cm, como ella,
 *   de la pared, con una capa translúcida del mismo líquido pegada al vaso: los cubos de junto al plástico asoman envueltos y los de
 *   más adentro quedan hundidos en él, como en un vaso de verdad. Un líquido semitransparente para ver los de adentro volvía gris el
 *   verde (mezclar rosa sobre verde lo apaga), así que no se usa. Con cubos de 1.4 cm girados al azar el vaso se
 *   llena pronto (29 contra 26 de la gelatina firme; en todo el volumen, con un líquido transparente, 33): no caben muchos más.
 */
const MOSAIC_STYLES: Record<
  MosaicStyle,
  {
    size: number
    sizeJitter: number
    slots: number
    top: number
    depth: number
    core: number
    spacing: number
    tries: number
    veil: readonly [number, number] | null
    liquid: readonly { inset: number; opacity: number }[]
    cream: { bump: number; belly: number; dome: number; meniscus: number; roughness: number; sheen: number }
    /**
     * Hasta qué profundidad (en cm de la pared) puede quedar el centro de un cubo, más allá de lo que alcanza a asomar: el acomodo de los
     * cubos. Va aparte de `core`, donde está la base: así la base cambia sin mover los cubos.
     */
    bed: number
  }
> = {
  solid: {
    size: 1.4,
    sizeJitter: 0.22,
    slots: 70,
    top: 4,
    depth: 0.55,
    core: 0.62,
    spacing: 0.08,
    tries: 24,
    bed: 0.62,
    veil: null,
    liquid: [{ inset: MOSAIC_CUBES.skin, opacity: 0.14 }],
    cream: { bump: 0.1, belly: 0.05, dome: 0.13, meniscus: 0.08, roughness: 0.3, sheen: 0.7 },
  },
  creamy: {
    size: 1.4,
    sizeJitter: 0.22,
    slots: 420,
    top: 4,
    depth: 2.0,
    core: 0.62,
    spacing: 0.03,
    tries: 40,
    bed: 1.5,
    veil: [0.25, 0.45],
    liquid: [{ inset: MOSAIC_CUBES.skin, opacity: 0.3 }],
    cream: { bump: 0, belly: 0.05, dome: 0.13, meniscus: 0.08, roughness: 0.34, sheen: 0.55 },
  },
}

/** Cómo es el vaso de ese estilo. */
export const mosaicLook = (shape: Pick<MosaicCupShape, 'style'>) => MOSAIC_STYLES[shape.style ?? 'solid']

/** El radio de la pared del vaso a esa altura (sin las estrías). */
export const cupRadius = (y: number) => lerp(MOSAIC_CUP.bottomRadius, MOSAIC_CUP.topRadius, Math.min(1, Math.max(0, y / MOSAIC_CUP.height)))

/**
 * El vaso: el fondo, la pared con las estrías horizontales de la foto (cada 3.2 mm, de 0.8 a 7.4 cm) y el borde enrollado de la
 * boca. Es una sola superficie delgada: el material es transparente y de dos caras.
 */
export function cupProfile(): ProfilePoint[] {
  const points: ProfilePoint[] = [[0, 0], [MOSAIC_CUP.bottomRadius - 0.15, 0], [MOSAIC_CUP.bottomRadius, 0.12]]
  for (let y = 0.4; y < MOSAIC_CUP.height - 0.1; y += 0.16) {
    const ridged = y > 0.8 && y < 7.4 && Math.round(y / 0.16) % 2 === 0
    points.push([cupRadius(y) + (ridged ? 0.035 : 0), y])
  }
  points.push([MOSAIC_CUP.topRadius, MOSAIC_CUP.height], [MOSAIC_CUP.topRadius + 0.1, MOSAIC_CUP.height + 0.05], [MOSAIC_CUP.topRadius + 0.05, MOSAIC_CUP.height + 0.12])
  return points
}

/** La tapa: la falda que abraza la boca, la orilla y la cara plana con un escalón. */
export function lidProfile(): ProfilePoint[] {
  const { lidRadius, lidTop, height } = MOSAIC_CUP
  return [
    [lidRadius - 0.04, height - 0.65],
    [lidRadius, height - 0.6],
    [lidRadius + 0.03, lidTop - 0.1],
    [lidRadius - 0.08, lidTop],
    [lidRadius - 0.55, lidTop],
    [lidRadius - 0.75, lidTop - 0.12],
    [0, lidTop - 0.12],
  ]
}

/**
 * La base del vaso, a `core` de la pared (los cubos asoman de ella). En la gelatina firme no es un torno liso: el costado se abulta
 * apenas entre los cubos (ondas suaves sin filas, de hasta `cream.bump`), con una panza leve a media altura, y junto a cada cubo la
 * onda se apaga (`calm`, en cm desde su superficie), así la gelatina lisa corta el cubo sin mordidas raras. En la crema o el yogurt el
 * costado es liso. La cara de arriba se abomba al centro y sube junto al vaso, como el menisco contra el plástico. El color sale de la
 * base (`shape.base`): más claro arriba al centro, donde le da la luz, y más cálido hacia la orilla y hacia abajo. Las normales salen de
 * la forma (`MeshBuilder`), así las ondas se sombrean solas.
 */
const MOSAIC_CREAM = { columns: 144, rows: 54, topRings: 12, calm: 0.35, light: 0.3, warm: 0.12 } as const

/** La distancia de un punto a la superficie de un cubo colocado, en cm (0 si el punto está dentro). */
function distanceToCube(point: Vec3, cube: CubePlacement): number {
  const r = rotationMatrix(cube.rotation)
  const d: Vec3 = [point[0] - cube.p[0], point[1] - cube.p[1], point[2] - cube.p[2]]
  const half = cube.size / 2
  // A las coordenadas del cubo con la transpuesta del giro; lo que sale de la caja en cada eje.
  const outside = [0, 1, 2].map((j) => Math.max(0, Math.abs(r[0][j] * d[0] + r[1][j] * d[1] + r[2][j] * d[2]) - half))
  return Math.hypot(...outside)
}

/** Lo que se abulta la base en ese ángulo y esa altura, de -1 a 1: ondas que se cruzan, sin filas ni columnas. */
const creamWave = (angle: number, y: number) =>
  (Math.sin(3 * angle + 1.3 * y) + 0.6 * Math.sin(5 * angle - 2.1 * y + 0.7) + 0.4 * Math.sin(7 * angle + 0.9 * y + 2.1)) / 2

export function mosaicCream(shape: Pick<MosaicCupShape, 'base' | 'cubes' | 'style'>): FruitMesh {
  const mesh = new MeshBuilder()
  const look = mosaicLook(shape)
  const { bump, belly, dome, meniscus } = look.cream
  // Los cubos solo hacen falta para apagar las ondas junto a ellos.
  const cubes = bump > 0 ? mosaicCubes(shape) : []
  // Cuánto de la onda queda en un punto: nada junto a un cubo y toda a `calm` o más de él.
  const calmness = (point: Vec3) => {
    const nearest = cubes.reduce((closest, cube) => Math.min(closest, distanceToCube(point, cube)), Infinity)
    const t = Math.min(1, nearest / MOSAIC_CREAM.calm)
    return t * t * (3 - 2 * t)
  }
  const { fill } = MOSAIC_CUP
  const { columns, rows, topRings } = MOSAIC_CREAM
  const base = rgb(shape.base)
  const light = rgb({ mix: [shape.base, 'betun'], amount: MOSAIC_CREAM.light })
  const warm = rgb({ mix: [shape.base, 'mermelada'], amount: MOSAIC_CREAM.warm })
  const angles = Array.from({ length: columns }, (_, j) => (j / columns) * Math.PI * 2)
  const sideTop = fill - 0.15
  // El radio del costado: el de la base, con la panza y las ondas (apagadas junto a los cubos); nunca llega a la capa translúcida.
  const sideRadius = (angle: number, y: number) => {
    const smooth = cupRadius(y) - look.core + belly * Math.sin((Math.PI * y) / fill)
    const wave = bump > 0 ? bump * creamWave(angle, y) * calmness([Math.cos(angle) * smooth, y, Math.sin(angle) * smooth]) : 0
    return Math.min(smooth + wave, cupRadius(y) - MOSAIC_CUBES.skin - 0.1)
  }
  // El costado, de abajo hacia arriba: más cálido abajo; las ondas que salen se aclaran apenas.
  const sideRows: Vec3[][] = []
  const sideTones: RGB[][] = []
  for (let i = 0; i <= rows; i++) {
    const y = 0.1 + (i / rows) * (sideTop - 0.1)
    const warmth = 0.75 * (1 - y / fill) ** 1.5
    sideRows.push(angles.map((a): Vec3 => [Math.cos(a) * sideRadius(a, y), y, Math.sin(a) * sideRadius(a, y)]))
    sideTones.push(angles.map((a) => mixRgb(mixRgb(base, warm, warmth), light, bump > 0 ? Math.max(0, creamWave(a, y)) * 0.25 : 0)))
  }
  mesh.grid(sideRows, sideTones, true)
  // La cara de arriba, de la orilla (s = 1) al centro (s = 0): sube contra el vaso (menisco), baja un poco y se abomba al centro.
  const topRows: Vec3[][] = []
  const topTones: RGB[][] = []
  for (let k = 0; k <= topRings; k++) {
    const s = 1 - k / topRings
    const y = fill + dome * (1 - s * s) + meniscus * Math.exp(-(((1 - s) / 0.09) ** 2))
    topRows.push(angles.map((a): Vec3 => {
      const r = sideRadius(a, sideTop) * s
      return [Math.cos(a) * r, y, Math.sin(a) * r]
    }))
    topTones.push(angles.map(() => mixRgb(mixRgb(base, warm, 0.35 * s ** 3), light, (1 - s) ** 1.5)))
  }
  // De lo alto del costado sube a la orilla de arriba (el menisco contra el vaso) y sigue hasta el centro.
  mesh.grid([sideRows[sideRows.length - 1], ...topRows], [sideTones[sideTones.length - 1], ...topTones], true)
  // El fondo cerrado.
  const bottom = sideRows[0].map((point) => mesh.vertex(point, warm))
  mesh.fan(mesh.vertex([0, 0.1, 0], warm), [...bottom].reverse())
  return mesh.build()
}

/**
 * Una capa translúcida del vaso, a `inset` cm de la pared, del fondo a la cara de arriba de la base: lo que queda detrás de ella se ve a
 * través de ella, teñido. Es abierta por dentro (la cara de arriba de la base queda a la vista).
 */
export function mosaicSkinProfile(shape: Pick<MosaicCupShape, 'style'>, inset: number): ProfilePoint[] {
  const { core } = mosaicLook(shape)
  const skin = (y: number) => cupRadius(y) - inset
  const { fill } = MOSAIC_CUP
  return [[cupRadius(0.1) - core, 0.1], [skin(0.1) - 0.05, 0.1], [skin(0.2), 0.2], [skin(fill - 0.1), fill - 0.1], [skin(fill) - 0.1, fill], [cupRadius(fill) - core - 0.12, fill]]
}

/**
 * Un cubo de gelatina colocado: el centro en cm, su arista, cuál de los colores lleva, cuánto lo envuelve el color de la base (`veil`,
 * de 0 a 1; 0 en la gelatina firme) y su giro en radianes como ángulos de Euler en el orden `YZX` de three (primero gira sobre `x`,
 * luego se ladea sobre `z` y al final se orienta sobre `y`).
 */
export type CubePlacement = { p: Vec3; rotation: Vec3; size: number; color: number; veil: number }

/** El orden de los ángulos de `CubePlacement.rotation`. */
export const CUBE_ROTATION_ORDER = 'YZX'

type Mat3 = [Vec3, Vec3, Vec3]
const multiply = (a: Mat3, b: Mat3): Mat3 =>
  a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j])) as Mat3

/** La matriz del giro de un cubo: `Ry · Rz · Rx`, como el orden `YZX` de three. */
function rotationMatrix([x, y, z]: Vec3): Mat3 {
  const rx: Mat3 = [[1, 0, 0], [0, Math.cos(x), -Math.sin(x)], [0, Math.sin(x), Math.cos(x)]]
  const ry: Mat3 = [[Math.cos(y), 0, Math.sin(y)], [0, 1, 0], [-Math.sin(y), 0, Math.cos(y)]]
  const rz: Mat3 = [[Math.cos(z), -Math.sin(z), 0], [Math.sin(z), Math.cos(z), 0], [0, 0, 1]]
  return multiply(multiply(ry, rz), rx)
}

/** Las 8 esquinas de un cubo colocado, en cm. */
export function cubeCorners(cube: CubePlacement): Vec3[] {
  const r = rotationMatrix(cube.rotation)
  const half = cube.size / 2
  const corners: Vec3[] = []
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const local: Vec3 = [sx * half, sy * half, sz * half]
    corners.push([0, 1, 2].map((i) => cube.p[i] + r[i][0] * local[0] + r[i][1] * local[1] + r[i][2] * local[2]) as Vec3)
  }
  return corners
}

/**
 * Mete el cubo en el vaso: lo acerca al eje hasta que ninguna esquina pase de la pared (menos `clear`), medida a la altura de cada
 * esquina (el vaso se angosta hacia abajo), y lo sube o lo baja hasta que quede entre el fondo y `ceiling`. Mide las esquinas de verdad,
 * con su giro, así un cubo ladeado tampoco atraviesa el vaso ni llega a la tapa.
 */
function contain(cube: CubePlacement): CubePlacement {
  let [x, y, z] = cube.p
  for (let pass = 0; pass < 16; pass++) {
    const corners = cubeCorners({ ...cube, p: [x, y, z] })
    const out = Math.max(...corners.map(([cx, cy, cz]) => Math.hypot(cx, cz) - (cupRadius(cy) - MOSAIC_CUBES.clear)))
    const above = Math.max(...corners.map((corner) => corner[1])) - MOSAIC_CUBES.ceiling
    const below = MOSAIC_CUBES.bottom - Math.min(...corners.map((corner) => corner[1]))
    if (out <= 0 && above <= 0 && below <= 0) break
    if (above > 0) y -= above + 0.01
    else if (below > 0) y += below + 0.01
    if (out > 0) {
      const radius = Math.hypot(x, z)
      const [dx, dz] = radius > 1e-6 ? [x / radius, z / radius] : [1, 0]
      x -= dx * (out + 0.01)
      z -= dz * (out + 0.01)
    }
  }
  return { ...cube, p: [x, y, z] }
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * Si dos cubos se tocan o quedan a menos de `spacing` cm: la prueba del eje separador de dos cajas orientadas (los 3 ejes de cada cubo
 * y sus 9 productos cruz). Si en algún eje sus sombras quedan separadas por más de `spacing`, no se tocan.
 */
export function cubesOverlap(a: CubePlacement, b: CubePlacement, spacing = 0): boolean {
  const d: Vec3 = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]]
  // Lejos de verdad: más que la suma de sus medias diagonales.
  if (Math.hypot(...d) > ((a.size + b.size) * Math.sqrt(3)) / 2 + spacing) return false
  const ra = rotationMatrix(a.rotation)
  const rb = rotationMatrix(b.rotation)
  const axesA = [0, 1, 2].map((i): Vec3 => [ra[0][i], ra[1][i], ra[2][i]])
  const axesB = [0, 1, 2].map((i): Vec3 => [rb[0][i], rb[1][i], rb[2][i]])
  const candidates = [...axesA, ...axesB, ...axesA.flatMap((u) => axesB.map((v) => cross(u, v)))]
  for (const axis of candidates) {
    const length = Math.hypot(...axis)
    if (length < 1e-6) continue
    const n: Vec3 = [axis[0] / length, axis[1] / length, axis[2] / length]
    const reachA = (a.size / 2) * axesA.reduce((sum, u) => sum + Math.abs(dot(u, n)), 0)
    const reachB = (b.size / 2) * axesB.reduce((sum, v) => sum + Math.abs(dot(v, n)), 0)
    if (Math.abs(dot(d, n)) > reachA + reachB + spacing) return false
  }
  return true
}

/**
 * Los cubos del vaso, repartidos sin patrón: cada lugar tiene su franja de altura (así llenan el vaso parejo de abajo hacia arriba) y,
 * dentro de ella, una altura, un ángulo, una profundidad, un tamaño y un giro al azar con semilla. Cada lugar se prueba `tries` veces:
 * el cubo entra si no atraviesa el vaso (`contain`, con sus 8 esquinas ya giradas) y no se encima con ninguno de los que ya están
 * (`cubesOverlap` con `spacing`); si ninguno sirve, se queda fuera. Unos cuantos asoman por arriba. Los colores se reparten parejos y
 * revueltos (un color repetido en `cubes` sale más veces). En la crema o el yogurt cada cubo lleva su velo del color de la base, al azar
 * dentro de `veil` y más fuerte hacia abajo, donde el líquido es más espeso.
 */
export function mosaicCubes(shape: Pick<MosaicCupShape, 'cubes' | 'style'>): CubePlacement[] {
  const colors = shape.cubes.length
  if (colors === 0) return []
  const look = mosaicLook(shape)
  const random = seededRandom(20261120)
  const { slots, top, size: edge, sizeJitter, spacing, depth, veil, tries } = look
  const order = Array.from({ length: slots + top }, (_, i) => i % colors)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const placed: CubePlacement[] = []
  const fits = (cube: CubePlacement) => !placed.some((other) => cubesOverlap(cube, other, spacing))
  const size = () => edge * (1 + (random() * 2 - 1) * sizeJitter)
  // Un giro cualquiera en los tres ejes.
  const turn = (): Vec3 => [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2]
  // Mitad al azar y mitad por la altura: más velo abajo.
  const veilAt = (y: number) => (veil ? veil[0] + (veil[1] - veil[0]) * (0.5 * random() + 0.5 * (1 - y / MOSAIC_CUP.fill)) : 0)
  const band = (MOSAIC_CUP.fill - MOSAIC_CUBES.bottom) / slots
  // Las franjas en otro orden: el acomodo no crece de abajo hacia arriba, así los últimos lugares no quedan todos arriba.
  const bands = Array.from({ length: slots }, (_, i) => i)
  for (let i = bands.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[bands[i], bands[j]] = [bands[j], bands[i]]
  }
  for (const k of bands) {
    for (let attempt = 0; attempt < tries; attempt++) {
      const s = size()
      const y = MOSAIC_CUBES.bottom + (k + random()) * band
      const angle = random() * Math.PI * 2
      // Empieza contra la pared y se mete al azar: `contain` lo deja dentro del vaso.
      const radius = cupRadius(y) - random() * depth
      const cube = contain({ p: [Math.cos(angle) * radius, y, Math.sin(angle) * radius], rotation: turn(), size: s, color: order[placed.length], veil: 0 })
      // Uno que `contain` metió de más (más allá de su lecho) ya no se vería: se prueba otro lugar.
      if (Math.hypot(cube.p[0], cube.p[2]) < cupRadius(cube.p[1]) - look.bed - s * 0.3) continue
      if (fits(cube)) {
        placed.push({ ...cube, veil: veilAt(cube.p[1]) })
        break
      }
    }
  }
  for (let i = 0; i < top; i++) {
    for (let attempt = 0; attempt < tries; attempt++) {
      const s = size()
      const angle = random() * Math.PI * 2
      const radius = Math.sqrt(random()) * (cupRadius(MOSAIC_CUP.fill) - look.bed - s * 0.6)
      const cube = contain({ p: [Math.cos(angle) * radius, MOSAIC_CUP.fill, Math.sin(angle) * radius], rotation: turn(), size: s, color: order[placed.length], veil: 0 })
      if (fits(cube)) {
        placed.push({ ...cube, veil: veilAt(cube.p[1]) })
        break
      }
    }
  }
  return placed
}

// ---------------------------------------------------------------------------------------------------------------------------
// Gelatina de Duvalín

/**
 * Las capas de la gelatina de Duvalín: de abajo hacia arriba, parejas, del fondo a la cara de arriba bajo la tapa, apenas dentro de la
 * pared (`inset`) y con las orillas redondeadas lo justo para que el borde se vea limpio. La de arriba se abomba un poco al centro.
 */
export const LAYERED_CUP = { inset: 0.04, round: 0.05, dome: 0.05 } as const

export function layerProfiles(count: number): ProfilePoint[][] {
  const { inset, round, dome } = LAYERED_CUP
  const bottom = 0.1
  const height = (MOSAIC_CUP.fill - bottom) / Math.max(1, count)
  const wall = (y: number) => cupRadius(y) - inset
  return Array.from({ length: count }, (_, i) => {
    const y0 = bottom + i * height
    const y1 = y0 + height
    const last = i === count - 1
    return [
      [0, y0],
      [wall(y0) - round, y0],
      [wall(y0 + round), y0 + round],
      [wall(y1 - round), y1 - round],
      [wall(y1) - round, y1],
      ...(last ? ([[(wall(y1) - round) * 0.55, y1 + dome * 0.7], [0, y1 + dome]] as ProfilePoint[]) : ([[0, y1]] as ProfilePoint[])),
    ]
  })
}

// ---------------------------------------------------------------------------------------------------------------------------
// Tarta mini

/** La tarta mini de la foto: 9 cm de boca, 7 cm de fondo y 2.2 cm de alto, con 22 festones en el costado y en el borde. */
export const MINI_TART = { bottomRadius: 3.5, topRadius: 4.5, height: 2.2, wall: 0.32, flutes: 22, fluteDepth: 0.16, scallop: 0.14, creamLevel: 1.85 } as const

const TART_COLUMNS = MINI_TART.flutes * 8
const TART_ROWS = 7

/** El radio de afuera de la masa a esa fracción del alto y ese ángulo: el costado acanalado del molde. */
const tartRadius = (t: number, angle: number) => lerp(MINI_TART.bottomRadius, MINI_TART.topRadius, t) + MINI_TART.fluteDepth * (0.5 + 0.5 * Math.cos(MINI_TART.flutes * angle))
/** La altura del borde a ese ángulo: sube en cada festón. */
const tartRim = (angle: number) => MINI_TART.height + MINI_TART.scallop * (0.5 + 0.5 * Math.cos(MINI_TART.flutes * angle))

/**
 * La masa: el fondo, el costado acanalado, el borde festoneado y redondo y la pared de adentro hasta la crema. El borde se tuesta
 * un poco más que el costado, hacia `mermelada`, como la corteza del pan del diseñador.
 */
export function tartShell(shape: Pick<MiniTartShape, 'crust'>): FruitMesh {
  const mesh = new MeshBuilder()
  const crust = rgb(shape.crust)
  const toasted = rgb({ mix: [shape.crust, 'mermelada'], amount: 0.22 })
  const angles = Array.from({ length: TART_COLUMNS }, (_, j) => (j / TART_COLUMNS) * Math.PI * 2)
  const ring = (radius: (angle: number) => number, y: (angle: number) => number) => angles.map((a): Vec3 => [Math.cos(a) * radius(a), y(a), Math.sin(a) * radius(a)])
  const rows: Vec3[][] = []
  const tones: RGB[][] = []
  const push = (points: Vec3[], tone: RGB) => {
    rows.push(points)
    tones.push(points.map(() => tone))
  }
  // El costado, de abajo hacia arriba.
  for (let i = 0; i <= TART_ROWS; i++) {
    const t = i / TART_ROWS
    push(ring((a) => tartRadius(t, a), (a) => t * tartRim(a)), mixRgb(crust, toasted, t * t))
  }
  // El borde redondo y la pared de adentro, que baja hasta la crema.
  push(ring((a) => tartRadius(1, a) - MINI_TART.wall * 0.5, (a) => tartRim(a) + 0.1), toasted)
  push(ring((a) => tartRadius(1, a) - MINI_TART.wall, (a) => tartRim(a) - 0.02), mixRgb(crust, toasted, 0.6))
  push(ring((a) => tartRadius(0.85, a) - MINI_TART.wall, () => MINI_TART.creamLevel - 0.05), crust)
  mesh.grid(rows, tones, true)
  // El fondo cerrado bajo la tarta.
  const bottom = rows[0].map((point) => mesh.vertex(point, crust))
  mesh.fan(mesh.vertex([0, 0, 0], crust), [...bottom].reverse())
  return mesh.build()
}

/** La crema pastelera dentro de la masa, un poco abombada al centro. */
export function tartCreamProfile(): ProfilePoint[] {
  const edge = tartRadius(0.85, Math.PI / MINI_TART.flutes) - MINI_TART.wall + 0.06
  return [[0, MINI_TART.creamLevel + 0.3], [edge * 0.5, MINI_TART.creamLevel + 0.24], [edge * 0.85, MINI_TART.creamLevel + 0.12], [edge, MINI_TART.creamLevel], [edge, MINI_TART.creamLevel - 0.2], [0, MINI_TART.creamLevel - 0.2]]
}

/** Cuánto se escala cada pieza de `fruit.ts`: la rodaja de kiwi queda de 3.4 cm y el gajo de fresa, de 2 cm de largo. */
const TART_PIECE_SCALE: Partial<Record<FruitPiece, number>> = { kiwiSlice: 0.7, strawberryHalf: 0.55 }

/**
 * La fruta de la tarta como en la foto: tres rodajas de kiwi encimadas en la mitad de atrás, inclinadas hacia el frente, y gajos de
 * fresa con el corte hacia arriba en una media luna al frente. Las coordenadas van en cm sobre la base de la tarta.
 */
export function tartFruit(): FruitLayout {
  const random = seededRandom(20261121)
  const top = MINI_TART.creamLevel + 0.18
  const placements: FruitPlacement[] = []
  const add = (kind: FruitPlacement['kind'], piece: FruitPiece, p: Vec3, yaw: number, tilt: number, toward: [number, number]) => {
    const scale = (TART_PIECE_SCALE[piece] ?? 1) * (0.95 + 0.1 * random())
    placements.push({ kind, piece, p, yaw, tilt, toward, scale, reach: 1.9 * scale, tint: (random() - 0.5) * 0.08 })
  }
  const kiwis: [number, number, number][] = [
    [-1.25, -1.35, 0],
    [1.2, -1.5, 0.05],
    [0, -0.15, 0.22],
  ]
  kiwis.forEach(([x, z, lift]) => add('kiwi', 'kiwiSlice', [x, top + lift, z], random() * Math.PI, 0.28, [0, 1]))
  const strawberries: [number, number][] = [
    [2.75, 15],
    [2.75, 50],
    [2.8, 88],
    [2.75, 125],
    [2.7, 162],
    [1.5, 60],
    [1.5, 118],
  ]
  strawberries.forEach(([radius, degrees], i) => {
    const a = (degrees * Math.PI) / 180
    const x = Math.cos(a) * radius
    const z = Math.sin(a) * radius
    // A lo largo de la media luna, recargados hacia el centro; los de adentro, encima de los de afuera.
    add('strawberry', 'strawberryHalf', [x, top + (i >= 5 ? 0.3 : 0.05), z], -(a + Math.PI / 2), 0.32, [-Math.cos(a), -Math.sin(a)])
  })
  const triangles = placements.reduce((sum, placement) => sum + pieceTriangles(placement.piece), 0)
  return { layout: 'rows', placements, triangles }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Flan napolitano

/**
 * El flan individual de la foto: 7.6 cm abajo, 6.6 cm arriba y 4.2 cm de alto. Va sobre la charola de los pasteles (`SAMPLE_BOARD`),
 * de 13.2 cm, que deja ver todo el charco con un margen de cartón, como el pastel sobre la suya.
 */
export const FLAN = { bottomRadius: 3.8, topRadius: 3.3, height: 4.25, base: 0.1, boardRadius: 6.6 } as const

/**
 * Lo que sube el flan sobre la mesa, en unidades de escena: con charola, se apoya en su cara de arriba, como el piso de abajo de un
 * pastel (`PLATE_GAP`); sin ella, el charco va sobre la mesa.
 */
export const flanLift = (shape: Pick<FlanShape, 'board'>) => (shape.board ? PLATE_GAP : 0)

/** El perfil del flan desmoldado: un poco más ancho abajo, con la orilla de arriba redondeada. */
export function flanProfile(): ProfilePoint[] {
  const { bottomRadius, topRadius, height, base } = FLAN
  return [
    [0, base],
    [bottomRadius - 0.1, base],
    [bottomRadius, base + 0.15],
    [lerp(bottomRadius, topRadius, 0.3), base + 1.3],
    [lerp(bottomRadius, topRadius, 0.7), base + 2.9],
    [topRadius, height - 0.4],
    [topRadius - 0.12, height - 0.12],
    [topRadius - 0.4, height],
    [0, height + 0.04],
  ]
}

/** El radio del costado del flan a esa altura (sin la orilla redondeada). */
const flanRadius = (y: number) => lerp(FLAN.bottomRadius, FLAN.topRadius, Math.min(1, Math.max(0, (y - FLAN.base) / (FLAN.height - 0.4 - FLAN.base))))

/** Desde qué altura el flan es del color de la cara de arriba: la orilla redondeada ya está bañada en caramelo. */
export const FLAN_GLAZE_FROM = FLAN.height - 0.45

const DRIP_COLUMNS = 120

/**
 * El caramelo que escurre: una capa delgada sobre la orilla de arriba que baja por el costado en lenguas de largo distinto, del
 * color de la cara de arriba al caramelo oscuro en las puntas.
 */
export function flanDrips(shape: Pick<FlanShape, 'glaze' | 'caramel'>): FruitMesh {
  const random = seededRandom(20261122)
  const tongues = Array.from({ length: 9 }, () => ({ at: random() * Math.PI * 2, width: 0.12 + 0.18 * random(), length: 0.6 + 2.6 * random() }))
  const reach = (angle: number) =>
    0.2 + tongues.reduce((longest, tongue) => {
      const apart = Math.atan2(Math.sin(angle - tongue.at), Math.cos(angle - tongue.at))
      return Math.max(longest, tongue.length * Math.exp(-((apart / tongue.width) ** 2)))
    }, 0)
  const mesh = new MeshBuilder()
  const glaze = rgb(shape.glaze)
  const caramel = rgb(shape.caramel)
  const angles = Array.from({ length: DRIP_COLUMNS }, (_, j) => (j / DRIP_COLUMNS) * Math.PI * 2)
  const steps = 8
  const start = FLAN.height - 0.3
  const rows: Vec3[][] = []
  const tones: RGB[][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    rows.push(angles.map((a): Vec3 => {
      const y = start - t * reach(a)
      const r = flanRadius(y) + 0.04 + 0.03 * t
      return [Math.cos(a) * r, y, Math.sin(a) * r]
    }))
    tones.push(angles.map(() => mixRgb(glaze, caramel, t)))
  }
  mesh.grid(rows, tones, true)
  return mesh.build()
}

const POOL_COLUMNS = 96

/** La orilla irregular del charco de caramelo, en cm desde el centro del flan; se corre hacia atrás y a la derecha, como en la foto. */
function poolOutline(angle: number): [number, number] {
  const r = 4.2 + 0.6 * Math.sin(2 * angle + 1) + 0.35 * Math.sin(3 * angle + 2) + 0.2 * Math.sin(5 * angle + 0.5)
  return [0.5 + Math.cos(angle) * r, -0.4 + Math.sin(angle) * r]
}

/** El charco de caramelo bajo el flan: plano, con la orilla abultada. */
export function caramelPool(shape: Pick<FlanShape, 'caramel'>): FruitMesh {
  const mesh = new MeshBuilder()
  const caramel = rgb(shape.caramel)
  // La orilla delgada del charco deja pasar más luz: se aclara un poco.
  const edge = rgb({ mix: [shape.caramel, 'betun'], amount: 0.18 })
  const angles = Array.from({ length: POOL_COLUMNS }, (_, j) => (j / POOL_COLUMNS) * Math.PI * 2)
  const ring = (grow: number, y: number): Vec3[] => angles.map((a) => {
    const [x, z] = poolOutline(a)
    const [cx, cz] = [0.5, -0.4]
    return [cx + (x - cx) * grow, y, cz + (z - cz) * grow]
  })
  const rings = [ring(0.96, FLAN.base), ring(1, FLAN.base - 0.03), ring(1.015, 0.01)]
  mesh.grid(rings, [rings[0].map(() => caramel), rings[1].map(() => edge), rings[2].map(() => edge)], true)
  mesh.fan(mesh.vertex([0.5, FLAN.base, -0.4], caramel), [...rings[0].map((point) => mesh.vertex(point, caramel))].reverse())
  return mesh.build()
}

// ---------------------------------------------------------------------------------------------------------------------------
// Lo que ocupa cada postre y cuánto pesa

/** El charco más lejos del centro del flan, en cm: su orilla, abultada, y lo que se corre hacia atrás y a la derecha. */
const POOL_REACH = (4.2 + 0.6 + 0.35 + 0.2) * 1.015 + Math.hypot(0.5, 0.4)

/** Lo que ocupa cada postre, como círculos horizontales en unidades de escena (altura y radio), igual que los pisos en `contentOf`. */
/** Lo que ocupa el vaso con su tapa: el mismo para los vasos de cubos y el de capas. */
const cupOutline = (u: number): Circle[] => [
  { y: 0, r: MOSAIC_CUP.bottomRadius * u },
  { y: MOSAIC_CUP.height * u, r: (MOSAIC_CUP.topRadius + 0.1) * u },
  { y: MOSAIC_CUP.lidTop * u, r: (MOSAIC_CUP.lidRadius + 0.03) * u },
]

const OUTLINES: { [K in DessertKind]: (shape: Extract<DessertShape, { kind: K }>) => Circle[] } = {
  mosaicCup: ({ unitsPerCm: u }) => cupOutline(u),
  layeredCup: ({ unitsPerCm: u }) => cupOutline(u),
  miniTart: ({ unitsPerCm: u }) => [
    { y: 0, r: (MINI_TART.bottomRadius + MINI_TART.fluteDepth) * u },
    { y: (MINI_TART.height + MINI_TART.scallop + 0.1) * u, r: (MINI_TART.topRadius + MINI_TART.fluteDepth) * u },
    // La fruta encimada sobresale de la crema.
    { y: (MINI_TART.creamLevel + 1.3) * u, r: 3.3 * u },
  ],
  flan: (shape) => {
    const u = shape.unitsPerCm
    const lift = flanLift(shape)
    const top = { y: lift + (FLAN.height + 0.04) * u, r: FLAN.topRadius * u }
    if (!shape.board) return [{ y: 0, r: POOL_REACH * u }, top]
    // La charola, como la de los pasteles en `contentOf`: su borde sube y su fondo baja.
    const r = FLAN.boardRadius * u
    return [{ y: PLATE_GAP + BOARD.rim, r }, { y: PLATE_GAP - BOARD.thickness, r }, top]
  },
}

/** Los círculos del postre; TypeScript no relaciona `OUTLINES[shape.kind]` con `shape`, el tipo del registro sí. */
const outline = (shape: DessertShape) => (OUTLINES[shape.kind] as (dessert: DessertShape) => Circle[])(shape)

/** Lo que ocupa el postre en unidades de escena, para el encuadre y la sombra (`cakeMetrics.ts`). */
export function dessertContent(shape: DessertShape): Content {
  return { circles: outline(shape) }
}

/** El radio del círculo que envuelve al postre visto desde arriba, en unidades de escena: su huella en la mesa. */
export function dessertRadius(shape: DessertShape): number {
  return Math.max(...outline(shape).map(({ r }) => r))
}

/**
 * Desde dónde se ve cada postre, en grados sobre el horizonte: en la ficha (`scene`; el pastel se ve a 15°) y en su imagen fija
 * (`still`; el pastel, a 32°). El vaso se fotografió casi de lado; la tarta y el flan, desde arriba: más alto, se ve la fruta y el
 * caramelo, y llenan su caja en lugar de quedar como una franja baja con aire encima. `fit` cambia el encuadre de la ficha solo para
 * ese postre: el vaso, alto y angosto, se apoya más abajo (`plate`) y sin el aire de arriba que necesita un pastel ancho (`top`; la
 * tapa de atrás queda más lejos de la cámara y se ve más chica, así que no se recorta).
 */
const DESSERT_VIEWS: Record<DessertKind, { scene: number; still: number; fit?: { plate: number; top: number } }> = {
  mosaicCup: { scene: 10, still: 20, fit: { plate: 0.98, top: 1.01 } },
  layeredCup: { scene: 10, still: 20, fit: { plate: 0.98, top: 1.01 } },
  miniTart: { scene: 35, still: 48 },
  flan: { scene: 26, still: 36 },
}

export const dessertView = (shape: DessertShape) => DESSERT_VIEWS[shape.kind]

const meshTriangles = (mesh: FruitMesh) => mesh.indices.length / 3

/** Triángulos de cada postre: tornos, mallas, cubos (12 caras cada uno) y fruta. */
const TRIANGLES: { [K in DessertKind]: (shape: Extract<DessertShape, { kind: K }>) => number } = {
  mosaicCup: (shape) =>
    latheTriangles(cupProfile().length) +
    latheTriangles(lidProfile().length) +
    meshTriangles(mosaicCream(shape)) +
    mosaicLook(shape).liquid.reduce((sum, layer) => sum + latheTriangles(mosaicSkinProfile(shape, layer.inset).length), 0) +
    mosaicCubes(shape).length * 12,
  layeredCup: (shape) =>
    latheTriangles(cupProfile().length) + latheTriangles(lidProfile().length) + layerProfiles(shape.layers.length).reduce((sum, profile) => sum + latheTriangles(profile.length), 0),
  miniTart: (shape) => meshTriangles(tartShell(shape)) + latheTriangles(tartCreamProfile().length) + tartFruit().triangles,
  flan: (shape) =>
    latheTriangles(flanProfile().length) + meshTriangles(flanDrips(shape)) + meshTriangles(caramelPool(shape)) + (shape.board ? (boardProfile(1).length - 1) * 96 * 2 : 0),
}

/**
 * Los triángulos de un postre, contra el mismo presupuesto de la escena del pastel (`TRIANGLE_BUDGET`, 150 000): los postres
 * llevan pocos, pero se miden igual. `withinBudget` lo revisan las pruebas.
 */
export function dessertTriangles(shape: DessertShape): { triangles: number; withinBudget: boolean } {
  const count = (TRIANGLES[shape.kind] as (dessert: DessertShape) => number)(shape)
  return { triangles: count, withinBudget: count <= TRIANGLE_BUDGET }
}
