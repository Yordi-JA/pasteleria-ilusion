/**
 * El estado de la compra entre la entrega y el pago (D66), acotado a eso (no es un almacén para todo):
 * - la llave de idempotencia del intento de compra y la huella de lo que se pidió, en `sessionStorage`: una llave al azar
 *   y un hash, sin datos de la cuenta. Con la misma huella, un reintento, un doble clic o una recarga a media creación
 *   mandan la misma llave y el servidor devuelve el mismo pedido. Con otra huella (cambió el carrito, la fecha, el lapso
 *   o quién recoge) es otro intento y lleva otra llave: si no, el servidor devolvería el pedido viejo;
 * - los ids de las imágenes ya subidas en este intento, en memoria, para no volver a subirlas en un reintento;
 * - el pedido creado, solo en memoria: es un dato de la cuenta y no va a ningún almacenamiento del navegador.
 * Al crear el pedido o al cerrar la sesión (`resetPurchase`), la llave, la huella y las imágenes se olvidan.
 */
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

/** Un hash estable sin `crypto.subtle` (el sitio abierto por `http://<IP>`): cyrb53, en base 36. */
function fallbackHash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `c${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(11, '0')}`
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
  const text = JSON.stringify([deliveryDate, slotStartsAt, pickupName, pickupPhone, items.map(lineIdentity)])
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return fallbackHash(text)
  }
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
