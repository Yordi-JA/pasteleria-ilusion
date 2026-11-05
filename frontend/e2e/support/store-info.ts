import { expect } from '@playwright/test'
import type { Page, Request } from '@playwright/test'

export const STORE_INFO_PATH = '**/api/v1/store/info/'

export const fullStoreInfo = {
  address: 'Calle de Prueba 123, Col. Centro',
  whatsapp: '520000000000',
  opens_at: '10:00',
  closes_at: '22:30',
  custom_lead_days: 2,
}

export const emptyStoreInfo = {
  address: null,
  whatsapp: null,
  opens_at: null,
  closes_at: null,
  custom_lead_days: null,
}

/** Responde `GET /api/v1/store/info/` sin backend y devuelve las peticiones recibidas. */
export async function mockStoreInfo(page: Page, body: object = fullStoreInfo, status = 200) {
  return mockStoreInfoSequence(page, [{ status, body }])
}

/** Responde en orden con cada respuesta de la lista; la última se repite. Devuelve las peticiones recibidas. */
export async function mockStoreInfoSequence(page: Page, responses: { status: number; body: object }[]) {
  const requests: Request[] = []
  await page.route(STORE_INFO_PATH, async (route) => {
    requests.push(route.request())
    const { status, body } = responses[Math.min(requests.length, responses.length) - 1]
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return requests
}

/**
 * Comprueba que no llegan peticiones nuevas durante una ventana corta. Sin esa espera, una aserción de
 * "no hubo petición" pasaría por accidente si la petición todavía no salía cuando se revisa.
 */
export async function expectRequestCountStays(requests: Request[], count: number, windowMs = 700) {
  const settledAt = Date.now() + windowMs
  await expect
    .poll(() => (requests.length !== count ? `cambió a ${requests.length}` : Date.now() >= settledAt ? 'estable' : 'esperando'), {
      timeout: windowMs + 3_000,
      intervals: [100],
    })
    .toBe('estable')
}

/** Corta la petición de los datos de la pastelería a los `ms` indicados (solo en desarrollo, ver `storeInfo.ts`). */
export async function shortenStoreInfoTimeout(page: Page, ms: number) {
  await page.addInitScript((value) => Reflect.set(globalThis, '__storeInfoTimeoutMs', value), ms)
}

/** Deja la petición sin respuesta, como una API colgada. */
export async function hangStoreInfo(page: Page) {
  await page.route(STORE_INFO_PATH, () => {
    // Nunca responde.
  })
}
