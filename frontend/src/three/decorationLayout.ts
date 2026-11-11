import { halfExtents } from './cakeMetrics.ts'
import type { CakeDecoration, CakeShape, CakeTier, ShapeColor } from './cakeShape.ts'
import { seededRandom } from './seededRandom.ts'

/**
 * Dónde va cada pieza de la decoración del paso 6 (D53), sin React ni three: las posiciones, la orientación y el
 * tamaño de cada instancia, y cuántos triángulos pide. `Decoration.tsx` las dibuja como mallas instanciadas. Todo va
 * en coordenadas del piso (origen en el centro de su base, `y` hacia arriba) y con posiciones fijas por semilla, así no
 * brincan entre renders.
 *
 * El número de piezas depende de `scale`, la proporción del presupuesto de triángulos de la escena (`pieceBudget.ts`):
 * con menos piezas, cada una crece (hasta el doble) para que la hilera siga continua.
 */

type Vec3 = [number, number, number]

/** Qué malla dibuja cada parte; `Decoration.tsx` crea la geometría de cada una. */
export type PartShape = 'shell' | 'rosette' | 'bead' | 'pearl' | 'rosePetal' | 'roseBud' | 'leaf' | 'sprinkle' | 'chip'

/**
 * Triángulos de una instancia de cada parte. Deben coincidir con la geometría de `Decoration.tsx`: esfera de
 * 2·columnas·(filas − 1) (la concha, de 14 por 6; el pétalo de rosa, de 8 por 4), cápsula del granillo (la misma de `FillingPieces`) y la roseta, de
 * 24 por 6 cuadros. La chispa redonda (`chip`) es la esfera de 8 por 6 de `FillingPieces`.
 */
export const PART_FACES: Record<PartShape, number> = {
  shell: 140,
  rosette: 288,
  bead: 64,
  pearl: 100,
  rosePetal: 48,
  roseBud: 64,
  leaf: 64,
  sprinkle: 60,
  chip: 80,
}

/** Una instancia: posición, hacia dónde mira su eje z, giro sobre ese eje, escala, color (índice) y variación de brillo (0.1 es 20 % más). */
export type Placement = { p: Vec3; dir: Vec3; roll: number; s: Vec3; color: number; tint: number }

export type DecorationPart = { shape: PartShape; colors: readonly ShapeColor[]; placements: Placement[] }

/** Una fila de olán: una cinta que cuelga de `yTop`, con pliegues a lo largo del perímetro. */
export type RuffleBand = { yTop: number; width: number; color: ShapeColor; samples: number; waves: number }

export type TierDecoration = { parts: DecorationPart[]; bands: RuffleBand[] }

/** Filas de vértices a lo ancho de una cinta de olán (cuatro tramos). */
export const BAND_ROWS = 4
export const bandFaces = (band: Pick<RuffleBand, 'samples'>) => band.samples * BAND_ROWS * 2

type Form = NonNullable<CakeShape['form']>
type Pt = { x: number; z: number; nx: number; nz: number }

/** El perímetro de un piso recorrido por su longitud `s`: el punto, su normal hacia afuera y los tramos sin esquinas. */
export type Perimeter = { length: number; at: (s: number) => Pt; runs: readonly [number, number][] }

/**
 * Redondo: un círculo (como las perlas de `CakeModel`, x = sen, z = cos). Rectangular: cuatro lados en el mismo orden
 * que `pearlRow`; cada lado es un tramo, para que ninguna pieza cruce una esquina.
 */
export function perimeterOf(tier: Pick<CakeTier, 'radius' | 'halfWidth' | 'halfDepth'>, form: Form): Perimeter {
  if (form === 'round') {
    const r = tier.radius
    const length = 2 * Math.PI * r
    return {
      length,
      at: (s) => {
        const a = s / r
        return { x: Math.sin(a) * r, z: Math.cos(a) * r, nx: Math.sin(a), nz: Math.cos(a) }
      },
      runs: [[0, length]],
    }
  }
  const { x: w, z: d } = halfExtents(tier, form)
  const lengths = [2 * w, 2 * d, 2 * w, 2 * d]
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((sum, length) => sum + length, 0))
  const length = lengths.reduce((sum, value) => sum + value, 0)
  return {
    length,
    at: (s) => {
      const wrapped = ((s % length) + length) % length
      const side = Math.min(3, starts.findIndex((start, i) => wrapped < start + lengths[i]))
      const t = wrapped - starts[side]
      if (side === 0) return { x: -w + t, z: d, nx: 0, nz: 1 }
      if (side === 1) return { x: w, z: d - t, nx: 1, nz: 0 }
      if (side === 2) return { x: w - t, z: -d, nx: 0, nz: -1 }
      return { x: -w, z: -d + t, nx: -1, nz: 0 }
    },
    runs: lengths.map((value, i): [number, number] => [starts[i], starts[i] + value]),
  }
}

