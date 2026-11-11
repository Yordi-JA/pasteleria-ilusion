import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

// La vista previa de "Diseña tu pastel" como datos (`src/viewmodels/cakeDesignPreview.ts`, D50, D51 y D52), sin three: no
// hay corredor de pruebas unitarias, así que los módulos puros se importan en el navegador desde el servidor de
// desarrollo, como en `spin-model.spec.ts`.
const MODELS = '/src/models/cakeDesign.ts'
const DRAFT = '/src/models/cakeDesignDraft.ts'
const STEPS = '/src/viewmodels/cakeDesignSteps.ts'
const PREVIEW = '/src/viewmodels/cakeDesignPreview.ts'
const MOLDS = '/src/viewmodels/cakeMolds.ts'
const METRICS = '/src/three/cakeMetrics.ts'
const BUDGET = '/src/three/pieceBudget.ts'

const VANILLA = '#f0ce8a'
const CHOCOLATE = '#805438'

type Input = {
  bread: string
  cakeType?: string
  base: string
  flavors: string[]
  form?: 'round' | 'rectangular'
  tiers?: number
  step?: number
  /** Color de cobertura elegido (paso 5). */
  coverage?: string
  /** Kilos que calculó la API; sin ellos, el pastel se ve como el más chico. */
  kg?: number
  /** Opciones distintas de las de la semilla, para probar datos que la pastelería cambió. */
  options?: unknown
}

type Layer = { height: number; colors: unknown[]; crumb?: boolean; pieces?: ({ style: string; colors: unknown[] } | null)[] }

type PreviewTier = { radius: number; halfWidth?: number; halfDepth?: number; height: number; layers: Layer[]; frosting?: unknown }

type Camera = { plate: number; radius: number; scale15: number; scale82: number; pieceScale: number; triangles: number; wantedTriangles: number }

type Preview = { form?: 'round' | 'rectangular'; tiers: Layer[][]; shape: PreviewTier[]; camera: Camera }

/** La caja de la vista previa en escritorio (558 x 349 px), para comparar la escala de la cámara. */
const CARD = { width: 558, height: 349 }

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  // Una vista sin pastel 3D: solo cuenta lo que importan las pruebas.
  await page.goto('/legal')
})

/** El pastel que dibujaría la vista previa con esa elección: las capas y las medidas de cada piso. */
async function previewTiers(page: Page, input: Input): Promise<Preview> {
  return page.evaluate(
    async ({ urls, options, choice, card }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      const { emptyDraft } = await import(urls.draft)
      const { deriveDesign } = await import(urls.steps)
      const { designPreview } = await import(urls.preview)
      const { contentOf, fitScale, referenceContent, standScale } = await import(urls.metrics)
      const { pieceDensityScale, sceneTriangles } = await import(urls.budget)
      const parsed = parseCakeDesignOptions(choice.options ?? options)
      const draft = {
        ...emptyDraft(),
        cakeType: choice.cakeType ?? 'seco',
        bread: choice.bread,
        fillingBase: choice.base,
        flavorCount: choice.flavors.length === 2 ? 2 : 1,
        flavors: choice.flavors,
        form: choice.form ?? 'round',
        tiers: choice.tiers ?? 1,
        coverageColor: choice.coverage ?? null,
        ...(choice.kg ? { people: choice.kg * 7 } : {}),
      }
      const size = choice.kg
        ? { people: draft.people, roundedKg: choice.kg, kg: choice.kg, belowMinimum: false, aboveMaximum: false, minimumPeople: 28, maxOnlinePeople: 350, maxTiers: 5 }
        : null
      const design = deriveDesign(draft, parsed, size)
      const defaultBread = parsed.breads[0] ?? null
      const shape = designPreview({ draft, design, options: parsed, current: choice.step ?? 4, defaultBread })
      // La escala de la cámara de la vista libre (`stepFreeCamera`): la de un pastel grande de un piso, o la que cabe.
      const content = contentOf(shape)
      const scaleAt = (elevation: number) =>
        Math.min(fitScale(referenceContent(shape), card, 15), fitScale(content, card, elevation))
      return {
        form: shape.form,
        tiers: shape.tiers.map((tier: { layers?: Layer[] }) => tier.layers ?? []),
        shape: shape.tiers.map((tier: PreviewTier) => ({ ...tier, layers: tier.layers ?? [] })),
        camera: { plate: standScale(shape), radius: Math.max(...content.circles.map((circle: { r: number }) => circle.r)), scale15: scaleAt(15), scale82: scaleAt(82), pieceScale: pieceDensityScale(shape), triangles: sceneTriangles(shape, pieceDensityScale(shape)), wantedTriangles: sceneTriangles(shape) },
      }
    },
    { urls: { models: MODELS, draft: DRAFT, steps: STEPS, preview: PREVIEW, metrics: METRICS, budget: BUDGET }, options: cakeDesignOptions, choice: input, card: CARD },
  )
}

/** Los colores de las capas de pan (con miga) de un piso, de abajo hacia arriba, y dónde cae el relleno entre ellas. */
function breadAround(layers: Layer[]) {
  const filling = layers.findIndex((layer) => !layer.crumb && layer.pieces !== undefined)
  const crumbs = layers.map((layer, index) => ({ layer, index })).filter(({ layer }) => layer.crumb)
  return {
    below: crumbs.filter(({ index }) => index < filling).map(({ layer }) => layer.colors[0]),
    above: crumbs.filter(({ index }) => index > filling).map(({ layer }) => layer.colors[0]),
  }
}

const isMix = (color: unknown, toward: string): color is { mix: [unknown, unknown] } =>
  typeof color === 'object' && color !== null && 'mix' in color && JSON.stringify(color).includes(toward)

test('choco-vainilla with a normal filling: all the bread under the filling is vanilla and all above it is chocolate', async ({ page }) => {
  const { tiers } = await previewTiers(page, { bread: 'choco_vainilla', base: 'normal', flavors: ['zarzamora'] })
  const layers = tiers[0]
  // Corteza, pan, crema, relleno, crema, pan, corteza: sin franjas de pan partidas.
  expect(layers).toHaveLength(7)
  expect(layers.map((layer) => Boolean(layer.crumb))).toEqual([true, true, false, false, false, true, true])
  const { below, above } = breadAround(layers)
  expect(below[1]).toBe(VANILLA)
  expect(above[0]).toBe(CHOCOLATE)
  // La corteza sigue a su bloque: la de abajo es vainilla oscurecida y la de arriba, chocolate oscurecido.
  expect(isMix(below[0], VANILLA)).toBe(true)
  expect(isMix(above[1], CHOCOLATE)).toBe(true)
})

for (const [label, base, flavors] of [
  ['queso', 'queso', ['zarzamora']],
  ['flan', 'flan', ['cajeta']],
  ['two flavors', 'normal', ['durazno', 'fresa']],
] as const) {
  test(`choco-vainilla with ${label}: one vanilla block below and one chocolate block above`, async ({ page }) => {
    const { tiers } = await previewTiers(page, { bread: 'choco_vainilla', base, flavors: [...flavors] })
    const layers = tiers[0]
    const { below, above } = breadAround(layers)
    expect(below.filter((color) => color === VANILLA)).toHaveLength(1)
    expect(above.filter((color) => color === CHOCOLATE)).toHaveLength(1)
    // Pan: corteza + un bloque abajo y un bloque + corteza arriba; nunca cuatro franjas.
    expect(layers.filter((layer) => layer.crumb)).toHaveLength(4)
    expect(below).toHaveLength(2)
    expect(above).toHaveLength(2)
  })
}

