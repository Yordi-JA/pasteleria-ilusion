import { expect, test } from '@playwright/test'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Lo que agregó el rediseño de las muestras de los 8 pasteles de antes (migraciones `0066` y `0067`), solo para las imágenes del
 * catálogo y la ficha: la manzana roja en láminas grandes y el limón en rodajas; la fruta encimada que cubre la parte libre de la
 * tapa (`cover`) o su mitad de atrás (`back`) y las filas de atrás hacia el frente (`columns`); los tulipanes abiertos, los rizos en
 * media tapa y el rizo de listón; la celosía de garabatos y las pinceladas diagonales del costado. Los módulos puros se importan en el
 * navegador desde el servidor de desarrollo, como en `cake-sample-details.spec.ts`.
 */
const URLS = {
  details: '/src/three/sampleDetails.ts',
  decoration: '/src/three/decorationLayout.ts',
  fruit: '/src/three/fruit.ts',
  texture: '/src/three/sideTexture.ts',
  catalog: '/src/models/catalog.ts',
  budget: '/src/three/pieceBudget.ts',
  pattern: '/src/three/topPattern.ts',
}

/** El pastel de vitrina: 28 cm de diámetro y 6.7 cm de alto, a 0.068 unidades por cm. */
const TIER = { radius: 0.952, height: 0.456, frosting: '#efe9e3' }
const EDGE = 0.06
const U = 0.068

type Piece = { kind: string; piece: string; p: number[]; reach: number; tilt: number }

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  // Una vista sin pastel 3D: solo cuenta lo que importan las pruebas.
  await page.goto('/legal')
})

test('the red apple wedge and the lemon slice are flat, fruit-sized pieces in their own colors', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const fruit = await import(url)
    const measure = (piece: string) => {
      const mesh = fruit.fruitMesh(piece)
      let [maxY, maxXZ, red, yellow] = [0, 0, 0, 0]
      for (let i = 0; i < mesh.positions.length; i += 3) {
        maxY = Math.max(maxY, mesh.positions[i + 1])
        maxXZ = Math.max(maxXZ, Math.hypot(mesh.positions[i], mesh.positions[i + 2]))
        const [r, g, b] = [mesh.colors[i], mesh.colors[i + 1], mesh.colors[i + 2]]
        if (r > 0.6 && g < 0.35 && b < 0.35) red++
        if (r > 0.8 && g > 0.65 && b < 0.45) yellow++
      }
      return { maxY, width: maxXZ * 2, red, yellow, count: mesh.positions.length / 3 }
    }
    return { wedge: measure('appleWedge'), sheet: measure('appleSheet'), citrus: measure('citrusSlice'), pieces: fruit.FRUIT_PIECES }
  }, URLS.fruit)
  expect(result.pieces).toEqual(expect.arrayContaining(['appleWedge', 'appleSheet', 'citrusSlice']))
  // Una lámina de manzana de unos 6 a 7 cm, delgada, con la cáscara roja en la orilla.
  expect(result.wedge.width).toBeGreaterThan(5.5)
  expect(result.wedge.width).toBeLessThan(9)
  expect(result.wedge.maxY).toBeLessThan(1)
  expect(result.wedge.red).toBeGreaterThan(0)
  // La lámina fina: del mismo tamaño, más delgada y con su hilo de cáscara roja.
  expect(result.sheet.width).toBeCloseTo(result.wedge.width, 6)
  expect(result.sheet.maxY).toBeLessThan(result.wedge.maxY)
  expect(result.sheet.red).toBeGreaterThan(0)
  // Una rodaja de limón de unos 5 cm, delgada y amarilla.
  expect(result.citrus.width).toBeGreaterThan(4)
  expect(result.citrus.maxY).toBeLessThan(1)
  expect(result.citrus.yellow).toBeGreaterThan(result.citrus.count / 3)
})