/** Los tramos de `perimeter` partidos en intervalos de casi `spacing` (como mínimo `minimum` en total). */
function intervals(perimeter: Perimeter, spacing: number, minimum = 1): [number, number][] {
  const total = perimeter.runs.reduce((sum, [from, to]) => sum + Math.max(1, Math.round((to - from) / spacing)), 0)
  const extra = Math.max(0, minimum - total)
  return perimeter.runs.flatMap(([from, to]) => {
    const count = Math.max(1, Math.round((to - from) / spacing)) + (perimeter.runs.length === 1 ? extra : 0)
    return Array.from({ length: count }, (_, i): [number, number] => [from + ((to - from) * i) / count, from + ((to - from) * (i + 1)) / count])
  })
}

/**
 * Dónde van las piezas de una fila que da la vuelta al piso, por la longitud `s`: en redondo, el centro de cada
 * intervalo de `intervals`; en rectangular, cada lado deja libres `inset + spacing / √2` en los extremos, así las dos
 * piezas vecinas de una esquina quedan a un paso completo (`spacing`) y las de un mismo lado, a `spacing` o más. Un
 * lado más corto que eso lleva una sola pieza en su centro.
 */
function rowCenters(perimeter: Perimeter, spacing: number, inset: number, minimum = 1): number[] {
  if (perimeter.runs.length === 1) return intervals(perimeter, spacing, minimum).map(center)
  const trim = inset + spacing / Math.SQRT2
  return perimeter.runs.flatMap(([from, to]) => {
    const room = to - from - 2 * trim
    const count = Math.max(1, Math.floor(room / spacing + 1e-9))
    if (room <= 0) return [(from + to) / 2]
    return Array.from({ length: count }, (_, i) => from + trim + (room * (i + 0.5)) / count)
  })
}

const center = ([from, to]: [number, number]) => (from + to) / 2
const normalize = ([x, y, z]: Vec3): Vec3 => {
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}
/** La tangente del perímetro en un punto, en el sentido en que crece `s` (x = sen, z = cos: d/ds = (nz, -nx)). */
const tangent = (point: Pt): [number, number] => [point.nz, -point.nx]

/** ¿El punto cae dentro del piso de arriba (con holgura)? Ahí no se pone nada: queda debajo de ese piso. */
function underTier(x: number, z: number, upper: CakeTier | undefined, form: Form, margin: number): boolean {
  if (!upper) return false
  const { x: hx, z: hz } = halfExtents(upper, form)
  return form === 'round' ? Math.hypot(x, z) < upper.radius + margin : Math.abs(x) < hx + margin && Math.abs(z) < hz + margin
}

const grow = (scale: number) => Math.min(2, 1 / Math.max(scale, 0.01))

/** Distancia entre piezas y medidas, en unidades de escena (1 unidad son 100 px del mockup). */
const SHELL = { spacing: 0.13, length: 0.1, width: 0.075, height: 0.05, tilt: 0.3, rim: 0.03, foot: 0.05 }
const ROSETTE = { spacing: 0.21, radius: 0.1, inset: 0.1 }
const SWAG = { spacing: 0.62, drop: 0.2, below: 0.06, beadSpacing: 0.055, beadRadius: 0.04, pearl: 0.055 }
const RUFFLE = { spacing: 0.045, pleat: 0.32 }
/**
 * Rosas de duya hechas con la técnica de modelado en clavo: un botón central y pétalos en cuatro capas que se abren (3
 * cerrados sobre el botón, 5, 7 y 8 que se abren). `spacing` es lo que avanzan por el borde (casi su diámetro: se tocan, como en
 * una fila de rosas de verdad) e `inset`, cuánto se arriman al borde desde afuera hacia adentro.
 */
