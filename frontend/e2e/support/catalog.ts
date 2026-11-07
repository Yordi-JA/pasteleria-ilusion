import type { Page, Request } from '@playwright/test'

/** Una respuesta simulada de la API, o `'hang'` para dejar la petición sin respuesta. */
export type MockResponse = { status: number; body: unknown } | 'hang'

export const FEATURED_PATH = '/api/v1/featured-products/'
export const SHOWCASE_PATH = '/api/v1/showcase/'
export const SLICES_PATH = '/api/v1/slices/'

/** Fecha de la pastelería en las respuestas de ejemplo: viernes 6 de noviembre de 2026. */
export const TODAY = '2026-11-06'

const offering = (id: number, presentation: string, price: string) => ({ id, presentation, price })

const card = (slug: string, name: string, category: 'cake' | 'dessert', summary: string, offerings: object[]) => ({
  slug,
  name,
  category,
  sales_channel: 'showcase_and_order',
  cake_type: category === 'cake' ? 'tres_leches' : null,
  bread: null,
  filling_base: null,
  summary,
  photo: null,
  in_showcase_today: true,
  offerings,
})

/**
 * "Pasteles de la casa". El Imposible tiene el completo después de otra presentación (se elige el completo) y la
 * gelatina no tiene completo (se elige la primera, el vaso).
 */
export const featuredProducts = [
  card('tres-leches-de-durazno', 'Tres leches de durazno', 'cake', 'Relleno de durazno y cobertura de crema pastelera.', [
    offering(1, 'whole', '350.00'),
    offering(2, 'slice', '35.00'),
    offering(3, 'mini', '130.00'),
  ]),
  card(
    'tres-leches-con-queso-y-zarzamora',
    'Tres leches con queso y zarzamora',
    'cake',
    'Relleno de queso con zarzamora y cobertura de crema pastelera.',
    [offering(10, 'whole', '420.00')],
  ),
  card('imposible', 'Imposible', 'dessert', 'Flan con pan de chocolate.', [offering(20, 'individual', '60.00'), offering(21, 'whole', '350.00')]),
  card('gelatina-de-mosaico', 'Gelatina de mosaico', 'dessert', 'Cubos de gelatina de sabores en gelatina de leche.', [
    offering(30, 'cup', '45.50'),
  ]),
]

type StockOverrides = { stock?: number; sold_out?: boolean; photo?: string | null }

const stockItem = (
  offeringId: number,
  slug: string,
  name: string,
  category: 'cake' | 'dessert',
  presentation: string,
  price: string,
  { stock = 2, sold_out = stock === 0, photo = null }: StockOverrides = {},
) => ({
  offering_id: offeringId,
  product_slug: slug,
  product_name: name,
  category,
  presentation,
  price,
  photo,
  stock,
  sold_out,
})

/** Vitrina de hoy: diez partidas (la portada muestra ocho), un mini y un Imposible agotado. */
export const showcaseItems = [
  stockItem(1, 'tres-leches-de-durazno', 'Tres leches de durazno', 'cake', 'whole', '350.00', { stock: 2 }),
  stockItem(10, 'tres-leches-con-queso-y-zarzamora', 'Tres leches con queso y zarzamora', 'cake', 'whole', '420.00', { stock: 1 }),
  stockItem(21, 'imposible', 'Imposible', 'dessert', 'whole', '350.00', { stock: 0 }),
  stockItem(40, 'choco-pinguino', 'Choco-pingüino', 'cake', 'whole', '350.00', { stock: 3 }),
  stockItem(3, 'tres-leches-de-durazno', 'Tres leches de durazno', 'cake', 'mini', '130.00', { stock: 4 }),
  stockItem(50, 'flan-napolitano', 'Flan napolitano', 'dessert', 'whole', '360.00', { stock: 2 }),
  stockItem(60, 'tarta-de-frutas', 'Tarta de frutas', 'dessert', 'whole', '290.00', { stock: 1 }),
  stockItem(70, 'gelatina-de-molde', 'Gelatina de molde', 'dessert', 'whole', '290.00', { stock: 5 }),
  stockItem(30, 'gelatina-de-mosaico', 'Gelatina de mosaico', 'dessert', 'cup', '45.50', { stock: 6 }),
  stockItem(80, 'tres-leches-de-cajeta', 'Tres leches de cajeta', 'cake', 'whole', '1250.00', { stock: 1 }),
]

/** Rebanadas de hoy: una con 1, una agotada en medio y las demás con más. */
export const sliceItems = [
  stockItem(2, 'tres-leches-de-durazno', 'Tres leches de durazno', 'cake', 'slice', '35.00', { stock: 2 }),
  stockItem(92, 'imposible', 'Imposible', 'dessert', 'slice', '35.00', { stock: 0 }),
  stockItem(91, 'tres-leches-con-flan-y-cajeta', 'Tres leches con flan y cajeta', 'cake', 'slice', '40.00', { stock: 1 }),
  stockItem(93, 'posible', 'Posible', 'dessert', 'slice', '35.00', { stock: 5 }),
]

export const ok = (body: unknown): MockResponse => ({ status: 200, body })
export const todayStock = (items: object[]) => ok({ date: TODAY, items })
export const serverError = { status: 500, body: { detail: 'error' } } satisfies MockResponse

/** Lo que responde cada endpoint, en orden; la última respuesta se repite. */
export type CatalogMocks = {
  featured?: MockResponse[]
  showcase?: MockResponse[]
  slices?: MockResponse[]
}

export const fullCatalog: Required<CatalogMocks> = {
  featured: [ok(featuredProducts)],
  showcase: [todayStock(showcaseItems)],
  slices: [todayStock(sliceItems)],
}

/** Responde una ruta de la API con la lista de respuestas y devuelve las peticiones recibidas. */
async function mockEndpoint(page: Page, path: string, responses: MockResponse[]) {
  const requests: Request[] = []
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      requests.push(route.request())
      const response = responses[Math.min(requests.length, responses.length) - 1]
      // Una petición colgada nunca recibe respuesta.
      if (response === 'hang') return
      await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
    },
  )
  return requests
}

/** Simula los tres endpoints de la portada; lo que no se indique responde con los datos completos. */
export async function mockCatalog(page: Page, mocks: CatalogMocks = {}) {
  const { featured, showcase, slices } = { ...fullCatalog, ...mocks }
  return {
    featured: await mockEndpoint(page, FEATURED_PATH, featured),
    showcase: await mockEndpoint(page, SHOWCASE_PATH, showcase),
    slices: await mockEndpoint(page, SLICES_PATH, slices),
  }
}

/** Corta las peticiones del catálogo a los `ms` indicados (solo en desarrollo, ver `apiClient.ts`). */
export async function shortenCatalogTimeout(page: Page, ms: number) {
  await page.addInitScript((value) => Reflect.set(globalThis, '__catalogTimeoutMs', value), ms)
}