test('every tier of a rectangular choco-vainilla cake gets the same two blocks', async ({ page }) => {
  const { form, tiers } = await previewTiers(page, { bread: 'choco_vainilla', base: 'normal', flavors: ['cajeta'], form: 'rectangular', tiers: 3 })
  expect(form).toBe('rectangular')
  expect(tiers).toHaveLength(3)
  for (const layers of tiers) {
    const { below, above } = breadAround(layers)
    expect([below[1], above[0]]).toEqual([VANILLA, CHOCOLATE])
    expect(layers.filter((layer) => layer.crumb)).toHaveLength(4)
  }
  expect(tiers[1]).toEqual(tiers[0])
  expect(tiers[2]).toEqual(tiers[0])
})

test('without a filling yet, choco-vainilla is vanilla below and chocolate above, in one block each', async ({ page }) => {
  const { tiers } = await previewTiers(page, { bread: 'choco_vainilla', base: '', flavors: [], step: 3 })
  const colors = tiers[0].map((layer) => layer.colors[0])
  expect(colors[1]).toBe(VANILLA)
  expect(colors[2]).toBe(CHOCOLATE)
  expect(tiers[0]).toHaveLength(4)
})

/** El color de entrada de una capa: el propio, o el primero de la mezcla (el pan antes del matiz del tipo). */
const inputColor = (color: unknown): unknown => (typeof color === 'object' && color !== null && 'mix' in color ? (color as { mix: unknown[] }).mix[0] : color)

test('a one-color bread keeps one block on each side of the filling, with or without the tint of the cake type', async ({ page }) => {
  const plain = await previewTiers(page, { bread: 'chocolate', base: 'normal', flavors: ['cajeta'] })
  const { below, above } = breadAround(plain.tiers[0])
  expect([below[1], above[0]]).toEqual([CHOCOLATE, CHOCOLATE])
  for (const cakeType of ['tres_leches', 'envinado']) {
    // `tinted()` arma una mezcla nueva en cada llamada: se compara el color de entrada, no el objeto.
    const tinted = await previewTiers(page, { bread: 'chocolate', cakeType, base: 'normal', flavors: ['cajeta'] })
    const around = breadAround(tinted.tiers[0])
    expect(tinted.tiers[0].filter((layer) => layer.crumb)).toHaveLength(4)
    expect(around.below).toHaveLength(2)
    expect(around.above).toHaveLength(2)
    expect([inputColor(around.below[1]), inputColor(around.above[0])]).toEqual([CHOCOLATE, CHOCOLATE])
  }
})

test('durazno and fresa ask for fruit chunks in the color of the pieces, and the old slices still draw as slices', async ({ page }) => {
  const peach = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'] })
  const strawberry = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['fresa'] })
  const pieces = (shape: Preview) => shape.tiers[0].find((layer) => layer.pieces)?.pieces?.[0]
  expect(pieces(peach)).toEqual({ style: 'fruit_chunks', colors: ['#fbd08f'] })
  expect(pieces(strawberry)).toEqual({ style: 'fruit_chunks', colors: ['#c8283a'] })

  const legacy = structuredClone(cakeDesignOptions)
  legacy.filling_bases[0].flavors[0].preview_style = 'fruit_slices'
  const slices = await page.evaluate(
    async ({ urls, options }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      return parseCakeDesignOptions(options).fillingBases[0].flavors[0].previewStyle
    },
    { urls: { models: MODELS }, options: legacy },
  )
  expect(slices).toBe('fruit_slices')
})

test('a style this version does not know is read as smooth, so no pieces are drawn', async ({ page }) => {
  const future = structuredClone(cakeDesignOptions)
  future.filling_bases[0].flavors[0].preview_style = 'fruit_cubes'
  const style = await page.evaluate(
    async ({ urls, options }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      return parseCakeDesignOptions(options).fillingBases[0].flavors[0].previewStyle
    },
    { urls: { models: MODELS }, options: future },
  )
  expect(style).toBe('smooth')
})

// --- El tamaño sale de los moldes de la pastelería (D52) ---

type Footprint = { lengthCm: number; widthCm: number }

/** `moldFootprint` con los moldes de la semilla (o con otros), en el navegador. */
async function footprint(page: Page, form: 'round' | 'rectangular', kg: number, onlyForm?: 'round' | 'rectangular'): Promise<Footprint | null> {
  return page.evaluate(
    async ({ urls, options, form, kg, onlyForm }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      const { moldFootprint } = await import(urls.molds)
      const molds = parseCakeDesignOptions(options).cakeMolds.filter((mold: { form: string }) => !onlyForm || mold.form === onlyForm)
      return moldFootprint(molds, form, kg)
    },
    { urls: { models: MODELS, molds: MOLDS }, options: cakeDesignOptions, form, kg, onlyForm },
  )
}

test('the options carry the molds of the bakery, and a broken mold is dropped without breaking the rest', async ({ page }) => {
  const broken = structuredClone(cakeDesignOptions)
  broken.cake_molds.push(
    { form: 'rectangular', kg: '3.0', length_cm: '30.0', width_cm: null },
    { form: 'triangle', kg: '3.0', length_cm: '30.0', width_cm: null } as never,
    { form: 'round', kg: '-3', length_cm: '30.0', width_cm: null },
    { form: 'round', kg: '500', length_cm: '30.0', width_cm: null },
    { form: 'round', kg: '3.0', length_cm: '900.0', width_cm: null },
  )
  const molds = await page.evaluate(
    async ({ urls, options }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      return parseCakeDesignOptions(options).cakeMolds
    },
    { urls: { models: MODELS }, options: broken },
  )
  expect(molds).toHaveLength(13)
  expect(molds[0]).toEqual({ form: 'round', kg: 2.7, lengthCm: 28, widthCm: null })
  expect(molds.at(-1)).toEqual({ form: 'rectangular', kg: 10, lengthCm: 60, widthCm: 44 })
})

test('a mold gives its own measures, and the kilos between two molds interpolate their sizes', async ({ page }) => {
  expect(await footprint(page, 'round', 12)).toEqual({ lengthCm: 51.5, widthCm: 51.5 })
  expect(await footprint(page, 'round', 4)).toEqual({ lengthCm: 34, widthCm: 34 })
  expect(await footprint(page, 'rectangular', 6)).toEqual({ lengthCm: 45.4, widthCm: 29.5 })
  // 5 kg queda a la mitad entre el de 4 kg (34 cm) y el de 6 kg (37 cm).
  expect((await footprint(page, 'round', 5))!.lengthCm).toBeCloseTo(35.5, 6)
  const between = (await footprint(page, 'rectangular', 4.5))!
  expect([between.lengthCm, between.widthCm]).toEqual([expect.closeTo(41.5, 6), expect.closeTo(27, 6)])
})

test('above the biggest mold and below the smallest, the area follows the kilos and the shape stays', async ({ page }) => {
  const area = (size: Footprint) => size.lengthCm * size.widthCm
  const largest = (await footprint(page, 'rectangular', 10))!
  const double = (await footprint(page, 'rectangular', 20))!
  expect(area(double) / area(largest)).toBeCloseTo(2, 6)
  expect(double.lengthCm / double.widthCm).toBeCloseTo(largest.lengthCm / largest.widthCm, 6)
  const thirty = (await footprint(page, 'round', 30))!
  expect(thirty.lengthCm).toBeCloseTo(51.5 * Math.sqrt(30 / 12), 6)
  const small = (await footprint(page, 'round', 1.35))!
  expect(small.lengthCm).toBeCloseTo(28 * Math.sqrt(1.35 / 2.7), 6)
  // Pasa de un lado a otro del molde más grande sin saltar.
  const just = (await footprint(page, 'round', 12.001))!
  expect(just.lengthCm).toBeCloseTo(51.5, 1)
})

