import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { mockProductDetails, productDetail } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Los postres con modelo (D95): los vasos de gelatina (la gelatina mosaico, firme; la crema y los yogures, líquidos con cubos; la de
 * Duvalín, en capas), la tarta mini, el flan napolitano, el Imposible, el Posible y la gelatina de molde (D98). `/muestra/modelo/:slug` los dibuja con la misma escena y la misma cámara de
 * las imágenes del catálogo (D86) y da su captura; la forma sale de `dessertSamples.ts` por el `slug` del producto, que tiene que
 * existir en la API. La API se simula con los productos de la semilla (`0009_seed_catalog` y `0059_seed_cup_gelatins`). Las capturas
 * quedan en `test-results/` para revisarlas.
 */

const LAYOUT = '/src/three/dessertLayout.ts'
const SAMPLES = '/src/viewmodels/dessertSamples.ts'
const FRAMING = '/src/three/stillFraming.ts'

/** Los postres del catálogo con modelo: los cinco vasos de gelatina, la tarta, el flan napolitano, el Imposible, el Posible y la gelatina de molde. */
const DESSERTS = [
  { slug: 'gelatina-mosaico', kind: 'mosaicCup' },
  { slug: 'mosaico-con-crema', kind: 'mosaicCup' },
  { slug: 'mosaico-con-yogurt-de-durazno', kind: 'mosaicCup' },
  { slug: 'mosaico-con-yogurt-de-fresa', kind: 'mosaicCup' },
  { slug: 'gelatina-de-duvalin', kind: 'layeredCup' },
  { slug: 'tarta-de-frutas', kind: 'miniTart' },
  { slug: 'flan-napolitano', kind: 'flan' },
  { slug: 'imposible', kind: 'flan' },
  { slug: 'posible', kind: 'flan' },
  { slug: 'gelatina-de-molde', kind: 'moldRing' },
] as const

/** Los vasos con cubos: la gelatina firme y los líquidos. */
const SOLID_CUP = 'gelatina-mosaico'
const CREAMY_CUPS = ['mosaico-con-crema', 'mosaico-con-yogurt-de-durazno', 'mosaico-con-yogurt-de-fresa'] as const

async function openRender(page: Page, slug: string, { known = true } = {}) {
  await mockCakeDesignOptions(page)
  await mockProductDetails(page, known ? [productDetail(slug)] : [])
  await page.setViewportSize({ width: 1200, height: 1200 })
  await page.goto(`/muestra/modelo/${slug}`)
  return page.getByTestId('render-modelo')
}

for (const { slug, kind } of DESSERTS) {
  test(`${slug}: renders its model and the capture is a 1200 x 1000 WebP cropped to the dessert`, async ({ page }, testInfo) => {
    const render = await openRender(page, slug)
    await expect(render).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
    await expect(render).toHaveAttribute('data-dessert', kind)
    const measured = await page.evaluate(async (framing) => {
      const { opaqueBounds } = await import(framing)
      const url = (window as unknown as { __captureModel?: () => string }).__captureModel?.() ?? ''
      const bitmap = await createImageBitmap(await (await fetch(url)).blob())
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data
      return { url, type: url.slice(0, url.indexOf(';')), width: bitmap.width, height: bitmap.height, corner: data[3], box: opaqueBounds(data, bitmap.width, bitmap.height) }
    }, FRAMING)
    await writeFile(testInfo.outputPath(`${slug}-modelo.webp`), Buffer.from(measured.url.slice(measured.url.indexOf(',') + 1), 'base64'))
    expect(measured.type).toBe('data:image/webp')
    expect([measured.width, measured.height]).toEqual([1200, 1000])
    expect(measured.corner).toBe(0)
    // Apoyado en el borde de abajo y centrado; a lo ancho, 1140 px, salvo que sea tan alto (el vaso) que se achique para caber.
    expect(Math.abs(measured.box.y + measured.box.height - 1000)).toBeLessThanOrEqual(4)
    expect(Math.abs(measured.box.x + measured.box.width / 2 - 600)).toBeLessThanOrEqual(4)
    expect(measured.box.width).toBeLessThanOrEqual(1144)
    expect(Math.abs(measured.box.width - 1140) <= 4 || measured.box.y <= 28).toBe(true)
  })
}

