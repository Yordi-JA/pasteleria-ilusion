import { expect, test } from '@playwright/test'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Los detalles de las fotos que solo dibujan las imágenes del catálogo (tanda 4b): la charola negra en lugar de la base, la tapa de
 * otro color, el anillo de mermelada, la franja de abajo, los hilos, las conchas de chocolate, lo pegado al costado y el
 * espolvoreado. Los módulos puros se importan en el navegador desde el servidor de desarrollo, como en `cake-fruit.spec.ts`:
 * `src/three/sampleDetails.ts`, `src/viewmodels/sampleDesign.ts` (lo que la imagen agrega al pastel del diseñador) y la lectura de
 * la API en `src/models/catalog.ts`.
 */
const URLS = {
  details: '/src/three/sampleDetails.ts',
  decoration: '/src/three/decorationLayout.ts',
  fruit: '/src/three/fruit.ts',
  metrics: '/src/three/cakeMetrics.ts',
  sample: '/src/viewmodels/sampleDesign.ts',
  catalog: '/src/models/catalog.ts',
}

/** El pastel de vitrina: 28 cm de diámetro y 6.7 cm de alto, a 0.068 unidades por cm. */
const TIER = { radius: 0.952, height: 0.456, frosting: '#f2ede7' }
const EDGE = 0.06

/** Lo que la API manda de una muestra con sus detalles (la de durazno de la semilla `0052`). */
const DURAZNO_API = {
  coverage_color: '#EFE9E3',
  decoration: 'ninguna',
  decoration_color: null,
  fruit_layout: 'mound',
  fruits: ['strawberry', 'apple', 'kiwi', 'pear'],
  side_comb: false,
  model_image: 'tres-leches-de-durazno-modelo.webp',
  show_model_in_catalog: true,
  top_color: '#E2B21C',
  top_glossy: true,
  side_glossy: false,
  side_texture: 'spatula',
  top_ring_color: null,
  top_ring_width: null,
  side_band_color: '#D9B52E',
  side_band_height: 0.5,
  drizzle: 'lace',
  drizzle_color: '#432517',
  edge_size: 1,
  shells: null,
  shell_color: null,
  shell_second_color: null,
  dusting_color: null,
  side_bits: null,
  side_bits_color: null,
}

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  // Una vista sin pastel 3D: solo cuenta lo que importan las pruebas.
  await page.goto('/legal')
})

test('without details there is nothing to draw, and the same details always give the same meshes', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { sampleDetailsLayout } = await import(urls.details)
      const shape = (details?: object) => ({ tiers: [tier], festoons: false, stand: false, ...(details ? { details } : {}) })
      const full = { top: { color: '#e2b21c', glossy: true }, sideBits: { kind: 'crumbs', color: '#2e2422' }, shells: { place: 'edge', colors: ['#e6dfcc', '#3b2a25'] }, dusting: '#a8875e' }
      const first = sampleDetailsLayout(shape(full))
      const second = sampleDetailsLayout(shape(full))
      return {
        none: sampleDetailsLayout(shape()),
        rectangular: sampleDetailsLayout({ ...shape(full), form: 'rectangular' }),
        same: JSON.stringify(first) === JSON.stringify(second),
        triangles: first.triangles,
      }
    },
    { urls: URLS, tier: TIER },
  )
  expect(result.none).toBeNull()
  expect(result.rectangular).toBeNull()
  expect(result.same).toBe(true)
  expect(result.triangles).toBeGreaterThan(0)
})

