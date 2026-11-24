import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { accountOrder, mockOrderDetail } from './support/account-orders.ts'
import { signedIn } from './support/auth.ts'
import { NOW } from './support/checkout.ts'
import { alreadyCancelled, cancellationPreview, deliveredPreview, mockCancellation, paidCancellationPreview } from './support/order-cancel.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * "Cancelar pedido" en `/cuenta/pedidos/:id` (D70, frontend): la vista previa de `GET orders/<id>/cancel/` decide si
 * se muestra el botón o el motivo; el diálogo dice lo que pasa con el dinero (todo viene de la API) y `POST` cancela.
 */

const DETAIL = '/cuenta/pedidos/57'
const CONFIRM = 'Sí, cancelar mi pedido'
const CANCEL_URL = '**/api/v1/orders/57/cancel/'
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await signedIn(page)
  await mockStoreInfo(page)
})

const cancelledOrder = () => accountOrder({ id: 57, status: 'cancelled' })

async function openDialog(page: Page) {
  await page.goto(DETAIL)
  const opener = page.getByRole('button', { name: 'Cancelar pedido' })
  await opener.click()
  return { opener, dialog: page.getByRole('dialog', { name: 'Cancelar pedido' }) }
}

test('cancels an unpaid order: nothing is charged', async ({ page }) => {
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, status: 'awaiting_payment' }) })
  const { gets, posts } = await mockCancellation(page, 57, {
    preview: { status: 200, body: cancellationPreview() },
    post: { status: 200, body: { order: cancelledOrder(), cancellation: cancellationPreview() } },
  })
  const { dialog } = await openDialog(page)
  await expect(dialog).toContainText('No se cobra nada')
  await expect(dialog).not.toContainText('retiene')
  await dialog.getByRole('button', { name: CONFIRM }).click()

  await expect(dialog).toBeHidden()
  expect(posts).toHaveLength(1)
  await expect(page.getByRole('status').filter({ hasText: 'Pedido cancelado' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
  await expect(page.getByRole('main')).toContainText('Cancelado')
  await expect(page.getByRole('main')).not.toContainText('devolución')
  // El `quote` del POST es el de antes de cancelar: la página pide el real y no vuelve a ofrecer cancelar.
  await expect.poll(() => gets.length).toBe(2)
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
})

test('cancels a paid order: says what the bakery keeps and what is returned, with the amounts from the API', async ({ page }) => {
  await mockOrderDetail(page, 57)
  const { gets, posts } = await mockCancellation(page, 57, {
    preview: { status: 200, body: paidCancellationPreview() },
    post: { status: 200, body: { order: cancelledOrder(), cancellation: paidCancellationPreview() } },
    afterPost: { status: 200, body: alreadyCancelled({ paid: '870.00', retained: '800.00', refund: '70.00' }) },
  })
  const { dialog } = await openDialog(page)
  await expect(dialog).toContainText('La pastelería retiene $800 (el 50% del pedido) y te devolvemos $70.')
  await expect(dialog).toContainText('La devolución la hace la pastelería')
  await expect(dialog).not.toContainText('No se cobra nada')
  await dialog.getByRole('button', { name: CONFIRM }).click()

  await expect(dialog).toBeHidden()
  expect(posts).toHaveLength(1)
  const status = page.getByRole('status').filter({ hasText: 'Pedido cancelado' })
  await expect(status).toContainText('La devolución de $70 está pendiente')
  await expect.poll(() => gets.length).toBe(2)
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a paid order with nothing to return says so', async ({ page }) => {
  await mockOrderDetail(page, 57)
  await mockCancellation(page, 57, { preview: { status: 200, body: paidCancellationPreview({ paid: '800.00', refund: '0.00' }) } })
  const { dialog } = await openDialog(page)
  await expect(dialog).toContainText('La pastelería retiene $800 (el 50% del pedido)')
  await expect(dialog).toContainText('no queda nada por devolver')
})

test('in preparation and paid it can still be cancelled: the bakery keeps 50%', async ({ page }) => {
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, status: 'in_preparation' }) })
  const { posts } = await mockCancellation(page, 57, {
    preview: { status: 200, body: paidCancellationPreview({ status: 'in_preparation' }) },
    post: { status: 200, body: { order: cancelledOrder(), cancellation: paidCancellationPreview({ status: 'in_preparation' }) } },
  })
  const { dialog } = await openDialog(page)
  await expect(dialog).toContainText('La pastelería retiene $800 (el 50% del pedido) y te devolvemos $70.')
  // Ya no hay plazo para cancelar: la API no lo manda y el diálogo no lo dice.
  await expect(dialog).not.toContainText('Puedes cancelar hasta')
  await dialog.getByRole('button', { name: CONFIRM }).click()
  await expect(dialog).toBeHidden()
  expect(posts).toHaveLength(1)
  await expect(page.getByRole('status').filter({ hasText: 'Pedido cancelado' })).toContainText('La devolución de $70 está pendiente')
})

