import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ana, mockAuth, signedIn } from './support/auth.ts'
import {
  cajetaSlice,
  CART_KEY,
  defaultDay,
  designLine,
  durazno,
  mockCalendar,
  mockImageUploads,
  mockOrders,
  NOW,
  placedOrder,
  quoteDesignLine,
  saveImage,
  seedCart,
  storedCart,
  writeCart,
} from './support/checkout.ts'
import { emptyStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * `/pedido/entrega` (D66): sesión, marco de la compra, calendario con días y horarios llenos, quién recoge y la creación
 * del pedido con `Idempotency-Key`, sus errores y la pausa por cotización.
 */

const DELIVERY = '/pedido/entrega'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
})

const day = (page: Page, label: RegExp | string) => page.getByRole('button', { name: label })
const continueButton = (page: Page) => page.getByRole('button', { name: 'Continuar al pago' })
/** El chip visible de un horario: el radio va oculto dentro de su etiqueta, y el cliente toca la etiqueta. */
const slot = (page: Page, time: string) => page.locator('label').filter({ hasText: new RegExp(`^${time}$`) })

/** Elige el lunes 16 de noviembre a las 3:30 pm. */
async function chooseMonday(page: Page) {
  await day(page, 'Lunes 16 de noviembre').click()
  await page.getByRole('radio', { name: /^Tarde/ }).check()
  await slot(page, '3:30 pm').click()
}

test('without a session it asks to sign in and comes back here', async ({ page }) => {
  await mockAuth(page)
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fpedido%2Fentrega$/)
})

test('the checkout frame, the calendar with full days and slots, and who picks up from the account', async ({ page }) => {
  await signedIn(page)
  const calendar = await mockCalendar(page)
  await seedCart(page, [durazno, designLine])
  await page.goto(DELIVERY)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿Cómo recibes tu pedido?')
  await expect(page).toHaveTitle('¿Cómo recibes tu pedido? · Pastelería Ilusión')
  // El marco de la compra: "Volver al carrito" en la barra, sin la navegación del sitio; la franja de los pagos.
  const banner = page.getByRole('banner')
  await expect(banner.getByRole('link', { name: 'Volver al carrito' })).toHaveAttribute('href', '/carrito')
  await expect(banner.getByRole('navigation', { name: 'Principal' })).toHaveCount(0)
  await expect(page.getByTestId('franja')).toContainText('Pagos procesados por Stripe y Mercado Pago')
  await expect(page.getByTestId('franja').getByRole('link', { name: /WhatsApp \+520000000000/ })).toBeVisible()
  await expect(page.getByRole('contentinfo')).not.toContainText('Pide un deseo')
  const steps = page.getByRole('navigation', { name: 'Pasos de tu compra' })
  await expect(steps.locator('[aria-current="step"]')).toContainText('Entrega')
  await expect(steps).toContainText('Carrito, hecho')

  // A domicilio se ve, desactivada, y se coordina por WhatsApp.
  await expect(page.getByRole('radio', { name: 'Recoger en la pastelería Sin costo.' })).toBeChecked()
  const home = page.getByRole('radio', { name: 'Entrega a domicilio' })
  await expect(home).toBeDisabled()
  await expect(home).toHaveAccessibleDescription('Por ahora la coordinamos por WhatsApp.')
  await expect(page.getByRole('link', { name: /Escribir por WhatsApp para la entrega a domicilio/ })).toHaveAttribute('href', 'https://wa.me/520000000000')

  // El calendario del mes, pedido de una vez con los tipos del carrito.
  await expect(page.getByText('Noviembre 2026')).toBeVisible()
  await expect.poll(() => calendar.requests.length).toBeGreaterThan(0)
  const query = new URL(calendar.requests[0].url()).searchParams
  expect([query.get('start'), query.get('end'), query.getAll('kind').sort()]).toEqual(['2026-11-01', '2026-11-30', ['design', 'order']])
  await expect(day(page, 'Viernes 13 de noviembre, no disponible')).toBeDisabled()
  await expect(day(page, 'Viernes 20 de noviembre, lleno')).toBeDisabled()
  await expect(day(page, 'Viernes 20 de noviembre, lleno')).toContainText('Lleno')
  await expect(page.getByText('La fecha más cercana para tu pedido es el domingo 15 de noviembre.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mes anterior' })).toBeDisabled()

  // Los horarios por lapso: la tarde con las 3:00 pm llenas.
  await expect(page.getByText('Elige una fecha para ver sus horarios.')).toBeVisible()
  await day(page, 'Lunes 16 de noviembre').click()
  await expect(day(page, 'Lunes 16 de noviembre')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('radio', { name: 'Mañana 10:30 am a 1:30 pm' })).toBeChecked()
  await page.getByRole('radio', { name: 'Tarde 2:00 a 5:30 pm' }).check()
  await expect(page.getByRole('radio', { name: 'Noche 6:00 a 10:00 pm' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '3:00 pm Lleno' })).toBeDisabled()
  await slot(page, '3:30 pm').click()
  await expect(page.getByRole('radio', { name: '3:30 pm' })).toBeChecked()

  // Quién recoge, con la cuenta.
  await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveValue(ana.full_name)
  await expect(page.getByRole('textbox', { name: 'Teléfono' })).toHaveValue('55 1234 5678')
  // El resumen.
  const summary = page.getByRole('region', { name: 'Resumen' })
  await expect(summary).toContainText('Tres leches de durazno')
  await expect(summary).toContainText('Completo, 1 pieza')
  await expect(summary).toContainText('15 kg')
  await expect(summary).toContainText('$4,175 MXN')
  await expect(summary).toContainText('Incluye depósito por base')
})

