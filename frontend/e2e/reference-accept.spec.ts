import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { signedIn } from './support/auth.ts'
import { defaultDay, mockCalendar, NOW } from './support/checkout.ts'
import { mockPayment, paymentState } from './support/payments.ts'
import { acceptedOrder, mockReferenceImages, mockReferences, quoteReadyRequest, readyQuote, referenceRequest } from './support/references.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * "Aceptar y pagar" (D70, frontend): `/pedido/entrega?cotizacion=<id>` con el día del evento fijo, la hora y quién
 * recoge, `POST reference-requests/<id>/accept/` con `Idempotency-Key` (nunca `POST orders/`) y el pago de D68.
 */

const ACCEPT = '/pedido/entrega?cotizacion=7'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
})

const slot = (page: Page, time: string) => page.locator('label').filter({ hasText: new RegExp(`^${time}$`) })
const continueButton = (page: Page) => page.getByRole('button', { name: 'Continuar al pago' })

/** El chip de un periodo (mañana, tarde o noche): el radio va oculto, como en los horarios. */
const period = (page: Page, name: string) => page.locator('label').filter({ hasText: new RegExp(`^${name}`) })

async function chooseFour(page: Page) {
  await period(page, 'Tarde').click()
  await slot(page, '4:00 pm').click()
}

async function noOrdersPost(page: Page) {
  const posts: string[] = []
  await page.route('**/api/v1/orders/', async (route) => {
    posts.push(route.request().method())
    await route.fulfill({ status: 500, body: '{}' })
  })
  return posts
}

test('from the quote: the event day is fixed, choose the time and who picks up, and go to pay', async ({ page }) => {
  await signedIn(page)
  const calendar = await mockCalendar(page)
  await mockReferenceImages(page)
  const references = await mockReferences(page, { detail: { status: 200, body: quoteReadyRequest() } })
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ order: acceptedOrder() }) }] })
  const orderPosts = await noOrdersPost(page)
  await page.goto('/cuenta/cotizaciones/7')
  await page.getByRole('link', { name: 'Aceptar y pagar' }).click()
  await expect(page).toHaveURL(ACCEPT)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿Cómo recibes tu pedido?')
  await expect(page.getByRole('main')).toContainText('Solicitud #7')

  // Un solo día, el del evento: sin meses que recorrer.
  await expect(page.getByRole('button', { name: 'Mes siguiente' })).toHaveCount(0)
  await expect(page.getByTestId('dia-del-evento')).toHaveText('Sábado 21 de noviembre, el día de tu evento')
  await expect.poll(() => calendar.requests.length).toBeGreaterThan(0)
  const query = new URL(calendar.requests[0].url()).searchParams
  expect(query.get('start')).toBe('2026-11-21')
  expect(query.get('end')).toBe('2026-11-21')
  expect(query.getAll('kind')).toEqual(['reference'])

  // El resumen es el de la cotización, con lo que se paga hoy.
  const summary = page.getByRole('region', { name: 'Resumen' })
  await expect(summary).toContainText('Pastel según tu referencia')
  await expect(summary).toContainText('$1,800 MXN')
  await expect(summary).toContainText('Hoy pagas $990: el anticipo del 50% y el depósito de la base. El resto, $900, el día de la entrega.')

  // Quién recoge viene de la cuenta.
  await expect(page.getByLabel('Nombre')).toHaveValue('Ana López García')
  await expect(page.getByLabel('Teléfono')).toHaveValue('55 1234 5678')

  await continueButton(page).click()
  await expect(page.getByText('Elige la hora en que recoges tu pedido.').first()).toBeVisible()
  expect(references.accepts).toHaveLength(0)

  await chooseFour(page)
  await continueButton(page).click()
  await expect(page).toHaveURL('/pedido/pago?pedido=57')
  expect(references.accepts).toHaveLength(1)
  expect(references.accepts[0].postDataJSON()).toEqual({
    slot_starts_at: '16:00',
    pickup_name: 'Ana López García',
    pickup_phone: '5512345678',
    delivery_date: '2026-11-21',
  })
  expect(references.accepts[0].headers()['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  expect(orderPosts).toHaveLength(0)
  // El pago (D68) acepta la línea del precio cotizado.
  const paying = page.getByRole('region', { name: 'Resumen de tu pedido' })
  await expect(paying).toContainText('Pastel según tu referencia')
  await expect(paying).toContainText('6 kg, pan de chocolate con relleno normal de fresa y nuez')
  await expect(paying).not.toContainText('Diseña tu pastel')
  await expect(paying.getByText('Depósito de la base')).toBeVisible()
})

