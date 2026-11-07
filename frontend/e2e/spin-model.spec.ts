import { expect, test } from '@playwright/test'
import { mockStoreInfo } from './support/store-info.ts'

// El giro del pastel 3D (`src/three/spin.ts`, D48), sin three: no hay corredor de pruebas unitarias, así que el
// módulo se importa en el navegador desde el servidor de desarrollo.
const SPIN = '/src/three/spin.ts'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  // Una vista sin pastel 3D: solo cuenta lo que importan las pruebas.
  await page.goto('/legal')
})

test('after a flick to the left the inertia settles into the slow turn to the left, without reversing', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, startDrag, moveDrag, endDrag, stepSpin, SPIN } = await import(url)
    const spin = createSpin(0)
    startDrag(spin, 1, 300, 0)
    for (let i = 1; i <= 5; i++) moveDrag(spin, 1, 300 - i * 20, i * 20)
    endDrag(spin, 1, 100, true)
    const released = spin.velocity
    let reversed = false
    for (let i = 0; i < 300; i++) {
      stepSpin(spin, 1 / 60, true)
      if (spin.velocity > 0) reversed = true
    }
    return { released, reversed, settled: spin.velocity, auto: SPIN.autoSpeed }
  }, SPIN)
  expect(result.released).toBeLessThan(-100)
  expect(result.reversed).toBe(false)
  expect(result.settled).toBeCloseTo(-result.auto, 1)
})

test('the slow turn starts to the right before any drag', async ({ page }) => {
  const velocity = await page.evaluate(async (url) => {
    const { createSpin, stepSpin } = await import(url)
    const spin = createSpin(0)
    stepSpin(spin, 0.5, true)
    return spin.velocity
  }, SPIN)
  expect(velocity).toBeGreaterThan(0)
})

test('the release velocity is measured over the last 80 ms, and moves with the same timestamp keep it finite', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, startDrag, moveDrag } = await import(url)
    const spin = createSpin(0)
    startDrag(spin, 1, 0, 1000)
    // Tras el umbral de 4 px: 20 px cada 20 ms, 10 grados cada 20 ms = 500 grados por segundo.
    moveDrag(spin, 1, 24, 1020)
    moveDrag(spin, 1, 44, 1040)
    moveDrag(spin, 1, 64, 1060)
    const steady = spin.velocity
    // Dos eventos en el mismo instante (pasa con eventos agrupados): sin división entre cero ni saltos.
    moveDrag(spin, 1, 74, 1060)
    moveDrag(spin, 1, 84, 1060)
    return { steady, same: spin.velocity, finite: Number.isFinite(spin.velocity) }
  }, SPIN)
  expect(result.steady).toBeCloseTo(500, 0)
  expect(result.finite).toBe(true)
  // La ventana de 80 ms sigue cubriendo más de 16 ms: la velocidad se recalcula con la muestra más vieja.
  expect(result.same).toBeGreaterThan(400)
  expect(result.same).toBeLessThan(1000)
})

test('a single sample window shorter than 16 ms keeps the previous velocity', async ({ page }) => {
  const velocity = await page.evaluate(async (url) => {
    const { createSpin, startDrag, moveDrag } = await import(url)
    const spin = createSpin(0)
    startDrag(spin, 1, 0, 0)
    moveDrag(spin, 1, 20, 5)
    moveDrag(spin, 1, 30, 5)
    return spin.velocity
  }, SPIN)
  expect(velocity).toBe(0)
})

test('the inertia integration does not depend on the frame rate', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, stepSpin } = await import(url)
    const coarse = createSpin(0)
    const fine = createSpin(0)
    coarse.velocity = 400
    fine.velocity = 400
    stepSpin(coarse, 0.3, true)
    for (let i = 0; i < 30; i++) stepSpin(fine, 0.01, true)
    return { coarse: [coarse.angle, coarse.velocity], fine: [fine.angle, fine.velocity] }
  }, SPIN)
  expect(result.coarse[0]).toBeCloseTo(result.fine[0], 6)
  expect(result.coarse[1]).toBeCloseTo(result.fine[1], 6)
})

test('full frame rate only while a gesture, inertia, an arrow step or the tilt is still moving', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, createTilt, startDrag, moveDrag, endDrag, nudge, stepSpin, aimTilt, stepTilt, needsFullRate } = await import(url)
    const spin = createSpin(0)
    const tilt = createTilt()
    stepSpin(spin, 2, true)
    const idle = needsFullRate(spin, tilt, true)
    startDrag(spin, 1, 0, 0)
    const dragging = needsFullRate(spin, tilt, true)
    for (let i = 1; i <= 4; i++) moveDrag(spin, 1, i * 20, i * 20)
    endDrag(spin, 1, 80, true)
    const inertia = needsFullRate(spin, tilt, true)
    for (let i = 0; i < 600; i++) stepSpin(spin, 1 / 60, true)
    const settled = needsFullRate(spin, tilt, true)
    nudge(spin, 1, true)
    const arrow = needsFullRate(spin, tilt, true)
    for (let i = 0; i < 120; i++) stepSpin(spin, 1 / 60, true)
    aimTilt(tilt, 1, 0)
    const tilting = needsFullRate(spin, tilt, true)
    for (let i = 0; i < 300; i++) stepTilt(tilt, 1 / 60, true, 0.2)
    return { idle, dragging, inertia, settled, arrow, tilting, tiltSettled: needsFullRate(spin, tilt, true) }
  }, SPIN)
  expect(result).toEqual({ idle: false, dragging: true, inertia: true, settled: false, arrow: true, tilting: true, tiltSettled: false })
})

test('a drag under the 4 px threshold does not turn the cake', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, startDrag, moveDrag, endDrag } = await import(url)
    const spin = createSpin(10)
    startDrag(spin, 1, 100, 0)
    moveDrag(spin, 1, 103, 30)
    moveDrag(spin, 1, 97, 60)
    endDrag(spin, 1, 70, true)
    return { angle: spin.angle, velocity: spin.velocity }
  }, SPIN)
  expect(result).toEqual({ angle: 10, velocity: 0 })
})
