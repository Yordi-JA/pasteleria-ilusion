import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { mockProducts, nuezCard, productCards } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * `/catalogo` (D59). La API se simula (`support/products.ts`). Sin filtros ni búsqueda desde la tanda 1 (D77). Escritorio
 * (1440 px) salvo donde se dice.
 */

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
})

const cakes = (page: Page) => page.getByRole('region', { name: 'Pasteles', exact: true })
const desserts = (page: Page) => page.getByRole('region', { name: 'Postres y gelatinas', exact: true })
const cardNames = (region: ReturnType<typeof cakes>) => region.getByRole('heading', { level: 3 })

test('lists cakes and desserts with their counts, tags, prices and links to the product page', async ({ page }) => {
  await mockProducts(page)
  await page.goto('/catalogo')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo')
  await expect(page).toHaveTitle('Catálogo · Pastelería Ilusión')
  await expect(cardNames(cakes(page))).toHaveText(['Tres leches de durazno', 'Tres leches de fresa', 'Tres leches con queso y zarzamora', 'Choco-pingüino'])
  await expect(cakes(page)).toContainText('4 pasteles')
  await expect(cardNames(desserts(page))).toHaveText(['Imposible', 'Flan napolitano', 'Mosaico con crema'])
  await expect(desserts(page)).toContainText('3 postres')

  const durazno = cakes(page).getByRole('article').filter({ hasText: 'Tres leches de durazno' })
  await expect(durazno).toContainText('Tres leches')
  await expect(durazno).toContainText('En vitrina hoy')
  await expect(durazno).toContainText('$350')
  // La rebanada solo se ofrece en la vitrina y en las rebanadas de hoy, no en el catálogo (tanda 1).
  await expect(durazno).not.toContainText('rebanada')
  await expect(durazno.getByRole('img', { name: 'Foto del pastel pendiente' })).toBeVisible()
  await expect(durazno.getByRole('link', { name: 'Ver pastel: Tres leches de durazno' })).toHaveAttribute('href', '/pasteles/tres-leches-de-durazno')

  // Choco-pingüino: pan de chocolate, en vitrina hoy; su precio por kilo solo se ve al armar un pedido (tanda 1).
  const choco = cakes(page).getByRole('article').filter({ hasText: 'Choco-pingüino' })
  await expect(choco).toContainText('Seco')
  await expect(choco).toContainText('$350')
  await expect(choco).not.toContainText('por kg')
  // Los postres: el grande con su nombre, el vaso "Solo en vitrina" y "Ver detalle".
  const flan = desserts(page).getByRole('article').filter({ hasText: 'Flan napolitano' })
  await expect(flan).toContainText('Grande, $360')
  await expect(flan).toContainText('Individual, $35')
  await expect(desserts(page).getByRole('article').filter({ hasText: 'Mosaico con crema' })).toContainText('Solo en vitrina')
  await expect(desserts(page).getByRole('link', { name: 'Ver detalle: Imposible' })).toHaveAttribute('href', '/pasteles/imposible')

  // No hay tarjeta del pastel mini (cada ficha ya ofrece la presentación Mini): solo las 5 de los pasteles.
  await expect(cakes(page).getByRole('listitem')).toHaveCount(4)
  // "Realizar pedido" va en el encabezado.
  await expect(page.getByRole('region', { name: 'Catálogo' }).getByRole('link', { name: 'Realizar pedido' })).toHaveAttribute('href', '/pedido')
})

test('the cake sliced today says "Rebanado hoy", next to "En vitrina hoy" when a mini of it is there too', async ({ page }) => {
  const sliced: Record<string, { sliced_today: boolean; in_showcase_today: boolean }> = {
    'tres-leches-de-fresa': { sliced_today: true, in_showcase_today: false },
    'tres-leches-de-durazno': { sliced_today: true, in_showcase_today: true },
    imposible: { sliced_today: true, in_showcase_today: false },
  }
  await mockProducts(page, { cards: productCards.map((card) => ({ ...card, ...sliced[card.slug] })) })
  await page.goto('/catalogo')
  const card = (name: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) })
  await expect(card('Tres leches de fresa')).toContainText('Rebanado hoy')
  await expect(card('Tres leches de fresa')).not.toContainText('En vitrina hoy')
  await expect(card('Tres leches de durazno')).toContainText('En vitrina hoy')
  await expect(card('Tres leches de durazno')).toContainText('Rebanado hoy')
  await expect(card('Imposible')).toContainText('Rebanado hoy')
  await expect(card('Choco-pingüino')).not.toContainText('Rebanado hoy')
  await expect(page.getByText('Rebanado hoy')).toHaveCount(3)
})

