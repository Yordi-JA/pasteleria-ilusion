/// <reference lib="dom" />
// Los callbacks de `evaluate` y `addInitScript` corren en el navegador y usan sus tipos.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCatalog } from './support/catalog.ts'
import { fullStoreInfo, mockStoreInfo } from './support/store-info.ts'

// El pastel 3D de la portada (D48). La escena expone en desarrollo `data-angle` (grados, sin dar la vuelta),
// `data-separation` (0 a 1), `data-frames` (cuadros dibujados) y `data-running`, para probarla sin acoplar la
// prueba a three. Con escala 1, el lienzo mide lo mismo en cualquier pantalla.
test.use({ deviceScaleFactor: 1 })

const NAME = 'Pastel de tres pisos'
const DRAG_HINT = 'Arrastra el pastel para girarlo.'
const KEYS_HINT = 'Usa las flechas izquierda y derecha para girarlo.'

async function openHome(page: Page) {
  await mockStoreInfo(page, fullStoreInfo)
  await mockCatalog(page)
  await page.goto('/')
}

const box = (page: Page) => page.getByTestId('pastel-portada')
const fallback = (page: Page) => page.getByTestId('pastel-portada-fijo')
const scene = (page: Page) => page.getByRole('img', { name: NAME, exact: true })
const hint = (page: Page) => page.locator('#pastel-pista')
const num = async (page: Page, attr: string) => Number(await scene(page).getAttribute(attr))

async function waitReady(page: Page) {
  await expect(box(page)).toHaveAttribute('data-state', 'ready')
  // El primer cuadro ya se dibujó.
  await expect.poll(() => num(page, 'data-frames')).toBeGreaterThan(0)
}

async function openReady(page: Page) {
  await openHome(page)
  await waitReady(page)
}

async function loseContext(page: Page) {
  await page.locator('[data-testid="pastel-portada"] canvas').evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2')
    gl!.getExtension('WEBGL_lose_context')!.loseContext()
  })
}

/** Simula ocultar o mostrar la pestaña: `visibilityState` lee una variable de la página. */
async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((value) => {
    const holder = window as unknown as { __visibility: string }
    holder.__visibility = value
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => holder.__visibility })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

test.describe('hero cake: fallback', () => {
  test('the static cake shows while the scene loads, with no hint and nothing to focus', async ({ page }) => {
    // El módulo de la escena no llega: la portada se pinta igual, con el pastel fijo.
    await page.route('**/src/three/**', () => {})
    await openHome(page)
    await expect(fallback(page)).toBeVisible()
    await expect(box(page)).toHaveAttribute('data-state', 'loading')
    await expect(scene(page)).toHaveCount(0)
    await expect(hint(page)).toBeHidden()
    expect((await box(page).boundingBox())!.height).toBeCloseTo(600, 0)
  })

  test('without WebGL the static cake stays and the scene is never requested', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, ...args: unknown[]) => unknown
      const withoutWebGL = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl2' || type === 'webgl') return null
        return original.call(this, type, ...rest)
      }
      HTMLCanvasElement.prototype.getContext = withoutWebGL as typeof HTMLCanvasElement.prototype.getContext
    })
    const sceneRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/src/three/')) sceneRequests.push(request.url())
    })
    await openHome(page)
    await expect(box(page)).toHaveAttribute('data-state', 'fallback')
    await expect(fallback(page)).toBeVisible()
    await expect(scene(page)).toHaveCount(0)
    await expect(hint(page)).toBeHidden()
    expect(sceneRequests).toEqual([])
  })

  test('when the WebGL context is lost the static cake comes back, and the scene returns when the tab is shown again', async ({ page }) => {
    await openReady(page)
    await expect(fallback(page)).toBeHidden()
    await loseContext(page)
    await expect(box(page)).toHaveAttribute('data-state', 'fallback')
    await expect(fallback(page)).toBeVisible()
    await expect(scene(page)).toHaveCount(0)
    await setVisibility(page, 'hidden')
    await expect(box(page)).toHaveAttribute('data-state', 'fallback')
    await setVisibility(page, 'visible')
    await waitReady(page)
    await expect(page.locator('[data-testid="pastel-portada"] canvas')).toHaveCount(1)
  })

  test('if the scene had focus when the context is lost, focus moves to "Ver la vitrina"', async ({ page }) => {
    await openReady(page)
    await scene(page).focus()
    await loseContext(page)
    await expect(box(page)).toHaveAttribute('data-state', 'fallback')
    await expect(page.getByRole('main').getByRole('link', { name: 'Ver la vitrina' })).toBeFocused()
  })
})