test('without molds of that form, or without kilos, there is no size to give', async ({ page }) => {
  expect(await footprint(page, 'rectangular', 8, 'round')).toBeNull()
  expect(await footprint(page, 'round', 0)).toBeNull()
  expect(await footprint(page, 'round', Number.NaN)).toBeNull()
})

/** El tamaño de cada piso con los moldes de la semilla. */
async function tierSizes(page: Page, form: 'round' | 'rectangular', kg: number, tiers: number): Promise<{ kilos: number[]; sizes: Footprint[] }> {
  return page.evaluate(
    async ({ urls, options, form, kg, tiers }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      const { tierKilos, tierFootprints } = await import(urls.molds)
      const molds = parseCakeDesignOptions(options).cakeMolds
      return { kilos: tierKilos(molds, form, kg, tiers), sizes: tierFootprints(molds, form, kg, tiers) }
    },
    { urls: { models: MODELS, molds: MOLDS }, options: cakeDesignOptions, form, kg, tiers },
  )
}

// Los mínimos de la regla 3.3, un piso de 30 kg y el máximo en línea con 5 pisos.
const SPLITS = [
  [15, 2], [18, 3], [25, 4], [30, 5], [30, 1], [50, 5],
] as const

for (const [kg, tiers] of SPLITS) {
  for (const form of ['round', 'rectangular'] as const) {
    test(`${kg} kg in ${tiers} tier(s), ${form}: the kilos add up, each tier is lighter and clearly smaller than the one below`, async ({ page }) => {
      const { kilos, sizes } = await tierSizes(page, form, kg, tiers)
      expect(kilos).toHaveLength(tiers)
      expect(kilos.reduce((sum, share) => sum + share, 0)).toBeCloseTo(kg, 9)
      const area = (size: Footprint) => size.lengthCm * size.widthCm
      for (let i = 1; i < tiers; i++) {
        expect(kilos[i]).toBeLessThan(kilos[i - 1])
        // "Claramente más chico": el área baja al menos 10% de un piso al siguiente, también con los moldes
        // rectangulares, que apenas cambian de medida entre 4 y 10 kg.
        expect(area(sizes[i])).toBeLessThanOrEqual(area(sizes[i - 1]) * 0.9)
        expect(sizes[i].lengthCm).toBeLessThan(sizes[i - 1].lengthCm)
      }
    })
  }
}

test('18 kg in 3 tiers is 8 + 6 + 4, in round and in rectangular: the upper tiers take real molds and the bottom one the rest', async ({ page }) => {
  for (const form of ['round', 'rectangular'] as const) {
    const { kilos } = await tierSizes(page, form, 18, 3)
    expect(kilos).toEqual([8, 6, 4])
  }
})

test('the upper tiers are real mold kilos and the bottom tier absorbs the difference, in the rules of 3.3', async ({ page }) => {
  const rounds = [2.7, 4, 6, 8, 10, 12]
  const rectangles = [4, 5, 6, 7, 8, 9, 10]
  for (const [kg, tiers] of [[15, 2], [18, 3], [25, 4], [30, 5], [50, 5]] as const) {
    for (const [form, rungs] of [['round', rounds], ['rectangular', rectangles]] as const) {
      const { kilos } = await tierSizes(page, form, kg, tiers)
      // Los de arriba son kilos de un molde real; solo bajo el molde más chico, donde no hay más, salen de los kilos ideales.
      const upper = kilos.slice(1).filter((share) => share >= Math.min(...rungs))
      for (const share of upper) expect(rungs.some((rung) => Math.abs(rung - share) < 1e-9), `${form} ${kg}/${tiers}: ${share}`).toBe(true)
    }
  }
  const { kilos } = await tierSizes(page, 'round', 15, 2)
  expect(kilos).toEqual([9, 6])
  const four = await tierSizes(page, 'round', 25, 4)
  expect(four.kilos.slice(1)).toEqual([6, 4, 2.7])
  expect(four.kilos[0]).toBeCloseTo(12.3, 9)
})

test('without molds of that form the split falls back to the ideal one, which still adds up', async ({ page }) => {
  const kilos = await page.evaluate(async (url) => {
    const { tierKilos } = await import(url)
    return tierKilos([], 'round', 18, 3)
  }, MOLDS)
  expect(kilos.reduce((sum: number, share: number) => sum + share, 0)).toBeCloseTo(18, 9)
  expect(kilos[1]).toBeLessThan(kilos[0])
})

test('the size of a one-tier cake follows the kilos and every tier has the same height', async ({ page }) => {
  const radii: number[] = []
  const heights = new Set<number>()
  for (const kg of [4, 8, 12, 30]) {
    const { shape } = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg })
    expect(shape).toHaveLength(1)
    radii.push(shape[0].radius)
    heights.add(shape[0].height)
  }
  expect(radii).toEqual([...radii].sort((a, b) => a - b))
  expect(new Set(radii).size).toBe(4)
  // 12 kg es el molde de 51.5 cm y 4 kg el de 34 cm.
  expect(radii[2] / radii[0]).toBeCloseTo(51.5 / 34, 6)
  // Más de 12 kg: el área crece con los kilos.
  expect((radii[3] / radii[2]) ** 2).toBeCloseTo(30 / 12, 6)
  // Todos los pisos, redondos y rectangulares, de cualquier tamaño, miden lo mismo de alto, y menos que los de antes.
  const tall = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 30, tiers: 5, form: 'rectangular' })
  for (const tier of tall.shape) heights.add(tier.height)
  expect(heights.size).toBe(1)
  expect([...heights][0]).toBeLessThan(0.9)
})

test('a rectangular cake takes its proportions from the molds, not from a fixed ratio', async ({ page }) => {
  const ratios: number[] = []
  for (const kg of [4, 7, 10]) {
    const { shape } = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], form: 'rectangular', kg })
    ratios.push(shape[0].halfWidth! / shape[0].halfDepth!)
    expect(shape[0].radius).toBe(shape[0].halfDepth)
  }
  expect(ratios[0]).toBeCloseTo(41 / 26, 6)
  expect(ratios[1]).toBeCloseTo(48 / 33, 6)
  expect(ratios[2]).toBeCloseTo(60 / 44, 6)
  // Ninguno es el 2.1 x 1.4 de antes.
  expect(ratios.every((ratio) => Math.abs(ratio - 1.5) > 0.01)).toBe(true)
})

test('every tier of a tall cake is smaller than the one below and the kilos are shared among them', async ({ page }) => {
  const { shape } = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 18, tiers: 3 })
  expect(shape).toHaveLength(3)
  expect(shape[1].radius).toBeLessThan(shape[0].radius * 0.95)
  expect(shape[2].radius).toBeLessThan(shape[1].radius * 0.95)
  // Sin kilos de la API todavía, el pastel se ve como el más chico (4 kg) y no se rompe.
  const unknown = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'] })
  const four = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 4 })
  expect(unknown.shape[0].radius).toBe(four.shape[0].radius)
})