test('fresa: the jam ring covers the outer part of the top, above the frosting, and leaves the white center', async ({ page }) => {
  const ring = await page.evaluate(
    async ({ urls, tier }) => {
      const { sampleDetailsLayout } = await import(urls.details)
      const layout = sampleDetailsLayout({ tiers: [tier], festoons: false, stand: false, details: { ring: { color: '#b3312f', width: 0.5 } } })
      const radii: number[] = []
      const heights: number[] = []
      for (let i = 0; i < layout.ring.positions.length; i += 3) {
        radii.push(Math.hypot(layout.ring.positions[i], layout.ring.positions[i + 2]))
        heights.push(layout.ring.positions[i + 1])
      }
      // El rojo de la mermelada domina los colores de sus vértices.
      const reddish = layout.ring.colors.filter((_: number, i: number) => i % 3 === 0).every((r: number, k: number) => r > layout.ring.colors[k * 3 + 1] * 2)
      return { min: Math.min(...radii), max: Math.max(...radii), low: Math.min(...heights), reddish, inset: layout.avoid.inset }
    },
    { urls: URLS, tier: TIER },
  )
  expect(ring.max).toBeLessThanOrEqual(TIER.radius)
  expect(ring.max).toBeGreaterThan(TIER.radius - EDGE)
  // El centro blanco: de la orilla hacia adentro, la mitad del radio (con la orilla de adentro irregular).
  expect(ring.min).toBeGreaterThan(TIER.radius * 0.38)
  expect(ring.min).toBeLessThan(TIER.radius * 0.5)
  expect(ring.low).toBeGreaterThan(TIER.height - EDGE)
  expect(ring.reddish).toBe(true)
  // La fruta se queda más cerca del centro blanco.
  expect(ring.inset).toBeGreaterThan(0)
})

test('durazno: a glossy glaze top over the white side, the painted lower half and the chocolate lace on the top', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { sampleDetailsLayout } = await import(urls.details)
      const layout = sampleDetailsLayout({
        tiers: [tier],
        festoons: false,
        stand: false,
        details: { top: { color: '#e2b21c', glossy: true }, band: { color: '#d9b52e', height: 0.5 }, drizzle: { kind: 'lace', color: '#432517' } },
      })
      const bandY: number[] = []
      const bandR: number[] = []
      for (let i = 0; i < layout.band.positions.length; i += 3) {
        bandY.push(layout.band.positions[i + 1])
        bandR.push(Math.hypot(layout.band.positions[i], layout.band.positions[i + 2]))
      }
      const lace = layout.drizzle.curves.flat().map(([x, y, z]: number[]) => ({ r: Math.hypot(x, z), y }))
      return {
        cap: layout.cap,
        band: { top: Math.max(...bandY), bottom: Math.min(...bandY), inner: Math.min(...bandR) },
        drizzle: { kind: layout.drizzle.kind, closed: layout.drizzle.closed, curves: layout.drizzle.curves.length },
        lace: { maxR: Math.max(...lace.map((p: { r: number }) => p.r)), minY: Math.min(...lace.map((p: { y: number }) => p.y)) },
      }
    },
    { urls: URLS, tier: TIER },
  )
  expect(result.cap.glossy).toBe(true)
  expect(result.cap.color).toBe('#e2b21c')
  // La tapa va encima de la cobertura, de la orilla redondeada al centro.
  expect(Math.min(...result.cap.profile.map(([, y]: number[]) => y))).toBeGreaterThan(TIER.height - EDGE)
  expect(result.cap.profile[result.cap.profile.length - 1][0]).toBe(0)
  // La franja pintada sube hasta cerca de la mitad, por fuera del costado.
  expect(result.band.bottom).toBeGreaterThanOrEqual(0)
  expect(result.band.top).toBeGreaterThan(TIER.height * 0.4)
  expect(result.band.top).toBeLessThan(TIER.height - EDGE + 1e-6)
  expect(result.band.inner).toBeGreaterThan(TIER.radius)
  expect(result.drizzle).toEqual({ kind: 'lace', closed: true, curves: 2 })
  expect(result.lace.maxR).toBeLessThan(TIER.radius - EDGE)
  expect(result.lace.minY).toBeGreaterThan(TIER.height)
})

