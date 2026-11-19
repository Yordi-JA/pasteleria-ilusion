import { TIER_EDGE_UNITS } from '../models/cakeDesignLayout.ts'
import { halfExtents } from './cakeMetrics.ts'
import type { CakeLid, CakeShape, CakeTier, CakeTopping, FruitKind, FruitLayoutKind } from './cakeShape.ts'
import { PART_REACH, perimeterOf } from './decorationLayout.ts'
import type { TierDecoration } from './decorationLayout.ts'
import type { DataColor } from './palette.ts'
import { seededRandom } from './seededRandom.ts'

/**
 * La fruta fresca sobre la tapa del último piso (tanda 4b), sin React ni three: la geometría de cada pieza (posiciones, normales,
 * colores por vértice e índices, en cm) y dónde va cada una. `Fruit.tsx` la dibuja como mallas instanciadas, una por pieza. Solo
 * para las imágenes del catálogo: "Diseña tu pastel" no la pone.
 *
 * Las piezas son de pocos triángulos pero se reconocen por su forma y sus colores, como en las 8 fotos de la pastelería: mitades
 * de fresa con el corte claro, fresas enteras con sus hojitas, rodajas de kiwi con su anillo de semillas, medias lunas de durazno
 * en almíbar, manzana roja en abanico, racimos de uva verde, estrellas de carambola, rebanadas de pera y physalis con su cáscara.
 * Cada pieza se arma en cm y se escala con los moldes (`CakeTopping.unitsPerCm`): una fresa mide lo mismo en un mini de 14 cm que
 * en un pastel de 4 kg. Todo sale de una semilla fija: la misma forma da siempre el mismo acomodo.
 */

export type FruitPiece =
  | 'strawberryHalf'
  | 'strawberryWhole'
  | 'kiwiSlice'
  | 'peachSlice'
  | 'appleFan'
  | 'grapeCluster'
  | 'starfruitSlice'
  | 'pearSlice'
  | 'physalis'
  | 'bananaSlice'

/** Las seis frutas que más salen en las fotos del catálogo; uva y physalis solo en la de cajeta. */
export const DEFAULT_FRUITS: readonly FruitKind[] = ['strawberry', 'apple', 'kiwi', 'peach', 'starfruit', 'pear']

/** Las piezas de cada fruta: la fresa va en mitades y, una de cada tres, entera. */
const KIND_PIECES: Record<FruitKind, readonly FruitPiece[]> = {
  strawberry: ['strawberryHalf', 'strawberryHalf', 'strawberryWhole'],
  kiwi: ['kiwiSlice'],
  peach: ['peachSlice'],
  apple: ['appleFan'],
  grape: ['grapeCluster'],
  starfruit: ['starfruitSlice'],
  pear: ['pearSlice'],
  physalis: ['physalis'],
  banana: ['bananaSlice'],
}

/**
 * El tono de cada fruta, para el contraste del montón: dos piezas vecinas no son del mismo tono (una fresa junto a una manzana
 * roja se pierden), como en las fotos, donde la pastelería alterna rojos, verdes y amarillos.
 */
const TONE: Record<FruitKind, 'red' | 'green' | 'orange' | 'yellow' | 'pale'> = {
  strawberry: 'red',
  apple: 'red',
  kiwi: 'green',
  grape: 'green',
  peach: 'orange',
  physalis: 'orange',
  starfruit: 'yellow',
  pear: 'pale',
  banana: 'pale',
}

/**
 * Triángulos que puede llevar toda la fruta: la quinta parte de los 150 000 de la escena (`pieceBudget.ts`). Un pastel con fruta
 * aparta esta parte y los trozos y la decoración se reparten el resto, así la suma nunca pasa del presupuesto. En un pastel de
 * medidas absurdas la fruta deja de crecer aquí.
 */
export const FRUIT_TRIANGLE_BUDGET = 30_000

/**
 * Lo que aparta la fruta de una forma: la quinta parte de siempre y, en el montón tupido de las imágenes del catálogo
 * (`CakeTopping.density`), hasta el doble. Los trozos y la decoración se reparten el resto (`pieceBudget.ts`).
 */
export function fruitBudget(topping: Pick<CakeTopping, 'density'> | undefined): number {
  if (!topping) return 0
  return Math.round(FRUIT_TRIANGLE_BUDGET * (1 + denseOf(topping)))
}

/** Lo tupido como la escena lo usa: de 0 (el montón de siempre) a 2. */
const denseOf = (topping: Pick<CakeTopping, 'density'>) => Math.min(2, Math.max(0, (topping.density ?? 1) - 1))

/**
 * Los colores de la fruta, `#rrggbb`. Son comida, como los `preview_color` del admin, no colores de la marca: una fresa es roja
 * aunque la paleta cambie. Los tomé de las fotos de la pastelería (`frontend/public/fotos/`).
 */
const FRUIT_COLORS = {
  strawberrySkin: '#c0141f',
  strawberryTip: '#a30f1a',
  strawberryShoulder: '#d42a2f',
  strawberryFlesh: '#e65a5e',
  strawberryCore: '#fbe0d8',
  calyx: '#3f7d2a',
  calyxTip: '#5d9a36',
  kiwiCore: '#f2efcf',
  kiwiInner: '#c9dc6a',
  kiwiSeed: '#2a1e14',
  kiwiFlesh: '#8fbb38',
  kiwiEdge: '#6f9e2a',
  kiwiSkin: '#6b4f2c',
  peachTop: '#f5a623',
  peachPit: '#ee8a1d',
  peachRim: '#f7b532',
  peachWall: '#e98f1f',
  appleFlesh: '#f4ead0',
  appleFleshEdge: '#efe0bd',
  appleSkin: '#b3202c',
  appleSkinWall: '#a51c27',
  grape: '#b8cf5c',
  grapeLight: '#d2e27e',
  grapeShade: '#9fb84a',
  starfruitCore: '#f6ecb0',
  starfruitInner: '#f3e08a',
  starfruitTip: '#e6c53a',
  starfruitValley: '#ead055',
  starfruitWall: '#d4ad2c',
  pearCore: '#ece0b8',
  pearFlesh: '#f2eccf',
  pearSkin: '#c3c24a',
  pearWall: '#b2b043',
  physalis: '#f0a02a',
  physalisLight: '#f7bd52',
  husk: '#e9d6a2',
  huskTip: '#cdb178',
  bananaCore: '#e6d58f',
  bananaSeed: '#9a8650',
  bananaFlesh: '#f4e9bd',
  bananaEdge: '#efdfa4',
  bananaSkin: '#d8c47e',
} as const satisfies Record<string, DataColor>

