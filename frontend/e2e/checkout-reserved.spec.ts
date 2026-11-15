import { expect, test } from '@playwright/test'
import { mockAuth, signedIn } from './support/auth.ts'
import { NOW } from './support/checkout.ts'
import { latestPayment, mockPayment, mockStripe, ORDER_ID, paymentState, receivedState } from './support/payments.ts'
import { emptyStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * `/pedido/apartado` (D68, frontend; mockup `ConfirmacionEfectivo`): el pedido apartado para pagar en efectivo, con el
 * monto, el plazo del servidor (`payment_due_at`) y la dirección de `GET store/info/` o su marcador.
 */

const RESERVED = `/pedido/apartado?pedido=${ORDER_ID}`
/** El cierre del viernes 13 de noviembre de 2026 en la Ciudad de México (22:30, UTC-6). */
const DUE = '2026-11-14T04:30:00Z'
const cashState = () => paymentState({ order: { payment_due_at: DUE }, latest: latestPayment('cash', 'pending') })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
})

test('without a session it asks to sign in and comes back', async ({ page }) => {
  await mockStoreInfo(page)
  await mockAuth(page)
  await page.goto(RESERVED)
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fpedido%2Fapartado%3Fpedido%3D57$/)
})

test('shows the amount, the deadline from the server and the address, with the reserved label', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockPayment(page, { states: [{ status: 200, body: cashState() }] })
  await page.goto(RESERVED)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu pedido está apartado')
  await expect(page).toHaveTitle('Tu pedido está apartado · Pastelería Ilusión')
  await expect(page.getByRole('navigation', { name: 'Pasos de tu compra' }).locator('[aria-current="step"]')).toContainText('Confirmación')
  await expect(
    page.getByText('Lleva hoy mismo $2,287.50 a la pastelería, antes de las 22:30, para confirmarlo. Si no lo recibimos hoy, el pedido se cancela.'),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pedido #57' })).toBeVisible()
  await expect(page.getByText('Hecho el viernes 13 de noviembre a las 12:00')).toBeVisible()
  await expect(page.getByText('Apartado, falta tu pago', { exact: true })).toBeVisible()
  const notice = page.getByRole('main').locator('div').filter({ hasText: /^Falta tu pago en la pastelería/ }).first()
  await expect(notice).toContainText('Pastelería Ilusión, Calle de Prueba 123, Col. Centro. Todos los días, de 10:00 a 22:30.')
  await expect(notice).toContainText('Paga $2,287.50: el 50% del pedido y el depósito de la base. El resto, el día de la entrega.')
  // "Recibido" no está hecho: el pedido se recibe cuando la pastelería registra el pago (regla 12).
  const timeline = page.getByRole('list', { name: 'Cómo va tu pedido' })
  await expect(timeline.getByRole('listitem')).toHaveCount(4)
  await expect(timeline.getByRole('listitem').first()).toContainText('Recibido')
  await expect(timeline.getByRole('listitem').first()).toContainText('pendiente')
  await expect(timeline).toContainText('Listo para recoger')
  await expect(timeline).toContainText('lunes 16 de noviembre a las 3:30 pm, en la pastelería')
  await expect(page.getByRole('link', { name: 'Ver mi pedido' })).toHaveAttribute('href', '/cuenta/pedidos/57')
  await expect(page.getByRole('link', { name: 'Seguir comprando' })).toHaveAttribute('href', '/catalogo')
  const summary = page.getByRole('region', { name: 'Resumen' })
  await expect(summary.getByRole('row', { name: /Anticipo por pagar hoy \(50%\)/ })).toContainText('$2,087.50')
  await expect(summary.getByRole('row', { name: /Depósito de la base por pagar hoy/ })).toContainText('$200')
  await expect(summary.getByRole('row', { name: /Resto, el día de la entrega/ })).toContainText('$2,087.50')
  await expect(summary.getByRole('row', { name: /Total del pedido/ })).toContainText('$4,175 MXN')
  await expect(summary).not.toContainText('Envío')
  await expect(page.locator('body')).not.toContainText(/cotizador|3D|bizcocho|stand/i)
})

test('without the address it shows the pending marker', async ({ page }) => {
  await mockStoreInfo(page, emptyStoreInfo)
  await signedIn(page)
  await mockPayment(page, { states: [{ status: 200, body: cashState() }] })
  await page.goto(RESERVED)
  await expect(page.getByText('Falta tu pago en la pastelería')).toBeVisible()
  await expect(page.getByRole('main').locator('[data-pendiente]').first()).toHaveText('[Dirección por confirmar]')
})

test('an order that is not reserved in cash goes to the payment page', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page, { states: [{ status: 200, body: paymentState() }] })
  await page.goto(RESERVED)
  await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
})

test('an order already received goes on to the confirmation', async ({ page }) => {
  await mockStoreInfo(page)
  await signedIn(page)
  await mockPayment(page, { states: [{ status: 200, body: receivedState() }] })
  await page.goto(RESERVED)
  await expect(page).toHaveURL(/\/pedido\/confirmacion\?pedido=57$/)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('fits 390 px, with the order before the summary', async ({ page }) => {
    await mockStoreInfo(page)
    await signedIn(page)
    await mockPayment(page, { states: [{ status: 200, body: cashState() }] })
    await page.goto(RESERVED)
    await expect(page.getByRole('heading', { name: 'Pedido #57' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const order = await page.getByRole('heading', { name: 'Pedido #57' }).boundingBox()
    const summary = await page.getByRole('region', { name: 'Resumen' }).boundingBox()
    expect(order!.y).toBeLessThan(summary!.y)
  })
})