const ROSE = {
  spacing: 0.34,
  inset: 0.15,
  layers: [
    { petals: 3, ring: 0.03, lift: 0.07, lean: 0.9, size: 0.8, turn: 0 },
    { petals: 5, ring: 0.066, lift: 0.058, lean: 0.45, size: 1, turn: Math.PI / 5 },
    { petals: 7, ring: 0.105, lift: 0.045, lean: 0.05, size: 1.15, turn: Math.PI / 7 },
    { petals: 8, ring: 0.145, lift: 0.03, lean: -0.4, size: 1.25, turn: 0 },
  ],
} as const
const SPRINKLE = { density: 28 }

function shells(tier: CakeTier, upper: CakeTier | undefined, form: Form, scale: number, seed: number): DecorationPart[] {
  const perimeter = perimeterOf(tier, form)
  const random = seededRandom(seed)
  const placements: Placement[] = []
  const g = grow(scale)
  for (const [top, y] of [[true, tier.height - SHELL.rim], [false, SHELL.foot]] as const) {
    for (const interval of intervals(perimeter, SHELL.spacing / scale, 6)) {
      const at = perimeter.at(center(interval))
      if (top && underTier(at.x, at.z, upper, form, 0.04)) continue
      const [tx, tz] = tangent(at)
      const lift = SHELL.tilt
      placements.push({
        p: [at.x + at.nx * 0.012, y, at.z + at.nz * 0.012],
        dir: normalize([tx * Math.cos(lift), Math.sin(lift), tz * Math.cos(lift)]),
        roll: 0,
        s: [g ** 0.5, 1, g],
        color: 0,
        tint: (random() - 0.5) * 0.08,
      })
    }
  }
  return [{ shape: 'shell', colors: [], placements }]
}

function rosettes(tier: CakeTier, upper: CakeTier | undefined, form: Form, scale: number, seed: number): DecorationPart[] {
  const perimeter = perimeterOf(tier, form)
  const random = seededRandom(seed)
  const g = grow(scale)
  const placements: Placement[] = []
  // Con un piso de arriba casi tan grande, el borde libre es angosto: la roseta se arrima al piso de arriba en vez de
  // quedar toda debajo de él.
  const gap = upper ? Math.min(halfExtents(tier, form).x - halfExtents(upper, form).x, halfExtents(tier, form).z - halfExtents(upper, form).z) : ROSETTE.inset
  const inset = Math.min(ROSETTE.inset * g ** 0.5, Math.max(0.03, gap))
  for (const position of rowCenters(perimeter, ROSETTE.spacing / scale, inset, 6)) {
    const at = perimeter.at(position)
    const x = at.x - at.nx * inset
    const z = at.z - at.nz * inset
    if (underTier(x, z, upper, form, 0)) continue
    placements.push({ p: [x, tier.height - 0.005, z], dir: [0, 0, 1], roll: 0, s: [g, g, g], color: 0, tint: (random() - 0.5) * 0.08 })
  }
  return [{ shape: 'rosette', colors: [], placements }]
}

function swags(tier: CakeTier, form: Form, scale: number, seed: number): DecorationPart[] {
  const perimeter = perimeterOf(tier, form)
  const random = seededRandom(seed)
  const g = grow(scale)
  const beads: Placement[] = []
  const pearls: Placement[] = []
  const yEnd = tier.height - SWAG.below
  const cords = intervals(perimeter, SWAG.spacing / scale, 6)
  for (const [from, to] of cords) {
    const count = Math.max(4, Math.round(((to - from) * 1.15) / (SWAG.beadSpacing * g)))
    const points: Vec3[] = Array.from({ length: count + 1 }, (_, i) => {
      const u = i / count
      const at = perimeter.at(from + (to - from) * u)
      return [at.x + at.nx * 0.012, yEnd - SWAG.drop * 4 * u * (1 - u), at.z + at.nz * 0.012]
    })
    for (let i = 0; i < count; i++) {
      const a = points[i]
      const b = points[i + 1]
      beads.push({
        p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
        dir: normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
        roll: 0,
        s: [g ** 0.5, g ** 0.5, 1.5],
        color: 0,
        tint: (random() - 0.5) * 0.06,
      })
    }
    const start = perimeter.at(from)
    pearls.push({ p: [start.x + start.nx * 0.02, yEnd + 0.005, start.z + start.nz * 0.02], dir: [0, 0, 1], roll: 0, s: [1, 1, 1], color: 0, tint: 0 })
  }
  return [
    { shape: 'bead', colors: [], placements: beads },
    { shape: 'pearl', colors: [], placements: pearls },
  ]
}

