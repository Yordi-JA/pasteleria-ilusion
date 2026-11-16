import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { serverError } from './support/catalog.ts'
import type { MockResponse } from './support/catalog.ts'
import { mockStands, standInfo } from './support/stands.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * `/bases`, "Bases en préstamo" (BasesInfo.dc.html, capturas 044 y 045). Las bases, sus kilos, su depósito, el plazo y
 * qué pasa si regresa dañada salen de `GET /api/v1/stands/` (regla 7 y regla 2 de AGENTS.md); aquí se simula.
 */

const LEAD = 'Los pedidos llevan base según los kilos. Dejas un depósito y te lo devolvemos si la regresas en 15 días con tu nota.'

async function openBases(page: Page, responses?: MockResponse[]) {
  await mockStoreInfo(page)
  const requests = await mockStands(page, responses)
  await page.goto('/bases')
  return requests
}

const main = (page: Page) => page.locator('main')
const region = (page: Page, name: string) => main(page).getByRole('region', { name })
const header = (page: Page) => region(page, 'Bases en préstamo')
const steps = (page: Page) => region(page, 'Cómo funciona').getByRole('listitem')
const deposits = (page: Page) => region(page, 'Depósito según los kilos').getByRole('listitem')
const conditions = (page: Page) => region(page, 'Condiciones del préstamo')
/** El valor de una condición: el `dd` que sigue a su `dt`. */
const condition = (page: Page, term: string) => conditions(page).locator('dt', { hasText: term }).locator('xpath=following-sibling::dd[1]')

