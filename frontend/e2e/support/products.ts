import type { Page } from '@playwright/test'

/**
 * El catálogo (`GET /api/v1/products/`) y la ficha (`GET /api/v1/products/<slug>/`) sin backend, con la forma de
 * `ProductCardSerializer` y `ProductDetailSerializer` (D45) y los datos de la semilla `0009_seed_catalog`. El filtro y
 * la búsqueda se simulan como el backend: la categoría exacta y el término en el nombre o la descripción corta, sin
 * distinguir mayúsculas ni acentos.
 */

export const PRODUCTS_PATH = '/api/v1/products/'

/** Una presentación; `price` en `null` es PENDIENTE, con `price_pending` (tanda 2: "[Precio por confirmar]"). */
const offering = (id: number, presentation: string, price: string | null) => ({ id, presentation, price, price_pending: price === null })

/**
 * Si "Personalizar este pastel" lo abre como pastel de vitrina (tanda 2). La semilla ya captura el pan de los pasteles de vitrina
 * y los deja disponibles; aquí los de sabor siguen con el pan PENDIENTE a propósito, para cubrir el caso de D59 (todo editable).
 * `chocoPinguino` y `duraznoShowcase` son los disponibles.
 */
type ShowcaseDesign = { available: boolean; unavailable_reason: string | null }
const PENDING_BREAD: ShowcaseDesign = { available: false, unavailable_reason: 'El pan de este pastel está por confirmar.' }
const ORDER_ONLY: ShowcaseDesign = { available: false, unavailable_reason: 'Solo por encargo: no sale en la vitrina.' }
const NOT_DESIGNED: ShowcaseDesign = { available: false, unavailable_reason: 'Este producto no se personaliza.' }
export const SHOWCASE_AVAILABLE: ShowcaseDesign = { available: true, unavailable_reason: null }

type CardFields = {
  slug: string
  name: string
  category: 'cake' | 'dessert'
  summary: string
  offerings: ReturnType<typeof offering>[]
  sales_channel?: string
  cake_type?: string | null
  bread?: string | null
  filling_base?: string | null
  in_showcase_today?: boolean
  sliced_today?: boolean
  showcase_design?: ShowcaseDesign
}

const card = ({ sales_channel = 'showcase_and_order', cake_type = null, bread = null, filling_base = null, in_showcase_today = false, sliced_today = false, showcase_design, ...rest }: CardFields) => ({
  ...rest,
  sales_channel,
  cake_type,
  bread,
  filling_base,
  photo: null,
  in_showcase_today,
  sliced_today,
  showcase_design: showcase_design ?? (rest.category === 'dessert' ? NOT_DESIGNED : sales_channel === 'order_only' ? ORDER_ONLY : PENDING_BREAD),
})

const normal = (first: number) => [offering(first, 'whole', '350.00'), offering(first + 1, 'slice', '35.00'), offering(first + 2, 'mini', '130.00')]

export const productCards = [
  card({ slug: 'tres-leches-de-durazno', name: 'Tres leches de durazno', category: 'cake', summary: 'Relleno de durazno y cobertura de crema pastelera.', cake_type: 'tres_leches', filling_base: 'normal', in_showcase_today: true, offerings: normal(1) }),
  card({ slug: 'tres-leches-de-fresa', name: 'Tres leches de fresa', category: 'cake', summary: 'Relleno de fresa y cobertura de crema pastelera.', cake_type: 'tres_leches', filling_base: 'normal', offerings: normal(4) }),
  card({
    slug: 'tres-leches-con-queso-y-zarzamora',
    name: 'Tres leches con queso y zarzamora',
    category: 'cake',
    summary: 'Relleno de queso con zarzamora y cobertura de crema pastelera.',
    cake_type: 'tres_leches',
    filling_base: 'queso',
    offerings: [offering(10, 'whole', '420.00'), offering(11, 'slice', '40.00')],
  }),
  card({ slug: 'choco-pinguino', name: 'Choco-pingüino', category: 'cake', summary: 'Pan de chocolate con su crema de chocolate sabor helado.', cake_type: 'seco', bread: 'choco_pinguino', in_showcase_today: true, showcase_design: SHOWCASE_AVAILABLE, offerings: [offering(20, 'whole', '350.00'), offering(21, 'slice', '35.00')] }),
  card({ slug: 'imposible', name: 'Imposible', category: 'dessert', summary: 'Flan con pan de chocolate.', offerings: [offering(40, 'whole', '350.00'), offering(41, 'slice', '35.00')] }),
  card({ slug: 'flan-napolitano', name: 'Flan napolitano', category: 'dessert', summary: 'Grande o individual.', offerings: [offering(50, 'large', '360.00'), offering(51, 'individual', '35.00')] }),
  card({ slug: 'mosaico-con-crema', name: 'Mosaico con crema', category: 'dessert', summary: 'Gelatina en vaso, cuadritos de sabores con crema.', sales_channel: 'showcase_only', offerings: [offering(60, 'cup', '20.00')] }),
]

