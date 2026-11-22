import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ana, bruno, logIn, mockAuth, mockSwitchableAccounts, signedIn, withoutGoogle } from './support/auth.ts'
import type { Accounts } from './support/auth.ts'
import {
  cajetaSlice,
  calendarBody,
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
  seedDeliveryChoice,
  storedCart,
  storedDeliveryChoice,
  writeCart,
} from './support/checkout.ts'
import { emptyStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * `/pedido/entrega` (D66, tanda 3): sesión, marco de la compra y el formulario en dos partes, "Fecha y hora" y
 * "¿Quién recoge?", con la parte en `?paso=2`. El calendario con días y horarios llenos, quién recoge y la creación del
 * pedido con `Idempotency-Key`, sus errores y la pausa por cotización.
 */

const DELIVERY = '/pedido/entrega'
const PART_TWO = /\/pedido\/entrega\?paso=2$/
const PART_ONE = /\/pedido\/entrega$/
const CHOICE_KEY = 'ilusion.deliveryChoice.v1'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
})

const day = (page: Page, label: RegExp | string) => page.getByRole('button', { name: label })
const continueButton = (page: Page) => page.getByRole('button', { name: 'Continuar al pago' })
const nextButton = (page: Page) => page.getByRole('button', { name: 'Continuar', exact: true })
const scheduleTitle = (page: Page) => page.getByRole('heading', { level: 2, name: 'Fecha y hora' })
const pickupTitle = (page: Page) => page.getByRole('heading', { level: 2, name: '¿Quién recoge?' })
const parts = (page: Page) => page.getByRole('list', { name: 'Partes de la entrega' })
/** El chip visible de un horario: el radio va oculto dentro de su etiqueta, y el cliente toca la etiqueta. */
const slot = (page: Page, time: string) => page.locator('label').filter({ hasText: new RegExp(`^${time}$`) })
/** El chip de un periodo (mañana, tarde o noche): también lleva el radio oculto. */
const period = (page: Page, name: string) => page.locator('label').filter({ hasText: new RegExp(`^${name}`) })

/** Elige el lunes 16 de noviembre a las 3:30 pm. */
async function chooseMonday(page: Page) {
  await day(page, 'Lunes 16 de noviembre').click()
  await period(page, 'Tarde').click()
  await slot(page, '3:30 pm').click()
}

/** De "Fecha y hora" a "¿Quién recoge?". */
async function toPickup(page: Page) {
  await nextButton(page).click()
  await expect(page).toHaveURL(PART_TWO)
  await expect(pickupTitle(page)).toBeFocused()
}

test('without a session it asks to sign in and comes back here', async ({ page }) => {
  await mockAuth(page)
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fpedido%2Fentrega$/)
})

test('the time is one list of hours: the periods are a one-line segmented filter, not another list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signedIn(page)
  await mockCalendar(page)
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await day(page, 'Lunes 16 de noviembre').click()
  // Correcciones del 21 de noviembre: mañana, tarde y noche en un solo renglón, también junto al calendario en escritorio.
  const periods = await Promise.all(['Mañana', 'Tarde', 'Noche'].map(async (name) => (await period(page, name).boundingBox())!))
  expect(new Set(periods.map((box) => Math.round(box.y))).size).toBe(1)
  for (const box of periods) expect(box.height).toBeLessThan(56)
  // El rango no se repite a la vista (las horas lo dicen); queda en el nombre del radio.
  await expect(period(page, 'Mañana')).toHaveText('Mañana 10:30 am a 1:30 pm')
  await expect(period(page, 'Mañana').locator('span.sr-only')).toHaveText('10:30 am a 1:30 pm')
  // La única opción llena es la hora elegida: el periodo elegido no se pinta de `mermelada`.
  const fill = (locator: ReturnType<typeof period>) => locator.evaluate((element) => getComputedStyle(element).backgroundColor)
  await period(page, 'Tarde').click()
  await slot(page, '3:30 pm').click()
  expect(await fill(period(page, 'Tarde'))).not.toBe(await fill(slot(page, '3:30 pm')))
  await expect(period(page, 'Tarde')).toHaveCSS('font-weight', '600')
  // Sin otro bloque de horario general compitiendo con las horas.
  await expect(page.getByRole('region', { name: 'Fecha y hora' })).not.toContainText('10:00 a 22:30')
})

