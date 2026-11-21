import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mockCatalog } from './support/catalog.ts'
import { fullStoreInfo, mockStoreInfo } from './support/store-info.ts'

async function openHome(page: Page) {
  await mockStoreInfo(page, fullStoreInfo)
  await mockCatalog(page, {})
  await page.goto('/')
}

const gallery = (page: Page) => page.getByRole('region', { name: 'Hechos en la casa', exact: true })
const band = (page: Page) => page.getByTestId('galeria-banda')
const track = (page: Page) => page.getByTestId('galeria-pista')
const pauseButton = (page: Page) => page.getByRole('button', { name: /las fotos$/ })
const playState = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).animationPlayState)

/** Cuántas fotos tiene la lista: la 32 y la 36 no están, y la 48 es la gelatina. */
const PHOTOS = 46

test.describe('Hechos en la casa, with motion', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('is a fresa field between the vitrina and the slices, with its own guirnaldas and the exact title', async ({ page }) => {
    await openHome(page)
    await expect(gallery(page)).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Hechos en la casa', exact: true })).toBeVisible()
    const floors = await page.locator('main > *').evaluateAll((els) =>
      els.map((el) => (el.classList.contains('duya') ? 'duya' : el.getAttribute('data-campo'))),
    )
    expect(floors).toEqual(['fresa', 'duya', 'nata', 'duya', 'mermelada', 'duya', 'fresa', 'duya', 'nata'])
    await expect(gallery(page)).toHaveCSS('background-color', 'rgb(249, 193, 193)')
    const text = (await gallery(page).innerText()).toLowerCase()
    expect(text).not.toContain('!')
    expect(text).not.toMatch(/pedidos reales|proyecto|escolar|escuela/)
  })

  test('lists the photos once for assistive technology, each with a short alt, and a hidden copy to close the loop', async ({ page }) => {
    await openHome(page)
    const visibleImages = gallery(page).locator('ul:not([aria-hidden]) img')
    await expect(visibleImages).toHaveCount(PHOTOS)
    const alts = await visibleImages.evaluateAll((imgs) => imgs.map((img) => img.getAttribute('alt') ?? ''))
    for (const alt of alts) {
      expect(alt.length).toBeGreaterThan(10)
      expect(alt.length).toBeLessThan(90)
    }
    expect(new Set(alts).size).toBe(PHOTOS)
    const copy = gallery(page).locator('ul[aria-hidden="true"]')
    await expect(copy.locator('img')).toHaveCount(PHOTOS)
    expect(await copy.locator('img[alt=""]').count()).toBe(PHOTOS)
    for (const img of await visibleImages.all()) {
      await expect(img).toHaveAttribute('loading', 'lazy')
      await expect(img).toHaveAttribute('decoding', 'async')
    }
  })

  test('the cards are not in a line: each photo keeps its own ratio, height, offset and tilt, the same on every load', async ({ page }) => {
    await openHome(page)
    const read = () =>
      gallery(page)
        .locator('ul:not([aria-hidden]) li')
        .evaluateAll((items) =>
          items.map((li) => {
            const style = getComputedStyle(li)
            const img = li.querySelector('img')!
            return {
              marginTop: style.marginTop,
              transform: style.transform,
              height: Math.round(li.getBoundingClientRect().height),
              ratio: li.clientWidth / li.clientHeight,
              natural: img.width / img.height,
            }
          }),
        )
    const first = await read()
    expect(new Set(first.map((card) => card.marginTop)).size).toBeGreaterThan(4)
    expect(new Set(first.map((card) => card.transform)).size).toBeGreaterThan(4)
    expect(new Set(first.map((card) => card.height)).size).toBeGreaterThan(8)
    expect(first.some((card) => card.natural > 1.3)).toBe(true)
    expect(first.some((card) => card.natural < 0.8)).toBe(true)
    // La caja de la foto conserva la proporción del archivo: nada recortado a cuadrado.
    for (const card of first) expect(card.ratio / card.natural).toBeCloseTo(1, 1)
    await page.reload()
    expect(await read()).toEqual(first)
  })

  test('slides on its own with transform only, loops over half its width, and pauses with the button', async ({ page }) => {
    await openHome(page)
    await expect(track(page)).toBeVisible()
    const motion = await track(page).evaluate((el) => {
      const style = getComputedStyle(el)
      return { name: style.animationName, count: style.animationIterationCount, timing: style.animationTimingFunction }
    })
    expect(motion).toEqual({ name: 'galeria-desliza', count: 'infinite', timing: 'linear' })
    const x = () => track(page).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)
    const start = await x()
    await expect.poll(x).toBeLessThan(start - 5)

    await expect(pauseButton(page)).toHaveText('Pausar las fotos')
    await expect(pauseButton(page)).not.toHaveAttribute('aria-pressed')
    await pauseButton(page).click()
    await expect(pauseButton(page)).toHaveText('Reanudar las fotos')
    await expect(pauseButton(page)).not.toHaveAttribute('aria-pressed')
    // Con el botón quitado el puntero y el foco de la banda no cuentan: solo lo pausa el botón.
    await page.mouse.move(5, 5)
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    expect(await playState(track(page))).toBe('paused')
    const frozen = await x()
    await page.waitForTimeout(400)
    expect(await x()).toBe(frozen)

    await pauseButton(page).click()
    await expect(pauseButton(page)).toHaveText('Pausar las fotos')
    expect(await playState(track(page))).toBe('running')
    await expect.poll(x).not.toBe(frozen)
  })

  test('pauses with the pointer over the band and with the focus on it, and resumes when both leave', async ({ page }) => {
    await openHome(page)
    await expect(track(page)).toBeVisible()
    expect(await playState(track(page))).toBe('running')
    await band(page).scrollIntoViewIfNeeded()
    const box = (await band(page).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(() => playState(track(page))).toBe('paused')
    await page.mouse.move(5, 5)
    await expect.poll(() => playState(track(page))).toBe('running')

    // El foco en la banda (enfocable para eso) también la detiene.
    await band(page).focus()
    await expect.poll(() => playState(track(page))).toBe('paused')
    await band(page).blur()
    await expect.poll(() => playState(track(page))).toBe('running')
  })

  test('the loaded photos are real images, none broken, and every request answers with success', async ({ page }) => {
    const failures: string[] = []
    page.on('response', (response) => {
      if (response.url().includes('/fotos/pedidos/') && !response.ok()) failures.push(`${response.status()} ${response.url()}`)
    })
    await openHome(page)
    await expect(gallery(page).locator('ul:not([aria-hidden]) img').first()).toBeVisible()
    await page.waitForTimeout(800)
    const broken = await gallery(page).locator('img').evaluateAll((imgs) =>
      (imgs as HTMLImageElement[]).filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src),
    )
    expect(broken).toEqual([])
    expect(failures).toEqual([])
    expect(await gallery(page).locator('ul:not([aria-hidden]) img').evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((img) => img.complete && img.naturalWidth > 0).length)).toBeGreaterThan(3)
  })
})

