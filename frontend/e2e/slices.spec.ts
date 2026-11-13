import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCatalog, serverError, SLICES_PATH, sliceItems, stockItem, todayStock } from './support/catalog.ts'
import type { MockResponse } from './support/catalog.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * `/rebanadas` (Rebanadas.dc.html). Casi siempre hay rebanadas de un solo pastel (regla 2, D60): la pantalla se ve bien
 * con una, con varias y con ninguna. La API se simula con `support/catalog.ts`.
 */

const KEY = 'ilusion.cart.v1'

/** Lo de casi todos los días: el rebanado es Tres leches de durazno, con sus 10 rebanadas. */
const durazno = stockItem(2, 'tres-leches-de-durazno', 'Tres leches de durazno', 'cake', 'slice', '35.00', { stock: 10 })

async function openSlices(page: Page, slices: MockResponse[] = [todayStock([durazno])]) {
  await mockStoreInfo(page)
  await mockCatalog(page, { slices })
  await page.goto('/rebanadas')
}

const main = (page: Page) => page.locator('main')
const names = (page: Page) => main(page).getByRole('article').getByRole('heading', { level: 2 })
const card = (page: Page, name: string) => main(page).getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) })
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY)

test.describe('rebanadas at 1440px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('with one flavor: a wide card with its counter, and "¿Lo quieres completo?" beside it', async ({ page }) => {
    await openSlices(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rebanadas de hoy')
    await expect(page).toHaveTitle('Rebanadas de hoy · Pastelería Ilusión')
    await expect(main(page)).toContainText('Viernes 6 de noviembre. Disponibles hasta agotar existencias.')
    await expect(names(page)).toHaveText(['Tres leches de durazno'])
    const slice = card(page, 'Tres leches de durazno')
    await expect(slice).toContainText('$35 la rebanada')
    await expect(slice).toContainText('Quedan 10')
    await expect(slice.getByRole('group', { name: 'Cantidad de Rebanada de tres leches de durazno' })).toBeVisible()
    // Sin el hueco de tres columnas vacías: la tarjeta ocupa el ancho y a su lado va el encargo del completo.
    expect((await slice.boundingBox())!.width).toBeGreaterThan(600)
    const whole = page.getByRole('complementary', { name: '¿Lo quieres completo?' })
    await expect(whole).toContainText('Encarga Tres leches de durazno completo y elige la fecha al terminar tu pedido.')
    await expect(whole.getByRole('link', { name: 'Encargarlo completo: Tres leches de durazno' })).toHaveAttribute('href', '/pasteles/tres-leches-de-durazno')
    const [cardBox, wholeBox] = [(await slice.boundingBox())!, (await whole.boundingBox())!]
    expect(Math.round(wholeBox.y)).toBe(Math.round(cardBox.y))
  })

  test('with several flavors: the grid of the mockup, the sold-out one last and disabled', async ({ page }) => {
    await openSlices(page, [todayStock(sliceItems)])
    await expect(names(page)).toHaveText(['Tres leches de durazno', 'Tres leches con flan y cajeta', 'Posible', 'Imposible'])
    await expect(card(page, 'Tres leches con flan y cajeta')).toContainText('Queda 1')
    const imposible = card(page, 'Imposible')
    await expect(imposible).toContainText('Agotada por hoy')
    await expect(imposible.getByRole('button', { name: 'Agotada' })).toBeDisabled()
    await expect(imposible.getByRole('group')).toHaveCount(0)
    await expect(page.getByRole('complementary', { name: '¿Lo quieres completo?' })).toHaveCount(0)
    // Cuatro en una fila.
    const tops = await main(page).getByRole('article').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
  })

  test('the counter is capped at what is left and adds that many as a showcase line', async ({ page }) => {
    await openSlices(page, [todayStock(sliceItems)])
    const slice = card(page, 'Tres leches de durazno')
    const more = slice.getByRole('button', { name: 'Agregar uno de Rebanada de tres leches de durazno' })
    await more.click()
    await expect(slice.getByRole('group', { name: 'Cantidad de Rebanada de tres leches de durazno' })).toContainText('2')
    await expect(more).toBeDisabled()
    await slice.getByRole('button', { name: 'Agregar al pedido: Rebanada de tres leches de durazno' }).click()
    const notice = main(page).getByTestId('aviso-carrito')
    await expect(notice).toContainText('Agregado al pedido')
    await expect(notice).toContainText('Rebanada de tres leches de durazno. Tienes 2 en tu pedido.')
    await slice.getByRole('button', { name: 'Agregar al pedido: Rebanada de tres leches de durazno' }).click()
    await expect(notice).toContainText('Ya tienes los 2 que quedan')
    expect(await stored(page)).toEqual({
      items: [expect.objectContaining({ offeringId: 2, quantity: 2, fulfillment: 'showcase', presentation: 'slice', unitPrice: '35.00' })],
    })
  })

  test('with none: it says so, with the vitrina and an order as the way out', async ({ page }) => {
    await openSlices(page, [todayStock([])])
    await expect(page.getByRole('heading', { level: 2, name: 'Hoy no hay rebanadas' })).toBeVisible()
    await expect(main(page)).toContainText('Mira lo que hay en la vitrina, o haz un pedido con 2 días de anticipación.')
    await expect(main(page).getByRole('link', { name: 'Ver la vitrina' })).toHaveAttribute('href', '/vitrina')
    await expect(main(page).getByRole('link', { name: 'Realizar pedido' })).toHaveAttribute('href', '/pedido')
    await expect(main(page).getByRole('article')).toHaveCount(0)
  })

  test('the only slice sold out keeps its wide card, disabled', async ({ page }) => {
    await openSlices(page, [todayStock([{ ...durazno, stock: 0, sold_out: true }])])
    const slice = card(page, 'Tres leches de durazno')
    await expect(slice).toContainText('Agotada por hoy')
    await expect(slice.getByRole('button', { name: 'Agotada' })).toBeDisabled()
  })

  test('while loading: the header stays and the skeleton is busy and says what is loading', async ({ page }) => {
    await openSlices(page, ['hang'])
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rebanadas de hoy')
    await expect(main(page).locator('[aria-busy="true"]')).toBeVisible()
    await expect(main(page).getByRole('status').filter({ hasText: 'Cargando las rebanadas de hoy…' })).toBeAttached()
  })

  test('a failed load shows the error; the retry keeps the focus on the title and brings the slices', async ({ page }) => {
    await mockStoreInfo(page)
    await mockCatalog(page)
    let fail = true
    await page.route(
      (url) => url.pathname === SLICES_PATH,
      (route) => {
        const response = fail ? serverError : { status: 200, body: { date: '2026-11-06', items: sliceItems } }
        return route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
      },
    )
    await page.goto('/rebanadas')
    const alert = main(page).getByRole('alert')
    await expect(alert).toContainText('No se pudieron cargar las rebanadas de hoy')
    fail = false
    await alert.getByRole('button', { name: 'Volver a intentar' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(names(page)).toHaveCount(4)
  })
})

