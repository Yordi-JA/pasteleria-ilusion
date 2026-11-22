import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mockCatalog } from './support/catalog.ts'
import { cakeDesignOptions, COVERAGE_HEX, mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { durazno, seedCart } from './support/checkout.ts'
import { fullStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * La perla de duya que vuela del botón "Agregar al pedido" al carrito del encabezado. El carrito se actualiza al instante;
 * el número del encabezado espera a que llegue la perla. Para no depender de tiempos, las pruebas pausan las animaciones
 * y las terminan a mano (`finish()`), que dispara el mismo evento de fin que el vuelo real.
 */

test.use({ viewport: { width: 1440, height: 900 } })

const DRAFT_TO_STEP_8 = {
  people: 105, form: 'round', tiers: 2, cakeType: 'tres_leches', bread: 'chocolate', fillingBase: 'queso',
  flavorCount: 1, flavors: ['zarzamora'], coverageColor: COVERAGE_HEX.lila, decoration: 'ninguna', confirmed: [1, 2, 3, 4, 5, 6, 7],
}

const pearls = (page: Page) => page.getByTestId('perla-carrito')
const counter = (page: Page) => page.getByRole('banner').getByTestId('contador-carrito')
const cartLink = (page: Page) => page.getByRole('banner').getByRole('link', { name: /^Carrito/ })
const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const featured = (page: Page) => region(page, 'Pasteles de la casa')
const slices = (page: Page) => region(page, 'Rebanadas de hoy')
const notice = (section: Locator) => section.getByTestId('aviso-carrito')
const addTo = (section: Locator, name: string) => section.getByRole('button', { name: `Agregar al pedido: ${name}`, exact: true })

/**
 * Cuenta los saltos del contador (tanda 7, D90): cada llegada vuelve a montar el contador con la animación `header-contador`, así
 * que se cuentan los contadores nuevos que nacen con ella. También cuenta si algo anima el ícono entero, que ya no rebota.
 */
async function countBounces(page: Page) {
  await page.evaluate(() => {
    const win = window as unknown as { bounces: number; iconBounces: number }
    win.bounces = 0
    win.iconBounces = 0
    const link = document.querySelector('header a[href="/carrito"]') as HTMLAnchorElement
    const original = link.animate.bind(link)
    link.animate = (...args: Parameters<typeof link.animate>) => {
      win.iconBounces++
      return original(...args)
    }
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.dataset.testid === 'contador-carrito' && getComputedStyle(node).animationName === 'header-contador') win.bounces++
        }
      }
    }).observe(link, { childList: true })
  })
  return () => page.evaluate(() => (window as unknown as { bounces: number }).bounces)
}

async function openHome(page: Page, hold = true) {
  if (hold) await holdPearls(page)
  await mockStoreInfo(page, fullStoreInfo)
  await mockCatalog(page)
  await page.goto('/')
}

async function openReview(page: Page, hold = true) {
  if (hold) await holdPearls(page)
  await mockStoreInfo(page)
  await page.addInitScript((value) => sessionStorage.setItem('ilusion.cakeDesign.v1', value), JSON.stringify(DRAFT_TO_STEP_8))
  await mockCakeDesignOptions(page, { status: 200, body: cakeDesignOptions })
  await mockCakeDesignPrice(page, cakeDesignOptions)
  await page.goto('/pedido/disena?paso=8')
  await expect(page.getByTestId('desglose')).toBeVisible()
}

const designButton = (page: Page) => page.getByTestId('tarjeta-paso').getByRole('button', { name: 'Agregar al pedido' })

/**
 * Deja cada perla pausada desde el cuadro en que nace, antes de que pueda avanzar: con la máquina lenta, congelarla
 * después de verla llegaba tarde. Va antes de abrir la página.
 */
const holdPearls = (page: Page) =>
  page.addInitScript(() => {
    const original = Element.prototype.animate
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      const animation = original.apply(this, args)
      if (this.getAttribute('data-testid') === 'perla-carrito') animation.pause()
      return animation
    }
  })

/** Termina el vuelo de la primera perla que sigue en el aire; la animación avisa su fin como lo haría sola. */
const land = (page: Page) =>
  page.evaluate(() => {
    const flying = document.getAnimations().find((animation) => (animation.effect as KeyframeEffect | null)?.target?.getAttribute('data-testid') === 'perla-carrito')
    flying?.finish()
  })

/**
 * Termina el vuelo de todas las perlas en el aire. Solo las perlas: la página tiene animaciones infinitas (la galería,
 * el brillo de los esqueletos) y `finish()` lanza un error con ellas.
 */
const landAll = (page: Page) =>
  page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if ((animation.effect as KeyframeEffect | null)?.target?.getAttribute('data-testid') === 'perla-carrito') animation.finish()
    }
  })

async function expectFlightThenLanding(page: Page, button: Locator, notices: Locator, expectedCount: string) {
  await button.click()
  await expect(pearls(page)).toHaveCount(1)
  const pearl = pearls(page)
  await expect(pearl).toHaveAttribute('aria-hidden', 'true')
  await expect(pearl).toHaveCSS('pointer-events', 'none')
  // El aviso ya está, y el carrito ya guardó; el número espera.
  await expect(notices).toContainText('Agregado al pedido')
  await expect(cartLink(page)).toHaveAccessibleName(`Carrito, ${expectedCount} ${expectedCount === '1' ? 'producto' : 'productos'}`)
  await expect(counter(page)).toHaveCount(0)
  await land(page)
  await expect(pearls(page)).toHaveCount(0)
  await expect(counter(page)).toHaveText(expectedCount)
}

