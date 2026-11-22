import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { accountOrder, mockOrderDetail } from './support/account-orders.ts'
import { mockAuth, signedIn } from './support/auth.ts'
import { NOW } from './support/checkout.ts'
import {
  CLIENT_SECRET,
  fastPolling,
  latestPayment,
  MP_URL,
  mockMercadoPago,
  mockPayment,
  mockStripe,
  ORDER_ID,
  paymentError,
  paymentState,
  receivedState,
  startedPayment,
  stripeCalls,
  TEST_KEY,
} from './support/payments.ts'
import { emptyStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * `/pedido/pago` (D68, frontend): el pedido de `?pedido=` (o del estado de la navegación), el desglose de la API, los
 * tres métodos, sus estados (procesando, rechazado, venció, reembolso, apartado) y los errores del inicio del pago. La
 * API y Stripe.js van simulados (`e2e/support/payments.ts`).
 */

const PAYMENT = `/pedido/pago?pedido=${ORDER_ID}`

const mpButton = (page: Page) => page.getByRole('button', { name: 'Pagar $2,287.50 con Mercado Pago' })
const cardButton = (page: Page) => page.getByRole('button', { name: 'Pagar $2,287.50 con tarjeta' })
const cashButton = (page: Page) => page.getByRole('button', { name: 'Apartar y pagar en efectivo' })
const methods = (page: Page) => page.getByRole('region', { name: '¿Cómo quieres pagar?' })
const summary = (page: Page) => page.getByRole('region', { name: 'Resumen de tu pedido' })
const stripeInput = (page: Page, type: 'cardNumber' | 'cardExpiry' | 'cardCvc') => page.locator(`[data-stripe="${type}"]`)

async function fillCard(page: Page, name = 'Ana López García') {
  await stripeInput(page, 'cardNumber').fill('4242 4242 4242 4242')
  await stripeInput(page, 'cardExpiry').fill('12 / 30')
  await stripeInput(page, 'cardCvc').fill('123')
  await page.getByRole('textbox', { name: 'Nombre como aparece en la tarjeta' }).fill(name)
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
  // La confirmación pide el pedido con la sesión: sin simularlo iría al Django real, que rechaza el token falso y cierra la
  // sesión, y la página llevaría a `/entrar` en lugar de quedarse en la confirmación.
  await mockOrderDetail(page, ORDER_ID, { status: 200, body: accountOrder({ id: ORDER_ID, status: 'received' }) })
})

test('without a session it asks to sign in and comes back with the order', async ({ page }) => {
  await mockAuth(page)
  await page.goto(PAYMENT)
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fpedido%2Fpago%3Fpedido%3D57$/)
})