test('a dessert the API does not have is not rendered: the product is not invented', async ({ page }) => {
  const render = await openRender(page, 'tarta-de-frutas', { known: false })
  await expect(render).toHaveAttribute('data-state', 'error')
  await expect(page.getByRole('alert')).toHaveText('No encontramos este pastel.')
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('the cups change flavor with their colors and style, and each dessert fits the scene budget', async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal')
  const result = await page.evaluate(
    async ([layout, samples]) => {
      const { dessertContent, dessertTriangles, mosaicCubes } = await import(layout)
      const { dessertSample, mosaicCup } = await import(samples)
      const solid = dessertSample('gelatina-mosaico')
      const other = mosaicCup({ base: '#f2c6cf', cubes: ['#cf2a2c', '#2f6b2c'] })
      const cubes = mosaicCubes(solid)
      const otherCubes = mosaicCubes(other)
      const slugs = ['gelatina-mosaico', 'mosaico-con-crema', 'mosaico-con-yogurt-de-durazno', 'mosaico-con-yogurt-de-fresa', 'gelatina-de-duvalin', 'tarta-de-frutas', 'flan-napolitano', 'imposible', 'posible', 'gelatina-de-molde']
      return {
        // El `slug` de antes del yogurt (`0059_seed_cup_gelatins` lo renombró) ya no tiene modelo.
        kinds: [...slugs, 'tres-leches-de-fresa', 'mosaico-con-yogurt'].map((slug) => dessertSample(slug)?.kind ?? null),
        styles: slugs.slice(0, 4).map((slug) => dessertSample(slug)?.style ?? null),
        solidColors: [...new Set(cubes.map((cube: { color: number }) => cube.color))].sort(),
        otherColors: [...new Set(otherCubes.map((cube: { color: number }) => cube.color))].sort(),
        sameSpots: JSON.stringify(cubes.map((cube: { p: number[] }) => cube.p)) === JSON.stringify(mosaicCubes(solid).map((cube: { p: number[] }) => cube.p)),
        noCubes: mosaicCubes(mosaicCup({ base: '#f2c6cf', cubes: [] })).length,
        budgets: slugs.map((slug) => dessertTriangles(dessertSample(slug))),
        // El vaso mide 9.55 cm de alto con su tapa: en unidades de la escena, con la escala de los moldes.
        cupTop: Math.max(...dessertContent(solid).circles.map((circle: { y: number }) => circle.y)) / solid.unitsPerCm,
        flanBoard: dessertSample('flan-napolitano')?.board?.color ?? null,
      }
    },
    [LAYOUT, SAMPLES],
  )
  // Todos los postres de la semilla tienen modelo (D98: también el Posible y la gelatina de molde); un pastel no es un postre.
  expect(result.kinds).toEqual(['mosaicCup', 'mosaicCup', 'mosaicCup', 'mosaicCup', 'layeredCup', 'miniTart', 'flan', 'flan', 'flan', 'moldRing', null, null])
  // La gelatina mosaico es firme; la crema y los yogures, líquidos.
  expect(result.styles).toEqual(['solid', 'creamy', 'creamy', 'creamy'])
  // Verde casi negro (dos veces en la lista, la mitad de los cubos), rojo y naranja.
  expect(result.solidColors).toEqual([0, 1, 2, 3])
  expect(result.otherColors).toEqual([0, 1])
  expect(result.sameSpots).toBe(true)
  expect(result.noCubes).toBe(0)
  for (const budget of result.budgets) {
    expect(budget.withinBudget).toBe(true)
    expect(budget.triangles).toBeGreaterThan(1000)
  }
  expect(result.cupTop).toBeCloseTo(9.55, 2)
  // El flan va sobre la charola negra de los pasteles, no en su recipiente transparente.
  expect(result.flanBoard).toBe('#2c2c2c')
})

test('the Imposible is a cake-sized flan on the cake board: chocolate bread below, a taller flan above and a caramel top', async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal')
  const result = await page.evaluate(
    async ([layout, samples]) => {
      const { dessertContent, flanBreadTop, flanDrips, flanProfile, flanSize } = await import(layout)
      const { dessertModelImage, dessertSample } = await import(samples)
      const imposible = dessertSample('imposible')
      const napolitano = dessertSample('flan-napolitano')
      const size = flanSize(imposible)
      const breadTop = flanBreadTop(imposible)
      const profile = flanProfile(imposible) as [number, number][]
      // La cara de arriba cubierta: el caramelo llega al centro, por encima del flan.
      const drips = flanDrips(imposible) as { positions: ArrayLike<number> }
      let capTop = -Infinity
      for (let i = 0; i < drips.positions.length; i += 3) {
        if (Math.hypot(drips.positions[i], drips.positions[i + 2]) < 0.01) capTop = Math.max(capTop, drips.positions[i + 1])
      }
      const napolitanDrips = flanDrips(napolitano) as { positions: ArrayLike<number> }
      let napolitanCenter = 0
      for (let i = 0; i < napolitanDrips.positions.length; i += 3) {
        if (Math.hypot(napolitanDrips.positions[i], napolitanDrips.positions[i + 2]) < 0.01) napolitanCenter += 1
      }
      const widest = (shape: unknown) => Math.max(...(dessertContent(shape).circles as { r: number }[]).map((circle) => circle.r))
      return {
        bread: imposible.bread,
        board: imposible.board?.color ?? null,
        size: imposible.size,
        breadHeight: breadTop - size.base,
        flanHeight: size.height - breadTop,
        // Dos puntos juntos en el corte, para que el color cambie ahí.
        cut: profile.filter(([, y]) => Math.abs(y - breadTop) <= 0.05 + 1e-9).length,
        capTop,
        top: size.height,
        napolitanBread: flanBreadTop(napolitano),
        napolitanCenter,
        // Del tamaño de un pastel: varias veces el ancho del napolitano.
        widthRatio: widest(imposible) / widest(napolitano),
        image: dessertModelImage('imposible'),
        noImage: dessertModelImage('tres-leches-de-fresa'),
      }
    },
    [LAYOUT, SAMPLES],
  )
  expect(result.size).toBe('whole')
  expect(result.board).toBe('#2c2c2c')
  expect(result.bread).toBe('#3b2419')
  // El pan, más bajo que el flan.
  expect(result.breadHeight).toBeGreaterThan(2)
  expect(result.breadHeight).toBeLessThan(result.flanHeight)
  expect(result.cut).toBe(2)
  expect(result.capTop).toBeGreaterThan(result.top)
  // El napolitano no cambia: sin pan ni caramelo en la cara de arriba.
  expect(result.napolitanBread).toBe(0)
  expect(result.napolitanCenter).toBe(0)
  expect(result.widthRatio).toBeGreaterThan(1.8)
  expect(result.image).toBe('imposible-modelo.webp')
  expect(result.noImage).toBeNull()
})

