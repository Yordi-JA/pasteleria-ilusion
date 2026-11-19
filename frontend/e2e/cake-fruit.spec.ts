import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions } from './support/cake-design.ts'
import { mountCakeScene } from './support/cake-scene.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * La fruta fresca sobre la tapa del último piso (tanda 4b): solo para las imágenes del catálogo, no se pide en "Diseña tu pastel".
 * Los módulos puros se importan en el navegador desde el servidor de desarrollo, como en `cake-comb.spec.ts`: la geometría y el
 * acomodo (`src/three/fruit.ts`), el presupuesto de triángulos (`pieceBudget.ts`) y los moldes (`cakeMolds.ts`). La última prueba
 * prende la fruta en la escena solo con la forma (`CakeShape.topping`).
 */
const URLS = {
  fruit: '/src/three/fruit.ts',
  budget: '/src/three/pieceBudget.ts',
  decoration: '/src/three/decorationLayout.ts',
  models: '/src/models/cakeDesign.ts',
  molds: '/src/viewmodels/cakeMolds.ts',
}

/** El canto redondeado de la tapa (`TIER_EDGE_UNITS`) y las unidades de escena por cm de los moldes (`UNITS_PER_CM`). */
const EDGE = 0.06
const U = 0.068
const COVERAGE = '#f2ede7'

type Layout = 'mound' | 'ring' | 'rows'
type Size = 'mini' | 'showcase' | { kg: number; tiers: number; form: 'round' | 'rectangular' } | { diameterCm: number; tiers: number }
type Decoration = { kind: 'rosettes' | 'shells'; main: string; accent: string } | { kind: 'roses'; petals: string[]; leaf: string }
type Lid = {
  message?: { x: number; y: number; rotation: number; bounds: { minX: number; maxX: number; minY: number; maxY: number } }
  wafer?: { shape: 'sheet' | 'circle'; widthCm: number; heightCm: number; rotation: number; x: number; y: number }
}
type CakeCase = { size: Size; layout: Layout; fruits?: string[]; decoration?: Decoration; lid?: Lid; density?: number }

type Placement = { kind: string; piece: string; p: [number, number, number]; yaw: number; tilt: number; scale: number; reach: number }
type Area = { kind: 'circle'; x: number; z: number; r: number } | { kind: 'rect'; x: number; z: number; halfX: number; halfZ: number; angle: number }
type Result = {
  form: 'round' | 'rectangular'
  top: { radius: number; halfX: number; halfZ: number; height: number }
  layout: { layout: Layout; placements: Placement[]; triangles: number } | null
  pieceTriangles: Record<string, number>
  keepOut: Area[]
  gaps: number[][]
  decorationTop: { p: [number, number, number]; reach: number }[]
  budget: { scene: number; fruitBudget: number; total: number; scale: number }
}