test.describe('hero cake: scene', () => {
  test('replaces the static cake in the same box, with the hint from the mockup', async ({ page }) => {
    await openReady(page)
    await expect(scene(page)).toBeVisible()
    await expect(fallback(page)).toBeHidden()
    await expect(hint(page)).toBeVisible()
    await expect(hint(page).getByText(DRAG_HINT, { exact: true })).not.toHaveClass(/sr-only/)
    expect((await box(page).boundingBox())!.height).toBeCloseTo(600, 0)
    // El 3D no se anuncia en la página.
    await expect(page.locator('main')).not.toContainText(/3D/)
  })

  test('turns slowly on its own', async ({ page }) => {
    await openReady(page)
    const before = await num(page, 'data-angle')
    await expect.poll(() => num(page, 'data-angle'), { timeout: 4000 }).toBeGreaterThan(before + 2)
  })

  test('turning on its own draws about 30 frames per second, not one per screen refresh', async ({ page }) => {
    await openReady(page)
    // Sin tocar el pastel: solo el giro solo. En un dispositivo a 60 Hz el temporizador alcanza el refresco de los
    // 33 ms (30 por segundo). En Chromium sin pantalla `requestAnimationFrame` no espera al refresco y salen unos 36,
    // así que el tope prueba lo que importa: muy por debajo de uno por refresco (60 por segundo).
    const before = await num(page, 'data-frames')
    await page.waitForTimeout(2000)
    expect((await num(page, 'data-frames')) - before).toBeLessThanOrEqual(2 * 42)
    expect((await num(page, 'data-frames')) - before).toBeGreaterThan(0)
  })

  test('the tiers separate as the page scrolls', async ({ page }) => {
    await openReady(page)
    expect(await num(page, 'data-separation')).toBe(0)
    await page.mouse.wheel(0, 300)
    await expect.poll(() => num(page, 'data-separation')).toBeGreaterThan(0.5)
    await page.mouse.wheel(0, -300)
    await expect.poll(() => num(page, 'data-separation')).toBe(0)
  })

  test('pauses when it leaves the screen and when the tab is hidden', async ({ page }) => {
    await openReady(page)
    await expect(scene(page)).toHaveAttribute('data-running', 'true')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(scene(page)).toHaveAttribute('data-running', 'false')
    // Un cuadro que ya estaba pedido al pausar todavía se dibuja; se espera a que pase antes de contar.
    await page.waitForTimeout(150)
    const frames = await num(page, 'data-frames')
    await page.waitForTimeout(600)
    expect(await num(page, 'data-frames')).toBe(frames)

    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(scene(page)).toHaveAttribute('data-running', 'true')
    await setVisibility(page, 'hidden')
    await expect(scene(page)).toHaveAttribute('data-running', 'false')
    await page.waitForTimeout(150)
    const hidden = await num(page, 'data-frames')
    await page.waitForTimeout(600)
    expect(await num(page, 'data-frames')).toBe(hidden)
  })

  test('leaving and coming back to the portada three times leaves exactly one canvas', async ({ page }) => {
    // Cuatro cargas de la escena con WebGL por software tardan unos 8 s cada una: con los 30 s por omisión la prueba
    // queda al borde y falla a ratos. Fallaba igual en `main` (5 de 8 repeticiones el 10 de noviembre de 2026) y con
    // este tiempo pasan 8 de 8.
    test.setTimeout(90_000)
    await openReady(page)
    const banner = page.getByRole('banner')
    for (let i = 0; i < 3; i++) {
      await banner.getByRole('link', { name: 'Vitrina', exact: true }).click()
      await expect(page).toHaveURL(/\/vitrina$/)
      // React Router aplica la navegación con `startTransition`: la portada sigue en pantalla un rato hasta que la ruta
      // nueva termina de prepararse, y con WebGL por software eso puede pasar de los 5 s de siempre.
      await expect(page.locator('canvas')).toHaveCount(0, { timeout: 15_000 })
      await banner.locator('a[href="/"]').first().click()
      await waitReady(page)
    }
    await expect(page.locator('canvas')).toHaveCount(1)
  })
})