test('shows the order from ?pedido= with the breakdown of the API and the three methods', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  const api = await mockPayment(page)
  await page.goto(PAYMENT)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paga tu pedido')
  await expect(page).toHaveTitle('Paga tu pedido · Pastelería Ilusión')
  // El marco de la compra y el paso 3.
  await expect(page.getByRole('banner').getByRole('link', { name: 'Volver al carrito' })).toBeVisible()
  await expect(page.getByTestId('franja')).toContainText('Pagos procesados por Stripe y Mercado Pago')
  // Sin "¿Dudas con tu pedido?" ni el WhatsApp en la franja (correcciones del 21 de noviembre).
  await expect(page.getByTestId('franja')).not.toContainText('WhatsApp')
  await expect(page.getByRole('navigation', { name: 'Pasos de tu compra' }).locator('[aria-current="step"]')).toContainText('Pago')
  // La frase sale del porcentaje de la API, sin envío: la entrega a domicilio no existe (D66).
  await expect(page.getByText('Hoy pagas el 50% del pedido y el depósito de la base; el resto, al entregar.')).toBeVisible()
  expect(api.gets[0].headers().authorization).toBe('Bearer access-de-prueba')

  const box = summary(page)
  await expect(box).toContainText('Tres leches de durazno')
  await expect(box).toContainText('Completo, 1 pieza')
  await expect(box).toContainText('$350')
  await expect(box).toContainText('Pastel de Diseña tu pastel')
  await expect(box).toContainText('15 kg, 2 pisos')
  await expect(box).toContainText('Recoger en la pastelería el lunes 16 de noviembre a las 3:30 pm')
  await expect(box.getByRole('row', { name: /Total del pedido/ })).toContainText('$4,175 MXN')
  await expect(box.getByRole('row', { name: /Anticipo \(50% del pedido\)/ })).toContainText('$2,087.50')
  await expect(box.getByRole('row', { name: /Depósito de la base/ })).toContainText('$200')
  await expect(box.getByRole('row', { name: /Pagas hoy/ })).toContainText('$2,287.50')
  await expect(box.getByRole('row', { name: /Resto, el día de la entrega/ })).toContainText('$2,087.50')
  await expect(box).not.toContainText('Envío')
  await expect(box).toContainText('Incluye depósito por base')

  await expect(mpButton(page)).toBeEnabled()
  await expect(cardButton(page)).toBeEnabled()
  await expect(methods(page)).toContainText('Procesado por')
  await expect(methods(page).getByRole('img', { name: 'Stripe' })).toBeVisible()
  await expect(methods(page)).toContainText('Lleva $2,287.50 a la pastelería hoy, antes de las 22:30, o el pedido se cancela.')
  await expect(cashButton(page)).toBeEnabled()
  await expect(page.getByRole('link', { name: 'Volver a entrega' })).toHaveAttribute('href', '/pedido/entrega')
  // Stripe recibe la llave pública y los campos llevan los colores de los tokens.
  const calls = await stripeCalls(page)
  expect(calls.key).toBe(TEST_KEY)
  // En desarrollo StrictMode monta dos veces: se revisa qué campos se crearon, no cuántas veces.
  expect([...new Set(calls.created.map((created) => created.type))]).toEqual(['cardNumber', 'cardExpiry', 'cardCvc'])
  expect(JSON.stringify(calls.created[0].options)).toContain('#5e1921')
  await expect(page.locator('body')).not.toContainText(/cotizador|3D|bizcocho|stand|la mitad/i)
})

test('the official logos of Mercado Pago and Stripe show as images, without changing the accessible names', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page)
  await page.goto(PAYMENT)
  const mpLogo = mpButton(page).locator('img')
  await expect(mpLogo).toHaveCount(1)
  await expect(mpLogo).toHaveAttribute('src', /mercado-pago.*\.svg/)
  await expect(mpLogo).toHaveAttribute('alt', '')
  await expect(mpLogo).toHaveAttribute('aria-hidden', 'true')
  await expect(mpLogo).toHaveJSProperty('complete', true)
  expect(await mpLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  const stripeLogo = methods(page).getByRole('img', { name: 'Stripe' })
  // Vite incrusta el SVG chico como data URI: el archivo sigue siendo el original, con su Blurple.
  await expect(stripeLogo).toHaveAttribute('src', /^data:image\/svg\+xml.*533AFD/i)
  expect(await stripeLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  // El logo no cambia el texto de la tarjeta: se sigue leyendo "Procesado por Stripe".
  await expect(page.getByRole('heading', { name: 'Tarjeta de crédito o débito' }).locator('xpath=..')).toContainText('Procesado por')
})

test('arriving from delivery with the order in history.state puts ?pedido= in the URL', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page)
  await page.goto('/')
  await page.evaluate(() => history.replaceState({ usr: { orderId: 57 }, key: 'entrega', idx: 0 }, '', '/pedido/pago'))
  await page.reload()
  await expect(page).toHaveURL(/\/pedido\/pago\?pedido=57$/)
  await expect(mpButton(page)).toBeVisible()
})

test('a reload with ?pedido= asks the API again and shows the same order', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  const api = await mockPayment(page)
  await page.goto(PAYMENT)
  await expect(mpButton(page)).toBeVisible()
  const before = api.gets.length
  await page.reload()
  await expect(mpButton(page)).toBeVisible()
  expect(api.gets.length).toBeGreaterThan(before)
})

