import type { Page, Request } from '@playwright/test'
import type { MockResponse } from './catalog.ts'

export const STANDS_PATH = '/api/v1/stands/'

const stand = (minKg: number, maxKg: number, deposit: string, description = '') => ({ min_kg: minKg, max_kg: maxKg, deposit, description })

/** `GET /api/v1/stands/` como la semilla (regla 7): las cinco bases de la pastelería, de menos a más kilos. */
export const standInfo = {
  stands: [
    stand(4, 5, '70.00'),
    stand(6, 8, '90.00'),
    stand(10, 12, '150.00'),
    stand(15, 15, '200.00'),
    stand(20, 25, '250.00', 'Madera forrada en aluminio'),
  ],
  return_days: 15,
  from_kg: 4,
  damaged_policy: null,
  // Los depósitos "Aprobada" de 26 a 50 kg, hasta el máximo en línea.
  beyond: { from_kg: 26, to_kg: 50, min_deposit: '300.00', max_deposit: '500.00' },
}

/** Responde `GET stands/` en orden con cada respuesta de la lista (la última se repite). Devuelve las peticiones. */
export async function mockStands(page: Page, responses: MockResponse[] = [{ status: 200, body: standInfo }]) {
  const requests: Request[] = []
  await page.route(
    (url) => url.pathname === STANDS_PATH,
    async (route) => {
      requests.push(route.request())
      const response = responses[Math.min(requests.length, responses.length) - 1]
      if (response === 'hang') return
      await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
    },
  )
  return requests
}
