import { isOfferingPresentation } from './presentation.ts'
import type { OfferingPresentation } from './presentation.ts'

/**
 * Una presentación del catálogo (`ProductOffering`) tal como se ve al agregarla. El precio es solo para mostrar:
 * el backend lo vuelve a calcular al pagar (Etapa 4), así que nunca se cobra lo que diga el navegador.
 */
export type CartOffering = {
  offeringId: number
  name: string
  /** Código de la API; la interfaz lo muestra con `PRESENTATION_LABELS`. */
  presentation: OfferingPresentation
  /** Precio por pieza en texto decimal, como lo manda la API ("350.00"). */
  unitPrice: string
  /** Slug del producto, para el enlace a `/pasteles/:slug`. */
  slug: string
}

// Los adaptadores de la API al carrito (`toCartOffering` para la ficha y el catálogo, `stockItemToCartOffering`
// para `stock/today`) van en el PR de la portada, junto a los tipos del catálogo.

/**
 * Una línea del carrito. Hoy toda línea es del catálogo (`kind: 'offering'`); los pedidos de "Diseña tu pastel"
 * entrarán como otra clase con su propio `kind`, sin cambiar la clave guardada.
 */
export type CartItem = CartOffering & {
  kind: 'offering'
  /** Entero de 1 a `MAX_LINE_QUANTITY`. */
  quantity: number
}

/** Resultado de agregar: cuántas piezas entraron de verdad y cuántas hay ya de esa presentación. */
export type AddResult = {
  items: CartItem[]
  added: number
  quantity: number
}

/** Clave versionada: si la forma cambia, una clave nueva evita leer datos viejos como si fueran actuales. */
export const CART_STORAGE_KEY = 'ilusion.cart.v1'

// Límites técnicos contra datos alterados, no reglas de negocio (D46): ningún cliente llega a ellos, y el
// límite real de cada presentación son las existencias del día (`maxQuantity`).
/** Líneas que se leen del almacenamiento; lo que sigue se ignora. */
export const MAX_LINES = 100
/** Piezas por línea. */
export const MAX_LINE_QUANTITY = 999
/** Largo del nombre y del slug: el `max_length` de `Product.name` y `Product.slug`. */
export const MAX_TEXT_LENGTH = 80
/** Largo del precio: `money()` de la API tiene 10 dígitos con 2 decimales ("99999999.99"). */
export const MAX_PRICE_LENGTH = 11

const PRICE = /^\d+(\.\d{1,2})?$/
// El mismo patrón que `SlugField` de Django.
const SLUG = /^[-a-zA-Z0-9_]+$/

function isWholeBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

/** Texto recortado que cumple el largo y, si lo hay, el patrón; si no, `null`. */
function cleanText(value: unknown, maxLength: number, pattern?: RegExp): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > maxLength) return null
  return pattern && !pattern.test(trimmed) ? null : trimmed
}

/** Valida y recorta lo que se muestra de una presentación. Lo usan la lectura guardada y `addItem`. */
function parseOffering(raw: Record<string, unknown>): CartOffering | null {
  const { offeringId, presentation } = raw
  const name = cleanText(raw.name, MAX_TEXT_LENGTH)
  const unitPrice = cleanText(raw.unitPrice, MAX_PRICE_LENGTH, PRICE)
  const slug = cleanText(raw.slug, MAX_TEXT_LENGTH, SLUG)
  if (!isWholeBetween(offeringId, 1, Number.MAX_SAFE_INTEGER) || !isOfferingPresentation(presentation)) return null
  if (!name || !unitPrice || !slug) return null
  return { offeringId, name, presentation, unitPrice, slug }
}

function parseItem(data: unknown): CartItem | null {
  if (typeof data !== 'object' || data === null) return null
  const raw = data as Record<string, unknown>
  const { quantity } = raw
  if (raw.kind !== 'offering' || !isWholeBetween(quantity, 1, MAX_LINE_QUANTITY)) return null
  const offering = parseOffering(raw)
  return offering && { ...offering, kind: 'offering', quantity }
}

/**
 * Lee el carrito guardado. Lo que no tenga la forma esperada se descarta línea por línea, una presentación
 * repetida conserva solo la primera y no se leen más de `MAX_LINES` líneas: un dato dudoso nunca llega a la pantalla.
 */