test('without an order to pay it says so and offers my orders', async ({ page }) => {
  await signedIn(page)
  await page.goto('/pedido/pago')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paga tu pedido')
  await expect(page.getByRole('heading', { name: 'No encontramos el pedido que vas a pagar' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver mis pedidos' })).toHaveAttribute('href', '/cuenta')
})

test("someone else's order (404) is not found and shows nothing of it", async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page, { states: [paymentError(404, 'not_found', 'No encontrado.')] })
  await page.goto(PAYMENT)
  await expect(page.getByRole('heading', { name: 'No encontramos el pedido que vas a pagar' })).toBeVisible()
  await expect(mpButton(page)).toHaveCount(0)
})

test('a failed load says what to do and tries again', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page, { states: [{ status: 500, body: {} }, { status: 200, body: paymentState() }] })
  await page.goto(PAYMENT)
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('No pudimos cargar tu pedido')
  await alert.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(mpButton(page)).toBeVisible()
})

test('Mercado Pago: one request with an Idempotency-Key and no amount, then the redirect', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockMercadoPago(page)
  const api = await mockPayment(page)
  await page.goto(PAYMENT)
  await mpButton(page).dblclick()
  await expect(page).toHaveURL(MP_URL)
  expect(api.posts).toHaveLength(1)
  const request = api.posts[0]
  expect(request.headers()['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  expect(request.headers().authorization).toBe('Bearer access-de-prueba')
  expect(request.postDataJSON()).toEqual({ method: 'mercadopago' })
})

test('card: Stripe confirms with the client secret and the name, and the screen waits until the order is received', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await fastPolling(page)
  const api = await mockPayment(page, { starts: [startedPayment('stripe')] })
  await page.goto(PAYMENT)
  await fillCard(page)
  // Mientras llega la confirmación del servidor, el pago sigue apartado.
  api.setState([{ status: 200, body: paymentState({ latest: latestPayment('stripe', 'pending') }) }])
  await cardButton(page).click()
  await expect(page.getByText('No cierres esta ventana. En cuanto el banco responda te mostramos la confirmación.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Procesando pago…' })).toBeDisabled()
  expect(api.posts).toHaveLength(1)
  expect(api.posts[0].postDataJSON()).toEqual({ method: 'stripe' })
  const calls = await stripeCalls(page)
  expect(calls.confirms).toEqual([{ secret: CLIENT_SECRET, cardType: 'cardNumber', name: 'Ana López García' }])
  api.setState([{ status: 200, body: receivedState() }])
  await expect(page).toHaveURL(/\/pedido\/confirmacion\?pedido=57$/)
})

test('card: Stripe field errors show under their field and nothing is charged', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  const api = await mockPayment(page, { starts: [startedPayment('stripe')] })
  await page.goto(PAYMENT)
  await cardButton(page).click()
  await expect(page.getByText('Escribe el número de tu tarjeta.')).toBeVisible()
  await expect(page.getByText('Escribe el nombre como aparece en la tarjeta.')).toBeVisible()
  await expect(stripeInput(page, 'cardNumber')).toBeFocused()
  await stripeInput(page, 'cardNumber').fill('4242 4242 4242')
  await stripeInput(page, 'cardExpiry').focus()
  await expect(page.getByText('Al número le faltan dígitos.')).toBeVisible()
  expect(api.posts).toHaveLength(0)
  // La etiqueta lleva al campo de Stripe.
  await page.getByText('Código de seguridad', { exact: true }).click()
  await expect(stripeInput(page, 'cardCvc')).toBeFocused()
})

test('returning from Mercado Pago waits for the server until the order is received', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await fastPolling(page)
  const pending = { status: 200, body: paymentState({ latest: latestPayment('mercadopago', 'pending') }) }
  const api = await mockPayment(page, { states: [pending, pending, { status: 200, body: receivedState() }] })
  await page.goto(`${PAYMENT}&collection_id=123&payment_id=123&status=approved&preference_id=pref-57`)
  await expect(page.getByText('Procesando pago…').first()).toBeVisible()
  await expect(page).toHaveURL(/\/pedido\/confirmacion\?pedido=57$/)
  expect(api.gets.length).toBeGreaterThanOrEqual(3)
  expect(api.posts).toHaveLength(0)
})