test('cover: the fruit covers the free top, the first fruits of the list are the most, and the same cake gives the same fruit', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier, u }) => {
      const { fruitLayout } = await import(urls.fruit)
      const { tierDecoration } = await import(urls.decoration)
      const shape = (layout: string, density: number) => ({
        tiers: [tier],
        festoons: false,
        stand: false,
        decoration: { kind: 'rosettes', main: '#f3eee9', accent: '#f3eee9', size: 1.6 },
        topping: { kind: 'fruit', layout, fruits: ['apple_wedge', 'strawberry', 'apple', 'starfruit', 'kiwi'], unitsPerCm: u, density },
      })
      const run = (layout: string, density: number) => {
        const s = shape(layout, density)
        return fruitLayout(s, tierDecoration(s, 0))
      }
      const cover = run('cover', 1.8)
      const again = run('cover', 1.8)
      const mound = run('mound', 1)
      const sparse = run('cover', 1)
      const spread = (pieces: Piece[]) => Math.max(...pieces.map((piece) => Math.hypot(piece.p[0], piece.p[2]) + piece.reach))
      // Cada punto de la tapa hasta media tapa tiene una pieza encima o junto.
      let uncovered = 0
      for (let x = -0.45; x <= 0.45; x += 0.09) {
        for (let z = -0.45; z <= 0.45; z += 0.09) {
          if (Math.hypot(x, z) > 0.45) continue
          if (!cover.placements.some((piece: Piece) => Math.hypot(piece.p[0] - x, piece.p[2] - z) < piece.reach * 1.1)) uncovered++
        }
      }
      const kinds = cover.placements.reduce((counts: Record<string, number>, piece: Piece) => ({ ...counts, [piece.kind]: (counts[piece.kind] ?? 0) + 1 }), {})
      return {
        layout: cover.layout,
        same: JSON.stringify(cover) === JSON.stringify(again),
        count: cover.placements.length,
        moundCount: mound.placements.length,
        spread: spread(cover.placements),
        sparseSpread: spread(sparse.placements),
        uncovered,
        kinds,
        wedgePiece: cover.placements.find((piece: Piece) => piece.kind === 'apple_wedge')?.piece,
        top: Math.min(...cover.placements.map((piece: Piece) => piece.p[1])),
      }
    },
    { urls: URLS, tier: TIER, u: U },
  )
  expect(result.layout).toBe('cover')
  expect(result.same).toBe(true)
  expect(result.count).toBeGreaterThan(result.moundCount)
  expect(result.spread).toBeGreaterThan(TIER.radius * 0.6)
  expect(result.spread).toBeLessThan(TIER.radius - EDGE)
  // Con más fruta tupida, cubre más de la tapa.
  expect(result.spread).toBeGreaterThan(result.sparseSpread)
  expect(result.uncovered).toBe(0)
  // La manzana en láminas manda, luego la fresa; el kiwi es poco.
  expect(result.kinds.apple_wedge).toBeGreaterThan(result.kinds.kiwi)
  expect(result.kinds.strawberry).toBeGreaterThan(result.kinds.kiwi)
  expect(result.wedgePiece).toBe('appleWedge')
  expect(result.top).toBeGreaterThanOrEqual(TIER.height - 1e-9)
})

test('back: the fruit stays on the back half and leaves the front of the top clear', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier, u }) => {
      const { fruitLayout, COVER_REGIONS } = await import(urls.fruit)
      const shape = {
        tiers: [tier],
        festoons: false,
        stand: false,
        topping: { kind: 'fruit', layout: 'back', fruits: ['apple', 'strawberry', 'pear', 'apple_wedge', 'kiwi', 'peach'], unitsPerCm: u, density: 1.6 },
      }
      const layout = fruitLayout(shape)
      const [tx, tz] = COVER_REGIONS.back.toward
      const along = layout.placements.map((piece: Piece) => piece.p[0] * tx + piece.p[2] * tz)
      return { layout: layout.layout, count: layout.placements.length, min: Math.min(...along), mean: along.reduce((a: number, b: number) => a + b, 0) / along.length, toward: [tx, tz] }
    },
    { urls: URLS, tier: TIER, u: U },
  )
  expect(result.layout).toBe('back')
  expect(result.count).toBeGreaterThan(10)
  // Hacia atrás: la dirección de la región tiene la z negativa (el frente es +z).
  expect(result.toward[1]).toBeLessThan(0)
  expect(result.mean).toBeGreaterThan(0.15)
  expect(result.min).toBeGreaterThan(-TIER.radius * 0.35)
})

test('columns: flat rows from the back to the front that cover the top, one fruit per row and every fruit of the list', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier, u }) => {
      const { fruitLayout, COLUMNS } = await import(urls.fruit)
      const { tierDecoration } = await import(urls.decoration)
      const shape = {
        tiers: [tier],
        festoons: false,
        stand: false,
        decoration: { kind: 'shells', main: '#f6efe6', accent: '#f6efe6', size: 1.3 },
        topping: { kind: 'fruit', layout: 'columns', fruits: ['strawberry', 'citrus', 'apple_wedge', 'kiwi', 'pear'], unitsPerCm: u, density: 2 },
      }
      const layout = fruitLayout(shape, tierDecoration(shape, 0))
      // Al marco de las filas: `across` separa una fila de otra y `along` corre a lo largo de ella.
      const [c, s] = [Math.cos(COLUMNS.turn), Math.sin(COLUMNS.turn)]
      const frame = (p: number[]) => ({ along: p[0] * c - p[2] * s, across: p[0] * s + p[2] * c })
      const pieces = layout.placements.map((piece: Piece) => ({ ...frame(piece.p), kind: piece.kind }))
      // Las filas: piezas a la misma altura de `across`. Cada fila es de una sola fruta y casi todas llevan varias piezas a lo largo
      // (las de las orillas, donde la tapa es corta, pueden llevar una).
      const lines: { across: number; kinds: Set<string>; count: number }[] = []
      for (const piece of pieces as { along: number; across: number; kind: string }[]) {
        const line = lines.find((other) => Math.abs(other.across - piece.across) < 0.02)
        if (line) {
          line.kinds.add(piece.kind)
          line.count++
        } else lines.push({ across: piece.across, kinds: new Set([piece.kind]), count: 1 })
      }
      const inLine = lines.every((line) => line.kinds.size === 1) && lines.filter((line) => line.count >= 3).length >= 4
      return {
        kinds: [...new Set(layout.placements.map((piece: Piece) => piece.kind))].sort(),
        pieces: [...new Set(layout.placements.map((piece: Piece) => piece.piece))],
        reach: Math.max(...layout.placements.map((piece: Piece) => Math.hypot(piece.p[0], piece.p[2]))),
        inLine,
        turn: COLUMNS.turn,
        // Cuánto se gira cada pieza sobre el giro de las filas: las láminas de manzana, de través; las mitades de fresa, no.
        turns: Object.fromEntries(
          ['appleWedge', 'strawberryHalf'].map((name) => {
            const piece = layout.placements.find((placement: Piece & { yaw: number }) => placement.piece === name) as { yaw: number }
            return [name, piece.yaw - COLUMNS.turn]
          }),
        ),
      }
    },
    { urls: URLS, tier: TIER, u: U },
  )
  expect(result.kinds).toEqual(['apple_wedge', 'citrus', 'kiwi', 'pear', 'strawberry'])
  expect(result.pieces).not.toContain('strawberryWhole')
  expect(result.pieces).toContain('citrusSlice')
  expect(result.reach).toBeGreaterThan(TIER.radius * 0.6)
  expect(result.inLine).toBe(true)
  expect(Math.abs(result.turns.appleWedge - Math.PI / 2)).toBeLessThan(0.15)
  expect(Math.abs(result.turns.strawberryHalf)).toBeLessThan(0.15)
  // Las filas corren de atrás hacia el frente: el giro está cerca de un cuarto de vuelta.
  expect(Math.abs(result.turn - Math.PI / 2)).toBeLessThan(0.6)
})