test('the Posible is the Imposible with vanilla bread: same measures, flan and caramel, a pale bread lighter than the flan', async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal')
  const result = await page.evaluate(
    async ([layout, samples]) => {
      const { flanProfile, flanSize } = await import(layout)
      const { dessertModelImage, dessertSample } = await import(samples)
      const posible = dessertSample('posible')
      const imposible = dessertSample('imposible')
      const napolitano = dessertSample('flan-napolitano')
      const { bread, ...rest } = posible
      const { bread: chocolate, ...imposibleRest } = imposible
      // Luminosidad y saturación (HSL) de un `#rrggbb`, con una conversión propia de la prueba.
      const hsl = (hex: string) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const l = (max + min) / 2
        const d = max - min
        return { l, s: d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min) }
      }
      return {
        bread,
        chocolate,
        sameRest: JSON.stringify(rest) === JSON.stringify(imposibleRest),
        sameProfile: JSON.stringify(flanProfile(posible)) === JSON.stringify(flanProfile(imposible)),
        wholeSize: flanSize(posible),
        napolitanSize: flanSize(napolitano),
        breadTone: hsl(bread),
        custardTone: hsl(posible.custard),
        image: dessertModelImage('posible'),
      }
    },
    [LAYOUT, SAMPLES],
  )
  expect(result.bread).toBe('#efe2bb')
  expect(result.chocolate).toBe('#3b2419')
  // Todo lo demás, igual al Imposible: tamaño, flan, cara de arriba, caramelo y charola; y el mismo perfil (las mismas medidas).
  expect(result.sameRest).toBe(true)
  expect(result.sameProfile).toBe(true)
  // Las medidas de los dos tamaños no cambian.
  expect([result.wholeSize.bottomRadius, result.wholeSize.height, result.wholeSize.breadHeight]).toEqual([11.5, 9, 3.8])
  expect([result.napolitanSize.bottomRadius, result.napolitanSize.height, result.napolitanSize.breadHeight]).toEqual([3.8, 4.25, 0])
  // El pan de vainilla se distingue del flan dorado: más claro y más apagado.
  expect(result.breadTone.l).toBeGreaterThan(result.custardTone.l + 0.08)
  expect(result.breadTone.s).toBeLessThan(result.custardTone.s)
  expect(result.image).toBe('posible-modelo.webp')
})