test.describe('Hechos en la casa, reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })

  test('has no animation and no pause button, and scrolls sideways with the keyboard', async ({ page }) => {
    await openHome(page)
    await expect(gallery(page)).toBeVisible()
    await expect(pauseButton(page)).toHaveCount(0)
    await expect(track(page)).toHaveCount(0)
    await expect(gallery(page).locator('ul')).toHaveCount(1)
    const scroller = band(page)
    await expect(scroller).toHaveAttribute('role', 'region')
    await expect(scroller).toHaveAccessibleName('Fotos de pasteles hechos en la casa')
    expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth + 1000)).toBe(true)
    await scroller.focus()
    await expect(scroller).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    // Tras el desplazamiento suave del teclado, la fila queda quieta: no se mueve sola.
    await page.waitForTimeout(800)
    const before = await scroller.evaluate((el) => el.scrollLeft)
    await page.waitForTimeout(500)
    expect(await scroller.evaluate((el) => el.scrollLeft)).toBe(before)
    await expect(gallery(page).locator('img[alt]:not([alt=""])')).toHaveCount(PHOTOS)
  })

  test('scrolling to the end loads every photo without a broken one', async ({ page }) => {
    await openHome(page)
    const scroller = band(page)
    await scroller.scrollIntoViewIfNeeded()
    const width = await scroller.evaluate((el) => el.scrollWidth)
    for (let x = 0; x <= width; x += 600) {
      await scroller.evaluate((el, left) => el.scrollTo({ left }), x)
      await page.waitForTimeout(60)
    }
    await expect
      .poll(() =>
        gallery(page).locator('img').evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((img) => !img.complete || img.naturalWidth === 0).length),
      )
      .toBe(0)
  })
})

test.describe('Hechos en la casa, phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('keeps the page from scrolling sideways and the band at the phone size', async ({ page }) => {
    await openHome(page)
    await expect(gallery(page)).toBeVisible()
    await gallery(page).scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const photoHeight = await gallery(page).locator('ul:not([aria-hidden]) li').first().evaluate((li) => li.getBoundingClientRect().height)
    expect(photoHeight).toBeLessThan(300)
    await expect(pauseButton(page)).toBeVisible()
    await expect(pauseButton(page)).toHaveCSS('min-height', '44px')
  })
})
