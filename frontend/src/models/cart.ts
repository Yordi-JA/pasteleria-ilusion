import { PRICE_PATTERN } from './money.ts'
import { isOfferingPresentation, PRESENTATION_LABELS } from './presentation.ts'
import type { OfferingPresentation } from './presentation.ts'

/**
 * De dónde sale una línea (D47): `order` es un encargo (desde "Pasteles de la casa", el catálogo o la ficha), sin
 * tope de existencias; `showcase` es de la vitrina de hoy (vitrina y rebanadas), con el tope de lo que queda hoy.
 * La línea conserva su tipo: lo que pase cuando un pedido junta los dos lo decide la entrega (Etapa 4).
 */
export type Fulfillment = 'order' | 'showcase'

const FULFILLMENTS = new Set<string>(['order', 'showcase'])

function isFulfillment(value: unknown): value is Fulfillment {
  return typeof value === 'string' && FULFILLMENTS.has(value)
}

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
  fulfillment: Fulfillment
}

// Los adaptadores de la API al carrito (`toCartOffering` para las tarjetas y la ficha, que dan un encargo, y
// `stockItemToCartOffering` para la vitrina y las rebanadas, que dan una línea de la vitrina de hoy) viven en
// `catalog.ts`, junto a los tipos del catálogo. `name` es lo que se muestra: el producto con su presentación
// cuando no es el pastel completo ("Rebanada de tres leches de cajeta").

/**
 * Una línea del catálogo (`kind: 'offering'`). Se identifica por su presentación y su tipo (`offeringId` +
 * `fulfillment`): la misma presentación puede estar dos veces, una por encargo y otra de la vitrina de hoy.
 */
export type OfferingItem = CartOffering & {
  kind: 'offering'
  /** Entero de 1 a `MAX_LINE_QUANTITY`. */
  quantity: number
}

/**
 * Un pastel de "Diseña tu pastel" (`kind: 'design'`, D55). Cada diseño es una sola pieza (`quantity` 1) y se identifica por
 * su huella (`designId`): el mismo diseño no entra dos veces. Los montos son solo para mostrar, los que dio la API al
 * armarlo: el backend vuelve a calcular todo al pagar (Etapa 4), así que nunca se cobra lo que diga el navegador.
 */
export type DesignItem = {
  kind: 'design'
  designId: string
  /** "Pastel tres leches de pan de chocolate, relleno con queso y zarzamora". */
  name: string
  /** Lo elegido en cada paso, ya en frases, para que el pedido se lea completo. */
  details: string[]
  /** El pedido sin la base ni el envío, en texto decimal ("3825.00"); sin la decoración si la cotiza la pastelería. */
  total: string
  /** El depósito de la base, que va aparte; `null` sin base. */
  baseDeposit: string | null
  /** La decoración la cotiza la pastelería: el pedido queda en pausa hasta que dé el precio. */
  requiresQuote: boolean
  quantity: 1
  /** Todo lo elegido, para armar el pedido en la Etapa 4 (JSON de pocos KB). */
  design: Record<string, unknown>
  /**
   * Las imágenes que la persona subió ("Otra decoración" y la oblea) viven en `IndexedDB` (`designImages.ts`), porque una
   * de hasta 5 MB no cabe en `localStorage`; aquí solo va la clave de cada una.
   */
  images: { decoration?: string; wafer?: string }
}

/** Una línea del carrito: del catálogo o un pastel diseñado. */
export type CartItem = OfferingItem | DesignItem

/** Lo que identifica una línea del catálogo. */
export type LineKey = Pick<CartOffering, 'offeringId' | 'fulfillment'>

function sameLine(a: LineKey, b: LineKey): boolean {
  return a.offeringId === b.offeringId && a.fulfillment === b.fulfillment
}

/** La línea del catálogo con esa presentación y ese tipo, o `null`. */
function findOffering(items: CartItem[], key: LineKey): { index: number; item: OfferingItem } | null {
  const index = items.findIndex((item) => item.kind === 'offering' && sameLine(item, key))
  const item = items[index]
  return item && item.kind === 'offering' ? { index, item } : null
}

/**
 * Resultado de agregar: cuántas piezas entraron de verdad y cuántas hay ya en esa línea. `limit` llega solo
 * cuando no entró nada por un tope técnico (`MAX_LINE_QUANTITY` o `MAX_LINES`).
 */
export type AddResult = {
  items: CartItem[]
  added: number
  quantity: number
  limit?: true
}

