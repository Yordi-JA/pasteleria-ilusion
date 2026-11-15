import type { Page, Request, Route } from '@playwright/test'

/**
 * El carrito, el calendario de la entrega y la creación del pedido sin Django (D66): líneas de ejemplo de cada tipo,
 * `GET delivery-slots/` armado con el rango que se pide, `POST orders/` y `POST customer-images/`.
 */

export const CART_KEY = 'ilusion.cart.v1'
export const DRAFT_KEY = 'ilusion.cakeDesign.v1'

/** La hora de la pastelería en las pruebas: viernes 13 de noviembre de 2026 a las 12:00 en la Ciudad de México. */
export const NOW = new Date('2026-11-13T18:00:00Z')

export const durazno = {
  kind: 'offering',
  offeringId: 101,
  name: 'Tres leches de durazno',
  presentation: 'whole',
  unitPrice: '350.00',
  slug: 'tres-leches-de-durazno',
  fulfillment: 'order',
  quantity: 1,
}

export const cajetaSlice = {
  kind: 'offering',
  offeringId: 102,
  name: 'Rebanada de tres leches de cajeta',
  presentation: 'slice',
  unitPrice: '35.00',
  slug: 'tres-leches-de-cajeta',
  fulfillment: 'showcase',
  quantity: 2,
}

/** Lo que guarda "Diseña tu pastel" al agregar (`designSnapshot`): 15 kg, con base de $200. */
export const designSnapshot = {
  people: 100,
  kg: 15,
  form: 'round',
  tiers: 2,
  cakeType: 'tres_leches',
  bread: 'chocolate',
  fillingBase: 'queso',
  flavors: ['zarzamora'],
  coverageColor: '#f6b8ca',
  decoration: 'flores',
  decorationColor: '#d44c48',
  decorationImageName: null,
  message: {
    text: 'Feliz cumpleaños Ana',
    color: { mode: 'tones', value: 'deep' },
    arrangement: 'arc',
    curve: 0.5,
    scale: 0.22,
    rotation: 0,
    x: 0,
    y: 0.1,
  },
  wafer: null,
  waferImageName: null,
  occasion: 'birthday',
}

export const designLine = {
  kind: 'design',
  designId: 'pastel15kg',
  name: 'Pastel tres leches de pan de chocolate, relleno con queso y zarzamora',
  details: ['Tamaño y forma: 100 personas (15 kg), redondo de 2 pisos', 'Pan: Chocolate'],
  total: '3825.00',
  baseDeposit: '200.00',
  requiresQuote: false,
  quantity: 1,
  design: designSnapshot,
  images: {},
}

/** Un pastel con "Otra decoración": sin precio de la decoración y con su imagen en el navegador. */
export function quoteDesignLine(imageKey: string | null, designId = 'pastelotra') {
  return {
    ...designLine,
    designId,
    name: 'Pastel tres leches de pan de vainilla, relleno normal de durazno',
    details: ['Decoración: Otra decoración'],
    total: '1020.00',
    baseDeposit: '70.00',
    requiresQuote: true,
    design: { ...designSnapshot, kg: 4, people: 30, tiers: 1, decoration: 'otra', decorationColor: null, decorationImageName: 'idea.png', message: null },
    images: imageKey ? { decoration: imageKey } : {},
  }
}

/** Guarda un carrito antes de que cargue la página. */
export async function seedCart(page: Page, items: object[]) {
  await page.addInitScript(({ key, raw }) => {
    if (!sessionStorage.getItem('__cartSeeded')) {
      localStorage.setItem(key, raw)
      sessionStorage.setItem('__cartSeeded', '1')
    }
  }, { key: CART_KEY, raw: JSON.stringify({ items }) })
}

export function storedCart(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), CART_KEY)
}

/** Guarda una imagen en `IndexedDB` como lo hace "Agregar al pedido" y devuelve su clave (la página ya cargó). */
export async function saveImage(page: Page, name = 'idea.png'): Promise<string> {
  // No hay corredor de pruebas unitarias: el módulo se importa en el navegador desde el servidor de desarrollo.
  return page.evaluate(async ({ fileName, url }) => {
    const module = await import(url)
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
    const key = await module.saveDesignImage({ blob: new Blob([bytes], { type: 'image/png' }), name: fileName })
    if (!key) throw new Error('No se guardó la imagen.')
    return key as string
  }, { fileName: name, url: '/src/models/designImages.ts' })
}

// --- Calendario ---

export const LATEST = '2027-01-12'

type DayRule = { available: boolean; reason: 'too_soon' | 'full' | 'too_far' | null; fullSlots?: string[] }