test('the mold gelatin is a fluted ring with a hole, contiguous color layers under a thick crown, fruit on every lobe and on the cake board', async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal')
  const result = await page.evaluate(
    async ([layout, samples]) => {
      const { dessertTriangles, dessertView, MOLD_RING, moldBands, moldFruit, moldRingBody } = await import(layout)
      const { dessertModelImage, dessertSample } = await import(samples)
      const mold = dessertSample('gelatina-de-molde')
      const body = moldRingBody(mold) as { positions: number[]; colors: number[] }
      const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')}`
      const { cuts } = moldBands(mold) as { cuts: number[] }
      const crownFrom = MOLD_RING.height - MOLD_RING.crownBand
      // En el centro de un gajo (ángulo 0: x > 0, z = 0) el color es el de la capa sin sombra: cada altura, su capa.
      const wrongLayer: string[] = []
      const outerRing: [number, number][] = []
      let innermost = Infinity
      for (let i = 0; i < body.positions.length; i += 3) {
        const [x, y, z] = [body.positions[i], body.positions[i + 1], body.positions[i + 2]]
        const r = Math.hypot(x, z)
        innermost = Math.min(innermost, r)
        if (y === 0 && r > MOLD_RING.outerBottom - 1) outerRing.push([Math.atan2(z, x), r])
        if (Math.abs(z) > 1e-9 || x <= 0) continue
        const index = cuts.findIndex((cut) => y < cut)
        const expected = index === -1 ? mold.crown : mold.layers[index]
        const actual = hex(body.colors[i], body.colors[i + 1], body.colors[i + 2])
        if (actual !== expected) wrongLayer.push(`${y.toFixed(2)}: ${actual} en lugar de ${expected}`)
      }
      // Los gajos del costado, al pie: cuántos máximos tiene el radio alrededor (sin repetir el anillo del fondo).
      const ring = [...new Map(outerRing.map(([a, r]) => [a.toFixed(6), r])).entries()].map(([a, r]) => [Number(a), r]).sort((p, q) => p[0] - q[0])
      const peaks = ring.filter((_, j) => ring[j][1] > ring[(j + ring.length - 1) % ring.length][1] && ring[j][1] > ring[(j + 1) % ring.length][1]).length
      const fruit = moldFruit() as { placements: { piece: string; p: number[] }[] }
      const other = moldBands({ layers: ['#cf2a2c', '#2f6b2c'] }) as { cuts: number[] }
      return {
        lobes: MOLD_RING.lobes,
        peaks,
        depth: Math.max(...ring.map(([, r]) => r)) - Math.min(...ring.map(([, r]) => r)),
        wrongLayer,
        cuts,
        crownFrom,
        innermost,
        innerBottom: MOLD_RING.innerBottom,
        layers: mold.layers,
        crown: mold.crown,
        board: mold.board?.color ?? null,
        pieces: fruit.placements.map((placement) => placement.piece),
        fruitRadii: fruit.placements.map((placement) => Math.hypot(placement.p[0], placement.p[2])),
        innerTop: MOLD_RING.innerTop,
        outerTop: MOLD_RING.outerTop,
        otherCuts: other.cuts,
        budget: dessertTriangles(mold),
        view: dessertView(mold),
        image: dessertModelImage('gelatina-de-molde'),
      }
    },
    [LAYOUT, SAMPLES],
  )
  // De arriba hacia abajo, como la foto: crema, rosa y naranja dos veces bajo la capa amarilla gruesa.
  expect(result.layers).toEqual(['#f08a1c', '#ec8fa0', '#f7ecd2', '#f08a1c', '#ec8fa0', '#f7ecd2'])
  expect(result.crown).toBe('#f6c514')
  // Capas contiguas y parejas, de abajo hasta la capa gruesa, sin huecos ni encimadas; cada altura lleva el color de su capa.
  expect(result.cuts).toHaveLength(6)
  const band = result.crownFrom / 6
  result.cuts.forEach((cut, i) => expect(cut).toBeCloseTo((i + 1) * band, 9))
  expect(result.wrongLayer).toEqual([])
  // La capa gruesa de arriba mide más que una delgada.
  expect(6 - result.crownFrom).toBeGreaterThan(2 * band)
  // Otro sabor es otra lista de capas.
  expect(result.otherCuts).toHaveLength(2)
  // El festón: de 12 a 14 gajos al pie, con la arista entre dos bien marcada.
  expect(result.lobes).toBeGreaterThanOrEqual(12)
  expect(result.lobes).toBeLessThanOrEqual(14)
  expect(result.peaks).toBe(result.lobes)
  expect(result.depth).toBeGreaterThan(0.4)
  // El hueco: nada de gelatina más cerca del centro que el tubo del molde.
  expect(result.innermost).toBeGreaterThanOrEqual(result.innerBottom - 1e-9)
  // Un gajo de durazno o una fresa en cada gajo, alternados, sobre la corona.
  expect(result.pieces).toHaveLength(result.lobes)
  result.pieces.forEach((piece, i) => expect(piece).toBe(i % 2 === 0 ? 'peachSlice' : 'strawberryHalf'))
  for (const radius of result.fruitRadii) {
    expect(radius).toBeGreaterThan(result.innerTop)
    expect(radius).toBeLessThan(result.outerTop)
  }
  expect(result.board).toBe('#2c2c2c')
  expect(result.budget.withinBudget).toBe(true)
  expect(result.view.still).toBeGreaterThan(result.view.scene)
  expect(result.image).toBe('gelatina-de-molde-modelo.webp')
})