test('when the confirmation takes too long it says so and lets you ask again', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await fastPolling(page, { limit: 2 })
  const api = await mockPayment(page, { states: [{ status: 200, body: paymentState({ latest: latestPayment('mercadopago', 'pending') }) }] })
  await page.goto(`${PAYMENT}&payment_id=123&status=approved`)
  const notice = page.getByRole('status').filter({ hasText: 'Todavía no tenemos la confirmación de tu pago' })
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('Si ya pagaste, no vuelvas a pagar')
  api.setState([{ status: 200, body: receivedState() }])
  await page.getByRole('button', { name: 'Volver a consultar' }).click()
  await expect(page).toHaveURL(/\/pedido\/confirmacion\?pedido=57$/)
})

test('a declined card says so, and paying again keeps the key of the same method and changes it for another', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page, {
    outcomes: [
      { error: { type: 'card_error', code: 'card_declined', message: 'Tu tarjeta fue rechazada.' } },
      { paymentIntent: { status: 'succeeded' } },
    ],
  })
  await mockMercadoPago(page)
  await fastPolling(page)
  const api = await mockPayment(page, { starts: [startedPayment('stripe'), startedPayment('stripe', { status: 200 }), startedPayment('mercadopago')] })
  await page.goto(PAYMENT)
  await fillCard(page)
  await cardButton(page).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Tu banco rechazó el pago.')
  await expect(alert).toContainText('Revisa los datos de tu tarjeta o paga con otro método. No se hizo ningún cargo.')
  // El foco va al aviso (a su caja enfocable, como en la entrega de D66).
  await expect(page.locator(':focus')).toContainText('Tu banco rechazó el pago.')
  await expect(cardButton(page)).toBeEnabled()
  // Otra vez con tarjeta: la misma llave (el mismo intento en Stripe, sin un segundo cobro abierto).
  await cardButton(page).click()
  await expect(page.getByRole('button', { name: 'Procesando pago…' })).toBeVisible()
  expect(api.posts[1].headers()['idempotency-key']).toBe(api.posts[0].headers()['idempotency-key'])
  // Después, con Mercado Pago: otra llave, porque es otro método.
  await page.goto(PAYMENT)
  await mpButton(page).click()
  await expect(page).toHaveURL(MP_URL)
  expect(api.posts[2].headers()['idempotency-key']).not.toBe(api.posts[0].headers()['idempotency-key'])
})

test('a rejected payment reported by the server shows the alert and the methods stay available', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ latest: latestPayment('mercadopago', 'failed') }) }] })
  await page.goto(PAYMENT)
  await expect(methods(page).getByText('Mercado Pago rechazó el pago.')).toBeVisible()
  await expect(mpButton(page)).toBeEnabled()
  await expect(cardButton(page)).toBeEnabled()
})

test('an expired order says so and offers to order again, without payment buttons', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ order: { status: 'cancelled' } }) }] })
  await page.goto(PAYMENT)
  await expect(page.getByRole('heading', { name: 'Este pedido venció sin pagarse' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Realizar pedido' })).toHaveAttribute('href', '/pedido')
  await expect(mpButton(page)).toHaveCount(0)
  await expect(cashButton(page)).toHaveCount(0)
})

test('a charge that needs a refund says so and points to WhatsApp', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ order: { status: 'cancelled' }, latest: latestPayment('stripe', 'refund_required') }) }] })
  await page.goto(PAYMENT)
  await expect(page.getByRole('heading', { name: 'Te devolvemos tu pago' })).toBeVisible()
  await expect(page.getByText('Cobramos $2,287.50 cuando tu pedido 57 ya no podía recibir pagos.')).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: /Escribir por WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/520000000000')
  await expect(mpButton(page)).toHaveCount(0)
})

test('without the WhatsApp number the refund shows the pending marker', async ({ page }) => {
  await page.unrouteAll()
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page, emptyStoreInfo)
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ order: { status: 'cancelled' }, latest: latestPayment('mercadopago', 'refund_required') }) }] })
  await page.goto(PAYMENT)
  await expect(page.getByRole('heading', { name: 'Te devolvemos tu pago' })).toBeVisible()
  await expect(page.getByRole('main').locator('[data-pendiente]')).toHaveText('[número por confirmar]')
})

