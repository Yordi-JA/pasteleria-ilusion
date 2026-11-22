/// <reference lib="dom" />
// El callback de `evaluate` corre en el navegador y usa sus tipos.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { chocoPinguino, durazno, mockProductDetails, mosaico, nuez, productDetail, PRODUCTS_PATH, redVelvet } from './support/products.ts'
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

test('shows the product with only its name and description on top, prices, sizes, its original photo and related products', async ({ page }) => {
  await mockProductDetails(page, [durazno])
  await page.goto('/pasteles/tres-leches-de-durazno')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tres leches de durazno')
  await expect(page).toHaveTitle('Tres leches de durazno · Pastelería Ilusión')
  const hero = page.getByRole('region', { name: 'Tres leches de durazno' })
  await expect(hero).toContainText('Relleno de durazno y cobertura de crema pastelera.')
  // El nombre, la descripción y el estado de hoy (22 de noviembre): sin migas, sin el tipo ni "Ver la foto".
  await expect(hero.getByRole('navigation')).toHaveCount(0)
  await expect(hero.getByText('Tres leches', { exact: true })).toHaveCount(0)
  await expect(hero.getByRole('link')).toHaveCount(0)
  // "En vitrina hoy" lo pide la regla de la ficha: texto bajo la descripción, no una pastilla de color.
  const status = hero.getByText('En vitrina hoy', { exact: true })
  await expect(status).toBeVisible()
  const description = (await hero.getByText('Relleno de durazno y cobertura de crema pastelera.').boundingBox())!
  expect((await status.boundingBox())!.y).toBeGreaterThan(description.y)
  expect(await status.evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  // El precio va en "Elige tu pastel"; el encabezado no repite precios (tanda 1).
  await expect(hero).not.toContainText('$')

  // Sin rebanadas cargadas hoy, la ficha no ofrece "Rebanada": son solo de la vitrina del día (D60).
  await expect(presentation(page).getByRole('radio')).toHaveCount(2)
  await expect(option(presentation(page), 'Completo')).toContainText('Aprox. 2.7 kg, unas 19 personas')
  await expect(option(presentation(page), 'Completo')).toContainText('$350')
  await expect(option(presentation(page), 'Mini')).toContainText('Unas 3 personas')
  await expect(presentation(page).getByRole('radio', { name: /Completo/ })).toBeChecked()

  // "Pastel": la foto original, la tomada con su fondo, no el recorte de la vitrina; Conservación y Transporte ya no van en la ficha.
  const photoCard = page.getByRole('region', { name: 'Pastel', exact: true })
  const original = photoCard.getByRole('img', { name: 'Foto del Tres leches de durazno' })
  await expect(original).toHaveAttribute('src', '/fotos/tres-leches-de-durazno-original.webp')
  await original.scrollIntoViewIfNeeded()
  await expect.poll(() => original.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(900)
  const card = (await original.boundingBox())!
  // Cuadrada y más alta que la tarjeta de antes (unos 170 px).
  expect(Math.abs(card.width - card.height)).toBeLessThan(2)
  expect(card.height).toBeGreaterThan(300)
  await expect(page.getByRole('region', { name: 'Detalles', exact: true })).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText(/Conservación|Transporte/)

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

test('Red velvet is only made to order: the showcase option says why, and no price per kilo before building an order', async ({ page }) => {
  await mockProductDetails(page, [redVelvet])
  await page.goto('/pasteles/red-velvet')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Red velvet')
  // El tipo ya no va sobre el nombre (22 de noviembre): "Solo por encargo" lo dice la opción de la vitrina.
  await expect(page.getByRole('region', { name: 'Red velvet' })).not.toContainText('Seco, solo por encargo')
  // El precio por kilo solo se ve al armar un pedido (tanda 1).
  await expect(page.getByRole('region', { name: 'Red velvet' })).not.toContainText('por kg')
  await expect(when(page).getByRole('radio', { name: /Hoy, de la vitrina/ })).toBeDisabled()
  await expect(when(page)).toContainText('Solo por encargo')
  // Sin foto original no hay tarjeta "Pastel"; las notas de conservación siguen en la API, pero la ficha ya no las muestra.
  await expect(page.getByRole('heading', { level: 2, name: 'Elige tu pastel' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Pastel', exact: true })).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText('En refrigeración, hasta 3 días.')
  // Un pan fijo no se ofrece en todos los tipos: no se promete "seco o envinado".
  await expect(page.getByRole('heading', { level: 3, name: '¿Lo quieres más grande o a tu gusto?' })).toBeVisible()
})

test('the cake sliced today says so: its slices are taken today and the whole cake can only be ordered', async ({ page }) => {
  // Durazno es el rebanado (D60): 6 rebanadas hoy y ninguna fila del completo.
  const sliced = productDetail('tres-leches-de-durazno', { stock: { 2: 6 }, sliced_today: true, in_showcase_today: false, filling_flavor: 'durazno' })
  await mockProductDetails(page, [sliced])
  await page.goto('/pasteles/tres-leches-de-durazno')
  // El encabezado dice "Rebanado hoy" bajo la descripción, y no "En vitrina hoy".
  const hero = page.getByRole('region', { name: 'Tres leches de durazno' })
  await expect(hero.getByText('Rebanado hoy', { exact: true })).toBeVisible()
  await expect(hero).not.toContainText('En vitrina hoy')
  // El aviso es el `div` más interno que tiene a la vez el título y el texto (no lleva `role`: ya estaba al cargar).
  const notice = page.locator('div').filter({ has: page.locator('strong', { hasText: 'Hoy se vende en rebanadas' }), hasText: 'Llévate una rebanada' }).last()
  await expect(notice).toContainText('Llévate una rebanada hoy de la vitrina, o encarga el pastel completo.')
  await expect(notice.getByRole('link', { name: 'Ver rebanadas de hoy' })).toHaveAttribute('href', '/rebanadas')

  // El completo: la vitrina dice por qué no, y queda elegido el encargo.
  await expect(presentation(page).getByRole('radio', { name: /Completo/ })).toBeChecked()
  await expect(when(page).getByRole('radio', { name: /Hoy, de la vitrina/ })).toBeDisabled()
  await expect(when(page)).toContainText('Hoy se vende en rebanadas')
  await expect(when(page).getByRole('radio', { name: /Encargarlo/ })).toBeChecked()
  await page.getByRole('button', { name: 'Agregar al pedido' }).click()
  // La rebanada sí se lleva hoy, con tope en lo que queda.
  await option(presentation(page), 'Rebanada').click()
  await expect(option(when(page), 'Hoy, de la vitrina')).toContainText('Quedan 6')
  await expect(when(page).getByRole('radio', { name: /Hoy, de la vitrina/ })).toBeChecked()
  await page.getByRole('button', { name: 'Agregar al pedido' }).click()
  expect(await cartLines(page)).toEqual([
    expect.objectContaining({ offeringId: 1, fulfillment: 'order', presentation: 'whole' }),
    expect.objectContaining({ offeringId: 2, fulfillment: 'showcase', presentation: 'slice' }),
  ])
})

test('a flavor without slices today does not offer "Rebanada": slices are only from the vitrina of the day', async ({ page }) => {
  await mockProductDetails(page, [productDetail('tres-leches-de-fresa', { filling_flavor: 'fresa' })])
  await page.goto('/pasteles/tres-leches-de-fresa')
  await expect(presentation(page).getByRole('radio')).toHaveCount(2)
  await expect(presentation(page).getByRole('radio', { name: /Rebanada/ })).toHaveCount(0)
})

test('the sliced cake offers "Rebanada" from the vitrina only; it cannot be ordered for a date', async ({ page }) => {
  const sliced = productDetail('tres-leches-de-durazno', { stock: { 2: 6 }, sliced_today: true, in_showcase_today: false })
  await mockProductDetails(page, [sliced])
  await page.goto('/pasteles/tres-leches-de-durazno')
  await option(presentation(page), 'Rebanada').click()
  const order = when(page).getByRole('radio', { name: /Encargarlo/ })
  await expect(order).toBeDisabled()
  await expect(when(page)).toContainText('Las rebanadas son solo de la vitrina')
  await expect(when(page).getByRole('radio', { name: /Hoy, de la vitrina/ })).toBeChecked()
})

test('the slices of the sliced cake that ran out show "Rebanada" disabled, sold out today', async ({ page }) => {
  await mockProductDetails(page, [productDetail('tres-leches-de-durazno', { stock: { 2: 0 }, sliced_today: false })])
  await page.goto('/pasteles/tres-leches-de-durazno')
  await expect(presentation(page).getByRole('radio', { name: /Rebanada/ })).toBeDisabled()
  await expect(presentation(page)).toContainText('Agotada por hoy')
  await expect(presentation(page).getByRole('radio', { name: /Completo/ })).toBeChecked()
})

test('with the whole cake sold and the cake sliced, the whole cake says it is sold in slices, not sold out', async ({ page }) => {
  await mockProductDetails(page, [productDetail('tres-leches-de-durazno', { stock: { 1: 0, 2: 6 }, sliced_today: true, in_showcase_today: false })])
  await page.goto('/pasteles/tres-leches-de-durazno')
  await expect(presentation(page).getByRole('radio', { name: /Completo/ })).toBeChecked()
  await expect(when(page)).toContainText('Hoy se vende en rebanadas')
  await expect(when(page)).not.toContainText('Agotada por hoy')
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

test('a cake that can be a showcase cake opens the designer as one, with its own conditions (tanda 2)', async ({ page }) => {
  await mockProductDetails(page, [chocoPinguino])
  await page.goto('/pasteles/choco-pinguino')
  const personalize = page.getByRole('heading', { level: 3, name: '¿Lo quieres con tu decoración?' }).locator('..')
  await expect(personalize).toContainText('Elige su cobertura, su decoración y su mensaje. Pedidos con 2 días de anticipación.')
  await expect(personalize).not.toContainText('por kilo')
  await expect(personalize.getByRole('link', { name: 'Personalizar este pastel' })).toHaveAttribute('href', '/pedido/disena?pastel=choco-pinguino&tamano=vitrina')
})

test('a presentation without a price says "[Precio por confirmar]" and cannot be added (tanda 2)', async ({ page }) => {
  await mockProductDetails(page, [nuez])
  await page.goto('/pasteles/tres-leches-de-nuez')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tres leches de nuez')
  const completo = presentation(page).getByRole('radio', { name: /Completo/ })
  await expect(completo).toBeDisabled()
  await expect(presentation(page)).toContainText('[Precio por confirmar]')
  await expect(page.getByRole('button', { name: 'Agregar al pedido' })).toHaveCount(0)
  await expect(page.getByText('Por ahora no se puede agregar: su precio está por confirmar.')).toBeVisible()
  // Solo por encargo: "Personalizar este pastel" sigue como pedido por kilos (D59).
  await expect(page.getByRole('link', { name: 'Personalizar este pastel' })).toHaveAttribute('href', '/pedido/disena?pastel=tres-leches-de-nuez')
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

test('a product without an original photo has no photo card: a dessert shows no "Postre" card either', async ({ page }) => {
  await mockProductDetails(page, [productDetail('flan-napolitano'), productDetail('tres-leches-de-nuez')])
  for (const [slug, name] of [
    ['flan-napolitano', 'Flan napolitano'],
    ['tres-leches-de-nuez', 'Tres leches de nuez'],
  ] as const) {
    await page.goto(`/pasteles/${slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.getByRole('heading', { level: 2, name: 'Elige tu pastel' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Pastel', exact: true })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Postre', exact: true })).toHaveCount(0)
    await expect(page.locator('img[src$="-original.webp"]')).toHaveCount(0)
  }
})

test('while loading, the skeleton saves the photo card only for a product that has an original photo', async ({ page }) => {
  await page.route((url) => url.pathname.startsWith(PRODUCTS_PATH), () => undefined)
  await page.goto('/pasteles/tres-leches-de-fresa')
  const busy = page.locator('[aria-busy="true"]').first()
  await expect(busy.locator('[data-esqueleto].aspect-square')).toHaveCount(1)
  await page.goto('/pasteles/red-velvet')
  await expect(page.locator('[aria-busy="true"] [data-esqueleto]').first()).toBeVisible()
  await expect(page.locator('[aria-busy="true"] [data-esqueleto].aspect-square')).toHaveCount(0)
})

test.describe('on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the "Pastel" card goes after "Elige tu pastel", square and at full width', async ({ page }) => {
    await mockProductDetails(page, [durazno])
    await page.goto('/pasteles/tres-leches-de-durazno')
    const photo = page.getByRole('region', { name: 'Pastel', exact: true }).getByRole('img', { name: 'Foto del Tres leches de durazno' })
    await photo.scrollIntoViewIfNeeded()
    // Las dos medidas con el mismo scroll: `boundingBox` es relativo a la ventana.
    const choose = (await page.getByRole('heading', { level: 2, name: 'Elige tu pastel' }).boundingBox())!
    const box = (await photo.boundingBox())!
    expect(box.y).toBeGreaterThan(choose.y)
    expect(box.width).toBeGreaterThan(320)
    expect(Math.abs(box.width - box.height)).toBeLessThan(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('the text goes before the photo and nothing overflows', async ({ page }) => {
    await mockProductDetails(page, [productDetail('tres-leches-de-fresa'), durazno])
    await page.goto('/pasteles/tres-leches-de-durazno')
    const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!
    const photo = (await page.getByRole('region', { name: 'Tres leches de durazno' }).getByRole('img', { name: 'Foto del pastel pendiente' }).boundingBox())!
    expect(photo.y).toBeGreaterThan(title.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