/** Lo que miden las pruebas de los cubos de un vaso: contención, tamaño, reparto, giro y velo. */
async function measureCubes(page: Page, slug: string) {
  return page.evaluate(
    async ([layout, samples, cup]) => {
      const { cubeCorners, cupRadius, LID_UNDERSIDE, mosaicCubes, mosaicLook } = await import(layout)
      const { dessertSample } = await import(samples)
      const sample = dessertSample(cup)
      const cubes = mosaicCubes(sample) as { p: number[]; size: number; rotation: number[]; veil: number }[]
      // Los que asoman de la base hacia el vaso: alguna esquina pasa de la superficie de la base a su altura.
      const { core } = mosaicLook(sample)
      const showing = cubes.filter((cube) => (cubeCorners(cube) as [number, number, number][]).some(([x, y, z]) => Math.hypot(x, z) > cupRadius(y) - core)).length
      let worstWall = -Infinity
      let highest = -Infinity
      let lowest = Infinity
      for (const cube of cubes) {
        // Cada esquina, con el giro del cubo, contra la pared a su propia altura: el vaso se angosta hacia abajo.
        for (const [x, y, z] of cubeCorners(cube) as [number, number, number][]) {
          worstWall = Math.max(worstWall, Math.hypot(x, z) - cupRadius(y))
          highest = Math.max(highest, y)
          lowest = Math.min(lowest, y)
        }
      }
      const sizes = cubes.map((cube) => cube.size)
      // Cuántos cubos hay en cada cuarto de la altura del vaso.
      const quarters = [0, 0, 0, 0]
      for (const cube of cubes) quarters[Math.min(3, Math.floor((cube.p[1] / 8.75) * 4))] += 1
      // Cuánto se aparta cada cubo de "de frente a la pared": el giro sobre `x` y sobre `z` (con `y` lo orienta hacia la pared).
      const tilted = cubes.filter(({ rotation }) => Math.abs(Math.sin(rotation[2])) > 0.35 || Math.abs(Math.sin(rotation[0])) > 0.35).length
      const veils = cubes.map((cube) => cube.veil)
      const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
      const middle = 8.75 / 2
      return {
        count: cubes.length,
        showing,
        smallest: Math.min(...sizes),
        largest: Math.max(...sizes),
        worstWall,
        highest,
        lowest,
        lid: LID_UNDERSIDE,
        quarters,
        tilted,
        minVeil: Math.min(...veils),
        maxVeil: Math.max(...veils),
        lowerVeil: mean(cubes.filter((cube) => cube.p[1] < middle).map((cube) => cube.veil)),
        upperVeil: mean(cubes.filter((cube) => cube.p[1] >= middle).map((cube) => cube.veil)),
      }
    },
    [LAYOUT, SAMPLES, slug] as const,
  )
}