test('capuchino open tulips: around the edge, lying along it like petals, open and dusted where they face up', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { shellLayout, sampleDetailsLayout } = await import(urls.details)
      const open = shellLayout(tier, 'open', 1)
      const layout = sampleDetailsLayout({ tiers: [tier], festoons: false, stand: false, details: { shells: { place: 'open', colors: ['#e2d3b5'] }, dusting: '#a8875e' } })
      return {
        shells: open.map((s: { p: number[]; tilt: number; toward: number[]; closed: boolean; tulip?: boolean; dustByNormal?: boolean }) => ({
          r: Math.hypot(s.p[0], s.p[2]),
          y: s.p[1],
          tilt: s.tilt,
          // Lo que se recarga hacia afuera o hacia adentro, contra lo que va a lo largo de la orilla.
          radial: Math.abs(s.toward[0] * s.p[0] + s.toward[1] * s.p[2]) / Math.hypot(s.p[0], s.p[2]),
          closed: s.closed,
          tulip: s.tulip === true,
          dust: s.dustByNormal === true,
        })),
        inset: layout.avoid.inset,
        dustOnTop: layout.dust !== null,
        triangles: layout.shells.mesh.indices.length / 3,
      }
    },
    { urls: URLS, tier: TIER },
  )
  expect(result.shells.length).toBeGreaterThanOrEqual(10)
  expect(result.shells.length).toBeLessThanOrEqual(16)
  for (const shell of result.shells) {
    expect(shell.r).toBeGreaterThan(TIER.radius * 0.6)
    expect(shell.r).toBeLessThan(TIER.radius)
    expect(shell.y).toBeGreaterThan(TIER.height)
    expect(shell.tilt).toBeGreaterThan(1.1)
    expect(shell.radial).toBeLessThan(0.4)
    expect(shell.closed).toBe(false)
    expect(shell.tulip).toBe(true)
    expect(shell.dust).toBe(true)
  }
  // La fruta queda dentro de la vuelta, y la canela cae también en la tapa.
  expect(result.inset).toBeGreaterThan(0.2)
  expect(result.dustOnTop).toBe(true)
  expect(result.triangles).toBeGreaterThan(0)
})

test('queso y chocolate: dusted chocolate curls on one half of the top and the fruit on the other half', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier, u }) => {
      const { shellLayout, sampleDetailsLayout, HALF_SHELLS } = await import(urls.details)
      const { fruitLayout } = await import(urls.fruit)
      const shape = {
        tiers: [tier],
        festoons: false,
        stand: false,
        topping: { kind: 'fruit', layout: 'cover', fruits: ['apple_wedge', 'strawberry', 'pear', 'kiwi', 'peach'], unitsPerCm: u, density: 2 },
        details: { shells: { place: 'half', colors: ['#5e3d2c', '#7a5440'] }, dusting: '#f4f0ea' },
      }
      const half = shellLayout(tier, 'half', 2)
      const layout = sampleDetailsLayout(shape)
      const fruit = fruitLayout(shape, undefined, layout.avoid)
      const [nx, nz] = HALF_SHELLS.toward
      const side = (p: number[]) => p[0] * nx + p[2] * nz
      return {
        shells: half.map((s: { p: number[]; arc?: number; dustByNormal?: boolean; cup?: boolean; tilt: number }) => ({
          side: side(s.p),
          r: Math.hypot(s.p[0], s.p[2]),
          curl: (s.arc ?? 1) < 1,
          dust: s.dustByNormal === true,
          cup: s.cup === true,
          standing: s.tilt > 1.2,
        })),
        look: layout.shells.place,
        fruit: fruit.placements.map((piece: Piece) => ({ side: side(piece.p), reach: piece.reach })),
        areas: layout.avoid.areas.length,
        dustOnTop: layout.dust !== null,
      }
    },
    { urls: URLS, tier: TIER, u: U },
  )
  expect(result.shells.length).toBeGreaterThanOrEqual(12)
  expect(result.shells.every((s: { side: number; r: number }) => s.side > -0.05 && s.r < TIER.radius - 0.05)).toBe(true)
  expect(result.shells.filter((s: { curl: boolean }) => s.curl).length).toBeGreaterThan(result.shells.length / 2)
  expect(result.shells.every((s: { dust: boolean }) => s.dust)).toBe(true)
  // Cascarones finos y abiertos, algunos de pie; la escena les da el brillo de las conchas de media tapa.
  expect(result.shells.every((s: { cup: boolean }) => s.cup)).toBe(true)
  expect(result.shells.filter((s: { standing: boolean }) => s.standing).length).toBeGreaterThan(2)
  expect(result.look).toBe('half')
  expect(result.areas).toBe(1)
  expect(result.fruit.length).toBeGreaterThan(10)
  // La fruta queda del otro lado del corte: a lo más la mitad de su alcance pasa hacia él (`COVER.edge`; una lámina no llena su círculo).
  expect(result.fruit.every((piece: { side: number; reach: number }) => piece.side + piece.reach * 0.5 < 0.05)).toBe(true)
  // El azúcar glass va en los rizos, no en la tapa ni bajo la fruta.
  expect(result.dustOnTop).toBe(false)
})

