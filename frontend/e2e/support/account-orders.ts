import type { Page, Request, Route } from '@playwright/test'
import { placedOrder } from './checkout.ts'
import { orderItems } from './payments.ts'

/**
 * Los pedidos de la cuenta sin Django (D69): `GET orders/` paginado, `GET orders/<id>/` con los campos de D69 y
 * `GET orders/<id>/note.pdf`. Nada sale a la red.
 */

/** El pastel diseñado de las pruebas, con los nombres que suma D69. */
const designNames = { bread_name: 'Chocolate', filling_base_name: 'Con queso', filling_flavor_names: ['Zarzamora'], decoration_name: 'Sin decoración' }

export const paidItems = orderItems.map((item) => (item.design ? { ...item, design: { ...item.design, ...designNames } } : item))

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'Apartado, falta tu pago',
  received: 'Recibido',
  in_preparation: 'En preparación',
  ready_for_delivery: 'Listo para entregar',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  awaiting_quote: 'En pausa por cotización',
}

/** La base del pastel de 15 kg: antes de la entrega, sin estado y con la fecha prevista. */
export function stand(overrides: Record<string, unknown> = {}) {
  return { kg: 15, deposit: '200.00', return_days: 15, return_by: '2026-12-01', status: null, status_label: null, returned_at: null, ...overrides }
}

/** Un pedido de `OrderSerializer` con D69. Por omisión, pagado con tarjeta y en preparación. */
export function accountOrder(overrides: Record<string, unknown> = {}) {
  const status = typeof overrides.status === 'string' ? overrides.status : 'in_preparation'
  const paid = !['awaiting_payment', 'awaiting_quote', 'cancelled'].includes(status)
  return placedOrder({
    status,
    status_label: STATUS_LABELS[status],
    status_changed_at: '2026-11-14T16:00:00Z',
    note_available: paid,
    paid_with: paid ? { method: 'stripe', method_label: 'Tarjeta (Stripe)', paid_at: '2026-11-13T18:09:00Z' } : null,
    stands: [stand()],
    items: paidItems,
    ...overrides,
  })
}

type Reply = { status: number; body?: unknown } | 'abort' | 'hang'

async function fulfill(route: Route, reply: Reply) {
  if (reply === 'hang') return
  if (reply === 'abort') {
    await route.abort('internetdisconnected')
    return
  }
  await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body ?? {}) })
}

/** Una página de `GET orders/`: `next` apunta a la siguiente si `hasNext`. */
export function orderPage(results: object[], { count = results.length, next = null }: { count?: number; next?: number | null } = {}) {
  return { count, next: next === null ? null : `http://127.0.0.1/api/v1/orders/?page=${next}`, previous: null, results }
}

/**
 * Responde `GET orders/` según el número de página (`?page=`; sin él, la 1). Una página que no está en `pages`
 * responde 404, como DRF.
 */
export async function mockOrderList(page: Page, pages: Record<number, Reply>) {
  const requests: Request[] = []
  await page.route(/\/api\/v1\/orders\/(\?.*)?$/, async (route) => {
    const request = route.request()
    if (request.method() !== 'GET') return route.fallback()
    requests.push(request)
    const number = Number(new URL(request.url()).searchParams.get('page') ?? '1')
    await fulfill(route, pages[number] ?? { status: 404, body: { detail: 'Página inválida.' } })
  })
  return requests
}

/** Responde `GET orders/<id>/` con `reply` (por omisión, el pedido pagado en preparación). */
export async function mockOrderDetail(page: Page, id: number, reply: Reply = { status: 200, body: accountOrder({ id }) }) {
  const requests: Request[] = []
  await page.route(`**/api/v1/orders/${id}/`, async (route) => {
    requests.push(route.request())
    await fulfill(route, reply)
  })
  return requests
}

export const PDF_BYTES = '%PDF-1.4\n% nota de prueba\n'

/** Responde `GET orders/<id>/note.pdf`: el PDF por omisión, o el error que pida la prueba. */
export async function mockNote(page: Page, id: number, reply: { status: number } | 'abort' = { status: 200 }) {
  const requests: Request[] = []
  await page.route(`**/api/v1/orders/${id}/note.pdf`, async (route) => {
    requests.push(route.request())
    if (reply === 'abort') return route.abort('internetdisconnected')
    if (reply.status === 200) {
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': `attachment; filename="nota-pedido-${id}.pdf"` },
        body: PDF_BYTES,
      })
    }
    return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify({ detail: 'No encontrado.' }) })
  })
  return requests
}
