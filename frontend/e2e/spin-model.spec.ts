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

// --- Elevación de la cámara: arrastre en dos ejes y flechas de arriba y abajo (D52) ---

test('a mouse drag turns both axes: dragging down raises the camera half a degree per pixel and it stays where it is left', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, startDrag, moveDrag, endDrag, stepSpin } = await import(url)
    const spin = createSpin(0)
    const initial = spin.elevation
    startDrag(spin, 1, 100, 0, { y: 200, touch: false })
    // Un arrastre en vertical, sin moverse en horizontal: con mouse también toma el pastel.
    moveDrag(spin, 1, 100, 20, 204)
    const underThreshold = { angle: spin.angle, elevation: spin.elevation }
    moveDrag(spin, 1, 100, 40, 260)
    moveDrag(spin, 1, 140, 60, 260)
    endDrag(spin, 1, 200, true)
    // Mucho tiempo después: la elevación no se mueve sola (no hay inercia ni se regresa).
    for (let i = 0; i < 300; i++) stepSpin(spin, 1 / 60, true)
    return { initial, underThreshold, elevation: spin.elevation, angle: spin.angle }
  }, SPIN)
  // 4 px de umbral en vertical: no cuentan; los 56 px siguientes son 28 grados.
  expect(result.underThreshold).toEqual({ angle: 0, elevation: result.initial })
  expect(result.elevation).toBeCloseTo(result.initial + 28, 6)
  // Y el giro horizontal sigue como antes: 40 px a medio grado por píxel, más el giro solo de 5 segundos.
  expect(result.angle).toBeGreaterThan(20)
})

test('dragging up lowers the camera below the horizon and the elevation never leaves its range', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, startDrag, moveDrag, endDrag, ELEVATION } = await import(url)
    const spin = createSpin(0)
    startDrag(spin, 1, 0, 0, { y: 500, touch: false })
    moveDrag(spin, 1, 0, 10, 100)
    const low = spin.elevation
    moveDrag(spin, 1, 0, 20, 1200)
    const high = spin.elevation
    endDrag(spin, 1, 30, false)
    return { low, high, min: ELEVATION.min, max: ELEVATION.max }
  }, SPIN)
  expect(result.low).toBe(result.min)
  expect(result.high).toBe(result.max)
  expect(result.min).toBeLessThan(0)
  expect(result.max).toBeGreaterThanOrEqual(80)
  expect(result.max).toBeLessThanOrEqual(85)
})

test('without the second axis (the hero) a drag never moves the elevation', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, startDrag, moveDrag } = await import(url)
    const spin = createSpin(0)
    const initial = spin.elevation
    startDrag(spin, 1, 0, 0)
    moveDrag(spin, 1, 30, 20, 400)
    moveDrag(spin, 1, 60, 40, 800)
    return { initial, elevation: spin.elevation, angle: spin.angle }
  }, SPIN)
  expect(result.elevation).toBe(result.initial)
  expect(result.angle).toBeCloseTo(28, 6)
})

test('a touch that starts vertical belongs to the page, and one that starts horizontal turns both axes until it ends', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, startDrag, moveDrag, endDrag } = await import(url)
    // Empieza en vertical: es scroll, aunque después se mueva de lado.
    const scroll = createSpin(0)
    const initial = scroll.elevation
    startDrag(scroll, 1, 100, 0, { y: 300, touch: true })
    moveDrag(scroll, 1, 102, 10, 312)
    moveDrag(scroll, 1, 160, 20, 330)
    endDrag(scroll, 1, 30, true)
    // Empieza en horizontal: toma el pastel y, desde ahí, gira en los dos ejes en todo el gesto, aunque ahora vaya en vertical.
    const grab = createSpin(0)
    startDrag(grab, 1, 100, 0, { y: 300, touch: true })
    moveDrag(grab, 1, 110, 10, 302)
    const afterHorizontal = { angle: grab.angle, elevation: grab.elevation }
    moveDrag(grab, 1, 110, 20, 340)
    moveDrag(grab, 1, 110, 30, 380)
    endDrag(grab, 1, 40, false)
    return { initial, scroll: { angle: scroll.angle, elevation: scroll.elevation, engaged: scroll.engaged }, afterHorizontal, grab: { angle: grab.angle, elevation: grab.elevation } }
  }, SPIN)
  expect(result.scroll).toEqual({ angle: 0, elevation: result.initial, engaged: false })
  // El primer movimiento de 10 px pasa el umbral de 4: los 6 restantes son 3 grados; el vertical de 2 px (dentro del umbral) no cuenta.
  expect(result.afterHorizontal.angle).toBeCloseTo(3, 6)
  expect(result.afterHorizontal.elevation).toBeCloseTo(result.initial + 0.5 * (302 - 300) * (6 / 10), 6)
  // Después, 78 px de más en vertical, a medio grado cada uno.
  expect(result.grab.elevation).toBeGreaterThan(result.afterHorizontal.elevation + 30)
})

