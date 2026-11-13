import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { mockProducts } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * `/catalogo` (D59). La API se simula (`support/products.ts`): la lista filtra y busca como el backend. Escritorio
 * (1440 px) salvo donde se dice.
 */

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
})

/** El chip visible: el radio va oculto dentro de su etiqueta, y el cliente toca la etiqueta. */
const chip = (page: Page, name: string) => page.getByTestId('filtros-catalogo').locator('label').filter({ hasText: name })
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Buscar en el catálogo' })
const results = (page: Page) => page.getByTestId('resultados-catalogo')
const cakes = (page: Page) => page.getByRole('region', { name: 'Pasteles', exact: true })
const desserts = (page: Page) => page.getByRole('region', { name: 'Postres y gelatinas', exact: true })
const cardNames = (region: ReturnType<typeof cakes>) => region.getByRole('heading', { level: 3 })
/** Las búsquedas que llegaron a la API (sin la carga inicial sin término). */
const searches = (requests: URL[]) => requests.map((url) => url.searchParams.get('search')).filter((term): term is string => term !== null)

test('lists cakes and desserts with their counts, tags, prices and links to the product page', async ({ page }) => {
  await mockProducts(page)
  await page.goto('/catalogo')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo')
  await expect(page).toHaveTitle('Catálogo · Pastelería Ilusión')
  await expect(cardNames(cakes(page))).toHaveText(['Tres leches de durazno', 'Tres leches de fresa', 'Tres leches con queso y zarzamora', 'Choco-pingüino', 'Red velvet'])
  await expect(cakes(page)).toContainText('5 pasteles')
  await expect(cardNames(desserts(page))).toHaveText(['Imposible', 'Flan napolitano', 'Mosaico con crema'])
  await expect(desserts(page)).toContainText('3 postres')
  await expect(results(page)).toHaveText('5 pasteles y 3 postres.')

  const durazno = cakes(page).getByRole('article').filter({ hasText: 'Tres leches de durazno' })
  await expect(durazno).toContainText('Tres leches')
  await expect(durazno).toContainText('En vitrina hoy')
  await expect(durazno).toContainText('$350')
  await expect(durazno).toContainText('$35 la rebanada')
  await expect(durazno.getByRole('img', { name: 'Foto del pastel pendiente' })).toBeVisible()
  await expect(durazno.getByRole('link', { name: 'Ver pastel: Tres leches de durazno' })).toHaveAttribute('href', '/pasteles/tres-leches-de-durazno')

  // Red velvet: solo por encargo, sin "En vitrina hoy", con el precio por kilo de su pan (de las opciones).
  const redVelvet = cakes(page).getByRole('article').filter({ hasText: 'Red velvet' })
  await expect(redVelvet).toContainText('Seco, solo por encargo')
  await expect(redVelvet).toContainText('Por pedido, $280 por kg')
  // Los postres: el grande con su nombre, el vaso "Solo en vitrina" y "Ver detalle".
  const flan = desserts(page).getByRole('article').filter({ hasText: 'Flan napolitano' })
  await expect(flan).toContainText('Grande, $360')
  await expect(flan).toContainText('Individual, $35')
  await expect(desserts(page).getByRole('article').filter({ hasText: 'Mosaico con crema' })).toContainText('Solo en vitrina')
  await expect(desserts(page).getByRole('link', { name: 'Ver detalle: Imposible' })).toHaveAttribute('href', '/pasteles/imposible')

  // El mini se anuncia aparte, con su precio de la API.
  await expect(cakes(page)).toContainText('Pastel mini, $130')
  // La sección destacada lleva a realizar un pedido.
  const band = page.getByRole('region', { name: '¿No encuentras el pastel que imaginas?' })
  await expect(band.getByRole('link', { name: 'Realizar pedido' })).toHaveAttribute('href', '/pedido')
})

test('the category chips filter through the URL and the back button restores them', async ({ page }) => {
  const requests = await mockProducts(page)
  await page.goto('/catalogo')
  await expect(cardNames(desserts(page))).toHaveCount(3)

  await chip(page, 'Pasteles').click()
  await expect(page).toHaveURL(/\/catalogo\?categoria=pasteles$/)
  await expect.poll(() => requests.at(-1)?.searchParams.get('category')).toBe('cake')
  await expect(desserts(page)).toHaveCount(0)
  await expect(cardNames(cakes(page))).toHaveCount(5)
  await expect(results(page)).toHaveText('5 pasteles.')

  await chip(page, 'Postres').click()
  await expect(page).toHaveURL(/\?categoria=postres$/)
  await expect(cakes(page)).toHaveCount(0)
  await expect(cardNames(desserts(page))).toHaveCount(3)

  // Dos chips seguidos dejan una sola entrada: atrás vuelve a Todo.
  await page.goBack()
  await expect(page).toHaveURL(/\/catalogo$/)
  await expect(page.getByRole('radio', { name: 'Todo' })).toBeChecked()
  await expect(cardNames(desserts(page))).toHaveCount(3)
})