/** Arma el pastel con los moldes de la pastelería (los del simulador de la API), le pone la fruta y devuelve el acomodo. */
async function fruitOn(page: Page, cake: CakeCase): Promise<Result> {
  return page.evaluate(
    async ({ urls, options, cake, coverage, units }) => {
      const fruit = await import(urls.fruit)
      const { pieceDensityScale, sceneTriangles, TRIANGLE_BUDGET } = await import(urls.budget)
      const { tierDecoration, PART_REACH } = await import(urls.decoration)
      const { parseCakeDesignOptions } = await import(urls.models)
      const { tierSizes } = await import(urls.molds)
      const parsed = parseCakeDesignOptions(options)
      const height = 0.72
      let form: 'round' | 'rectangular' = 'round'
      let tiers: Record<string, unknown>[]
      if (cake.size === 'mini' || cake.size === 'showcase') {
        const option = parsed.sizes.find((size: { code: string }) => size.code === cake.size)
        tiers = [{ radius: (option.diameterCm * units) / 2, height: option.heightCm * units, frosting: coverage }]
      } else if ('diameterCm' in cake.size) {
        const { diameterCm, tiers: count } = cake.size
        tiers = Array.from({ length: count }, (_, i) => ({ radius: (diameterCm * units * 0.8 ** i) / 2, height, frosting: coverage }))
      } else {
        form = cake.size.form
        tiers = tierSizes(parsed, form, cake.size.kg, cake.size.tiers).map((size: { lengthCm: number; widthCm: number }) =>
          form === 'round'
            ? { radius: (size.lengthCm * units) / 2, height, frosting: coverage }
            : { radius: (size.widthCm * units) / 2, halfWidth: (size.lengthCm * units) / 2, halfDepth: (size.widthCm * units) / 2, height, frosting: coverage },
        )
      }
      const lid = cake.lid
        ? {
            unitsPerCm: units,
            ...(cake.lid.wafer ? { wafer: { ...cake.lid.wafer, image: new Image(), imageWidth: 10, imageHeight: 10, imageZoom: 1, imageX: 0, imageY: 0 } } : {}),
            ...(cake.lid.message
              ? { message: { ...cake.lid.message, glyphs: [], fontSizeCm: 2, baselineCm: 0.3, fontFamily: 'serif', fontWeight: 400, color: '#000000' } }
              : {}),
          }
        : undefined
      const shape = {
        tiers,
        festoons: false,
        stand: true,
        form,
        fitStand: true,
        ...(cake.decoration ? { decoration: cake.decoration } : {}),
        ...(lid ? { lid } : {}),
        topping: {
          kind: 'fruit',
          layout: cake.layout,
          ...(cake.fruits ? { fruits: cake.fruits } : {}),
          ...(cake.density ? { density: cake.density } : {}),
          unitsPerCm: units,
        },
      }
      const scale = pieceDensityScale(shape)
      const top = shape.tiers.length - 1
      const decoration = tierDecoration(shape, top, scale)
      const layout = fruit.fruitLayout(shape, decoration)
      const keepOut = fruit.lidKeepOut(shape.lid)
      const placements: Placement[] = layout?.placements ?? []
      const topTier = shape.tiers[top] as { radius: number; halfWidth?: number; halfDepth?: number; height: number }
      const decorationTop = decoration.parts.flatMap((part: { shape: string; placements: { p: [number, number, number]; s: number[] }[] }) =>
        part.placements
          .filter((placement) => placement.p[1] > topTier.height - 0.045)
          .map((placement) => ({ p: placement.p, reach: PART_REACH[part.shape] * Math.max(...placement.s) })),
      )
      const scene = sceneTriangles(shape, scale)
      return {
        form,
        top: {
          radius: topTier.radius,
          halfX: form === 'round' ? topTier.radius : (topTier.halfWidth ?? 0),
          halfZ: form === 'round' ? topTier.radius : (topTier.halfDepth ?? 0),
          height: topTier.height,
        },
        layout: layout ? { layout: layout.layout, placements, triangles: layout.triangles } : null,
        pieceTriangles: Object.fromEntries(fruit.FRUIT_PIECES.map((piece: string) => [piece, fruit.pieceTriangles(piece)])),
        keepOut,
        gaps: placements.map((placement) => keepOut.map((area: Area) => fruit.keepOutGap(area, placement.p[0], placement.p[2]))),
        decorationTop,
        budget: { scene, fruitBudget: fruit.FRUIT_TRIANGLE_BUDGET, total: TRIANGLE_BUDGET, scale },
      }
    },
    { urls: URLS, options: cakeDesignOptions, cake, coverage: COVERAGE, units: U },
  )
}

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  // Una vista sin pastel 3D: solo cuenta lo que importan las pruebas.
  await page.goto('/legal')
})

const SIZES: [string, Size][] = [
  ['mini', 'mini'],
  ['showcase', 'showcase'],
  ['4 kg', { kg: 4, tiers: 1, form: 'round' }],
  ['top of two tiers', { kg: 8, tiers: 2, form: 'round' }],
  ['rectangular', { kg: 6, tiers: 1, form: 'rectangular' }],
]
const LAYOUTS: Layout[] = ['mound', 'ring', 'rows']

/** Lo que le falta a una pieza para salirse de la parte plana de la tapa (negativo si se sale). */
function room(result: Result, placement: Placement): number {
  const [x, , z] = placement.p
  if (result.form === 'round') return result.top.radius - EDGE - (Math.hypot(x, z) + placement.reach)
  return Math.min(result.top.halfX - EDGE - (Math.abs(x) + placement.reach), result.top.halfZ - EDGE - (Math.abs(z) + placement.reach))
}