type FruitColor = keyof typeof FRUIT_COLORS
type Vec3 = [number, number, number]
type RGB = [number, number, number]

/** La malla de una pieza en cm, con la base en y = 0 y centrada en x y z. Los colores son sRGB de 0 a 1, uno por vértice. */
export type FruitMesh = { positions: number[]; normals: number[]; colors: number[]; indices: number[] }

const rgb = (name: FruitColor): RGB => {
  const hex = FRUIT_COLORS[name]
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB
}
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * Arma una malla con vértices e índices. Las normales salen de las caras (ponderadas por su área) y se suavizan solo entre los
 * triángulos que comparten un vértice: un canto (el corte de la fresa, el costado de una rodaja) lleva vértices propios.
 */
export class MeshBuilder {
  private positions: number[] = []
  private colors: number[] = []
  private indices: number[] = []

  vertex(p: Vec3, color: RGB): number {
    this.positions.push(...p)
    this.colors.push(...color)
    return this.positions.length / 3 - 1
  }

  triangle(a: number, b: number, c: number) {
    this.indices.push(a, b, c)
  }

  quad(a: number, b: number, c: number, d: number) {
    this.triangle(a, b, c)
    this.triangle(a, c, d)
  }

  /** Una superficie de `points[i][j]` con cuadros entre filas y columnas; `wrap` cierra las columnas (un torno). */
  grid(points: Vec3[][], colors: RGB[][], wrap = false): number[][] {
    const ids = points.map((row, i) => row.map((point, j) => this.vertex(point, colors[i][j])))
    for (let i = 0; i < ids.length - 1; i++) {
      const columns = ids[i].length
      for (let j = 0; j < (wrap ? columns : columns - 1); j++) {
        const next = (j + 1) % columns
        this.quad(ids[i][j], ids[i + 1][j], ids[i + 1][next], ids[i][next])
      }
    }
    return ids
  }

  /** Un abanico del vértice `center` sobre el anillo `ring` (cerrado si `closed`). */
  fan(center: number, ring: number[], closed = true) {
    for (let j = 0; j < (closed ? ring.length : ring.length - 1); j++) this.triangle(center, ring[j], ring[(j + 1) % ring.length])
  }

  build(): FruitMesh {
    const normals = new Array<number>(this.positions.length).fill(0)
    const at = (i: number): Vec3 => [this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]]
    for (let t = 0; t < this.indices.length; t += 3) {
      const [a, b, c] = [this.indices[t], this.indices[t + 1], this.indices[t + 2]]
      const [pa, pb, pc] = [at(a), at(b), at(c)]
      const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
      const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      for (const index of [a, b, c]) for (let k = 0; k < 3; k++) normals[index * 3 + k] += n[k]
    }
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2])
      // Un vértice que solo tocan triángulos sin área (la punta de la fresa) mira hacia arriba.
      const [x, y, z] = length > 1e-12 ? [normals[i] / length, normals[i + 1] / length, normals[i + 2] / length] : [0, 1, 0]
      normals[i] = x
      normals[i + 1] = y
      normals[i + 2] = z
    }
    return { positions: [...this.positions], normals, colors: [...this.colors], indices: [...this.indices] }
  }
}

/** El ancho de una fresa a lo largo, de 0 (los hombros, donde estaba el cáliz) a 1 (la punta): ancha arriba y en punta. */
const strawberryWidth = (u: number) => (1 - u) ** 0.65 * (0.78 + 0.9 * u)

/** Media fresa acostada con el corte hacia arriba: piel roja por abajo y, en el corte, la orilla roja y el centro casi blanco. */
function strawberryHalf(): FruitMesh {
  const mesh = new MeshBuilder()
  const [length, radius, rows, columns] = [3.6, 1.45, 8, 6]
  const us = Array.from({ length: rows + 1 }, (_, i) => i / rows)
  const r = (u: number) => radius * strawberryWidth(u)
  const depth = (u: number) => 0.85 * r(u)
  const cut = Math.max(...us.map(depth))
  const x = (u: number) => -length / 2 + u * length
  // La piel: medio óvalo bajo el corte en cada sección, de un lado del corte al otro.
  const skin = us.map((u) => Array.from({ length: columns + 1 }, (_, j): Vec3 => {
    const theta = (j / columns) * Math.PI
    return [x(u), cut - depth(u) * Math.sin(theta), r(u) * Math.cos(theta)]
  }))
  const skinColor = us.map((u) => Array.from({ length: columns + 1 }, () => mixRgb(rgb('strawberryShoulder'), rgb('strawberryTip'), u)))
  mesh.grid(skin, skinColor)
  // El corte: la orilla roja, la carne roja clara y el centro casi blanco.
  const across = [1, 0.62, 0, -0.62, -1]
  const tones: RGB[] = [rgb('strawberrySkin'), rgb('strawberryFlesh'), rgb('strawberryCore'), rgb('strawberryFlesh'), rgb('strawberrySkin')]
  mesh.grid(
    us.map((u) => across.map((a): Vec3 => [x(u), cut, a * r(u)])),
    us.map(() => tones),
  )
  // Los hombros, donde se quitó el cáliz: la sección cerrada con la carne clara.
  const shoulder = skin[0].map((point) => mesh.vertex(point, rgb('strawberryFlesh')))
  mesh.fan(mesh.vertex([x(0), cut - depth(0) * 0.45, 0], rgb('strawberryCore')), shoulder)
  return mesh.build()
}

/** Una fresa entera de pie, con la punta arriba y cinco hojitas del cáliz sobre la crema. */
function strawberryWhole(): FruitMesh {
  const mesh = new MeshBuilder()
  const profile: [number, number][] = [[0.9, 0], [1.2, 0.35], [1.3, 0.9], [1.15, 1.6], [0.8, 2.3], [0.4, 2.9], [0.12, 3.2], [0, 3.3]]
  const columns = 12
  mesh.grid(
    profile.map(([radius, y]) => Array.from({ length: columns }, (_, j): Vec3 => {
      const a = (j / columns) * Math.PI * 2
      return [Math.sin(a) * radius, y, Math.cos(a) * radius]
    })),
    profile.map((_, i) => Array.from({ length: columns }, () => mixRgb(rgb('strawberryShoulder'), rgb('strawberryTip'), i / (profile.length - 1)))),
    true,
  )
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    const side = 0.32
    const point = (radius: number, offset: number, y: number): Vec3 => [Math.sin(a + offset) * radius, y, Math.cos(a + offset) * radius]
    const base = mesh.vertex(point(0.6, 0, 0.12), rgb('calyx'))
    const left = mesh.vertex(point(1.15, -side, 0.08), rgb('calyx'))
    const tip = mesh.vertex(point(1.7, 0, 0.02), rgb('calyxTip'))
    const right = mesh.vertex(point(1.15, side, 0.08), rgb('calyx'))
    mesh.quad(base, left, tip, right)
  }
  return mesh.build()
}