test('no filters, no search and no "¿No encuentras el pastel que imaginas?" band; old filter links show everything (tanda 1)', async ({ page }) => {
  await mockProducts(page)
  await page.goto('/catalogo?categoria=postres&buscar=durazno')
  await expect(cardNames(cakes(page))).toHaveCount(4)
  await expect(cardNames(desserts(page)).first()).toBeVisible()
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(0)
  await expect(page.getByTestId('filtros-catalogo')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '¿No encuentras el pastel que imaginas?' })).toHaveCount(0)
  // Tampoco el pastel de esa banda; desde la tanda 6 el encabezado lleva el dibujo de los pisos (`catalog-header.spec.ts`).
  await expect(page.getByTestId('pastel-imaginas')).toHaveCount(0)
})

test('while loading: the skeleton, aria-busy and a message for screen readers', async ({ page }) => {
  await mockProducts(page, { responses: ['hang'] })
  await page.goto('/catalogo')
  await expect(page.locator('[aria-busy="true"] [data-esqueleto]').first()).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Cargando el catálogo…' })).toBeAttached()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo')
})

test('a failed load shows the error with a retry that works', async ({ page }) => {
  await mockProducts(page, { responses: [{ status: 500, body: { detail: 'error' } }, { status: 500, body: { detail: 'error' } }, { status: 200, body: [] }] })
  await page.goto('/catalogo')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('No se pudo cargar el catálogo')
  // StrictMode puede haber gastado la segunda respuesta; un reintento más llega a la buena.
  await alert.getByRole('button', { name: 'Volver a intentar' }).click()
  if (await page.getByRole('alert').isVisible()) await page.getByRole('alert').getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Por ahora no hay productos en el catálogo.' })).toBeVisible()
})

test.describe('on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('one column of cakes, two of desserts, and nothing overflows', async ({ page }) => {
    await mockProducts(page)
    await page.goto('/catalogo')
    await expect(cardNames(cakes(page))).toHaveCount(4)
    const [first, second] = await cakes(page).getByRole('article').all()
    expect((await second.boundingBox())!.y).toBeGreaterThan((await first.boundingBox())!.y + 100)
    const [d1, d2] = await desserts(page).getByRole('article').all()
    expect(Math.abs((await d1.boundingBox())!.y - (await d2.boundingBox())!.y)).toBeLessThan(2)
    // Nada se sale de la pantalla.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

test('there is no "Pastel mini", "Tres leches de nuez" or "Red velvet" card, and the heading counts what is shown', async ({ page }) => {
  await mockProducts(page)
  await page.goto('/catalogo')
  await expect(cakes(page)).toContainText('4 pasteles')
  await expect(page.getByRole('heading', { level: 3, name: 'Pastel mini' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Diseña tu pastel mini' })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 3, name: 'Tres leches de nuez' })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 3, name: 'Red velvet' })).toHaveCount(0)
  await expect(cakes(page).getByRole('listitem')).toHaveCount(4)
})

test('a cake without a price says "[Precio por confirmar]" (tanda 2)', async ({ page }) => {
  // La API ya no entrega la nuez (la `0061` la desactiva), pero una tarjeta con precio PENDIENTE sigue dibujándose así.
  await mockProducts(page, { cards: [...productCards, { ...nuezCard, slug: 'pastel-sin-precio', name: 'Pastel sin precio' }] })
  await page.goto('/catalogo')
  const pending = cakes(page).getByRole('article').filter({ hasText: 'Pastel sin precio' })
  await expect(pending).toContainText('[Precio por confirmar]')
  await expect(pending).not.toContainText('$')
})
