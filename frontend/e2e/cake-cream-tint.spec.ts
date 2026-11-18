import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cakeDesignOptions } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * La crema pastelera teñida por el relleno (tanda 4). El usuario: "para los casos donde el relleno puede mezclarse con la crema,
 * por ejemplo las mermeladas como blueberry, zarzamora y cajeta, físicamente se unifican y se mezclan; entonces la crema
 * pastelera se tinta del color del relleno, pero manteniendo esa consistencia de que es crema pastelera. En las frutas, galleta o
 * chispas no aplica."
 *
 * Las capas delgadas de crema que tocan un relleno de estilo `jam` o `caramel` llevan `tint` con el color de ese relleno (el del
 * admin); siguen siendo crema (`colors` en `betun`, untadas a mano). La escena pinta el tinte con colores por vértice en la malla
 * untada: más fuerte junto al relleno y pálido del lado del pan. Los módulos puros se importan en el navegador.
 */
const URLS = {
  models: '/src/models/cakeDesign.ts',
  draft: '/src/models/cakeDesignDraft.ts',
  steps: '/src/viewmodels/cakeDesignSteps.ts',
  preview: '/src/viewmodels/cakeDesignPreview.ts',
  geometry: '/src/viewmodels/messageGeometry.ts',
}
const SPREAD = '/src/three/creamSpread.ts'

const CREAM = 'betun'
const ZARZAMORA = '#702c5a'
const CAJETA = '#bc7630'
const BLUEBERRY = '#3e3a6e'

type Tint = { colors: (unknown | null)[]; toward: 'above' | 'below' }
type Layer = { height: number; colors: unknown[]; crumb?: boolean; spread?: string; tint?: Tint }

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal')
})

/** Las opciones de la semilla con Blueberry en la base Normal, como la siembra la `0045` y la deja la `0047`. */
function withBlueberry() {
  const options = structuredClone(cakeDesignOptions)
  const normal = options.filling_bases.find((base) => base.slug === 'normal')!
  const zarzamora = normal.flavors.find((flavor) => flavor.slug === 'zarzamora')!
  normal.flavors.push({ ...zarzamora, slug: 'blueberry', name: 'Blueberry', preview_color: '#3E3A6E' })
  return options
}

/** Las capas del costado del piso de abajo en el paso 4, de abajo hacia arriba. */
async function layersOf(page: Page, base: string, flavors: string[], options: unknown = withBlueberry()): Promise<Layer[]> {
  return page.evaluate(
    async ({ urls, options, base, flavors }) => {
      const { parseCakeDesignOptions } = await import(urls.models)
      const { emptyDraft } = await import(urls.draft)
      const { deriveDesign } = await import(urls.steps)
      const { designPreview } = await import(urls.preview)
      const { estimatedMetrics } = await import(urls.geometry)
      const parsed = parseCakeDesignOptions(options)
      const draft = { ...emptyDraft(), cakeType: 'seco', bread: 'vainilla', fillingBase: base, flavorCount: flavors.length === 2 ? 2 : 1, flavors }
      const design = deriveDesign(draft, parsed, null)
      const shape = designPreview({ draft, design, options: parsed, current: 4, defaultBread: parsed.breads[0], metrics: estimatedMetrics(''), waferImage: null })
      return shape.tiers[0].layers
    },
    { urls: URLS, options, base, flavors },
  )
}

/** Las dos capas de crema pastelera, la de abajo y la de arriba del relleno: lo que no es pan en cada extremo. */
function creamBands(layers: Layer[]) {
  const first = layers.findIndex((layer) => !layer.crumb)
  const last = layers.length - 1 - [...layers].reverse().findIndex((layer) => !layer.crumb)
  return { below: layers[first], above: layers[last], inside: layers.slice(first + 1, last) }
}

test('the pastry cream next to zarzamora, blueberry and cajeta takes their color, stronger toward the filling, and stays cream', async ({ page }) => {
  for (const [flavor, color] of [['zarzamora', ZARZAMORA], ['blueberry', BLUEBERRY], ['cajeta', CAJETA]] as const) {
    const { below, above } = creamBands(await layersOf(page, 'normal', [flavor]))
    // Sigue siendo crema pastelera untada a mano: su color es el de la crema; el tinte va aparte.
    for (const band of [below, above]) {
      expect(band.colors, flavor).toEqual([CREAM])
      expect(band.spread, flavor).toBe('cream')
    }
    // La de abajo toca el relleno por arriba y la de arriba, por abajo.
    expect(below.tint, flavor).toEqual({ colors: [color], toward: 'above' })
    expect(above.tint, flavor).toEqual({ colors: [color], toward: 'below' })
  }
})

test('fruit, cookie, sprinkles, crumbles and nuts do not tint the cream', async ({ page }) => {
  for (const flavor of ['durazno', 'fresa', 'galleta', 'chocolate', 'fresa_yogurt', 'nuez']) {
    const layers = await layersOf(page, 'normal', [flavor])
    expect(layers.some((layer) => layer.tint), flavor).toBe(false)
  }
})

test('with queso or flan only the band that touches the jam is tinted; the base cream and the band on the bread side of it are not', async ({ page }) => {
  for (const [base, flavor, color] of [['queso', 'zarzamora', ZARZAMORA], ['flan', 'cajeta', CAJETA], ['flan', 'zarzamora', ZARZAMORA]] as const) {
    const { below, above, inside } = creamBands(await layersOf(page, base, [flavor]))
    // De abajo hacia arriba: crema pastelera, la crema de la base, el sabor y crema pastelera.
    expect(below.tint, `${base} ${flavor}`).toBeUndefined()
    expect(inside[0].tint, `${base} ${flavor}`).toBeUndefined()
    expect(above.tint, `${base} ${flavor}`).toEqual({ colors: [color], toward: 'below' })
  }
})

