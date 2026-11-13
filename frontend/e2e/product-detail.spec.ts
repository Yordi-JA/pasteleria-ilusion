import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { durazno, mockProductDetails, mosaico, productDetail, PRODUCTS_PATH, redVelvet } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/** `/pasteles/:slug`, la ficha (D59). La API se simula con `support/products.ts`. Escritorio salvo donde se dice. */

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
})

/** Las líneas del carrito guardadas en el navegador. */
async function cartLines(page: Page) {
  return page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('ilusion.cart.v1') ?? '{"items":[]}') as { items?: unknown[] } | unknown[]
    return Array.isArray(stored) ? stored : (stored.items ?? [])
  })
}

const when = (page: Page) => page.getByRole('group', { name: '¿Cuándo lo quieres?' })
const presentation = (page: Page) => page.getByRole('group', { name: 'Presentación' })
/** La opción visible: el radio va dentro de su etiqueta. */
const option = (group: ReturnType<typeof when>, name: string) => group.locator('label').filter({ hasText: name })

test('shows the product with its tags, prices, sizes, pending details and related products', async ({ page }) => {
  await mockProductDetails(page, [durazno])
  await page.goto('/pasteles/tres-leches-de-durazno')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tres leches de durazno')
  await expect(page).toHaveTitle('Tres leches de durazno · Pastelería Ilusión')
  const hero = page.getByRole('region', { name: 'Tres leches de durazno' })
  await expect(hero).toContainText('En vitrina hoy')
  await expect(hero).toContainText('$350 · $35 la rebanada')
  await expect(hero.getByRole('navigation', { name: 'Ruta' }).getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '/catalogo')

  await expect(presentation(page).getByRole('radio')).toHaveCount(3)
  await expect(option(presentation(page), 'Completo')).toContainText('Aprox. 2.7 kg, unas 19 personas')
  await expect(option(presentation(page), 'Completo')).toContainText('$350')
  await expect(option(presentation(page), 'Mini')).toContainText('Unas 3 personas')
  await expect(presentation(page).getByRole('radio', { name: /Completo/ })).toBeChecked()

  // Conservación y Transporte sin dato: el marcador de pendiente, nunca un texto inventado.
  const details = page.getByRole('region', { name: 'Detalles' })
  await expect(details).toContainText('[Conservación por confirmar]')
  await expect(details).toContainText('[Transporte por confirmar]')

  const related = page.getByRole('region', { name: 'También te puede gustar' })
  await expect(related.getByRole('heading', { level: 3 })).toHaveText(['Tres leches con queso y zarzamora', 'Imposible', 'Choco-pingüino'])
  await related.getByRole('link', { name: 'Ver detalle: Imposible' }).click()
  await expect(page).toHaveURL('/pasteles/imposible')
})

test('"Hoy, de la vitrina" adds a showcase line, capped at what is left today', async ({ page }) => {
  await mockProductDetails(page, [durazno])
  await page.goto('/pasteles/tres-leches-de-durazno')
  await expect(when(page).getByRole('radio', { name: /Hoy, de la vitrina/ })).toBeChecked()
  await expect(option(when(page), 'Hoy, de la vitrina')).toContainText('Quedan 2')

  const more = page.getByRole('button', { name: 'Agregar uno de Tres leches de durazno' })
  await more.click()
  await expect(page.getByRole('group', { name: 'Cantidad de Tres leches de durazno' })).toContainText('2')
  await expect(more).toBeDisabled()
  await expect(page.getByText('$350 c/u')).toBeVisible()

  await page.getByRole('button', { name: 'Agregar al pedido' }).click()
  await expect(page.getByTestId('aviso-carrito')).toContainText('Agregado al pedido')
  expect(await cartLines(page)).toEqual([expect.objectContaining({ offeringId: 1, quantity: 2, fulfillment: 'showcase', presentation: 'whole', unitPrice: '350.00' })])
})

test('"Encargarlo para una fecha" adds an order line; a presentation not loaded today can only be ordered', async ({ page }) => {
  await mockProductDetails(page, [durazno])
  await page.goto('/pasteles/tres-leches-de-durazno')
  await option(when(page), 'Encargarlo para una fecha').click()
  await page.getByRole('button', { name: 'Agregar al pedido' }).click()
  await expect(page.getByTestId('aviso-carrito')).toContainText('Agregado al pedido')

  await option(presentation(page), 'Mini').click()
  const today = when(page).getByRole('radio', { name: /Hoy, de la vitrina/ })
  await expect(today).toBeDisabled()
  await expect(when(page)).toContainText('Hoy no está en la vitrina')
  await expect(when(page).getByRole('radio', { name: /Encargarlo/ })).toBeChecked()
  await page.getByRole('button', { name: 'Agregar al pedido' }).click()
  expect(await cartLines(page)).toEqual([
    expect.objectContaining({ offeringId: 1, quantity: 1, fulfillment: 'order' }),
    expect.objectContaining({ offeringId: 3, quantity: 1, fulfillment: 'order', name: 'Mini de tres leches de durazno' }),
  ])
})

