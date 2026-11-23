import { expect, test } from '@playwright/test'
import type { Browser, Locator, Page } from '@playwright/test'
import { accountOrder, mockOrderDetail, paidItems } from './support/account-orders.ts'
import { signedIn } from './support/auth.ts'
import { NOW } from './support/checkout.ts'
import { paidCancellationPreview } from './support/order-cancel.ts'
import { mockPayment, ORDER_ID, paymentState } from './support/payments.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * La imagen de cada línea de un pedido ya hecho (D103): el servidor da la de la tarjeta del catálogo (`image`, un archivo de
 * `/fotos/`) y el producto (`product_slug`), así el detalle que abre el botón del correo, el pago y la confirmación la muestran
 * aunque el pedido se haya hecho en otra pestaña u otro dispositivo. Un postre toma su imagen del modelo por su `slug` (D97). Un
 * pastel de "Diseña tu pastel" no lleva imagen del servidor, aunque salga de "Personalizar este pastel" (su cobertura y su
 * decoración son libres): solo la captura que guardó la pestaña que hizo el pedido y, sin ella, el hueco. Nada de 3D en estas vistas.
 */

const THUMBNAILS_KEY = 'ilusion.orderThumbnails.v1'
const TINY_WEBP = 'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoEAAQAAUAmJaACdAFAAAD+8ohiY9Fa//G8f5Lv7d9lAAAA'

const [catalogCake, designedCake] = paidItems

/** Lo que manda el servidor: una línea de la vitrina, un postre, un pastel desde "Personalizar este pastel" y uno desde cero. */
const fromSource = { ...designedCake.design, cake_size: 'showcase', cake_size_label: 'Pastel de vitrina, ~19 personas', source_product: 'tres-leches-de-durazno' }
const items = [
  { ...catalogCake, kind: 'showcase', product_name: 'Tres leches de galleta', image: 'tres-leches-de-galleta-modelo.webp', product_slug: 'tres-leches-de-galleta' },
  { ...catalogCake, offering_id: 140, product_name: 'Gelatina Mosaico', presentation: 'cup', line_total: '20.00', image: null, product_slug: 'gelatina-mosaico' },
  { ...designedCake, design: fromSource, image: null, product_slug: null },
  { ...designedCake, image: null, product_slug: null },
]

const lines = (scope: Locator) => scope.getByRole('listitem')
const imageIn = (line: Locator) => line.locator('img')

/** Una pestaña de otro dispositivo: un contexto nuevo, sin el `sessionStorage` de la pestaña que hizo el pedido. */
async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
  await signedIn(page)
  // El detalle pide la vista previa de la cancelación (D70): simulada, como en `order-detail.spec.ts`.
  await page.route('**/api/v1/orders/*/cancel/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paidCancellationPreview()) }),
  )
  return page
}

async function expectServerImages(scope: Locator) {
  await expect(lines(scope)).toHaveCount(4)
  await expect(imageIn(lines(scope).nth(0))).toHaveAttribute('src', '/fotos/tres-leches-de-galleta-modelo.webp')
  await expect(imageIn(lines(scope).nth(1))).toHaveAttribute('src', '/fotos/gelatina-mosaico-modelo.webp')
  // Los dos pasteles diseñados, desde "Personalizar este pastel" y desde cero: el hueco de siempre.
  for (const index of [2, 3]) {
    await expect(imageIn(lines(scope).nth(index))).toHaveCount(0)
    await expect(lines(scope).nth(index)).toContainText('Foto')
  }
  for (const index of [0, 1]) await expect(lines(scope).nth(index)).not.toContainText('Foto')
}

test('the order detail opened from the email shows the image of each line from the server', async ({ browser }) => {
  const page = await freshPage(browser)
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, items }) })
  await page.goto('/cuenta/pedidos/57')
  expect(await page.evaluate((key) => sessionStorage.getItem(key), THUMBNAILS_KEY)).toBeNull()
  const products = page.getByRole('region', { name: 'Productos' })
  await expectServerImages(products)
  // Los archivos existen en `public/fotos/`: cada imagen se carga, no queda rota.
  for (const index of [0, 1]) {
    await expect.poll(() => imageIn(lines(products).nth(index)).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  }
  // Decorativas, como en el carrito: el nombre de la línea ya dice qué es.
  await expect(imageIn(lines(products).nth(0))).toHaveAttribute('alt', '')
  await page.context().close()
})

test('the payment page in another tab shows the images from the server', async ({ browser }) => {
  const page = await freshPage(browser)
  await mockPayment(page, { states: [{ status: 200, body: paymentState({ order: { items } }) }] })
  await page.goto(`/pedido/pago?pedido=${ORDER_ID}`)
  await expectServerImages(page.getByRole('region', { name: 'Resumen de tu pedido' }))
  await page.context().close()
})

test('the confirmation in another tab shows the images from the server', async ({ browser }) => {
  const page = await freshPage(browser)
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, status: 'received', items }) })
  await page.goto('/pedido/confirmacion?pedido=57')
  await expectServerImages(page.getByRole('region', { name: 'Resumen', exact: true }))
  await page.context().close()
})

test('in the tab that placed the order, the capture of the designed cake still wins over the server image', async ({ browser }) => {
  const page = await freshPage(browser)
  await page.addInitScript(
    ([key, value]) => sessionStorage.setItem(key, value),
    [THUMBNAILS_KEY, JSON.stringify({ orderId: 57, thumbnails: [null, null, TINY_WEBP, null] })],
  )
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, items }) })
  await page.goto('/cuenta/pedidos/57')
  const products = page.getByRole('region', { name: 'Productos' })
  await expect(imageIn(lines(products).nth(2))).toHaveAttribute('src', TINY_WEBP)
  // Las líneas sin miniatura guardada toman la del servidor; el diseño sin captura, el hueco.
  await expect(imageIn(lines(products).nth(0))).toHaveAttribute('src', '/fotos/tres-leches-de-galleta-modelo.webp')
  await expect(imageIn(lines(products).nth(3))).toHaveCount(0)
  await expect(lines(products).nth(3)).toContainText('Foto')
  await page.context().close()
})

test('an image that is not a photo name, or one on a designed cake or an accepted quote, is never shown', async ({ browser }) => {
  const page = await freshPage(browser)
  const doubtful = [
    { ...catalogCake, image: 'https://ejemplo.com/x.webp', product_slug: 'tres-leches-de-durazno' },
    { ...catalogCake, offering_id: 102, image: '../secreto.webp', product_slug: '../gelatina-mosaico' },
    // Un pastel diseñado y una cotización aceptada no llevan imagen del servidor, aunque llegara una.
    { ...designedCake, design: fromSource, image: 'tres-leches-de-durazno-modelo.webp', product_slug: 'tres-leches-de-durazno' },
    { ...catalogCake, kind: 'reference', offering_id: null, product_name: 'Pastel según tu referencia', presentation: null, image: 'tres-leches-de-durazno.webp', product_slug: 'tres-leches-de-durazno' },
  ]
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ id: 57, items: doubtful }) })
  await page.goto('/cuenta/pedidos/57')
  const products = page.getByRole('region', { name: 'Productos' })
  await expect(lines(products)).toHaveCount(4)
  await expect(products.locator('img')).toHaveCount(0)
  await page.context().close()
})
