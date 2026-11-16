import type { Page, Request } from '@playwright/test'

/** La API de cancelar un pedido (D70) sin Django: `GET` y `POST orders/<id>/cancel/`. Nada sale a la red. */

type Reply = { status: number; body?: unknown }

/** La vista previa de `GET orders/<id>/cancel/`. Por omisión, un pedido sin pagar que se puede cancelar. */
export function cancellationPreview(overrides: Record<string, unknown> = {}) {
  return {
    order_id: 57,
    status: 'awaiting_payment',
    cancellable: true,
    reason: null,
    message: null,
    paid: '0.00',
    paid_with: null,
    order_total: '1600.00',
    retention_percent: 50,
    retained: '0.00',
    refund: '0.00',
    ...overrides,
  }
}

/** La vista previa de un pedido pagado: $870 pagados, $800 retenidos (50% de $1,600) y $70 por devolver. */
export function paidCancellationPreview(overrides: Record<string, unknown> = {}) {
  return cancellationPreview({ status: 'received', paid: '870.00', paid_with: 'cash', retained: '800.00', refund: '70.00', ...overrides })
}

/** La vista previa de un pedido entregado: ya no se puede cancelar (D70, segunda ronda). */
export function deliveredPreview(overrides: Record<string, unknown> = {}) {
  return paidCancellationPreview({
    status: 'delivered',
    cancellable: false,
    reason: 'not_cancellable',
    message: 'Este pedido ya se entregó: ya no se puede cancelar.',
    retained: '0.00',
    refund: '0.00',
    ...overrides,
  })
}

/** La vista previa de un pedido que ya se canceló. */
export function alreadyCancelled(overrides: Record<string, unknown> = {}) {
  return cancellationPreview({ status: 'cancelled', cancellable: false, reason: 'already_cancelled', message: 'Este pedido ya está cancelado.', ...overrides })
}

/** Responde `GET` con `preview` y `POST` con `post` (por omisión, 500). Devuelve las peticiones de cada método. */
export async function mockCancellation(page: Page, id: number, { preview, post }: { preview: Reply; post?: Reply }) {
  const gets: Request[] = []
  const posts: Request[] = []
  await page.route(`**/api/v1/orders/${id}/cancel/`, async (route) => {
    const request = route.request()
    const reply = request.method() === 'GET' ? preview : (post ?? { status: 500 })
    ;(request.method() === 'GET' ? gets : posts).push(request)
    await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body ?? {}) })
  })
  return { gets, posts }
}