test('without molds the preview still draws, with a neutral size that does not follow the kilos', async ({ page }) => {
  const noMolds = { ...structuredClone(cakeDesignOptions), cake_molds: [] }
  const stacked = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 18, tiers: 3, options: noMolds })
  // El respaldo también va escalonado: cada piso más chico que el de abajo.
  expect(stacked.shape[1].radius).toBeLessThan(stacked.shape[0].radius)
  expect(stacked.shape[2].radius).toBeLessThan(stacked.shape[1].radius)
  const small = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 4, options: noMolds })
  const big = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 12, options: noMolds })
  expect(small.shape[0].radius).toBeGreaterThan(0)
  expect(small.shape[0].radius).toBe(big.shape[0].radius)
  const rect = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], form: 'rectangular', kg: 4, options: noMolds })
  expect(rect.shape[0].halfWidth).toBeGreaterThan(rect.shape[0].halfDepth!)
})

// --- Encuadre: escala fija con el pastel centrado (D52) ---

test('the camera keeps one scale for any one-tier cake that fits its base, so a small cake looks small and a big one big', async ({ page }) => {
  const scales = new Set<number>()
  for (const [form, kg] of [['round', 4], ['round', 8], ['round', 12], ['rectangular', 4], ['rectangular', 5]] as const) {
    const { camera } = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], form, kg })
    scales.add(Math.round(camera.scale15 * 1000))
  }
  expect(scales.size).toBe(1)
})

test('the camera moves away just enough when the cake does not fit: many tiers or many kilos', async ({ page }) => {
  const one = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 12 })
  const five = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 30, tiers: 5 })
  const heavy = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 40 })
  const wide = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], form: 'rectangular', kg: 10 })
  for (const far of [five, heavy, wide]) expect(far.camera.scale15).toBeLessThan(one.camera.scale15)
  // Cada piso de más aleja más.
  const three = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 18, tiers: 3 })
  expect(five.camera.scale15).toBeLessThan(three.camera.scale15)
})

test('the base fits the bottom tier: a little wider than it, bigger for a bigger cake and smaller for a smaller one', async ({ page }) => {
  const plateFor = async (kg: number, form?: 'rectangular') =>
    (await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg, form })).camera
  const small = await plateFor(4)
  const medium = await plateFor(8)
  const big = await plateFor(12)
  const heavy = await plateFor(30)
  expect(small.plate).toBeLessThan(medium.plate)
  expect(medium.plate).toBeLessThan(big.plate)
  expect(big.plate).toBeLessThan(heavy.plate)
  expect(small.plate).toBeLessThan(1)
  expect(heavy.plate).toBeGreaterThan(1)
  // Un poco más ancha que el piso de abajo, nunca justa ni de más.
  const bottom = (await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 4 })).shape[0].radius
  const plateRadius = 1.96 * small.plate
  expect(plateRadius).toBeGreaterThan(bottom)
  expect(plateRadius - bottom).toBeLessThan(0.3)
  // En rectangular, la base cubre las esquinas.
  const rect = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], form: 'rectangular', kg: 10 })
  const corner = Math.hypot(rect.shape[0].halfWidth!, rect.shape[0].halfDepth!)
  expect(1.96 * rect.camera.plate).toBeGreaterThan(corner)
  expect(1.96 * rect.camera.plate - corner).toBeLessThan(0.3)
})

test('seen from above the camera moves away a little so the base does not leave the card', async ({ page }) => {
  const { camera } = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 12 })
  expect(camera.scale82).toBeLessThan(camera.scale15)
})

// --- Relleno: crema pastelera arriba y abajo, y los estilos nuevos (D52) ---

const CREAM = 'betun'

/** Índice de la franja del sabor y las capas de crema que la rodean. */
function fillingAround(layers: Layer[]) {
  const flavor = layers.findIndex((layer) => !layer.crumb && layer.pieces !== undefined)
  return { flavor, below: layers[flavor - 1], above: layers[flavor + 1] }
}

test('a filling has a thin white layer of pastry cream above and below the flavor, thinner than the flavor', async ({ page }) => {
  for (const flavor of ['durazno', 'fresa', 'zarzamora', 'cajeta', 'nuez', 'fresa_yogurt']) {
    const { tiers } = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: [flavor] })
    const layers = tiers[0]
    const { flavor: at, below, above } = fillingAround(layers)
    expect(at, flavor).toBeGreaterThan(0)
    for (const cream of [below, above]) {
      expect(cream.colors).toEqual([CREAM])
      expect(cream.crumb).toBeUndefined()
      expect(cream.pieces).toBeUndefined()
      expect(cream.height).toBeLessThan(layers[at].height)
    }
    // Las capas del costado de un piso suman 1.
    expect(layers.reduce((sum, layer) => sum + layer.height, 0)).toBeCloseTo(1, 9)
    // Pan, crema, sabor, crema, pan: nada de pan pegado al sabor.
    expect(layers[at - 2].crumb).toBe(true)
    expect(layers[at + 2].crumb).toBe(true)
  }
})

test('the fillings that are already pastry cream with the flavor on top keep the look the owner approved, without the thin layers', async ({ page }) => {
  for (const flavor of ['choco_vainilla', 'galleta', 'capuchino', 'chocolate']) {
    const { tiers } = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: [flavor] })
    const layers = tiers[0]
    const { flavor: at } = fillingAround(layers)
    // Pan, relleno, pan: la crema es el propio fondo del relleno.
    expect(layers.map((layer) => Boolean(layer.crumb)), flavor).toEqual([true, true, false, true, true])
    expect(layers[at].pieces).toBeDefined()
    expect(layers.reduce((sum, layer) => sum + layer.height, 0)).toBeCloseTo(1, 9)
  }
  // Con dos de esos, tampoco; con uno que no lo es, las capas de crema envuelven a los dos.
  const both = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['galleta', 'choco_vainilla'] })
  expect(both.tiers[0]).toHaveLength(5)
  const mixed = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['galleta', 'durazno'] })
  expect(mixed.tiers[0]).toHaveLength(7)
})

test('with two flavors the cream layers stay whole and each half keeps its own flavor', async ({ page }) => {
  const { tiers } = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno', 'galleta'] })
  const { flavor, below, above } = fillingAround(tiers[0])
  expect(below.colors).toHaveLength(1)
  expect(above.colors).toHaveLength(1)
  expect(tiers[0][flavor].colors).toHaveLength(2)
  expect(tiers[0][flavor].pieces?.map((pieces) => pieces?.style)).toEqual(['fruit_chunks', 'cookie_chunks'])
})

test('with queso or flan the cream of the base sits below the pastry cream and the flavor goes on top', async ({ page }) => {
  for (const [base, flavor, baseColor] of [['queso', 'zarzamora', '#faf4e2'], ['flan', 'cajeta', '#f2c860']] as const) {
    const { tiers } = await previewTiers(page, { bread: 'vainilla', base, flavors: [flavor] })
    const layers = tiers[0]
    const at = fillingAround(layers).flavor
    expect(layers.slice(at - 2, at + 2).map((layer) => layer.colors[0])).toEqual([baseColor, CREAM, layers[at].colors[0], CREAM])
    expect(layers.reduce((sum, layer) => sum + layer.height, 0)).toBeCloseTo(1, 9)
  }
  // Un relleno que ya es crema, sobre la crema de la base: sin las capas delgadas.
  const creamy = await previewTiers(page, { bread: 'vainilla', base: 'queso', flavors: ['chocolate'] })
  expect(creamy.tiers[0].map((layer) => Boolean(layer.crumb))).toEqual([true, true, false, false, true, true])
})

