import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

// La vista previa de "Diseña tu pastel" como datos (`src/viewmodels/cakeDesignPreview.ts`, D50 y D51), sin three: no
// hay corredor de pruebas unitarias, así que los módulos puros se importan en el navegador desde el servidor de
// desarrollo, como en `spin-model.spec.ts`.
const MODELS = '/src/models/cakeDesign.ts'
const DRAFT = '/src/models/cakeDesignDraft.ts'
const STEPS = '/src/viewmodels/cakeDesignSteps.ts'
const PREVIEW = '/src/viewmodels/cakeDesignPreview.ts'

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
}

type Layer = { height: number; colors: unknown[]; crumb?: boolean; pieces?: ({ style: string; colors: unknown[] } | null)[] }

type Preview = { form?: 'round' | 'rectangular'; tiers: Layer[][] }

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  // Una vista sin pastel 3D: solo cuenta lo que importan las pruebas.
  await page.goto('/legal')
})

/** Las capas de cada piso del pastel que dibujaría la vista previa con esa elección. */
async function previewTiers(page: Page, input: Input): Promise<Preview> {
  return page.evaluate(
    async ({ urls, options, choice }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      const { emptyDraft } = await import(urls.draft)
      const { deriveDesign } = await import(urls.steps)
      const { designPreview } = await import(urls.preview)
      const parsed = parseCakeDesignOptions(options)
      const draft = {
        ...emptyDraft(),
        cakeType: choice.cakeType ?? 'seco',
        bread: choice.bread,
        fillingBase: choice.base,
        flavorCount: choice.flavors.length === 2 ? 2 : 1,
        flavors: choice.flavors,
        form: choice.form ?? 'round',
        tiers: choice.tiers ?? 1,
      }
      const design = deriveDesign(draft, parsed, null)
      const defaultBread = parsed.breads[0] ?? null
      const shape = designPreview({ draft, design, options: parsed, current: choice.step ?? 4, defaultBread })
      return { form: shape.form, tiers: shape.tiers.map((tier: { layers?: Layer[] }) => tier.layers ?? []) }
    },
    { urls: { models: MODELS, draft: DRAFT, steps: STEPS, preview: PREVIEW }, options: cakeDesignOptions, choice: input },
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
  // Corteza, pan, relleno, pan, corteza: sin franjas de pan partidas.
  expect(layers).toHaveLength(5)
  expect(layers.map((layer) => Boolean(layer.crumb))).toEqual([true, true, false, true, true])
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