test('the search waits for the typing to stop, asks the API once and keeps the term in the URL', async ({ page }) => {
  const requests = await mockProducts(page)
  await page.goto('/catalogo')
  await expect(cardNames(cakes(page))).toHaveCount(5)

  await searchBox(page).pressSequentially('durazno', { delay: 40 })
  await expect(page).toHaveURL(/\?buscar=durazno$/)
  await expect(cardNames(cakes(page))).toHaveText(['Tres leches de durazno'])
  await expect(desserts(page)).toHaveCount(0)
  await expect(results(page)).toHaveText('1 pastel para «durazno».')
  // Ninguna petición por tecla: solo la del término completo.
  expect(searches(requests)).toEqual(['durazno'])

  // Con la búsqueda y un chip, los dos van en la URL, y el enlace se puede abrir tal cual.
  await chip(page, 'Pasteles').click()
  await expect(page).toHaveURL(/\?buscar=durazno&categoria=pasteles$/)
  await page.goto('/catalogo?categoria=postres&buscar=flan')
  await expect(searchBox(page)).toHaveValue('flan')
  await expect(page.getByRole('radio', { name: 'Postres' })).toBeChecked()
  await expect(cardNames(desserts(page))).toHaveText(['Imposible', 'Flan napolitano'])
})

test('Enter searches right away, without waiting', async ({ page }) => {
  const requests = await mockProducts(page)
  await page.goto('/catalogo')
  await searchBox(page).fill('fresa')
  await searchBox(page).press('Enter')
  await expect(page).toHaveURL(/\?buscar=fresa$/)
  await expect(cardNames(cakes(page))).toHaveText(['Tres leches de fresa'])
  expect(searches(requests)).toEqual(['fresa'])
})

test('a slow old answer never replaces a newer search', async ({ page }) => {
  const requests = await mockProducts(page, { delays: { durazno: 1500 } })
  await page.goto('/catalogo')
  await expect(cardNames(cakes(page))).toHaveCount(5)

  await searchBox(page).fill('durazno')
  await searchBox(page).press('Enter')
  // La petición lenta ya salió; mientras tarda, se busca otra cosa.
  await expect.poll(() => searches(requests)).toEqual(['durazno'])
  await searchBox(page).fill('fresa')
  await searchBox(page).press('Enter')
  await expect(cardNames(cakes(page))).toHaveText(['Tres leches de fresa'])
  // Ya pasó la respuesta lenta de "durazno": no cambió nada.
  await page.waitForTimeout(1800)
  await expect(cardNames(cakes(page))).toHaveText(['Tres leches de fresa'])
  await expect(page).toHaveURL(/\?buscar=fresa$/)
})

test('without results it says so, and "Borrar búsqueda" brings the catalog back', async ({ page }) => {
  await mockProducts(page)
  await page.goto('/catalogo?categoria=pasteles')
  await searchBox(page).fill('mango')
  await expect(page.getByRole('heading', { level: 2, name: 'No encontramos «mango» en los pasteles.' })).toBeVisible()
  await expect(results(page)).toHaveText('No encontramos «mango» en los pasteles.')

  await page.getByRole('button', { name: 'Buscar en todo el catálogo' }).click()
  await expect(page).toHaveURL(/\?buscar=mango$/)
  await expect(page.getByRole('heading', { level: 2, name: 'No encontramos «mango» en el catálogo.' })).toBeVisible()

  await page.getByRole('button', { name: 'Borrar búsqueda' }).click()
  await expect(page).toHaveURL(/\/catalogo$/)
  await expect(searchBox(page)).toHaveValue('')
  await expect(searchBox(page)).toBeFocused()
  await expect(cardNames(cakes(page))).toHaveCount(5)
})

test('the search term is capped at 80 characters, also when it comes in the URL', async ({ page }) => {
  const requests = await mockProducts(page)
  await page.goto(`/catalogo?buscar=${'a'.repeat(120)}`)
  await expect(searchBox(page)).toHaveAttribute('maxlength', '80')
  await expect(searchBox(page)).toHaveValue('a'.repeat(80))
  await expect.poll(() => searches(requests).at(-1)?.length).toBe(80)
})