test('without a filling there are no cream layers, and the coverage covers all the layers', async ({ page }) => {
  const { tiers } = await previewTiers(page, { bread: 'vainilla', base: '', flavors: [], step: 3 })
  expect(tiers[0].every((layer) => layer.crumb)).toBe(true)
  const covered = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], step: 5, coverage: 'rosa' })
  expect(covered.shape.every((tier) => tier.layers.length === 0)).toBe(true)
})

test('fresa con yogurt draws crumbles in the color of the filling, and some of them redder', async ({ page }) => {
  const { tiers } = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['fresa_yogurt'] })
  const layer = tiers[0].find((candidate) => candidate.pieces)!
  expect(layer.colors).toEqual(['#f0a4b2'])
  const pieces = layer.pieces![0]!
  expect(pieces.style).toBe('crumbles')
  const colors = pieces.colors as string[]
  // Dos de cada tres grumitos son del color del relleno; el otro, más rojo.
  expect(colors.filter((color) => color === '#f0a4b2')).toHaveLength(2)
  expect(colors.filter((color) => color === '#d95f76')).toHaveLength(1)
})

test('nuez draws pieces of nut in the color of the nut', async ({ page }) => {
  const { tiers } = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['nuez'] })
  expect(tiers[0].find((layer) => layer.pieces)!.pieces).toEqual([{ style: 'nut_pieces', colors: ['#7a5230'] }])
})

test('the rest of the flavors keep the look the owner approved', async ({ page }) => {
  const look = async (flavor: string) => (await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: [flavor] })).tiers[0].find((layer) => layer.pieces)!.pieces![0]
  expect(await look('zarzamora')).toBeNull()
  expect(await look('galleta')).toEqual({ style: 'cookie_chunks', colors: ['#2b1d1a'] })
  expect((await look('choco_vainilla'))!.style).toBe('sprinkles')
})

test('choco-pingüino shows its filling from the bread step: white pastry cream with round chocolate chips', async ({ page }) => {
  for (const step of [3, 4, 5]) {
    const { tiers, shape } = await previewTiers(page, { cakeType: 'seco', bread: 'choco_pinguino', base: '', flavors: [], step, coverage: 'rosa' })
    if (step === 5) {
      // Con la cobertura puesta, el costado ya no se ve.
      expect(shape.every((tier) => tier.layers.length === 0)).toBe(true)
      continue
    }
    const filling = tiers[0].filter((layer) => !layer.crumb)
    expect(filling).toHaveLength(1)
    expect(filling[0].colors).toEqual([CREAM])
    expect(filling[0].pieces).toEqual([{ style: 'round_chips', colors: ['#3a2218'] }])
  }
})

test('red velvet shows white pastry cream with red sprinkles', async ({ page }) => {
  const { tiers } = await previewTiers(page, { cakeType: 'seco', bread: 'red_velvet', base: '', flavors: [], step: 3 })
  const filling = tiers[0].filter((layer) => !layer.crumb)
  expect(filling).toHaveLength(1)
  expect(filling[0].colors).toEqual([CREAM])
  expect(filling[0].pieces).toEqual([{ style: 'sprinkles', colors: ['#c8283a'] }])
})

test('a bread with a filling of its own ignores a flavor chosen before, and one without it shows none at the bread step', async ({ page }) => {
  const { tiers } = await previewTiers(page, { cakeType: 'seco', bread: 'choco_pinguino', base: 'normal', flavors: ['durazno'], step: 4 })
  expect(tiers[0].filter((layer) => !layer.crumb)).toHaveLength(1)
  expect(tiers[0].some((layer) => layer.pieces?.some((pieces) => pieces?.style === 'fruit_chunks'))).toBe(false)
  const plain = await previewTiers(page, { bread: 'chocolate', base: '', flavors: [], step: 3 })
  expect(plain.tiers[0].every((layer) => layer.crumb)).toBe(true)
})

test('an included filling that lacks a color or names a style this version does not know draws as smooth cream', async ({ page }) => {
  const noColor = structuredClone(cakeDesignOptions)
  noColor.breads.find((bread) => bread.slug === 'choco_pinguino')!.included_filling_preview_color_secondary = ''
  const unknown = structuredClone(cakeDesignOptions)
  unknown.breads.find((bread) => bread.slug === 'red_velvet')!.included_filling_preview_style = 'sparkles'
  for (const [bread, options] of [['choco_pinguino', noColor], ['red_velvet', unknown]] as const) {
    const { tiers } = await previewTiers(page, { cakeType: 'seco', bread, base: '', flavors: [], step: 3, options })
    const filling = tiers[0].filter((layer) => !layer.crumb)
    expect(filling).toHaveLength(1)
    expect(filling[0].colors).toEqual([CREAM])
    expect(filling[0].pieces).toEqual([null])
  }
})

test('fresa con yogurt and nuez read their new styles from the options', async ({ page }) => {
  const styles = await page.evaluate(
    async ({ urls, options }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      const flavors = parseCakeDesignOptions(options).fillingBases[0].flavors
      return Object.fromEntries(flavors.map((flavor: { slug: string; previewStyle: string }) => [flavor.slug, flavor.previewStyle]))
    },
    { urls: { models: MODELS }, options: cakeDesignOptions },
  )
  expect(styles.fresa_yogurt).toBe('crumbles')
  expect(styles.nuez).toBe('nut_pieces')
})

// --- Presupuesto de trozos por escena (D52) ---

test('a normal cake gets the full density of every style, and the heaviest scenes are scaled down together to the budget', async ({ page }) => {
  const budget = await page.evaluate(async (url) => (await import(url)).TRIANGLE_BUDGET, BUDGET)
  const normal = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno'], kg: 12 })
  expect(normal.camera.pieceScale).toBe(1)
  for (const [flavor, form] of [['choco_vainilla', 'round'], ['choco_vainilla', 'rectangular'], ['capuchino', 'round']] as const) {
    const heavy = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: [flavor], kg: 50, tiers: 5, form })
    expect(heavy.camera.wantedTriangles, flavor).toBeGreaterThan(budget)
    expect(heavy.camera.pieceScale, flavor).toBeLessThan(1)
    // Dentro del presupuesto (con el redondeo de cada franja y sin pasar el tope de instancias).
    expect(heavy.camera.triangles, flavor).toBeLessThanOrEqual(budget * 1.02)
  }
  // Con dos sabores en cinco pisos, también.
  const halves = await previewTiers(page, { bread: 'vainilla', base: 'normal', flavors: ['durazno', 'galleta'], kg: 50, tiers: 5 })
  expect(halves.camera.triangles).toBeLessThanOrEqual(budget * 1.02)
})

test('the density is the same in every strip, so the bottom tier never looks sparser than the ones above', async ({ page }) => {
  const result = await page.evaluate(
    async ({ budget, models, options }) => {
      const { wantedPieces, pieceDensityScale } = await import(budget)
      const { parseCakeDesignOptions } = await import(models)
      void parseCakeDesignOptions(options)
      const shape = {
        tiers: [3, 2, 1].map((radius) => ({
          radius,
          height: 0.72,
          layers: [{ height: 0.2, colors: ['#ffffff'], pieces: [{ style: 'fruit_chunks', colors: ['#ff0000'] }] }],
        })),
        festoons: false,
        stand: true,
        candle: false,
      }
      const scale = pieceDensityScale(shape)
      // Instancias por unidad de área del costado en cada piso, con el mismo factor.
      return shape.tiers.map((tier) => (Math.round(wantedPieces('fruit_chunks', 2 * Math.PI * tier.radius, 1, 0.2 * 0.72) * scale)) / (2 * Math.PI * tier.radius))
    },
    { budget: BUDGET, models: MODELS, options: cakeDesignOptions },
  )
  expect(result[0]).toBeCloseTo(result[1], 0)
  expect(result[1]).toBeCloseTo(result[2], 0)
})

