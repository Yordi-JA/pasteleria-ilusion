import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { mockCatalog } from './support/catalog.ts'
import { mockProducts } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Movimiento del sitio (D80 y D90): las secciones aparecen al llegar a la vista (suben 8 px y se desvanecen una sola vez),
 * las tarjetas suben en cascada (20 px, 60 ms entre cada una y como máximo 300 ms), la tarjeta destacada sube 4 px con el
 * mouse encima y su pastel un poco más, los botones se hunden a 0.97 al presionarlos y, sin transiciones de vista, el contenido
 * se desvanece al cambiar de ruta. Con "reducir movimiento" todo aparece sin animación. La API se simula.
 */

const REVEAL = '[data-aparicion]'
const CASCADE = '[data-cascada]'

const slicesRegion = (page: Page) => page.getByRole('region', { name: 'Rebanadas de hoy', exact: true })
const cakesRegion = (page: Page) => page.getByRole('region', { name: 'Pasteles', exact: true })
const dessertsRegion = (page: Page) => page.getByRole('region', { name: 'Postres y gelatinas', exact: true })
/** Los hijos de una cuadrícula en cascada: cada uno sube por su cuenta. */
const cascadeItems = (scope: Locator) => scope.locator('[data-escalonada] > *')

type CascadeRecord = { value: string | null; section: string | null; index: number; delayMs: number }

/**
 * Anota cada cambio de `data-cascada` en la página: a qué valor, en qué sección, qué hijo de su cuadrícula y con qué retraso
 * de transición, leído en ese momento en lo que se mueve (la tarjeta, o la etiqueta en una partida de la vitrina). Así la
 * prueba no depende de alcanzar a ver un cuadro a media animación. `section` filtra por el `aria-labelledby` de la sección.
 */
async function recordCascade(page: Page, section?: string) {
  await page.evaluate(() => {
    const records: CascadeRecord[] = []
    Reflect.set(window, '__cascade', records)
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const item = mutation.target as HTMLElement
        const moving = item.hasAttribute('data-cascada-partes') ? item.querySelector('[data-cascada-parte="etiqueta"]')! : item
        records.push({
          value: item.getAttribute('data-cascada'),
          section: item.closest('section')?.getAttribute('aria-labelledby') ?? null,
          index: Array.from(item.parentElement?.children ?? []).indexOf(item),
          delayMs: parseFloat(getComputedStyle(moving).transitionDelay) * 1000,
        })
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-cascada'] })
  })
  const all = async () =>
    (await page.evaluate(() => Reflect.get(window, '__cascade') as CascadeRecord[])).filter((record) => !section || record.section === section)
  return { all, shown: async () => (await all()).filter((record) => record.value === 'visible') }
}