test.describe('bases at 1440px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('shows the header, the three steps, the stands by kilos and the conditions', async ({ page }) => {
    await openBases(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bases en préstamo')
    await expect(page).toHaveTitle('Bases en préstamo · Pastelería Ilusión')
    await expect(header(page).getByRole('navigation', { name: 'Ruta' }).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/')
    await expect(header(page)).toContainText(LEAD)

    await expect(steps(page)).toHaveCount(3)
    await expect(steps(page).nth(0)).toContainText('Se cobra con tu pedido')
    await expect(steps(page).nth(0)).toContainText('Junto con el anticipo, y queda retenido.')
    await expect(steps(page).nth(1)).toContainText('Devuelves la base')
    await expect(steps(page).nth(1)).toContainText('Hasta 15 días después de la entrega, con tu nota.')
    await expect(steps(page).nth(2)).toContainText('Te devolvemos el importe')
    await expect(steps(page).nth(2)).toContainText('Al regresar la base y presentar tu nota.')

    await expect(deposits(page).getByRole('heading', { level: 3 })).toHaveText([
      'Base para 4 a 5 kg',
      'Base para 6 a 8 kg',
      'Base para 10 a 12 kg',
      'Base para 15 kg',
      'Base para 20 a 25 kg',
      'Más de 25 kg (hasta 50 kg)',
    ])
    await expect(deposits(page)).toContainText([
      'Depósito $70',
      'Depósito $90',
      'Depósito $150',
      'Depósito $200',
      'Depósito $250',
      'Depósito de $300 a $500',
    ])
    await expect(deposits(page).nth(4)).toContainText('Madera forrada en aluminio')
    await expect(deposits(page).nth(0)).not.toContainText('Madera')

    await expect(condition(page, 'Plazo para devolverla')).toHaveText('15 días después de entregado el pedido')
    await expect(condition(page, 'Cuándo se libera el depósito')).toHaveText('Al regresar la base y presentar tu nota (el PDF de tu pedido).')
    await expect(condition(page, 'Pedidos que llevan base')).toHaveText('Desde 4 kg.')
    // Sin 3D en esta vista.
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('the stands keep the order of the API and show only what it sends', async ({ page }) => {
    const twoStands = { ...standInfo, stands: [standInfo.stands[1], standInfo.stands[3]], beyond: null }
    await openBases(page, [{ status: 200, body: twoStands }])
    await expect(deposits(page).getByRole('heading', { level: 3 })).toHaveText(['Base para 6 a 8 kg', 'Base para 15 kg'])
    await expect(main(page)).not.toContainText('Base para 4 a 5 kg')
  })

  test('the damaged-stand condition is a visible pending marker while the bakery has not defined it', async ({ page }) => {
    await openBases(page)
    const damaged = condition(page, 'Si regresa dañada')
    await expect(damaged).toHaveText('[Condiciones por confirmar]')
    await expect(damaged.locator('[data-pendiente]')).toHaveCount(1)
  })

  test('the damaged-stand condition shows the text the bakery wrote', async ({ page }) => {
    await openBases(page, [{ status: 200, body: { ...standInfo, damaged_policy: 'Se descuenta la reparación.' } }])
    const damaged = condition(page, 'Si regresa dañada')
    await expect(damaged).toHaveText('Se descuenta la reparación.')
    await expect(damaged.locator('[data-pendiente]')).toHaveCount(0)
  })

  test('the return days and the starting kilos come from the API', async ({ page }) => {
    await openBases(page, [{ status: 200, body: { ...standInfo, return_days: 20, from_kg: 5 } }])
    await expect(header(page)).toContainText('si la regresas en 20 días con tu nota.')
    await expect(steps(page).nth(1)).toContainText('Hasta 20 días después de la entrega, con tu nota.')
    await expect(condition(page, 'Plazo para devolverla')).toHaveText('20 días después de entregado el pedido')
    await expect(condition(page, 'Pedidos que llevan base')).toHaveText('Desde 5 kg.')
    await expect(main(page)).not.toContainText('15 días')
  })

  test('one return day is said in singular', async ({ page }) => {
    await openBases(page, [{ status: 200, body: { ...standInfo, return_days: 1 } }])
    await expect(header(page)).toContainText('si la regresas en 1 día con tu nota.')
    await expect(condition(page, 'Plazo para devolverla')).toHaveText('1 día después de entregado el pedido')
  })

  test('without stands the card says so honestly and the starting kilos are a pending marker', async ({ page }) => {
    await openBases(page, [{ status: 200, body: { ...standInfo, stands: [], from_kg: null, beyond: null } }])
    const card = region(page, 'Depósito según los kilos')
    await expect(card).toContainText('Por ahora no tenemos bases para préstamo. Escríbenos por WhatsApp.')
    await expect(deposits(page)).toHaveCount(0)
    await expect(condition(page, 'Pedidos que llevan base').locator('[data-pendiente]')).toHaveCount(1)
  })

  test('the deposits past the largest stand come from the API', async ({ page }) => {
    await openBases(page, [{ status: 200, body: { ...standInfo, beyond: { from_kg: 26, to_kg: 35, min_deposit: '300.00', max_deposit: '350.50' } } }])
    const last = deposits(page).last()
    await expect(last.getByRole('heading', { level: 3 })).toHaveText('Más de 25 kg (hasta 35 kg)')
    await expect(last).toContainText('Depósito de $300 a $350.50')
  })

  test('without deposits past the largest stand there is no extra row', async ({ page }) => {
    await openBases(page, [{ status: 200, body: { ...standInfo, beyond: null } }])
    await expect(deposits(page)).toHaveCount(5)
    await expect(main(page)).not.toContainText('Más de')
  })

  test('a single deposit past the largest stand is said once', async ({ page }) => {
    await openBases(page, [{ status: 200, body: { ...standInfo, beyond: { from_kg: 26, to_kg: 30, min_deposit: '300.00', max_deposit: '300.00' } } }])
    await expect(deposits(page).last()).toContainText('Depósito $300')
    await expect(deposits(page).last()).not.toContainText(' a $')
  })

  test('return days of 0 are a pending marker, not an error', async ({ page }) => {
    await openBases(page, [{ status: 200, body: { ...standInfo, return_days: 0 } }])
    await expect(main(page).getByRole('alert')).toHaveCount(0)
    await expect(deposits(page)).toHaveCount(6)
    await expect(header(page)).toContainText('si la regresas en [días por confirmar] con tu nota.')
    await expect(steps(page).nth(1)).toContainText('Hasta [días por confirmar] después de la entrega, con tu nota.')
    await expect(condition(page, 'Plazo para devolverla')).toHaveText('[días por confirmar] después de entregado el pedido')
  })

  test('long return days and a stand from 0 kg are shown as they come', async ({ page }) => {
    const stands = [{ min_kg: 0, max_kg: 5, deposit: '70.00', description: '' }, ...standInfo.stands.slice(1)]
    await openBases(page, [{ status: 200, body: { ...standInfo, stands, return_days: 1200 } }])
    await expect(condition(page, 'Plazo para devolverla')).toHaveText('1200 días después de entregado el pedido')
    await expect(deposits(page).first().getByRole('heading', { level: 3 })).toHaveText('Base para 0 a 5 kg')
  })

  test('"¿Tu pedido necesita base?" leads to /pedido', async ({ page }) => {
    await openBases(page)
    const cta = region(page, '¿Tu pedido necesita base?')
    await expect(cta).toContainText('Tu depósito se calcula según los kilos de tu pastel.')
    const link = cta.getByRole('link', { name: 'Realizar pedido' })
    await expect(link).toHaveAttribute('href', '/pedido')
    await link.click()
    await expect(page).toHaveURL(/\/pedido$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Realizar pedido')
  })

  test('the "Bases en préstamo" link of the footer leads here', async ({ page }) => {
    await mockStoreInfo(page)
    await mockStands(page)
    await page.goto('/legal')
    await page.getByRole('contentinfo').getByRole('link', { name: 'Bases en préstamo' }).click()
    await expect(page).toHaveURL(/\/bases$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bases en préstamo')
    await expect(deposits(page)).toHaveCount(6)
  })

  test('the keyboard reaches the breadcrumb and the order button, with a visible focus', async ({ page }) => {
    await openBases(page)
    await expect(deposits(page)).toHaveCount(6)
    const home = header(page).getByRole('link', { name: 'Inicio' })
    await home.focus()
    await expect(home).toHaveCSS('outline-style', 'solid')
    const cta = region(page, '¿Tu pedido necesita base?').getByRole('link', { name: 'Realizar pedido' })
    // Desde las migas, Tab recorre la página hasta el botón sin otras paradas: el contenido no tiene controles.
    await page.keyboard.press('Tab')
    await expect(cta).toBeFocused()
    await expect(cta).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/pedido$/)
  })

  test('the steps sit in a row, the drawing is beside the title and the button beside its text', async ({ page }) => {
    await openBases(page)
    await expect(steps(page)).toHaveCount(3)
    const tops = await steps(page).evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
    await expect(header(page).locator('svg[aria-hidden="true"]')).toBeVisible()
    const cta = region(page, '¿Tu pedido necesita base?')
    const heading = (await cta.getByRole('heading').boundingBox())!
    const button = (await cta.getByRole('link', { name: 'Realizar pedido' }).boundingBox())!
    expect(button.x).toBeGreaterThan(heading.x + heading.width)
  })

  test('while loading: the title stays and the skeleton is busy and says what is loading', async ({ page }) => {
    await openBases(page, ['hang'])
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bases en préstamo')
    await expect(main(page).locator('[aria-busy="true"]')).toBeVisible()
    await expect(main(page).getByRole('status').filter({ hasText: 'Cargando las bases…' })).toBeAttached()
  })

  test('a failed load shows the error; the retry keeps the focus on the title and brings the stands', async ({ page }) => {
    await mockStoreInfo(page)
    let fail = true
    await page.route(
      (url) => url.pathname === '/api/v1/stands/',
      (route) => {
        const response = fail ? serverError : { status: 200, body: standInfo }
        return route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
      },
    )
    await page.goto('/bases')
    const alert = main(page).getByRole('alert')
    await expect(alert).toContainText('No se pudieron cargar las bases')
    await expect(deposits(page)).toHaveCount(0)
    fail = false
    await alert.getByRole('button', { name: 'Volver a intentar' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(deposits(page)).toHaveCount(6)
    await expect(main(page).getByRole('alert')).toHaveCount(0)
  })

  test('a response with another shape is an error, never an empty list', async ({ page }) => {
    await openBases(page, [{ status: 200, body: { stands: 'nada' } }])
    await expect(main(page).getByRole('alert')).toContainText('No se pudieron cargar las bases')
  })
})

test.describe('bases at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the steps stack, the drawing hides and the page does not scroll sideways', async ({ page }) => {
    await openBases(page)
    await expect(deposits(page)).toHaveCount(6)
    const tops = await steps(page).evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)))
    expect(tops[1]).toBeGreaterThan(tops[0])
    expect(tops[2]).toBeGreaterThan(tops[1])
    await expect(header(page).locator('svg[aria-hidden="true"]')).toBeHidden()
    await expect(region(page, '¿Tu pedido necesita base?').getByRole('link', { name: 'Realizar pedido' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