// --- La decoración del paso 6 (D53) ---

const TONES = '/src/viewmodels/decorationTones.ts'
const LAYOUT = '/src/three/decorationLayout.ts'

type DecorationInput = {
  decoration: string | null
  /** Color elegido de la decoración; sin él, automático. */
  color?: string | null
  coverage?: string
  tiers?: number
  form?: 'round' | 'rectangular'
  kg?: number
  step?: number
  /** Las decoraciones (por slug) sin precio definido (PENDIENTE): no se pueden elegir y no se dibujan. */
  pending?: string[]
}

type TierLayout = { parts: { shape: string; count: number; points: [number, number][] }[]; bands: { samples: number }[] }

type DecorationResult = {
  decoration: Record<string, unknown> | undefined
  tiers: number
  /** El radio de cada piso redondo, de abajo hacia arriba. */
  radii: number[]
  layout: TierLayout[]
  pieceScale: number
  triangles: number
  wantedTriangles: number
  budget: number
}

/** La decoración que dibujaría la vista previa y cómo la colocaría la escena, como datos. */
async function decorationPreview(page: Page, input: DecorationInput): Promise<DecorationResult> {
  return page.evaluate(
    async ({ urls, options, choice }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      const { emptyDraft } = await import(urls.draft)
      const { deriveDesign } = await import(urls.steps)
      const { designPreview } = await import(urls.preview)
      const { pieceDensityScale, sceneTriangles, TRIANGLE_BUDGET } = await import(urls.budget)
      const { tierDecoration } = await import(urls.layout)
      const pending = new Set(choice.pending ?? [])
      const withPrices = {
        ...options,
        decorations: options.decorations.map((decoration: { slug: string }) =>
          pending.has(decoration.slug) ? { ...decoration, pricing: 'fixed', price: null, price_pending: true, available: false, unavailable_reason: 'Precio por confirmar' } : decoration,
        ),
      }
      const parsed = parseCakeDesignOptions(withPrices)
      const draft = {
        ...emptyDraft(),
        cakeType: 'tres_leches',
        bread: 'vainilla',
        fillingBase: 'normal',
        flavors: ['durazno'],
        form: choice.form ?? 'round',
        tiers: choice.tiers ?? 1,
        coverageColor: choice.coverage ?? 'lila',
        decoration: choice.decoration,
        decorationColor: choice.color ?? null,
        ...(choice.kg ? { people: choice.kg * 7 } : {}),
      }
      const size = choice.kg
        ? { people: draft.people, roundedKg: choice.kg, kg: choice.kg, belowMinimum: false, aboveMaximum: false, minimumPeople: 28, maxOnlinePeople: 350, maxTiers: 5 }
        : null
      const design = deriveDesign(draft, parsed, size)
      const shape = designPreview({ draft, design, options: parsed, current: choice.step ?? 6, defaultBread: parsed.breads[0] })
      const scale = pieceDensityScale(shape)
      const layout = shape.tiers.map((_: unknown, index: number) => {
        const tier = tierDecoration(shape, index, scale)
        return {
          parts: tier.parts.map((part: { shape: string; placements: { p: number[] }[] }) => ({
            shape: part.shape,
            count: part.placements.length,
            // Dónde queda el botón de cada rosa (x, z del piso), para saber si alguna cae en el centro.
            points: part.shape === 'roseBud' ? part.placements.map((placement) => [placement.p[0], placement.p[2]]) : [],
          })),
          bands: tier.bands,
        }
      })
      return { decoration: shape.decoration, tiers: shape.tiers.length, radii: shape.tiers.map((tier: { radius: number }) => tier.radius), layout, pieceScale: scale, triangles: sceneTriangles(shape, scale), wantedTriangles: sceneTriangles(shape), budget: TRIANGLE_BUDGET }
    },
    { urls: { models: MODELS, draft: DRAFT, steps: STEPS, preview: PREVIEW, budget: BUDGET, layout: LAYOUT }, options: cakeDesignOptions, choice: input },
  )
}

const SLUG_KINDS = [
  ['duya', 'shells'],
  ['rosetones', 'rosettes'],
  ['festones', 'swags'],
  ['olanes', 'ruffles'],
  ['flores', 'roses'],
  ['chispas', 'sprinkles'],
] as const

for (const [slug, kind] of SLUG_KINDS) {
  test(`the ${slug} decoration is drawn as ${kind} on top of the coverage`, async ({ page }) => {
    const { decoration } = await decorationPreview(page, { decoration: slug })
    expect(decoration?.kind).toBe(kind)
  })
}

test('without a price, with "Sin decoración" and with "Otra decoración" the preview shows only the coverage', async ({ page }) => {
  // PENDIENTE: no se puede elegir (D39), así que tampoco se dibuja.
  expect((await decorationPreview(page, { decoration: 'flores', pending: ['flores'] })).decoration).toBeUndefined()
  expect((await decorationPreview(page, { decoration: 'ninguna' })).decoration).toBeUndefined()
  const other = await decorationPreview(page, { decoration: 'otra' })
  expect(other.decoration).toBeUndefined()
  expect(other.layout.every((tier) => tier.parts.length === 0 && tier.bands.length === 0)).toBe(true)
})

test('the decoration appears from step 6 and not before, and needs the coverage', async ({ page }) => {
  expect((await decorationPreview(page, { decoration: 'duya', step: 5 })).decoration).toBeUndefined()
  expect((await decorationPreview(page, { decoration: 'duya', step: 6 })).decoration).toBeDefined()
})

test('automatic tones come from the coverage: a deeper and a lighter tone of the same color, different for each coverage', async ({ page }) => {
  const lilac = (await decorationPreview(page, { decoration: 'duya', coverage: 'lila' })).decoration as { main: string; accent: string }
  const blue = (await decorationPreview(page, { decoration: 'duya', coverage: 'azulfuerte' })).decoration as { main: string; accent: string }
  expect(lilac.main).not.toBe(blue.main)
  const tones = await page.evaluate(async (urls) => {
    const { lightness, automaticTones } = await import(urls.tones)
    const auto = automaticTones('#ccbae4')
    return { cover: lightness('#ccbae4'), main: lightness(auto.main), accent: lightness(auto.accent), auto }
  }, { tones: TONES })
  // Con cobertura lila, el principal es un lila profundo y el acento, un lila claro.
  expect(tones.main).toBeLessThan(tones.cover - 0.1)
  expect(tones.accent).toBeGreaterThan(tones.cover)
  expect(lilac).toMatchObject({ main: tones.auto.main, accent: tones.auto.accent })
})

test('the tones keep the hue: a white coverage gives greys, never a color', async ({ page }) => {
  const channels = await page.evaluate(async (urls) => {
    const { deepTone, lightTone } = await import(urls.tones)
    const spread = (hex: string) => {
      const values = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      return Math.max(...values) - Math.min(...values)
    }
    return { deep: spread(deepTone('#fffbfb')), light: spread(lightTone('#fffbfb')), blue: deepTone('#4a70ba') }
  }, { tones: TONES })
  expect(channels.deep).toBeLessThan(12)
  expect(channels.light).toBeLessThan(12)
  // Un azul profundo sigue siendo azul: el canal azul manda.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(channels.blue.slice(i, i + 2), 16))
  expect(b).toBeGreaterThan(r + 30)
  expect(b).toBeGreaterThan(g)
})