test('an unavailable method stays visible, disabled, with its reason', async ({ page }) => {
  await signedIn(page)
  const loads = await mockStripe(page)
  const unavailable = [
    { method: 'mercadopago', available: false },
    { method: 'stripe', available: false },
    { method: 'cash', available: true },
  ]
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ methods: unavailable }) }] })
  await page.goto(PAYMENT)
  await expect(mpButton(page)).toBeDisabled()
  await expect(methods(page)).toContainText('Por ahora no podemos cobrar con Mercado Pago.')
  await expect(cardButton(page)).toBeDisabled()
  await expect(methods(page)).toContainText('Por ahora no podemos cobrar con tarjeta.')
  await expect(stripeInput(page, 'cardNumber')).toHaveCount(0)
  await expect(cashButton(page)).toBeEnabled()
  // Sin tarjeta disponible, Stripe.js no se carga.
  expect(loads).toHaveLength(0)
})

test('without the Stripe public key the card is disabled and Stripe.js is not loaded', async ({ page }) => {
  await signedIn(page)
  const loads = await mockStripe(page, { key: '' })
  await mockPayment(page)
  await page.goto(PAYMENT)
  await expect(cardButton(page)).toBeDisabled()
  await expect(methods(page)).toContainText('Por ahora no podemos cobrar con tarjeta.')
  await expect(mpButton(page)).toBeEnabled()
  expect(loads).toHaveLength(0)
})

test('if Stripe.js does not load, the card says so and the other methods still work', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page, { fail: true })
  await mockPayment(page)
  await page.goto(PAYMENT)
  await expect(methods(page)).toContainText('No pudimos cargar el pago con tarjeta.')
  await expect(cardButton(page)).toBeDisabled()
  await expect(mpButton(page)).toBeEnabled()
})

test.describe('errors when starting the payment', () => {
  test('409 expired reloads the order and shows that it expired', async ({ page }) => {
    await signedIn(page)
    await mockStripe(page)
    const api = await mockPayment(page, { starts: [paymentError(409, 'order_expired', 'Este pedido venció sin pagarse. Vuelve a hacer tu pedido.')] })
    await page.goto(PAYMENT)
    await expect(mpButton(page)).toBeEnabled()
    api.setState([{ status: 200, body: paymentState({ order: { status: 'cancelled' } }) }])
    await mpButton(page).click()
    await expect(page.getByRole('heading', { name: 'Este pedido venció sin pagarse' })).toBeVisible()
  })

  test('409 not payable reloads the order and goes on if it was already received', async ({ page }) => {
    await signedIn(page)
    await mockStripe(page)
    const api = await mockPayment(page, { starts: [paymentError(409, 'order_not_payable', 'Este pedido ya no espera pago.')] })
    await page.goto(PAYMENT)
    await expect(mpButton(page)).toBeEnabled()
    api.setState([{ status: 200, body: receivedState() }])
    await cashButton(page).click()
    await expect(page).toHaveURL(/\/pedido\/confirmacion\?pedido=57$/)
  })

  test('502 shows the gateway message and lets you try again', async ({ page }) => {
    await signedIn(page)
    await mockStripe(page)
    await mockPayment(page, { starts: [paymentError(502, 'gateway_error', 'No pudimos conectar con Mercado Pago. Inténtalo de nuevo en unos minutos.')] })
    await page.goto(PAYMENT)
    await mpButton(page).click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('No pudimos conectar con Mercado Pago. Inténtalo de nuevo en unos minutos.')
    await expect(page.locator(':focus')).toContainText('No pudimos conectar con Mercado Pago.')
    await expect(mpButton(page)).toBeEnabled()
  })

  test('503 shows the message and the method becomes unavailable', async ({ page }) => {
    await signedIn(page)
    await mockStripe(page)
    const api = await mockPayment(page, {
      starts: [paymentError(503, 'method_unavailable', 'Por ahora no podemos cobrar con Mercado Pago. Elige otro método de pago.')],
    })
    await page.goto(PAYMENT)
    await expect(mpButton(page)).toBeEnabled()
    api.setState([
      {
        status: 200,
        body: paymentState({ methods: [{ method: 'mercadopago', available: false }, { method: 'stripe', available: true }, { method: 'cash', available: true }] }),
      },
    ])
    await mpButton(page).click()
    await expect(page.getByRole('alert')).toContainText('Por ahora no podemos cobrar con Mercado Pago. Elige otro método de pago.')
    await expect(mpButton(page)).toBeDisabled()
    await expect(cardButton(page)).toBeEnabled()
  })

  test('429 asks to wait', async ({ page }) => {
    await signedIn(page)
    await mockStripe(page)
    await mockPayment(page, { starts: [{ status: 429, body: { detail: 'Request was throttled.' } }] })
    await page.goto(PAYMENT)
    await mpButton(page).click()
    await expect(page.getByRole('alert')).toContainText('Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.')
  })

  test('a lost connection says what to do and keeps the same key for the retry', async ({ page }) => {
    await signedIn(page)
    await mockStripe(page)
    await mockMercadoPago(page)
    const api = await mockPayment(page, { starts: ['abort', startedPayment('mercadopago', { status: 200 })] })
    await page.goto(PAYMENT)
    await mpButton(page).click()
    await expect(page.getByRole('alert')).toContainText('No pudimos conectar con la pastelería. Revisa tu conexión y vuelve a intentarlo: no se te cobra dos veces.')
    await mpButton(page).click()
    await expect(page).toHaveURL(MP_URL)
    expect(api.posts[1].headers()['idempotency-key']).toBe(api.posts[0].headers()['idempotency-key'])
  })
})

