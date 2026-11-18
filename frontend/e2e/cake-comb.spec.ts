import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions, COVERAGE_HEX } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * El peinado lateral (tanda 4): surcos horizontales y parejos en los costados de la cobertura, como los deja un peine de
 * pastelería. Los módulos puros se importan en el navegador desde el servidor de desarrollo, como en
 * `cake-cream-spread.spec.ts`: la geometría (`src/three/comb.ts`) y la forma del pastel (`cakeDesignPreview.ts`).
 */
const COMB = '/src/three/comb.ts'
const URLS = {
  models: '/src/models/cakeDesign.ts',
  draft: '/src/models/cakeDesignDraft.ts',
  steps: '/src/viewmodels/cakeDesignSteps.ts',
  preview: '/src/viewmodels/cakeDesignPreview.ts',
  geometry: '/src/viewmodels/messageGeometry.ts',
  molds: '/src/viewmodels/cakeMolds.ts',
}

/** El canto redondeado de los pisos (`TIER_EDGE_UNITS`) y un peine de 6 mm con surcos de 1.2 mm, en unidades de escena. */
const EDGE = 0.06
const PEINE = { pitch: 0.6 * 0.068, depth: 0.12 * 0.068 }

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal')
})

type Profile = { x: number; y: number }[]

/** El perfil del costado de un piso, liso y peinado, y el número de surcos que da el módulo. */
async function profiles(page: Page, radius: number, height: number, comb = PEINE) {
  return page.evaluate(
    async ({ url, radius, height, edge, comb }) => {
      const { combedProfile, roundedProfile, grooveCount } = await import(url)
      const plain = (points: { x: number; y: number }[]) => points.map(({ x, y }) => ({ x, y }))
      return {
        smooth: plain(roundedProfile(radius, height, edge)) as Profile,
        combed: plain(combedProfile(radius, height, edge, comb)) as Profile,
        again: plain(combedProfile(radius, height, edge, comb)) as Profile,
        grooves: grooveCount(height, edge, comb) as number,
      }
    },
    { url: COMB, radius, height, edge: EDGE, comb },
  )
}

/** Los fondos de los surcos: los puntos del perfil más hundidos que sus dos vecinos. */
const valleys = (profile: Profile) => profile.filter((point, i) => i > 0 && i < profile.length - 1 && point.x < profile[i - 1].x - 1e-9 && point.x < profile[i + 1].x - 1e-9)

test('the combed side keeps the height and never sticks out of the tier, so borders, lid and stacking stay where they were', async ({ page }) => {
  for (const [radius, height] of [[1.02, 0.72], [0.48, 0.306], [0.95, 0.456]]) {
    const { smooth, combed } = await profiles(page, radius, height)
    // Empieza y acaba en el eje, en el pie y en la tapa del piso: el alto no cambia.
    expect(combed[0]).toEqual({ x: 0, y: 0 })
    expect(combed.at(-1)).toEqual({ x: 0, y: height })
    expect(Math.min(...combed.map((point) => point.y))).toBe(0)
    expect(Math.max(...combed.map((point) => point.y))).toBeCloseTo(height, 12)
    // El radio nunca pasa el del piso: el encuadre, la base, la decoración y la tapa no se mueven.
    expect(Math.max(...combed.map((point) => point.x))).toBeCloseTo(radius, 12)
    // Los cantos redondeados quedan iguales que en el piso liso: el borde de conchas y los rosetones se apoyan igual.
    expect(combed.slice(0, 6)).toEqual(smooth.slice(0, 6))
    expect(combed.slice(-6)).toEqual(smooth.slice(-6))
  }
})

test('the grooves are even, as deep as the comb and none closer to an edge than half a groove', async ({ page }) => {
  const radius = 1.02
  const height = 0.72
  const { combed, grooves } = await profiles(page, radius, height)
  const bottoms = valleys(combed)
  expect(bottoms).toHaveLength(grooves)
  // Unos 15 surcos en un piso de 0.72: el alto útil entre el peine.
  expect(grooves).toBe(Math.floor((height - 2 * EDGE - PEINE.pitch) / PEINE.pitch))
  for (const bottom of bottoms) expect(bottom.x).toBeCloseTo(radius - PEINE.depth, 9)
  const gaps = bottoms.slice(1).map((bottom, i) => bottom.y - bottoms[i].y)
  for (const gap of gaps) expect(gap).toBeCloseTo(PEINE.pitch, 9)
  // Centrados en el costado: el mismo espacio libre arriba y abajo, y al menos medio surco más allá del canto.
  const below = bottoms[0].y - PEINE.pitch / 2
  const above = height - (bottoms.at(-1)!.y + PEINE.pitch / 2)
  expect(below).toBeCloseTo(above, 9)
  expect(below).toBeGreaterThanOrEqual(EDGE + PEINE.pitch / 2 - 1e-9)
  // Nada se hunde más que el peine.
  const wall = combed.filter((point) => point.y > EDGE && point.y < height - EDGE)
  expect(Math.min(...wall.map((point) => point.x))).toBeGreaterThanOrEqual(radius - PEINE.depth - 1e-9)
})

test('the profile is the same every time and a tier too short for one groove stays smooth', async ({ page }) => {
  const { combed, again } = await profiles(page, 1, 0.72)
  expect(again).toEqual(combed)
  const short = await profiles(page, 0.5, 0.2, { pitch: 0.2, depth: 0.01 })
  expect(short.grooves).toBe(0)
  expect(short.combed).toEqual(short.smooth)
})

