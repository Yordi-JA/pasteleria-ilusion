import { devRequestTimeoutMs, getJson, REQUEST_TIMEOUT_MS } from './apiClient.ts'
import type { CartOffering } from './cart.ts'
import { PRICE_PATTERN } from './money.ts'
import { isOfferingPresentation, offeringLabel } from './presentation.ts'
import type { OfferingPresentation } from './presentation.ts'

/**
 * Catálogo público de `/api/v1/` (D45): tipos del contrato (`ProductCardSerializer`, `TodayStockSerializer` en
 * `backend/core_pasteleria/api/serializers.py`), su validación y los adaptadores al carrito. Nada se guarda en
 * caché: las existencias cambian durante el día y cada pantalla pide lo vigente.
 */

export type ProductCategory = 'cake' | 'dessert'
export type SalesChannel = 'showcase_and_order' | 'order_only' | 'showcase_only'

/** Una presentación en una tarjeta: con su id se agrega al pedido. El precio llega como texto ("350.00"). */
export type CardOffering = {
  id: number
  presentation: OfferingPresentation
  price: string
}

/** Tarjeta de producto de `products/`, `featured-products/` y `related`. `null` es un dato pendiente. */
export type ProductCard = {
  slug: string
  name: string
  category: ProductCategory
  salesChannel: SalesChannel | null
  /** Código del tipo de pastel (`tres_leches`); `null` en los postres. */
  cakeType: string | null
  bread: string | null
  fillingBase: string | null
  /** Descripción corta; vacía si no llegó. */
  summary: string
  /** Nombre del archivo de la foto en `/fotos/`; `null` mientras falta (PENDIENTE). */
  photo: string | null
  inShowcaseToday: boolean
  /** Presentaciones activas que esta versión sabe mostrar, en el orden del admin. */
  offerings: CardOffering[]
}

/** Una partida de la vitrina o de las rebanadas de hoy. */
export type StockItem = {
  offeringId: number
  productSlug: string
  productName: string
  category: ProductCategory
  presentation: OfferingPresentation
  price: string
  photo: string | null
  /** Piezas que quedan hoy: "Quedan [n]". */
  stock: number
  /** "Agotada por hoy": sin piezas, o marcada así por la API. */
  soldOut: boolean
}

/** `showcase/` y `slices/`: la fecha de hoy en la pastelería ("AAAA-MM-DD") y lo cargado hoy. */
export type TodayStock = {
  /** `null` si no llegó una fecha válida: la pantalla no la inventa. */
  date: string | null
  items: StockItem[]
}

// El mismo patrón que `SlugField` de Django.
const SLUG = /^[-a-zA-Z0-9_]+$/
// El mismo validador que `photo_file_validator` del backend: un nombre de archivo, nunca una URL ni una ruta.
const PHOTO_FILE = /^[a-z0-9][a-z0-9-]*\.(webp|jpg|jpeg|png|avif)$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
// `max_length` de `Product.name` y `Product.slug`.
const MAX_TEXT_LENGTH = 80
const CATEGORIES = new Set<string>(['cake', 'dessert'])
const SALES_CHANNELS = new Set<string>(['showcase_and_order', 'order_only', 'showcase_only'])

/** Carpeta del frontend con las fotos de producto, que se refieren por nombre (D32). */
export const PHOTO_BASE = '/fotos/'

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, maxLength = MAX_TEXT_LENGTH, pattern?: RegExp): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > maxLength) return null
  return pattern && !pattern.test(trimmed) ? null : trimmed
}