/**
 * Una rodaja delgada vista desde arriba: una cara de anillos (`rings`, fracciones del radio, con su color por columna) y el
 * costado con la cáscara. `outline(a)` da el contorno en el ángulo `a`; la cara va a la altura `thickness`.
 */
function slice(mesh: MeshBuilder, outline: (a: number) => [number, number], rings: readonly number[], color: (ring: number, column: number) => RGB, columns: number, thickness: number, wall: RGB) {
  const angles = Array.from({ length: columns }, (_, j) => (j / columns) * Math.PI * 2)
  const ids = rings.slice(1).map((fraction, i) =>
    angles.map((a, j) => {
      const [x, z] = outline(a)
      return mesh.vertex([x * fraction, thickness, z * fraction], color(i + 1, j))
    }),
  )
  mesh.fan(mesh.vertex([0, thickness, 0], color(0, 0)), ids[0])
  for (let i = 0; i < ids.length - 1; i++) {
    for (let j = 0; j < columns; j++) {
      const next = (j + 1) % columns
      mesh.quad(ids[i][j], ids[i + 1][j], ids[i + 1][next], ids[i][next])
    }
  }
  mesh.grid(
    [thickness, 0].map((y) => angles.map((a): Vec3 => [outline(a)[0], y, outline(a)[1]])),
    [wall, wall].map((tone) => angles.map(() => tone)),
    true,
  )
}

/** Una rodaja de kiwi: el centro claro, el anillo de semillas negras, la carne verde y la cáscara café en el costado. */
function kiwiSlice(): FruitMesh {
  const mesh = new MeshBuilder()
  const rings = [0, 0.18, 0.3, 0.38, 0.44, 0.5, 0.62, 1]
  const flesh = (ring: number): RGB => {
    if (ring <= 1) return rgb('kiwiCore')
    if (ring === 2) return rgb('kiwiInner')
    if (ring === 7) return rgb('kiwiEdge')
    return rgb('kiwiFlesh')
  }
  // Las semillas: en el anillo de en medio, una columna sí y otra no.
  slice(mesh, (a) => [Math.sin(a) * 2.4, Math.cos(a) * 2.1], rings, (ring, column) => (ring === 4 && column % 2 === 0 ? rgb('kiwiSeed') : flesh(ring)), 24, 0.6, rgb('kiwiSkin'))
  return mesh.build()
}

/** Una estrella de carambola: el centro claro, las puntas más amarillas y el costado con la cáscara cerosa. */
function starfruitSlice(): FruitMesh {
  const mesh = new MeshBuilder()
  const outline = (a: number): [number, number] => {
    // Diez columnas: las pares son las puntas y las nones, los valles.
    const radius = Math.round((a / (Math.PI * 2)) * 10) % 2 === 0 ? 2.9 : 1.75
    return [Math.sin(a) * radius, Math.cos(a) * radius]
  }
  const color = (ring: number, column: number): RGB => {
    if (ring === 0) return rgb('starfruitCore')
    if (ring === 1) return rgb('starfruitInner')
    return column % 2 === 0 ? rgb('starfruitTip') : rgb('starfruitValley')
  }
  slice(mesh, outline, [0, 0.42, 1], color, 10, 0.7, rgb('starfruitWall'))
  return mesh.build()
}

/**
 * Una media luna (rebanada de durazno o de manzana) con el lado curvo hacia +z: `outer` es el radio del lado curvo, `span` el
 * ángulo que abarca y `width` lo ancho en el centro; el grueso va de `inner` (junto al hueso) a `rim` (la orilla) y se adelgaza
 * hacia las puntas. `across` son las filas de la cara, de adentro (0) hacia la orilla (1), con su color.
 */
type Crescent = { outer: number; span: number; width: number; inner: number; rim: number; across: readonly [number, RGB][]; outerWall: RGB; innerWall: RGB }

function crescent(mesh: MeshBuilder, spec: Crescent, offset: Vec3 = [0, 0, 0], turn = 0) {
  const steps = 10
  const ts = Array.from({ length: steps + 1 }, (_, i) => i / steps)
  const shift = spec.outer - spec.width / 2
  const place = (x: number, y: number, z: number): Vec3 => {
    const [cx, cz] = [x, z - shift]
    return [cx * Math.cos(turn) + cz * Math.sin(turn) + offset[0], y + offset[1], -cx * Math.sin(turn) + cz * Math.cos(turn) + offset[2]]
  }
  const point = (t: number, s: number, lifted: boolean): Vec3 => {
    const a = (t - 0.5) * spec.span
    const radius = spec.outer - spec.width * Math.sin(Math.PI * t) ** 0.8 * (1 - s)
    const height = lifted ? (spec.inner + (spec.rim - spec.inner) * s) * (0.35 + 0.65 * Math.sin(Math.PI * t) ** 0.5) : 0
    return place(Math.sin(a) * radius, height, Math.cos(a) * radius)
  }
  mesh.grid(
    spec.across.map(([s]) => ts.map((t) => point(t, s, true))),
    spec.across.map(([, tone]) => ts.map(() => tone)),
  )
  mesh.grid([ts.map((t) => point(t, 1, true)), ts.map((t) => point(t, 1, false))], [ts.map(() => spec.outerWall), ts.map(() => spec.outerWall)])
  mesh.grid([ts.map((t) => point(t, 0, false)), ts.map((t) => point(t, 0, true))], [ts.map(() => spec.innerWall), ts.map(() => spec.innerWall)])
}

/** Una media luna de durazno en almíbar: naranja, más gruesa en la orilla y un poco más roja junto al hueso. */
function peachSlice(): FruitMesh {
  const mesh = new MeshBuilder()
  crescent(mesh, {
    outer: 2.8,
    span: 1.75,
    width: 1.75,
    inner: 0.7,
    rim: 1.2,
    across: [[0, rgb('peachPit')], [0.5, rgb('peachTop')], [1, rgb('peachRim')]],
    outerWall: rgb('peachWall'),
    innerWall: rgb('peachPit'),
  })
  return mesh.build()
}

