import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { mockProducts } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * El encabezado del catálogo (tanda 6): el dibujo de línea del pastel de pisos (`assets/motivos/dibujo-pisos.svg`) como la
 * vitrina y las rebanadas, en lugar del pastel 3D. Sin lienzo y sin pedir la escena: el chunk de three no se carga en `/catalogo`.
 */

const header = (page: Page) => page.getByRole('region', { name: 'Catálogo', exact: true })
const drawing = (page: Page) => header(page).locator('svg[aria-hidden="true"]')

/**
 * Abre el catálogo y anota las peticiones de la escena 3D: los módulos de `src/three/` y las dependencias de three, que van en el
 * chunk diferido (D48). `HeroCake` y `useHeroCake` sí llegan en desarrollo: la portada y el acceso los importan sin diferir.
 */
async function openCatalog(page: Page) {
  const sceneRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/src/three/') || /\/deps\/(three|@react-three)/.test(url)) sceneRequests.push(url)
  })
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
  await mockProducts(page)
  await page.goto('/catalogo')
  await expect(page.getByRole('region', { name: 'Pasteles', exact: true }).getByRole('article').first()).toBeVisible()
  return sceneRequests
}

test.describe('at 1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the header keeps its copy and actions and shows the tiered-cake drawing, with no 3D scene', async ({ page }) => {
    const sceneRequests = await openCatalog(page)
    await expect(header(page).getByRole('heading', { level: 1 })).toHaveText('Catálogo')
    await expect(header(page).getByRole('navigation')).toContainText('Inicio')
    await expect(header(page)).toContainText('Cualquier sabor se puede pedir en seco o envinado al personalizarlo.')
    await expect(header(page).getByRole('link', { name: 'Realizar pedido' })).toHaveAttribute('href', '/pedido')
    await expect(header(page)).toContainText(/Pedidos con \d+ días? de anticipación\./)

    // Un solo dibujo, el de los pisos, de 112 px y al 30 % (libro de marca, "Dibujos de línea").
    await expect(drawing(page)).toHaveCount(1)
    await expect(drawing(page)).toBeVisible()
    await expect(drawing(page).locator('path[d="M16 36q4 4 8 0t8 0 8 0 8 0M22 24q2.5 3 5 0t5 0 5 0 5 0M32 22v-8M10 54h44"]')).toHaveCount(1)
    const box = (await drawing(page).boundingBox())!
    expect([box.width, box.height]).toEqual([112, 112])
    await expect(drawing(page)).toHaveCSS('opacity', '0.3')
    // Alineado al borde derecho de la columna de 1200 px (24 px de margen) y centrado en vertical en el encabezado.
    expect(Math.round(box.x + box.width)).toBe(120 + 1200 - 24)
    const section = (await header(page).boundingBox())!
    expect(Math.abs(box.y + box.height / 2 - (section.y + section.height / 2))).toBeLessThanOrEqual(1)

    // Sin pastel 3D: ni lienzo, ni la escena con su nombre, ni su respaldo fijo, ni el chunk de three.
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Pastel de tres pisos' })).toHaveCount(0)
    await expect(page.getByTestId('pastel-catalogo')).toHaveCount(0)
    await page.waitForTimeout(500)
    expect(sceneRequests).toEqual([])
  })
})

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the drawing hides, there is still no canvas and nothing overflows', async ({ page }) => {
    await openCatalog(page)
    await expect(drawing(page)).toBeHidden()
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(header(page).getByRole('link', { name: 'Realizar pedido' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