test.describe('hero cake: keyboard and pointer', () => {
  test('Tab reaches the scene, with a visible ring, its name and the arrows hint as description', async ({ page }) => {
    await openReady(page)
    await page.getByRole('main').getByRole('link', { name: 'Ver la vitrina' }).focus()
    await page.keyboard.press('Tab')
    await expect(scene(page)).toBeFocused()
    await expect(scene(page)).toHaveCSS('outline-style', 'solid')
    await expect(scene(page)).toHaveCSS('outline-width', '2px')
    await expect(scene(page)).toHaveAccessibleDescription(new RegExp(KEYS_HINT))
    // Con el foco del teclado, la pista visible es la de las flechas; al salir, vuelve la del arrastre.
    await expect(hint(page).getByText(KEYS_HINT, { exact: true })).not.toHaveClass(/sr-only/)
    await expect(hint(page).getByText(DRAG_HINT, { exact: true })).toHaveClass(/sr-only/)
    await page.keyboard.press('Shift+Tab')
    await expect(hint(page).getByText(DRAG_HINT, { exact: true })).not.toHaveClass(/sr-only/)
  })

  test('the arrows turn it while the scene has focus', async ({ page }) => {
    await openReady(page)
    await scene(page).focus()
    const before = await num(page, 'data-angle')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    // Dos pasos de 15 grados más lo que giró solo mientras tanto.
    await expect.poll(() => num(page, 'data-angle')).toBeGreaterThanOrEqual(before + 29)
    const middle = await num(page, 'data-angle')
    const since = Date.now()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    // Tres pasos de -15 grados. El giro solo (7 grados por segundo) sigue sumando mientras tanto, así que se
    // descuenta con el tiempo transcurrido: sin eso, una máquina cargada que tarde en leer el ángulo lo vuelve
    // inestable. El margen de 30 grados deja holgura sobre los 45 de los tres pasos.
    await expect
      .poll(async () => (await num(page, 'data-angle')) - (middle + (7 * (Date.now() - since)) / 1000))
      .toBeLessThan(-30)
  })

  test('the up and down arrows and a vertical drag do not change the view of the hero', async ({ page }) => {
    await openReady(page)
    await scene(page).focus()
    const elevation = await num(page, 'data-elevation')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowDown')
    const rect = (await scene(page).boundingBox())!
    const x = rect.x + rect.width / 2
    const y = rect.y + rect.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 80, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    expect(await num(page, 'data-elevation')).toBe(elevation)
  })

  test('dragging turns it', async ({ page }) => {
    await openReady(page)
    const rect = (await scene(page).boundingBox())!
    const y = rect.y + rect.height / 2
    const before = await num(page, 'data-angle')
    await page.mouse.move(rect.x + rect.width / 2, y)
    await page.mouse.down()
    await page.mouse.move(rect.x + rect.width / 2 + 120, y, { steps: 6 })
    await page.mouse.up()
    // Medio grado por píxel después del umbral de 4 px: 116 px son 58 grados.
    await expect.poll(() => num(page, 'data-angle')).toBeGreaterThanOrEqual(before + 55)
  })
})