/**
 * La manzana roja en abanico: cuatro medias lunas delgadas (rebanadas de media manzana), encimadas y abiertas, con la carne clara
 * y la cáscara roja en la orilla, como en las fotos.
 */
function appleFan(): FruitMesh {
  const mesh = new MeshBuilder()
  const spec: Crescent = {
    outer: 3.4,
    span: 2.7,
    width: 2.5,
    inner: 0.3,
    rim: 0.45,
    across: [[0, rgb('appleFlesh')], [0.7, rgb('appleFlesh')], [0.9, rgb('appleFleshEdge')], [1, rgb('appleSkin')]],
    outerWall: rgb('appleSkinWall'),
    innerWall: rgb('appleFleshEdge'),
  }
  for (let k = 0; k < 4; k++) crescent(mesh, spec, [(k - 1.5) * 0.6, k * 0.3, (k - 1.5) * -0.15], (k - 1.5) * 0.12)
  return mesh.build()
}

/** Un elipsoide de `columns` por `rows`, con el color de abajo, de en medio y de arriba. */
function ellipsoid(mesh: MeshBuilder, center: Vec3, radii: Vec3, columns: number, rows: number, tones: [RGB, RGB, RGB]) {
  const points: Vec3[][] = []
  const colors: RGB[][] = []
  for (let i = 0; i <= rows; i++) {
    const phi = (i / rows) * Math.PI
    const y = -Math.cos(phi)
    const tone = y < 0 ? mixRgb(tones[1], tones[0], -y) : mixRgb(tones[1], tones[2], y)
    points.push(Array.from({ length: columns }, (_, j): Vec3 => {
      const a = (j / columns) * Math.PI * 2
      return [center[0] + Math.sin(phi) * Math.sin(a) * radii[0], center[1] + y * radii[1], center[2] + Math.sin(phi) * Math.cos(a) * radii[2]]
    }))
    colors.push(Array.from({ length: columns }, () => tone))
  }
  mesh.grid(points, colors, true)
}

/** Un racimito de cuatro uvas verdes: tres abajo y una encima, en el hueco. */
function grapeCluster(): FruitMesh {
  const mesh = new MeshBuilder()
  const radii: Vec3 = [0.85, 0.8, 1.05]
  const tones: [RGB, RGB, RGB] = [rgb('grapeShade'), rgb('grape'), rgb('grapeLight')]
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    ellipsoid(mesh, [Math.sin(a) * 0.98, 0.8, Math.cos(a) * 0.98], radii, 8, 6, tones)
  }
  ellipsoid(mesh, [0, 2.19, 0], radii, 8, 6, tones)
  return mesh.build()
}

/** Una rebanada de pera a lo largo: la silueta de la pera, la carne clara con el corazón y la cáscara verde amarilla. */
function pearSlice(): FruitMesh {
  const mesh = new MeshBuilder()
  // El medio ancho a lo largo, de la base (ancha) al cuello.
  const widths = [0, 1.25, 1.75, 1.8, 1.5, 1.05, 0.95, 0.75, 0]
  const along = [0, 0.08, 0.2, 0.35, 0.5, 0.62, 0.75, 0.88, 1]
  const x = (u: number) => -3.1 + 6.2 * u
  const outline: [number, number][] = [
    ...along.map((u, i): [number, number] => [x(u), widths[i]]),
    ...along.slice(1, -1).reverse().map((u, i): [number, number] => [x(u), -widths[widths.length - 2 - i]]),
  ]
  const center: [number, number] = [-0.8, 0]
  const thickness = 0.45
  const inner = outline.map(([px, pz]) => mesh.vertex([center[0] + (px - center[0]) * 0.86, thickness, center[1] + (pz - center[1]) * 0.86], rgb('pearFlesh')))
  const rim = outline.map(([px, pz]) => mesh.vertex([px, thickness, pz], rgb('pearSkin')))
  mesh.fan(mesh.vertex([center[0], thickness, center[1]], rgb('pearCore')), inner)
  for (let j = 0; j < outline.length; j++) {
    const next = (j + 1) % outline.length
    mesh.quad(inner[j], rim[j], rim[next], inner[next])
  }
  mesh.grid(
    [thickness, 0].map((y) => outline.map(([px, pz]): Vec3 => [px, y, pz])),
    [0, 1].map(() => outline.map(() => rgb('pearWall'))),
    true,
  )
  return mesh.build()
}

/** Un physalis: la bolita naranja sobre su cáscara de papel, abierta hacia arriba en cinco pétalos. */
function physalis(): FruitMesh {
  const mesh = new MeshBuilder()
  ellipsoid(mesh, [0, 0.9, 0], [0.85, 0.85, 0.85], 8, 6, [rgb('physalis'), rgb('physalis'), rgb('physalisLight')])
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3
    const point = (radius: number, offset: number, y: number): Vec3 => [Math.sin(a + offset) * radius, y, Math.cos(a + offset) * radius]
    const base = mesh.vertex(point(0.3, 0, 0), rgb('husk'))
    const left = mesh.vertex(point(1.15, -0.42, 0.6), rgb('husk'))
    const middle = mesh.vertex(point(1.05, 0, 0.42), rgb('husk'))
    const right = mesh.vertex(point(1.15, 0.42, 0.6), rgb('husk'))
    const tip = mesh.vertex(point(1.75, 0, 1.25), rgb('huskTip'))
    mesh.triangle(base, left, middle)
    mesh.triangle(base, middle, right)
    mesh.triangle(left, tip, middle)
    mesh.triangle(middle, tip, right)
  }
  return mesh.build()
}

/** Una rodaja de plátano: el centro un poco más oscuro con sus semillitas, la carne clara y el costado amarillo pálido. */
function bananaSlice(): FruitMesh {
  const mesh = new MeshBuilder()
  const rings = [0, 0.16, 0.26, 0.6, 1]
  const color = (ring: number, column: number): RGB => {
    if (ring <= 1) return rgb('bananaCore')
    if (ring === 2) return column % 3 === 0 ? rgb('bananaSeed') : rgb('bananaCore')
    return ring === 4 ? rgb('bananaEdge') : rgb('bananaFlesh')
  }
  slice(mesh, (a) => [Math.sin(a) * 1.6, Math.cos(a) * 1.45], rings, color, 18, 0.55, rgb('bananaSkin'))
  return mesh.build()
}

const BUILDERS: Record<FruitPiece, () => FruitMesh> = {
  strawberryHalf,
  strawberryWhole,
  kiwiSlice,
  peachSlice,
  appleFan,
  grapeCluster,
  starfruitSlice,
  pearSlice,
  physalis,
  bananaSlice,
}