test('cajeta: one big ribbon curl stands on the top and the fruit keeps clear of it', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier, u }) => {
      const { shellLayout, sampleDetailsLayout } = await import(urls.details)
      const { fruitLayout } = await import(urls.fruit)
      const shape = {
        tiers: [tier],
        festoons: false,
        stand: false,
        topping: { kind: 'fruit', layout: 'cover', fruits: ['grape', 'apple_wedge', 'strawberry'], unitsPerCm: u, density: 2 },
        details: { shells: { place: 'curl', colors: ['#f3ebdc'] } },
      }
      const curl = shellLayout(tier, 'curl', 1)
      const layout = sampleDetailsLayout(shape)
      const fruit = fruitLayout(shape, undefined, layout.avoid)
      const ys: number[] = []
      for (let i = 1; i < layout.shells.mesh.positions.length; i += 3) ys.push(layout.shells.mesh.positions[i])
      const area = layout.avoid.areas[0]
      return {
        count: curl.length,
        ribbon: curl[0].ribbon === true,
        r: Math.hypot(curl[0].p[0], curl[0].p[2]),
        low: Math.min(...ys),
        high: Math.max(...ys),
        areas: layout.avoid.areas.length,
        // Como contra la orilla, cuenta la mitad del alcance de cada pieza (`COVER.edge`).
        clear: fruit.placements.every((piece: Piece) => Math.hypot(piece.p[0] - area.x, piece.p[2] - area.z) >= area.r + piece.reach * 0.5 - 1e-6),
        fruit: fruit.placements.length,
      }
    },
    { urls: URLS, tier: TIER, u: U },
  )
  expect(result.count).toBe(1)
  expect(result.ribbon).toBe(true)
  expect(result.r).toBeLessThan(TIER.radius - EDGE)
  // De pie sobre la tapa, de unos 3 a 7 cm de alto, casi el alto del pastel como en la foto.
  expect(result.low).toBeGreaterThan(TIER.height - 0.01)
  expect(result.high - TIER.height).toBeGreaterThan(2.5 * U)
  expect(result.high - TIER.height).toBeLessThan(7.5 * U)
  expect(result.areas).toBe(1)
  expect(result.fruit).toBeGreaterThan(8)
  expect(result.clear).toBe(true)
})

test('durazno: a closed lattice of chocolate scribbles all around the top and the side painted in diagonal strokes', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { sampleDetailsLayout } = await import(urls.details)
      const { drawSideTexture } = await import(urls.texture)
      const layout = sampleDetailsLayout({
        tiers: [tier],
        festoons: false,
        stand: false,
        details: { top: { color: '#e2b21c', glossy: true }, sideTexture: 'brushed', band: { color: '#e8b31a', height: 0.62 }, drizzle: { kind: 'lattice', color: '#432517' } },
      })
      const points = layout.drizzle.curves.flat()
      const sectors = new Set(points.map((p: number[]) => Math.floor(((Math.atan2(p[0], p[2]) + Math.PI) / (2 * Math.PI)) * 12)))
      // La franja: amarilla abajo y, arriba de un tercio del alto, pinceladas amarillas entre crema blanca.
      const { positions, colors } = layout.band
      let [low, lowYellow, middle, middleYellow, middleWhite, top] = [0, 0, 0, 0, 0, 0]
      for (let i = 0; i < positions.length; i += 3) {
        const y = positions[i + 1]
        top = Math.max(top, y)
        const yellow = colors[i + 2] < colors[i] * 0.55
        const white = colors[i + 2] > colors[i] * 0.85
        if (y < tier.height * 0.12) {
          low++
          if (yellow) lowYellow++
        } else if (y > tier.height * 0.35 && y < tier.height * 0.6) {
          middle++
          if (yellow) middleYellow++
          if (white) middleWhite++
        }
      }
      const canvas = drawSideTexture('brushed')
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
      const levels = new Set<number>()
      for (let i = 0; i < pixels.length; i += 4 * 97) levels.add(pixels[i])
      return {
        kind: layout.drizzle.kind,
        closed: layout.drizzle.closed,
        curves: layout.drizzle.curves.length,
        maxR: Math.max(...points.map((p: number[]) => Math.hypot(p[0], p[2]))),
        minR: Math.min(...points.map((p: number[]) => Math.hypot(p[0], p[2]))),
        minY: Math.min(...points.map((p: number[]) => p[1])),
        sectors: sectors.size,
        lowYellow: lowYellow / low,
        middleYellow: middleYellow / middle,
        middleWhite: middleWhite / middle,
        top,
        levels: levels.size,
      }
    },
    { urls: URLS, tier: TIER },
  )
  expect(result).toMatchObject({ kind: 'lattice', closed: true })
  expect(result.curves).toBeGreaterThanOrEqual(3)
  expect(result.maxR).toBeLessThan(TIER.radius - EDGE)
  expect(result.minR).toBeGreaterThan((TIER.radius - EDGE) * 0.4)
  expect(result.minY).toBeGreaterThan(TIER.height)
  expect(result.sectors).toBe(12)
  expect(result.lowYellow).toBeGreaterThan(0.9)
  expect(result.middleYellow).toBeGreaterThan(0.15)
  expect(result.middleWhite).toBeGreaterThan(0.15)
  expect(result.top).toBeLessThan(TIER.height - EDGE + 1e-6)
  expect(result.levels).toBeGreaterThan(3)
})

