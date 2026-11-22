import type { DrizzleKind, FruitKind, FruitLayoutKind, ShellPlace, SideBitsKind, SideTextureKind } from '../three/cakeShape.ts'
import { ApiError, devRequestTimeoutMs, getJson, REQUEST_TIMEOUT_MS } from './apiClient.ts'
import type { CartOffering, Fulfillment } from './cart.ts'
import { normalizeHex } from './color.ts'
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

/**
 * Una presentación en una tarjeta: con su id se agrega al pedido. El precio llega como texto ("350.00"); `null` es PENDIENTE
 * (tanda 2): la interfaz dice "[Precio por confirmar]" y no la deja agregar.
 */
export type CardOffering = {
  id: number
  presentation: OfferingPresentation
  price: string | null
}

/** Una presentación con precio: la única que se agrega al pedido. */
export type PricedOffering = CardOffering & { price: string }

export function isPriced<T extends CardOffering>(offering: T): offering is T & { price: string } {
  return offering.price !== null
}

/** El marcador de un precio PENDIENTE (regla 1 de AGENTS.md), como `Pending`. */
export const PENDING_PRICE = '[Precio por confirmar]'

/** Si "Personalizar este pastel" lo abre como pastel de vitrina (tanda 2) y, si no, por qué. */
export type ShowcaseDesign = { available: boolean; unavailableReason: string | null }

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
  /** "Rebanado hoy" (D60): el producto es el pastel que se vende en rebanadas hoy y le quedan rebanadas. */
  slicedToday: boolean
  /** Presentaciones activas que esta versión sabe mostrar, en el orden del admin. */
  offerings: CardOffering[]
  /** `null` si la API no lo manda (una versión anterior): entonces no se personaliza como pastel de vitrina. */
  showcaseDesign: ShowcaseDesign | null
  /**
   * La imagen fija del modelo (D86), en `/fotos/`: la tarjeta y la portada la muestran en lugar de la foto. `null` si la
   * pastelería no la muestra en el catálogo: entonces va la foto o, sin ella, el hueco.
   */
  modelImage: string | null
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
  /**
   * Solo en la vitrina: la partida es el rebanado (D60). Se ve completo, pero no se agrega completo; la partida es su
   * rebanada (`stock`, las rebanadas que quedan) y la foto es la del producto. Siempre `false` en las rebanadas.
   */
  sliced: boolean
  /** Solo en la vitrina: la imagen del modelo donde va la foto del producto (D86). Siempre `null` en las rebanadas. */
  modelImage: string | null
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

/** Un precio de la API, o `null` si es PENDIENTE (`price` en `null` con `price_pending`); `undefined` si no tiene la forma esperada. */
function offeringPrice(data: Raw): string | null | undefined {
  if (data.price === null && data.price_pending === true) return null
  return price(data.price) ?? undefined
}

function parseOffering(data: unknown): CardOffering | null {
  if (!isRecord(data)) return null
  const offeringId = id(data.id)
  const amount = offeringPrice(data)
  if (offeringId === null || amount === undefined || !isOfferingPresentation(data.presentation)) return null
  return { id: offeringId, presentation: data.presentation, price: amount }
}

