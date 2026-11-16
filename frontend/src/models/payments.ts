/**
 * El pago de un pedido (D68): `GET orders/<id>/payment/` (el pedido con su desglose, los métodos y el último intento) y
 * `POST` en la misma ruta, con `Idempotency-Key` y solo el método. El navegador nunca manda un monto ni lo calcula: el
 * servidor cobra `pay_today`. La URL de regreso de Mercado Pago no confirma nada; el estado lo dice siempre el servidor.
 */
import { ApiError } from './apiClient.ts'
import type { PaymentMethod } from './checkout.ts'
import { PRICE_PATTERN } from './money.ts'
import { parsePlacedOrder } from './orders.ts'
import type { PlacedOrder } from './orders.ts'
import { isOfferingPresentation } from './presentation.ts'
import type { OfferingPresentation } from './presentation.ts'
import { requestWithSession } from './session.ts'

export type { PaymentMethod } from './checkout.ts'

/** Iniciar un cobro llama a la pasarela: un poco más que una consulta. */
const START_TIMEOUT_MS = 20_000

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['mercadopago', 'stripe', 'cash']

/** `pending`: iniciado, sin confirmar. `failed`: rechazado, se puede pagar otra vez. `refund_required`: cobrado de más. */
export type AttemptStatus = 'pending' | 'succeeded' | 'failed' | 'refund_required'

const ATTEMPT_STATUSES = new Set<unknown>(['pending', 'succeeded', 'failed', 'refund_required'])

/** Una línea del pedido como la guardó el servidor, con lo que muestra el resumen. */
export type PaymentOrderItem = {
  kind: 'order' | 'showcase' | 'design'
  productName: string | null
  presentation: OfferingPresentation | null
  quantity: number
  lineTotal: string
  /** Solo en un pastel diseñado; los kilos los calculó el servidor. */
  design: { kg: number | null; tiers: number | null } | null
}

/** El pedido de `GET orders/<id>/` con sus líneas y su fecha de creación. */
export type PaymentOrder = PlacedOrder & { createdAt: string | null; items: PaymentOrderItem[] }

/** `updatedAt` distingue un rechazo nuevo de uno anterior del mismo intento (un reintento con la misma llave). */
export type PaymentAttempt = { method: PaymentMethod; status: AttemptStatus; amount: string; updatedAt: string | null }

export type PaymentState = {
  order: PaymentOrder
  /** Si cada método se ofrece; un método sin las llaves del servidor responde 503. */
  available: Record<PaymentMethod, boolean>
  latest: PaymentAttempt | null
}

export type StartedPayment = {
  method: PaymentMethod
  /** Mercado Pago: la página de Checkout Pro. */
  redirectUrl: string | null
  /** Stripe: el `client_secret` del PaymentIntent, solo para `confirmCardPayment`; no se guarda. */
  clientSecret: string | null
  order: PaymentOrder
}

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value)
}

