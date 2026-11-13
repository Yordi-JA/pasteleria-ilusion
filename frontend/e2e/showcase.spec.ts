import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCatalog, serverError, SHOWCASE_PATH, showcaseItems, stockItem, todayStock } from './support/catalog.ts'
import type { MockResponse } from './support/catalog.ts'
import { expectRequestCountStays, mockStoreInfo } from './support/store-info.ts'

/**
 * `/vitrina` (Vitrina.dc.html, VitrinaAgotada, VitrinaCargando) y el rebanado (D60). La API se simula con
 * `support/catalog.ts`. Escritorio salvo donde se dice.
 */

const KEY = 'ilusion.cart.v1'

/** El rebanado: Tres leches de fresa, con 6 rebanadas hoy y sin fila del completo. */
const rebanado = stockItem(5, 'tres-leches-de-fresa', 'Tres leches de fresa', 'cake', 'slice', '35.00', { stock: 6, sliced: true })
/** La vitrina de hoy: la de la portada con `sliced` y el rebanado en su lugar, en el orden del catálogo. */
const vitrina = [...showcaseItems.slice(0, 2), rebanado, ...showcaseItems.slice(2)].map((item) => ({ sliced: false, ...item }))

async function openShowcase(page: Page, showcase: MockResponse[] = [todayStock(vitrina)]) {
  await mockStoreInfo(page)
  const requests = await mockCatalog(page, { showcase })
  await page.goto('/vitrina')
  return requests.showcase
}

const main = (page: Page) => page.locator('main')
const names = (page: Page) => main(page).getByRole('article').getByRole('heading', { level: 2 })
const card = (page: Page, name: string) => main(page).getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) })
const chip = (page: Page, name: string) => main(page).locator('label').filter({ hasText: name })
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY)

