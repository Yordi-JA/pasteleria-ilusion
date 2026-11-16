import type { Page, Request, Route } from '@playwright/test'

/**
 * El envío de referencia y su cotización sin Django (D70): `POST customer-images/` con `purpose=reference`,
 * `GET customer-images/<id>/` (la foto en PNG), y `reference-requests/` con su detalle, `accept/` y `cancel/`.
 */

export const REQUEST_ID = 7
export const QUOTE_PATH = `/cuenta/cotizaciones/${REQUEST_ID}`

/** Un PNG de 1 x 1 px que el navegador abre. */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

export const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG })

/** Más de 5 MB: el navegador la rechaza antes de subirla. */
export const heavyPhoto = (name: string) => ({ name, mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1) })

export const imageId = (n: number) => `aaaaaaaa-0000-4000-8000-00000000000${n}`

export const readyQuote = {
  price: '1800.00',
  note: 'Las flores van en betún de mantequilla, en tonos durazno.',
  quoted_at: '2026-11-13T18:40:00Z',
  expires_at: null,
  expired: false,
  validity_pending: true,
  advance_percent: 50,
  advance: '900.00',
  stand_deposit: '90.00',
  pay_today: '990.00',
  pay_on_delivery: '900.00',
}

/** El sabor y la base de la solicitud (segunda ronda de D70): 40 personas son 6 kg y su base de $90. */
export const referenceFlavor = {
  people: 40,
  kg: 6,
  cake_type: 'tres_leches',
  cake_type_label: 'Tres leches',
  bread: 'chocolate',
  bread_name: 'Chocolate',
  filling_base: 'normal',
  filling_base_name: 'Normal',
  filling_flavors: ['fresa', 'nuez'],
  filling_flavor_names: ['Fresa', 'Nuez'],
  stand: { min_kg: 6, max_kg: 8, deposit: '90.00' },
}

/** Una solicitud de antes de la `0040`: sin tipo, sin pan, sin kilos ni base. */
export const legacyFlavor = {
  kg: null,
  cake_type: '',
  cake_type_label: '',
  bread: null,
  bread_name: null,
  filling_base: null,
  filling_base_name: null,
  filling_flavors: [],
  filling_flavor_names: [],
  stand: null,
}

export function referenceRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    status: 'in_review',
    status_label: 'En revisión',
    status_changed_at: '2026-11-13T18:05:00Z',
    created_at: '2026-11-13T18:05:00Z',
    description: 'La decoración de flores, pero en tonos durazno y de 2 pisos',
    occasion: 'quinceanera',
    occasion_label: 'XV años',
    ...referenceFlavor,
    event_date: '2026-11-21',
    budget: '1500.00',
    images: [
      { id: imageId(1), original_name: 'referencia-boda.png', width: 1, height: 1 },
      { id: imageId(2), original_name: 'colores-flores.png', width: 1, height: 1 },
    ],
    quote: null,
    order_id: null,
    ...overrides,
  }
}

export const quoteReadyRequest = (overrides: Record<string, unknown> = {}) =>
  referenceRequest({ status: 'quote_ready', status_label: 'Cotización lista', status_changed_at: '2026-11-13T18:40:00Z', quote: readyQuote, ...overrides })

export type Reply = { status: number; body?: unknown } | 'abort'

async function fulfill(route: Route, reply: Reply) {
  if (reply === 'abort') {
    await route.abort('internetdisconnected')
    return
  }
  await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body ?? {}) })
}

/** Responde `POST customer-images/` con un id por foto (o con cada respuesta de `replies`) y la foto en `GET`. */
export async function mockReferenceImages(page: Page, replies?: Reply[]) {
  const uploads: Request[] = []
  const views: Request[] = []
  await page.route('**/api/v1/customer-images/', async (route) => {
    uploads.push(route.request())
    const reply = replies?.[Math.min(uploads.length, replies.length) - 1]
    await fulfill(
      route,
      reply ?? { status: 201, body: { id: imageId(uploads.length), purpose: 'reference', content_type: 'image/png', width: 1, height: 1, size_bytes: 68, original_name: 'foto.png' } },
    )
  })
  await page.route('**/api/v1/customer-images/*/', async (route) => {
    views.push(route.request())
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  })
  return { uploads, views }
}

