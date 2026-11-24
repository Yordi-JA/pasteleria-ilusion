import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { accountOrder, mockOrderDetail, stand } from './support/account-orders.ts'
import { signedIn } from './support/auth.ts'
import { NOW } from './support/checkout.ts'
import { alreadyCancelled, cancellationPreview, mockCancellation, paidCancellationPreview } from './support/order-cancel.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * El detalle de un pedido cancelado que sí se cobró (D106): dice lo pagado, lo que retiene la pastelería y lo que
 * devuelve, con los montos de `GET orders/<id>/cancel/`. Uno cancelado sin pagarse sigue diciendo que no se cobró nada.
 * El `quote` del `POST` real se arma antes de cancelar (estado anterior y `cancellable: true`): la página no lo usa y
 * vuelve a pedir el `GET`, que ya responde el pedido cancelado.
 */

const DETAIL = '/cuenta/pedidos/57'
const CANCEL_URL = '**/api/v1/orders/57/cancel/'
const PAID_WITH = { method: 'stripe', method_label: 'Tarjeta (Stripe)', paid_at: '2026-11-13T18:09:00Z' }
const CHARGED = { paid: '690.00', paid_with: 'stripe', order_total: '1200.00', retained: '600.00', refund: '90.00' }
/** Pedido de $1,200 con base de 6 kg: anticipo de $600 y depósito de $90, lo que cobra `payment_service`. */
const PAYMENT = { advance_percent: 50, advance: '600.00', paid_in_full: '0.00', base_deposit: '90.00', delivery_fee: '0.00', pay_today: '690.00', pay_on_delivery: '600.00' }
const WITH_BASE = { subtotal: '1200.00', stand_deposit: '90.00', payment: PAYMENT, stands: [stand({ kg: 6, deposit: '90.00' })] }

const cancelledPaid = () => accountOrder({ id: 57, status: 'cancelled', note_available: true, paid_with: PAID_WITH, ...WITH_BASE })
const receivedPaid = () => accountOrder({ id: 57, status: 'received', paid_with: PAID_WITH, ...WITH_BASE })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await signedIn(page)
  await mockStoreInfo(page)
})

async function expectTruthfulDetail(page: Page) {
  const payment = page.getByRole('region', { name: 'Entrega y pago' })
  await expect(payment).toContainText('Pagaste $690 con Tarjeta (Stripe), el viernes 13 de noviembre, y el pedido se canceló.')
  await expect(payment).toContainText('La pastelería retiene $600 y te devolvemos $90. La devolución la hace la pastelería.')
  await expect(payment).not.toContainText('sin pagarse')
  await expect(payment).not.toContainText('No se te cobró nada')

  const products = page.getByRole('region', { name: 'Productos' })
  await expect(products.getByRole('row', { name: /Anticipo pagado/ })).toBeVisible()
  await expect(products.getByRole('row', { name: /Depósito de la base pagado/ })).toBeVisible()
  await expect(products).not.toContainText('por pagar')
  // Cancelado ya no hay día de entrega: nada de "Resto" (D106).
  await expect(page.getByRole('main')).not.toContainText('Resto')

  const base = page.getByRole('region', { name: 'Base prestada' })
  await expect(base).toContainText('Depósito por devolver')
  await expect(base).not.toContainText('por pagar')
}

test('a cancelled order that was charged says what was paid, what is kept and what is returned', async ({ page }) => {
  await mockOrderDetail(page, 57, { status: 200, body: cancelledPaid() })
  await mockCancellation(page, 57, { preview: { status: 200, body: alreadyCancelled(CHARGED) } })
  await page.goto(DETAIL)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pedido #57')
  await expectTruthfulDetail(page)
})

test('a cancelled order that was charged with nothing to return says nothing is left to return', async ({ page }) => {
  // Sin base: se pagó el anticipo del 50% ($600 de $1,200) y la pastelería retiene el 50%, así que no queda nada.
  const noBase = { subtotal: '1200.00', stand_deposit: '0.00', payment: { ...PAYMENT, base_deposit: '0.00', pay_today: '600.00' }, stands: [] }
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, status: 'cancelled', paid_with: PAID_WITH, ...noBase }) })
  await mockCancellation(page, 57, { preview: { status: 200, body: alreadyCancelled({ ...CHARGED, paid: '600.00', retained: '600.00', refund: '0.00' }) } })
  await page.goto(DETAIL)
  const payment = page.getByRole('region', { name: 'Entrega y pago' })
  await expect(payment).toContainText('Pagaste $600 con Tarjeta (Stripe)')
  await expect(payment).toContainText('La pastelería retiene $600 y no queda nada por devolver.')
  await expect(page.getByRole('main')).not.toContainText('Resto')
  await expect(page.getByRole('region', { name: 'Base prestada' })).toHaveCount(0)
})

test('a cancelled showcase order paid in full says it was paid and never mentions a rest', async ({ page }) => {
  const full = { subtotal: '300.00', stand_deposit: '0.00', payment: { ...PAYMENT, advance: '300.00', paid_in_full: '300.00', base_deposit: '0.00', pay_today: '300.00', pay_on_delivery: '0.00' }, stands: [] }
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, status: 'cancelled', paid_with: PAID_WITH, ...full }) })
  await mockCancellation(page, 57, { preview: { status: 200, body: alreadyCancelled({ ...CHARGED, order_total: '300.00', paid: '300.00', retained: '150.00', refund: '150.00' }) } })
  await page.goto(DETAIL)
  await expect(page.getByRole('region', { name: 'Productos' }).getByRole('row', { name: /Pedido completo pagado/ })).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText('Resto')
  await expect(page.getByRole('region', { name: 'Entrega y pago' })).toContainText('La pastelería retiene $150 y te devolvemos $150.')
})