test.describe('rebanadas at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('several flavors in two columns without horizontal overflow', async ({ page }) => {
    await openSlices(page, [todayStock(sliceItems)])
    await expect(names(page)).toHaveCount(4)
    const overflow = await page.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const tops = await main(page).getByRole('article').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    expect(tops[0]).toBe(tops[1])
    expect(tops[2]).toBeGreaterThan(tops[1])
    for (const control of await main(page).getByRole('button').all()) {
      if (await control.isVisible()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('one flavor stacks the card and "¿Lo quieres completo?" without overflow', async ({ page }) => {
    await openSlices(page)
    const slice = card(page, 'Tres leches de durazno')
    const whole = page.getByRole('complementary', { name: '¿Lo quieres completo?' })
    await expect(whole).toBeVisible()
    expect((await whole.boundingBox())!.y).toBeGreaterThan((await slice.boundingBox())!.y + 100)
    const overflow = await page.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('rebanadas notice at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('adding from the last card keeps the notice on screen', async ({ page }) => {
    await openSlices(page, [todayStock(sliceItems)])
    const add = card(page, 'Posible').getByRole('button', { name: 'Agregar al pedido: Rebanada de posible' })
    await add.scrollIntoViewIfNeeded()
    await add.click()
    const notice = main(page).getByTestId('aviso-carrito')
    await expect(notice).toContainText('Agregado al pedido')
    await expect(notice).toBeInViewport()
  })
})
