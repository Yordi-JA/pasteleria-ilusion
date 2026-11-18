import { expect, test } from '@playwright/test'
import { mockStoreInfo } from './support/store-info.ts'

// La crema untada a mano entre el pan (tanda 4, parte 2), sin dibujar la escena: el módulo se importa en el navegador desde el
// servidor de desarrollo, como en `spin-model.spec.ts`.
const SPREAD = '/src/three/creamSpread.ts'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  // Una vista sin pastel 3D: solo cuenta lo que importan las pruebas.
  await page.goto('/legal')
})

/** Una capa delgada de crema de un piso de vitrina: 0.04 del alto de 0.72. */
const HEIGHT = 0.04 * 0.72

test('the cream bulges past the bread in places, its edges wave over the bread and its thickness changes around the cake', async ({ page }) => {
  const result = await page.evaluate(
    async ({ url, height }) => {
      const { spreadShape, spreadOffset, SPREAD_INSET } = await import(url)
      const shape = spreadShape('cream', 7)
      const steps = 720
      const angles = Array.from({ length: steps + 1 }, (_, i) => (i / steps) * Math.PI * 2)
      const middle = angles.map((phi) => spreadOffset(shape, phi, height / 2, height))
      const below = angles.map((phi) => shape.below(phi))
      const above = angles.map((phi) => shape.above(phi))
      const thickness = angles.map((_, i) => height + below[i] + above[i])
      const jumps = (values: number[]) => Math.max(...values.slice(1).map((value, i) => Math.abs(value - values[i])))
      // Lo que cambia la orilla de un grado al siguiente, comparado con todo su recorrido: ondas suaves, no ruido.
      const range = (values: number[]) => Math.max(...values) - Math.min(...values)
      return {
        inset: SPREAD_INSET,
        bulge: [Math.min(...middle), Math.max(...middle)],
        below: [Math.min(...below), Math.max(...below)],
        thickness: range(thickness),
        smooth: Math.max(jumps(below) / range(below), jumps(above) / range(above), jumps(middle) / range(middle)),
        closed: [middle[0] - middle[steps], below[0] - below[steps], above[0] - above[steps]],
        // Fuera de su franja con las orillas, la crema queda dentro del pan.
        hidden: [spreadOffset(shape, 1, -0.05, height), spreadOffset(shape, 1, height + 0.05, height)],
        // En su propia franja la crema queda por fuera del pan, salvo un hilo junto a las orillas.
        covers: angles.every((phi) => [0.25, 0.5, 0.75].every((t) => spreadOffset(shape, phi, t * height, height) >= 0)),
        edges: angles.every((phi) => [0, 1].every((t) => spreadOffset(shape, phi, t * height, height) >= -SPREAD_INSET)),
      }
    },
    { url: SPREAD, height: HEIGHT },
  )
  expect(result.bulge[0]).toBeGreaterThan(0)
  expect(result.bulge[1] - result.bulge[0]).toBeGreaterThan(0.004)
  expect(result.below[0]).toBeGreaterThan(0)
  expect(result.thickness).toBeGreaterThan(0.006)
  // Medio grado mueve la orilla menos de una décima de su recorrido: ondas, no ruido.
  expect(result.smooth).toBeLessThan(0.1)
  for (const gap of result.closed) expect(Math.abs(gap)).toBeLessThan(1e-9)
  for (const offset of result.hidden) expect(offset).toBeLessThan(0)
  expect(result.covers).toBe(true)
  expect(result.edges).toBe(true)
})

test('each layer has its own spread, always the same for the same seed; jam and cajeta get a milder one', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { spreadShape, SPREAD_LEVELS } = await import(url)
    const sample = (shape: { bulge: (phi: number) => number; below: (phi: number) => number }) =>
      Array.from({ length: 36 }, (_, i) => [shape.bulge(i / 6), shape.below(i / 6)])
    return {
      same: JSON.stringify(sample(spreadShape('cream', 11))) === JSON.stringify(sample(spreadShape('cream', 11))),
      other: JSON.stringify(sample(spreadShape('cream', 11))) !== JSON.stringify(sample(spreadShape('cream', 12))),
      levels: SPREAD_LEVELS,
    }
  }, SPREAD)
  expect(result.same).toBe(true)
  expect(result.other).toBe(true)
  expect(result.levels.mild.bulge[1]).toBeLessThan(result.levels.cream.bulge[1])
  expect(result.levels.mild.edge[1]).toBeLessThan(result.levels.cream.edge[1])
})

test('the spread geometry wraps the round and the rectangular tier, within the bulge, and is built the same every time', async ({ page }) => {
  const result = await page.evaluate(
    async ({ url, height }) => {
      const { spreadShape, spreadGeometry, roundOutline, rectOutline, SPREAD_LEVELS, SPREAD_INSET } = await import(url)
      const shape = spreadShape('cream', 3)
      const [, maxBulge] = SPREAD_LEVELS.cream.bulge
      const [, maxEdge] = SPREAD_LEVELS.cream.edge
      const measure = (outline: { x: number; z: number; nx: number; nz: number }[]) => {
        const geometry = spreadGeometry(outline, height, shape)
        const positions: number[] = Array.from(geometry.getAttribute('position').array)
        const normals: number[] = Array.from(geometry.getAttribute('normal').array)
        geometry.computeBoundingBox()
        const box = geometry.boundingBox
        // Cada vértice cae sobre la normal de algún punto del contorno, a lo más a `maxBulge` por fuera.
        let outward = 0
        let facing = 0
        for (let i = 0; i < positions.length; i += 3) {
          const [x, z] = [positions[i], positions[i + 2]]
          const nearest = outline.reduce(
            (best, p) => {
              const along = (x - p.x) * p.nx + (z - p.z) * p.nz
              const across = Math.hypot(x - p.x - along * p.nx, z - p.z - along * p.nz)
              return across < best.across ? { across, along } : best
            },
            { across: Infinity, along: 0 },
          )
          outward = Math.max(outward, nearest.along)
          if (x * normals[i] + z * normals[i + 2] > 0) facing++
        }
        return { minY: box.min.y, maxY: box.max.y, outward, facing: facing / (positions.length / 3), positions }
      }
      const round = measure(roundOutline(1.2))
      const rect = measure(rectOutline(1.4, 0.9))
      const again = measure(roundOutline(1.2))
      return {
        inset: SPREAD_INSET,
        maxBulge,
        maxEdge,
        round: { ...round, positions: undefined },
        rect: { ...rect, positions: undefined },
        same: JSON.stringify(round.positions) === JSON.stringify(again.positions),
      }
    },
    { url: SPREAD, height: HEIGHT },
  )
  for (const form of [result.round, result.rect]) {
    expect(form.minY).toBeLessThan(0)
    expect(form.minY).toBeGreaterThanOrEqual(-result.maxEdge - 1e-6)
    expect(form.maxY).toBeGreaterThan(HEIGHT)
    expect(form.maxY).toBeLessThanOrEqual(HEIGHT + result.maxEdge + 1e-6)
    expect(form.outward).toBeGreaterThan(0)
    expect(form.outward).toBeLessThanOrEqual(result.maxBulge + 1e-3)
    // Las caras miran hacia afuera: la crema se ve desde fuera del pastel.
    expect(form.facing).toBeGreaterThan(0.98)
  }
  expect(result.same).toBe(true)
})