/** Cuatro filas de olán que cuelgan una bajo la otra y se traslapan: en el color principal y en el acento, alternadas. */
function ruffles(tier: CakeTier, form: Form, scale: number, main: ShapeColor, accent: ShapeColor): RuffleBand[] {
  const { length } = perimeterOf(tier, form)
  const samples = Math.max(24, Math.round((length / RUFFLE.spacing) * Math.max(scale, 0.25)))
  const waves = Math.max(6, Math.round(length / RUFFLE.pleat))
  return [0.97, 0.73, 0.49, 0.25].map((top, row) => ({ yTop: tier.height * top, width: tier.height * 0.3, color: row % 2 === 0 ? main : accent, samples, waves }))
}

/**
 * Una fila de rosas por piso, en el borde de arriba y dando la vuelta completa. En los pisos de abajo quedan en el escalón
 * que deja libre el piso de encima (se arriman a él cuando es angosto). El centro de la cara de arriba del último piso
 * queda libre: ahí puede ir una oblea o un texto (paso 7). Cada rosa lleva un botón, 23 pétalos en cuatro capas y 2 hojitas.
 */
function roses(tier: CakeTier, upper: CakeTier | undefined, form: Form, decoration: Extract<CakeDecoration, { kind: 'roses' }>, scale: number, seed: number): DecorationPart[] {
  const perimeter = perimeterOf(tier, form)
  const random = seededRandom(seed)
  const g = grow(scale)
  const half = halfExtents(tier, form)
  // El escalón libre que deja el piso de arriba; sin piso de arriba, el borde es todo el piso.
  const gap = upper ? Math.min(half.x - halfExtents(upper, form).x, half.z - halfExtents(upper, form).z) : Infinity
  // Con un escalón angosto, la rosa se achica para no meterse en la pared del piso de arriba (su radio visible es de
  // unos 0.21); en el último piso, para dejar un centro libre aunque el piso sea muy chico.
  const ownInset = ROSE.inset * g ** 0.5
  const fit = Math.max(
    0.4,
    Math.min(1, gap / 0.36, upper ? 1 : (0.7 * Math.min(half.x, half.z) - ownInset) / 0.21),
  )
  // El centro siempre cae dentro del escalón (en su mitad si es angosto), sin depender de `underTier`.
  // Con un escalón de menos de 0.12 no cabe ni la rosa más chica: se arrima a la orilla para no asomar fuera del piso
  // (queda un poco metida en la pared del piso de arriba) y sus hojas miran hacia adentro, no al aire.
  const narrow = gap < 0.12
  const inset = narrow ? 0.21 * 1.08 * fit : Math.min(ownInset, Math.max(0.03, gap / 2))
  const petals: Placement[] = []
  const buds: Placement[] = []
  const leaves: Placement[] = []
  const y = tier.height
  let tones = 0
  for (const position of rowCenters(perimeter, (ROSE.spacing * g ** 0.5 * fit) / scale, inset, 6)) {
    const at = perimeter.at(position)
    const x = at.x - at.nx * inset
    const z = at.z - at.nz * inset
    const size = (0.92 + random() * 0.16) * g ** 0.5 * fit
    const turn = random() * Math.PI * 2
    // Los tonos se alternan a lo largo de la fila (con un solo color elegido, todas iguales).
    const tone = tones++ % decoration.petals.length
    const tint = (random() - 0.5) * 0.06
    for (const layer of ROSE.layers) {
      for (let k = 0; k < layer.petals; k++) {
        const a = turn + layer.turn + (k * Math.PI * 2) / layer.petals
        petals.push({
          p: [x + Math.cos(a) * layer.ring * size, y + layer.lift * size, z + Math.sin(a) * layer.ring * size],
          dir: normalize([Math.cos(a), layer.lean, Math.sin(a)]),
          roll: 0,
          s: [layer.size * size, layer.size * size, layer.size * size],
          color: tone,
          tint,
        })
      }
    }
    // El botón: un poco más oscuro que los pétalos.
    buds.push({ p: [x, y + 0.078 * size, z], dir: [0, 0, 1], roll: 0, s: [size * 0.85, size * 0.8, size * 0.85], color: tone, tint: tint - 0.08 })
    // Las hojitas salen a los lados, hacia afuera del borde, casi planas.
    for (const side of [-1, 1]) {
      const a = Math.atan2(at.nz, at.nx) + (narrow ? Math.PI : 0) + side * 0.95
      leaves.push({
        p: [x + Math.cos(a) * 0.19 * size, y + 0.008, z + Math.sin(a) * 0.19 * size],
        dir: normalize([Math.cos(a), -0.05, Math.sin(a)]),
        roll: 0,
        s: [size, size, size],
        color: 0,
        tint: (random() - 0.5) * 0.14,
      })
    }
  }
  return [
    { shape: 'rosePetal', colors: decoration.petals, placements: petals },
    { shape: 'roseBud', colors: decoration.petals, placements: buds },
    { shape: 'leaf', colors: [decoration.leaf], placements: leaves },
  ]
}