test('every piece stays on the flat of the top face, inside its rounded edge, on any size and layout', async ({ page }) => {
  for (const [name, size] of SIZES) {
    for (const layout of LAYOUTS) {
      const result = await fruitOn(page, { size, layout })
      const label = `${name}, ${layout}`
      expect(result.layout, label).not.toBeNull()
      expect(result.layout!.placements.length, label).toBeGreaterThan(2)
      for (const placement of result.layout!.placements) {
        expect(room(result, placement), label).toBeGreaterThanOrEqual(-1e-9)
        // Sobre la tapa o sobre otra fruta, nunca hundida en el pastel ni flotando: un montón no pasa de unos 6 cm.
        expect(placement.p[1], label).toBeGreaterThanOrEqual(result.top.height - 1e-9)
        expect(placement.p[1] - result.top.height, label).toBeLessThanOrEqual(6 * U)
      }
    }
  }
})

test('a piece measures the same centimeters on a mini and on a 4 kg cake, and the bigger cake carries more pieces', async ({ page }) => {
  const mini = await fruitOn(page, { size: 'mini', layout: 'mound' })
  const big = await fruitOn(page, { size: { kg: 4, tiers: 1, form: 'round' }, layout: 'mound' })
  for (const result of [mini, big]) {
    for (const placement of result.layout!.placements) {
      // La escala de la pieza es la de los moldes (cm a unidades) con una variación chica, no la del pastel.
      expect(placement.scale / U).toBeGreaterThanOrEqual(0.85)
      expect(placement.scale / U).toBeLessThanOrEqual(1.15)
    }
  }
  expect(big.top.radius).toBeGreaterThan(mini.top.radius * 1.5)
  expect(big.layout!.placements.length).toBeGreaterThan(mini.layout!.placements.length)
})

test('the mound sits in the middle, the ring along the edge and the rows in straight lines', async ({ page }) => {
  const mound = await fruitOn(page, { size: 'showcase', layout: 'mound' })
  const ring = await fruitOn(page, { size: 'showcase', layout: 'ring' })
  const rows = await fruitOn(page, { size: 'showcase', layout: 'rows' })
  const radius = mound.top.radius
  const distances = (result: Result) => result.layout!.placements.map(({ p }) => Math.hypot(p[0], p[2]))
  // El montón cubre el centro, del 35 al 65 % de la cara (las fotos: del 40 al 60 %), y se apila en el centro.
  const reachOfMound = Math.max(...mound.layout!.placements.map((placement) => Math.hypot(placement.p[0], placement.p[2]) + placement.reach))
  expect((reachOfMound / radius) ** 2).toBeGreaterThanOrEqual(0.35)
  expect((reachOfMound / radius) ** 2).toBeLessThanOrEqual(0.65)
  const highest = mound.layout!.placements.reduce((best, placement) => (placement.p[1] > best.p[1] ? placement : best))
  expect(highest.p[1]).toBeGreaterThan(mound.top.height)
  expect(Math.hypot(highest.p[0], highest.p[2])).toBeLessThan(radius * 0.4)
  // El anillo va junto a la orilla y deja el centro libre.
  expect(Math.min(...distances(ring))).toBeGreaterThan(radius * 0.45)
  expect(ring.layout!.placements.length).toBeGreaterThan(8)
  // Las filas: cada fila es una línea recta (la misma z) y hay más de una.
  const lines = new Set(rows.layout!.placements.map(({ p }) => p[2].toFixed(6)))
  expect(lines.size).toBeGreaterThan(1)
  expect(lines.size).toBeLessThan(rows.layout!.placements.length)
})

/**
 * Qué parte de la tapa libre queda bajo la fruta: puntos de una cuadrícula dentro del disco libre (sin el canto, el borde de duya ni
 * el aire de la fruta) que caen bajo alguna pieza (a 80 % de su alcance del centro, que es generoso en una media luna).
 */
