/**
 * El estado de la compra entre la entrega y el pago (D66), acotado a eso (no es un almacén para todo):
 * - la llave de idempotencia del intento de compra y la huella de lo que se pidió, en `sessionStorage`: una llave al azar
 *   y un hash, sin datos de la cuenta. Con la misma huella, un reintento, un doble clic o una recarga a media creación
 *   mandan la misma llave y el servidor devuelve el mismo pedido. Con otra huella (cambió el carrito, la fecha, el lapso
 *   o quién recoge) es otro intento y lleva otra llave: si no, el servidor devolvería el pedido viejo;
 * - los ids de las imágenes ya subidas en este intento, en memoria, para no volver a subirlas en un reintento;
 * - el pedido creado, solo en memoria: es un dato de la cuenta y no va a ningún almacenamiento del navegador;
 * - las miniaturas de los pasteles del pedido creado, por línea y con su id, en `sessionStorage` (tanda 4).
 * Al crear el pedido o al cerrar la sesión (`resetPurchase`), la llave, la huella y las imágenes se olvidan; al cerrar la
 * sesión, también las miniaturas.
 */
import { fingerprintOf } from './attempts.ts'
import { isThumbnail, MAX_LINES } from './cart.ts'
import type { CartItem } from './cart.ts'
import type { PlacedOrder } from './orders.ts'

const STORAGE_KEY = 'ilusion.checkout.v1'
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const FINGERPRINT_PATTERN = /^[a-z0-9]{8,128}$/

type Attempt = { key: string; fingerprint: string }

let memory: Attempt | null = null
let placed: PlacedOrder | null = null
const uploads = new Map<string, string>()

function readStored(): Attempt | null {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const { key, fingerprint } = raw as Record<string, unknown>
    return typeof key === 'string' && KEY_PATTERN.test(key) && typeof fingerprint === 'string' && FINGERPRINT_PATTERN.test(fingerprint)
      ? { key, fingerprint }
      : null
  } catch {
    return null
  }
}

function store(attempt: Attempt | null) {
  try {
    if (attempt) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt))
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sin almacenamiento, el intento vive en memoria durante la visita.
  }
}

/** Lo que identifica a una línea en la huella: la presentación, su tipo y sus piezas, o la huella del pastel diseñado. */
function lineIdentity(item: CartItem): string {
  return item.kind === 'design' ? `design:${item.designId}` : `${item.fulfillment}:${item.offeringId}:${item.quantity}`
}

export type PurchaseChoices = {
  items: CartItem[]
  deliveryDate: string
  slotStartsAt: string
  pickupName: string
  pickupPhone: string
}

/**
 * La huella de lo que se pide, como hash (SHA-256 con `crypto.subtle`; sin contexto seguro, cyrb53): el navegador guarda
 * el hash, nunca el nombre ni el teléfono.
 */
export async function purchaseFingerprint({ items, deliveryDate, slotStartsAt, pickupName, pickupPhone }: PurchaseChoices): Promise<string> {
  return fingerprintOf(JSON.stringify([deliveryDate, slotStartsAt, pickupName, pickupPhone, items.map(lineIdentity)]))
}

/**
 * La llave del intento de compra con esa huella. La misma huella da la misma llave; otra huella es otro intento: llave
 * nueva (un UUID, que la API acepta) y sin las imágenes subidas antes.
 */
export function purchaseKey(fingerprint: string): string {
  memory ??= readStored()
  if (memory?.fingerprint === fingerprint) return memory.key
  uploads.clear()
  memory = { key: crypto.randomUUID(), fingerprint }
  store(memory)
  return memory.key
}

/** El id en el servidor de una imagen del navegador ya subida en este intento, si lo hay. */
export function uploadedImageId(localKey: string): string | null {
  return uploads.get(localKey) ?? null
}

export function rememberUpload(localKey: string, serverId: string) {
  uploads.set(localKey, serverId)
}

/**
 * Olvida el intento y el pedido creado: la llave, la huella, las imágenes subidas y el pedido en memoria (al vencer el
 * pedido o al cerrar la sesión, para que otra cuenta en la misma pestaña no herede nada).
 */
export function resetPurchase() {
  memory = null
  store(null)
  uploads.clear()
  placed = null
  forgetPaymentKeys()
  forgetOrderThumbnails()
}

/** El pedido ya existe: el intento se olvida y el pedido se guarda en memoria para el pago. */
export function finishPurchase(order: PlacedOrder) {
  resetPurchase()
  placed = order
}

/** El último pedido creado en esta pestaña, para el pago; `null` tras recargar. */
export function getPlacedOrder(): PlacedOrder | null {
  return placed
}

// --- Llaves del pago (D68) ---

const PAYMENT_STORAGE_KEY = 'ilusion.payment.v1'

/** Los métodos de pago del contrato de D68. */
export type PaymentMethod = 'mercadopago' | 'stripe' | 'cash'

type PaymentKeys = { orderId: number; keys: Partial<Record<PaymentMethod, string>> }