export type ReferenceMock = {
  creates: Request[]
  details: Request[]
  accepts: Request[]
  cancels: Request[]
  /** Cambia lo que responde el detalle desde ahora. */
  setDetail: (reply: Reply) => void
}

type ReferenceReplies = { create?: Reply[]; detail?: Reply; accept?: Reply[]; cancel?: Reply[] }

/** Los endpoints de `reference-requests/`: cada lista responde en orden y repite la última. */
export async function mockReferences(page: Page, replies: ReferenceReplies = {}): Promise<ReferenceMock> {
  const mock: ReferenceMock = { creates: [], details: [], accepts: [], cancels: [], setDetail: (reply) => (detail = reply) }
  let detail: Reply = replies.detail ?? { status: 200, body: referenceRequest() }
  const create = replies.create ?? [{ status: 201, body: referenceRequest() }]
  const accept = replies.accept ?? [{ status: 201, body: acceptedOrder() }]
  const cancel = replies.cancel ?? [{ status: 200, body: referenceRequest({ status: 'cancelled', status_label: 'Cancelada' }) }]
  await page.route(/\/api\/v1\/reference-requests\//, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/accept/')) {
      mock.accepts.push(request)
      await fulfill(route, accept[Math.min(mock.accepts.length, accept.length) - 1])
    } else if (path.endsWith('/cancel/')) {
      mock.cancels.push(request)
      await fulfill(route, cancel[Math.min(mock.cancels.length, cancel.length) - 1])
    } else if (request.method() === 'POST') {
      mock.creates.push(request)
      await fulfill(route, create[Math.min(mock.creates.length, create.length) - 1])
    } else {
      mock.details.push(request)
      await fulfill(route, detail)
    }
  })
  return mock
}

/** El pedido que nace al aceptar: apartado, con la línea del precio cotizado. */
export function acceptedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 57,
    status: 'awaiting_payment',
    fulfillment: 'pickup',
    pickup_name: 'Ana López García',
    pickup_phone: '5512345678',
    delivery_date: '2026-11-21',
    slot_starts_at: '16:00',
    slot_ends_at: '16:30',
    subtotal: '1800.00',
    stand_deposit: '90.00',
    delivery_fee: '0.00',
    payment: {
      advance_percent: 50,
      advance: '900.00',
      paid_in_full: '0.00',
      base_deposit: '90.00',
      delivery_fee: '0.00',
      pay_today: '990.00',
      pay_on_delivery: '900.00',
    },
    payment_due_at: '2026-11-13T18:30:00Z',
    created_at: '2026-11-13T18:00:00Z',
    items: [
      {
        kind: 'reference',
        offering_id: null,
        product_name: 'Pastel según tu referencia',
        presentation: null,
        quantity: 1,
        unit_price: '1800.00',
        line_total: '1800.00',
        design: null,
        reference: referenceFlavor,
      },
    ],
    ...overrides,
  }
}

/** Una página de `GET reference-requests/` (paginada, como `orders/`). */
export function referencePage(results: object[], { next = null }: { next?: number | null } = {}) {
  return { count: results.length, next: next === null ? null : `http://127.0.0.1/api/v1/reference-requests/?page=${next}`, previous: null, results }
}

/** Responde `GET reference-requests/` (la lista de "Mis pedidos") y devuelve las peticiones. */
export async function mockReferenceList(page: Page, reply: Reply = { status: 200, body: referencePage([]) }) {
  const requests: Request[] = []
  await page.route(/\/api\/v1\/reference-requests\/(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    requests.push(route.request())
    await fulfill(route, reply)
  })
  return requests
}