test.describe('vitrina at 1440px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('shows today with the date, the chips and every item, the sold-out one last', async ({ page }) => {
    await openShowcase(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vitrina')
    await expect(page).toHaveTitle('Vitrina · Pastelería Ilusión')
    await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText('Inicio')
    await expect(main(page)).toContainText('Viernes 6 de noviembre. Lo que hay hoy en la pastelería para llevar.')
    await expect(page.getByRole('group', { name: 'Filtrar la vitrina' }).getByRole('radio', { name: 'Todo' })).toBeChecked()
    await expect(names(page)).toHaveText([
      'Tres leches de durazno',
      'Tres leches con queso y zarzamora',
      'Tres leches de fresa',
      'Choco-pingüino',
      'Mini de tres leches de durazno',
      'Flan napolitano',
      'Tarta de frutas',
      'Gelatina de molde',
      'Vaso de gelatina de mosaico',
      'Tres leches de cajeta',
      'Imposible',
    ])
    await expect(card(page, 'Tres leches de durazno')).toContainText('$350')
    await expect(card(page, 'Tres leches de durazno')).toContainText('Quedan 2')
    await expect(card(page, 'Tres leches con queso y zarzamora')).toContainText('Queda 1')
    const imposible = card(page, 'Imposible')
    await expect(imposible).toContainText('Agotada por hoy')
    await expect(imposible.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2, name: '¿No está lo que buscas?' })).toBeVisible()
    await expect(main(page).getByRole('link', { name: 'Ver el catálogo' })).toHaveAttribute('href', '/catalogo')
  })

  test('the sliced cake says "Rebanado", is not added whole, and leads to its slices and to ordering it whole', async ({ page }) => {
    await openShowcase(page)
    const fresa = card(page, 'Tres leches de fresa')
    await expect(fresa).toContainText('Rebanado')
    await expect(fresa).toContainText('$35 la rebanada')
    await expect(fresa).toContainText('Quedan 6')
    await expect(fresa.getByRole('button')).toHaveCount(0)
    await expect(fresa.getByRole('link', { name: 'Ver las rebanadas: Tres leches de fresa' })).toHaveAttribute('href', '/rebanadas')
    await expect(fresa.getByRole('link', { name: 'Encargarlo completo: Tres leches de fresa' })).toHaveAttribute('href', '/pasteles/tres-leches-de-fresa')
    // La foto es la del pastel completo, no la de la rebanada.
    await expect(fresa.getByRole('img', { name: 'Foto del pastel pendiente' })).toBeVisible()
  })

  test('"Agregar al pedido" adds one piece as a showcase line, capped at what is left today', async ({ page }) => {
    await openShowcase(page)
    const add = main(page).getByRole('button', { name: 'Agregar al pedido: Tres leches con queso y zarzamora', exact: true })
    await add.click()
    const notice = main(page).getByTestId('aviso-carrito')
    await expect(notice).toContainText('Agregado al pedido')
    await expect(notice).toContainText('Tres leches con queso y zarzamora. Tienes 1 en tu pedido.')
    await add.click()
    await expect(notice).toContainText('Ya tienes el único que queda')
    expect(await stored(page)).toEqual({
      items: [expect.objectContaining({ offeringId: 10, quantity: 1, fulfillment: 'showcase', presentation: 'whole', unitPrice: '420.00' })],
    })
  })

  test('the chips filter in the browser without a new request, and a chip with nothing says so', async ({ page }) => {
    const requests = await openShowcase(page)
    await expect(names(page)).toHaveCount(11)
    const before = requests.length
    await chip(page, 'Postres').click()
    await expect(names(page)).toHaveText(['Flan napolitano', 'Tarta de frutas', 'Gelatina de molde', 'Vaso de gelatina de mosaico', 'Imposible'])
    await chip(page, 'Pasteles').click()
    await expect(names(page)).toContainText(['Tres leches de fresa'])
    await expectRequestCountStays(requests, before)

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await openShowcase(page, [todayStock([rebanado])])
    await chip(page, 'Postres').click()
    await expect(main(page)).toContainText('Hoy no hay postres en la vitrina.')
  })

  test('everything sold out, the sliced cake too, shows the sold-out state with its two exits', async ({ page }) => {
    const soldOut = vitrina.map((item) => ({ ...item, stock: 0, sold_out: true }))
    await openShowcase(page, [todayStock(soldOut)])
    await expect(page.getByRole('heading', { level: 2, name: 'Por hoy se vendió todo lo de la vitrina' })).toBeVisible()
    await expect(main(page)).toContainText('Puedes hacer un pedido con 2 días de anticipación, o ver si quedan rebanadas de hoy.')
    await expect(main(page).getByRole('link', { name: 'Realizar pedido' }).first()).toHaveAttribute('href', '/pedido')
    await expect(main(page).getByRole('link', { name: 'Ver rebanadas de hoy' })).toHaveAttribute('href', '/rebanadas')
    await expect(page.getByRole('group', { name: 'Filtrar la vitrina' })).toHaveCount(0)
    await expect(main(page).getByRole('article')).toHaveCount(0)
  })

  test('the sliced cake with no slices left is sold out, last and without its links', async ({ page }) => {
    const items = vitrina.map((item) => (item.offering_id === rebanado.offering_id ? { ...item, stock: 0, sold_out: true } : item))
    await openShowcase(page, [todayStock(items)])
    // Lo agotado al final, en el orden del catálogo: el rebanado y después el Imposible.
    await expect(names(page)).toHaveText([...Array(9).fill(/.+/), 'Tres leches de fresa', 'Imposible'])
    const fresa = card(page, 'Tres leches de fresa')
    await expect(fresa).toContainText('Agotada por hoy')
    await expect(fresa).not.toContainText('Rebanado')
    await expect(fresa.getByRole('link')).toHaveCount(0)
  })

  test('only the sliced cake today: the vitrina is not empty and shows it', async ({ page }) => {
    await openShowcase(page, [todayStock([rebanado])])
    await expect(names(page)).toHaveText(['Tres leches de fresa'])
    await expect(card(page, 'Tres leches de fresa')).toContainText('Rebanado')
  })

  test('with nothing loaded today it says so, with "Realizar pedido"', async ({ page }) => {
    await openShowcase(page, [todayStock([])])
    await expect(page.getByRole('heading', { level: 2, name: 'Por ahora no hay nada en la vitrina' })).toBeVisible()
    await expect(main(page)).toContainText('Puedes hacer un pedido con 2 días de anticipación.')
    await expect(main(page).getByRole('link', { name: 'Realizar pedido' }).first()).toHaveAttribute('href', '/pedido')
  })

  test('while loading: the header stays, the skeleton is busy and says what is loading', async ({ page }) => {
    await openShowcase(page, ['hang'])
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vitrina')
    await expect(main(page).locator('[aria-busy="true"]')).toBeVisible()
    await expect(main(page).getByRole('status').filter({ hasText: 'Cargando la vitrina…' })).toBeAttached()
    await expect(page.getByRole('heading', { name: '¿No está lo que buscas?' })).toHaveCount(0)
  })

  test('a failed load shows the error; the retry keeps the focus on the title and brings the items', async ({ page }) => {
    await mockStoreInfo(page)
    await mockCatalog(page)
    // Un interruptor y no una secuencia: en desarrollo, StrictMode pide dos veces.
    let fail = true
    await page.route(
      (url) => url.pathname === SHOWCASE_PATH,
      (route) => {
        const response = fail ? serverError : { status: 200, body: { date: '2026-11-06', items: vitrina } }
        return route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
      },
    )
    await page.goto('/vitrina')
    const alert = main(page).getByRole('alert')
    await expect(alert).toContainText('No se pudo cargar la vitrina')
    fail = false
    await alert.getByRole('button', { name: 'Volver a intentar' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(names(page)).toHaveCount(11)
  })

  test('keyboard: the arrows move between the chips and Tab reaches the first cart button with a visible focus', async ({ page }) => {
    await openShowcase(page)
    await expect(names(page)).toHaveCount(11)
    await page.getByRole('radio', { name: 'Todo' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Pasteles' })).toBeChecked()
    await page.keyboard.press('Tab')
    const first = main(page).getByRole('button', { name: 'Agregar al pedido: Tres leches de durazno', exact: true })
    await expect(first).toBeFocused()
    await expect(first).toHaveCSS('outline-style', 'solid')
  })
})

test.describe('vitrina at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('two columns, no horizontal overflow, no header drawing and 44 px targets', async ({ page }) => {
    await openShowcase(page)
    await expect(names(page)).toHaveCount(11)
    const overflow = await page.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const tops = await main(page).getByRole('article').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    expect(tops[0]).toBe(tops[1])
    expect(tops[2]).toBeGreaterThan(tops[1])
    await expect(main(page).locator('section svg[aria-hidden="true"]').first()).toBeHidden()
    for (const control of await main(page).getByRole('button').all()) {
      if (await control.isVisible()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    for (const link of await card(page, 'Tres leches de fresa').getByRole('link').all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('vitrina, notice and row heights', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('adding from a low shelf keeps the notice on screen, under the bar', async ({ page }) => {
    await openShowcase(page)
    const last = main(page).getByRole('button', { name: 'Agregar al pedido: Tres leches de cajeta', exact: true })
    await last.scrollIntoViewIfNeeded()
    await last.click()
    const notice = main(page).getByTestId('aviso-carrito')
    await expect(notice).toContainText('Agregado al pedido')
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(notice).toBeInViewport()
  })

  test('the cards of a row are as tall as the sliced one, so the row has no gaps', async ({ page }) => {
    await openShowcase(page)
    await expect(names(page)).toHaveCount(11)
    // La tarjeta del precio es el último hijo de cada partida; la primera fila son las cuatro primeras.
    const heights = await main(page).getByRole('article').evaluateAll((els) =>
      els.slice(0, 4).map((el) => Math.round((el.lastElementChild as HTMLElement).getBoundingClientRect().height)),
    )
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
  })
})

test.describe('vitrina notice at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the fixed notice never covers what the keyboard focuses, and "Cerrar" takes it away', async ({ page }) => {
    await openShowcase(page)
    const last = main(page).getByRole('button', { name: 'Agregar al pedido: Tres leches de cajeta', exact: true })
    await last.scrollIntoViewIfNeeded()
    await last.click()
    const notice = main(page).getByTestId('aviso-carrito')
    await expect(notice).toContainText('Agregado al pedido')
    // Hacia arriba con el teclado, tarjeta por tarjeta: lo enfocado queda debajo del aviso fijo y de la barra.
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Shift+Tab')
      const focused = await page.evaluate(() => document.activeElement!.getBoundingClientRect().top)
      const noticeBottom = (await notice.boundingBox())!.y + (await notice.boundingBox())!.height
      expect(focused).toBeGreaterThanOrEqual(noticeBottom - 1)
    }
    const close = notice.getByRole('button', { name: 'Cerrar el aviso' })
    await close.focus()
    await expect(close).toHaveCSS('outline-style', 'solid')
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await close.click()
    await expect(notice).toBeEmpty()
    await expect(notice).toHaveAttribute('role', 'status')
  })
})