test('a chosen color is used as it is, with an accent that contrasts', async ({ page }) => {
  const white = (await decorationPreview(page, { decoration: 'duya', coverage: 'lila', color: 'blanco' })).decoration as { main: string; accent: string }
  expect(white.main).toBe('#fffbfb')
  expect(white.accent).not.toBe(white.main)
  // Un color que ya no está entre los de la cobertura cuenta como automático.
  const unknown = (await decorationPreview(page, { decoration: 'duya', coverage: 'lila', color: 'inexistente' })).decoration as { main: string }
  const auto = (await decorationPreview(page, { decoration: 'duya', coverage: 'lila' })).decoration as { main: string }
  expect(unknown.main).toBe(auto.main)
})

test('the roses alternate two tones in automatic, use the chosen color alone and always keep green leaves', async ({ page }) => {
  const auto = (await decorationPreview(page, { decoration: 'flores' })).decoration as { petals: string[]; leaf: string }
  expect(auto.petals).toHaveLength(2)
  expect(auto.leaf).toBe('exito')
  const picked = (await decorationPreview(page, { decoration: 'flores', color: 'rojo' })).decoration as { petals: string[]; leaf: string }
  expect(picked.petals).toEqual(['#d44c48'])
  expect(picked.leaf).toBe('exito')
})

test('the sprinkle types take their style and colors from the flavor or the bread they point to', async ({ page }) => {
  const kind = async (slug: string) => (await decorationPreview(page, { decoration: slug, coverage: 'lila' })).decoration as { kind: string; style: string; colors: string[] }
  // Capuchino: granillo café (el color de los trozos) alternado con el del sabor.
  expect(await kind('chispas')).toEqual({ kind: 'sprinkles', style: 'sprinkles', colors: ['#5a3a28', '#aa7a56'] })
  // Choco vainilla: granillo blanco y de chocolate.
  expect(await kind('chispas-choco-vainilla')).toEqual({ kind: 'sprinkles', style: 'sprinkles', colors: ['#fffbfb', '#966846'] })
  // Chocolate: las chispas redondas del relleno incluido de Choco-pingüino.
  expect(await kind('chispas-chocolate')).toEqual({ kind: 'sprinkles', style: 'round_chips', colors: ['#3a2218'] })
})

test('a sprinkle type whose flavor or bread is missing is not drawn, and the colors are never invented', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, options }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      const { emptyDraft } = await import(urls.draft)
      const { deriveDesign } = await import(urls.steps)
      const { designPreview } = await import(urls.preview)
      const broken = {
        ...options,
        decorations: options.decorations.map((decoration: { slug: string }) => (decoration.slug === 'chispas' ? { ...decoration, preview_flavor: 'no-existe' } : decoration)),
      }
      const parsed = parseCakeDesignOptions(broken)
      const draft = { ...emptyDraft(), cakeType: 'tres_leches', bread: 'vainilla', fillingBase: 'normal', flavors: ['durazno'], coverageColor: 'lila', decoration: 'chispas' }
      const design = deriveDesign(draft, parsed, null)
      return designPreview({ draft, design, options: parsed, current: 6, defaultBread: parsed.breads[0] }).decoration ?? null
    },
    { urls: { models: MODELS, draft: DRAFT, steps: STEPS, preview: PREVIEW }, options: cakeDesignOptions },
  )
  expect(result).toBeNull()
})

test('the sprinkles go only on the sides of every tier: none on the top face', async ({ page }) => {
  const result = await page.evaluate(
    async ({ layout }) => {
      const { tierDecoration } = await import(layout)
      const shape = {
        tiers: [{ radius: 2, height: 0.8, frosting: '#ffffff' }, { radius: 1.2, height: 0.8, frosting: '#ffffff' }],
        festoons: false,
        stand: false,
        candle: false,
        decoration: { kind: 'sprinkles', style: 'sprinkles', colors: ['#5a3a28'] },
      }
      return shape.tiers.map((_: unknown, index: number) => {
        const parts = tierDecoration(shape, index, 1).parts
        const ys = parts.flatMap((part: { placements: { p: number[] }[] }) => part.placements.map((placement) => placement.p[1]))
        return { count: ys.length, maxY: Math.max(...ys) }
      })
    },
    { layout: LAYOUT },
  )
  for (const tier of result) {
    expect(tier.count).toBeGreaterThan(50)
    // Ninguna llega a la cara de arriba (alto del piso: 0.8).
    expect(tier.maxY).toBeLessThan(0.8)
  }
})

test('every tier gets its borders, ruffles, sprinkles and a full row of roses', async ({ page }) => {
  for (const [slug, parts] of [['duya', 'shell'], ['rosetones', 'rosette'], ['festones', 'bead'], ['flores', 'roseBud']] as const) {
    const { layout, tiers } = await decorationPreview(page, { decoration: slug, tiers: 3, kg: 18 })
    expect(tiers).toBe(3)
    for (const tier of layout) expect(tier.parts.find((part) => part.shape === parts)?.count ?? 0).toBeGreaterThan(0)
  }
  const ruffles = await decorationPreview(page, { decoration: 'olanes', tiers: 3, kg: 18 })
  for (const tier of ruffles.layout) expect(tier.bands).toHaveLength(4)
  const sprinkles = await decorationPreview(page, { decoration: 'chispas', tiers: 3, kg: 18 })
  for (const tier of sprinkles.layout) expect(tier.parts[0].count).toBeGreaterThan(0)
})

test('the roses sit on the edge of every tier, all the way around, and none falls in the middle of the top face', async ({ page }) => {
  const { layout, radii } = await decorationPreview(page, { decoration: 'flores', tiers: 3, kg: 18 })
  layout.forEach((tier, index) => {
    const counts = Object.fromEntries(tier.parts.map((part) => [part.shape, part.count]))
    // Un botón, 23 pétalos en cuatro capas y 2 hojitas por rosa.
    expect(counts.roseBud).toBeGreaterThan(8)
    expect(counts.rosePetal).toBe(counts.roseBud * 23)
    expect(counts.leaf).toBe(counts.roseBud * 2)
    const buds = tier.parts.find((part) => part.shape === 'roseBud')!.points
    const distances = buds.map(([x, z]) => Math.hypot(x, z))
    // En la orilla: cerca del radio del piso, y ninguna en el centro (ahí puede ir una oblea o un texto).
    expect(Math.min(...distances)).toBeGreaterThan(radii[index] * 0.7)
    expect(Math.max(...distances)).toBeLessThan(radii[index])
    // Dan la vuelta completa: hay rosas en los cuatro cuadrantes.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) expect(buds.some(([x, z]) => x * sx > 0.1 && z * sz > 0.1)).toBe(true)
    // Sin encimarse: dos botones vecinos quedan separados.
    const closest = Math.min(...buds.flatMap(([x, z], i) => buds.slice(i + 1).map(([x2, z2]) => Math.hypot(x - x2, z - z2))))
    // En un escalón angosto la rosa se achica con su paso (hasta 0.55 de 0.34).
    expect(closest).toBeGreaterThan(0.15)
  })
})