function parseShowcaseDesign(data: unknown): ShowcaseDesign | null {
  if (!isRecord(data)) return null
  return { available: data.available === true, unavailableReason: typeof data.unavailable_reason === 'string' ? data.unavailable_reason : null }
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
    slicedToday: data.sliced_today === true,
    offerings,
    showcaseDesign: parseShowcaseDesign(data.showcase_design),
    modelImage: photo(data.model_image),
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
  const amount = offeringPrice(data)
  const { stock, presentation } = data
  // Una partida de hoy sin precio (PENDIENTE) no se puede vender en la vitrina: se descarta, como una dudosa.
  if (offeringId === null || !productSlug || !productName || !kind || amount === undefined || amount === null) return null
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
    // Solo una rebanada puede ser el rebanado: un `sliced` en otra presentación no se cree.
    sliced: data.sliced === true && presentation === 'slice',
    modelImage: photo(data.model_image),
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
 * la primera que no es rebanada, en el orden del admin (una rebanada no se encarga, D60). Sin ninguna, `null`.
 */
export function featuredOffering<T extends CardOffering>(card: { offerings: T[] }): T | null {
  const orderable = card.offerings.filter((offering) => offering.presentation !== 'slice')
  return orderable.find((offering) => offering.presentation === 'whole') ?? orderable[0] ?? null
}

/**
 * Adaptador de una tarjeta o ficha al carrito: por omisión un encargo (`order`), sin tope de existencias; la ficha
 * pasa `showcase` cuando se lleva hoy de la vitrina. El nombre lleva la presentación cuando no es el completo.
 */
export function toCartOffering(card: Pick<ProductCard, 'slug' | 'name'>, offering: PricedOffering, fulfillment: Fulfillment = 'order'): CartOffering {
  return {
    offeringId: offering.id,
    name: offeringLabel(card.name, offering.presentation),
    presentation: offering.presentation,
    unitPrice: offering.price,
    slug: card.slug,
    fulfillment,
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

// --- Catálogo y ficha ---

/**
 * Tope del término de búsqueda del catálogo: el `max_length` de `search` en `CatalogQuerySerializer` (el largo del
 * nombre de un producto). Un término más largo, la API lo rechaza con 400.
 */
export const SEARCH_MAX_LENGTH = MAX_TEXT_LENGTH

/** Lo que filtra el catálogo: la categoría (`null` es Todo) y el término de búsqueda (vacío, sin buscar). */
export type CatalogQuery = { category: ProductCategory | null; search: string }

/** Una presentación en la ficha: además del precio, el peso, las personas, la foto y las existencias de hoy. */
export type DetailOffering = CardOffering & {
  /** Kilos aproximados como texto ("2.7"); `null` si aún no se define. */
  approxWeightKg: string | null
  /** Personas que rinde; `null` si aún no se define. */
  servings: number | null
  /** La foto de la presentación o, si no tiene, la del producto; `null` mientras falta. */
  photo: string | null
  /** Piezas en la vitrina de hoy: `null` si no se cargó hoy (solo por encargo), `0` si se agotó. */
  stock: number | null
}

/**
 * La muestra del modelo de un pastel (D86, `SampleDesignSerializer`): lo que dibuja su imagen fija además del tipo, el pan y el
 * relleno del producto. La fruta solo va en esa imagen; "Diseña tu pastel" no la ofrece.
 */
export type SampleDesign = {
  /** `#rrggbb` en minúsculas, como los colores del borrador. */
  coverageColor: string
  /** La decoración del paso 6; `null` si ya no está activa (entonces no se genera la imagen). */
  decoration: string | null
  /** `#rrggbb` en minúsculas; `null` es automático. */
  decorationColor: string | null
  /** `null`: sin fruta. */
  fruitLayout: FruitLayoutKind | null
  fruits: FruitKind[]
  sideComb: boolean
  /** El archivo de la imagen en `/fotos/`; `null` si aún no se genera. */
  modelImage: string | null
  showModelInCatalog: boolean
  /** Lo que solo dibuja la imagen del catálogo (tanda 4b). */
  details: SampleDetails
}

/**
 * Los detalles de la imagen del catálogo (tanda 4b): los colores en `#rrggbb` minúsculas y `null` donde no lleva. Una pareja a
 * medias (un anillo sin ancho, unos hilos sin color) se descarta entera.
 */
export type SampleDetails = {
  topColor: string | null
  topGlossy: boolean
  sideGlossy: boolean
  sideTexture: SideTextureKind | null
  ring: { color: string; width: number } | null
  band: { color: string; height: number } | null
  drizzle: { kind: DrizzleKind; color: string } | null
  /** De 0.5 a 2.5; 1 es el tamaño del diseñador. */
  edgeSize: number
  shells: { place: ShellPlace; colors: string[] } | null
  dustingColor: string | null
  sideBits: { kind: SideBitsKind; color: string } | null
  /** De 1 (el montón de siempre) a 3 (toda la parte libre de la tapa, alto). */
  fruitDensity: number
  /** De 1 a 10: cuántas veces más chispas que en el diseñador. */
  sprinkleDensity: number
  /** De 0 (la orilla) a 0.3: cuánto se meten las piezas del borde, en parte del radio de la tapa. */
  edgeInset: number
}

/** Ficha de producto (`ProductDetailSerializer`). `null` en `storageNotes` y `transportNotes` es PENDIENTE. */
export type ProductDetail = Omit<ProductCard, 'offerings'> & {
  /** Descripción de la ficha; vacía si no tiene. */
  description: string
  /** Sabor de relleno, para "Personalizar este pastel"; `null` si no lleva. */
  fillingFlavor: string | null
  storageNotes: string | null
  transportNotes: string | null
  offerings: DetailOffering[]
  /** "También te puede gustar": hasta tres productos de la misma categoría. */
  related: ProductCard[]
  /** `null` si el pastel no tiene muestra del modelo (o la API no la manda). */
  sampleDesign: SampleDesign | null
}

// Los kilos aproximados: `DecimalField(max_digits=4, decimal_places=1)`.
const WEIGHT = /^\d{1,3}(?:\.\d)?$/
// Las notas de la ficha son texto libre del admin; un tope técnico contra datos alterados.
const MAX_NOTES_LENGTH = 2000

function notes(value: unknown): string | null {
  return text(value, MAX_NOTES_LENGTH)
}

function parseDetailOffering(data: unknown): DetailOffering | null {
  const offering = parseOffering(data)
  if (!offering || !isRecord(data)) return null
  const { servings, stock } = data
  return {
    ...offering,
    approxWeightKg: typeof data.approx_weight_kg === 'string' && WEIGHT.test(data.approx_weight_kg) ? data.approx_weight_kg : null,
    servings: typeof servings === 'number' && Number.isSafeInteger(servings) && servings > 0 ? servings : null,
    photo: photo(data.photo),
    stock: typeof stock === 'number' && Number.isSafeInteger(stock) && stock >= 0 ? stock : null,
  }
}

// Las frutas y los acomodos que sabe dibujar la escena (`three/cakeShape.ts`); el `Record` obliga a tenerlos todos.
const FRUIT_KINDS: Record<FruitKind, true> = {
  strawberry: true,
  kiwi: true,
  peach: true,
  apple: true,
  grape: true,
  starfruit: true,
  pear: true,
  physalis: true,
  banana: true,
  pineapple: true,
  apple_slice: true,
}
const FRUIT_LAYOUTS: Record<FruitLayoutKind, true> = { mound: true, ring: true, rows: true, diagonal: true, stripes: true, fans: true }

const isFruitKind = (value: unknown): value is FruitKind => typeof value === 'string' && Object.hasOwn(FRUIT_KINDS, value)

// Lo que sabe dibujar la escena en los detalles de la imagen del catálogo (`three/cakeShape.ts`).
const SIDE_TEXTURES: Record<SideTextureKind, true> = { lace: true, spatula: true, ridges: true }
const DRIZZLES: Record<DrizzleKind, true> = { lace: true, threads: true, scribble: true }
const SHELL_PLACES: Record<ShellPlace, true> = { edge: true, tulips: true, top: true, back: true, full: true }
const SIDE_BITS: Record<SideBitsKind, true> = { crumbs: true, flakes: true, shavings: true, seeds: true }

function choice<T extends string>(value: unknown, known: Record<T, true>): T | null {
  return typeof value === 'string' && Object.hasOwn(known, value) ? (value as T) : null
}

/** Un número dentro de su rango, o `null`. */
function fraction(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
}

/** Los detalles de la imagen del catálogo de una muestra; lo que falta o no se entiende queda en "no lleva". */
function parseSampleDetails(data: Record<string, unknown>): SampleDetails {
  const pair = <T,>(first: T | null, second: string | null) => (first !== null && second !== null ? ([first, second] as const) : null)
  const ringColor = normalizeHex(data.top_ring_color)
  const ringWidth = fraction(data.top_ring_width, 0.1, 0.9)
  const bandColor = normalizeHex(data.side_band_color)
  const bandHeight = fraction(data.side_band_height, 0.03, 1)
  const drizzle = pair(choice(data.drizzle, DRIZZLES), normalizeHex(data.drizzle_color))
  const shellPlace = choice(data.shells, SHELL_PLACES)
  const shellColor = normalizeHex(data.shell_color)
  const shellSecond = normalizeHex(data.shell_second_color)
  const sideBits = pair(choice(data.side_bits, SIDE_BITS), normalizeHex(data.side_bits_color))
  return {
    topColor: normalizeHex(data.top_color),
    topGlossy: data.top_glossy === true,
    sideGlossy: data.side_glossy === true,
    sideTexture: choice(data.side_texture, SIDE_TEXTURES),
    ring: ringColor && ringWidth !== null ? { color: ringColor, width: ringWidth } : null,
    band: bandColor && bandHeight !== null ? { color: bandColor, height: bandHeight } : null,
    drizzle: drizzle ? { kind: drizzle[0], color: drizzle[1] } : null,
    edgeSize: fraction(data.edge_size, 0.5, 2.5) ?? 1,
    shells: shellPlace && shellColor ? { place: shellPlace, colors: shellSecond ? [shellColor, shellSecond] : [shellColor] } : null,
    dustingColor: normalizeHex(data.dusting_color),
    sideBits: sideBits ? { kind: sideBits[0], color: sideBits[1] } : null,
    fruitDensity: fraction(data.fruit_density, 1, 3) ?? 1,
    sprinkleDensity: fraction(data.sprinkle_density, 1, 10) ?? 1,
    edgeInset: fraction(data.edge_inset, 0, 0.3) ?? 0,
  }
}

/**
 * La muestra del modelo de la ficha. Sin el color de la cobertura no hay muestra (`null`); una fruta que esta versión no sabe
 * dibujar se descarta, y sin frutas no hay acomodo.
 */
function parseSampleDesign(data: unknown): SampleDesign | null {
  if (!isRecord(data)) return null
  const coverageColor = normalizeHex(data.coverage_color)
  if (!coverageColor) return null
  const fruits = Array.isArray(data.fruits) ? [...new Set(data.fruits.filter(isFruitKind))] : []
  const layout = typeof data.fruit_layout === 'string' && Object.hasOwn(FRUIT_LAYOUTS, data.fruit_layout) ? (data.fruit_layout as FruitLayoutKind) : null
  return {
    coverageColor,
    decoration: text(data.decoration, MAX_TEXT_LENGTH, SLUG),
    decorationColor: normalizeHex(data.decoration_color),
    fruitLayout: fruits.length > 0 ? layout : null,
    fruits: layout ? fruits : [],
    sideComb: data.side_comb === true,
    modelImage: photo(data.model_image),
    showModelInCatalog: data.show_model_in_catalog === true,
    details: parseSampleDetails(data),
  }
}

/**
 * Valida la ficha. Una ficha sin `slug`, nombre o categoría válidos es un `TypeError`; una presentación o un
 * relacionado dudoso se descarta, como en las tarjetas.
 */
export function parseProductDetail(data: unknown): ProductDetail {
  const card = parseCard(data)
  if (!card || !isRecord(data)) throw new TypeError('La ficha del producto no tiene la forma esperada.')
  const offerings = Array.isArray(data.offerings) ? data.offerings.map(parseDetailOffering).filter((o): o is DetailOffering => o !== null) : []
  const related = Array.isArray(data.related) ? data.related.map(parseCard).filter((c): c is ProductCard => c !== null && c.slug !== card.slug) : []
  return {
    ...card,
    description: typeof data.description === 'string' ? data.description.trim() : '',
    fillingFlavor: text(data.filling_flavor, MAX_TEXT_LENGTH, SLUG),
    storageNotes: notes(data.storage_notes),
    transportNotes: notes(data.transport_notes),
    offerings,
    related: related.slice(0, 3),
    sampleDesign: parseSampleDesign(data.sample_design),
  }
}

/** Si un texto de la URL puede ser el `slug` de un producto; si no, ni se pide. */
export function isProductSlug(value: string): boolean {
  return value.length <= MAX_TEXT_LENGTH && SLUG.test(value)
}

/**
 * Productos del catálogo con su categoría y su búsqueda (D45). El término se recorta y se corta a
 * `SEARCH_MAX_LENGTH`; vacío, no se manda.
 */
export async function getProducts(query: CatalogQuery, signal: AbortSignal): Promise<ProductCard[]> {
  const search = query.search.trim().slice(0, SEARCH_MAX_LENGTH)
  const params: Record<string, string> = {}
  if (query.category) params.category = query.category
  if (search) params.search = search
  return parseProductCards(await getJson(['products'], { signal: withTimeout(signal), query: params }))
}

/**
 * Ficha de un producto activo. `null` si no existe (404, o un `slug` que no puede serlo, que ni se pide): la
 * pantalla dice "No encontramos este pastel" en vez de un error con reintento.
 */
export async function getProduct(slug: string, signal: AbortSignal): Promise<ProductDetail | null> {
  if (!isProductSlug(slug)) return null
  try {
    return parseProductDetail(await getJson(['products', slug], { signal: withTimeout(signal) }))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Nombre de cada tipo de pastel en la interfaz, tomado de las `choices` de `CakeType` (como `PRESENTATION_LABELS`). */
export const CAKE_TYPE_LABELS: Readonly<Record<string, string>> = {
  tres_leches: 'Tres leches',
  seco: 'Seco',
  envinado: 'Envinado',
}
