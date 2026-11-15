/**
 * El pedido en el servidor (D63, D66): sube las imágenes de los pasteles diseñados (`POST customer-images/`, multipart) y
 * crea el pedido (`POST orders/`, con `Idempotency-Key`). El servidor recalcula todo: del carrito solo viajan las
 * elecciones, nunca un monto, `requiresQuote` ni la huella del diseño.
 */
import { boundMessage, boundWafer, parseMessage, parseWafer } from './cakeDesignLayout.ts'
import type { MessageLayout, WaferLayout } from './cakeDesignLayout.ts'
import { normalizeHex } from './color.ts'
import type { CartItem, DesignItem } from './cart.ts'
import type { StoredImage } from './designImages.ts'
import { PRICE_PATTERN } from './money.ts'
import { requestWithSession } from './session.ts'

/** Una subida grande en una conexión lenta tarda más que una consulta. */
const UPLOAD_TIMEOUT_MS = 60_000
/** Crear el pedido aparta lapso, vitrina y pan en una transacción: un poco más que una consulta. */
const CREATE_TIMEOUT_MS = 20_000

export type ImagePurpose = 'wafer' | 'decoration'

type MessageLayoutRequest = {
  text: string
  color_mode: MessageLayout['color']['mode']
  color: string | null
  arrangement: MessageLayout['arrangement']
  curve: number
  scale: number
  rotation_deg: number
  x: number
  y: number
}

type WaferLayoutRequest = {
  shape: WaferLayout['shape']
  width_cm: number
  height_cm: number
  rotation_deg: number
  x: number
  y: number
  image_zoom: number
  image_x: number
  image_y: number
}

/** Un pastel de "Diseña tu pastel", campo por campo, como lo lee `OrderDesignSerializer`. */
export type OrderDesignRequest = {
  people: number
  form: 'round' | 'rectangular'
  tiers: number
  cake_type: string
  bread: string
  filling_base: string | null
  filling_flavors: string[]
  coverage_color: string
  decoration: string
  decoration_color: string | null
  decoration_image_id: string | null
  message_layout: MessageLayoutRequest | null
  wafer: boolean
  wafer_layout: WaferLayoutRequest | null
  wafer_image_id: string | null
  occasion: string | null
}

export type OrderLineRequest =
  | { kind: 'order' | 'showcase'; offering_id: number; quantity: number }
  | { kind: 'design'; design: OrderDesignRequest }

export type OrderRequest = {
  fulfillment: 'pickup'
  delivery_date: string
  slot_starts_at: string
  pickup_name: string
  pickup_phone: string
  items: OrderLineRequest[]
}

/** Qué imagen lleva un pastel diseñado y si su archivo sigue en el navegador. */
export type DesignImageNeed = { slot: ImagePurpose; key: string | null }

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const SLUG = /^[-a-zA-Z0-9_]+$/

function slug(value: unknown): string | null {
  return typeof value === 'string' && SLUG.test(value) ? value : null
}

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function messageRequest(message: MessageLayout): MessageLayoutRequest {
  const bounded = boundMessage(message)
  return {
    text: bounded.text,
    color_mode: bounded.color.mode,
    color: bounded.color.mode === 'auto' ? null : bounded.color.value,
    arrangement: bounded.arrangement,
    curve: bounded.curve,
    scale: bounded.scale,
    rotation_deg: bounded.rotation,
    x: bounded.x,
    y: bounded.y,
  }
}

function waferRequest(wafer: WaferLayout): WaferLayoutRequest {
  const bounded = boundWafer(wafer)
  return {
    shape: bounded.shape,
    width_cm: bounded.widthCm,
    height_cm: bounded.heightCm,
    rotation_deg: bounded.rotation,
    x: bounded.x,
    y: bounded.y,
    image_zoom: bounded.imageZoom,
    image_x: bounded.imageX,
    image_y: bounded.imageY,
  }
}