for (const failure of ['server error', 'no network'] as const) {
  test(`a cancelled order that was charged shows no amounts and no error when the cancellation fails (${failure})`, async ({ page }) => {
    await mockOrderDetail(page, 57, { status: 200, body: cancelledPaid() })
    if (failure === 'no network') await page.route(CANCEL_URL, (route) => route.abort('internetdisconnected'))
    else await mockCancellation(page, 57, { preview: { status: 500 } })
    await page.goto(DETAIL)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pedido #57')
    const payment = page.getByRole('region', { name: 'Entrega y pago' })
    await expect(payment).toContainText('Pagaste con Tarjeta (Stripe), el viernes 13 de noviembre, y el pedido se canceló.')
    await expect(payment).not.toContainText('retiene')
    await expect(payment).not.toContainText('Pagaste $')
    await expect(page.getByRole('region', { name: 'Base prestada' })).toContainText('Depósito pagado')
    await expect(page.getByRole('main')).not.toContainText('Resto')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
  })
}

test('a quote that belongs to another order is not used for the amounts', async ({ page }) => {
  await mockOrderDetail(page, 57, { status: 200, body: cancelledPaid() })
  await mockCancellation(page, 57, { preview: { status: 200, body: alreadyCancelled({ ...CHARGED, order_id: 99 }) } })
  await page.goto(DETAIL)
  const payment = page.getByRole('region', { name: 'Entrega y pago' })
  await expect(payment).toContainText('Pagaste con Tarjeta (Stripe)')
  await expect(payment).not.toContainText('retiene')
})

test('cancelling a paid order from the page shows the same truth without reloading', async ({ page }) => {
  await mockOrderDetail(page, 57, { status: 200, body: receivedPaid() })
  const { gets } = await mockCancellation(page, 57, {
    preview: { status: 200, body: paidCancellationPreview({ ...CHARGED }) },
    post: { status: 200, body: { order: cancelledPaid(), cancellation: paidCancellationPreview({ ...CHARGED }) } },
    afterPost: { status: 200, body: alreadyCancelled(CHARGED) },
  })
  await page.goto(DETAIL)
  await page.getByRole('button', { name: 'Cancelar pedido' }).click()
  await page.getByRole('button', { name: 'Sí, cancelar mi pedido' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Pedido cancelado' })).toContainText('La devolución de $90 está pendiente: la hace la pastelería.')
  await expectTruthfulDetail(page)
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(gets).toHaveLength(2)
})

test('cancelling an unpaid order from the page hides the button and says nothing was charged', async ({ page }) => {
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, status: 'awaiting_payment' }) })
  const { gets } = await mockCancellation(page, 57, {
    preview: { status: 200, body: cancellationPreview() },
    post: { status: 200, body: { order: accountOrder({ id: 57, status: 'cancelled' }), cancellation: cancellationPreview() } },
  })
  await page.goto(DETAIL)
  await page.getByRole('button', { name: 'Cancelar pedido' }).click()
  await page.getByRole('button', { name: 'Sí, cancelar mi pedido' }).click()
  await expect(page.getByRole('region', { name: 'Entrega y pago' })).toContainText('El pedido se canceló sin pagarse. No se te cobró nada.')
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
  await expect(page.getByRole('main')).not.toContainText('Resto')
  expect(gets).toHaveLength(2)
})

test('a cancelled order that was never paid still says nothing was charged', async ({ page }) => {
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, status: 'cancelled' }) })
  await mockCancellation(page, 57, { preview: { status: 200, body: alreadyCancelled() } })
  await page.goto(DETAIL)
  const payment = page.getByRole('region', { name: 'Entrega y pago' })
  await expect(payment).toContainText('El pedido se canceló sin pagarse. No se te cobró nada.')
  const products = page.getByRole('region', { name: 'Productos' })
  await expect(products.getByRole('row', { name: /Anticipo por pagar/ })).toBeVisible()
  await expect(products.getByRole('row', { name: /Depósito de la base por pagar/ })).toBeVisible()
  await expect(products).not.toContainText('Resto')
  await expect(page.getByRole('region', { name: 'Base prestada' })).toContainText('Depósito por pagar')
})

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the charged cancelled order tells the truth and the refund notice shows after cancelling', async ({ page }) => {
    await mockOrderDetail(page, 57, { status: 200, body: receivedPaid() })
    await mockCancellation(page, 57, {
      preview: { status: 200, body: paidCancellationPreview({ ...CHARGED }) },
      post: { status: 200, body: { order: cancelledPaid(), cancellation: paidCancellationPreview({ ...CHARGED }) } },
      afterPost: { status: 200, body: alreadyCancelled(CHARGED) },
    })
    await page.goto(DETAIL)
    await page.getByRole('button', { name: 'Cancelar pedido' }).click()
    await page.getByRole('button', { name: 'Sí, cancelar mi pedido' }).click()
    const notice = page.getByRole('status').filter({ hasText: 'Pedido cancelado' })
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('La devolución de $90 está pendiente')
    await expect(notice).toBeInViewport({ ratio: 0 })
    await expectTruthfulDetail(page)
    await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('opening a charged cancelled order shows the truth', async ({ page }) => {
    await mockOrderDetail(page, 57, { status: 200, body: cancelledPaid() })
    await mockCancellation(page, 57, { preview: { status: 200, body: alreadyCancelled(CHARGED) } })
    await page.goto(DETAIL)
    await expectTruthfulDetail(page)
  })
})