test('a slot that filled up: the error under the schedule, the slots reload, another choice is a new attempt', async ({ page }) => {
  await signedIn(page)
  const calendar = await mockCalendar(page)
  const references = await mockReferences(page, {
    detail: { status: 200, body: quoteReadyRequest() },
    accept: [{ status: 400, body: { slot_starts_at: ['Ese horario ya se llenó. Elige otro.'] } }, { status: 201, body: acceptedOrder({ slot_starts_at: '16:30' }) }],
  })
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ order: acceptedOrder() }) }] })
  await page.goto(ACCEPT)
  await chooseFour(page)
  const before = calendar.requests.length
  calendar.setRule((date) => ({ ...defaultDay(date), fullSlots: ['15:00', '16:00'] }))
  await continueButton(page).click()
  await expect(page.getByRole('alert')).toContainText('Ese horario ya se llenó. Elige otro.')
  await expect.poll(() => calendar.requests.length).toBeGreaterThan(before)
  await expect(page.getByRole('radio', { name: /4:00 pm/ })).toBeDisabled()
  await slot(page, '4:30 pm').click()
  await continueButton(page).click()
  await expect(page).toHaveURL('/pedido/pago?pedido=57')
  expect(references.accepts).toHaveLength(2)
  expect(references.accepts[1].postDataJSON().slot_starts_at).toBe('16:30')
  expect(references.accepts[1].headers()['idempotency-key']).not.toBe(references.accepts[0].headers()['idempotency-key'])
})

test('a retry after a network failure sends the same key', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  const references = await mockReferences(page, {
    detail: { status: 200, body: quoteReadyRequest() },
    accept: ['abort', { status: 200, body: acceptedOrder() }],
  })
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ order: acceptedOrder() }) }] })
  await page.goto(ACCEPT)
  await chooseFour(page)
  await continueButton(page).click()
  await expect(page.getByRole('alert')).toContainText('No pudimos conectar con la pastelería')
  await continueButton(page).click()
  await expect(page).toHaveURL('/pedido/pago?pedido=57')
  expect(references.accepts).toHaveLength(2)
  expect(references.accepts[1].headers()['idempotency-key']).toBe(references.accepts[0].headers()['idempotency-key'])
})

test('quote_expired (409) says the quote expired and links back to it', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  await mockReferences(page, {
    detail: { status: 200, body: quoteReadyRequest() },
    accept: [{ status: 409, body: { detail: 'Esta cotización ya venció.', code: 'quote_expired' } }],
  })
  await page.goto(ACCEPT)
  await chooseFour(page)
  await continueButton(page).click()
  await expect(page.getByRole('alert')).toContainText('Esta cotización venció. Pide una nueva por WhatsApp o desde tu solicitud.')
  await expect(page.getByRole('link', { name: 'Volver a tu solicitud' }).first()).toHaveAttribute('href', '/cuenta/cotizaciones/7')
})