test('cajeta: one cajeta thread over each big rosette of the edge, open and above it', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { sampleDetailsLayout } = await import(urls.details)
      const { tierDecoration } = await import(urls.decoration)
      const shape = {
        tiers: [tier],
        festoons: false,
        stand: false,
        decoration: { kind: 'rosettes', main: '#f8f0e7', accent: '#f8f0e7', size: 1.9 },
        details: { drizzle: { kind: 'threads', color: '#c8742f' } },
      }
      const placed = tierDecoration(shape, 0)
      const designer = tierDecoration({ ...shape, decoration: { ...shape.decoration, size: undefined } }, 0)
      const layout = sampleDetailsLayout(shape, placed)
      const rosettes = placed.parts[0].placements
      return {
        rosettes: rosettes.length,
        designerRosettes: designer.parts[0].placements.length,
        scale: rosettes[0].s[0] / designer.parts[0].placements[0].s[0],
        curves: layout.drizzle.curves.length,
        closed: layout.drizzle.closed,
        minY: Math.min(...layout.drizzle.curves.flat().map((p: number[]) => p[1])),
        withoutRosettes: sampleDetailsLayout({ ...shape, decoration: undefined })?.drizzle ?? null,
      }
    },
    { urls: URLS, tier: TIER },
  )
  // Con 1.9, unas 14 rosetas como en la foto, contra las del diseñador.
  expect(result.rosettes).toBeGreaterThanOrEqual(12)
  expect(result.rosettes).toBeLessThanOrEqual(16)
  expect(result.designerRosettes).toBeGreaterThan(result.rosettes * 1.5)
  expect(result.scale).toBeCloseTo(1.9, 5)
  // Tres hilos paralelos por copo, como en la foto.
  expect(result.curves).toBe(result.rosettes * 3)
  expect(result.closed).toBe(false)
  expect(result.minY).toBeGreaterThan(TIER.height)
  expect(result.withoutRosettes).toBeNull()
})

test('chocolate shells: around the edge in two alternating colors, or piled on the back half of the top, and the fruit keeps clear', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { shellLayout, shellAvoid, sampleDetailsLayout } = await import(urls.details)
      const { fruitLayout } = await import(urls.fruit)
      const edge = shellLayout(tier, 'edge', 2)
      const top = shellLayout(tier, 'top', 2)
      const shape = {
        tiers: [tier],
        festoons: false,
        stand: false,
        topping: { kind: 'fruit', layout: 'mound', fruits: ['strawberry', 'kiwi', 'peach', 'apple', 'banana'], unitsPerCm: 0.068 },
        details: { shells: { place: 'top', colors: ['#6b4a3a', '#3b2a25'] }, dusting: '#f4f0ea' },
      }
      const layout = sampleDetailsLayout(shape)
      const fruit = fruitLayout(shape, undefined, layout.avoid)
      const clear = fruit.placements.every((piece: { p: number[]; reach: number }) =>
        top.every((shell: { p: number[]; width: number }) => Math.hypot(piece.p[0] - shell.p[0], piece.p[2] - shell.p[2]) >= shell.width * 1.05 + piece.reach - 1e-6),
      )
      return {
        edge: edge.map((s: { p: number[]; color: number }) => ({ r: Math.hypot(s.p[0], s.p[2]), y: s.p[1], color: s.color })),
        edgeInset: shellAvoid(tier, edge).inset,
        top: top.map((s: { p: number[] }) => s.p),
        areas: layout.avoid.areas.length,
        dustOnTop: layout.dust !== null,
        fruit: fruit.placements.length,
        banana: fruit.placements.some((piece: { kind: string }) => piece.kind === 'banana'),
        clear,
      }
    },
    { urls: URLS, tier: TIER },
  )
  expect(result.edge.length).toBeGreaterThanOrEqual(10)
  expect(result.edge.every((s: { r: number; y: number }) => s.r > TIER.radius - 0.2 && s.r < TIER.radius && s.y >= TIER.height - 0.02)).toBe(true)
  expect(result.edge.map((s: { color: number }) => s.color).slice(0, 4)).toEqual([0, 1, 0, 1])
  expect(result.edgeInset).toBeGreaterThan(0.2)
  // Los cuencos de la tapa (queso y chocolate) dan la vuelta alrededor del montón, con una segunda capa atrás, y la fruta queda adentro.
  expect(result.top.length).toBeGreaterThanOrEqual(14)
  expect(result.top.every((p: number[]) => Math.hypot(p[0], p[2]) > TIER.radius * 0.45 && Math.hypot(p[0], p[2]) < TIER.radius - EDGE)).toBe(true)
  expect(result.top.filter((p: number[]) => p[1] > TIER.height + 0.02).every((p: number[]) => p[2] < 0)).toBe(true)
  expect(result.areas).toBe(0)
  // El azúcar glass va sobre los cuencos, no en toda la tapa.
  expect(result.dustOnTop).toBe(false)
  expect(result.fruit).toBeGreaterThan(4)
  expect(result.banana).toBe(true)
  expect(result.clear).toBe(true)
})