test('a delivered order: no button, only its message in text', async ({ page }) => {
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, status: 'delivered' }) })
  await mockCancellation(page, 57, { preview: { status: 200, body: deliveredPreview() } })
  await page.goto(DETAIL)
  await expect(page.getByText('Este pedido ya se entregó: ya no se puede cancelar.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
})

test('an already cancelled order shows nothing about cancelling', async ({ page }) => {
  await mockOrderDetail(page, 57, { status: 200, body: cancelledOrder() })
  await mockCancellation(page, 57, { preview: { status: 200, body: alreadyCancelled() } })
  await page.goto(DETAIL)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pedido #57')
  await expect(page.getByText('Este pedido ya está cancelado.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
})

test('a race: the order was delivered meanwhile, so the 409 text shows and the page refreshes', async ({ page }) => {
  const message = 'Este pedido ya se entregó: ya no se puede cancelar.'
  let moved = false
  await page.route('**/api/v1/orders/57/', (route) => route.fulfill(json(accountOrder({ id: 57, status: moved ? 'delivered' : 'ready_for_delivery' }))))
  await page.route(CANCEL_URL, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill(json(moved ? deliveredPreview() : paidCancellationPreview({ status: 'ready_for_delivery' })))
    moved = true
    await route.fulfill(json({ detail: message, code: 'not_cancellable' }, 409))
  })
  const { dialog } = await openDialog(page)
  await dialog.getByRole('button', { name: CONFIRM }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Estado' }).getByRole('listitem').nth(3)).toHaveText(/Entregado, hecho/)
})

test('the POST sends the status the preview showed', async ({ page }) => {
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, status: 'in_preparation' }) })
  const { posts } = await mockCancellation(page, 57, {
    preview: { status: 200, body: paidCancellationPreview({ status: 'in_preparation' }) },
    post: { status: 200, body: { order: cancelledOrder(), cancellation: paidCancellationPreview({ status: 'in_preparation' }) } },
  })
  const { dialog } = await openDialog(page)
  await dialog.getByRole('button', { name: CONFIRM }).click()
  await expect(dialog).toBeHidden()
  expect(posts[0].postDataJSON()).toEqual({ expected_status: 'in_preparation' })
})

test('a stale preview: the payment arrived while the dialog was open, so the 409 closes it and says so', async ({ page }) => {
  const message = 'El pedido cambió mientras lo revisabas. Revisa otra vez antes de cancelar.'
  let paid = false
  await page.route('**/api/v1/orders/57/', (route) => route.fulfill(json(accountOrder({ id: 57, status: paid ? 'received' : 'awaiting_payment' }))))
  let body: unknown = null
  await page.route(CANCEL_URL, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill(json(paid ? paidCancellationPreview() : cancellationPreview()))
    body = route.request().postDataJSON()
    paid = true
    await route.fulfill(json({ detail: message, code: 'stale_preview' }, 409))
  })
  const { dialog } = await openDialog(page)
  await expect(dialog).toContainText('No se cobra nada')
  await dialog.getByRole('button', { name: CONFIRM }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible()
  expect(body).toEqual({ expected_status: 'awaiting_payment' })
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toBeVisible()
})