test.describe('hero cake: touch', () => {
  test.use({ hasTouch: true })

  /**
   * Un deslizamiento horizontal de 120 px con el dedo, un evento cada 20 ms (con la marca de tiempo explícita, para
   * que la velocidad no dependa de la carga de la máquina), que termina en `touchEnd` o en `touchCancel`.
   */
  async function flick(page: Page, end: 'touchEnd' | 'touchCancel') {
    const rect = (await scene(page).boundingBox())!
    const x = rect.x + rect.width / 2 - 60
    const y = rect.y + rect.height / 2
    const cdp = await page.context().newCDPSession(page)
    const base = Date.now() / 1000
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }], timestamp: base })
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 20, y }], timestamp: base + i * 0.02 })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: end, touchPoints: [], timestamp: base + 0.13 })
  }

  /** Lo que giró en total: 58° del dedo (116 px después del umbral), más la inercia, más el giro solo. */
  async function totalTurn(page: Page, end: 'touchEnd' | 'touchCancel') {
    await openReady(page)
    const start = await num(page, 'data-angle')
    await flick(page, end)
    await page.waitForTimeout(800)
    return (await num(page, 'data-angle')) - start
  }

  test('a released flick keeps turning with inertia', async ({ page }) => {
    // La inercia de unos 500° por segundo suma unos 220° más.
    expect(await totalTurn(page, 'touchEnd')).toBeGreaterThan(58 + 120)
  })

  test('a cancelled flick leaves no inertia: only the slow turn goes on', async ({ page }) => {
    const total = await totalTurn(page, 'touchCancel')
    expect(total).toBeGreaterThanOrEqual(55)
    // Solo el giro solo de 7° por segundo, aunque la máquina vaya lenta.
    expect(total).toBeLessThan(58 + 60)
  })
})

test.describe('hero cake: reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('does not turn on its own and the tiers do not separate', async ({ page }) => {
    await openReady(page)
    const angle = await num(page, 'data-angle')
    await page.waitForTimeout(1000)
    expect(await num(page, 'data-angle')).toBe(angle)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(400)
    expect(await num(page, 'data-separation')).toBe(0)
    // Sin animación, la escena no dibuja cuadros por su cuenta.
    const frames = await num(page, 'data-frames')
    await page.waitForTimeout(600)
    expect(await num(page, 'data-frames')).toBe(frames)
  })

  test('the arrows and the drag still turn it, in steps and without inertia', async ({ page }) => {
    await openReady(page)
    await scene(page).focus()
    const angle = await num(page, 'data-angle')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => num(page, 'data-angle')).toBe(angle + 15)
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => num(page, 'data-angle')).toBe(angle)

    const rect = (await scene(page).boundingBox())!
    const x = rect.x + rect.width / 2
    const y = rect.y + rect.height / 2
    // Un arrastre de 3 px no pasa el umbral: el pastel no gira.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 3, y + 40, { steps: 3 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    expect(await num(page, 'data-angle')).toBe(angle)
    // 60 px: los 56 después del umbral son 28 grados, y al soltar se queda ahí.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 60, y, { steps: 4 })
    await page.mouse.up()
    await expect.poll(() => num(page, 'data-angle')).toBe(angle + 28)
    await page.waitForTimeout(500)
    expect(await num(page, 'data-angle')).toBe(angle + 28)
  })
})

test.describe('hero cake: mobile at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('keeps the 380 px box, hides the hint like the mockup and does not overflow', async ({ page }) => {
    await openReady(page)
    expect((await box(page).boundingBox())!.height).toBeCloseTo(380, 0)
    await expect(hint(page)).toBeHidden()
    const overflow = await page.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('vertical scroll and pinch zoom still work over the cake', async ({ page }) => {
    await openReady(page)
    await expect(scene(page)).toHaveCSS('touch-action', 'pan-y pinch-zoom')
  })
})

test('the portada cake has no candle: the fixed cake is two tiers and their scallops, nothing above them', async ({ page }) => {
  await openHome(page)
  await expect(fallback(page)).toBeAttached()
  // La vela es cosa de quien recibe el pastel, no del sitio: ni flama (`frambuesa`) ni tallo.
  await expect(fallback(page).locator('.fill-frambuesa')).toHaveCount(0)
  await expect(fallback(page).locator('path')).toHaveCount(1)
  const stem = await fallback(page).locator('path').getAttribute('d')
  expect(stem).not.toContain('M32 22v-8')
})