function id(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function category(value: unknown): ProductCategory | null {
  return typeof value === 'string' && CATEGORIES.has(value) ? (value as ProductCategory) : null
}

function photo(value: unknown): string | null {
  return typeof value === 'string' && PHOTO_FILE.test(value) ? value : null
}

function price(value: unknown): string | null {
  return typeof value === 'string' && PRICE_PATTERN.test(value) ? value : null
}

function parseOffering(data: unknown): CardOffering | null {
  if (!isRecord(data)) return null
  const offeringId = id(data.id)
  const amount = price(data.price)
  if (offeringId === null || amount === null || !isOfferingPresentation(data.presentation)) return null
  return { id: offeringId, presentation: data.presentation, price: amount }
}

function parseCard(data: unknown): ProductCard | null {
  if (!isRecord(data)) return null
  const slug = text(data.slug, MAX_TEXT_LENGTH, SLUG)
  const name = text(data.name)
  const kind = category(data.category)
  if (!slug || !name || !kind) return null
  const offerings = Array.isArray(data.offerings)
    ? data.offerings.map(parseOffering).filter((offering): offering is CardOffering => offering !== null)
    : []
  return {
    slug,
    name,
    category: kind,
    salesChannel: typeof data.sales_channel === 'string' && SALES_CHANNELS.has(data.sales_channel) ? (data.sales_channel as SalesChannel) : null,
    cakeType: text(data.cake_type, MAX_TEXT_LENGTH, SLUG),
    bread: text(data.bread, MAX_TEXT_LENGTH, SLUG),
    fillingBase: text(data.filling_base, MAX_TEXT_LENGTH, SLUG),
    summary: typeof data.summary === 'string' ? data.summary.trim() : '',
    photo: photo(data.photo),
    inShowcaseToday: data.in_showcase_today === true,
    offerings,
  }
}

/**
 * Valida cada entrada de una lista y descarta las que no tienen la forma esperada, avisando en la consola cuántas.
 * Si la lista traía entradas y ninguna sirve, es un `TypeError`: la API cambió o falló, y la sección debe mostrar
 * su error, no desaparecer como si no hubiera nada.
 */
function parseList<T>(entries: unknown[], parse: (entry: unknown) => T | null, what: string): T[] {
  const parsed = entries.map(parse).filter((entry): entry is T => entry !== null)
  const dropped = entries.length - parsed.length
  if (entries.length > 0 && parsed.length === 0) throw new TypeError(`Ninguna de las ${entries.length} ${what} tiene la forma esperada.`)
  if (dropped > 0) console.warn(`Se descartaron ${dropped} de ${entries.length} ${what} que no tienen la forma esperada.`)
  return parsed
}

/**
 * Valida una lista de tarjetas. Una tarjeta o una presentación que no tiene la forma esperada se descarta (una
 * presentación nueva que esta versión no conoce, también); una respuesta que no es una lista, o una lista en la
 * que ninguna tarjeta sirve, es un `TypeError`, para que la pantalla muestre el error y no una lista vacía.
 */
export function parseProductCards(data: unknown): ProductCard[] {
  if (!Array.isArray(data)) throw new TypeError('La lista de productos no tiene la forma esperada.')
  return parseList(data, parseCard, 'tarjetas de producto')
}

function parseStockItem(data: unknown): StockItem | null {
  if (!isRecord(data)) return null
  const offeringId = id(data.offering_id)
  const productSlug = text(data.product_slug, MAX_TEXT_LENGTH, SLUG)
  const productName = text(data.product_name)
  const kind = category(data.category)
  const amount = price(data.price)
  const { stock, presentation } = data
  if (offeringId === null || !productSlug || !productName || !kind || amount === null) return null
  if (!isOfferingPresentation(presentation)) return null
  if (typeof stock !== 'number' || !Number.isSafeInteger(stock) || stock < 0) return null
  return {
    offeringId,
    productSlug,
    productName,
    category: kind,
    presentation,
    price: amount,
    photo: photo(data.photo),
    stock,
    soldOut: stock === 0 || data.sold_out === true,
  }
}

/**
 * Valida la vitrina o las rebanadas de hoy. Una partida dudosa se descarta; una fecha con otra forma queda en
 * `null`; una respuesta sin `items` en lista, o con partidas de las que ninguna sirve, es un `TypeError`.
 */
export function parseTodayStock(data: unknown): TodayStock {
  if (!isRecord(data) || !Array.isArray(data.items)) throw new TypeError('Las existencias de hoy no tienen la forma esperada.')
  return {
    date: typeof data.date === 'string' && ISO_DATE.test(data.date) ? data.date : null,
    items: parseList(data.items, parseStockItem, 'partidas de hoy'),
  }
}

/**
 * Dirección de una foto de producto. Vuelve a revisar que sea un nombre de archivo (nunca una ruta ni una URL),
 * aunque llegue ya validado: así ninguna pantalla arma una dirección con un dato dudoso. Si no lo es, `null`.
 */
export function photoUrl(file: string): string | null {
  return PHOTO_FILE.test(file) ? `${PHOTO_BASE}${file}` : null
}

/**
 * La presentación que se ofrece en una tarjeta de la portada: el pastel completo (`whole`) si lo hay; si no,
 * la primera, en el orden del admin. Sin presentaciones, `null`.
 */
export function featuredOffering(card: Pick<ProductCard, 'offerings'>): CardOffering | null {
  return card.offerings.find((offering) => offering.presentation === 'whole') ?? card.offerings[0] ?? null
}

/**
 * Adaptador de una tarjeta o ficha al carrito: un encargo (`order`), sin tope de existencias. El nombre lleva la
 * presentación cuando no es el completo.
 */
export function toCartOffering(card: Pick<ProductCard, 'slug' | 'name'>, offering: CardOffering): CartOffering {
  return {
    offeringId: offering.id,
    name: offeringLabel(card.name, offering.presentation),
    presentation: offering.presentation,
    unitPrice: offering.price,
    slug: card.slug,
    fulfillment: 'order',
  }
}

/** Adaptador de una partida de la vitrina o de las rebanadas al carrito: una línea de la vitrina de hoy (`showcase`). */
export function stockItemToCartOffering(item: StockItem): CartOffering {
  return {
    offeringId: item.offeringId,
    name: offeringLabel(item.productName, item.presentation),
    presentation: item.presentation,
    unitPrice: item.price,
    slug: item.productSlug,
    fulfillment: 'showcase',
  }
}

/**
 * La petición se cancela si quien la pidió ya no la necesita (`signal`) o si pasan 10 s. Solo en desarrollo, las
 * pruebas E2E bajan el corte con `globalThis.__catalogTimeoutMs`; en el build la rama desaparece.
 */
function withTimeout(signal: AbortSignal): AbortSignal {
  const ms = import.meta.env.DEV ? devRequestTimeoutMs('__catalogTimeoutMs') : REQUEST_TIMEOUT_MS
  return AbortSignal.any([signal, AbortSignal.timeout(ms)])
}

/** "Pasteles de la casa": hasta 4 productos (D45). */
export async function getFeaturedProducts(signal: AbortSignal): Promise<ProductCard[]> {
  return parseProductCards(await getJson(['featured-products'], { signal: withTimeout(signal) }))
}

/** Vitrina de hoy, completa: la portada filtra Todo, Pasteles y Postres sin volver a pedir. */
export async function getShowcase(signal: AbortSignal): Promise<TodayStock> {
  return parseTodayStock(await getJson(['showcase'], { signal: withTimeout(signal) }))
}

/** Rebanadas de hoy. */
export async function getSlices(signal: AbortSignal): Promise<TodayStock> {
  return parseTodayStock(await getJson(['slices'], { signal: withTimeout(signal) }))
}