test('a rectangular tier gets the same grooves on a side that follows its rounded corners, within the slab and at its height', async ({ page }) => {
  const result = await page.evaluate(
    async ({ url, comb }) => {
      const { combedSide, slabOutline } = await import(url)
      const [halfW, halfD, height] = [1.1, 0.75, 0.72]
      const outline = slabOutline(halfW, halfD)
      const geometry = combedSide(outline, height, comb)
      const position = geometry.getAttribute('position')
      const normal = geometry.getAttribute('normal')
      let [minY, maxY, deepest, outermost, badNormal] = [Infinity, -Infinity, 0, -Infinity, 0]
      for (let i = 0; i < position.count; i++) {
        const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)]
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
        // Lo que sale del contorno de la losa, en el punto del contorno de esa columna.
        const point = outline[Math.floor(i / (position.count / (outline.length + 1))) % outline.length]
        const offset = (x - point.x) * point.nx + (z - point.z) * point.nz
        deepest = Math.min(deepest, offset)
        outermost = Math.max(outermost, offset)
        badNormal = Math.max(badNormal, Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1))
      }
      // Los puntos del contorno salen del mismo molde de la losa: las caras de la tapa cierran sin hueco.
      const onSlab = outline.every((point: { x: number; z: number }) => Math.abs(point.x) <= halfW + 1e-9 && Math.abs(point.z) <= halfD + 1e-9)
      return { minY, maxY, deepest, outermost, badNormal, onSlab, columns: outline.length, triangles: geometry.getIndex().count / 3 }
    },
    { url: COMB, comb: PEINE },
  )
  expect(result.minY).toBe(0)
  // La malla guarda sus posiciones en Float32.
  expect(result.maxY).toBeCloseTo(0.72, 6)
  expect(result.outermost).toBeLessThanOrEqual(1e-6)
  expect(result.deepest).toBeCloseTo(-PEINE.depth, 6)
  expect(result.badNormal).toBeLessThan(1e-6)
  expect(result.onSlab).toBe(true)
  // Las caras largas no llevan columnas de más: solo las esquinas se dividen.
  expect(result.columns).toBeLessThanOrEqual(32)
  expect(result.triangles).toBeLessThan(10000)
})

// --- La forma del pastel en "Diseña tu pastel" ---

type Choice = { people?: number; form?: 'round' | 'rectangular'; tiers?: number; step: number; sideComb?: boolean }
type Tier = { radius: number; height: number; halfWidth?: number; halfDepth?: number; comb?: { pitch: number; depth: number } }

async function shapeFor(page: Page, choice: Choice) {
  return page.evaluate(
    async ({ urls, options, choice, coverage }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      const { emptyDraft } = await import(urls.draft)
      const { deriveDesign } = await import(urls.steps)
      const { designPreview } = await import(urls.preview)
      const { estimatedMetrics } = await import(urls.geometry)
      const parsed = parseCakeDesignOptions(options)
      const people = choice.people ?? 140
      const draft = {
        ...emptyDraft(),
        people,
        form: choice.form ?? 'round',
        tiers: choice.tiers ?? 1,
        cakeType: 'tres_leches',
        bread: 'vainilla',
        fillingBase: 'normal',
        flavors: ['durazno'],
        coverageColor: coverage,
        ...(choice.sideComb === undefined ? {} : { sideComb: choice.sideComb }),
      }
      const kg = Math.ceil(people / 7)
      const size = people >= 28 ? { people, roundedKg: kg, kg, belowMinimum: false, aboveMaximum: false, minimumPeople: 28, maxOnlinePeople: 350, maxTiers: 5 } : null
      const design = deriveDesign(draft, parsed, size)
      const shape = designPreview({ draft, design, options: parsed, current: choice.step, defaultBread: parsed.breads[0], metrics: estimatedMetrics(''), waferImage: null })
      return shape.tiers as Tier[]
    },
    { urls: URLS, options: cakeDesignOptions, choice, coverage: COVERAGE_HEX.rosa },
  )
}

test('from the coverage step every tier is combed, round and rectangular, with one comb measured in centimeters', async ({ page }) => {
  for (const form of ['round', 'rectangular'] as const) {
    const tiers = await shapeFor(page, { form, tiers: 3, step: 5 })
    expect(tiers).toHaveLength(3)
    for (const tier of tiers) {
      expect(tier.comb?.pitch, form).toBeCloseTo(PEINE.pitch, 12)
      expect(tier.comb?.depth, form).toBeCloseTo(PEINE.depth, 12)
    }
  }
  // También el mini y el pastel de vitrina, con su molde real: el mismo peine, así que el mini lleva menos surcos.
  for (const people of [3, 12]) {
    const [tier] = await shapeFor(page, { people, step: 6 })
    expect(tier.comb?.pitch).toBeCloseTo(PEINE.pitch, 12)
  }
})

test('before the coverage there is nothing to comb, and with smooth sides no tier is combed', async ({ page }) => {
  const sides = await shapeFor(page, { step: 4 })
  expect(sides.every((tier) => tier.comb === undefined)).toBe(true)
  const smooth = await shapeFor(page, { form: 'rectangular', tiers: 2, step: 5, sideComb: false })
  expect(smooth).toHaveLength(2)
  expect(smooth.every((tier) => tier.comb === undefined)).toBe(true)
})

test('combing keeps the size of every tier: the same radius, length, width and height with or without it', async ({ page }) => {
  for (const form of ['round', 'rectangular'] as const) {
    const measures = (tiers: Tier[]) => tiers.map(({ radius, height, halfWidth, halfDepth }) => ({ radius, height, halfWidth, halfDepth }))
    const combed = await shapeFor(page, { form, tiers: 3, step: 5, sideComb: true })
    const smooth = await shapeFor(page, { form, tiers: 3, step: 5, sideComb: false })
    expect(measures(combed)).toEqual(measures(smooth))
  }
})