test('the checkout frame, the calendar with full days and slots, and who picks up from the account', async ({ page }) => {
  await signedIn(page)
  const calendar = await mockCalendar(page)
  await seedCart(page, [durazno, designLine])
  await page.goto(DELIVERY)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿Cómo recibes tu pedido?')
  await expect(page).toHaveTitle('¿Cómo recibes tu pedido? · Pastelería Ilusión')
  // El marco de la compra: "Volver al carrito" en la barra, sin la navegación del sitio.
  const banner = page.getByRole('banner')
  await expect(banner.getByRole('link', { name: 'Volver al carrito' })).toHaveAttribute('href', '/carrito')
  await expect(banner.getByRole('navigation', { name: 'Principal' })).toHaveCount(0)
  // La entrega no lleva franja arriba del toldo: ni los pagos (tanda 1) ni el WhatsApp (correcciones del 21 de noviembre).
  await expect(page.getByTestId('franja')).toHaveCount(0)
  await expect(page.getByText('¿Dudas con tu pedido?')).toHaveCount(0)
  await expect(page.getByTestId('toldo')).toBeVisible()
  await expect(page.getByRole('contentinfo')).not.toContainText('Pide un deseo')
  const steps = page.getByRole('navigation', { name: 'Pasos de tu compra' })
  await expect(steps.locator('[aria-current="step"]')).toContainText('Entrega')
  await expect(steps).toContainText('Carrito, hecho')

  // Las dos partes de la entrega, sin números: la actual con `aria-current` y "parte 1 de 2" para el lector.
  await expect(parts(page).getByRole('listitem')).toHaveCount(2)
  const currentPart = parts(page).locator('[aria-current="step"]')
  await expect(currentPart).toHaveText('Fecha y hora, parte 1 de 2')
  await expect(parts(page)).toContainText('¿Quién recoge?, parte 2 de 2')
  // Quién recoge va en la segunda parte.
  await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveCount(0)

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
  await expect(page.getByRole('group', { name: 'Horario del lunes 16' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Mañana 10:30 am a 1:30 pm' })).toBeChecked()
  await period(page, 'Tarde').click()
  await expect(page.getByRole('radio', { name: 'Tarde 2:00 a 5:30 pm' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Noche 6:00 a 10:00 pm' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '3:00 pm Lleno' })).toBeDisabled()
  await slot(page, '3:30 pm').click()
  await expect(page.getByRole('radio', { name: '3:30 pm' })).toBeChecked()

  // El resumen, con la entrega y lo elegido.
  const summary = page.getByRole('region', { name: 'Resumen' })
  await expect(summary).toContainText('Tres leches de durazno')
  await expect(summary).toContainText('Completo, 1 pieza')
  await expect(summary).toContainText('15 kg')
  await expect(summary).toContainText('$4,175 MXN')
  await expect(summary).toContainText('Incluye depósito por base')
  await expect(summary.getByRole('term').filter({ hasText: 'Entrega' })).toBeVisible()
  await expect(summary).toContainText('Recoger en la pastelería')
  await expect(summary).toContainText('Lunes 16 de noviembre, 3:30 pm')

  // Quién recoge, con la cuenta, en la segunda parte.
  await toPickup(page)
  await expect(parts(page).locator('[aria-current="step"]')).toHaveText('¿Quién recoge?, parte 2 de 2')
  await expect(parts(page)).toContainText('Fecha y hora, parte 1 de 2, hecho')
  await expect(page.getByTestId('entrega-elegida')).toContainText('Recoges en la pastelería')
  await expect(page.getByTestId('entrega-elegida')).toContainText('Lunes 16 de noviembre, 3:30 pm')
  await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveValue(ana.full_name)
  await expect(page.getByRole('textbox', { name: 'Teléfono' })).toHaveValue('55 1234 5678')
  // El calendario ya no está en esta parte.
  await expect(page.getByRole('button', { name: 'Mes siguiente' })).toHaveCount(0)
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
  await toPickup(page)
  await page.getByRole('textbox', { name: 'Teléfono' }).fill('55-9876-5432')
  await continueButton(page).click()
  await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
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
  // La fecha y la hora elegidas se olvidan con el pedido creado.
  expect(await page.evaluate((key) => sessionStorage.getItem(key), CHOICE_KEY)).toBeNull()
})

test('a lost connection keeps the same key for the retry, and a double click sends one order', async ({ page }) => {
  await signedIn(page)
  await mockCalendar(page)
  const orders = await mockOrders(page, ['abort', { status: 200, body: placedOrder() }])
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await toPickup(page)
  await continueButton(page).dblclick()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('No pudimos crear tu pedido')
  await expect(alert).toContainText('No pudimos conectar con la pastelería. Revisa tu conexión y vuelve a intentarlo: tu pedido no se duplica.')
  // Un error sin campo se queda en "¿Quién recoge?", con el aviso enfocado.
  await expect(page).toHaveURL(PART_TWO)
  await expect(page.locator(':focus')).toContainText('No pudimos crear tu pedido')
  expect(orders).toHaveLength(1)
  expect((await storedCart(page)).items).toHaveLength(1)
  await continueButton(page).click()
  await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
  expect(orders).toHaveLength(2)
  expect(orders[1].headers()['idempotency-key']).toBe(orders[0].headers()['idempotency-key'])
})

test('a slot that just filled up goes back to the date and time, reloads the times and asks for another', async ({ page }) => {
  await signedIn(page)
  const calendar = await mockCalendar(page)
  await mockOrders(page, [{ status: 400, body: { slot_starts_at: ['Ese horario se acaba de llenar. Elige otro.'] } }])
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await toPickup(page)
  const before = calendar.requests.length
  // Mientras tanto, otro pedido llenó las 3:30 pm del 16.
  calendar.setRule((date) => (date === '2026-11-16' ? { available: true, reason: null, fullSlots: ['15:00', '15:30'] } : defaultDay(date)))
  await continueButton(page).click()
  await expect(page).toHaveURL(PART_ONE)
  await expect(page.getByRole('alert')).toContainText('Ese horario se acaba de llenar. Elige otro.')
  await expect(page.locator(':focus')).toContainText('Ese horario se acaba de llenar. Elige otro.')
  await expect(page.getByRole('region', { name: 'Fecha y hora' })).toContainText('Ese horario se acaba de llenar. Elige otro.')
  await expect.poll(() => calendar.requests.length).toBeGreaterThan(before)
  await expect(page.getByRole('radio', { name: '3:30 pm Lleno' })).toBeDisabled()
  await expect(page.getByRole('radio', { name: '3:30 pm Lleno' })).not.toBeChecked()
  // Volver a "Fecha y hora" no apiló otra entrada: atrás lleva al carrito, no a "¿Quién recoge?".
  await page.goBack()
  await expect(page).not.toHaveURL(PART_TWO)
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
  await period(page, 'Noche').click()
  await slot(page, '6:00 pm').click()
  await toPickup(page)
  await continueButton(page).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Rebanada de tres leches de cajeta: Solo queda 1.')
  await expect(alert).toContainText('Ya tienes 2 pedidos sin pagar.')
  // Un error de quién recoge se queda en su parte, bajo su campo.
  await expect(page).toHaveURL(PART_TWO)
  await expect(page.getByRole('textbox', { name: 'Teléfono' })).toHaveAccessibleDescription(/Escribe 10 dígitos, por ejemplo 55 1234 5678\./)
  await expect(page.getByRole('textbox', { name: 'Teléfono' })).toHaveAttribute('aria-invalid', 'true')
  await continueButton(page).click()
  await expect(alert).toContainText('Hiciste varios pedidos seguidos. Espera unos minutos y vuelve a intentarlo.')
})

test('checks the date and the time before the second part, and the name and the phone before sending', async ({ page }) => {
  await signedIn(page, { email: 'g@correo.test', full_name: '', phone: null })
  await mockCalendar(page)
  const orders = await mockOrders(page)
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await nextButton(page).click()
  await expect(page).toHaveURL(PART_ONE)
  await expect(page.getByRole('region', { name: 'Fecha y hora' })).toContainText('Elige la fecha en que recoges tu pedido.')
  await expect(scheduleTitle(page)).toBeFocused()
  await day(page, 'Lunes 16 de noviembre').click()
  await nextButton(page).click()
  await expect(page.getByRole('region', { name: 'Fecha y hora' })).toContainText('Elige la hora en que recoges tu pedido.')
  await expect(page).toHaveURL(PART_ONE)
  await slot(page, '11:00 am').click()
  await toPickup(page)
  await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveValue('')
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
  await chooseMonday(page)
  await toPickup(page)
  await expect(page.getByText('Tu pedido queda en pausa por cotización')).toBeVisible()
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
  await toPickup(page)
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
  await expect(nextButton(page)).toHaveCount(0)
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
  // La dirección de recoger (D71) y el WhatsApp de la entrega a domicilio, cada uno con su marcador.
  await expect(page.getByRole('region', { name: 'Forma de entrega' }).locator('[data-pendiente]')).toHaveText([
    '[Dirección por confirmar]',
    '[número por confirmar]',
  ])
  await expect(page.getByTestId('franja')).toHaveCount(0)
})

test.describe('the two parts in the URL', () => {
  test('the part goes in ?paso=2: back goes from the second part to the first and from the first to the cart', async ({ page }) => {
    await signedIn(page)
    await mockCalendar(page)
    await seedCart(page, [durazno])
    await page.goto('/carrito')
    await page.getByRole('region', { name: 'Resumen' }).getByRole('link', { name: 'Continuar a entrega' }).click()
    await expect(page).toHaveURL(PART_ONE)
    await chooseMonday(page)
    await toPickup(page)
    await page.goBack()
    await expect(page).toHaveURL(PART_ONE)
    await expect(scheduleTitle(page)).toBeVisible()
    // Lo elegido sigue elegido.
    await expect(day(page, 'Lunes 16 de noviembre')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('radio', { name: '3:30 pm' })).toBeChecked()
    await page.goForward()
    await expect(page).toHaveURL(PART_TWO)
    await expect(pickupTitle(page)).toBeVisible()
    await page.goBack()
    await page.goBack()
    await expect(page).toHaveURL(/\/carrito$/)
  })

  test('"Cambiar" goes back to the first part without stacking another entry', async ({ page }) => {
    await signedIn(page)
    await mockCalendar(page)
    await seedCart(page, [durazno])
    await page.goto('/carrito')
    await page.getByRole('region', { name: 'Resumen' }).getByRole('link', { name: 'Continuar a entrega' }).click()
    await chooseMonday(page)
    await toPickup(page)
    await page.getByTestId('entrega-elegida').getByRole('button', { name: 'Cambiar fecha y hora' }).click()
    await expect(page).toHaveURL(PART_ONE)
    await expect(scheduleTitle(page)).toBeFocused()
    await page.goBack()
    await expect(page).toHaveURL(/\/carrito$/)
  })

  test('?paso=2 without a chosen time is replaced by the first part', async ({ page }) => {
    await signedIn(page)
    await mockCalendar(page)
    await seedCart(page, [durazno])
    await page.goto('/carrito')
    await page.goto(`${DELIVERY}?paso=2`)
    await expect(page).toHaveURL(PART_ONE)
    await expect(scheduleTitle(page)).toBeVisible()
    await expect(pickupTitle(page)).toHaveCount(0)
    // Se reemplazó: atrás no vuelve a la segunda parte.
    await page.goBack()
    await expect(page).toHaveURL(/\/carrito$/)
  })

  test('a reload in the second part keeps the date and the time, never the name or the phone', async ({ page }) => {
    await signedIn(page)
    await mockCalendar(page)
    const orders = await mockOrders(page)
    await seedCart(page, [durazno])
    await page.goto(DELIVERY)
    await chooseMonday(page)
    await toPickup(page)
    await page.reload()
    await expect(page).toHaveURL(PART_TWO)
    await expect(pickupTitle(page)).toBeVisible()
    await expect(page.getByTestId('entrega-elegida')).toContainText('Lunes 16 de noviembre, 3:30 pm')
    const stored = await page.evaluate((key) => sessionStorage.getItem(key) ?? '', CHOICE_KEY)
    expect(stored).toContain('2026-11-16')
    expect(stored).not.toMatch(/Ana|López|5512345678/)
    // De regreso, el calendario abre con el día y la hora elegidos.
    await page.getByTestId('entrega-elegida').getByRole('button', { name: 'Cambiar fecha y hora' }).click()
    await expect(day(page, 'Lunes 16 de noviembre')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('radio', { name: '3:30 pm' })).toBeChecked()
    await toPickup(page)
    await continueButton(page).click()
    await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
    expect(orders[0].postDataJSON()).toMatchObject({ delivery_date: '2026-11-16', slot_starts_at: '15:30' })
  })

  test('focus goes to the title of the new part, below the sticky bar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 })
    await signedIn(page)
    await mockCalendar(page)
    await seedCart(page, [durazno])
    await page.goto(DELIVERY)
    await chooseMonday(page)
    await toPickup(page)
    const header = (await page.getByTestId('barra').boundingBox())!
    const title = (await pickupTitle(page).boundingBox())!
    expect(title.y).toBeGreaterThanOrEqual(header.y + header.height)
    await page.getByTestId('entrega-elegida').getByRole('button', { name: 'Cambiar fecha y hora' }).click()
    await expect(scheduleTitle(page)).toBeFocused()
    await page.goForward()
    await expect(pickupTitle(page)).toBeFocused()
  })
})

test.describe('a stored choice counts only after the API confirms it', () => {
  test('a stored day the API no longer offers is dropped for good, even after the one-time jump to the next month', async ({ page }) => {
    // Eligió el lunes 30 a las 3:30 pm y recarga el domingo 29: noviembre ya no tiene días y el calendario salta a diciembre.
    await page.clock.setFixedTime(new Date('2026-11-29T18:00:00Z'))
    await signedIn(page)
    await page.route('**/api/v1/delivery-slots/**', async (route) => {
      const url = new URL(route.request().url())
      const rule = (date: string) => (date <= '2026-11-30' ? { available: false, reason: 'too_soon' as const } : { available: true, reason: null })
      const body = { ...calendarBody(url.searchParams.get('start') ?? '', url.searchParams.get('end') ?? '', rule), earliest_date: '2026-12-01' }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    const orders = await mockOrders(page)
    await seedCart(page, [durazno])
    await seedDeliveryChoice(page, '2026-11-30', '15:30')
    await page.goto(`${DELIVERY}?paso=2`)
    await expect(page.getByText('Diciembre 2026')).toBeVisible()
    await expect(page).toHaveURL(PART_ONE)
    await expect(pickupTitle(page)).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Fecha y hora' })).toContainText('La fecha que elegiste ya no está disponible. Elige otra.')
    // Ni el resumen ni lo guardado la traen de vuelta.
    const summary = page.getByRole('region', { name: 'Resumen' })
    await expect(summary).toContainText('Por elegir')
    await expect(summary).not.toContainText('30 de noviembre')
    await expect.poll(() => storedDeliveryChoice(page)).toBeNull()
    await nextButton(page).click()
    await expect(page).toHaveURL(PART_ONE)
    await expect(page.getByRole('region', { name: 'Fecha y hora' })).toContainText('Elige la fecha en que recoges tu pedido.')
    expect(orders).toHaveLength(0)
  })

  test('a stored time that filled up goes back to the first part and says so', async ({ page }) => {
    await signedIn(page)
    await mockCalendar(page, (date) => (date === '2026-11-16' ? { available: true, reason: null, fullSlots: ['15:00', '15:30'] } : defaultDay(date)))
    await seedCart(page, [durazno])
    await seedDeliveryChoice(page, '2026-11-16', '15:30')
    await page.goto(`${DELIVERY}?paso=2`)
    await expect(page.getByRole('region', { name: 'Fecha y hora' })).toContainText('La hora que elegiste ya no está disponible. Elige otra.')
    await expect(page).toHaveURL(PART_ONE)
    await expect(pickupTitle(page)).toHaveCount(0)
    // El día sigue elegido; la hora llena, no.
    await expect(day(page, 'Lunes 16 de noviembre')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('radio', { name: '3:30 pm Lleno' })).toBeDisabled()
    await expect(page.getByRole('radio', { name: '3:30 pm Lleno' })).not.toBeChecked()
    await slot(page, '4:00 pm').click()
    await expect(page.getByRole('region', { name: 'Fecha y hora' })).not.toContainText('ya no está disponible')
    await toPickup(page)
    await expect(page.getByTestId('entrega-elegida')).toContainText('Lunes 16 de noviembre, 4:00 pm')
  })

  test('the second part waits for the API before using a stored choice', async ({ page }) => {
    await signedIn(page)
    let release: () => void = () => {}
    const answered = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/v1/delivery-slots/**', async (route) => {
      await answered
      const url = new URL(route.request().url())
      const body = calendarBody(url.searchParams.get('start') ?? '', url.searchParams.get('end') ?? '')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {})
    })
    await seedCart(page, [durazno])
    await seedDeliveryChoice(page, '2026-11-16', '15:30')
    await page.goto(`${DELIVERY}?paso=2`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Mientras tanto no hay quién recoge ni con qué mandar el pedido, y la URL no se pierde.
    await expect(page.getByText('Revisando tu fecha y hora…')).toBeAttached()
    await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveCount(0)
    await expect(continueButton(page)).toHaveCount(0)
    await expect(page).toHaveURL(PART_TWO)
    release()
    await expect(pickupTitle(page)).toBeVisible()
    await expect(page.getByTestId('entrega-elegida')).toContainText('Lunes 16 de noviembre, 3:30 pm')
  })

  test('a stored month left before it loads is not used', async ({ page }) => {
    // Lo guardado es de diciembre; antes de que diciembre responda, la persona vuelve a noviembre.
    await signedIn(page)
    await page.route('**/api/v1/delivery-slots/**', async (route) => {
      const url = new URL(route.request().url())
      const start = url.searchParams.get('start') ?? ''
      if (start === '2026-12-01') await new Promise((resolve) => setTimeout(resolve, 1500))
      const body = calendarBody(start, url.searchParams.get('end') ?? '')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {})
    })
    await seedCart(page, [durazno])
    await seedDeliveryChoice(page, '2026-12-02', '15:30')
    await page.goto(DELIVERY)
    await page.getByRole('button', { name: 'Mes anterior' }).click()
    await expect(page.getByText('Noviembre 2026')).toBeVisible()
    await expect(day(page, 'Lunes 16 de noviembre')).toBeEnabled()
    const summary = page.getByRole('region', { name: 'Resumen' })
    await expect(summary).toContainText('Por elegir')
    await page.getByRole('button', { name: 'Mes siguiente' }).click()
    await expect(page.getByText('Diciembre 2026')).toBeVisible()
    await expect(day(page, 'Miércoles 2 de diciembre')).toBeEnabled()
    await expect(day(page, 'Miércoles 2 de diciembre')).toHaveAttribute('aria-pressed', 'false')
    await expect(summary).toContainText('Por elegir')
    await nextButton(page).click()
    await expect(page).toHaveURL(PART_ONE)
  })
})

test('signing out forgets the date and the time chosen in this tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signedIn(page)
  await mockCalendar(page)
  await seedCart(page, [durazno])
  await page.goto(DELIVERY)
  await chooseMonday(page)
  await expect.poll(() => storedDeliveryChoice(page)).toContain('2026-11-16')
  await page.goto('/')
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('dialog', { name: 'Menú' }).getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect.poll(async () => (await storedCart(page))?.items ?? []).toEqual([])
  await expect.poll(() => storedDeliveryChoice(page)).toBeNull()
})

/**
 * La fecha y la hora son de la cuenta que las eligió (tanda 5): una sesión que termina sola no las borra, pero otra cuenta
 * que entra en la pestaña no las hereda.
 */
test.describe('the chosen date and time belong to the account', () => {
  test.beforeEach(async ({ page }) => {
    await withoutGoogle(page)
    await mockCalendar(page)
  })

  test('another account signing in after the session ended does not get them', async ({ page }) => {
    const accounts: Accounts = { current: ana }
    await mockSwitchableAccounts(page, accounts)
    await seedCart(page, [durazno])
    await page.goto(DELIVERY)
    await chooseMonday(page)
    await expect.poll(() => storedDeliveryChoice(page)).toContain('2026-11-16')
    // La sesión termina sola: la entrega pide entrar y lo elegido se queda.
    accounts.current = null
    await page.reload()
    await expect(page).toHaveURL(/\/entrar\?volver=%2Fpedido%2Fentrega$/)
    expect(await storedDeliveryChoice(page)).toContain('2026-11-16')
    await logIn(page, bruno.email)
    await expect(page).toHaveURL(PART_ONE)
    await expect.poll(() => storedDeliveryChoice(page)).toBeNull()
    // Con su propio carrito, Bruno ve el calendario sin nada elegido.
    await writeCart(page, [durazno])
    await page.reload()
    await expect(day(page, 'Lunes 16 de noviembre')).toBeEnabled()
    await expect(day(page, 'Lunes 16 de noviembre')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('region', { name: 'Resumen' })).toContainText('Por elegir')
  })

  test('a reload of the same account keeps them, without the email', async ({ page }) => {
    await mockSwitchableAccounts(page, { current: ana })
    await seedCart(page, [durazno])
    await page.goto(DELIVERY)
    await chooseMonday(page)
    await expect.poll(() => storedDeliveryChoice(page)).toContain('2026-11-16')
    await page.reload()
    await expect(day(page, 'Lunes 16 de noviembre')).toHaveAttribute('aria-pressed', 'true')
    const stored = JSON.parse((await storedDeliveryChoice(page)) ?? 'null') as Record<string, unknown> | null
    expect(stored?.owner).toEqual(expect.any(String))
    expect(JSON.stringify(stored)).not.toContain(ana.email)
  })
})

test.describe('the part transition', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the new part slides in from the right going forward and from the left going back', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await signedIn(page)
    await mockCalendar(page)
    await seedCart(page, [durazno])
    await page.goto(DELIVERY)
    const part = page.getByTestId('parte-entrega')
    await expect(part).toHaveCSS('animation-name', 'none')
    await chooseMonday(page)
    await toPickup(page)
    await expect(part).toHaveCSS('animation-name', 'paso-derecha')
    await page.goBack()
    await expect(scheduleTitle(page)).toBeFocused()
    await expect(part).toHaveCSS('animation-name', 'paso-izquierda')
  })

  test('with reduced motion the part changes without moving', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await signedIn(page)
    await mockCalendar(page)
    await seedCart(page, [durazno])
    await page.goto(DELIVERY)
    await chooseMonday(page)
    await toPickup(page)
    const part = page.getByTestId('parte-entrega')
    await expect(part).toHaveCSS('animation-name', 'none')
    expect(await part.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0)
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  const bar = (page: Page) => page.getByTestId('barra-entrega')
  const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  test('fits 390 px in both parts, with the sticky bar and the summary as a panel after the card', async ({ page }) => {
    await signedIn(page)
    await mockCalendar(page)
    await seedCart(page, [durazno, designLine])
    await page.goto(DELIVERY)
    // La barra fija: sin elegir, lo pide; "Continuar" es el único botón principal.
    await expect(bar(page)).toBeVisible()
    await expect(bar(page)).toContainText('Elige fecha y hora')
    await expect(nextButton(page)).toHaveCount(1)
    const shown = (await bar(page).boundingBox())!
    expect(shown.y + shown.height).toBeLessThanOrEqual(844)
    // La forma de entrega es una franja corta: el título del calendario cabe en la primera pantalla, sobre la barra.
    await expect(scheduleTitle(page)).toBeVisible()
    const title = (await scheduleTitle(page).boundingBox())!
    expect(title.y + title.height).toBeLessThanOrEqual(shown.y)
    await day(page, 'Lunes 16 de noviembre').click()
    await expect(page.getByRole('radio', { name: '11:00 am' })).toBeVisible()
    // Los periodos van en un control de tres y los horarios en tres columnas.
    const periods = await Promise.all(['Mañana', 'Tarde', 'Noche'].map(async (name) => (await period(page, name).boundingBox())!))
    expect(new Set(periods.map((box) => Math.round(box.y))).size).toBe(1)
    const slots = await Promise.all(['10:30 am', '11:00 am', '11:30 am', '12:00 pm'].map(async (time) => (await slot(page, time).boundingBox())!))
    expect(Math.round(slots[0].y)).toBe(Math.round(slots[2].y))
    expect(slots[3].y).toBeGreaterThan(slots[0].y)
    await period(page, 'Tarde').click()
    await slot(page, '3:30 pm').click()
    await expect(bar(page)).toContainText('Recoges el lunes 16 nov.')
    await expect(bar(page)).toContainText('3:30 pm')
    expect(await noOverflow(page)).toBeLessThanOrEqual(0)
    // El resumen: un panel que se abre, después de la tarjeta y antes de la barra.
    const panel = page.getByRole('group').filter({ hasText: 'Resumen del pedido' })
    await expect(panel).toContainText('2 productos')
    await expect(panel).toContainText('$4,175 MXN')
    const card = (await page.getByRole('region', { name: 'Fecha y hora' }).boundingBox())!
    const panelBox = (await panel.boundingBox())!
    expect(panelBox.y).toBeGreaterThan(card.y + card.height - 1)
    await panel.getByText('Resumen del pedido').click()
    await expect(panel).toContainText('Tres leches de durazno')
    await expect(panel).toContainText('Lunes 16 de noviembre, 3:30 pm')

    await bar(page).getByRole('button', { name: 'Continuar' }).click()
    await expect(page).toHaveURL(PART_TWO)
    await expect(pickupTitle(page)).toBeFocused()
    await expect(bar(page)).toContainText('Total estimado')
    await expect(bar(page)).toContainText('$4,175 MXN')
    await expect(continueButton(page)).toHaveCount(1)
    await expect(bar(page).getByRole('button', { name: 'Continuar al pago' })).toBeVisible()
    expect(await noOverflow(page)).toBeLessThanOrEqual(0)
    // Con el campo enfocado, la barra queda debajo de él, sin taparlo.
    await page.getByRole('textbox', { name: 'Teléfono' }).focus()
    const phone = (await page.getByRole('textbox', { name: 'Teléfono' }).boundingBox())!
    const barBox = (await bar(page).boundingBox())!
    expect(phone.y + phone.height).toBeLessThanOrEqual(barBox.y)
  })

  test('the sticky bar sends the order from the second part', async ({ page }) => {
    await signedIn(page)
    await mockCalendar(page)
    const orders = await mockOrders(page)
    await seedCart(page, [durazno])
    await page.goto(DELIVERY)
    await chooseMonday(page)
    await bar(page).getByRole('button', { name: 'Continuar' }).click()
    await bar(page).getByRole('button', { name: 'Continuar al pago' }).click()
    await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
    expect(orders).toHaveLength(1)
  })
})