test('a quote that is not ready, expired or already accepted cannot be accepted here', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  const references = await mockReferences(page, { detail: { status: 200, body: referenceRequest() } })
  await page.goto(ACCEPT)
  await expect(page.getByRole('main')).toContainText('Tu cotización todavía no está lista')
  await expect(continueButton(page)).toHaveCount(0)

  references.setDetail({ status: 200, body: quoteReadyRequest({ quote: { ...readyQuote, expired: true } }) })
  await page.reload()
  await expect(page.getByRole('main')).toContainText('Esta cotización venció')

  references.setDetail({ status: 200, body: quoteReadyRequest({ status: 'accepted', status_label: 'Aceptada', order_id: 57 }) })
  await page.reload()
  await expect(page.getByRole('main')).toContainText('Ya aceptaste esta cotización')
  await expect(page.getByRole('link', { name: 'Ver mi pedido' })).toHaveAttribute('href', '/cuenta/pedidos/57')

  references.setDetail({ status: 404, body: { detail: 'No encontrado.' } })
  await page.reload()
  await expect(page.getByRole('main')).toContainText('No encontramos esta solicitud')
})

test('the checkout bar goes back to the quote in quote mode, and to the cart otherwise', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  await mockReferences(page, { detail: { status: 200, body: quoteReadyRequest() } })
  await page.goto(ACCEPT)
  const bar = page.getByTestId('barra')
  await expect(bar.getByRole('link', { name: 'Volver a la cotización' })).toHaveAttribute('href', '/cuenta/cotizaciones/7')
  await expect(bar.getByRole('link', { name: 'Volver al carrito' })).toHaveCount(0)
  await page.goto('/pedido/entrega')
  await expect(page.getByTestId('barra').getByRole('link', { name: 'Volver al carrito' })).toHaveAttribute('href', '/carrito')
})

test('the cart delivery is untouched: without ?cotizacion= it still reads the cart', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  await mockReferenceImages(page)
  await page.goto('/pedido/entrega')
  await expect(page.getByRole('heading', { name: 'Tu carrito está vacío' })).toBeVisible()
})

test('mobile at 390 px and keyboard: no horizontal scroll and the slot is chosen with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signedIn(page)
  await mockCalendar(page)
  const references = await mockReferences(page, { detail: { status: 200, body: quoteReadyRequest() } })
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ order: acceptedOrder() }) }] })
  await page.goto(ACCEPT)
  await expect(page.getByTestId('dia-del-evento')).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Tarde/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('radio', { name: /^Tarde/ }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('radio', { name: '2:00 pm' })).toBeFocused()
  await page.keyboard.press('Space')
  await continueButton(page).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/pedido/pago?pedido=57')
  expect(references.accepts).toHaveLength(1)
})

test('the quote stays on one page: no parts, the time and who picks up together, with the sticky bar at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signedIn(page)
  await mockCalendar(page)
  const references = await mockReferences(page, { detail: { status: 200, body: quoteReadyRequest() } })
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ order: acceptedOrder() }) }] })
  await page.goto(ACCEPT)
  await expect(page.getByTestId('dia-del-evento')).toBeVisible()
  // Una sola página: sin partes ni "Continuar", con la hora y quién recoge juntos.
  await expect(page.getByRole('list', { name: 'Partes de la entrega' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Nombre')).toHaveValue('Ana López García')
  // Los periodos en un control de tres y los horarios en tres columnas.
  const periods = await Promise.all(['Mañana', 'Tarde', 'Noche'].map(async (name) => (await period(page, name).boundingBox())!))
  expect(new Set(periods.map((box) => Math.round(box.y))).size).toBe(1)
  const slots = await Promise.all(['10:30 am', '11:00 am', '11:30 am', '12:00 pm'].map(async (time) => (await slot(page, time).boundingBox())!))
  expect(Math.round(slots[0].y)).toBe(Math.round(slots[2].y))
  expect(slots[3].y).toBeGreaterThan(slots[0].y)
  // La barra fija con el total y el único "Continuar al pago".
  const bar = page.getByTestId('barra-entrega')
  await expect(bar).toBeVisible()
  await expect(bar).toContainText('Total del pedido')
  await expect(bar).toContainText('$1,800 MXN')
  await expect(continueButton(page)).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await chooseFour(page)
  await bar.getByRole('button', { name: 'Continuar al pago' }).click()
  await expect(page).toHaveURL('/pedido/pago?pedido=57')
  expect(references.accepts).toHaveLength(1)
})