test('the solid mosaic cubes stay inside the cup and under the lid, vary in size, keep their color and fill the cup evenly', async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal')
  const result = await measureCubes(page, SOLID_CUP)
  expect(result.count).toBeGreaterThanOrEqual(25)
  expect(result.count).toBeLessThanOrEqual(50)
  // Tamaños parecidos pero no iguales: una variación moderada (± 22 % de arista), nunca uno el doble de otro.
  expect(result.largest / result.smallest).toBeGreaterThan(1.15)
  expect(result.largest / result.smallest).toBeLessThanOrEqual(1.6)
  expect(result.worstWall).toBeLessThan(0)
  expect(result.highest).toBeLessThan(result.lid)
  expect(result.lowest).toBeGreaterThan(0)
  for (const quarter of result.quarters) expect(quarter).toBeGreaterThanOrEqual(5)
  // Giros en los tres ejes: la mayoría no queda de frente (asoma una arista o una esquina).
  expect(result.tilted / result.count).toBeGreaterThan(0.5)
  // En la gelatina firme el cubo conserva su color.
  expect([result.minVeil, result.maxVeil]).toEqual([0, 0])
})

for (const slug of CREAMY_CUPS) {
  test(`${slug}: cubes the size of the solid cup's but many more, coated by the liquid (more at the bottom), inside the cup and under the lid`, async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/legal')
    const result = await measureCubes(page, slug)
    const solid = await measureCubes(page, SOLID_CUP)
    console.log(`${slug}: ${result.count} cubes, ${result.showing} showing toward the cup; ${SOLID_CUP}: ${solid.count}, ${solid.showing} showing`)
    // Más que la gelatina firme, con cubos del mismo tamaño (± 22 % de arista). Con cubos de 1.4 cm girados al azar el vaso se llena
    // pronto: 29 contra 26 con el núcleo a 1.5 cm de la pared; 33 en todo el volumen con un líquido transparente; unos 36 de tope.
    expect(result.count).toBeGreaterThan(solid.count)
    // La misma arista que la gelatina firme: 1.4 cm ± 22 %.
    for (const cup of [result, solid]) {
      expect(cup.smallest).toBeGreaterThanOrEqual(1.4 * 0.78 - 1e-9)
      expect(cup.largest).toBeLessThanOrEqual(1.4 * 1.22 + 1e-9)
    }
    expect(result.largest / result.smallest).toBeGreaterThan(1.15)
    expect(result.largest / result.smallest).toBeLessThanOrEqual(1.6)
    expect(result.worstWall).toBeLessThan(0)
    expect(result.highest).toBeLessThan(result.lid)
    expect(result.lowest).toBeGreaterThan(0)
    console.log(`${slug}: cubes per height quarter, bottom to top: ${result.quarters.join(', ')}`)
    // Ningún cuarto del alto vacío; el de abajo, donde el vaso es más angosto, lleva menos.
    for (const quarter of result.quarters) expect(quarter).toBeGreaterThanOrEqual(4)
    // Cada cubo, envuelto entre 25 y 45 % por el color del líquido; más abajo, más.
    expect(result.minVeil).toBeGreaterThanOrEqual(0.25)
    expect(result.maxVeil).toBeLessThanOrEqual(0.45)
    expect(result.lowerVeil).toBeGreaterThan(result.upperVeil)
  })
}