export const FRUIT_PIECES = Object.keys(BUILDERS) as readonly FruitPiece[]

const meshes = new Map<FruitPiece, FruitMesh>()

/** La malla de una pieza, armada la primera vez que se pide y guardada (son arreglos chicos, unos cientos de vértices). */
export function fruitMesh(piece: FruitPiece): FruitMesh {
  let mesh = meshes.get(piece)
  if (!mesh) {
    mesh = BUILDERS[piece]()
    meshes.set(piece, mesh)
  }
  return mesh
}

export function pieceTriangles(piece: FruitPiece): number {
  return fruitMesh(piece).indices.length / 3
}

type PieceSize = { radius: number; height: number; halfX: number; halfZ: number }
const sizes = new Map<FruitPiece, PieceSize>()

/**
 * Lo que mide una pieza en cm, sin girar: hasta dónde llega a lo ancho desde su centro (en cualquier dirección y a lo largo de x y
 * de z) y su alto. Se mide una vez.
 */
function pieceSize(piece: FruitPiece): PieceSize {
  let size = sizes.get(piece)
  if (!size) {
    const { positions } = fruitMesh(piece)
    size = { radius: 0, height: 0, halfX: 0, halfZ: 0 }
    for (let i = 0; i < positions.length; i += 3) {
      size.radius = Math.max(size.radius, Math.hypot(positions[i], positions[i + 2]))
      size.height = Math.max(size.height, positions[i + 1])
      size.halfX = Math.max(size.halfX, Math.abs(positions[i]))
      size.halfZ = Math.max(size.halfZ, Math.abs(positions[i + 2]))
    }
    sizes.set(piece, size)
  }
  return size
}

/** Una pieza colocada en las coordenadas del piso (la `y` es la de su base), con su giro, inclinación, escala y alcance. */
export type FruitPlacement = {
  kind: FruitKind
  piece: FruitPiece
  p: Vec3
  /** Giro sobre su eje vertical. */
  yaw: number
  /** Cuánto se inclina hacia `toward` (una dirección horizontal de largo 1). */
  tilt: number
  toward: [number, number]
  /** Unidades de escena por cm de la pieza: la de los moldes con una variación chica. */
  scale: number
  /** Hasta dónde llega a lo ancho desde `p`, ya girada e inclinada, en unidades de escena. */
  reach: number
  /** Variación de brillo de la instancia (0.06 es 6 % más clara). */
  tint: number
}

export type FruitLayout = { layout: FruitLayoutKind; placements: FruitPlacement[]; triangles: number }

/**
 * Lo que se aparta en la tapa por el mensaje o la oblea, en unidades de escena y en coordenadas del piso (la `z` hacia el frente,
 * al revés de la `y` de la tapa), con el giro de `Lid.tsx`.
 */
export type KeepOut = { kind: 'circle'; x: number; z: number; r: number } | { kind: 'rect'; x: number; z: number; halfX: number; halfZ: number; angle: number }

/** La sombra del relieve del mensaje sale 0.3 cm de sus letras (`RELIEF_PAD_CM`). */
const MESSAGE_PAD_CM = 0.3

/** Lo que ocupan el mensaje y la oblea en la tapa, en ese orden; nada sin tapa. */
export function lidKeepOut(lid: CakeLid | undefined): KeepOut[] {
  if (!lid) return []
  const u = lid.unitsPerCm
  const areas: KeepOut[] = []
  if (lid.message) {
    const { bounds, rotation, x, y } = lid.message
    const angle = (-rotation * Math.PI) / 180
    const [cx, cz] = [((bounds.minX + bounds.maxX) / 2) * u, (-(bounds.minY + bounds.maxY) / 2) * u]
    areas.push({
      kind: 'rect',
      x: x * u + cx * Math.cos(angle) + cz * Math.sin(angle),
      z: -y * u - cx * Math.sin(angle) + cz * Math.cos(angle),
      halfX: ((bounds.maxX - bounds.minX) / 2 + MESSAGE_PAD_CM) * u,
      halfZ: ((bounds.maxY - bounds.minY) / 2 + MESSAGE_PAD_CM) * u,
      angle,
    })
  }
  if (lid.wafer) {
    const { shape, widthCm, heightCm, rotation, x, y } = lid.wafer
    areas.push(
      shape === 'circle'
        ? { kind: 'circle', x: x * u, z: -y * u, r: (widthCm / 2) * u }
        : { kind: 'rect', x: x * u, z: -y * u, halfX: (widthCm / 2) * u, halfZ: (heightCm / 2) * u, angle: (-rotation * Math.PI) / 180 },
    )
  }
  return areas
}

/** La distancia de un punto de la tapa a lo que se aparta: positiva afuera, negativa adentro. */
export function keepOutGap(area: KeepOut, x: number, z: number): number {
  const [dx, dz] = [x - area.x, z - area.z]
  if (area.kind === 'circle') return Math.hypot(dx, dz) - area.r
  // Al marco del área (el giro de three sobre y, al revés).
  const lx = dx * Math.cos(area.angle) - dz * Math.sin(area.angle)
  const lz = dx * Math.sin(area.angle) + dz * Math.cos(area.angle)
  const [qx, qz] = [Math.abs(lx) - area.halfX, Math.abs(lz) - area.halfZ]
  return qx <= 0 && qz <= 0 ? Math.max(qx, qz) : Math.hypot(Math.max(qx, 0), Math.max(qz, 0))
}

/** Aire entre la fruta y el borde de duya, el mensaje o la oblea, en cm. */
const CLEARANCE_CM = 0.4
/** El montón llega a esta parte del radio libre: en las fotos cubre del 40 al 60 % de la cara de arriba. */
const MOUND_SHARE = 0.85
/**
 * Cuánto se encima una pieza con su vecina: su alcance es generoso (una media luna no llena su círculo). En el montón se enciman
 * más, como en las fotos; en el anillo, apenas (las filas van como tejas, ver `ROW_STEP`).
 */