test('capuchino: closed tulips around the edge, leaning out more than the eggs and closed at the top', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { shellLayout, shellsMesh } = await import(urls.details)
      const eggs = shellLayout(tier, 'edge', 1)
      const tulips = shellLayout(tier, 'tulips', 1)
      // Lo ancho de la boca: la última vuelta de vértices de cada pieza, sin inclinar ni mover (la pieza en su lugar de origen).
      const mouth = (shell: object) => {
        const mesh = shellsMesh([{ ...shell, p: [0, 0, 0], tilt: 0, yaw: 0 }], ['#e2d3b5'], null)
        const rim = mesh.positions.slice(11 * 32 * 3, 12 * 32 * 3)
        let widest = 0
        for (let i = 0; i < rim.length; i += 3) widest = Math.max(widest, Math.hypot(rim[i], rim[i + 2]))
        return widest / (shell as { width: number }).width
      }
      return {
        counts: [eggs.length, tulips.length],
        closed: [eggs.every((s: { closed: boolean }) => !s.closed), tulips.every((s: { closed: boolean }) => s.closed)],
        tilt: [Math.min(...tulips.map((s: { tilt: number }) => s.tilt)), Math.max(...eggs.map((s: { tilt: number }) => s.tilt))],
        mouth: [mouth(tulips[0]), mouth(eggs[0])],
      }
    },
    { urls: URLS, tier: TIER },
  )
  expect(result.counts[0]).toBe(result.counts[1])
  expect(result.counts[0]).toBeGreaterThanOrEqual(11)
  expect(result.counts[0]).toBeLessThanOrEqual(15)
  expect(result.closed).toEqual([true, true])
  expect(result.tilt[0]).toBeGreaterThan(result.tilt[1])
  // El tulipán se cierra arriba (la boca casi en punta); el huevo queda abierto.
  expect(result.mouth[0]).toBeLessThan(0.35)
  expect(result.mouth[1]).toBeGreaterThan(0.55)
})

