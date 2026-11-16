import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockAuth, opened, sessionBody, signedIn } from './support/auth.ts'
import { cajetaSlice, durazno, mockCalendar, mockOrders, NOW, placedOrder, seedCart, storedCart } from './support/checkout.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Arreglos de la revisión de `feat/carrito-entrega` (D66): la llave de idempotencia sigue a lo que se pide, un pedido
 * vencido no cuenta como creado, salir de la cuenta olvida la compra, el tabulador del calendario, el mes que no carga
 * y los errores del servidor que llegan en lista.
 */

const DELIVERY = '/pedido/entrega'
const CHECKOUT_MODULE = '/src/models/checkout.ts'
const SESSION_MODULE = '/src/models/session.ts'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
})

const day = (page: Page, label: string) => page.getByRole('button', { name: label })
const continueButton = (page: Page) => page.getByRole('button', { name: 'Continuar al pago' })
const slot = (page: Page, time: string) => page.locator('label').filter({ hasText: new RegExp(`^${time}$`) })

async function chooseMonday(page: Page, time = '3:30 pm') {
  await day(page, 'Lunes 16 de noviembre').click()
  await page.getByRole('radio', { name: /^Tarde/ }).check()
  await slot(page, time).click()
}

test('changing the time after a lost answer asks for a new order with another key', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  const orders = await mockOrders(page, ['abort', { status: 201, body: placedOrder({ slot_starts_at: '16:00', slot_ends_at: '16:30' }) }])
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await continueButton(page).click()
  await expect(page.getByRole('alert')).toContainText('No pudimos conectar con la pastelería')
  await slot(page, '4:00 pm').click()
  await continueButton(page).click()
  await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
  expect(orders).toHaveLength(2)
  expect(orders[1].postDataJSON().slot_starts_at).toBe('16:00')
  expect(orders[1].headers()['idempotency-key']).not.toBe(orders[0].headers()['idempotency-key'])
})

test('the same choices keep the key, and the browser keeps a hash, never the name or the phone', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  const orders = await mockOrders(page, ['abort', 'abort'])
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await continueButton(page).click()
  await expect(page.getByRole('alert')).toContainText('No pudimos conectar con la pastelería')
  await continueButton(page).click()
  await expect.poll(() => orders.length).toBe(2)
  expect(orders[1].headers()['idempotency-key']).toBe(orders[0].headers()['idempotency-key'])
  const stored = await page.evaluate(() => sessionStorage.getItem('ilusion.checkout.v1') ?? '')
  expect(stored).toContain(orders[0].headers()['idempotency-key'])
  expect(stored).not.toMatch(/Ana|López|5512345678|2026-11-16|15:30/)
})

test('an answer with an expired order is not a new order: the cart stays and the next try uses another key', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  const orders = await mockOrders(page, [
    { status: 200, body: placedOrder({ status: 'cancelled', payment: null, payment_due_at: null }) },
    { status: 201, body: placedOrder() },
  ])
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await continueButton(page).click()
  await expect(page.getByRole('alert')).toContainText('Ese pedido ya venció. Vuelve a intentarlo para hacer uno nuevo.')
  await expect(page).toHaveURL(/\/pedido\/entrega$/)
  expect((await storedCart(page)).items).toHaveLength(1)
  await continueButton(page).click()
  await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
  expect(orders[1].headers()['idempotency-key']).not.toBe(orders[0].headers()['idempotency-key'])
})

test('signing out here or in another tab forgets the purchase key and the uploaded images', async ({ page }) => {
  await signedIn(page)
  await page.goto('/cuenta')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
  const other = await page.context().newPage()
  await mockStoreInfo(other)
  await mockAuth(other, { refresh: () => opened(sessionBody()) })
  await other.goto('/cuenta')
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
  const start = (target: Page) =>
    target.evaluate(async (url) => {
      const checkout = await import(url)
      const key = await checkout.purchaseKey('huella-1')
      checkout.rememberUpload('imagen-local', 'id-en-servidor')
      return key as string
    }, CHECKOUT_MODULE)
  const after = (target: Page) =>
    target.evaluate(async (url) => {
      const checkout = await import(url)
      return { key: (await checkout.purchaseKey('huella-1')) as string, upload: checkout.uploadedImageId('imagen-local') as string | null }
    }, CHECKOUT_MODULE)
  const [here, there] = [await start(page), await start(other)]
  await page.evaluate(async (url) => (await import(url)).logout(), SESSION_MODULE)
  const [hereAfter, thereAfter] = [await after(page), await after(other)]
  expect(hereAfter.key).not.toBe(here)
  expect(hereAfter.upload).toBeNull()
  expect(thereAfter.key).not.toBe(there)
  expect(thereAfter.upload).toBeNull()
})

test('the calendar Tab stop follows the last day the arrows reached', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await day(page, 'Domingo 15 de noviembre').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(day(page, 'Martes 17 de noviembre')).toBeFocused()
  await expect(day(page, 'Martes 17 de noviembre')).toHaveAttribute('tabindex', '0')
  await expect(day(page, 'Domingo 15 de noviembre')).toHaveAttribute('tabindex', '-1')
  // Fuera del calendario y de regreso: el foco vuelve al día donde se quedó.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(day(page, 'Martes 17 de noviembre')).toBeFocused()
})

test('a month that fails to load keeps the month controls next to the error', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  await page.route('**/api/v1/delivery-slots/**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('start') === '2026-12-01') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      return
    }
    await route.fallback()
  })
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await expect(page.getByRole('alert')).toContainText('No pudimos cargar las fechas')
  await expect(page.getByText('Diciembre 2026')).toBeVisible()
  await page.getByRole('button', { name: 'Mes anterior' }).click()
  await expect(page.getByText('Noviembre 2026')).toBeVisible()
  await expect(day(page, 'Lunes 16 de noviembre')).toBeEnabled()
})

test('format errors that come as a list are placed by line, and repeated messages keep their own keys', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await signedIn(page)
  await mockCalendar(page, () => ({ available: true, reason: null }))
  await mockOrders(page, [
    {
      status: 400,
      body: {
        items: [{}, { quantity: ['Pide al menos una pieza.'] }],
        non_field_errors: ['Revisa tu pedido.', 'Revisa tu pedido.'],
      },
    },
  ])
  await seedCart(page, [durazno, { ...cajetaSlice, fulfillment: 'order', offeringId: 103 }])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await continueButton(page).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Rebanada de tres leches de cajeta: Pide al menos una pieza.')
  await expect(alert.getByRole('listitem').filter({ hasText: 'Revisa tu pedido.' })).toHaveCount(2)
  expect(consoleErrors.filter((text) => /same key/i.test(text))).toEqual([])
})

test('a device clock two hours ahead still takes a fresh order to pay: the server decides when it expires', async ({ page }) => {
  // El plazo del pedido (18:30 UTC) ya pasó según este reloj (20:00 UTC), pero el pedido es nuevo y el servidor manda.
  await page.clock.setFixedTime(new Date(NOW.getTime() + 2 * 60 * 60 * 1000))
  await signedIn(page)
  await mockCalendar(page)
  const orders = await mockOrders(page, [{ status: 201, body: placedOrder() }])
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await continueButton(page).click()
  await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
  expect(orders).toHaveLength(1)
  expect((await storedCart(page)).items).toEqual([])
})