const MOUND_PACKING = 0.55
/** Dos piezas del mismo tono no van más cerca que esta parte de la suma de sus alcances (`TONE`). */
const TONE_SPACING = 0.95
const RING_PACKING = 0.8
/** Una pieza no va donde ocupa más que esta parte del radio de su lugar (el abanico de manzana no cabe en el montón de un mini). */
const LARGEST_SHARE = 0.7
/** Lo que se levanta de más cada pieza, en cm: dos rebanadas encimadas no quedan en el mismo plano. */
const LIFT_JITTER_CM = 0.15
/** Cada pieza mide de 0.92 a 1.08 veces su tamaño de cm, para que no salgan todas iguales. */
const MAX_SCALE = 1.08
/** Las capas del montón: cada una más chica que la de abajo, y solo una pieza baja y plana sostiene a otra. */
const MOUND_LAYERS = 3
const LAYER_SHRINK = 0.62
const SUPPORT_MAX_HEIGHT_CM = 1.7
/** Intentos de colocar una pieza antes de pasar a la siguiente, y fallas seguidas con que termina una capa. */
const TRIES = 24
const GIVE_UP = 40
/**
 * El montón tupido (`CakeTopping.density` en 2), medido en las fotos de choco vainilla, cajeta y capuchino: la fruta llena toda la
 * parte de la tapa que dejan libre los copos o las conchas, con las piezas encimadas, en cinco capas que casi no se achican y con
 * las de arriba más paradas, y las piezas miden hasta 12 % más que las de la malla.
 */
const DENSE_GROWTH = 0.12
const DENSE = { share: 1, packing: 0.3, layers: 5, shrink: 0.8, upright: 0.3 }
/**
 * De 2 a 3 (la foto de capuchino): dos capas más, cada una más ancha y encimada, y las piezas hasta 18 % más grandes. En filas, de
 * 1 a 3 las piezas se enciman y las filas se juntan hasta 55 %, como la foto de flan y cajeta.
 */
const DENSE_HIGH = { growth: 0.18, packing: 0.08, layers: 2, shrink: 0.06, upright: 0.1 }
const DENSE_ROWS = { low: 0.45, high: 0.1 }
/** Lo tupido en dos tramos: `low` de 1 a 2 y `high` de 2 a 3. */
const denseParts = (dense: number) => ({ low: Math.min(1, dense), high: Math.max(0, dense - 1) })
const growthOf = (dense: number) => {
  const { low, high } = denseParts(dense)
  return 1 + DENSE_GROWTH * low + DENSE_HIGH.growth * high
}
const lerp = (from: number, to: number, t: number) => from + (to - from) * t

type Form = NonNullable<CakeShape['form']>

/** La parte libre de la tapa: sin el canto redondeado, sin lo que llega del borde de duya y con su aire. Medio largo y medio ancho. */
function freeArea(tier: CakeTier, form: Form, decoration: TierDecoration | undefined, clearance: number, minimumInset = 0): { halfX: number; halfZ: number } {
  const { x: hx, z: hz } = halfExtents(tier, form)
  let inset = Math.max(TIER_EDGE_UNITS, minimumInset)
  for (const part of decoration?.parts ?? []) {
    for (const placement of part.placements) {
      // Solo lo que va sobre la tapa (las conchas, rosetones y rosas del borde); lo del costado queda afuera.
      if (placement.p[1] <= tier.height - 0.045) continue
      const [x, , z] = placement.p
      const depth = form === 'round' ? tier.radius - Math.hypot(x, z) : Math.min(hx - Math.abs(x), hz - Math.abs(z))
      inset = Math.max(inset, depth + PART_REACH[part.shape] * Math.max(...placement.s))
    }
  }
  return { halfX: Math.max(0, hx - inset - clearance), halfZ: Math.max(0, hz - inset - clearance) }
}

type Context = {
  /** Lo tupido del montón (`CakeTopping.density`), de 0 (el de siempre) a 1 (toda la parte libre). */
  dense: number
  /** Los triángulos que puede usar la fruta (`fruitBudget`). */
  budget: number
  form: Form
  free: { halfX: number; halfZ: number }
  keepOut: KeepOut[]
  clearance: number
  units: number
  top: number
  random: () => number
  placements: FruitPlacement[]
  triangles: number
}

/** Una pieza de esa fruta, con su escala y su alcance ya inclinada. */
function candidate(context: Context, kind: FruitKind, tilt: number) {
  const options = KIND_PIECES[kind]
  const piece = options[Math.floor(context.random() * options.length)]
  const scale = context.units * growthOf(context.dense) * (MAX_SCALE - 0.16 + context.random() * 0.16)
  const size = pieceSize(piece)
  return { kind, piece, scale, reach: scale * (size.radius + size.height * Math.sin(tilt)) }
}

/** ¿Cabe una pieza con ese alcance en ese punto: dentro de la parte libre y lejos del mensaje y de la oblea? */
function fits(context: Context, x: number, z: number, reach: number): boolean {
  const { free, form } = context
  const inside = form === 'round' ? Math.hypot(x, z) + reach <= free.halfX : Math.abs(x) + reach <= free.halfX && Math.abs(z) + reach <= free.halfZ
  return inside && context.keepOut.every((area) => keepOutGap(area, x, z) >= reach + context.clearance)
}

/** ¿Choca con las piezas de su capa (las de `others`)? */
const crowded = (others: readonly FruitPlacement[], x: number, z: number, reach: number, packing: number) =>
  others.some((other) => Math.hypot(other.p[0] - x, other.p[2] - z) < (other.reach + reach) * packing)

/** ¿Queda junto a una pieza del mismo tono? Así el montón alterna colores y no junta dos rojos. */
const sameToneNear = (others: readonly FruitPlacement[], kind: FruitKind, x: number, z: number, reach: number) =>
  others.some((other) => TONE[other.kind] === TONE[kind] && Math.hypot(other.p[0] - x, other.p[2] - z) < (other.reach + reach) * TONE_SPACING)

/** Agrega la pieza si cabe en el presupuesto de triángulos; si no, avisa que ya no cabe nada. */
function place(context: Context, placement: FruitPlacement): boolean {
  const cost = pieceTriangles(placement.piece)
  if (context.triangles + cost > context.budget) return false
  context.placements.push(placement)
  context.triangles += cost
  return true
}

/** Reparte las frutas: la primera vuelta de la grande a la chica (las grandes abajo y al centro), luego en un orden al azar. */
function kindSequence(fruits: readonly FruitKind[], random: () => number) {
  let round = 0
  let queue: FruitKind[] = []
  return () => {
    if (queue.length === 0) {
      queue = [...fruits]
      if (round === 0) queue.sort((a, b) => pieceSize(KIND_PIECES[b][0]).radius - pieceSize(KIND_PIECES[a][0]).radius)
      else for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[queue[i], queue[j]] = [queue[j], queue[i]]
      }
      round++
    }
    return queue.shift() as FruitKind
  }
}

const away = (x: number, z: number, random: () => number): [number, number] => {
  const length = Math.hypot(x, z)
  if (length > 1e-9) return [x / length, z / length]
  const a = random() * Math.PI * 2
  return [Math.sin(a), Math.cos(a)]
}

