import { expect, test } from '@playwright/test'
import { mockCakeDesignOptions, mockCakeDesignPrice } from './support/cake-design.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * El encabezado de "Diseña tu pastel" (22 de noviembre): sin migas, como `/pedido`. "Realizar pedido" ya está marcado en la barra,
 * que dice dónde estás. La API se simula.
 */

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await mockCakeDesignOptions(page)
  await mockCakeDesignPrice(page)
})

for (const width of [1440, 390]) {
  test(`at ${width} px the header has only the title and its line, with no breadcrumbs`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/pedido/disena')
    await expect(page.getByRole('heading', { level: 1, name: 'Diseña tu pastel' })).toBeVisible()
    await expect(page.getByText('Elige paso a paso.')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Ruta' })).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('link', { name: 'Inicio', exact: true })).toHaveCount(0)
  })
}
