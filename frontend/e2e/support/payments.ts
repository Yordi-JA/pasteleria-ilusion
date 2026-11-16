import type { Page, Request, Route } from '@playwright/test'
import { placedOrder } from './checkout.ts'

/**
 * El pago sin Django ni Stripe (D68): `GET orders/<id>/payment/` con el estado que pida la prueba, `POST` en la misma
 * ruta con la respuesta de cada intento y un Stripe.js falso que monta campos `<input>` reales en lugar de los iframes,
 * para escribir en ellos y revisar qué recibe `confirmCardPayment`. Nada sale a la red.
 */

export const ORDER_ID = 57
export const PAYMENT_PATH = `**/api/v1/orders/${ORDER_ID}/payment/`
export const MP_URL = 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-57'
export const CLIENT_SECRET = 'pi_57_secret_prueba'
export const TEST_KEY = 'pk_test_prueba'

type Method = 'mercadopago' | 'stripe' | 'cash'
type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refund_required'

export function latestPayment(method: Method, status: PaymentStatus) {
  return {
    id: 9,
    method,
    status,
    amount: '2287.50',
    currency: 'MXN',
    created_at: '2026-11-13T18:01:00Z',
    updated_at: '2026-11-13T18:02:00Z',
  }
}

/** Las líneas del pedido de las pruebas: un pastel del catálogo y un pastel diseñado. */
export const orderItems = [
  {
    kind: 'order',
    offering_id: 101,
    product_name: 'Tres leches de durazno',
    presentation: 'whole',
    quantity: 1,
    unit_price: '350.00',
    line_total: '350.00',
    design: null,
  },
  {
    kind: 'design',
    offering_id: null,
    product_name: null,
    presentation: null,
    quantity: 1,
    unit_price: '3825.00',
    line_total: '3825.00',
    design: { people: 100, kg: 15, form: 'round', tiers: 2, requires_quote: false, total: '3825.00' },
  },
]

export function paymentOrder(overrides: Record<string, unknown> = {}) {
  return placedOrder({ items: orderItems, ...overrides })
}

const ALL_AVAILABLE = [
  { method: 'mercadopago', available: true },
  { method: 'stripe', available: true },
  { method: 'cash', available: true },
]

/** La respuesta de `GET orders/<id>/payment/`. */
export function paymentState({
  order = {},
  latest = null,
  methods = ALL_AVAILABLE,
}: { order?: Record<string, unknown>; latest?: object | null; methods?: object[] } = {}) {
  return { order: paymentOrder(order), methods, latest_payment: latest }
}

/** El pedido ya pagado: lo que responde el estado después del webhook. */
export const receivedState = () => paymentState({ order: { status: 'received' }, latest: latestPayment('stripe', 'succeeded') })

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | 'abort'

async function fulfill(route: Route, reply: Reply) {
  if (reply === 'abort') {
    await route.abort('internetdisconnected')
    return
  }
  await route.fulfill({ status: reply.status, contentType: 'application/json', headers: reply.headers, body: JSON.stringify(reply.body ?? {}) })
}

export type PaymentMock = {
  gets: Request[]
  posts: Request[]
  /** Cambia lo que responden los `GET` siguientes. */
  setState: (replies: Reply[]) => void
}

/**
 * Responde `GET` con cada respuesta de `states` en orden (la última se repite) y `POST` con las de `starts`. Por omisión,
 * el pedido apartado sin intentos y un intento de Mercado Pago recién creado.
 */
export async function mockPayment(
  page: Page,
  { states = [{ status: 200, body: paymentState() }], starts = [startedPayment('mercadopago')] }: { states?: Reply[]; starts?: Reply[] } = {},
): Promise<PaymentMock> {
  const gets: Request[] = []
  const posts: Request[] = []
  let getReplies = states
  let offset = 0
  await page.route(PAYMENT_PATH, async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      posts.push(request)
      await fulfill(route, starts[Math.min(posts.length, starts.length) - 1])
      return
    }
    gets.push(request)
    await fulfill(route, getReplies[Math.min(gets.length - offset, getReplies.length) - 1])
  })
  return {
    gets,
    posts,
    setState: (replies) => {
      getReplies = replies
      offset = gets.length
    },
  }
}

/** La respuesta de `POST orders/<id>/payment/` para cada método. */
export function startedPayment(method: Method, { status = 201, order = {} }: { status?: number; order?: Record<string, unknown> } = {}): Reply {
  return {
    status,
    body: {
      id: 9,
      method,
      status: 'pending',
      amount: '2287.50',
      currency: 'MXN',
      redirect_url: method === 'mercadopago' ? MP_URL : null,
      client_secret: method === 'stripe' ? CLIENT_SECRET : null,
      order: paymentOrder(order),
    },
  }
}

export const paymentError = (status: number, code: string, detail: string): Reply => ({ status, body: { detail, code } })

/** Mercado Pago "recibe" la redirección con una página mínima, sin salir a la red. */
export async function mockMercadoPago(page: Page) {
  await page.route('https://www.mercadopago.com.mx/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Mercado Pago</title><h1>Checkout Pro</h1>' }),
  )
}