test('the API values of the redesign reach the scene, and the samples of the photos keep reading', async ({ page }) => {
  const sample = await page.evaluate(async (url) => {
    const { parseProductDetail } = await import(url)
    const api = {
      coverage_color: '#8E6B57',
      decoration: 'duya',
      decoration_color: '#8E6B57',
      fruit_layout: 'cover',
      fruits: ['apple_wedge', 'strawberry', 'citrus'],
      side_comb: false,
      model_image: 'x-modelo.webp',
      show_model_in_catalog: true,
      top_color: null,
      top_glossy: false,
      side_glossy: false,
      side_texture: 'brushed',
      top_ring_color: null,
      top_ring_width: null,
      side_band_color: '#E8B31A',
      side_band_height: 0.62,
      drizzle: 'lattice',
      drizzle_color: '#432517',
      edge_size: 1,
      shells: 'half',
      shell_color: '#5E3D2C',
      shell_second_color: null,
      dusting_color: '#F4F0EA',
      side_bits: null,
      side_bits_color: null,
    }
    const read = (overrides: object) => parseProductDetail({ slug: 'x', name: 'X', category: 'cake', sample_design: { ...api, ...overrides } }).sampleDesign
    return {
      half: read({}),
      open: read({ shells: 'open' }).details.shells.place,
      curl: read({ shells: 'curl' }).details.shells.place,
      back: read({ fruit_layout: 'back' }).fruitLayout,
      columns: read({ fruit_layout: 'columns' }).fruitLayout,
    }
  }, URLS.catalog)
  expect(sample.half.fruitLayout).toBe('cover')
  expect(sample.half.fruits).toEqual(['apple_wedge', 'strawberry', 'citrus'])
  expect(sample.half.details.sideTexture).toBe('brushed')
  expect(sample.half.details.drizzle).toEqual({ kind: 'lattice', color: '#432517' })
  expect(sample.half.details.shells).toEqual({ place: 'half', colors: ['#5e3d2c'] })
  expect([sample.open, sample.curl, sample.back, sample.columns]).toEqual(['open', 'curl', 'back', 'columns'])
})