function money(value: unknown, what: string): string {
  if (typeof value !== 'string' || !PRICE_PATTERN.test(value)) throw new TypeError(`${what} no tiene la forma esperada.`)
  return value
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

const ITEM_KINDS = new Set<unknown>(['order', 'showcase', 'design'])

function parseItem(data: unknown): PaymentOrderItem {
  if (!isRecord(data) || !ITEM_KINDS.has(data.kind)) throw new TypeError('Una línea del pedido no tiene la forma esperada.')
  const design = isRecord(data.design) ? { kg: count(data.design.kg), tiers: count(data.design.tiers) } : null
  return {
    kind: data.kind as PaymentOrderItem['kind'],
    productName: typeof data.product_name === 'string' && data.product_name !== '' ? data.product_name : null,
    presentation: isOfferingPresentation(data.presentation) ? data.presentation : null,
    quantity: count(data.quantity) ?? 1,
    lineTotal: money(data.line_total, 'El importe de una línea'),
    design,
  }
}

/** El pedido de la respuesta del pago. Otra forma es un `TypeError`. */
export function parsePaymentOrder(data: unknown): PaymentOrder {
  const order = parsePlacedOrder(data)
  const raw = data as Raw
  return {
    ...order,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : null,
    items: Array.isArray(raw.items) ? raw.items.map(parseItem) : [],
  }
}

function parseAttempt(data: unknown): PaymentAttempt | null {
  if (data === null || data === undefined) return null
  if (!isRecord(data) || !isMethod(data.method) || !ATTEMPT_STATUSES.has(data.status)) {
    throw new TypeError('El último pago no tiene la forma esperada.')
  }
  return {
    method: data.method,
    status: data.status as AttemptStatus,
    amount: money(data.amount, 'El monto del pago'),
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
  }
}

/** Valida la respuesta de `GET orders/<id>/payment/`. Un método que no viene se toma como no disponible. */
export function parsePaymentState(data: unknown): PaymentState {
  if (!isRecord(data)) throw new TypeError('El estado del pago no tiene la forma esperada.')
  const available: Record<PaymentMethod, boolean> = { mercadopago: false, stripe: false, cash: false }
  for (const entry of Array.isArray(data.methods) ? data.methods : []) {
    if (isRecord(entry) && isMethod(entry.method)) available[entry.method] = entry.available === true
  }
  return { order: parsePaymentOrder(data.order), available, latest: parseAttempt(data.latest_payment) }
}

function parseStarted(data: unknown): StartedPayment {
  if (!isRecord(data) || !isMethod(data.method)) throw new TypeError('El pago iniciado no tiene la forma esperada.')
  return {
    method: data.method,
    redirectUrl: typeof data.redirect_url === 'string' && data.redirect_url !== '' ? data.redirect_url : null,
    clientSecret: typeof data.client_secret === 'string' && data.client_secret !== '' ? data.client_secret : null,
    order: parsePaymentOrder(data.order),
  }
}

/** El estado del pago de un pedido. Un pedido ajeno o que no existe es un `ApiError` 404. */
export async function getPaymentState(orderId: number, signal?: AbortSignal): Promise<PaymentState> {
  const { body } = await requestWithSession(['orders', String(orderId), 'payment'], { signal })
  return parsePaymentState(body)
}

/**
 * Inicia el cobro con `method`. Con la misma `idempotencyKey` el servidor responde el mismo intento (200) sin volver a
 * cobrar. Un rechazo es un `ApiError` con `{detail, code}` (o los errores por campo de un 400).
 */
export async function startPayment(orderId: number, method: PaymentMethod, idempotencyKey: string): Promise<StartedPayment> {
  const { body } = await requestWithSession(['orders', String(orderId), 'payment'], {
    method: 'POST',
    json: { method },
    headers: { 'Idempotency-Key': idempotencyKey },
    timeoutMs: START_TIMEOUT_MS,
  })
  return parseStarted(body)
}

/** El código y el texto en español de un rechazo del pago (`{detail, code}`), si los trae. */
export function paymentErrorBody(error: unknown): { code: string | null; detail: string | null } {
  const body = error instanceof ApiError && isRecord(error.body) ? error.body : {}
  return {
    code: typeof body.code === 'string' ? body.code : null,
    detail: typeof body.detail === 'string' && body.detail !== '' ? body.detail : null,
  }
}

/** Solo una dirección `https:` sirve para ir a Checkout Pro: nunca `javascript:` ni otra cosa que mande el servidor. */
export function safeCheckoutUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * La llave pública de Stripe (`VITE_STRIPE_PUBLISHABLE_KEY`, empieza con `pk_`). Vacía o con otra forma: la tarjeta se ve
 * desactivada y Stripe.js no se carga. En desarrollo, las pruebas E2E la fijan con `__stripePublishableKey` (también
 * `''`), como `__googleClientId`.
 */
export function stripePublishableKey(): string {
  let value: unknown = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  if (import.meta.env.DEV) {
    const override: unknown = Reflect.get(globalThis, '__stripePublishableKey')
    if (typeof override === 'string') value = override
  }
  const key = typeof value === 'string' ? value.trim() : ''
  return key.startsWith('pk_') ? key : ''
}