/** Chispas solo en el costado del piso (D54), nada en la cara de arriba: el centro queda libre para una oblea o un texto. */
function sprinkles(tier: CakeTier, form: Form, decoration: Extract<CakeDecoration, { kind: 'sprinkles' }>, scale: number, seed: number): DecorationPart[] {
  const random = seededRandom(seed)
  const perimeter = perimeterOf(tier, form)
  const sideArea = perimeter.length * tier.height
  const g = grow(scale)
  const placements: Placement[] = []
  const palette = Math.max(1, decoration.colors.length)
  for (let i = 0, count = Math.round(sideArea * SPRINKLE.density * scale); i < count; i++) {
    const at = perimeter.at(random() * perimeter.length)
    const size = (0.9 + random() * 0.4) * g ** 0.5
    placements.push({
      p: [at.x + at.nx * 0.004, 0.06 + random() * (tier.height - 0.1), at.z + at.nz * 0.004],
      dir: [at.nx, 0, at.nz],
      roll: random() * Math.PI * 2,
      s: [size, size, size],
      color: Math.floor(random() * palette),
      tint: 0,
    })
  }
  return [{ shape: decoration.style === 'round_chips' ? 'chip' : 'sprinkle', colors: decoration.colors, placements }]
}

/** Lo que lleva el piso `index` de la decoración del pastel; nada si no hay decoración o el piso no la lleva. */
export function tierDecoration(shape: CakeShape, index: number, scale = 1): TierDecoration {
  const decoration = shape.decoration
  const tier = shape.tiers[index]
  const none: TierDecoration = { parts: [], bands: [] }
  // La decoración va sobre la cobertura: un piso sin ella (con las capas del costado) no la lleva.
  if (!decoration || !tier || !tier.frosting) return none
  const form = shape.form ?? 'round'
  const upper = shape.tiers[index + 1]
  const seed = 9001 + index * 131
  /** Las perlitas de las uniones llevan el acento; todo lo demás, el color principal. */
  const colors = (parts: DecorationPart[], main: ShapeColor, accent: ShapeColor) =>
    parts.map((part) => ({ ...part, colors: part.shape === 'pearl' ? [accent] : [main] }))
  switch (decoration.kind) {
    case 'shells':
      return { parts: colors(shells(tier, upper, form, scale, seed), decoration.main, decoration.accent), bands: [] }
    case 'rosettes':
      return { parts: colors(rosettes(tier, upper, form, scale, seed), decoration.main, decoration.accent), bands: [] }
    case 'swags':
      return { parts: colors(swags(tier, form, scale, seed), decoration.main, decoration.accent), bands: [] }
    case 'ruffles':
      return { parts: [], bands: ruffles(tier, form, scale, decoration.main, decoration.accent) }
    case 'roses':
      return { parts: roses(tier, upper, form, decoration, scale, seed), bands: [] }
    case 'sprinkles':
      return { parts: sprinkles(tier, form, decoration, scale, seed), bands: [] }
  }
}

/** Triángulos de la decoración de toda la escena con el número de piezas multiplicado por `scale`. */
export function decorationTriangles(shape: CakeShape, scale = 1): number {
  if (!shape.decoration) return 0
  return shape.tiers.reduce((sum, _, index) => {
    const { parts, bands } = tierDecoration(shape, index, scale)
    return sum + parts.reduce((acc, part) => acc + part.placements.length * PART_FACES[part.shape], 0) + bands.reduce((acc, band) => acc + bandFaces(band), 0)
  }, 0)
}