test('the details of the heaviest samples stay light, and the whole scene fits the triangle budget', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier, u }) => {
      const { sampleDetailsLayout } = await import(urls.details)
      const { fruitLayout } = await import(urls.fruit)
      const { tierDecoration } = await import(urls.decoration)
      const { pieceDensityScale, sceneTriangles, TRIANGLE_BUDGET } = await import(urls.budget)
      // Las dos muestras de la semilla con más detalles, como las arma `withSampleLook`.
      const base = { tiers: [tier], festoons: false, stand: false }
      const cakes = {
        queso: {
          ...base,
          decoration: { kind: 'shells', main: '#8e6b57', accent: '#8e6b57' },
          topping: { kind: 'fruit', layout: 'cover', fruits: ['apple_wedge', 'strawberry', 'kiwi', 'pear', 'peach'], unitsPerCm: u, density: 2 },
          details: {
            sideTexture: 'spatula',
            shells: { place: 'half', colors: ['#4e3022', '#6a4532'], inset: 0.06 },
            dusting: '#f4f0ea',
            sideBits: { kind: 'flakes', color: '#5b4038' },
          },
        },
        durazno: {
          ...base,
          topping: { kind: 'fruit', layout: 'back', fruits: ['strawberry', 'pear', 'apple', 'kiwi', 'peach'], unitsPerCm: u, density: 1.5 },
          details: {
            top: { color: '#e2b21c', glossy: true },
            sideTexture: 'brushed',
            band: { color: '#e9b10e', height: 0.62 },
            drizzle: { kind: 'lattice', color: '#432517' },
          },
        },
        fresa: {
          ...base,
          decoration: { kind: 'rosettes', main: '#faf6ef', accent: '#faf6ef', size: 1.5, inset: 0.05 },
          topping: { kind: 'fruit', layout: 'crown', fruits: ['strawberry', 'cherry'], unitsPerCm: u },
          details: { top: { color: '#d62828', glossy: true }, drizzle: { kind: 'web', color: '#3a1a12' }, sideBits: { kind: 'plates', color: '#8a5a3b' } },
        },
        cajeta: {
          ...base,
          topping: { kind: 'fruit', layout: 'cover', fruits: ['strawberry', 'black_grape', 'pear_flower', 'peach', 'kiwi'], unitsPerCm: u, density: 1.2 },
          details: {
            top: { color: '#d88c3c', glossy: true },
            sideGlossy: true,
            drizzle: { kind: 'feathers', color: '#f4eedf' },
            shells: { place: 'plaques', colors: ['#2b1712', '#f3ede2'], inset: 0.01 },
            sideBits: { kind: 'plates', color: '#e6d7c1' },
          },
        },
        zarzamora: {
          ...base,
          decoration: { kind: 'rosettes', main: '#faf7f2', accent: '#faf7f2', size: 1.7, inset: 0.3 },
          topping: { kind: 'fruit', layout: 'cover', fruits: ['apple', 'strawberry', 'black_grapes', 'pear_flower', 'peach', 'mint'], unitsPerCm: u, density: 2.2 },
          details: {
            top: { color: '#9c3655', glossy: true },
            drizzle: { kind: 'marble', color: '#fbf6f3' },
            shells: { place: 'plaques', colors: ['#2b1712', '#f3ede2'], inset: 0.2 },
            sideBits: { kind: 'drips', color: '#7a2038' },
          },
        },
        chocolate: {
          ...base,
          topping: { kind: 'fruit', layout: 'cover', fruits: ['pear', 'strawberry', 'black_grapes', 'kiwi', 'peach', 'pear_flower'], unitsPerCm: u, density: 1.9 },
          details: { sideTexture: 'spatula', shells: { place: 'rim', colors: ['#8b5e45', '#7a5038'] }, dusting: '#f4f0ea' },
        },
      }
      return Object.fromEntries(
        Object.entries(cakes).map(([name, shape]) => {
          const scale = pieceDensityScale(shape)
          const top = tierDecoration(shape, 0, scale)
          const details = sampleDetailsLayout(shape, top)
          const fruit = fruitLayout(shape, top, details.avoid)
          // Los hilos son tubos de `SampleDetails.tsx`: una vuelta de 6 lados por cada punto de la curva, dos triángulos por cuadro.
          const drizzle = (details.drizzle?.curves ?? []).reduce((sum: number, curve: unknown[]) => sum + curve.length * 6 * 2, 0)
          const detailTriangles = details.triangles + drizzle
          return [name, { details: detailTriangles, scene: sceneTriangles(shape, scale) + (fruit?.triangles ?? 0) + detailTriangles, budget: TRIANGLE_BUDGET }]
        }),
      )
    },
    { urls: URLS, tier: TIER, u: U },
  )
  for (const [name, cake] of Object.entries(result) as [string, { details: number; scene: number; budget: number }][]) {
    expect(cake.details, name).toBeGreaterThan(0)
    expect(cake.details, name).toBeLessThanOrEqual(25_000)
    expect(cake.scene, name).toBeLessThanOrEqual(cake.budget)
  }
})

test('fresa crown: the whole strawberry in the middle and one cherry on each of six rosettes, the other rosettes go', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier, u }) => {
      const { fruitLayout } = await import(urls.fruit)
      const { tierDecoration } = await import(urls.decoration)
      const { sampleDecoration } = await import(urls.details)
      const shape = {
        tiers: [tier],
        festoons: false,
        stand: false,
        decoration: { kind: 'rosettes', main: '#faf6ef', accent: '#faf6ef', size: 1.5, inset: 0.05 },
        topping: { kind: 'fruit', layout: 'crown', fruits: ['strawberry', 'cherry'], unitsPerCm: u },
      }
      const top = tierDecoration(shape, 0)
      const fruit = fruitLayout(shape, top)
      const rosettes = top.parts.find((part: { shape: string }) => part.shape === 'rosette').placements
      const kept = sampleDecoration(top, null, undefined, fruit.keepRosettes).parts.find((part: { shape: string }) => part.shape === 'rosette').placements
      return {
        all: rosettes.length,
        keep: fruit.keepRosettes,
        kept: kept.length,
        first: fruit.placements[0],
        cherries: fruit.placements.slice(1).map((piece: Piece) => ({
          piece: piece.piece,
          over: kept.some((r: { p: number[] }) => Math.hypot(r.p[0] - piece.p[0], r.p[2] - piece.p[2]) < 1e-9 && piece.p[1] > r.p[1]),
        })),
      }
    },
    { urls: URLS, tier: TIER, u: U },
  )
  expect(result.all).toBeGreaterThan(6)
  expect(result.keep).toHaveLength(6)
  expect(result.kept).toBe(6)
  expect(result.first.piece).toBe('strawberryWhole')
  expect(Math.hypot(result.first.p[0], result.first.p[2])).toBeLessThan(1e-9)
  expect(result.cherries).toHaveLength(6)
  expect(result.cherries.every((cherry: { piece: string; over: boolean }) => cherry.piece === 'cherry' && cherry.over)).toBe(true)
})