const GRID = Array.from({ length: 24 }, (_, index) => {
  const minutes = 10 * 60 + 30 + index * 30
  const hhmm = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
  return { starts_at: hhmm(minutes), ends_at: hhmm(minutes + 30) }
})

/**
 * Por omisión: antes del domingo 15 de noviembre no alcanza la anticipación (un diseño), el 20 está lleno, después del
 * 12 de enero ya no se reserva y los demás días tienen las 15:00 llenas.
 */
export function defaultDay(date: string): DayRule {
  if (date < '2026-11-15') return { available: false, reason: 'too_soon' }
  if (date > LATEST) return { available: false, reason: 'too_far' }
  if (date === '2026-11-20') return { available: false, reason: 'full', fullSlots: GRID.map((slot) => slot.starts_at) }
  return { available: true, reason: null, fullSlots: ['15:00'] }
}

function daysBetween(start: string, end: string): string[] {
  const days: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export function calendarBody(start: string, end: string, rule: (date: string) => DayRule = defaultDay) {
  const days = daysBetween(start, end).map((date) => {
    const { available, reason, fullSlots = [] } = rule(date)
    const withSlots = reason === null || reason === 'full'
    return {
      date,
      available,
      reason,
      slots: withSlots
        ? GRID.map((slot) => {
            const full = fullSlots.includes(slot.starts_at)
            return { ...slot, available: !full, reason: full ? 'full' : null }
          })
        : [],
    }
  })
  return { start, end, earliest_date: '2026-11-15', latest_date: LATEST, days }
}

export type CalendarMock = { requests: Request[]; setRule: (rule: (date: string) => DayRule) => void }

/** Responde el calendario con el rango que se pidió; `setRule` cambia los días para las peticiones siguientes. */
export async function mockCalendar(page: Page, initial: (date: string) => DayRule = defaultDay): Promise<CalendarMock> {
  const requests: Request[] = []
  let rule = initial
  await page.route('**/api/v1/delivery-slots/**', async (route) => {
    requests.push(route.request())
    const url = new URL(route.request().url())
    const body = calendarBody(url.searchParams.get('start') ?? '', url.searchParams.get('end') ?? '', rule)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return { requests, setRule: (next) => (rule = next) }
}

// --- Pedido ---

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | 'abort'

export function placedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 57,
    status: 'awaiting_payment',
    fulfillment: 'pickup',
    pickup_name: 'Ana López García',
    pickup_phone: '5512345678',
    delivery_date: '2026-11-16',
    slot_starts_at: '15:30',
    slot_ends_at: '16:00',
    subtotal: '4175.00',
    stand_deposit: '200.00',
    delivery_fee: '0.00',
    payment: {
      advance_percent: 50,
      advance: '2087.50',
      paid_in_full: '0.00',
      base_deposit: '200.00',
      delivery_fee: '0.00',
      pay_today: '2287.50',
      pay_on_delivery: '2087.50',
    },
    payment_due_at: '2026-11-13T18:30:00Z',
    created_at: '2026-11-13T18:00:00Z',
    items: [],
    ...overrides,
  }
}

async function fulfill(route: Route, reply: Reply) {
  if (reply === 'abort') {
    await route.abort('internetdisconnected')
    return
  }
  await route.fulfill({ status: reply.status, contentType: 'application/json', headers: reply.headers, body: JSON.stringify(reply.body ?? {}) })
}

/** Responde `POST orders/` con la respuesta de cada intento (la última se repite); por omisión, el pedido creado. */
export async function mockOrders(page: Page, replies: Reply[] = [{ status: 201, body: placedOrder() }]) {
  const requests: Request[] = []
  await page.route('**/api/v1/orders/', async (route) => {
    requests.push(route.request())
    await fulfill(route, replies[Math.min(requests.length, replies.length) - 1])
  })
  return requests
}

/** Responde `POST customer-images/` con un id nuevo por imagen, o con `reply`. */
export async function mockImageUploads(page: Page, reply?: Reply) {
  const requests: Request[] = []
  await page.route('**/api/v1/customer-images/', async (route) => {
    requests.push(route.request())
    await fulfill(
      route,
      reply ?? { status: 201, body: { id: `0b5a6f0e-0000-4000-8000-00000000000${requests.length}`, purpose: 'decoration', content_type: 'image/png', width: 1, height: 1, size_bytes: 68, original_name: 'idea.png' } },
    )
  })
  return requests
}

/** Escribe el carrito en una página ya cargada (por ejemplo, después de guardar una imagen en `IndexedDB`). */
export async function writeCart(page: Page, items: object[]) {
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: CART_KEY, raw: JSON.stringify({ items }) })
}