test('too many attempts (429) keeps the dialog open with a text, and the button works again', async ({ page }) => {
  await mockOrderDetail(page, 57)
  const { posts } = await mockCancellation(page, 57, {
    preview: { status: 200, body: paidCancellationPreview() },
    post: { status: 429, body: { detail: 'Solicitud limitada.' } },
  })
  const { dialog } = await openDialog(page)
  const confirm = dialog.getByRole('button', { name: CONFIRM })
  await confirm.click()
  await expect(dialog.getByRole('alert')).toContainText('Hiciste muchos intentos')
  await expect(dialog).toBeVisible()
  await expect(confirm).toBeEnabled()
  expect(posts).toHaveLength(1)
})

test('a server failure and no network each say it in text', async ({ page }) => {
  await mockOrderDetail(page, 57)
  const { posts } = await mockCancellation(page, 57, { preview: { status: 200, body: paidCancellationPreview() }, post: { status: 500 } })
  const { dialog } = await openDialog(page)
  await dialog.getByRole('button', { name: CONFIRM }).click()
  await expect(dialog.getByRole('alert')).toContainText('No pudimos cancelar tu pedido')
  expect(posts).toHaveLength(1)

  await page.unroute(CANCEL_URL)
  await page.route(CANCEL_URL, (route) => route.abort('internetdisconnected'))
  await dialog.getByRole('button', { name: CONFIRM }).click()
  await expect(dialog.getByRole('alert')).toContainText('No pudimos cancelar tu pedido')
})

test('the confirm button is disabled while the request is in flight, and Escape does not close the dialog', async ({ page }) => {
  await mockOrderDetail(page, 57)
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let posts = 0
  let cancelled = false
  await page.route(CANCEL_URL, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill(json(cancelled ? alreadyCancelled() : paidCancellationPreview()))
    posts += 1
    await gate
    cancelled = true
    await route.fulfill(json({ order: cancelledOrder(), cancellation: paidCancellationPreview() }))
  })
  const { dialog } = await openDialog(page)
  await dialog.getByRole('button', { name: CONFIRM }).click()
  await expect(dialog.getByRole('button', { name: 'Cancelando…' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  release()
  await expect(dialog).toBeHidden()
  expect(posts).toBe(1)
})

test('Escape closes the dialog, returns the focus to the button and sends nothing', async ({ page }) => {
  await mockOrderDetail(page, 57)
  const { posts } = await mockCancellation(page, 57, { preview: { status: 200, body: paidCancellationPreview() } })
  const { opener, dialog } = await openDialog(page)
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
  expect(posts).toHaveLength(0)
})

test('keyboard: opens with Enter, the focus stays inside the dialog and "Conservar mi pedido" closes it', async ({ page }) => {
  await mockOrderDetail(page, 57)
  await mockCancellation(page, 57, { preview: { status: 200, body: paidCancellationPreview() } })
  await page.goto(DETAIL)
  const opener = page.getByRole('button', { name: 'Cancelar pedido' })
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Cancelar pedido' })
  await expect(dialog).toBeVisible()
  const inside = () => page.evaluate(() => document.activeElement?.closest('dialog') != null)
  for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    expect(await inside()).toBe(true)
  }
  await dialog.getByRole('button', { name: 'Conservar mi pedido' }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the dialog fits the screen and the page does not scroll sideways', async ({ page }) => {
    await mockOrderDetail(page, 57)
    await mockCancellation(page, 57, { preview: { status: 200, body: paidCancellationPreview() } })
    const { dialog } = await openDialog(page)
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    expect(box!.y + box!.height).toBeLessThanOrEqual(844)
    for (const button of await dialog.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