/** Las imágenes que lleva un pastel guardado: "Otra decoración" y la oblea, con la clave de su archivo en el navegador. */
export function designImageNeeds(item: DesignItem): DesignImageNeed[] {
  const needs: DesignImageNeed[] = []
  if (item.design.decorationImageName) needs.push({ slot: 'decoration', key: item.images.decoration ?? null })
  if (isRecord(item.design.wafer)) needs.push({ slot: 'wafer', key: item.images.wafer ?? null })
  return needs
}

/**
 * El pastel guardado en el carrito (`designSnapshot`) en la forma de la API, con los ids de sus imágenes ya subidas.
 * `null` si lo guardado no tiene la forma esperada (por ejemplo, de una versión vieja del sitio).
 */
export function designRequest(snapshot: Record<string, unknown>, imageIds: Partial<Record<ImagePurpose, string>>): OrderDesignRequest | null {
  const people = whole(snapshot.people)
  const tiers = whole(snapshot.tiers)
  const cakeType = slug(snapshot.cakeType)
  const bread = slug(snapshot.bread)
  const decoration = slug(snapshot.decoration)
  const coverage = normalizeHex(snapshot.coverageColor)
  const form = snapshot.form === 'rectangular' ? 'rectangular' : snapshot.form === 'round' ? 'round' : null
  if (!people || !tiers || !cakeType || !bread || !decoration || !coverage || !form) return null
  const fillingBase = snapshot.fillingBase === null || snapshot.fillingBase === undefined ? null : slug(snapshot.fillingBase)
  if (snapshot.fillingBase && !fillingBase) return null
  const flavors = Array.isArray(snapshot.flavors) ? snapshot.flavors.map(slug) : []
  if (flavors.includes(null)) return null
  const decorationColor = snapshot.decorationColor === null || snapshot.decorationColor === undefined ? null : normalizeHex(snapshot.decorationColor)
  if (snapshot.decorationColor && !decorationColor) return null
  const wafer = isRecord(snapshot.wafer) ? parseWafer(snapshot.wafer) : null
  if (isRecord(snapshot.wafer) && !wafer) return null
  const message = isRecord(snapshot.message) ? parseMessage(snapshot.message) : null
  const decorationImage = snapshot.decorationImageName ? (imageIds.decoration ?? null) : null
  const waferImage = wafer ? (imageIds.wafer ?? null) : null
  if ((snapshot.decorationImageName && !decorationImage) || (wafer && !waferImage)) return null
  return {
    people,
    form,
    tiers,
    cake_type: cakeType,
    bread,
    filling_base: fillingBase,
    filling_flavors: flavors as string[],
    coverage_color: coverage,
    decoration,
    decoration_color: decorationColor,
    decoration_image_id: decorationImage,
    message_layout: message && message.text.trim() !== '' ? messageRequest(message) : null,
    wafer: wafer !== null,
    wafer_layout: wafer ? waferRequest(wafer) : null,
    wafer_image_id: waferImage,
    occasion: slug(snapshot.occasion),
  }
}

/** El tipo de línea de la API de una línea del carrito. */
export function lineKind(item: CartItem): OrderLineRequest['kind'] {
  return item.kind === 'design' ? 'design' : item.fulfillment
}

/**
 * Las líneas del pedido, en el orden del carrito. `imageIdsFor` da los ids ya subidos de cada pastel. Devuelve la
 * posición de la primera línea que no se puede mandar (un pastel guardado con otra forma o sin su imagen), o las líneas.
 */
export function orderLines(
  items: CartItem[],
  imageIdsFor: (item: DesignItem) => Partial<Record<ImagePurpose, string>>,
): { lines: OrderLineRequest[] } | { invalid: number } {
  const lines: OrderLineRequest[] = []
  for (const [index, item] of items.entries()) {
    if (item.kind === 'offering') {
      lines.push({ kind: item.fulfillment, offering_id: item.offeringId, quantity: item.quantity })
      continue
    }
    const design = designRequest(item.design, imageIdsFor(item))
    if (!design) return { invalid: index }
    lines.push({ kind: 'design', design })
  }
  return { lines }
}