function freeFill(result: Result, freeRadius: number): { fill: number; center: boolean } {
  const pieces = result.layout!.placements
  const under = (x: number, z: number) => pieces.some((piece) => Math.hypot(piece.p[0] - x, piece.p[2] - z) <= piece.reach * 0.8)
  let inside = 0
  let covered = 0
  const step = freeRadius / 20
  for (let x = -freeRadius; x <= freeRadius; x += step) {
    for (let z = -freeRadius; z <= freeRadius; z += step) {
      if (Math.hypot(x, z) > freeRadius) continue
      inside++
      if (under(x, z)) covered++
    }
  }
  return { fill: covered / inside, center: under(0, 0) }
}

test('a dense pile fills the free top like the photos of choco vainilla, cajeta and capuchino, with no empty center', async ({ page }) => {
  const rosettes: Decoration = { kind: 'rosettes', main: '#f8f0e7', accent: '#f8f0e7' }
  for (const decoration of [undefined, rosettes]) {
    const usual = await fruitOn(page, { size: 'showcase', layout: 'mound', ...(decoration ? { decoration } : {}) })
    const dense = await fruitOn(page, { size: 'showcase', layout: 'mound', density: 2, ...(decoration ? { decoration } : {}) })
    // El disco libre: sin el canto, lo que llega del borde de duya y el aire de la fruta (0.4 cm).
    const inset = Math.max(EDGE, ...dense.decorationTop.map(({ p, reach }) => dense.top.radius - Math.hypot(p[0], p[2]) + reach))
    const free = dense.top.radius - inset - 0.4 * U
    // Las piezas caben enteras en el disco libre, así que su orilla nunca queda bajo una: se mide hasta el 92 % del radio.
    const before = freeFill(usual, free * 0.92)
    const after = freeFill(dense, free * 0.92)
    // En las tres fotos la fruta llega a los copos o a las conchas por toda la vuelta y tapa el centro: casi todo el disco libre.
    expect(after.fill, `dense ${after.fill.toFixed(2)} usual ${before.fill.toFixed(2)} pieces ${dense.layout!.placements.length} triangles ${dense.layout!.triangles}`).toBeGreaterThanOrEqual(0.85)
    expect(after.center).toBe(true)
    expect(after.fill).toBeGreaterThan(before.fill)
    expect(dense.layout!.placements.length).toBeGreaterThan(usual.layout!.placements.length)
    // Más alto que el de siempre, sin pasar de unos 7 cm.
    const top = (result: Result) => Math.max(...result.layout!.placements.map((placement) => placement.p[1]))
    expect(top(dense)).toBeGreaterThan(top(usual))
    expect(top(dense) - dense.top.height).toBeLessThan(7 * U)
    for (const placement of dense.layout!.placements) {
      expect(room(dense, placement)).toBeGreaterThanOrEqual(-1e-9)
      // Un poco más grandes que la malla de cm, nunca el doble.
      expect(placement.scale / U).toBeLessThanOrEqual(1.08 * 1.12 + 1e-9)
    }
    // El montón tupido aparta hasta el doble de su parte del presupuesto; los trozos y la decoración se reparten el resto.
    expect(dense.layout!.triangles).toBeLessThanOrEqual(2 * dense.budget.fruitBudget)
  }
})

