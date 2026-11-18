import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { mockCatalog } from './support/catalog.ts'
import { mockProducts } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Movimiento sutil del sitio (tanda 3 de correcciones): el contenido aparece al llegar a la vista (sube 8 px y se
 * desvanece una sola vez), las tarjetas suben 2 px con el mouse encima, los botones se hunden al presionarlos y el
 * contenido se desvanece al cambiar de ruta. Con "reducir movimiento" todo aparece sin animación. La API se simula.
 */

const REVEAL = '[data-aparicion]'

const slicesRegion = (page: Page) => page.getByRole('region', { name: 'Rebanadas de hoy', exact: true })
const cakesRegion = (page: Page) => page.getByRole('region', { name: 'Pasteles', exact: true })

async function openHome(page: Page) {
  await mockStoreInfo(page)
  await mockCatalog(page)
  await page.goto('/')
}

async function openCatalog(page: Page) {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
  await mockProducts(page)
  await page.goto('/catalogo')
}

/** La opacidad y la transformación calculadas, leídas una sola vez (sin reintentos): lo que se ve en ese cuadro. */
const styleNow = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return { opacity: style.opacity, transform: style.transform }
  })

/** Elementos de `<main>` visibles para el ojo que quedaron con opacidad 0 (lo decorativo oculto lleva `visibility`). */
const invisibleInMain = (page: Page) =>
  page.locator('main [data-aparicion], main [data-aparicion] > *').evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element)
        return style.visibility !== 'hidden' && Number(style.opacity) === 0
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  )

/** Baja por la página de pantalla en pantalla, como alguien que la recorre, hasta el final. */
async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y <= height; y += 400) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(60)
  }
}

test.describe('with reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })

  test('home: content below the fold is visible at once, without a reveal state or transform', async ({ page }) => {
    await openHome(page)
    const card = slicesRegion(page).getByRole('listitem').first()
    await expect(card).toBeAttached()
    // Sin bajar: debajo del pliegue también está a la vista, sin estado de aparición.
    await expect(page.locator(REVEAL)).toHaveCount(0)
    expect(await styleNow(card)).toEqual({ opacity: '1', transform: 'none' })
    expect(await styleNow(slicesRegion(page).getByRole('heading', { level: 2 }))).toEqual({ opacity: '1', transform: 'none' })
  })

  test('catalog: cards do not lift on hover and the route change does not fade', async ({ page }) => {
    await openCatalog(page)
    const card = cakesRegion(page).getByRole('article').first()
    await card.hover()
    await page.waitForTimeout(300)
    expect((await styleNow(card)).transform).toBe('none')
    await page.getByRole('banner').getByRole('link', { name: 'Vitrina', exact: true }).click()
    await expect(page).toHaveURL(/\/vitrina$/)
    expect(await page.locator('main').evaluate((main) => main.getAnimations().length)).toBe(0)
  })
})

