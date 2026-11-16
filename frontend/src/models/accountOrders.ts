/**
 * Los pedidos de la cuenta (D69): `GET orders/` (paginado, solo los del dueño), `GET orders/<id>/` con lo que suma D69
 * (la etiqueta y la fecha del estado, el pago, las bases, los nombres del diseño y si hay nota) y la nota en PDF de
 * `GET orders/<id>/note.pdf`. Ningún monto se calcula aquí: todos vienen del servidor, en texto.
 */
import { PRICE_PATTERN } from './money.ts'
import { parsePaymentOrder } from './payments.ts'
import type { PaymentOrder, PaymentOrderItem } from './payments.ts'
import { requestWithSession } from './session.ts'

/** Los estados del pedido (regla 12). Uno que esta versión no conoce se conserva como texto y se muestra su etiqueta. */
export type OrderStatus =
  | 'awaiting_payment'
  | 'received'
  | 'in_preparation'
  | 'ready_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'awaiting_quote'

/** Los nombres del pastel diseñado para mostrarlo: pan, relleno y decoración. */
export type DesignNames = { bread: string; fillingBase: string | null; fillingFlavors: string[]; decoration: string }

export type AccountOrderItem = PaymentOrderItem & { names: DesignNames | null }

/** El cobro que pagó el pedido; `null` sin pago. */
export type PaidWith = { method: string; methodLabel: string; paidAt: string }

/** La base de un diseño del pedido: antes de la entrega, `status` es `null` y `returnBy` es la fecha prevista. */
export type OrderStand = {
  kg: number
  deposit: string
  returnDays: number
  returnBy: string
  status: 'on_loan' | 'returned' | null
  statusLabel: string | null
  returnedAt: string | null
}

export type AccountOrder = Omit<PaymentOrder, 'items'> & {
  items: AccountOrderItem[]
  fulfillment: 'pickup' | 'delivery'
  deliveryFee: string
  statusLabel: string
  statusChangedAt: string | null
  noteAvailable: boolean
  paidWith: PaidWith | null
  stands: OrderStand[]
}

/** Una página de "Mis pedidos": `nextPage` es el número de la siguiente, o `null` si ya no hay. */
export type OrderPage = { count: number; nextPage: number | null; orders: AccountOrder[] }

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function designNames(design: unknown): DesignNames | null {
  if (!isRecord(design)) return null
  const bread = text(design.bread_name)
  const decoration = text(design.decoration_name)
  if (!bread || !decoration) return null
  const flavors = Array.isArray(design.filling_flavor_names) ? design.filling_flavor_names.filter((name): name is string => typeof name === 'string' && name !== '') : []
  return { bread, fillingBase: text(design.filling_base_name), fillingFlavors: flavors, decoration }
}

function parsePaidWith(data: unknown): PaidWith | null {
  if (data === null || data === undefined) return null
  const method = isRecord(data) ? text(data.method) : null
  const label = isRecord(data) ? text(data.method_label) : null
  const paidAt = isRecord(data) ? text(data.paid_at) : null
  if (!method || !label || !paidAt) throw new TypeError('El pago del pedido no tiene la forma esperada.')
  return { method, methodLabel: label, paidAt }
}

const STAND_STATUSES = new Set<unknown>(['on_loan', 'returned'])

/** Una base dudosa se descarta: nunca se muestra un depósito o una fecha que no se entiende. */
function parseStand(data: unknown): OrderStand | null {
  if (!isRecord(data)) return null
  const { kg, deposit, return_days: days, return_by: returnBy } = data
  if (typeof kg !== 'number' || typeof days !== 'number' || typeof deposit !== 'string' || !PRICE_PATTERN.test(deposit) || typeof returnBy !== 'string') return null
  const status = STAND_STATUSES.has(data.status) ? (data.status as OrderStand['status']) : null
  return { kg, deposit, returnDays: days, returnBy, status, statusLabel: status ? text(data.status_label) : null, returnedAt: text(data.returned_at) }
}

/** Valida un pedido de `OrderSerializer` con los campos de D69. Otra forma es un `TypeError`. */
export function parseAccountOrder(data: unknown): AccountOrder {
  const base = parsePaymentOrder(data)
  const raw = data as Raw
  const label = text(raw.status_label)
  if (!label) throw new TypeError('El pedido no trae la etiqueta de su estado.')
  const rawItems = Array.isArray(raw.items) ? raw.items : []
  const deliveryFee = typeof raw.delivery_fee === 'string' && PRICE_PATTERN.test(raw.delivery_fee) ? raw.delivery_fee : '0.00'
  return {
    ...base,
    items: base.items.map((item, index) => ({ ...item, names: item.kind === 'design' && isRecord(rawItems[index]) ? designNames(rawItems[index].design) : null })),
    fulfillment: raw.fulfillment === 'delivery' ? 'delivery' : 'pickup',
    deliveryFee,
    statusLabel: label,
    statusChangedAt: text(raw.status_changed_at),
    noteAvailable: raw.note_available === true,
    paidWith: parsePaidWith(raw.paid_with),
    stands: Array.isArray(raw.stands) ? raw.stands.map(parseStand).filter((stand): stand is OrderStand => stand !== null) : [],
  }
}