test.describe('catalog product', () => {
  test('the pearl flies, the counter waits for it, and the notice is the same', async ({ page }) => {
    await openHome(page)
    await expectFlightThenLanding(page, addTo(featured(page), 'Tres leches de durazno'), notice(featured(page)), '1')
    await expect(notice(featured(page))).toContainText('Tres leches de durazno. Tienes 1 en tu pedido.')
  })

  test('the counter pops once per arrival, and not before; the icon itself stays still', async ({ page }) => {
    await openHome(page)
    const bounces = await countBounces(page)
    await addTo(featured(page), 'Tres leches de durazno').click()
    await expect(pearls(page)).toHaveCount(1)
    expect(await bounces()).toBe(0)
    await land(page)
    await expect(counter(page)).toHaveText('1')
    expect(await bounces()).toBe(1)
    // El salto: escala de 1 a 1.25 y de vuelta a 1 en 300 ms, solo con `transform`.
    await expect(counter(page)).toHaveCSS('animation-name', 'header-contador')
    await expect(counter(page)).toHaveCSS('animation-duration', '0.3s')
    // Otra llegada, otro salto.
    await addTo(featured(page), 'Imposible').click()
    await land(page)
    await expect(counter(page)).toHaveText('2')
    expect(await bounces()).toBe(2)
    expect(await page.evaluate(() => (window as unknown as { iconBounces: number }).iconBounces)).toBe(0)
  })

  test('a counter already there when the page opens does not pop', async ({ page }) => {
    await seedCart(page, [{ ...durazno, quantity: 2 }])
    await openHome(page)
    await expect(counter(page)).toHaveText('2')
    await expect(counter(page)).toBeVisible()
    await expect(counter(page)).toHaveCSS('animation-name', 'none')
  })

  test('with reduced motion nothing flies and the counter changes at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openHome(page)
    const bounces = await countBounces(page)
    await addTo(featured(page), 'Tres leches de durazno').click()
    await expect(counter(page)).toHaveText('1')
    await expect(pearls(page)).toHaveCount(0)
    await expect(notice(featured(page))).toContainText('Agregado al pedido')
    expect(await bounces()).toBe(0)
    await expect(counter(page)).toHaveCSS('animation-name', 'none')
  })

  test('two quick clicks on different products give two pearls and two arrivals', async ({ page }) => {
    await openHome(page)
    await addTo(featured(page), 'Tres leches de durazno').click()
    await addTo(featured(page), 'Imposible').click()
    await expect(pearls(page)).toHaveCount(2)
    await expect(counter(page)).toHaveCount(0)
    await land(page)
    await expect(pearls(page)).toHaveCount(1)
    await expect(counter(page)).toHaveText('1')
    await land(page)
    await expect(pearls(page)).toHaveCount(0)
    await expect(counter(page)).toHaveText('2')
  })

  test('when nothing is added there is no pearl', async ({ page }) => {
    await openHome(page)
    const slice = addTo(slices(page), 'Rebanada de tres leches con flan y cajeta')
    await slice.click()
    await expect(pearls(page)).toHaveCount(1)
    await landAll(page)
    await expect(pearls(page)).toHaveCount(0)
    await expect(counter(page)).toHaveText('1')
    // Solo quedaba 1: el segundo clic no agrega nada.
    await slice.click()
    await expect(notice(slices(page))).toContainText('Ya tienes el único que queda')
    await expect(pearls(page)).toHaveCount(0)
    await expect(counter(page)).toHaveText('1')
  })

  test('leaving the page mid-flight leaves the real count in the header', async ({ page }) => {
    await openHome(page)
    await addTo(featured(page), 'Tres leches de durazno').click()
    await expect(pearls(page)).toHaveCount(1)
    await page.getByRole('banner').getByRole('link', { name: 'Cuenta' }).click()
    await expect(page).toHaveURL(/\/entrar/)
    await expect(counter(page)).toHaveCount(0)
    await landAll(page)
    await expect(pearls(page)).toHaveCount(0)
    await expect(counter(page)).toHaveText('1')
  })
})

test.describe('step 8 of "Diseña tu pastel"', () => {
  test('the pearl flies, the counter waits for it, and the notice is the same', async ({ page }) => {
    await openReview(page)
    await expectFlightThenLanding(page, designButton(page), notice(page.getByTestId('tarjeta-paso')), '1')
    // Un solo renglón: el título ya dice que quedó en el pedido (correcciones del 21 de noviembre).
    await expect(notice(page.getByTestId('tarjeta-paso'))).toHaveText('Agregado al pedido')
  })

  test('with reduced motion nothing flies and the counter changes at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openReview(page)
    await designButton(page).click()
    await expect(counter(page)).toHaveText('1')
    await expect(pearls(page)).toHaveCount(0)
    await expect(notice(page.getByTestId('tarjeta-paso'))).toContainText('Agregado al pedido')
  })

  test('a design that is already in the order does not send a pearl', async ({ page }) => {
    await openReview(page, false)
    await designButton(page).click()
    await expect(counter(page)).toHaveText('1')
    await expect(pearls(page)).toHaveCount(0)
    // Ya en el pedido, el pie ofrece "Ir a mi pedido" en lugar de otro "Agregar al pedido" (correcciones del 21 de noviembre):
    // no hay segundo clic que mande otra perla.
    await expect(designButton(page)).toHaveCount(0)
    await expect(page.getByTestId('tarjeta-paso').getByRole('link', { name: 'Ir a mi pedido' })).toBeVisible()
    await expect(pearls(page)).toHaveCount(0)
    await expect(counter(page)).toHaveText('1')
  })
})