/** Red velvet: solo por encargo. Desde la `0062` la API ya no lo entrega: no está en la lista por omisión. */
export const redVelvetCard = card({ slug: 'red-velvet', name: 'Red velvet', category: 'cake', summary: 'Con su relleno típico de red velvet.', sales_channel: 'order_only', cake_type: 'seco', bread: 'red_velvet', offerings: [offering(30, 'whole', '450.00')] })

type Card = (typeof productCards)[number]

/** Tres leches de nuez: solo por encargo y con su precio PENDIENTE (tanda 2). No está en la lista por omisión. */
export const nuezCard = card({
  slug: 'tres-leches-de-nuez',
  name: 'Tres leches de nuez',
  category: 'cake',
  summary: 'Relleno de nuez y cobertura de crema pastelera.',
  sales_channel: 'order_only',
  cake_type: 'tres_leches',
  filling_base: 'normal',
  offerings: [offering(70, 'whole', null)],
})

/** Tarta de frutas, grande o mini (`0009_seed_catalog`). No está en la lista por omisión: la usan las pruebas de los postres (D95). */
export const tartaCard = card({
  slug: 'tarta-de-frutas',
  name: 'Tarta de frutas',
  category: 'dessert',
  summary: 'Grande o mini.',
  offerings: [offering(80, 'large', '290.00'), offering(81, 'mini', '35.00')],
})

/**
 * Los otros vasos de gelatina de la semilla (`0009_seed_catalog` y `0059_seed_cup_gelatins`), solo en vitrina. No están en la lista
 * por omisión: los usan las pruebas de los postres (D95).
 */
export const cupCards = [
  card({ slug: 'gelatina-mosaico', name: 'Mosaico normal', category: 'dessert', summary: 'Gelatina en vaso, cuadritos de sabores.', sales_channel: 'showcase_only', offerings: [offering(92, 'cup', '20.00')] }),
  card({ slug: 'mosaico-con-yogurt-de-durazno', name: 'Mosaico con yogurt de durazno', category: 'dessert', summary: 'Gelatina en vaso, cuadritos de sabores con yogurt de durazno.', sales_channel: 'showcase_only', offerings: [offering(93, 'cup', '20.00')] }),
  card({ slug: 'mosaico-con-yogurt-de-fresa', name: 'Mosaico con yogurt de fresa', category: 'dessert', summary: 'Gelatina en vaso, cuadritos de sabores con yogurt de fresa.', sales_channel: 'showcase_only', offerings: [offering(90, 'cup', '20.00')] }),
  card({ slug: 'gelatina-de-duvalin', name: 'Gelatina de Duvalín', category: 'dessert', summary: 'Gelatina en vaso en tres secciones, como el dulce.', sales_channel: 'showcase_only', offerings: [offering(91, 'cup', '25.00')] }),
]

/** El Posible y la gelatina de molde de la semilla (`0009_seed_catalog`), con modelo desde D98. No están en la lista por omisión. */
export const posibleCard = card({ slug: 'posible', name: 'Posible', category: 'dessert', summary: 'Flan con pan de vainilla.', offerings: [offering(94, 'whole', '350.00'), offering(95, 'slice', '35.00')] })
export const moldGelatinCard = card({ slug: 'gelatina-de-molde', name: 'Gelatina de molde', category: 'dessert', summary: 'El diseño cambia según cómo la hagamos.', offerings: [offering(96, 'whole', '290.00')] })

/** Lo que agrega la ficha a una tarjeta: peso, personas y existencias por presentación, notas y relacionados. */
type DetailExtras = {
  stock?: Record<number, number | null>
  sizes?: Record<number, { approx_weight_kg: string | null; servings: number | null }>
  filling_flavor?: string | null
  storage_notes?: string | null
  transport_notes?: string | null
  related?: string[]
  /** "Rebanado hoy" (D60). */
  sliced_today?: boolean
  in_showcase_today?: boolean
  /** El pan del producto (el de la semilla es PENDIENTE en los pasteles de sabor). */
  bread?: string | null
  showcase_design?: ShowcaseDesign
}