test('cash: reserves the order and goes to the reserved page', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  const api = await mockPayment(page, { starts: [startedPayment('cash', { order: { payment_due_at: '2026-11-14T04:30:00Z' } })] })
  await page.goto(PAYMENT)
  await expect(cashButton(page)).toBeEnabled()
  api.setState([
    { status: 200, body: paymentState({ order: { payment_due_at: '2026-11-14T04:30:00Z' }, latest: latestPayment('cash', 'pending') }) },
  ])
  await cashButton(page).click()
  await expect(page).toHaveURL(/\/pedido\/apartado\?pedido=57$/)
  expect(api.posts[0].postDataJSON()).toEqual({ method: 'cash' })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu pedido está apartado')
})

test('an order already reserved in cash says how long you have, and you can still pay online', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page, {
    states: [{ status: 200, body: paymentState({ order: { payment_due_at: '2026-11-14T04:30:00Z' }, latest: latestPayment('cash', 'pending') }) }],
  })
  await page.goto(PAYMENT)
  const notice = methods(page).getByText('Apartado, falta tu pago')
  await expect(notice).toBeVisible()
  await expect(methods(page)).toContainText('Lleva $2,287.50 a la pastelería hoy, antes de las 22:30.')
  await expect(methods(page).getByRole('link', { name: 'Ver tu pedido apartado' })).toHaveAttribute('href', '/pedido/apartado?pedido=57')
  await expect(mpButton(page)).toBeEnabled()
})

test('keyboard: every option is reachable with Tab, in order, with a visible focus', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockPayment(page)
  await page.goto(PAYMENT)
  await expect(stripeInput(page, 'cardNumber')).toBeVisible()
  await mpButton(page).focus()
  await expect(mpButton(page)).toHaveCSS('outline-style', 'solid')
  const order = [
    stripeInput(page, 'cardNumber'),
    stripeInput(page, 'cardExpiry'),
    stripeInput(page, 'cardCvc'),
    page.getByRole('textbox', { name: 'Nombre como aparece en la tarjeta' }),
    cardButton(page),
    cashButton(page),
  ]
  for (const target of order) {
    await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
  }
  await expect(cashButton(page)).toHaveCSS('outline-style', 'solid')
})

test('keyboard: Enter on Mercado Pago starts the payment', async ({ page }) => {
  await signedIn(page)
  await mockStripe(page)
  await mockMercadoPago(page)
  const api = await mockPayment(page)
  await page.goto(PAYMENT)
  await mpButton(page).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(MP_URL)
  expect(api.posts).toHaveLength(1)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('fits 390 px, with the summary before the methods', async ({ page }) => {
    await signedIn(page)
    await mockStripe(page)
    await mockPayment(page)
    await page.goto(PAYMENT)
    await expect(stripeInput(page, 'cardNumber')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const summaryBox = await summary(page).boundingBox()
    const methodsBox = await methods(page).boundingBox()
    expect(summaryBox!.y).toBeLessThan(methodsBox!.y)
    for (const button of [mpButton(page), cardButton(page), cashButton(page)]) {
      const box = await button.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })
})