test('while loading: the skeleton, aria-busy and a message for screen readers; the filters stay usable', async ({ page }) => {
  await mockProducts(page, { responses: ['hang'] })
  await page.goto('/catalogo')
  await expect(page.locator('[aria-busy="true"] [data-esqueleto]').first()).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Cargando el catálogo…' })).toBeAttached()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo')
  await expect(searchBox(page)).toBeEditable()
  await expect(page.getByRole('radio', { name: 'Pasteles' })).toBeEnabled()
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

test('back after typing restores the previous term in the field', async ({ page }) => {
  await mockProducts(page)
  await page.goto('/catalogo?buscar=dur')
  await expect(cardNames(cakes(page))).toHaveText(['Tres leches de durazno'])
  await chip(page, 'Pasteles').click()
  await expect(page).toHaveURL(/\?buscar=dur&categoria=pasteles$/)
  // Escribe y vuelve atrás antes de que pase la espera de 300 ms.
  await searchBox(page).press('End')
  await searchBox(page).press('a')
  await page.goBack()
  await expect(page).toHaveURL(/\/catalogo\?buscar=dur$/)
  await expect(searchBox(page)).toHaveValue('dur')
  // La espera vieja no reescribe la entrada a la que se volvió.
  await page.waitForTimeout(600)
  await expect(page).toHaveURL(/\/catalogo\?buscar=dur$/)
  await expect(searchBox(page)).toHaveValue('dur')
})

test('arrow keys across chips leave one history entry', async ({ page }) => {
  await mockProducts(page)
  await page.goto('/catalogo')
  await expect(cardNames(cakes(page))).toHaveCount(5)
  await page.getByRole('radio', { name: 'Todo' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/\?categoria=pasteles$/)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/\?categoria=postres$/)
  // Atrás no se detiene en "Pasteles", que solo se cruzó con las flechas.
  await page.goBack()
  await expect(page).toHaveURL(/\/catalogo$/)
  await expect(page.getByRole('radio', { name: 'Todo' })).toBeChecked()
})

test('a chip after coming back from a product starts a new history entry', async ({ page }) => {
  await mockProducts(page)
  await page.goto('/catalogo')
  await expect(cardNames(cakes(page))).toHaveCount(5)
  await chip(page, 'Postres').click()
  await expect(page).toHaveURL(/\?categoria=postres$/)
  await desserts(page).getByRole('link', { name: 'Ver detalle: Imposible' }).click()
  await expect(page).toHaveURL('/pasteles/imposible')
  await page.goBack()
  await expect(page).toHaveURL(/\?categoria=postres$/)
  await expect(cardNames(desserts(page))).toHaveCount(3)
  // Volver con atrás termina la racha de chips: este chip agrega su propia entrada.
  await chip(page, 'Pasteles').click()
  await expect(page).toHaveURL(/\?categoria=pasteles$/)
  await page.goBack()
  await expect(page).toHaveURL(/\?categoria=postres$/)
  await expect(page.getByRole('radio', { name: 'Postres' })).toBeChecked()
})

test('the filter bar stays at the top while scrolling', async ({ page }) => {
  await mockProducts(page)
  await page.goto('/catalogo')
  await expect(cardNames(cakes(page))).toHaveCount(5)
  await page.mouse.wheel(0, 1500)
  const bar = page.getByTestId('filtros-catalogo')
  await expect.poll(async () => (await bar.boundingBox())!.y).toBeCloseTo(100, 0)
  const header = (await page.getByTestId('barra').boundingBox())!
  expect((await bar.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height)
})

test.describe('on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('one column of cakes, two of desserts, and the search fits the width', async ({ page }) => {
    await mockProducts(page)
    await page.goto('/catalogo')
    await expect(cardNames(cakes(page))).toHaveCount(5)
    const [first, second] = await cakes(page).getByRole('article').all()
    expect((await second.boundingBox())!.y).toBeGreaterThan((await first.boundingBox())!.y + 100)
    const [d1, d2] = await desserts(page).getByRole('article').all()
    expect(Math.abs((await d1.boundingBox())!.y - (await d2.boundingBox())!.y)).toBeLessThan(2)
    const box = (await searchBox(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(16)
    expect(box.x + box.width).toBeLessThanOrEqual(390 - 16 + 1)
    // Nada se sale de la pantalla.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