export function productDetail(slug: string, extras: DetailExtras = {}) {
  const base = [...productCards, nuezCard, redVelvetCard, tartaCard, ...cupCards, posibleCard, moldGelatinCard].find((entry) => entry.slug === slug)
  if (!base) throw new Error(`No hay tarjeta para ${slug}`)
  const { stock = {}, sizes = {}, filling_flavor = null, storage_notes = null, transport_notes = null, related = [] } = extras
  return {
    ...base,
    sliced_today: extras.sliced_today ?? base.sliced_today,
    bread: extras.bread === undefined ? base.bread : extras.bread,
    showcase_design: extras.showcase_design ?? base.showcase_design,
    in_showcase_today: extras.in_showcase_today ?? base.in_showcase_today,
    description: '',
    filling_flavor,
    storage_notes,
    transport_notes,
    offerings: base.offerings.map((entry) => ({
      ...entry,
      approx_weight_kg: sizes[entry.id]?.approx_weight_kg ?? null,
      servings: sizes[entry.id]?.servings ?? null,
      photo: null,
      stock: entry.id in stock ? stock[entry.id] : null,
    })),
    related: related.map((other) => productCards.find((entry) => entry.slug === other)),
  }
}

/** La ficha de Tres leches de durazno como el mockup: completo con 2 en vitrina hoy, mini y rebanada sin cargar. */
export const durazno = productDetail('tres-leches-de-durazno', {
  stock: { 1: 2 },
  sizes: { 1: { approx_weight_kg: '2.7', servings: 19 }, 3: { approx_weight_kg: null, servings: 3 } },
  filling_flavor: 'durazno',
  related: ['tres-leches-con-queso-y-zarzamora', 'imposible', 'choco-pinguino'],
})

export const redVelvet = productDetail('red-velvet', { storage_notes: 'En refrigeración, hasta 3 días.', transport_notes: 'En su caja, sobre una superficie plana.' })

export const mosaico = productDetail('mosaico-con-crema', { stock: { 60: 0 } })

/** Choco-pingüino, que sí se personaliza como pastel de vitrina (tanda 2): su completo rinde 19 personas. */
export const chocoPinguino = productDetail('choco-pinguino', { sizes: { 20: { approx_weight_kg: '2.7', servings: 19 } }, related: [] })

/** Durazno con su pan ya capturado (chocolate): se personaliza como pastel de vitrina con su relleno bloqueado. */
export const duraznoShowcase = productDetail('tres-leches-de-durazno', {
  sizes: { 1: { approx_weight_kg: '2.7', servings: 19 } },
  filling_flavor: 'durazno',
  bread: 'chocolate',
  showcase_design: SHOWCASE_AVAILABLE,
})

/** La ficha de Tres leches de nuez: su único completo, sin precio todavía. */
export const nuez = productDetail('tres-leches-de-nuez', { filling_flavor: 'nuez' })

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** Lo que respondería el backend a la consulta de la URL. */
export function filterCards(url: URL, cards: Card[] = productCards) {
  const category = url.searchParams.get('category')
  const search = fold(url.searchParams.get('search') ?? '')
  return cards.filter((entry) => (!category || entry.category === category) && (!search || fold(`${entry.name} ${entry.summary}`).includes(search)))
}

type ListOptions = {
  /** Milisegundos de espera por término de búsqueda (para que una respuesta vieja llegue tarde). */
  delays?: Record<string, number>
  /** Respuestas en orden en lugar de filtrar: `'hang'` deja la petición sin respuesta. */
  responses?: ({ status: number; body: unknown } | 'hang')[]
  /** Las tarjetas que filtra, si no son las de la semilla. */
  cards?: Card[]
}

/** Simula `GET /api/v1/products/` y devuelve las URL pedidas, en orden. */
export async function mockProducts(page: Page, { delays = {}, responses, cards = productCards }: ListOptions = {}) {
  const requests: URL[] = []
  await page.route(
    (url) => url.pathname === PRODUCTS_PATH,
    async (route) => {
      const url = new URL(route.request().url())
      requests.push(url)
      const scripted = responses?.[Math.min(requests.length, responses.length) - 1]
      if (scripted === 'hang') return
      const wait = delays[url.searchParams.get('search') ?? ''] ?? 0
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
      const response = scripted ?? { status: 200, body: filterCards(url, cards) }
      // Una petición que la pantalla ya canceló no se puede responder: se ignora.
      await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) }).catch(() => undefined)
    },
  )
  return requests
}

/** Simula `GET /api/v1/products/<slug>/`: las fichas dadas, 404 para las demás. Devuelve los `slug` pedidos. */
export async function mockProductDetails(page: Page, details: object[], { status }: { status?: number } = {}) {
  const requests: string[] = []
  await page.route(
    (url) => url.pathname.startsWith(PRODUCTS_PATH) && url.pathname !== PRODUCTS_PATH,
    async (route) => {
      const slug = decodeURIComponent(new URL(route.request().url()).pathname.slice(PRODUCTS_PATH.length).replace(/\/$/, ''))
      requests.push(slug)
      if (status) return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ detail: 'error' }) })
      const found = details.find((entry) => (entry as { slug: string }).slug === slug)
      await route.fulfill(found ? { status: 200, contentType: 'application/json', body: JSON.stringify(found) } : { status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'No encontrado.' }) })
    },
  )
  return requests
}