/** El número de página de `next` (la URL absoluta de DRF), solo si es un entero positivo. */
function pageNumber(next: unknown): number | null {
  if (typeof next !== 'string') return null
  try {
    const value = new URL(next, window.location.origin).searchParams.get('page')
    return value !== null && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null
  } catch {
    return null
  }
}

/** Valida una página de `GET orders/`. Otra forma es un `TypeError`. */
export function parseOrderPage(data: unknown): OrderPage {
  if (!isRecord(data) || typeof data.count !== 'number' || !Array.isArray(data.results)) throw new TypeError('La lista de pedidos no tiene la forma esperada.')
  return { count: data.count, nextPage: pageNumber(data.next), orders: data.results.map(parseAccountOrder) }
}

/** Una página de "Mis pedidos", del más nuevo al más viejo (20 por página, lo fija el servidor). */
export async function getOrders(page: number, signal?: AbortSignal): Promise<OrderPage> {
  const { body } = await requestWithSession(['orders'], { signal, query: page > 1 ? { page: String(page) } : undefined })
  return parseOrderPage(body)
}

/** Un pedido de la cuenta. Uno ajeno o que no existe es un `ApiError` 404. */
export async function getOrder(orderId: number, signal?: AbortSignal): Promise<AccountOrder> {
  const { body } = await requestWithSession(['orders', String(orderId)], { signal })
  return parseAccountOrder(body)
}

/** Generar el PDF tarda un poco más que una consulta. */
const NOTE_TIMEOUT_MS = 20_000

/**
 * La nota en PDF del pedido (regla 11), con el `Authorization` de la sesión: por eso no basta un enlace. Un pedido
 * ajeno, que no existe o sin nota todavía es un `ApiError` 404.
 */
export async function getOrderNote(orderId: number): Promise<Blob> {
  const { body } = await requestWithSession(['orders', String(orderId), 'note.pdf'], {
    as: 'blob',
    trailingSlash: false,
    headers: { Accept: 'application/pdf, application/json' },
    timeoutMs: NOTE_TIMEOUT_MS,
  })
  if (!(body instanceof Blob)) throw new TypeError('La nota no llegó como archivo.')
  return body
}

/** El nombre del archivo, el mismo que propone el servidor. */
export function noteFileName(orderId: number): string {
  return `nota-pedido-${orderId}.pdf`
}

/**
 * Por qué un pedido no se puede cancelar (D70, segunda ronda): ya se entregó o ya está cancelado. Antes de la entrega se
 * cancela en cualquier estado. Uno que esta versión no conoce se conserva como texto.
 */
export type CancelReason = 'not_cancellable' | 'already_cancelled' | (string & {})

/**
 * Lo que pasaría al cancelar (`GET orders/<id>/cancel/`, D70). Todos los montos y el porcentaje vienen del servidor, en
 * texto; el navegador no calcula nada.
 */
export type CancellationPreview = {
  /** El estado del pedido que vio la vista previa: `POST` lo devuelve como `expected_status`. */
  status: string
  cancellable: boolean
  reason: CancelReason | null
  message: string | null
  paid: string
  orderTotal: string
  retentionPercent: number
  retained: string
  refund: string
}

function price(value: unknown, name: string): string {
  if (typeof value !== 'string' || !PRICE_PATTERN.test(value)) throw new TypeError(`La cancelación no trae ${name}.`)
  return value
}

/** Valida la vista previa de la cancelación. Otra forma es un `TypeError`. */
export function parseCancellationPreview(data: unknown): CancellationPreview {
  if (!isRecord(data) || typeof data.status !== 'string' || typeof data.cancellable !== 'boolean' || typeof data.retention_percent !== 'number') {
    throw new TypeError('La vista previa de la cancelación no tiene la forma esperada.')
  }
  return {
    status: data.status,
    cancellable: data.cancellable,
    reason: text(data.reason),
    message: text(data.message),
    paid: price(data.paid, 'lo pagado'),
    orderTotal: price(data.order_total, 'el total'),
    retentionPercent: data.retention_percent,
    retained: price(data.retained, 'lo retenido'),
    refund: price(data.refund, 'la devolución'),
  }
}

/** La vista previa de cancelar un pedido propio. Uno ajeno o que no existe es un `ApiError` 404. */
export async function getCancellationPreview(orderId: number, signal?: AbortSignal): Promise<CancellationPreview> {
  const { body } = await requestWithSession(['orders', String(orderId), 'cancel'], { signal })
  return parseCancellationPreview(body)
}

/** El resultado de cancelar: el pedido ya cancelado y lo que se retuvo y se devuelve. */
export type CancellationResult = { order: AccountOrder; cancellation: CancellationPreview }

/**
 * Cancela un pedido propio con el estado que vio la vista previa: si el pedido ya cambió, el servidor responde 409
 * `stale_preview`. Un 409 (`code` con el motivo), un 429 o un 5xx son un `ApiError`.
 */
export async function cancelOrder(orderId: number, expectedStatus: string): Promise<CancellationResult> {
  const { body } = await requestWithSession(['orders', String(orderId), 'cancel'], {
    method: 'POST',
    json: { expected_status: expectedStatus },
  })
  if (!isRecord(body)) throw new TypeError('La respuesta de la cancelación no tiene la forma esperada.')
  return { order: parseAccountOrder(body.order), cancellation: parseCancellationPreview(body.cancellation) }
}