test('the edge inset moves the shells and the rosettes toward the center, and the fruit stays inside the ring', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { sampleDetailsLayout } = await import(urls.details)
      const { tierDecoration } = await import(urls.decoration)
      const { fruitLayout } = await import(urls.fruit)
      const topping = { kind: 'fruit', layout: 'mound', fruits: ['strawberry', 'kiwi', 'peach', 'apple', 'banana'], unitsPerCm: 0.068, density: 2 }
      const ring = (placements: { p: number[] }[]) => Math.max(...placements.map((s) => Math.hypot(s.p[0], s.p[2])))
      const shells = (inset?: number) => {
        const shape = { tiers: [tier], festoons: false, stand: false, topping, details: { shells: { place: 'edge', colors: ['#e6dfcc'], ...(inset ? { inset } : {}) } } }
        const layout = sampleDetailsLayout(shape)
        const fruit = fruitLayout(shape, undefined, layout.avoid)
        const inner = Math.min(...layout.shells.placements.map((s: { p: number[]; width: number }) => Math.hypot(s.p[0], s.p[2]) - s.width))
        const outermost = Math.max(...fruit.placements.map((piece: { p: number[]; reach: number }) => Math.hypot(piece.p[0], piece.p[2]) + piece.reach))
        return { ring: ring(layout.shells.placements), inner, outermost, pieces: fruit.placements.length }
      }
      const rosettes = (inset?: number) => {
        const shape = {
          tiers: [tier],
          festoons: false,
          stand: false,
          topping,
          decoration: { kind: 'rosettes', main: '#f8f0e7', accent: '#f8f0e7', size: 1.9, ...(inset ? { inset } : {}) },
        }
        const placed = tierDecoration(shape, 0)
        const fruit = fruitLayout(shape, placed)
        const pieces = placed.parts[0].placements
        const inner = Math.min(...pieces.map((r: { p: number[]; s: number[] }) => Math.hypot(r.p[0], r.p[2]) - 0.11 * r.s[0]))
        const outermost = Math.max(...fruit.placements.map((piece: { p: number[]; reach: number }) => Math.hypot(piece.p[0], piece.p[2]) + piece.reach))
        return { ring: ring(pieces), inner, outermost, pieces: fruit.placements.length }
      }
      return { shells: [shells(), shells(0.14)], rosettes: [rosettes(), rosettes(0.08)] }
    },
    { urls: URLS, tier: TIER },
  )
  for (const [[before, after], inset] of [[result.shells, 0.14], [result.rosettes, 0.08]] as const) {
    // La vuelta se mete justo lo pedido, en parte del radio de la tapa.
    expect(before.ring - after.ring).toBeCloseTo(inset * TIER.radius, 5)
    // La fruta sigue dentro de la vuelta, sin encimarse, y el montón tupido sigue lleno.
    expect(after.outermost).toBeLessThanOrEqual(after.inner + 1e-6)
    expect(after.pieces).toBeGreaterThan(8)
  }
})

test('choco vainilla: the sprinkle density multiplies the sprinkles on the side, and 1 is the designer', async ({ page }) => {
  const counts = await page.evaluate(
    async ({ urls, tier }) => {
      const { tierDecoration } = await import(urls.decoration)
      const decoration = { kind: 'sprinkles', style: 'sprinkles', colors: ['#f3ecdc', '#3b2a25'] }
      const count = (density?: number) =>
        tierDecoration({ tiers: [tier], festoons: false, stand: false, decoration: { ...decoration, ...(density ? { density } : {}) } }, 0).parts[0].placements.length
      return { designer: count(), one: count(1), eight: count(8) }
    },
    { urls: URLS, tier: TIER },
  )
  expect(counts.one).toBe(counts.designer)
  expect(counts.eight / counts.designer).toBeGreaterThan(7.5)
  expect(counts.eight / counts.designer).toBeLessThan(8.5)
})

test('cookie crumbs cover the side and the top; chocolate flakes stay on the side', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier }) => {
      const { sideBitsMesh } = await import(urls.details)
      const summary = (kind: string) => {
        const mesh = sideBitsMesh(tier, kind, '#2e2422', 0)
        let side = 0
        let top = 0
        let farthest = 0
        for (let i = 0; i < mesh.positions.length; i += 3) {
          const r = Math.hypot(mesh.positions[i], mesh.positions[i + 2])
          farthest = Math.max(farthest, r)
          if (mesh.positions[i + 1] > tier.height - 0.01 && r < tier.radius - 0.06) top++
          else side++
        }
        return { side, top, farthest, triangles: mesh.indices.length / 3 }
      }
      return { crumbs: summary('crumbs'), flakes: summary('flakes') }
    },
    { urls: URLS, tier: TIER },
  )
  expect(result.crumbs.side).toBeGreaterThan(0)
  expect(result.crumbs.top).toBeGreaterThan(0)
  expect(result.flakes.top).toBe(0)
  // Pegadas al costado: ninguna se aleja más de unos milímetros.
  expect(result.crumbs.farthest).toBeLessThan(TIER.radius + 0.06)
  expect(result.flakes.farthest).toBeLessThan(TIER.radius + 0.08)
  expect(result.crumbs.triangles + result.flakes.triangles).toBeLessThan(60_000)
})