test('density 3 makes the pile taller and fuller than 2, and dense rows shingle more pieces over more of the top', async ({ page }) => {
  const two = await fruitOn(page, { size: 'showcase', layout: 'mound', density: 2 })
  const three = await fruitOn(page, { size: 'showcase', layout: 'mound', density: 3 })
  const free = three.top.radius - EDGE - 0.4 * U
  const top = (result: Result) => Math.max(...result.layout!.placements.map((placement) => placement.p[1]))
  expect(three.layout!.placements.length).toBeGreaterThan(two.layout!.placements.length)
  expect(top(three)).toBeGreaterThan(top(two))
  expect(top(three) - three.top.height).toBeLessThan(9 * U)
  expect(freeFill(three, free * 0.92).fill).toBeGreaterThanOrEqual(freeFill(two, free * 0.92).fill - 0.02)
  for (const placement of three.layout!.placements) {
    expect(room(three, placement)).toBeGreaterThanOrEqual(-1e-9)
    expect(placement.scale / U).toBeLessThanOrEqual(1.08 * 1.3 + 1e-9)
  }
  expect(three.layout!.triangles).toBeLessThanOrEqual(3 * three.budget.fruitBudget)

  // Filas, como la foto de flan y cajeta: con lo tupido, más piezas y más filas, encimadas, en líneas rectas y dentro de la tapa.
  const rosettes: Decoration = { kind: 'rosettes', main: '#f1e8dc', accent: '#f1e8dc' }
  const usual = await fruitOn(page, { size: 'showcase', layout: 'rows', decoration: rosettes })
  const dense = await fruitOn(page, { size: 'showcase', layout: 'rows', decoration: rosettes, density: 2 })
  const lines = (result: Result) => new Set(result.layout!.placements.map(({ p }) => p[2].toFixed(6))).size
  expect(dense.layout!.placements.length).toBeGreaterThan(usual.layout!.placements.length * 1.5)
  expect(lines(dense)).toBeGreaterThan(lines(usual))
  expect(lines(dense)).toBeLessThan(dense.layout!.placements.length)
  const inset = Math.max(EDGE, ...dense.decorationTop.map(({ p, reach }) => dense.top.radius - Math.hypot(p[0], p[2]) + reach))
  const rowsFree = (dense.top.radius - inset - 0.4 * U) * 0.92
  expect(freeFill(dense, rowsFree).fill).toBeGreaterThan(freeFill(usual, rowsFree).fill)
  expect(freeFill(dense, rowsFree).fill).toBeGreaterThanOrEqual(0.7)
  for (const placement of dense.layout!.placements) expect(room(dense, placement)).toBeGreaterThanOrEqual(-1e-9)
})

test('only the fruits asked for, and every one of them on a showcase cake; without a list, the six of the photos', async ({ page }) => {
  const picked = await fruitOn(page, { size: 'showcase', layout: 'mound', fruits: ['kiwi', 'grape', 'physalis'] })
  expect(new Set(picked.layout!.placements.map((placement) => placement.kind))).toEqual(new Set(['kiwi', 'grape', 'physalis']))
  const all = await fruitOn(page, { size: 'showcase', layout: 'mound' })
  expect(new Set(all.layout!.placements.map((placement) => placement.kind))).toEqual(new Set(['strawberry', 'apple', 'kiwi', 'peach', 'starfruit', 'pear']))
  const eight = ['strawberry', 'peach', 'starfruit', 'apple', 'pear', 'grape', 'kiwi', 'physalis']
  for (const layout of ['mound', 'ring'] as const) {
    const each = await fruitOn(page, { size: 'showcase', layout, fruits: eight })
    expect(new Set(each.layout!.placements.map((placement) => placement.kind)).size, layout).toBe(8)
  }
  // En filas, cada fila es de una sola fruta y las frutas siguen el orden de la lista, de atrás hacia el frente.
  const rows = await fruitOn(page, { size: 'showcase', layout: 'rows', fruits: eight })
  const byLine = new Map<string, Set<string>>()
  for (const placement of rows.layout!.placements) {
    const line = placement.p[2].toFixed(6)
    byLine.set(line, (byLine.get(line) ?? new Set()).add(placement.kind))
  }
  expect([...byLine.values()].every((kinds) => kinds.size === 1)).toBe(true)
  const order = [...byLine.entries()].sort(([a], [b]) => Number(a) - Number(b)).map(([, kinds]) => [...kinds][0])
  expect(order).toEqual(eight.slice(0, order.length))
})

test('the fruit stays clear of the top border: shells, rosettes and roses keep their place', async ({ page }) => {
  const decorations: Decoration[] = [
    { kind: 'shells', main: '#f3eee9', accent: '#f3eee9' },
    { kind: 'rosettes', main: '#f3eee9', accent: '#f3eee9' },
    { kind: 'roses', petals: ['#e88aa0', '#f4b6c2'], leaf: 'exito' },
  ]
  for (const decoration of decorations) {
    for (const layout of LAYOUTS) {
      for (const size of ['showcase', { kg: 8, tiers: 2, form: 'round' }] as Size[]) {
        const result = await fruitOn(page, { size, layout, decoration })
        const label = `${decoration.kind}, ${layout}`
        expect(result.decorationTop.length, label).toBeGreaterThan(0)
        expect(result.layout!.placements.length, label).toBeGreaterThan(2)
        // El aire más chico entre una fruta y una pieza del borde (una sola aserción: son miles de pares).
        const closest = Math.min(
          ...result.layout!.placements.flatMap((placement) =>
            result.decorationTop.map((part) => Math.hypot(placement.p[0] - part.p[0], placement.p[2] - part.p[2]) - placement.reach - part.reach),
          ),
        )
        expect(closest, label).toBeGreaterThanOrEqual(-1e-9)
      }
    }
  }
})