/**
 * Una línea guardada que esta versión no sabe leer: otra clase (`kind`), o una presentación o un tipo
 * (`fulfillment`) nuevos. La escribió una pestaña con una versión más nueva del sitio, así que no es un dato
 * dañado: se conserva tal cual al escribir, para no borrarla, pero nunca se muestra ni se cuenta.
 */
export type OpaqueLine = Record<string, unknown>

/** Lo que hay guardado: las líneas que esta versión entiende y las que conserva sin leer. */
export type StoredCart = {
  items: CartItem[]
  unknown: OpaqueLine[]
}

/**
 * Clave versionada. Cambia solo cuando se rompe la compatibilidad y no basta con descartar o conservar línea
 * por línea: agregar `fulfillment` (D47) no la cambió, porque las líneas sin ese campo se descartan solas y en
 * producción ninguna pantalla agregaba al carrito todavía.
 */
export const CART_STORAGE_KEY = 'ilusion.cart.v1'

// Límites técnicos contra datos alterados, no reglas de negocio (D46): ningún cliente llega a ellos, y el
// límite real de una línea de la vitrina son las existencias del día (`maxQuantity`).
/** Líneas que se leen del almacenamiento; lo que sigue se ignora. */
export const MAX_LINES = 100
/** Piezas por línea. */
export const MAX_LINE_QUANTITY = 999
/** Largo del slug y del nombre del producto: el `max_length` de `Product.slug` y `Product.name`. */
export const MAX_TEXT_LENGTH = 80
/**
 * Largo del nombre de la línea: el del producto más el prefijo de presentación más largo ("Individual de "),
 * porque una presentación que no es el pastel completo se nombra "Rebanada de tres leches de cajeta".
 */
export const MAX_NAME_LENGTH =
  MAX_TEXT_LENGTH + Math.max(...Object.values(PRESENTATION_LABELS).map((label) => `${label} de `.length))
/** Largo del precio: `money()` de la API tiene 10 dígitos con 2 decimales ("99999999.99"). */
export const MAX_PRICE_LENGTH = 11

// El mismo patrón que `SlugField` de Django.
const SLUG = /^[-a-zA-Z0-9_]+$/
// Forma de los códigos de la API (`whole`, `slice`, `offering`). Un texto de interfaz ("Completo") no la tiene.
const CODE = /^[a-z][a-z0-9_]*$/

function isWholeBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  const { offeringId, presentation, fulfillment } = raw
  const name = cleanText(raw.name, MAX_NAME_LENGTH)
  const unitPrice = cleanText(raw.unitPrice, MAX_PRICE_LENGTH, PRICE_PATTERN)
  const slug = cleanText(raw.slug, MAX_TEXT_LENGTH, SLUG)
  if (!isWholeBetween(offeringId, 1, Number.MAX_SAFE_INTEGER) || !isOfferingPresentation(presentation)) return null
  if (!isFulfillment(fulfillment) || !name || !unitPrice || !slug) return null
  return { offeringId, name, presentation, unitPrice, slug, fulfillment }
}

/**
 * Una línea de catálogo que esta versión sabe mostrar. Una línea `offering` sin `fulfillment` es de antes de D47
 * (de una versión más vieja, no de una más nueva) y se descarta: conservarla sin leer la dejaría invisible, sin
 * forma de quitarla y ocupando uno de los 100 lugares para siempre, y todavía no hay pago, así que nada de lo que
 * tenía podía comprarse.
 */
function parseOfferingItem(data: Record<string, unknown>): OfferingItem | null {
  const { quantity } = data
  if (!isWholeBetween(quantity, 1, MAX_LINE_QUANTITY)) return null
  const offering = parseOffering(data)
  return offering && { ...offering, kind: 'offering', quantity }
}

/** Largos técnicos de una línea de diseño, contra datos alterados (no son reglas de negocio). */
const MAX_DESIGN_NAME = 300
const MAX_DESIGN_DETAILS = 12
const MAX_DESIGN_DETAIL = 400
const MAX_DESIGN_JSON = 8000
const MAX_DESIGN_ID = 40