test('the catalog image puts the black board instead of the stand and leaves the designer shape as it was', async ({ page }) => {
  const result = await page.evaluate(
    async ({ urls, tier, api }) => {
      const { parseProductDetail } = await import(urls.catalog)
      const { withSampleLook, SAMPLE_BOARD } = await import(urls.sample)
      const { contentOf, boardRadius } = await import(urls.metrics)
      const detail = parseProductDetail({ slug: 'tres-leches-de-durazno', name: 'Tres leches de durazno', category: 'cake', sample_design: api })
      const designer = { tiers: [tier], festoons: false, stand: true, fitStand: true, decoration: { kind: 'rosettes', main: '#ffffff', accent: '#ffffff' } }
      const before = JSON.stringify(designer)
      const look = withSampleLook(designer, detail.sampleDesign)
      const sized = withSampleLook(designer, { ...detail.sampleDesign, details: { ...detail.sampleDesign.details, edgeSize: 1.6 } })
      const circles = contentOf(look).circles
      return {
        details: detail.sampleDesign.details,
        board: look.board,
        boardColor: SAMPLE_BOARD.color,
        stand: look.stand,
        lookDetails: Object.keys(look.details).sort(),
        topping: look.topping?.layout ?? null,
        designerUnchanged: JSON.stringify(designer) === before,
        size: look.decoration.size ?? null,
        sized: sized.decoration.size,
        widest: Math.max(...circles.map((c: { r: number }) => c.r)),
        boardRadius: boardRadius(look),
      }
    },
    { urls: URLS, tier: TIER, api: DURAZNO_API },
  )
  expect(result.details).toEqual({
    topColor: '#e2b21c',
    topGlossy: true,
    sideGlossy: false,
    sideTexture: 'spatula',
    ring: null,
    band: { color: '#d9b52e', height: 0.5 },
    drizzle: { kind: 'lace', color: '#432517' },
    edgeSize: 1,
    shells: null,
    dustingColor: null,
    sideBits: null,
    fruitDensity: 1,
    sprinkleDensity: 1,
    edgeInset: 0,
  })
  expect(result.board).toEqual({ color: '#2c2c2c' })
  expect(result.boardColor).toBe('#2c2c2c')
  expect(result.stand).toBe(false)
  expect(result.lookDetails).toEqual(['band', 'drizzle', 'sideTexture', 'top'])
  expect(result.topping).toBe('mound')
  // El pastel del diseñador conserva su base y no lleva charola ni detalles.
  expect(result.designerUnchanged).toBe(true)
  // El tamaño de las piezas del borde solo cambia si la muestra lo pide.
  expect(result.size).toBeNull()
  expect(result.sized).toBe(1.6)
  // La charola mide 10 % más que el piso y el encuadre la cuenta.
  expect(result.boardRadius).toBeCloseTo(TIER.radius * 1.1, 5)
  expect(result.widest).toBeCloseTo(result.boardRadius, 5)
})

test('a half-filled pair or an unknown detail from the API is dropped, not drawn halfway', async ({ page }) => {
  const details = await page.evaluate(
    async ({ urls, api }) => {
      const { parseProductDetail } = await import(urls.catalog)
      const odd = {
        ...api,
        top_ring_color: '#B3312F',
        top_ring_width: null,
        drizzle: 'lace',
        drizzle_color: 'chocolate',
        shells: 'everywhere',
        shell_color: '#E6DFCC',
        side_bits: 'flakes',
        side_bits_color: null,
        side_texture: 'waves',
        edge_size: 9,
        side_band_height: 2,
      }
      return parseProductDetail({ slug: 'x', name: 'X', category: 'cake', sample_design: odd }).sampleDesign.details
    },
    { urls: URLS, api: DURAZNO_API },
  )
  expect(details.ring).toBeNull()
  expect(details.drizzle).toBeNull()
  expect(details.shells).toBeNull()
  expect(details.sideBits).toBeNull()
  expect(details.sideTexture).toBeNull()
  expect(details.band).toBeNull()
  expect(details.edgeSize).toBe(1)
})