export function parseCart(data: unknown): CartItem[] {
  if (typeof data !== 'object' || data === null) return []
  const lines = (data as Record<string, unknown>).items
  if (!Array.isArray(lines)) return []
  const seen = new Set<number>()
  const items: CartItem[] = []
  for (const line of lines.slice(0, MAX_LINES)) {
    const item = parseItem(line)
    if (item && !seen.has(item.offeringId)) {
      seen.add(item.offeringId)
      items.push(item)
    }
  }
  return items
}

/**
 * Lee el carrito de `localStorage`. Devuelve `null` si el navegador no deja leer el almacenamiento, para que
 * quien llama siga con lo que tiene en memoria; un texto dañado es un carrito vacío. Las dos fallas se avisan
 * en la consola para diagnosticarlas y la página sigue.
 */
export function readCart(): CartItem[] | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(CART_STORAGE_KEY)
  } catch (error) {
    console.warn('No se pudo leer el carrito guardado; se usa el de esta pestaña.', error)
    return null
  }
  if (raw === null) return []
  try {
    return parseCart(JSON.parse(raw))
  } catch (error) {
    console.warn('El carrito guardado está dañado; empieza vacío.', error)
    return []
  }
}

/**
 * Guarda el carrito. Si no se puede (almacenamiento bloqueado o lleno), el carrito sigue en memoria durante la
 * visita y devuelve `false`.
 */
export function writeCart(items: CartItem[]): boolean {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items }))
    return true
  } catch (error) {
    console.warn('No se pudo guardar el carrito; se conserva solo en esta pestaña.', error)
    return false
  }
}

function assertQuantity(quantity: number) {
  if (!isWholeBetween(quantity, 1, MAX_LINE_QUANTITY)) {
    throw new RangeError(`La cantidad debe ser un entero de 1 a ${MAX_LINE_QUANTITY}: ${quantity}`)
  }
}

function assertMax(maxQuantity: number | undefined) {
  if (maxQuantity !== undefined && !isWholeBetween(maxQuantity, 0, Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`El máximo debe ser un entero de 0 en adelante: ${maxQuantity}`)
  }
}

/**
 * Agrega `quantity` piezas de una presentación. Con `maxQuantity` (lo que queda hoy), el total de esa
 * presentación no lo pasa; si ya lo pasaba porque bajaron las existencias, no agrega ni quita nada. Sin
 * `maxQuantity` no hay tope de negocio, porque las reglas no fijan uno; sí aplican los técnicos
 * (`MAX_LINE_QUANTITY` y `MAX_LINES`, con `RangeError`). Si la presentación ya estaba, se suma y se renueva lo
 * que se muestra (nombre, precio) sin moverla de lugar. Una presentación que no tiene la forma esperada es un
 * `TypeError`; lo guardado va recortado.
 */
export function addItem(items: CartItem[], offering: CartOffering, quantity: number, maxQuantity?: number): AddResult {
  const clean = parseOffering(offering)
  if (!clean) throw new TypeError(`La presentación no tiene la forma esperada: ${JSON.stringify(offering)}`)
  assertQuantity(quantity)
  assertMax(maxQuantity)
  const index = items.findIndex((item) => item.offeringId === clean.offeringId)
  const current = index === -1 ? 0 : items[index].quantity
  const target = maxQuantity === undefined ? current + quantity : Math.max(current, Math.min(current + quantity, maxQuantity))
  if (target === current) return { items, added: 0, quantity: current }
  if (target > MAX_LINE_QUANTITY) throw new RangeError(`Una línea no pasa de ${MAX_LINE_QUANTITY} piezas: ${target}`)
  if (index === -1 && items.length >= MAX_LINES) throw new RangeError(`El carrito no pasa de ${MAX_LINES} líneas.`)
  const line: CartItem = { ...clean, kind: 'offering', quantity: target }
  const next = index === -1 ? [...items, line] : items.map((item, i) => (i === index ? line : item))
  return { items: next, added: target - current, quantity: target }
}

export function removeItem(items: CartItem[], offeringId: number): CartItem[] {
  return items.filter((item) => item.offeringId !== offeringId)
}

/** Piezas en el carrito: la suma de las cantidades, que es lo que muestra el contador. */
export function cartCount(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0)
}