test('the next month comes from the API and the arrows move between days you can choose', async ({ page }) => {
  await signedIn(page)
  const calendar = await mockCalendar(page)
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await expect(page.getByText('Diciembre 2026')).toBeVisible()
  await expect.poll(() => calendar.requests.map((request) => new URL(request.url()).searchParams.get('start'))).toContain('2026-12-01')
  await page.getByRole('button', { name: 'Mes anterior' }).click()
  await expect(page.getByText('Noviembre 2026')).toBeVisible()
  // Con el teclado: un solo día entra con Tab y las flechas saltan los que no se eligen.
  const sunday = day(page, 'Domingo 15 de noviembre')
  await sunday.focus()
  await page.keyboard.press('ArrowRight')
  await expect(day(page, 'Lunes 16 de noviembre')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(day(page, 'Lunes 23 de noviembre')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  // El 20 está lleno: del 19 pasa al 21.
  await expect(day(page, 'Jueves 19 de noviembre')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(day(page, 'Sábado 21 de noviembre')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(day(page, 'Sábado 21 de noviembre')).toHaveAttribute('aria-pressed', 'true')
  await expect(day(page, 'Sábado 21 de noviembre')).toHaveAttribute('tabindex', '0')
  await expect(day(page, 'Domingo 15 de noviembre')).toHaveAttribute('tabindex', '-1')
})

test('creating the order sends the choices with an Idempotency-Key, empties the cart and goes to pay', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  const orders = await mockOrders(page)
  await seedCart(page, [durazno, designLine])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await page.getByRole('textbox', { name: 'Teléfono' }).fill('55-9876-5432')
  await continueButton(page).click()
  await expect(page).toHaveURL(/\/pedido\/pago$/)
  expect(orders).toHaveLength(1)
  const request = orders[0]
  expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(request.headers().authorization).toBe('Bearer access-de-prueba')
  const body = request.postDataJSON()
  expect(body).toMatchObject({
    fulfillment: 'pickup',
    delivery_date: '2026-11-16',
    slot_starts_at: '15:30',
    pickup_name: 'Ana López García',
    pickup_phone: '5598765432',
  })
  expect(body.items[0]).toEqual({ kind: 'order', offering_id: 101, quantity: 1 })
  expect(body.items[1].kind).toBe('design')
  expect(body.items[1].design).toMatchObject({
    people: 100,
    form: 'round',
    tiers: 2,
    cake_type: 'tres_leches',
    bread: 'chocolate',
    filling_base: 'queso',
    filling_flavors: ['zarzamora'],
    coverage_color: '#f6b8ca',
    decoration: 'flores',
    decoration_color: '#d44c48',
    decoration_image_id: null,
    wafer: false,
    wafer_layout: null,
    occasion: 'birthday',
  })
  expect(body.items[1].design.message_layout).toMatchObject({ text: 'Feliz cumpleaños Ana', color_mode: 'tones', color: 'deep', arrangement: 'arc', rotation_deg: 0 })
  // Nunca viajan montos, la huella ni `requiresQuote`.
  expect(JSON.stringify(body)).not.toMatch(/3825|baseDeposit|requiresQuote|pastel15kg|total/)
  // El carrito se vacía al crear el pedido; el pedido queda en la historia para el pago.
  expect((await storedCart(page)).items).toEqual([])
  expect(await page.evaluate(() => (history.state as { usr?: { orderId?: number } }).usr?.orderId)).toBe(57)
})

test('a lost connection keeps the same key for the retry, and a double click sends one order', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  const orders = await mockOrders(page, ['abort', { status: 200, body: placedOrder() }])
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await continueButton(page).dblclick()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('No pudimos crear tu pedido')
  await expect(alert).toContainText('No pudimos conectar con la pastelería. Revisa tu conexión y vuelve a intentarlo: tu pedido no se duplica.')
  expect(orders).toHaveLength(1)
  expect((await storedCart(page)).items).toHaveLength(1)
  await continueButton(page).click()
  await expect(page).toHaveURL(/\/pedido\/pago$/)
  expect(orders).toHaveLength(2)
  expect(orders[1].headers()['idempotency-key']).toBe(orders[0].headers()['idempotency-key'])
})

test('a slot that just filled up reloads the times and asks for another', async ({ page }) => {
  await signedIn(page)
  const calendar = await mockCalendar(page)
  await mockOrders(page, [{ status: 400, body: { slot_starts_at: ['Ese horario se acaba de llenar. Elige otro.'] } }])
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  const before = calendar.requests.length
  // Mientras tanto, otro pedido llenó las 3:30 pm del 16.
  calendar.setRule((date) => (date === '2026-11-16' ? { available: true, reason: null, fullSlots: ['15:00', '15:30'] } : defaultDay(date)))
  await continueButton(page).click()
  await expect(page.getByRole('alert')).toContainText('Ese horario se acaba de llenar. Elige otro.')
  await expect(page.getByRole('region', { name: 'Fecha y hora' })).toContainText('Ese horario se acaba de llenar. Elige otro.')
  await expect.poll(() => calendar.requests.length).toBeGreaterThan(before)
  await expect(page.getByRole('radio', { name: '3:30 pm Lleno' })).toBeDisabled()
  await expect(page.getByRole('radio', { name: '3:30 pm Lleno' })).not.toBeChecked()
})

test('server limits and stock speak in Spanish, by line and under their field', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page, () => ({ available: true, reason: null }))
  await mockOrders(page, [
    {
      status: 400,
      body: {
        items: { '0': { quantity: ['Solo queda 1.'] } },
        non_field_errors: ['Ya tienes 2 pedidos sin pagar. Paga uno o espera a que venza para hacer otro.'],
        pickup_phone: ['Escribe 10 dígitos, por ejemplo 55 1234 5678.'],
      },
    },
    { status: 429, body: { detail: 'Request was throttled.' }, headers: { 'Retry-After': '600' } },
  ])
  await seedCart(page, [cajetaSlice])
  await page.goto(DELIVERY)
  await day(page, 'Viernes 13 de noviembre').click()
  await page.getByRole('radio', { name: /^Noche/ }).check()
  await slot(page, '6:00 pm').click()
  await continueButton(page).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Rebanada de tres leches de cajeta: Solo queda 1.')
  await expect(alert).toContainText('Ya tienes 2 pedidos sin pagar.')
  await expect(page.getByRole('textbox', { name: 'Teléfono' })).toHaveAccessibleDescription(/Escribe 10 dígitos, por ejemplo 55 1234 5678\./)
  await expect(page.getByRole('textbox', { name: 'Teléfono' })).toHaveAttribute('aria-invalid', 'true')
  await continueButton(page).click()
  await expect(alert).toContainText('Hiciste varios pedidos seguidos. Espera unos minutos y vuelve a intentarlo.')
})