test('with a message or a wafer on the lid, the fruit goes in a ring around them and never covers them', async ({ page }) => {
  const centered: Lid = {
    message: { x: 0, y: 0, rotation: 0, bounds: { minX: -6, maxX: 6, minY: -1.5, maxY: 1.5 } },
  }
  const both: Lid = {
    message: { x: 0, y: 3, rotation: 20, bounds: { minX: -5, maxX: 5, minY: -1, maxY: 1.4 } },
    wafer: { shape: 'circle', widthCm: 8, heightCm: 8, rotation: 0, x: 0, y: -4 },
  }
  const nearEdge: Lid = { wafer: { shape: 'sheet', widthCm: 7, heightCm: 5, rotation: 30, x: 8, y: 0 } }
  for (const lid of [centered, both, nearEdge]) {
    for (const layout of LAYOUTS) {
      const result = await fruitOn(page, { size: 'showcase', layout, lid })
      expect(result.keepOut.length).toBe((lid.message ? 1 : 0) + (lid.wafer ? 1 : 0))
      expect(result.layout!.layout).toBe('ring')
      expect(result.layout!.placements.length).toBeGreaterThan(4)
      result.layout!.placements.forEach((placement, i) => {
        for (const gap of result.gaps[i]) expect(gap).toBeGreaterThanOrEqual(placement.reach - 1e-9)
      })
    }
  }
  // Lo que se aparta cubre lo que va en la tapa: el centro del mensaje y de la oblea quedan dentro (en unidades de escena, con la z
  // hacia el frente, al revés de la y de la tapa).
  const result = await fruitOn(page, { size: 'showcase', layout: 'mound', lid: both })
  const [message, wafer] = result.keepOut
  expect(message.kind).toBe('rect')
  expect(wafer).toMatchObject({ kind: 'circle', x: 0 })
  expect(wafer.z).toBeCloseTo(4 * U, 9)
  expect((wafer as { r: number }).r).toBeGreaterThanOrEqual(4 * U)
})

test('the same cake always gets the same fruit, and another layout another arrangement', async ({ page }) => {
  const cake: CakeCase = { size: 'showcase', layout: 'mound', decoration: { kind: 'rosettes', main: '#f3eee9', accent: '#f3eee9' } }
  const first = await fruitOn(page, cake)
  const again = await fruitOn(page, cake)
  expect(again.layout).toEqual(first.layout)
  const ring = await fruitOn(page, { ...cake, layout: 'ring' })
  expect(ring.layout!.placements).not.toEqual(first.layout!.placements)
})

test('the fruit fits its own share of the triangle budget, and the whole scene stays under 150 000', async ({ page }) => {
  const roses: Decoration = { kind: 'roses', petals: ['#e88aa0', '#f4b6c2'], leaf: 'exito' }
  const cases: CakeCase[] = [
    { size: 'showcase', layout: 'mound' },
    { size: { kg: 12, tiers: 1, form: 'round' }, layout: 'rows', decoration: roses },
    { size: { kg: 30, tiers: 5, form: 'round' }, layout: 'mound', decoration: roses },
    // Un molde mal escrito en el admin llega hasta 150 cm (`clampCm`): la fruta deja de crecer en su presupuesto.
    { size: { diameterCm: 150, tiers: 1 }, layout: 'rows', decoration: roses },
    { size: { diameterCm: 150, tiers: 1 }, layout: 'mound' },
  ]
  for (const cake of cases) {
    const result = await fruitOn(page, cake)
    const label = JSON.stringify(cake.size)
    const { triangles, placements } = result.layout!
    expect(triangles, label).toBeGreaterThan(0)
    expect(triangles, label).toBe(placements.reduce((sum, placement) => sum + result.pieceTriangles[placement.piece], 0))
    expect(triangles, label).toBeLessThanOrEqual(result.budget.fruitBudget)
    expect(result.budget.scene + triangles, label).toBeLessThanOrEqual(result.budget.total)
  }
  expect(Object.values((await fruitOn(page, { size: 'showcase', layout: 'mound' })).pieceTriangles).every((count) => count > 0 && count <= 700)).toBe(true)
})