/** Distancia mínima entre los centros de las piezas de una fila (rosas: los botones; rosetones: las rosetas). */
async function rowSpacing(page: Page, input: { kind: 'roses' | 'rosettes'; form: 'round' | 'rectangular'; radii: number[]; scale?: number }) {
  return page.evaluate(
    async ({ layout, kind, form, radii, scale }) => {
      const { tierDecoration } = await import(layout)
      const decoration = kind === 'roses' ? { kind, petals: ['#ffffff'], leaf: '#00ff00' } : { kind, main: '#ffffff', accent: '#ffffff' }
      const shape = { tiers: radii.map((radius: number) => ({ radius, height: 0.8, frosting: '#ffffff' })), festoons: false, stand: false, candle: false, form, decoration }
      return shape.tiers.map((_: unknown, index: number) => {
        const part = tierDecoration(shape, index, scale).parts.find((item: { shape: string }) => item.shape === (kind === 'roses' ? 'roseBud' : 'rosette'))!
        const points = part.placements.map((placement: { p: number[] }) => [placement.p[0], placement.p[2]])
        const closest = Math.min(...points.flatMap(([x, z]: number[], i: number) => points.slice(i + 1).map(([x2, z2]: number[]) => Math.hypot(x - x2, z - z2))))
        return { count: points.length, closest }
      })
    },
    { layout: LAYOUT, kind: input.kind, form: input.form, radii: input.radii, scale: input.scale ?? 1 },
  )
}

test('in a rectangular tier no two roses or rosettes crowd each other, corners included', async ({ page }) => {
  for (const [kind, step] of [['roses', 0.34], ['rosettes', 0.21]] as const) {
    const rows = await rowSpacing(page, { kind, form: 'rectangular', radii: [2, 1.5, 1] })
    // Un paso completo (menos lo que cabe en el redondeo del flotante), no los 0.03 que dejaban las esquinas.
    // La última (radio 1) es de lados de 0.8 a 1.5: los lados cortos llevan una sola pieza en el centro.
    for (const row of rows.slice(0, 2)) expect(row.closest).toBeGreaterThan(step * 0.97)
    expect(rows[2].closest).toBeGreaterThan(step * 0.6)
  }
})

test('a round tier with a narrow step keeps its roses inside the step, whatever its width', async ({ page }) => {
  for (const gap of [0.04, 0.1, 0.3]) {
    const result = await page.evaluate(
      async ({ layout, gap: width }) => {
        const { tierDecoration, perimeterOf } = await import(layout)
        const shape = {
          tiers: [{ radius: 2, height: 0.8, frosting: '#ffffff' }, { radius: 2 - width, height: 0.8, frosting: '#ffffff' }],
          festoons: false,
          stand: false,
          candle: false,
          decoration: { kind: 'roses', petals: ['#ffffff'], leaf: '#00ff00' },
        }
        const part = tierDecoration(shape, 0, 1).parts.find((item: { shape: string }) => item.shape === 'roseBud')!
        const radii = part.placements.map((placement: { p: number[] }) => Math.hypot(placement.p[0], placement.p[2]))
        return { count: part.placements.length, min: Math.min(...radii), max: Math.max(...radii), length: perimeterOf(shape.tiers[0], 'round').length }
      },
      { layout: LAYOUT, gap },
    )
    // Ni una rosa se pierde ni cae en la pared del piso de arriba: todas, entre la pared y el borde.
    const step = 0.34 * Math.max(0.4, Math.min(1, gap / 0.36))
    expect(Math.abs(result.count - Math.round(result.length / step))).toBeLessThanOrEqual(1)
    // Con un escalón de 0.12 o más el centro cae dentro del escalón; con menos, se arrima a la orilla (ver abajo).
    if (gap >= 0.12) expect(result.min).toBeGreaterThan(2 - gap)
    expect(result.max).toBeLessThan(2)
    expect(result.max - result.min).toBeLessThan(1e-9)
  }
})

test('with a step under 0.12 the roses do not stick out of the tier and the leaves point inward', async ({ page }) => {
  const result = await page.evaluate(async (layout) => {
    const { tierDecoration } = await import(layout)
    const shape = {
      tiers: [{ radius: 2, height: 0.8, frosting: '#ffffff' }, { radius: 1.97, height: 0.8, frosting: '#ffffff' }],
      festoons: false,
      stand: false,
      candle: false,
      decoration: { kind: 'roses', petals: ['#ffffff'], leaf: '#00ff00' },
    }
    const parts = tierDecoration(shape, 0, 1).parts
    const petals = parts.find((item: { shape: string }) => item.shape === 'rosePetal')!.placements
    const leaves = parts.find((item: { shape: string }) => item.shape === 'leaf')!.placements
    // El borde de afuera de cada pétalo (su radio es de 0.05 por su escala) y si cada hoja mira hacia el centro.
    return {
      outer: Math.max(...petals.map((p: { p: number[]; s: number[] }) => Math.hypot(p.p[0], p.p[2]) + 0.05 * p.s[0])),
      inward: leaves.every((leaf: { p: number[]; dir: number[] }) => leaf.dir[0] * leaf.p[0] + leaf.dir[2] * leaf.p[2] < 0),
    }
  }, LAYOUT)
  expect(result.outer).toBeLessThan(2.005)
  expect(result.inward).toBe(true)
})

test('the last tier keeps a free center even when it is very small', async ({ page }) => {
  const result = await page.evaluate(async (layout) => {
    const { tierDecoration } = await import(layout)
    const shape = { tiers: [{ radius: 0.5, height: 0.8, frosting: '#ffffff' }], festoons: false, stand: false, candle: false, decoration: { kind: 'roses', petals: ['#ffffff'], leaf: '#00ff00' } }
    const part = tierDecoration(shape, 0, 1).parts.find((item: { shape: string }) => item.shape === 'roseBud')!
    return Math.min(...part.placements.map((placement: { p: number[] }) => Math.hypot(placement.p[0], placement.p[2])))
  }, LAYOUT)
  // Con la rosa a su tamaño (0.21 de radio) el centro libre sería de 0.14; con la rosa achicada, de más de 0.15 (30 % del radio).
  expect(result - 0.21 * 0.9).toBeGreaterThan(0.1)
})

test('the shells and the rosettes follow a rectangular tier', async ({ page }) => {
  for (const slug of ['duya', 'rosetones', 'festones', 'olanes', 'chispas']) {
    const { layout } = await decorationPreview(page, { decoration: slug, form: 'rectangular', tiers: 2, kg: 15 })
    expect(layout.every((tier) => tier.parts.length > 0 || tier.bands.length > 0)).toBe(true)
  }
})

test('the decoration counts against the triangle budget: even 5 tiers of 50 kg stay inside it', async ({ page }) => {
  for (const slug of ['duya', 'rosetones', 'festones', 'olanes', 'flores', 'chispas']) {
    const result = await decorationPreview(page, { decoration: slug, tiers: 5, kg: 50 })
    expect(result.wantedTriangles).toBeGreaterThan(0)
    // Con la segunda pasada del presupuesto, los triángulos de verdad caben, no solo la proporción.
    expect(result.triangles).toBeLessThanOrEqual(result.budget)
    if (result.wantedTriangles > result.budget) expect(result.pieceScale).toBeLessThan(1)
    else expect(result.pieceScale).toBe(1)
  }
})

test('a small cake pays no budget penalty and the pieces keep the same positions between calls', async ({ page }) => {
  const first = await decorationPreview(page, { decoration: 'chispas', kg: 6 })
  const second = await decorationPreview(page, { decoration: 'chispas', kg: 6 })
  expect(first.pieceScale).toBe(1)
  expect(first.layout).toEqual(second.layout)
})