test('checks the date, the time, the name and the phone before sending', async ({ page }) => {
  await signedIn(page, { email: 'g@correo.test', full_name: '', phone: null })
  await mockCalendar(page)
  const orders = await mockOrders(page)
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveValue('')
  await continueButton(page).click()
  await expect(page.getByRole('region', { name: 'Fecha y hora' })).toContainText('Elige la fecha en que recoges tu pedido.')
  await expect(page.getByRole('heading', { level: 2, name: 'Fecha y hora' })).toBeFocused()
  await day(page, 'Lunes 16 de noviembre').click()
  await continueButton(page).click()
  await expect(page.getByRole('region', { name: 'Fecha y hora' })).toContainText('Elige la hora en que recoges tu pedido.')
  await slot(page, '11:00 am').click()
  await page.getByRole('textbox', { name: 'Teléfono' }).fill('55 1234')
  await continueButton(page).click()
  await expect(page.getByRole('textbox', { name: 'Nombre' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveAccessibleDescription('Escribe el nombre de quien recoge.')
  await expect(page.getByRole('textbox', { name: 'Teléfono' })).toHaveAccessibleDescription(/Escribe 10 dígitos/)
  expect(orders).toHaveLength(0)
})

test('"Otra decoración" uploads its image and the order waits for the quote, with nothing to pay', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  const uploads = await mockImageUploads(page)
  const orders = await mockOrders(page, [{ status: 201, body: placedOrder({ id: 58, status: 'awaiting_quote', payment: null, payment_due_at: null }) }])
  await page.goto('/')
  const key = await saveImage(page)
  await writeCart(page, [quoteDesignLine(key)])
  await page.goto(DELIVERY)
  await expect(page.getByText('Tu pedido queda en pausa por cotización')).toBeVisible()
  await chooseMonday(page)
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Recibimos tu pedido' })).toBeFocused()
  await expect(page.getByText('En pausa por cotización')).toBeVisible()
  await expect(page.getByText('Hasta entonces no pagas nada.')).toBeVisible()
  await expect(page.getByText('Pedido 58, para recoger el lunes 16 de noviembre a las 3:30 pm, a nombre de Ana López García.')).toBeVisible()
  expect(uploads).toHaveLength(1)
  const multipart = uploads[0].postData() ?? ''
  expect(uploads[0].headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/)
  expect(multipart).toContain('name="purpose"')
  expect(multipart).toContain('decoration')
  expect(multipart).toContain('filename="idea.png"')
  expect(orders[0].postDataJSON().items[0].design).toMatchObject({ decoration: 'otra', decoration_image_id: '0b5a6f0e-0000-4000-8000-000000000001' })
  expect(await page.evaluate((cartKey) => JSON.parse(localStorage.getItem(cartKey) ?? '{}').items, CART_KEY)).toEqual([])
})

test('a design whose image is gone from this browser says how to fix it and sends nothing', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  const uploads = await mockImageUploads(page)
  const orders = await mockOrders(page)
  await seedCart(page, [quoteDesignLine('no-esta-en-indexeddb')])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page.getByRole('alert')).toContainText('Su imagen ya no está en este navegador. Edita el pedido desde tu carrito y elígela otra vez.')
  expect(uploads).toHaveLength(0)
  expect(orders).toHaveLength(0)
})