test('each piece is a small fruit-sized mesh that rests on y = 0, with a color and a unit normal per vertex', async ({ page }) => {
  const pieces = await page.evaluate(async (url) => {
    const fruit = await import(url)
    return fruit.FRUIT_PIECES.map((piece: string) => {
      const mesh = fruit.fruitMesh(piece)
      const count = mesh.positions.length / 3
      let [minY, maxY, maxXZ, badNormal, badColor] = [Infinity, -Infinity, 0, 0, 0]
      for (let i = 0; i < count; i++) {
        const [x, y, z] = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
        maxXZ = Math.max(maxXZ, Math.hypot(x, z))
        badNormal = Math.max(badNormal, Math.abs(Math.hypot(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) - 1))
        for (let c = 0; c < 3; c++) {
          const value = mesh.colors[i * 3 + c]
          if (!(value >= 0 && value <= 1)) badColor++
        }
      }
      const indexOk = mesh.indices.length % 3 === 0 && mesh.indices.every((index: number) => index >= 0 && index < count)
      return { piece, count, normals: mesh.normals.length / 3, colors: mesh.colors.length / 3, minY, maxY, maxXZ, badNormal, badColor, indexOk, triangles: fruit.pieceTriangles(piece) }
    })
  }, URLS.fruit)
  expect(pieces.map((piece: { piece: string }) => piece.piece).sort()).toEqual(
    ['appleFan', 'bananaSlice', 'grapeCluster', 'kiwiSlice', 'peachSlice', 'pearSlice', 'physalis', 'starfruitSlice', 'strawberryHalf', 'strawberryWhole'].sort(),
  )
  for (const piece of pieces) {
    expect(piece.normals, piece.piece).toBe(piece.count)
    expect(piece.colors, piece.piece).toBe(piece.count)
    expect(piece.indexOk, piece.piece).toBe(true)
    expect(piece.badNormal, piece.piece).toBeLessThan(1e-6)
    expect(piece.badColor, piece.piece).toBe(0)
    // En cm: descansa en y = 0 y mide lo que una fruta (de 1.5 a 9 cm de ancho, menos de 5 de alto).
    expect(piece.minY, piece.piece).toBeCloseTo(0, 6)
    expect(piece.maxY, piece.piece).toBeLessThan(5)
    expect(piece.maxXZ * 2, piece.piece).toBeGreaterThan(1.5)
    expect(piece.maxXZ * 2, piece.piece).toBeLessThan(9)
  }
})

test('turned on through the shape, the scene draws the fruit on the top tier and nothing changes without it', async ({ page }) => {
  const shape = (topping: boolean) => ({
    tiers: [{ radius: 14 * U, height: 6.7 * U, frosting: COVERAGE }],
    festoons: false,
    stand: true,
    form: 'round',
    fitStand: true,
    ...(topping ? { topping: { kind: 'fruit', layout: 'mound', fruits: ['strawberry'], unitsPerCm: U } } : {}),
  })
  /** Cuántos píxeles de la escena son rojo fresa: mucho rojo, poco verde y azul. */
  const redShare = async (testId: string) => {
    const shot = await page.getByTestId(testId).screenshot()
    return page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
      let red = 0
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 120 && pixels[i + 1] < 90 && pixels[i + 2] < 90) red++
      return red / (pixels.length / 4)
    }, shot.toString('base64'))
  }
  await mountCakeScene(page, shape(false), { width: 480, height: 480, elevation: 40, angle: -20 }, 'sin-fruta')
  const without = await redShare('sin-fruta')
  await mountCakeScene(page, shape(true), { width: 480, height: 480, elevation: 40, angle: -20 }, 'con-fruta')
  const withFruit = await redShare('con-fruta')
  expect(without).toBeLessThan(0.001)
  expect(withFruit).toBeGreaterThan(0.004)
})