test('with two flavors each half of the cream takes the color of its own half of the filling', async ({ page }) => {
  const mixed = creamBands(await layersOf(page, 'normal', ['zarzamora', 'durazno']))
  expect(mixed.below.tint).toEqual({ colors: [ZARZAMORA, null], toward: 'above' })
  expect(mixed.above.tint).toEqual({ colors: [ZARZAMORA, null], toward: 'below' })
  // La crema sigue entera y untada: solo el tinte va por mitades.
  expect(mixed.below.colors).toEqual([CREAM])
  const both = creamBands(await layersOf(page, 'normal', ['durazno', 'cajeta']))
  expect(both.above.tint).toEqual({ colors: [null, CAJETA], toward: 'below' })
  const none = await layersOf(page, 'normal', ['durazno', 'galleta'])
  expect(none.some((layer) => layer.tint)).toBe(false)
})

test('the tint follows the color and the style in the admin, not a list in the code', async ({ page }) => {
  const options = withBlueberry()
  const normal = options.filling_bases.find((base) => base.slug === 'normal')!
  normal.flavors.find((flavor) => flavor.slug === 'zarzamora')!.preview_color = '#5A1F44'
  // Un sabor que la pastelería pasa a cajeta o caramelo también tiñe; uno que deja de ser mermelada, ya no.
  const nuez = normal.flavors.find((flavor) => flavor.slug === 'nuez')!
  Object.assign(nuez, { preview_style: 'caramel', preview_color_secondary: '' })
  const blueberry = normal.flavors.find((flavor) => flavor.slug === 'blueberry')!
  blueberry.preview_style = 'smooth'
  expect(creamBands(await layersOf(page, 'normal', ['zarzamora'], options)).below.tint?.colors).toEqual(['#5a1f44'])
  expect(creamBands(await layersOf(page, 'normal', ['nuez'], options)).below.tint?.colors).toEqual([nuez.preview_color.toLowerCase()])
  expect((await layersOf(page, 'normal', ['blueberry'], options)).some((layer) => layer.tint)).toBe(false)
})

test('the tinted cream is pale: closer to the cream than to the filling, between 10% and 35% of its color', async ({ page }) => {
  const result = await page.evaluate(
    async ({ url, colors }) => {
      const { CREAM_TINT, tintedCream } = await import(url)
      const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      const distance = (a: number[], b: number[]) => Math.hypot(...a.map((value, i) => value - b[i]))
      const cream = channels('#fffbfb')
      return {
        tint: CREAM_TINT,
        pale: colors.every((hex: string) => {
          const flavor = channels(hex)
          const mixed = tintedCream('#fffbfb', hex, CREAM_TINT.near) as number[]
          return distance(mixed, cream) < distance(mixed, flavor)
        }),
      }
    },
    { url: SPREAD, colors: [ZARZAMORA, CAJETA, BLUEBERRY] },
  )
  expect(result.tint.near).toBeLessThanOrEqual(0.35)
  expect(result.tint.far).toBeGreaterThanOrEqual(0.1)
  expect(result.tint.near).toBeGreaterThan(result.tint.far)
  expect(result.pale).toBe(true)
})

test('the spread cream carries the tint as vertex colors: stronger next to the filling, none on an untinted half', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { roundOutline, spreadGeometry, spreadShape } = await import(url)
    const outline = roundOutline(1, 96)
    const shape = spreadShape('cream', 3)
    const height = 0.03
    const plain = spreadGeometry(outline, height, shape)
    // La mitad de x positiva es la primera del relleno en un piso redondo (el cilindro de three).
    const geometry = spreadGeometry(outline, height, shape, { cream: '#fffbfb', colors: ['#702c5a', null], firstHalf: 1, toward: 'above' })
    const color = geometry.getAttribute('color')
    const position = geometry.getAttribute('position')
    const rings = position.count / (outline.length + 1)
    // Cuánto se aparta del blanco (1, 1, 1) el multiplicador de la crema: 0 es crema sin tinte.
    const shift = (i: number) => Math.abs(1 - color.getX(i)) + Math.abs(1 - color.getY(i)) + Math.abs(1 - color.getZ(i))
    const column = (index: number) => Array.from({ length: rings }, (_, j) => shift(index * rings + j))
    // La columna 24 está en x > 0 (un cuarto de vuelta); la 72, en x < 0.
    return { plain: plain.getAttribute('color') ?? null, tinted: column(24), untinted: column(72), x: [position.getX(24 * rings), position.getX(72 * rings)] }
  }, SPREAD)
  expect(result.plain).toBeNull()
  expect(result.x[0]).toBeGreaterThan(0)
  expect(result.x[1]).toBeLessThan(0)
  for (const value of result.untinted) expect(value).toBeLessThan(1e-6)
  for (const value of result.tinted) expect(value).toBeGreaterThan(0)
  // `toward: 'above'`: el relleno está arriba, así que el anillo de arriba lleva más color que el de abajo.
  expect(result.tinted.at(-1)!).toBeGreaterThan(result.tinted[0] * 1.5)
  for (let j = 1; j < result.tinted.length; j++) expect(result.tinted[j]).toBeGreaterThanOrEqual(result.tinted[j - 1] - 1e-9)
})