/** Un IntersectionObserver que nunca llama, para probar la red de seguridad. */
function silenceObserver(page: Page) {
  return page.addInitScript(() => {
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
}

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
  page.locator('main [data-aparicion], main [data-aparicion] > *, main [data-escalonada] > *, main [data-cascada-parte]').evaluateAll((elements) =>
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

  test('catalog: cards below the fold are visible at once, with no cascade state', async ({ page }) => {
    await openCatalog(page)
    const dessert = cascadeItems(dessertsRegion(page)).first()
    await expect(dessert).toBeAttached()
    await expect(page.locator(CASCADE)).toHaveCount(0)
    expect(await styleNow(dessert)).toEqual({ opacity: '1', transform: 'none' })
  })

  test('catalog: cards do not lift on hover and the route change does not fade', async ({ page }) => {
    await openCatalog(page)
    const card = cakesRegion(page).getByRole('article').first()
    await card.hover()
    await page.waitForTimeout(300)
    expect((await styleNow(card)).transform).toBe('none')
    expect(await styleNow(card.locator('.foto-sobresaliente > :first-child'))).toEqual({ opacity: '1', transform: 'none' })
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

  test('home: what is already in view on load has no reveal state; the hero has its own entrance, once, and settles in place', async ({ page }) => {
    // D90 (tanda 7): el hero ya no aparece tal cual; entra una sola vez por carga (`home-header-morph.spec.ts` prueba el escalón).
    // Lo demás que ya se ve al cargar sigue sin estado de aparición.
    await openHome(page)
    const hero = page.getByRole('region', { name: 'Pastelería Ilusión', exact: true })
    const motto = hero.getByText('Pide un deseo. Del pastel nos encargamos.')
    await expect(hero.getByRole('link', { name: 'Realizar pedido' })).toBeVisible()
    await expect(hero.locator(REVEAL)).toHaveCount(0)
    await expect(motto).toHaveCSS('animation-name', 'home-entrada')
    // La entrada termina sola (450 ms y 60 ms de escalón) y deja el lema en su lugar, sin nada encima.
    await expect.poll(() => styleNow(motto), { timeout: 3000 }).toEqual({ opacity: '1', transform: 'none' })
    // Con "reducir movimiento" no hay entrada: el lema se ve en su lugar desde el primer cuadro.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await expect(motto).toBeVisible()
    await expect(motto).toHaveCSS('animation-name', 'none')
    expect(await styleNow(motto)).toEqual({ opacity: '1', transform: 'none' })
  })

  test('card grid: cards below the fold wait hidden and rise in cascade, each later than the one before', async ({ page }) => {
    await openCatalog(page)
    const items = cascadeItems(dessertsRegion(page))
    await expect(items).toHaveCount(3)
    // Abajo del pliegue: cada tarjeta espera por su cuenta, transparente y 20 px abajo.
    for (const item of await items.all()) {
      await expect(item).toHaveAttribute('data-cascada', 'oculta')
      expect(await styleNow(item)).toEqual({ opacity: '0', transform: 'matrix(1, 0, 0, 1, 0, 20)' })
    }
    const cascade = await recordCascade(page, 'catalogo-postres')
    await items.last().scrollIntoViewIfNeeded()
    await expect.poll(async () => (await cascade.shown()).length).toBe(3)
    const shown = await cascade.shown()
    // En el orden de la cuadrícula, cada una sale 60 ms después de la anterior.
    expect(shown.map((record) => record.index)).toEqual([0, 1, 2])
    expect(shown.map((record) => record.delayMs)).toEqual([0, 60, 120])
    // Al terminar, todas a la vista y sin rastro de la cascada (la transición del mouse vuelve a ser la suya).
    await expect(dessertsRegion(page).locator(CASCADE)).toHaveCount(0)
    for (const item of await items.all()) expect(await styleNow(item)).toEqual({ opacity: '1', transform: 'none' })
  })

  test('card grid: cards already in view on load do not move', async ({ page }) => {
    await openCatalog(page)
    const first = cascadeItems(cakesRegion(page)).first()
    await expect(first).toBeVisible()
    await expect(first).not.toHaveAttribute('data-cascada')
    expect(await styleNow(first)).toEqual({ opacity: '1', transform: 'none' })
  })

  test('card grid: the cascade runs once, scrolling back up and down does not hide anything again', async ({ page }) => {
    await openCatalog(page)
    const items = cascadeItems(dessertsRegion(page))
    await expect(items.first()).toHaveAttribute('data-cascada', 'oculta')
    await items.last().scrollIntoViewIfNeeded()
    await expect(dessertsRegion(page).locator(CASCADE)).toHaveCount(0)
    const cascade = await recordCascade(page, 'catalogo-postres')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(200)
    await items.last().scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    expect(await cascade.all()).toEqual([])
    for (const item of await items.all()) expect(await styleNow(item)).toEqual({ opacity: '1', transform: 'none' })
  })

  test('card grid: a long batch keeps each delay at 300 ms at most', async ({ page }) => {
    // Sin respuesta del observador, la red de seguridad muestra todas las partidas de la vitrina en una sola tanda.
    await silenceObserver(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await mockStoreInfo(page)
    await mockCatalog(page)
    await page.goto('/vitrina')
    const cascade = await recordCascade(page)
    await expect.poll(async () => (await cascade.shown()).length, { timeout: 3000 }).toBeGreaterThan(6)
    const delays = (await cascade.shown()).map((record) => record.delayMs)
    for (let index = 1; index < delays.length; index += 1) {
      expect(delays[index]).toBeGreaterThanOrEqual(delays[index - 1])
      expect(delays[index] - delays[index - 1]).toBeLessThanOrEqual(60)
    }
    expect(Math.max(...delays)).toBe(300)
    await expect(page.locator(CASCADE)).toHaveCount(0)
  })

  test('card grid: without IntersectionObserver every card shows at once', async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'IntersectionObserver')
    })
    await openCatalog(page)
    const dessert = cascadeItems(dessertsRegion(page)).first()
    await expect(dessert).toBeAttached()
    await expect(page.locator(CASCADE)).toHaveCount(0)
    expect(await styleNow(dessert)).toEqual({ opacity: '1', transform: 'none' })
  })

  test('card grid: keyboard focus inside a hidden card shows it', async ({ page }) => {
    await openCatalog(page)
    const item = cascadeItems(dessertsRegion(page)).first()
    await expect(item).toHaveAttribute('data-cascada', 'oculta')
    await item.getByRole('link').first().evaluate((link: HTMLElement) => link.focus({ preventScroll: true }))
    await expect(item).not.toHaveAttribute('data-cascada', 'oculta')
    await expect(item).toHaveCSS('opacity', '1')
  })

  test('vitrina: the shelf stays still while the cake settles onto it and the tag rises', async ({ page }) => {
    await mockStoreInfo(page)
    await mockCatalog(page)
    await page.goto('/vitrina')
    const item = cascadeItems(page.locator('main')).last()
    await expect(item).toHaveAttribute('data-cascada', 'oculta')
    expect(await styleNow(item)).toEqual({ opacity: '1', transform: 'none' })
    expect(await styleNow(item.locator('article > [aria-hidden="true"]'))).toEqual({ opacity: '1', transform: 'none' })
    expect(await styleNow(item.locator('[data-cascada-parte="pastel"]'))).toEqual({ opacity: '0', transform: 'matrix(1, 0, 0, 1, 0, -16)' })
    expect(await styleNow(item.locator('[data-cascada-parte="etiqueta"]'))).toEqual({ opacity: '0', transform: 'matrix(1, 0, 0, 1, 0, 20)' })
    await item.scrollIntoViewIfNeeded()
    await expect(page.locator(CASCADE)).toHaveCount(0)
    for (const part of await item.locator('[data-cascada-parte]').all()) expect(await styleNow(part)).toEqual({ opacity: '1', transform: 'none' })
  })

  test('nothing stays at opacity 0 after scrolling through the home and the catalog', async ({ page }) => {
    await mockCakeDesignOptions(page)
    await mockProducts(page)
    await openHome(page)
    await expect(slicesRegion(page).getByRole('listitem').first()).toBeAttached()
    await scrollThrough(page)
    await expect.poll(() => invisibleInMain(page)).toEqual([])
    await expect(page.locator('[data-aparicion="oculta"]')).toHaveCount(0)
    await expect(page.locator(CASCADE)).toHaveCount(0)

    await page.getByRole('banner').getByRole('link', { name: 'Catálogo', exact: true }).click()
    await expect(cakesRegion(page).getByRole('article').first()).toBeVisible()
    await scrollThrough(page)
    await expect.poll(() => invisibleInMain(page)).toEqual([])
  })

  test('if the observer never answers, the content still shows', async ({ page }) => {
    // Un IntersectionObserver que nunca llama: la red de seguridad muestra el contenido sin esperar al scroll.
    await silenceObserver(page)
    await openHome(page)
    const header = slicesRegion(page).locator(REVEAL).first()
    await expect(header).toHaveCSS('opacity', '1', { timeout: 3000 })
    const card = cascadeItems(slicesRegion(page)).first()
    await expect(card).toHaveCSS('opacity', '1', { timeout: 3000 })
    await expect(page.locator(CASCADE)).toHaveCount(0)
  })

  test('keyboard focus inside hidden content shows it', async ({ page }) => {
    await openHome(page)
    const header = slicesRegion(page).locator(REVEAL).first()
    await expect(header).toHaveAttribute('data-aparicion', 'oculta')
    // Mueve el foco por código sin desplazar la página: el contenido con el foco nunca queda invisible.
    await slicesRegion(page).getByRole('heading', { level: 2 }).evaluate((heading: HTMLElement) => heading.focus({ preventScroll: true }))
    await expect(header).toHaveAttribute('data-aparicion', 'visible')
  })

  test('without view transitions, the route change fades the main content briefly and ends fully visible', async ({ page }) => {
    // Con `document.startViewTransition` la ruta cambia con la transición entre vistas (`e2e/route-transition.spec.ts`); este
    // desvanecido es el respaldo de los navegadores que no la tienen.
    await page.addInitScript(() => {
      Reflect.deleteProperty(Document.prototype, 'startViewTransition')
    })
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

  test('buttons sink to 0.97 while pressed, in 100 ms', async ({ page }) => {
    await openHome(page)
    const button = page.getByRole('region', { name: 'Pastelería Ilusión', exact: true }).getByRole('link', { name: 'Realizar pedido' })
    const box = (await button.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect(button).toHaveCSS('transform', 'matrix(0.97, 0, 0, 0.97, 0, 0)')
    // Hundirse es más rápido (100 ms) que volver (150 ms).
    expect(await button.evaluate((element) => getComputedStyle(element).transitionDuration.split(', ')[0])).toBe('0.1s')
    // Se suelta fuera del botón, para no navegar.
    await page.mouse.move(box.x + box.width / 2, box.y - 200)
    await page.mouse.up()
    await expect(button).toHaveCSS('transform', 'none')
    expect(await button.evaluate((element) => getComputedStyle(element).transitionDuration.split(', ')[0])).toBe('0.15s')
  })

  test('disabled and aria-disabled buttons do not sink when pressed', async ({ page }) => {
    await mockStoreInfo(page)
    await page.goto('/muestra')
    const main = page.locator('main')
    const disabled = main.getByRole('button', { name: 'Calculando…' })
    const waiting = main.getByRole('button', { name: 'Realizar pedido' })
    // Un botón que espera sin perder el foco (como "Guardar cambios" mientras guarda) lleva `aria-disabled`.
    await waiting.evaluate((element) => element.setAttribute('aria-disabled', 'true'))
    for (const button of [disabled, waiting]) {
      const box = (await button.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(200)
      expect((await styleNow(button)).transform).toBe('none')
      // Se suelta fuera, para no pulsarlo.
      await page.mouse.move(5, 5)
      await page.mouse.up()
    }
  })
})

// Hasta 960 px las rebanadas de la portada son una fila que se desliza de lado: ahí no hay cascada, porque las tarjetas fuera
// del borde no entran a la ventana hasta deslizar y, 20 px abajo, desbordarían el contenedor en vertical.
for (const width of [390, 800]) {
  test.describe(`home slices as a side scroller at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, reducedMotion: 'no-preference' })

    test('the cards render as they are and the row never overflows vertically', async ({ page }) => {
      await openHome(page)
      const scroller = slicesRegion(page).getByRole('region', { name: 'Tarjetas de las rebanadas de hoy' })
      await expect(scroller.getByRole('article').first()).toBeAttached()
      await scroller.scrollIntoViewIfNeeded()
      await page.waitForTimeout(600)
      expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
      await expect(scroller.locator(CASCADE)).toHaveCount(0)
      expect(await scroller.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
      for (const card of await scroller.locator('[data-escalonada] > *').all()) expect(await styleNow(card)).toEqual({ opacity: '1', transform: 'none' })
    })
  })
}

test.describe('card hover on a device with a mouse', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })

  test('a feature card lifts 4 px on hover, its cake rises a bit more and everything goes back', async ({ page }) => {
    await openCatalog(page)
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true)
    const card = cakesRegion(page).getByRole('article').first()
    const cake = card.locator('.foto-sobresaliente > :first-child')
    const shadow = card.locator('.foto-sobresaliente > :last-child')
    await card.scrollIntoViewIfNeeded()
    await expect(card).toHaveCSS('transform', 'none')
    await card.hover()
    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -4)')
    // El pastel sube 4 px más que la tarjeta y crece a 1.02 desde su base; su sombra se angosta y se aclara.
    await expect(cake).toHaveCSS('transform', 'matrix(1.02, 0, 0, 1.02, 0, -4)')
    const origin = await cake.evaluate((element: HTMLElement) => ({ y: parseFloat(getComputedStyle(element).transformOrigin.split(' ')[1]), height: element.offsetHeight }))
    expect(origin.y).toBeCloseTo(origin.height, 0)
    await expect(shadow).toHaveCSS('transform', 'matrix(0.9, 0, 0, 1, 0, 0)')
    await expect(shadow).toHaveCSS('opacity', '0.7')
    // El puntero en los 4 px que la tarjeta dejó libres abajo la sigue teniendo encima: no sube y baja.
    const box = (await card.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 2)
    await page.waitForTimeout(300)
    expect((await styleNow(card)).transform).toBe('matrix(1, 0, 0, 1, 0, -4)')
    await page.mouse.move(5, 5)
    await expect(card).toHaveCSS('transform', 'none')
    await expect(cake).toHaveCSS('transform', 'none')
    await expect(shadow).toHaveCSS('opacity', '1')
  })

  test('a compact card lifts 4 px on hover', async ({ page }) => {
    await openCatalog(page)
    const card = dessertsRegion(page).getByRole('article').first()
    await card.scrollIntoViewIfNeeded()
    await expect(dessertsRegion(page).locator(CASCADE)).toHaveCount(0)
    await card.hover()
    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -4)')
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
    expect((await styleNow(card.locator('.foto-sobresaliente > :first-child'))).transform).toBe('none')
  })
})
