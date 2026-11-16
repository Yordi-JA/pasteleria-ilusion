import { expect, test } from '@playwright/test'
import { mockAuth, signedIn } from './support/auth.ts'
import { accountOrder, mockNote, mockOrderDetail } from './support/account-orders.ts'
import { NOW } from './support/checkout.ts'
import { mockPayment } from './support/payments.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * `/pedido/confirmacion?pedido=<id>` (D69, frontend; mockup `Confirmacion`): la confirmación se verifica contra el
 * servidor. Pagado: el número, la línea de tiempo, el resumen, la base y la nota. Sin pagar: regresa al pago.
 */

const CONFIRMATION = '/pedido/confirmacion?pedido=57'
const received = () => accountOrder({ status: 'received', status_changed_at: '2026-11-13T18:09:00Z' })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
})

test('without a session it asks to sign in and comes back', async ({ page }) => {
  await mockAuth(page)
  await page.goto(CONFIRMATION)
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fpedido%2Fconfirmacion%3Fpedido%3D57$/)
})

test('a paid order shows its number, timeline, summary, stand and the note', async ({ page }) => {
  await signedIn(page)
  await mockOrderDetail(page, 57, { status: 200, body: received() })
  await mockNote(page, 57)
  await page.goto(CONFIRMATION)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recibimos tu pedido')
  await expect(page.getByRole('navigation', { name: 'Pasos de tu compra' }).locator('[aria-current="step"]')).toContainText('Confirmación')
  await expect(page.getByText('Te enviamos la confirmación a ana@correo.test. Te avisaremos cada vez que cambie de estado.')).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Pedido #57' })).toBeVisible()
  await expect(page.getByText('Hecho el viernes 13 de noviembre a las 12:00')).toBeVisible()
  await expect(page.getByRole('main').getByText('Paso 1 de 4:')).toBeAttached()

  const steps = page.getByRole('list', { name: 'Cómo va tu pedido' }).getByRole('listitem')
  await expect(steps).toHaveCount(4)
  await expect(steps.nth(0)).toHaveText(/Recibido, hecho.*viernes 13 de noviembre, 12:09/)
  await expect(steps.nth(1)).toHaveText(/En preparación, pendiente.*Te avisamos por correo cuando empecemos/)
  await expect(steps.nth(2)).toHaveText(/Listo para recoger, pendiente.*lunes 16 de noviembre a las 3:30 pm, en la pastelería/)
  await expect(steps.nth(3)).toHaveText(/Entregado, pendiente.*Y regresas la base antes del martes 1 de diciembre, con tu nota, para recuperar tu depósito/)

  await expect(page.getByRole('link', { name: 'Ver mi pedido' })).toHaveAttribute('href', '/cuenta/pedidos/57')
  await expect(page.getByRole('main').getByRole('link', { name: 'Seguir comprando' })).toHaveAttribute('href', '/catalogo')

  const summary = page.getByRole('region', { name: 'Resumen' })
  await expect(summary).toContainText('Tres leches de durazno')
  await expect(summary.getByRole('row', { name: /Anticipo pagado \(50%\)/ })).toContainText('$2,087.50')
  await expect(summary.getByRole('row', { name: /Total del pedido/ })).toContainText('$4,175 MXN')
  await expect(summary).toContainText('Depósito por base retenido')
  await expect(summary).toContainText('Te lo devolvemos si regresas la base antes del martes 1 de diciembre con tu nota.')

  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar nota (PDF)' }).click()
  expect((await downloading).suggestedFilename()).toBe('nota-pedido-57.pdf')
})

test('an order that is not paid goes back to the payment', async ({ page }) => {
  await signedIn(page)
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ status: 'awaiting_payment' }) })
  await mockPayment(page)
  await page.goto(CONFIRMATION)
  await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
})

test('an order of someone else or that does not exist shows the error of the payment pattern', async ({ page }) => {
  await signedIn(page)
  await mockOrderDetail(page, 57, { status: 404, body: { detail: 'No encontrado.' } })
  await page.goto(CONFIRMATION)
  await expect(page.getByRole('heading', { name: 'No encontramos tu pedido' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Ver mis pedidos' })).toHaveAttribute('href', '/cuenta')
  await expect(page.getByRole('region', { name: 'Resumen' })).toHaveCount(0)
})

test('without ?pedido= it does not ask the API', async ({ page }) => {
  await signedIn(page)
  const requests = await mockOrderDetail(page, 57)
  await page.goto('/pedido/confirmacion')
  await expect(page.getByRole('heading', { name: 'No encontramos tu pedido' })).toBeVisible()
  expect(requests).toHaveLength(0)
})

test('a load error says so and retries', async ({ page }) => {
  await signedIn(page)
  let fail = true
  await page.route('**/api/v1/orders/57/', async (route) => {
    if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(received()) })
  })
  await page.goto(CONFIRMATION)
  await expect(page.getByText('No pudimos cargar tu pedido')).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByRole('heading', { name: 'Pedido #57' })).toBeVisible()
})

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the order goes before the summary and nothing scrolls sideways', async ({ page }) => {
    await signedIn(page)
    await mockOrderDetail(page, 57, { status: 200, body: received() })
    await page.goto(CONFIRMATION)
    const headings = page.getByRole('main').getByRole('heading', { level: 2 })
    await expect(headings).toHaveText(['Pedido #57', 'Resumen'])
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
  })
})