/**
 * El montón: una capa de piezas casi planas en el centro y, encima, capas más chicas que se recargan hacia afuera; cada pieza de
 * arriba descansa sobre una plana de la capa de abajo.
 */
function mound(context: Context, fruits: readonly FruitKind[]) {
  const { free, random, dense } = context
  const { low, high } = denseParts(dense)
  const next = kindSequence(fruits, random)
  const share = lerp(MOUND_SHARE, DENSE.share, low)
  const packing = lerp(MOUND_PACKING, DENSE.packing, low) - DENSE_HIGH.packing * high
  const layers = Math.round(lerp(MOUND_LAYERS, DENSE.layers, low) + DENSE_HIGH.layers * high)
  const giveUp = Math.round(GIVE_UP * (1 + 2 * dense))
  const radii = { x: free.halfX * share, z: free.halfZ * share }
  let below: FruitPlacement[] = []
  for (let layer = 0; layer < layers; layer++) {
    const shrink = (lerp(LAYER_SHRINK, DENSE.shrink, low) + DENSE_HIGH.shrink * high) ** layer
    const [rx, rz] = [radii.x * shrink, radii.z * shrink]
    const supports = below.filter((placement) => pieceSize(placement.piece).height * placement.scale <= SUPPORT_MAX_HEIGHT_CM * context.units)
    if (layer > 0 && supports.length === 0) break
    const current: FruitPlacement[] = []
    let failures = 0
    // En el montón tupido ninguna fruta se adueña: una chica (el plátano, el physalis) no llena lo que no cupo de las grandes.
    const counts = new Map<FruitKind, number>()
    const overused = (kind: FruitKind) => (counts.get(kind) ?? 0) > 2 + (1.4 * context.placements.length) / fruits.length
    while (failures < giveUp) {
      const kind = next()
      if (dense > 0 && overused(kind)) continue
      let placed = false
      for (let attempt = 0; attempt < TRIES && !placed; attempt++) {
        // Un domo: abajo, las piezas se recargan hacia afuera más cuanto más lejos del centro; arriba, todas se paran más, como las
        // rebanadas de manzana de las fotos.
        const a = random() * Math.PI * 2
        const d = Math.sqrt(random())
        const tilt = layer === 0 ? 0.05 + 0.2 * d : 0.4 + random() * 0.35 + DENSE.upright * low + DENSE_HIGH.upright * high
        const piece = candidate(context, kind, tilt)
        if (piece.reach > LARGEST_SHARE * Math.min(rx, rz)) continue
        // Dentro del montón la pieza completa, no solo su centro: el centro cae a un alcance de su orilla.
        const x = Math.sin(a) * d * Math.max(0, rx - piece.reach)
        const z = Math.cos(a) * d * Math.max(0, rz - piece.reach)
        if (!fits(context, x, z, piece.reach) || crowded(current, x, z, piece.reach, packing)) continue
        // El contraste solo cuenta mientras quedan intentos: una fruta que no encuentra lugar lejos de su tono no deja un hueco.
        if (attempt < TRIES - 4 && sameToneNear(context.placements, kind, x, z, piece.reach)) continue
        let y = context.top + random() * LIFT_JITTER_CM * context.units
        if (layer > 0) {
          const support = supports.find((other) => Math.hypot(other.p[0] - x, other.p[2] - z) < other.reach * 0.7)
          if (!support) continue
          y = support.p[1] + pieceSize(support.piece).height * support.scale * 0.85
        }
        const toward = away(x, z, random)
        const placement: FruitPlacement = { kind, piece: piece.piece, p: [x, y, z], yaw: random() * Math.PI * 2, tilt, toward, scale: piece.scale, reach: piece.reach, tint: (random() - 0.5) * 0.12 }
        if (!place(context, placement)) return
        current.push(placement)
        counts.set(kind, (counts.get(kind) ?? 0) + 1)
        placed = true
      }
      failures = placed ? 0 : failures + 1
    }
    below = current
  }
}

/** Una vuelta junto a la orilla, por dentro del borde: cada pieza toca la orilla de la parte libre, con su lado curvo hacia afuera. */
function ring(context: Context, fruits: readonly FruitKind[]) {
  const { free, random } = context
  const next = kindSequence(fruits, random)
  const tilt = 0.12
  const largest = LARGEST_SHARE * Math.min(free.halfX, free.halfZ)
  // Una fruta que no cupo donde iba (junto al mensaje, la oblea o la pieza anterior) espera y va primero en cuanto se coloca otra.
  const waiting: FruitKind[] = []
  /**
   * La siguiente pieza que quepa en la vuelta: primero las que esperan (salvo con `fresh`, al pasar de largo un lugar ocupado),
   * luego las de la lista. Una que taparía el centro (el abanico en un mini) se cambia por la siguiente fruta.
   */
  const upcoming = (fresh = false) => {
    for (let tries = 0; tries < fruits.length * 3; tries++) {
      const kind = !fresh && waiting.length > 0 ? (waiting.shift() as FruitKind) : next()
      const piece = candidate(context, kind, tilt)
      if (piece.reach <= largest) return piece
    }
    return null
  }
  /** El contorno por el que va el centro de una pieza: la orilla de la parte libre, recorrida hacia adentro lo que mide. */
  const outlineOf = (reach: number) => perimeterOf({ radius: free.halfX - reach, halfWidth: free.halfX - reach, halfDepth: free.halfZ - reach }, context.form)
  const start = random()
  // La vuelta se mide en fracción del contorno; cada pieza la recorre en su propio contorno (más adentro si es más grande).
  let travelled = 0
  let piece = upcoming()
  while (piece && travelled < 1) {
    const outline = outlineOf(piece.reach)
    const at = outline.at(((start + travelled) % 1) * outline.length)
    if (!fits(context, at.x, at.z, piece.reach) || crowded(context.placements, at.x, at.z, piece.reach, RING_PACKING)) {
      // Junto al mensaje o a la oblea, o encima de la anterior: se recorre un poco más y se prueba con la fruta que sigue, que
      // puede ser más chica.
      travelled += (piece.reach * 0.25) / outline.length
      if (!waiting.includes(piece.kind)) waiting.push(piece.kind)
      piece = upcoming(true)
      continue
    }
    const placement: FruitPlacement = {
      kind: piece.kind,
      piece: piece.piece,
      p: [at.x, context.top, at.z],
      yaw: Math.atan2(at.nx, at.nz) + (random() - 0.5) * 0.3,
      tilt,
      toward: [-at.nx, -at.nz],
      scale: piece.scale,
      reach: piece.reach,
      tint: (random() - 0.5) * 0.12,
    }
    if (!place(context, placement)) return
    // Hasta la siguiente: la mitad de esta más la mitad de la que sigue, con lo que se enciman.
    const following = upcoming()
    if (following) travelled += ((piece.reach + following.reach) * RING_PACKING) / outlineOf(following.reach).length
    piece = following
  }
}