for (const slug of [SOLID_CUP, ...CREAMY_CUPS]) {
  test(`${slug}: no two cubes overlap`, async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/legal')
    const result = await page.evaluate(
      async ([layout, samples, cup]) => {
        const { cubesOverlap, mosaicCubes } = await import(layout)
        const { dessertSample } = await import(samples)
        type Cube = { p: [number, number, number]; rotation: [number, number, number]; size: number }
        const cubes = mosaicCubes(dessertSample(cup)) as Cube[]
        // Un giro propio de la prueba, sin usar el del módulo: Ry · Rz · Rx (el orden YZX de three).
        const matrix = ([x, y, z]: [number, number, number]) => {
          const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)]
          const ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
          const rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
          const rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
          const mul = (a: number[][], b: number[][]) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]))
          return mul(mul(ry, rz), rx)
        }
        // Puntos de cada cubo (una rejilla de 6 × 6 × 6 que incluye sus caras y aristas) dentro del otro: se enciman.
        const steps = [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5]
        const inside = (a: Cube, b: Cube) => {
          const ma = matrix(a.rotation)
          const mb = matrix(b.rotation)
          for (const u of steps) for (const v of steps) for (const w of steps) {
            const local = [u * a.size, v * a.size, w * a.size]
            const world = [0, 1, 2].map((i) => a.p[i] + ma[i][0] * local[0] + ma[i][1] * local[1] + ma[i][2] * local[2])
            const d = [0, 1, 2].map((i) => world[i] - b.p[i])
            // La transpuesta de `mb` lleva el punto a las coordenadas del otro cubo.
            const inB = [0, 1, 2].map((j) => mb[0][j] * d[0] + mb[1][j] * d[1] + mb[2][j] * d[2])
            if (inB.every((value) => Math.abs(value) <= b.size / 2)) return true
          }
          return false
        }
        const near = (a: Cube, b: Cube) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) <= ((a.size + b.size) * Math.sqrt(3)) / 2
        const touching: string[] = []
        for (let i = 0; i < cubes.length; i++) {
          for (let j = i + 1; j < cubes.length; j++) {
            if (cubesOverlap(cubes[i], cubes[j], 0)) touching.push(`${i}-${j} (ejes)`)
            if (near(cubes[i], cubes[j]) && (inside(cubes[i], cubes[j]) || inside(cubes[j], cubes[i]))) touching.push(`${i}-${j} (puntos)`)
          }
        }
        // Las dos pruebas sí detectan dos cubos encimados a propósito.
        const twin = { ...cubes[0], p: [cubes[0].p[0] + cubes[0].size * 0.4, cubes[0].p[1], cubes[0].p[2]] as [number, number, number] }
        return { touching, detects: cubesOverlap(cubes[0], twin, 0) && inside(cubes[0], twin) }
      },
      [LAYOUT, SAMPLES, slug] as const,
    )
    expect(result.detects).toBe(true)
    expect(result.touching).toEqual([])
  })
}

