import type { Page, Request } from '@playwright/test'

/** Simulación de `GET stand-loans/` (cuenta) y `GET notes/<token>/` (pública) de D69, sin Django. */

export const NOTE_TOKEN = 'token-de-nota-de-prueba-0123456789abcdef'

export const onLoan = {
  id: 3,
  order_id: 57,
  kg: 4,
  deposit: '70.00',
  status: 'on_loan',
  status_label: 'Prestada',
  delivered_on: '2026-11-15',
  due_date: '2026-11-30',
  returned_at: null,
  deposit_refunded: false,
}

/** Con el reloj en el viernes 13 de noviembre de 2026, esta fecha límite ya pasó. */
export const overdue = { ...onLoan, id: 2, order_id: 41, kg: 15, deposit: '200.00', delivered_on: '2026-10-26', due_date: '2026-11-10' }

export const returned = {
  ...onLoan,
  id: 1,
  order_id: 30,
  kg: 8,
  deposit: '100.00',
  status: 'returned',
  status_label: 'Devuelta',
  delivered_on: '2026-10-01',
  due_date: '2026-10-16',
  returned_at: '2026-10-12T16:30:00-06:00',
  deposit_refunded: true,
}

export function loanPage(results: object[]) {
  return { count: results.length, next: null, previous: null, results }
}

type Reply = { status: number; body?: object; headers?: Record<string, string> }

async function reply(page: Page, url: string, replies: Reply[]): Promise<Request[]> {
  const requests: Request[] = []
  await page.route(url, async (route) => {
    requests.push(route.request())
    const { status, body, headers } = replies[Math.min(requests.length, replies.length) - 1]
    await route.fulfill({ status, headers, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) })
  })
  return requests
}

/** Responde en orden `GET stand-loans/`; la última respuesta se repite. */
export function mockStandLoans(page: Page, ...replies: Reply[]) {
  return reply(page, '**/api/v1/stand-loans/**', replies)
}

export const validNote = {
  valid: true,
  order_id: 57,
  created_at: '2026-11-13T12:05:00-06:00',
  customer: 'Mariana P.',
  delivery: { fulfillment: 'pickup', fulfillment_label: 'Recoger en la pastelería', date: '2026-11-15', starts_at: '15:00', ends_at: '15:30' },
  stands: [{ kg: 4, deposit: '70.00', status: 'on_loan', status_label: 'Prestada', return_by: '2026-11-30', returned_at: null }],
}

/** Un pedido que aún no se entrega: el backend manda la base sin estado ni etiqueta, solo con la fecha prevista. */
export const notDeliveredNote = {
  ...validNote,
  stands: [{ kg: 4, deposit: '70.00', status: null, status_label: null, return_by: '2026-11-30', returned_at: null }],
}

/** Responde en orden `GET notes/<token>/`; la última respuesta se repite. */
export function mockNote(page: Page, ...replies: Reply[]) {
  return reply(page, '**/api/v1/notes/**', replies)
}

/**
 * Responde `failure` hasta que la prueba llame a `recover()` y después `success`. En desarrollo StrictMode monta dos
 * veces, así que contar peticiones no sirve para decidir cuándo cambia la respuesta.
 */
export async function mockRecovering(page: Page, url: string, failure: Reply, success: Reply) {
  let recovered = false
  await page.route(url, async (route) => {
    const { status, body, headers } = recovered ? success : failure
    await route.fulfill({ status, headers, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) })
  })
  return { recover: () => (recovered = true) }
}