let paymentKeys: PaymentKeys | null = null

function readPaymentKeys(): PaymentKeys | null {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(PAYMENT_STORAGE_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const { orderId, keys } = raw as Record<string, unknown>
    if (typeof orderId !== 'number' || !Number.isSafeInteger(orderId) || typeof keys !== 'object' || keys === null) return null
    const valid: PaymentKeys['keys'] = {}
    for (const method of ['mercadopago', 'stripe', 'cash'] as const) {
      const key = (keys as Record<string, unknown>)[method]
      if (typeof key === 'string' && KEY_PATTERN.test(key)) valid[method] = key
    }
    return { orderId, keys: valid }
  } catch {
    return null
  }
}

function storePaymentKeys(value: PaymentKeys | null) {
  try {
    if (value) window.sessionStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(value))
    else window.sessionStorage.removeItem(PAYMENT_STORAGE_KEY)
  } catch {
    // Sin almacenamiento, las llaves viven en memoria durante la visita.
  }
}

/**
 * La llave de idempotencia del pago de un pedido con un método: una por intento y por método. Con el mismo método, un
 * doble clic, una falla de red, una recarga o volver de Mercado Pago mandan la misma llave y el servidor responde el
 * mismo intento (el mismo PaymentIntent o la misma preferencia) sin abrir otro cobro. Otro método lleva su propia llave:
 * la misma con otro método es un conflicto (409). Solo se guarda el pedido de ahora; otro pedido empieza de cero. En
 * `sessionStorage` van el id del pedido y llaves al azar, nada de la cuenta.
 */
export function paymentKey(orderId: number, method: PaymentMethod): string {
  paymentKeys ??= readPaymentKeys()
  if (paymentKeys?.orderId !== orderId) paymentKeys = { orderId, keys: {} }
  const key = (paymentKeys.keys[method] ??= crypto.randomUUID())
  storePaymentKeys(paymentKeys)
  return key
}

/** Olvida la llave de un método (el servidor dijo que ya se usó con otro): el siguiente intento lleva una nueva. */
export function forgetPaymentKey(orderId: number, method: PaymentMethod) {
  paymentKeys ??= readPaymentKeys()
  if (paymentKeys?.orderId !== orderId) return
  delete paymentKeys.keys[method]
  storePaymentKeys(paymentKeys)
}

function forgetPaymentKeys() {
  paymentKeys = null
  storePaymentKeys(null)
}

// --- Miniaturas del pedido creado (tanda 4) ---

const THUMBNAILS_STORAGE_KEY = 'ilusion.orderThumbnails.v1'

/** La miniatura de cada línea del pedido, en el orden de sus líneas (`null` en las que no la llevan). */
type OrderThumbnails = { orderId: number; thumbnails: (string | null)[] }

let orderThumbnailsMemory: OrderThumbnails | null = null

function readOrderThumbnails(): OrderThumbnails | null {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(THUMBNAILS_STORAGE_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const { orderId, thumbnails } = raw as Record<string, unknown>
    if (typeof orderId !== 'number' || !Number.isSafeInteger(orderId) || !Array.isArray(thumbnails) || thumbnails.length > MAX_LINES) return null
    return { orderId, thumbnails: thumbnails.map((value) => (isThumbnail(value) ? value : null)) }
  } catch {
    return null
  }
}

function storeOrderThumbnails(value: OrderThumbnails | null) {
  try {
    if (value) window.sessionStorage.setItem(THUMBNAILS_STORAGE_KEY, JSON.stringify(value))
    else window.sessionStorage.removeItem(THUMBNAILS_STORAGE_KEY)
  } catch {
    // Sin almacenamiento (o sin espacio), las miniaturas viven en memoria durante la visita.
  }
}

/**
 * Guarda las miniaturas de los pasteles del pedido recién creado, una por línea en el orden del carrito, que es el orden de
 * las líneas del pedido en el servidor (`OrderItem.position`). El carrito se vacía al crear el pedido, y así el pago, el
 * apartado y la confirmación siguen mostrando el pastel, también al volver de Mercado Pago en la misma pestaña. Va en
 * `sessionStorage` con el id del pedido y las imágenes, nada de la cuenta, y solo el pedido de ahora.
 */
export function rememberOrderThumbnails(orderId: number, items: CartItem[]) {
  const thumbnails = items.map((item) => (item.kind === 'design' ? (item.thumbnail ?? null) : null))
  orderThumbnailsMemory = thumbnails.some(Boolean) ? { orderId, thumbnails } : null
  storeOrderThumbnails(orderThumbnailsMemory)
}

/** Las miniaturas por línea del pedido, si es el que se creó en esta pestaña; si no, ninguna. */
export function orderThumbnails(orderId: number): (string | null)[] {
  orderThumbnailsMemory ??= readOrderThumbnails()
  return orderThumbnailsMemory?.orderId === orderId ? orderThumbnailsMemory.thumbnails : []
}

function forgetOrderThumbnails() {
  orderThumbnailsMemory = null
  storeOrderThumbnails(null)
}