test('the whole-top drawings (web, feathers, marble) go on a disc over the top instead of tubes, transparent where they do not draw', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { sampleDetailsLayout } = await import(urls.details)
      const { drawTopPattern, TOP_PATTERN_SIZE } = await import(urls.pattern)
      return ['web', 'feathers', 'marble'].map((kind) => {
        const layout = sampleDetailsLayout({ tiers: [tier], festoons: false, stand: false, details: { top: { color: '#d62828', glossy: true }, drizzle: { kind, color: '#3a1a12' } } })
        const canvas = drawTopPattern(kind, '#3a1a12')
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        let drawn = 0
        for (let i = 3; i < pixels.length; i += 4 * 13) if (pixels[i] > 128) drawn++
        return { kind, drizzle: layout.drizzle, pattern: layout.pattern, corner: pixels[3], size: canvas.width, expected: TOP_PATTERN_SIZE, drawn: drawn / (pixels.length / (4 * 13)) }
      })
    },
    { urls: URLS, tier: TIER },
  )
  for (const pattern of result) {
    expect(pattern.drizzle, pattern.kind).toBeNull()
    expect(pattern.pattern.kind, pattern.kind).toBe(pattern.kind)
    // En la parte plana o, el jaspeado, apenas sobre el inicio del canto redondeado.
    expect(pattern.pattern.radius, pattern.kind).toBeLessThan(TIER.radius - EDGE * 0.3)
    expect(pattern.pattern.y, pattern.kind).toBeGreaterThan(TIER.height)
    expect(pattern.size, pattern.kind).toBe(pattern.expected)
    expect(pattern.corner, pattern.kind).toBe(0)
    expect(pattern.drawn, pattern.kind).toBeGreaterThan(0.02)
    expect(pattern.drawn, pattern.kind).toBeLessThan(0.7)
  }
})

test('plates rise over the edge, drips run down from it, plaques stand in a fan and the rim shells leave the middle to the fruit', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier, u }) => {
      const { sideBitsMesh, shellLayout, sampleDetailsLayout } = await import(urls.details)
      const { fruitLayout } = await import(urls.fruit)
      const extent = (mesh: { positions: number[] }) => {
        let [minY, maxY, minR, maxR] = [Infinity, -Infinity, Infinity, 0]
        for (let i = 0; i < mesh.positions.length; i += 3) {
          const r = Math.hypot(mesh.positions[i], mesh.positions[i + 2])
          ;[minY, maxY, minR, maxR] = [Math.min(minY, mesh.positions[i + 1]), Math.max(maxY, mesh.positions[i + 1]), Math.min(minR, r), Math.max(maxR, r)]
        }
        return { minY, maxY, minR, maxR }
      }
      const plaques = shellLayout(tier, 'plaques', 2)
      const rim = shellLayout(tier, 'rim', 2)
      const chocolate = {
        tiers: [tier],
        festoons: false,
        stand: false,
        topping: { kind: 'fruit', layout: 'cover', fruits: ['pear', 'black_grape', 'strawberry'], unitsPerCm: u, density: 1.9 },
        details: { shells: { place: 'rim', colors: ['#6e4634'] }, dusting: '#f4f0ea' },
      }
      const layout = sampleDetailsLayout(chocolate)
      const fruit = fruitLayout(chocolate, undefined, layout.avoid)
      return {
        plates: extent(sideBitsMesh(tier, 'plates', '#8a5a3b', 0)),
        drips: extent(sideBitsMesh(tier, 'drips', '#7a2038', 0)),
        plaques: plaques.map((s: { plaque?: { shape: string; pattern: string }; p: number[] }) => ({ plaque: s.plaque, r: Math.hypot(s.p[0], s.p[2]), z: s.p[2] })),
        rim: rim.map((s: { p: number[]; cup?: boolean }) => ({ r: Math.hypot(s.p[0], s.p[2]), cup: s.cup === true })),
        fruit: fruit.placements.map((piece: Piece) => Math.hypot(piece.p[0], piece.p[2])),
        dustOnTop: layout.dust !== null,
      }
    },
    { urls: URLS, tier: TIER, u: U },
  )
  // Las lajas: pegadas al costado y asomando sobre la orilla; los escurridos, de la orilla hacia abajo, sin llegar a la charola.
  expect(result.plates.maxY).toBeGreaterThan(TIER.height)
  expect(result.plates.minR).toBeGreaterThan(TIER.radius)
  expect(result.plates.maxR).toBeLessThan(TIER.radius + 0.1)
  expect(result.drips.maxY).toBeLessThanOrEqual(TIER.height)
  expect(result.drips.minY).toBeGreaterThan(0)
  expect(result.drips.minR).toBeGreaterThan(TIER.radius)
  // Las placas: seis, con triángulos y lisas, detrás del centro.
  expect(result.plaques).toHaveLength(6)
  expect(result.plaques.some((p: { plaque: { shape: string } }) => p.plaque.shape === 'tri')).toBe(true)
  expect(new Set(result.plaques.map((p: { plaque: { pattern: string } }) => p.plaque.pattern)).size).toBeGreaterThanOrEqual(3)
  expect(result.plaques.every((p: { z: number; r: number }) => p.z < 0 && p.r < TIER.radius - EDGE)).toBe(true)
  // Los cascarones de la orilla, en la vuelta de afuera y unos encimados más adentro; la fruta, adentro de ellos.
  expect(result.rim.length).toBeGreaterThan(20)
  expect(result.rim.every((s: { r: number }) => s.r >= TIER.radius * 0.55 && s.r < TIER.radius)).toBe(true)
  expect(result.fruit.length).toBeGreaterThan(5)
  expect(Math.max(...result.fruit)).toBeLessThan(TIER.radius * 0.56)
  expect(result.dustOnTop).toBe(false)
})