/**
 * Las filas como en la foto del pastel con flan y cajeta: cada rebanada se encima con la anterior como tejas (avanza `ROW_STEP` de
 * su ancho y se recarga `ROW_TILT` sobre ella), y cada fila avanza sobre la anterior `ROW_SPACING` de la suma de sus fondos (lo que
 * mide la pieza a lo largo de z, no su alcance: una media luna es más angosta que el círculo que la envuelve).
 */
const ROW_STEP = 0.95
const ROW_TILT = 0.3
const ROW_SPACING = 0.9

/**
 * Filas de atrás hacia el frente, cada una de una fruta, en el orden de la lista, con el bloque centrado en la tapa. Una fruta que
 * no cabe en una fila de esta tapa (el abanico en un mini) se salta.
 */
function rows(context: Context, fruits: readonly FruitKind[]) {
  const { free, random } = context
  // Con lo tupido (flan y cajeta), las piezas se enciman más a lo largo de la fila y las filas se juntan.
  const { low, high } = denseParts(context.dense)
  const tighter = 1 - DENSE_ROWS.low * low - DENSE_ROWS.high * high
  const rowStep = ROW_STEP * tighter
  const rowSpacing = ROW_SPACING * tighter
  const largest = LARGEST_SHARE * Math.min(free.halfX, free.halfZ)
  // Lo más grande de cada fruta (con la escala más grande): su alcance ya recargada, su ancho a lo largo de la fila y su fondo.
  const largestOf = (kind: FruitKind, measure: (size: PieceSize) => number) =>
    context.units * MAX_SCALE * growthOf(context.dense) * Math.max(...KIND_PIECES[kind].map((piece) => measure(pieceSize(piece))))
  const reachOf = (kind: FruitKind) => largestOf(kind, (size) => size.radius + size.height * Math.sin(ROW_TILT))
  const usable = fruits.filter((kind) => reachOf(kind) <= largest)
  if (usable.length === 0) return
  // Primero, cuántas filas caben a lo largo; luego se centran.
  const plan: { kind: FruitKind; reach: number; width: number; depth: number; z: number }[] = []
  for (let i = 0; ; i++) {
    const kind = usable[i % usable.length]
    const depth = largestOf(kind, (size) => size.halfZ)
    const reach = reachOf(kind)
    const last = plan[plan.length - 1]
    // Entre filas cuenta el fondo; en las orillas del bloque, el alcance, para que la primera y la última quepan en la tapa.
    const z = last ? last.z + (last.depth + depth) * rowSpacing : reach
    if (z + reach > 2 * free.halfZ) break
    plan.push({ kind, reach, width: largestOf(kind, (size) => size.halfX + size.height * Math.sin(ROW_TILT)), depth, z })
  }
  const last = plan[plan.length - 1]
  if (!last) return
  const offset = -(last.z + last.reach) / 2
  for (const row of plan) {
    const lineZ = row.z + offset
    // A lo ancho, la fila se reparte pareja y centrada en lo que deja la orilla a esa altura.
    const halfSpan = context.form === 'round' ? Math.sqrt(Math.max(0, (free.halfX - row.reach) ** 2 - lineZ ** 2)) : free.halfX - row.reach
    const count = Math.floor((2 * halfSpan) / (row.width * rowStep)) + 1
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 0 : -halfSpan + (2 * halfSpan * i) / (count - 1)
      const piece = candidate(context, row.kind, ROW_TILT)
      // Junto al mensaje o a la oblea, la pieza se queda fuera y la fila sigue.
      if (!fits(context, x, lineZ, piece.reach)) continue
      // Cada una un poco más arriba que la anterior, recargada sobre ella.
      const y = context.top + (i % 2) * LIFT_JITTER_CM * context.units
      const placement: FruitPlacement = { kind: row.kind, piece: piece.piece, p: [x, y, lineZ], yaw: (random() - 0.5) * 0.2, tilt: ROW_TILT, toward: [-1, 0], scale: piece.scale, reach: piece.reach, tint: (random() - 0.5) * 0.12 }
      if (!place(context, placement)) return
    }
  }
}

const SEEDS: Record<FruitLayoutKind, number> = { mound: 20261118, ring: 20261119, rows: 20261120 }

/**
 * La fruta del último piso de `shape`, en las coordenadas de ese piso; `null` sin fruta. `decoration` es la decoración ya colocada
 * de ese piso (`tierDecoration`), para no meterse en el borde. Con mensaje u oblea en la tapa, la fruta va en una vuelta junto a la
 * orilla, alrededor de ellos, y se aparta de lo que ocupan.
 */
export function fruitLayout(shape: CakeShape, decoration?: TierDecoration, avoid?: { inset: number; areas: readonly KeepOut[] }): FruitLayout | null {
  const topping = shape.topping
  const tier = shape.tiers[shape.tiers.length - 1]
  if (!topping || topping.kind !== 'fruit' || !tier) return null
  const form = shape.form ?? 'round'
  const keepOut = lidKeepOut(shape.lid)
  const layout: FruitLayoutKind = keepOut.length > 0 ? 'ring' : topping.layout
  const fruits = topping.fruits?.length ? [...new Set(topping.fruits)] : DEFAULT_FRUITS
  const clearance = CLEARANCE_CM * topping.unitsPerCm
  const context: Context = {
    dense: denseOf(topping),
    budget: fruitBudget(topping),
    form,
    // `avoid` es lo que ocupan los detalles de las imágenes del catálogo (las conchas de chocolate, `sampleDetails.ts`): no cambia el acomodo.
    free: freeArea(tier, form, decoration, clearance, avoid?.inset ?? 0),
    keepOut: [...keepOut, ...(avoid?.areas ?? [])],
    clearance,
    units: topping.unitsPerCm,
    top: tier.height,
    random: seededRandom(SEEDS[layout]),
    placements: [],
    triangles: 0,
  }
  if (layout === 'mound') mound(context, fruits)
  else if (layout === 'ring') ring(context, fruits)
  else rows(context, fruits)
  return { layout, placements: context.placements, triangles: context.triangles }
}