/** Sube una imagen del navegador y devuelve su id en el servidor. Un rechazo es un `ApiError` con su cuerpo. */
export async function uploadCustomerImage(image: StoredImage, purpose: ImagePurpose): Promise<string> {
  const form = new FormData()
  form.append('image', image.blob, image.name)
  form.append('purpose', purpose)
  const { body } = await requestWithSession(['customer-images'], { method: 'POST', form, timeoutMs: UPLOAD_TIMEOUT_MS })
  if (!isRecord(body) || typeof body.id !== 'string' || body.id === '') throw new TypeError('La imagen subida no trae su id.')
  return body.id
}

/** Lo que se paga de un pedido creado; `null` mientras espera cotización. Montos en texto decimal, como la API. */
export type OrderPayment = {
  advancePercent: number
  advance: string
  paidInFull: string
  baseDeposit: string
  deliveryFee: string
  payToday: string
  payOnDelivery: string
}

/** El pedido que creó el servidor, con lo que necesitan el pago y la confirmación. */
export type PlacedOrder = {
  id: number
  /** `awaiting_payment` ("Apartado, falta tu pago") o `awaiting_quote` ("En pausa por cotización") al crearse. */
  status: string
  deliveryDate: string
  slotStartsAt: string
  slotEndsAt: string
  pickupName: string
  pickupPhone: string
  subtotal: string
  standDeposit: string
  payment: OrderPayment | null
  /** Hasta cuándo se paga (ISO 8601); `null` si espera cotización. */
  paymentDueAt: string | null
}

function money(value: unknown): string {
  if (typeof value !== 'string' || !PRICE_PATTERN.test(value)) throw new TypeError('Un monto del pedido no tiene la forma esperada.')
  return value
}

function parsePayment(data: unknown): OrderPayment | null {
  if (data === null) return null
  if (!isRecord(data) || typeof data.advance_percent !== 'number') throw new TypeError('El pago del pedido no tiene la forma esperada.')
  return {
    advancePercent: data.advance_percent,
    advance: money(data.advance),
    paidInFull: money(data.paid_in_full),
    baseDeposit: money(data.base_deposit),
    deliveryFee: money(data.delivery_fee),
    payToday: money(data.pay_today),
    payOnDelivery: money(data.pay_on_delivery),
  }
}

/** Valida la respuesta de `POST orders/`. Otra forma es un `TypeError`. */
export function parsePlacedOrder(data: unknown): PlacedOrder {
  if (!isRecord(data) || whole(data.id) === null || typeof data.status !== 'string') throw new TypeError('El pedido no tiene la forma esperada.')
  const texts = ['delivery_date', 'slot_starts_at', 'slot_ends_at', 'pickup_name', 'pickup_phone'] as const
  for (const key of texts) if (typeof data[key] !== 'string') throw new TypeError(`El pedido no trae ${key}.`)
  const due = data.payment_due_at
  if (due !== null && typeof due !== 'string') throw new TypeError('El pedido no trae bien su plazo para pagar.')
  return {
    id: data.id as number,
    status: data.status,
    deliveryDate: data.delivery_date as string,
    slotStartsAt: data.slot_starts_at as string,
    slotEndsAt: data.slot_ends_at as string,
    pickupName: data.pickup_name as string,
    pickupPhone: data.pickup_phone as string,
    subtotal: money(data.subtotal),
    standDeposit: money(data.stand_deposit),
    payment: parsePayment(data.payment),
    paymentDueAt: due,
  }
}

/**
 * Crea el pedido. Con la misma `idempotencyKey`, el servidor devuelve el pedido que ya existe (200) en lugar de crear
 * otro: un reintento tras una falla de red o un doble clic no duplica. Un rechazo es un `ApiError` con sus errores.
 */
export async function createOrder(request: OrderRequest, idempotencyKey: string): Promise<PlacedOrder> {
  const { body } = await requestWithSession(['orders'], {
    method: 'POST',
    json: request,
    headers: { 'Idempotency-Key': idempotencyKey },
    timeoutMs: CREATE_TIMEOUT_MS,
  })
  return parsePlacedOrder(body)
}