test('the API values of the new photos reach the scene', async ({ page }) => {
  const sample = await page.evaluate(async (url) => {
    const { parseProductDetail } = await import(url)
    const api = {
      coverage_color: '#F4F0EA',
      decoration: 'rosetones',
      decoration_color: '#FAF6EF',
      fruit_layout: 'crown',
      fruits: ['strawberry', 'cherry', 'black_grape', 'pear_flower'],
      side_comb: false,
      model_image: 'x-modelo.webp',
      show_model_in_catalog: true,
      top_color: '#D62828',
      top_glossy: true,
      side_glossy: false,
      side_texture: null,
      top_ring_color: null,
      top_ring_width: null,
      side_band_color: null,
      side_band_height: null,
      drizzle: 'web',
      drizzle_color: '#3A1A12',
      edge_size: 1.5,
      shells: 'plaques',
      shell_color: '#2B1712',
      shell_second_color: '#F3EDE2',
      dusting_color: null,
      side_bits: 'plates',
      side_bits_color: '#8A5A3B',
    }
    const read = (overrides: object) => parseProductDetail({ slug: 'x', name: 'X', category: 'cake', sample_design: { ...api, ...overrides } }).sampleDesign
    return {
      web: read({}),
      feathers: read({ drizzle: 'feathers' }).details.drizzle.kind,
      marble: read({ drizzle: 'marble' }).details.drizzle.kind,
      rim: read({ shells: 'rim' }).details.shells.place,
      drips: read({ side_bits: 'drips' }).details.sideBits.kind,
    }
  }, URLS.catalog)
  expect(sample.web.fruitLayout).toBe('crown')
  expect(sample.web.fruits).toEqual(['strawberry', 'cherry', 'black_grape', 'pear_flower'])
  expect(sample.web.details.drizzle).toEqual({ kind: 'web', color: '#3a1a12' })
  expect(sample.web.details.shells).toEqual({ place: 'plaques', colors: ['#2b1712', '#f3ede2'] })
  expect(sample.web.details.sideBits).toEqual({ kind: 'plates', color: '#8a5a3b' })
  expect([sample.feathers, sample.marble, sample.rim, sample.drips]).toEqual(['feathers', 'marble', 'rim', 'drips'])
})

test('zarzamora glazes each rosette with a streak of the sauce, and the chocolate rim is a tight ring of open eggs with sugar on top', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { sampleDetailsLayout, shellLayout } = await import(urls.details)
      const { tierDecoration } = await import(urls.decoration)
      const zarzamora = {
        tiers: [tier],
        festoons: false,
        stand: false,
        decoration: { kind: 'rosettes', main: '#faf7f2', accent: '#faf7f2', size: 1.7, inset: 0.3 },
        details: { top: { color: '#9c3655', glossy: true }, drizzle: { kind: 'marble', color: '#fbf6f3' } },
      }
      const top = tierDecoration(zarzamora, 0)
      const rosettes = top.parts.find((part: { shape: string }) => part.shape === 'rosette').placements
      const layout = sampleDetailsLayout(zarzamora, top)
      const glazed = rosettes.every((r: { p: number[] }) => {
        for (let i = 0; i < layout.glaze.positions.length; i += 3) {
          const [x, y, z] = [layout.glaze.positions[i], layout.glaze.positions[i + 1], layout.glaze.positions[i + 2]]
          if (Math.hypot(x - r.p[0], z - r.p[2]) < 0.05 && y > r.p[1]) return true
        }
        return false
      })
      const web = sampleDetailsLayout({ ...zarzamora, details: { ...zarzamora.details, drizzle: { kind: 'web', color: '#3a1a12' } } }, top)
      const eggs = shellLayout(tier, 'rim', 2)
      const ring = eggs.filter((s: { p: number[] }) => s.p[1] < tier.height + 0.01)
      return {
        glazed,
        webGlaze: web.glaze,
        marbleRadius: layout.pattern.radius,
        webRadius: web.pattern.radius,
        ring: ring.map((s: { p: number[]; width: number }) => ({ r: Math.hypot(s.p[0], s.p[2]), width: s.width })),
        stacked: eggs.length - ring.length,
        open: eggs.every((s: { closed: boolean; cup?: boolean; arc?: number; dustAbove?: boolean }) => !s.closed && !s.cup && (s.arc ?? 1) === 1 && s.dustAbove === true),
      }
    },
    { urls: URLS, tier: TIER },
  )
  expect(result.glazed).toBe(true)
  // Solo el jaspeado lleva el rayón; la telaraña no.
  expect(result.webGlaze).toBeNull()
  // El jaspeado llega más cerca de la orilla que la telaraña.
  expect(result.marbleRadius).toBeGreaterThan(result.webRadius)
  expect(result.marbleRadius).toBeLessThan(TIER.radius)
  // Una vuelta apretada: entre uno y otro, menos que dos anchos.
  expect(result.ring.length).toBeGreaterThanOrEqual(16)
  const gap = (2 * Math.PI * result.ring[0].r) / result.ring.length
  expect(gap).toBeLessThan(2 * Math.max(...result.ring.map((s: { width: number }) => s.width)))
  expect(result.stacked).toBeGreaterThan(3)
  expect(result.open).toBe(true)
})