test('Red velvet is only made to order: the showcase option says why, and the price per kilo comes from the options', async ({ page }) => {
  await mockProductDetails(page, [redVelvet])
  await page.goto('/pasteles/red-velvet')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Red velvet')
  await expect(page.getByRole('region', { name: 'Red velvet' })).toContainText('Seco, solo por encargo')
  await expect(page.getByRole('region', { name: 'Red velvet' })).toContainText('$450 · Por pedido, $280 por kg')
  await expect(when(page).getByRole('radio', { name: /Hoy, de la vitrina/ })).toBeDisabled()
  await expect(when(page)).toContainText('Solo por encargo')
  // Con notas de la pastelería, se muestran tal cual.
  await expect(page.getByRole('region', { name: 'Detalles' })).toContainText('En refrigeración, hasta 3 días.')
  // Un pan fijo no se ofrece en todos los tipos: no se promete "seco o envinado".
  await expect(page.getByRole('heading', { level: 3, name: '¿Lo quieres más grande o a tu gusto?' })).toBeVisible()
})

test('a showcase-only cup sold out today cannot be added, and says why', async ({ page }) => {
  await mockProductDetails(page, [mosaico])
  await page.goto('/pasteles/mosaico-con-crema')
  await expect(when(page)).toContainText('Agotada por hoy')
  await expect(when(page)).toContainText('Solo en vitrina')
  await expect(page.getByRole('button', { name: 'Agregar al pedido' })).toHaveCount(0)
  await expect(page.getByText('Hoy no se puede agregar: solo se vende en la vitrina y hoy no hay.')).toBeVisible()
  // Un postre no se personaliza.
  await expect(page.getByRole('link', { name: 'Personalizar este pastel' })).toHaveCount(0)
})

test('"Personalizar este pastel" explains the conditions and opens the designer with the product', async ({ page }) => {
  await mockProductDetails(page, [durazno])
  await page.goto('/pasteles/tres-leches-de-durazno')
  const personalize = page.getByRole('heading', { level: 3, name: '¿Lo quieres seco, envinado o más grande?' }).locator('..')
  await expect(personalize).toContainText('Pedidos desde 4 kg, con precio por kilo y 2 días de anticipación.')
  await expect(personalize.getByRole('link', { name: 'Personalizar este pastel' })).toHaveAttribute('href', '/pedido/disena?pastel=tres-leches-de-durazno')
})

test('an unknown product says it was not found, with a way back to the catalog', async ({ page }) => {
  await mockProductDetails(page, [])
  await page.goto('/pasteles/no-existe')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No encontramos este producto')
  await expect(page).toHaveTitle('No encontramos este producto · Pastelería Ilusión')
  await expect(page.getByRole('main').getByRole('link', { name: 'Ver el catálogo' })).toHaveAttribute('href', '/catalogo')
  await expect(page.getByRole('main').getByRole('link', { name: 'Ir a inicio' })).toHaveAttribute('href', '/')
})

test('a slug that cannot be one is not even asked for', async ({ page }) => {
  const requests = await mockProductDetails(page, [durazno])
  await page.goto('/pasteles/%E2%9C%93%20raro')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No encontramos este producto')
  expect(requests).toEqual([])
})

test('a failed load shows the error, and the retry brings the product', async ({ page }) => {
  let fail = true
  await page.route(
    (url) => url.pathname === `${PRODUCTS_PATH}tres-leches-de-durazno/`,
    (route) => route.fulfill({ status: fail ? 500 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { detail: 'error' } : durazno) }),
  )
  await page.goto('/pasteles/tres-leches-de-durazno')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('No se pudo cargar este producto')
  fail = false
  await alert.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tres leches de durazno')
})

test('while loading: the skeleton with aria-busy and a message for screen readers', async ({ page }) => {
  await page.route((url) => url.pathname.startsWith(PRODUCTS_PATH), () => undefined)
  await page.goto('/pasteles/tres-leches-de-durazno')
  await expect(page.locator('[aria-busy="true"] [data-esqueleto]').first()).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Cargando el producto…' })).toBeAttached()
  await expect(page).toHaveTitle('Ficha de producto · Pastelería Ilusión')
})

test.describe('on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the text goes before the photo and nothing overflows', async ({ page }) => {
    await mockProductDetails(page, [productDetail('tres-leches-de-fresa'), durazno])
    await page.goto('/pasteles/tres-leches-de-durazno')
    const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!
    const photo = (await page.getByRole('region', { name: 'Tres leches de durazno' }).getByRole('img', { name: 'Foto del pastel pendiente' }).boundingBox())!
    expect(photo.y).toBeGreaterThan(title.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