test('the Duvalín cup has three even layers, bottom to top, inside the cup and under the lid', async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal')
  const result = await page.evaluate(
    async ([layout, samples]) => {
      const { cupRadius, layerProfiles, LID_UNDERSIDE } = await import(layout)
      const { dessertSample } = await import(samples)
      const duvalin = dessertSample('gelatina-de-duvalin')
      const profiles = layerProfiles(duvalin.layers.length) as [number, number][][]
      const spans = profiles.map((profile) => [Math.min(...profile.map(([, y]) => y)), Math.max(...profile.map(([, y]) => y))])
      // Ningún punto de ningún perfil sale del vaso a su altura.
      const worstWall = Math.max(...profiles.flat().map(([r, y]) => r - cupRadius(y)))
      return { layers: duvalin.layers, spans, worstWall, lid: LID_UNDERSIDE }
    },
    [LAYOUT, SAMPLES],
  )
  // De abajo hacia arriba: café claro, rosa y amarillo.
  expect(result.layers).toEqual(['#c99a6c', '#f0a0b8', '#f2d67c'])
  expect(result.spans).toHaveLength(3)
  // Cada capa empieza donde acaba la de abajo, y las tres miden lo mismo (la de arriba, más su abombado).
  for (let i = 1; i < 3; i++) expect(result.spans[i][0]).toBeCloseTo(result.spans[i - 1][1], 5)
  const heights = result.spans.slice(0, 2).map(([from, to]) => to - from)
  expect(heights[0]).toBeCloseTo(heights[1], 5)
  expect(result.worstWall).toBeLessThan(0)
  expect(result.spans[2][1]).toBeLessThan(result.lid)
})

test('the coating lightens each cube toward its liquid but keeps its hue: the dark green never turns grey', async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/legal')
  const result = await page.evaluate(
    async ([layout, samples, palette, cups]) => {
      const { mosaicCubes } = await import(layout)
      const { dessertSample } = await import(samples)
      const { veilColor } = await import(palette)
      // Tono (en grados), saturación y luminosidad de un `#rrggbb`, con una conversión propia de la prueba.
      const hsl = (hex: string) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const l = (max + min) / 2
        const d = max - min
        if (d === 0) return { h: 0, s: 0, l }
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60
        return { h, s, l }
      }
      return (cups as readonly string[]).map((slug) => {
        const cup = dessertSample(slug)
        const green = cup.cubes[0] as string
        const greens = (mosaicCubes(cup) as { color: number; veil: number }[]).filter((cube) => cup.cubes[cube.color] === green)
        const tints = greens.map((cube) => hsl(veilColor(green, cup.base, cube.veil)))
        return { slug, raw: hsl(green), hues: tints.map((tint) => tint.h), saturations: tints.map((tint) => tint.s), lightness: tints.map((tint) => tint.l) }
      })
    },
    [LAYOUT, SAMPLES, '/src/three/palette.ts', CREAMY_CUPS] as const,
  )
  for (const cup of result) {
    expect(cup.hues.length).toBeGreaterThan(5)
    for (const hue of cup.hues) expect(Math.abs(hue - cup.raw.h)).toBeLessThan(2)
    // Saturada, no gris: conserva al menos el 85 % de la saturación del verde.
    for (const saturation of cup.saturations) expect(saturation).toBeGreaterThanOrEqual(cup.raw.s * 0.85 - 0.01)
    // Envuelto: más claro que el verde solo, hacia el líquido.
    for (const lightness of cup.lightness) expect(lightness).toBeGreaterThan(cup.raw.l)
  }
})