/** El intervalo y el límite de la consulta del pago, más cortos en desarrollo (como `__catalogTimeoutMs`). */
export async function fastPolling(page: Page, { intervalMs = 100, limit = 20 }: { intervalMs?: number; limit?: number } = {}) {
  await page.addInitScript(({ interval, max }) => {
    Reflect.set(globalThis, '__paymentPollMs', interval)
    Reflect.set(globalThis, '__paymentPollLimit', max)
  }, { interval: intervalMs, max: limit })
}

/** Lo que el Stripe.js falso devuelve en cada `confirmCardPayment`, en orden (el último se repite). */
export type StripeOutcome =
  | { paymentIntent: { status: string } }
  | { error: { type: string; code?: string; message: string } }

/**
 * Fija la llave pública de las pruebas (o ninguna, con `key: ''`) y sirve un Stripe.js falso. `fail` simula que el
 * script no carga. Devuelve las cargas del script.
 */
export async function mockStripe(
  page: Page,
  { key = TEST_KEY, outcomes = [{ paymentIntent: { status: 'succeeded' } }], fail = false }: { key?: string; outcomes?: StripeOutcome[]; fail?: boolean } = {},
) {
  await page.addInitScript(({ value, results }) => {
    Reflect.set(globalThis, '__stripePublishableKey', value)
    Reflect.set(globalThis, '__stripeOutcomes', results)
  }, { value: key, results: outcomes })
  const loads: Request[] = []
  await page.route('https://js.stripe.com/**', async (route) => {
    loads.push(route.request())
    if (fail) {
      await route.abort()
      return
    }
    await route.fulfill({ contentType: 'text/javascript', body: FAKE_STRIPE })
  })
  return loads
}

/** Lo que recibió el Stripe.js falso: la llave, las opciones de Elements y cada `confirmCardPayment`. */
export function stripeCalls(page: Page) {
  return page.evaluate(() => Reflect.get(globalThis, '__stripeCalls') as {
    key: string
    elementsOptions: Record<string, unknown>
    created: { type: string; options: Record<string, unknown> }[]
    confirms: { secret: string; cardType: string; name: string | undefined }[]
  })
}

/**
 * Un Stripe.js mínimo con la forma que piden `@stripe/stripe-js` y `@stripe/react-stripe-js`. Cada elemento monta un
 * `<input>` con `data-stripe` y emite `change` (completo según el largo, como lo hace Stripe), `focus`, `blur` y
 * `ready`. Al perder el foco con el número a medias, emite el error de Stripe "Al número le faltan dígitos.".
 */
const FAKE_STRIPE = `
(() => {
  const NEEDED = { cardNumber: 16, cardExpiry: 4, cardCvc: 3 }
  const LABELS = { cardNumber: 'Número de la tarjeta', cardExpiry: 'Vencimiento', cardCvc: 'CVC' }
  const calls = { key: '', elementsOptions: null, created: [], confirms: [] }
  window.__stripeCalls = calls
  function makeElement(type, options) {
    const handlers = {}
    let input = null
    const fire = (event, payload) => (handlers[event] || []).slice().forEach((cb) => cb(payload))
    const state = () => {
      const digits = input.value.replace(/\\D/g, '')
      return { elementType: type, empty: digits.length === 0, complete: digits.length >= NEEDED[type], error: undefined }
    }
    const element = {
      mount(node) {
        input = document.createElement('input')
        input.setAttribute('data-stripe', type)
        input.setAttribute('aria-label', LABELS[type])
        input.addEventListener('input', () => fire('change', state()))
        input.addEventListener('focus', () => fire('focus', { elementType: type }))
        input.addEventListener('blur', () => {
          fire('blur', { elementType: type })
          const current = state()
          if (type === 'cardNumber' && !current.empty && !current.complete) {
            fire('change', { ...current, error: { type: 'validation_error', code: 'incomplete_number', message: 'Al número le faltan dígitos.' } })
          }
        })
        node.appendChild(input)
        setTimeout(() => fire('ready', element), 0)
      },
      on(event, cb) { (handlers[event] = handlers[event] || []).push(cb); return element },
      off(event, cb) { handlers[event] = (handlers[event] || []).filter((h) => h !== cb); return element },
      update() {},
      focus() { input && input.focus() },
      blur() { input && input.blur() },
      clear() { if (input) input.value = '' },
      unmount() { input && input.remove() },
      destroy() { input && input.remove(); input = null },
      __type: type,
    }
    return element
  }
  window.Stripe = function Stripe(key, options) {
    calls.key = key
    const created = {}
    return {
      elements(options) {
        calls.elementsOptions = options
        return {
          create(type, opts) {
            calls.created.push({ type, options: opts })
            created[type] = makeElement(type, opts)
            return created[type]
          },
          getElement(type) { return created[type] || null },
          update() {},
        }
      },
      createToken() { return Promise.resolve({}) },
      createPaymentMethod() { return Promise.resolve({}) },
      confirmCardPayment(secret, data) {
        const method = (data && data.payment_method) || {}
        calls.confirms.push({ secret, cardType: method.card && method.card.__type, name: method.billing_details && method.billing_details.name })
        const outcomes = window.__stripeOutcomes || []
        const outcome = outcomes[Math.min(calls.confirms.length, outcomes.length) - 1] || { paymentIntent: { status: 'succeeded' } }
        return Promise.resolve(outcome)
      },
      _registerWrapper() {},
      registerAppInfo() {},
    }
  }
  window.Stripe.version = 'endive'
})()
`