function parseDesign(data: Record<string, unknown>): DesignItem | null {
  const designId = cleanText(data.designId, MAX_DESIGN_ID, SLUG)
  const name = cleanText(data.name, MAX_DESIGN_NAME)
  const total = cleanText(data.total, MAX_PRICE_LENGTH, PRICE_PATTERN)
  const baseDeposit = data.baseDeposit === null ? null : cleanText(data.baseDeposit, MAX_PRICE_LENGTH, PRICE_PATTERN)
  if (!designId || !name || !total || (data.baseDeposit !== null && !baseDeposit)) return null
  if (data.quantity !== 1 || typeof data.requiresQuote !== 'boolean' || !isRecord(data.design) || !isRecord(data.images)) return null
  if (!Array.isArray(data.details) || data.details.length > MAX_DESIGN_DETAILS) return null
  const details = data.details.map((detail) => cleanText(detail, MAX_DESIGN_DETAIL))
  if (details.includes(null) || JSON.stringify(data.design).length > MAX_DESIGN_JSON) return null
  const images: DesignItem['images'] = {}
  for (const slot of ['decoration', 'wafer'] as const) {
    const key = data.images[slot]
    if (key === undefined) continue
    const clean = cleanText(key, MAX_DESIGN_ID, SLUG)
    if (!clean) return null
    images[slot] = clean
  }
  return { kind: 'design', designId, name, details: details as string[], total, baseDeposit, requiresQuote: data.requiresQuote, quantity: 1, design: data.design, images }
}

function parseItem(data: unknown): CartItem | null {
  if (!isRecord(data)) return null
  if (data.kind === 'design') return parseDesign(data)
  return data.kind === 'offering' ? parseOfferingItem(data) : null
}

function isUnknownCode(value: unknown, isKnown: (code: string) => boolean): boolean {
  return typeof value === 'string' && CODE.test(value) && !isKnown(value)
}

/**
 * Una línea de una versión más nueva: un objeto con un `kind` con forma de código que no es `offering`, o una
 * línea `offering` cuya presentación o tipo tiene forma de código pero esta versión no conoce.
 */
function isOpaqueLine(data: unknown): data is OpaqueLine {
  if (!isRecord(data)) return false
  const { kind, presentation, fulfillment } = data
  if (typeof kind !== 'string' || !CODE.test(kind)) return false
  // Un `design` mal formado está dañado, no es de una versión más nueva: se descarta.
  if (kind === 'design') return false
  if (kind !== 'offering') return true
  return isUnknownCode(presentation, isOfferingPresentation) || isUnknownCode(fulfillment, isFulfillment)
}

function isSameItem(a: CartItem, b: CartItem): boolean {
  if (a.kind === 'design' || b.kind === 'design') return a.kind === b.kind && a.kind === 'design' && b.kind === 'design' && a.designId === b.designId
  return sameLine(a, b)
}

/**
 * Lee el carrito guardado. Lo que no tenga la forma esperada se descarta línea por línea, una línea repetida
 * (misma presentación y mismo tipo) conserva solo la primera y no se leen más de `MAX_LINES` líneas: un dato
 * dudoso nunca llega a la pantalla. Las líneas de una versión más nueva van aparte, en `unknown`, para
 * escribirlas de vuelta.
 */
export function parseCart(data: unknown): StoredCart {
  const items: CartItem[] = []
  const unknown: OpaqueLine[] = []
  if (!isRecord(data)) return { items, unknown }
  const lines = data.items
  if (!Array.isArray(lines)) return { items, unknown }
  for (const line of lines.slice(0, MAX_LINES)) {
    const item = parseItem(line)
    if (item) {
      if (!items.some((kept) => isSameItem(kept, item))) items.push(item)
    } else if (isOpaqueLine(line)) {
      unknown.push(line)
    }
  }
  return { items, unknown }
}

/**
 * Lee el carrito de `localStorage`. Devuelve `null` si el navegador no deja leer el almacenamiento, para que
 * quien llama siga con lo que tiene en memoria; un texto dañado es un carrito vacío. Las dos fallas se avisan
 * en la consola para diagnosticarlas y la página sigue.
 */
export function readCart(): StoredCart | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(CART_STORAGE_KEY)
  } catch (error) {
    console.warn('No se pudo leer el carrito guardado; se usa el de esta pestaña.', error)
    return null
  }
  if (raw === null) return { items: [], unknown: [] }
  try {
    return parseCart(JSON.parse(raw))
  } catch (error) {
    console.warn('El carrito guardado está dañado; empieza vacío.', error)
    return { items: [], unknown: [] }
  }
}

/**
 * Guarda el carrito con las líneas de una versión más nueva al final, sin pasar de `MAX_LINES` en total (las
 * propias van primero). Si no se puede (almacenamiento bloqueado o lleno), el carrito sigue en memoria durante
 * la visita y devuelve `false`.
 */