test('the up and down arrows step the elevation like the sides step the turn, in range and without inertia', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, nudgeElevation, stepSpin, ELEVATION, SPIN } = await import(url)
    const spin = createSpin(0)
    const start = spin.elevation
    nudgeElevation(spin, 1, true)
    nudgeElevation(spin, 1, true)
    const pending = spin.pendingElevation
    for (let i = 0; i < 120; i++) stepSpin(spin, 1 / 60, false)
    const up = spin.elevation
    nudgeElevation(spin, -1, true)
    for (let i = 0; i < 120; i++) stepSpin(spin, 1 / 60, false)
    // Muchas veces hacia arriba: se queda en el tope, sin acumular pasos que luego haya que deshacer.
    for (let i = 0; i < 30; i++) nudgeElevation(spin, 1, true)
    for (let i = 0; i < 300; i++) stepSpin(spin, 1 / 60, false)
    const top = spin.elevation
    nudgeElevation(spin, -1, true)
    for (let i = 0; i < 120; i++) stepSpin(spin, 1 / 60, false)
    const afterOne = spin.elevation
    // Sin animación (reducir movimiento), el paso salta.
    const jump = createSpin(0)
    nudgeElevation(jump, -1, false)
    return { start, pending, up, step: SPIN.elevationKeyStep, top, afterOne, max: ELEVATION.max, jump: jump.elevation, pendingJump: jump.pendingElevation }
  }, SPIN)
  expect(result.pending).toBe(2 * result.step)
  expect(result.up).toBeCloseTo(result.start + 2 * result.step, 6)
  expect(result.top).toBeCloseTo(result.max, 6)
  expect(result.afterOne).toBeCloseTo(result.max - result.step, 6)
  expect(result.jump).toBe(result.start - result.step)
  expect(result.pendingJump).toBe(0)
})

test('catching the cake in the middle of an elevation step keeps where the step was going', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, nudgeElevation, startDrag } = await import(url)
    const spin = createSpin(0)
    const start = spin.elevation
    nudgeElevation(spin, 1, true)
    startDrag(spin, 1, 0, 0, { y: 0, touch: false })
    return { elevation: spin.elevation, pending: spin.pendingElevation, expected: start + 10 }
  }, SPIN)
  expect(result.elevation).toBe(result.expected)
  expect(result.pending).toBe(0)
})

test('the elevation also asks for the full frame rate while a step is pending', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { createSpin, createTilt, nudgeElevation, stepSpin, needsFullRate } = await import(url)
    const spin = createSpin(0)
    const tilt = createTilt()
    stepSpin(spin, 2, true)
    const idle = needsFullRate(spin, tilt, true)
    nudgeElevation(spin, 1, true)
    const stepping = needsFullRate(spin, tilt, true)
    for (let i = 0; i < 200; i++) stepSpin(spin, 1 / 60, true)
    return { idle, stepping, settled: needsFullRate(spin, tilt, true) }
  }, SPIN)
  expect(result).toEqual({ idle: false, stepping: true, settled: false })
})