test.describe('without reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })

  test('home: a section below the fold starts hidden and appears after scrolling to it', async ({ page }) => {
    await openHome(page)
    const header = slicesRegion(page).locator(REVEAL).first()
    await expect(header).toHaveAttribute('data-aparicion', 'oculta')
    expect(await styleNow(header)).toEqual({ opacity: '0', transform: 'matrix(1, 0, 0, 1, 0, 8)' })

    await header.scrollIntoViewIfNeeded()
    await expect(header).toHaveAttribute('data-aparicion', 'visible')
    await expect(header).toHaveCSS('opacity', '1')
    await expect(header).toHaveCSS('transform', 'none')
  })

  test('home: what is already in view on load shows at once, with no reveal state', async ({ page }) => {
    await openHome(page)
    const hero = page.getByRole('region', { name: 'Pastelería Ilusión', exact: true })
    await expect(hero.getByRole('link', { name: 'Realizar pedido' })).toBeVisible()
    await expect(hero.locator(REVEAL)).toHaveCount(0)
    expect(await styleNow(hero.getByText('Pide un deseo. Del pastel nos encargamos.'))).toEqual({ opacity: '1', transform: 'none' })
  })

  test('card grids stagger their items by at most 40 ms each, with a cap', async ({ page }) => {
    await openHome(page)
    const grid = slicesRegion(page).locator('[data-aparicion][data-escalonada]')
    await expect(grid).toHaveCount(1)
    await grid.scrollIntoViewIfNeeded()
    await expect(grid).toHaveAttribute('data-aparicion', 'visible')
    const delays = await grid.locator(':scope > *').evaluateAll((items) => items.map((item) => parseFloat(getComputedStyle(item).transitionDelay) * 1000))
    expect(delays[0]).toBe(0)
    for (let index = 1; index < delays.length; index += 1) {
      expect(delays[index] - delays[index - 1]).toBeLessThanOrEqual(40)
    }
    expect(Math.max(...delays)).toBeLessThanOrEqual(240)
  })

  test('nothing stays at opacity 0 after scrolling through the home and the catalog', async ({ page }) => {
    await mockCakeDesignOptions(page)
    await mockProducts(page)
    await openHome(page)
    await expect(slicesRegion(page).getByRole('listitem').first()).toBeAttached()
    await scrollThrough(page)
    await expect.poll(() => invisibleInMain(page)).toEqual([])
    await expect(page.locator('[data-aparicion="oculta"]')).toHaveCount(0)

    await page.getByRole('banner').getByRole('link', { name: 'Catálogo', exact: true }).click()
    await expect(cakesRegion(page).getByRole('article').first()).toBeVisible()
    await scrollThrough(page)
    await expect.poll(() => invisibleInMain(page)).toEqual([])
  })

  test('if the observer never answers, the content still shows', async ({ page }) => {
    // Un IntersectionObserver que nunca llama: la red de seguridad muestra el contenido sin esperar al scroll.
    await page.addInitScript(() => {
      class SilentObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
      }
      Reflect.set(window, 'IntersectionObserver', SilentObserver)
    })
    await openHome(page)
    const header = slicesRegion(page).locator(REVEAL).first()
    await expect(header).toHaveCSS('opacity', '1', { timeout: 3000 })
  })

  test('keyboard focus inside hidden content shows it', async ({ page }) => {
    await openHome(page)
    const header = slicesRegion(page).locator(REVEAL).first()
    await expect(header).toHaveAttribute('data-aparicion', 'oculta')
    // Mueve el foco por código sin desplazar la página: el contenido con el foco nunca queda invisible.
    await slicesRegion(page).getByRole('heading', { level: 2 }).evaluate((heading: HTMLElement) => heading.focus({ preventScroll: true }))
    await expect(header).toHaveAttribute('data-aparicion', 'visible')
  })

  test('the route change fades the main content briefly and ends fully visible', async ({ page }) => {
    await openHome(page)
    // Anota cada `animate()` de `<main>`: el desvanecido dura menos de 200 ms y, con la máquina ocupada, puede terminar
    // antes de que la prueba alcance a leer `getAnimations()`.
    await page.locator('main').evaluate((main) => {
      const calls: { properties: string[]; duration: unknown }[] = []
      Reflect.set(window, '__mainAnimations', calls)
      const original = main.animate.bind(main)
      main.animate = (keyframes, options) => {
        const frames = Array.isArray(keyframes) ? keyframes : []
        const properties = [...new Set(frames.flatMap((frame) => Object.keys(frame).filter((key) => !['offset', 'easing', 'composite'].includes(key))))]
        calls.push({ properties, duration: typeof options === 'object' ? options.duration : options })
        return original(keyframes, options)
      }
    })
    await page.getByRole('banner').getByRole('link', { name: 'Catálogo', exact: true }).click()
    await expect(page).toHaveURL(/\/catalogo$/)
    const calls = () => page.evaluate(() => Reflect.get(window, '__mainAnimations') as { properties: string[]; duration: number }[])
    await expect.poll(async () => (await calls()).length).toBe(1)
    const [fade] = await calls()
    // Solo opacidad: no mueve nada, así el foco y el scroll de la ruta no cambian.
    expect(fade.properties).toEqual(['opacity'])
    expect(fade.duration).toBeLessThanOrEqual(200)
    await expect.poll(() => page.locator('main').evaluate((main) => main.getAnimations().length)).toBe(0)
    await expect(page.locator('main')).toHaveCSS('opacity', '1')
    // El foco sigue llegando al contenido nuevo (useRouteFocus).
    await expect(page.locator('main')).toBeFocused()
  })

  test('buttons sink a little while pressed', async ({ page }) => {
    await openHome(page)
    const button = page.getByRole('region', { name: 'Pastelería Ilusión', exact: true }).getByRole('link', { name: 'Realizar pedido' })
    const box = (await button.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect(button).toHaveCSS('transform', 'matrix(0.98, 0, 0, 0.98, 0, 0)')
    // Se suelta fuera del botón, para no navegar.
    await page.mouse.move(box.x + box.width / 2, box.y - 200)
    await page.mouse.up()
    await expect(button).toHaveCSS('transform', 'none')
  })
})

test.describe('card hover on a device with a mouse', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })

  test('a product card lifts 2 px on hover and goes back', async ({ page }) => {
    await openCatalog(page)
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true)
    const card = cakesRegion(page).getByRole('article').first()
    await card.scrollIntoViewIfNeeded()
    await expect(card).toHaveCSS('transform', 'none')
    await card.hover()
    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)')
    await page.mouse.move(5, 5)
    await expect(card).toHaveCSS('transform', 'none')
  })
})

test.describe('card hover on a touch device', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' })

  test('a product card does not lift: touch has no real hover', async ({ page }) => {
    await openCatalog(page)
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false)
    const card = cakesRegion(page).getByRole('article').first()
    await card.scrollIntoViewIfNeeded()
    await card.hover()
    await page.waitForTimeout(300)
    expect((await styleNow(card)).transform).toBe('none')
  })
})