export function writeCart(items: CartItem[], unknown: OpaqueLine[] = []): boolean {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items: [...items, ...unknown].slice(0, MAX_LINES) }))
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

function assertReserved(reservedLines: number) {
  if (!isWholeBetween(reservedLines, 0, MAX_LINES)) {
    throw new RangeError(`Las líneas reservadas deben ser un entero de 0 a ${MAX_LINES}: ${reservedLines}`)
  }
}

/**
 * Agrega `quantity` piezas a la línea de esa presentación y ese tipo. Con `maxQuantity` (lo que queda hoy, solo
 * en una línea de la vitrina), la línea no lo pasa; si ya lo pasaba porque bajaron las existencias, no agrega ni
 * quita nada. Sin `maxQuantity` no hay tope de negocio, porque las reglas no fijan uno para un encargo. Los topes
 * técnicos no lanzan: si la línea pasaría de `MAX_LINE_QUANTITY` o una línea nueva pasaría de `MAX_LINES`
 * (contando `reservedLines`, las líneas guardadas que esta versión no lee), no agrega nada y devuelve
 * `limit: true`. Si la línea ya estaba, se suma y se renueva lo que se muestra (nombre, precio) sin moverla de
 * lugar. Un argumento fuera de rango es un `RangeError` y una presentación que no tiene la forma esperada, un
 * `TypeError`; lo guardado va recortado.
 */
export function addItem(
  items: CartItem[],
  offering: CartOffering,
  quantity: number,
  maxQuantity?: number,
  reservedLines = 0,
): AddResult {
  const clean = parseOffering(offering)
  if (!clean) throw new TypeError(`La presentación no tiene la forma esperada: ${JSON.stringify(offering)}`)
  assertQuantity(quantity)
  assertMax(maxQuantity)
  assertReserved(reservedLines)
  const found = findOffering(items, clean)
  const index = found?.index ?? -1
  const current = found?.item.quantity ?? 0
  const target = maxQuantity === undefined ? current + quantity : Math.max(current, Math.min(current + quantity, maxQuantity))
  if (target === current) return { items, added: 0, quantity: current }
  const tooManyPieces = target > MAX_LINE_QUANTITY
  const tooManyLines = index === -1 && items.length + reservedLines >= MAX_LINES
  if (tooManyPieces || tooManyLines) return { items, added: 0, quantity: current, limit: true }
  const line: OfferingItem = { ...clean, kind: 'offering', quantity: target }
  const next = index === -1 ? [...items, line] : items.map((item, i) => (i === index ? line : item))
  return { items: next, added: target - current, quantity: target }
}

/** Quita una línea: la de esa presentación y ese tipo, no la otra. Los pasteles diseñados no se tocan. */
export function removeItem(items: CartItem[], key: LineKey): CartItem[] {
  return items.filter((item) => item.kind !== 'offering' || !sameLine(item, key))
}

/** Cuántas piezas hay en una línea; 0 si no está. */
export function lineQuantity(items: CartItem[], key: LineKey): number {
  return findOffering(items, key)?.item.quantity ?? 0
}

/** Resultado de agregar un pastel diseñado: `duplicate` si ya estaba; `limit` si no cabe por el tope técnico de líneas. */
export type AddDesignResult = { items: CartItem[]; added: boolean; duplicate?: true; limit?: true }

/** Agrega un pastel diseñado. El mismo diseño (misma huella) no entra dos veces. */
export function addDesign(items: CartItem[], design: DesignItem, reservedLines = 0): AddDesignResult {
  const clean = parseDesign(design as unknown as Record<string, unknown>)
  if (!clean) throw new TypeError('El pastel diseñado no tiene la forma esperada.')
  assertReserved(reservedLines)
  if (items.some((item) => item.kind === 'design' && item.designId === clean.designId)) return { items, added: false, duplicate: true }
  if (items.length + reservedLines >= MAX_LINES) return { items, added: false, limit: true }
  return { items: [...items, clean], added: true }
}

/** Quita un pastel diseñado por su huella. */
export function removeDesign(items: CartItem[], designId: string): CartItem[] {
  return items.filter((item) => item.kind !== 'design' || item.designId !== designId)
}

/** Las claves de las imágenes guardadas aparte (`IndexedDB`) de las líneas diseñadas. */
export function imageKeysOf(items: CartItem[]): string[] {
  return items.flatMap((item) => (item.kind === 'design' ? Object.values(item.images) : []))
}

/** Piezas en el carrito: la suma de las cantidades, que es lo que muestra el contador. */
export function cartCount(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0)
}