test('a cart with the showcase and a design cannot reach the calendar', async ({ page }) => {
  await signedIn(page)
  const calendar = await mockCalendar(page)
  await seedCart(page, [cajetaSlice, designLine])
  await page.goto(DELIVERY)
  await expect(page.getByText('Tu carrito no cabe en un solo pedido')).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Volver al carrito' })).toHaveAttribute('href', '/carrito')
  await expect(continueButton(page)).toHaveCount(0)
  expect(calendar.requests).toHaveLength(0)
})

test('without the WhatsApp number the home delivery shows the pending marker', async ({ page }) => {
  await page.unrouteAll()
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page, emptyStoreInfo)
  await signedIn(page)
  await mockCalendar(page)
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await expect(page.getByRole('region', { name: 'Forma de entrega' }).locator('[data-pendiente]')).toHaveText('[número por confirmar]')
  await expect(page.getByTestId('franja').locator('[data-pendiente]')).toHaveText('[número por confirmar]')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('fits 390 px, with the summary after the form', async ({ page }) => {
    await signedIn(page)
    await mockCalendar(page)
    await seedCart(page, [durazno, designLine])
    await page.goto(DELIVERY)
    await day(page, 'Lunes 16 de noviembre').click()
    await expect(page.getByRole('radio', { name: '11:00 am' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const button = await continueButton(page).boundingBox()
    const summary = await page.getByRole('region', { name: 'Resumen' }).boundingBox()
    expect(summary!.y).toBeGreaterThan(button!.y)
  })
})
