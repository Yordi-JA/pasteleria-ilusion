/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCatalog } from './support/catalog.ts'
import { fullStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * La portada (tanda 6): el pastel de dos pisos de la marca (`viewmodels/homeCake.ts`, sin pedir nada a la API) y el logo de la
 * barra, que no se ve junto al logotipo grande. Las conductas de la escena (giro, arrastre, flechas, pausa, contexto perdido) las
 * prueba `hero-cake.spec.ts`.
 */
test.use({ deviceScaleFactor: 1 })

async function openHome(page: Page) {
  await mockStoreInfo(page, fullStoreInfo)
  await mockCatalog(page)
  await page.goto('/')
}

test('the hero draws the chosen cake: two combed tiers with roses, on the black board', async ({ page }) => {
  await openHome(page)
  const scene = page.getByRole('img', { name: 'Pastel de dos pisos', exact: true })
  await expect(page.getByTestId('pastel-portada')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
  await expect(scene).toHaveAttribute('data-tiers', '2')
  await expect(scene).toHaveAttribute('data-decoration', 'roses')
  await expect(scene).toHaveAttribute('data-board', 'true')
  await expect(page.getByRole('img', { name: 'Pastel de tres pisos' })).toHaveCount(0)
})

test('while the scene loads there is a skeleton; the still drawing, when the scene cannot load, has two tiers in the cream of the cake', async ({ page }) => {
  await page.route('**/src/three/**', () => {})
  await openHome(page)
  await expect(page.getByTestId('pastel-portada-cargando')).toBeVisible()
  await expect(page.getByTestId('pastel-portada-fijo')).toBeHidden()
  // El chunk que falla deja el dibujo fijo.
  await page.unroute('**/src/three/**')
  await page.route('**/src/three/CakeScene.tsx*', (route) => route.abort())
  await page.reload()
  const still = page.getByTestId('pastel-portada-fijo')
  await expect(still).toBeVisible()
  await expect(page.getByTestId('pastel-portada-cargando')).toBeHidden()
  await expect(still.locator('rect')).toHaveCount(2)
  for (const rect of await still.locator('rect').all()) await expect(rect).toHaveClass(/fill-betun/)
})

test('the cake model: combed betun tiers, the bottom one wider, roses with green leaves', async ({ page }) => {
  await openHome(page)
  // La ruta va como dato: el navegador importa el módulo del servidor de Vite (como `catalog-model.spec.ts`).
  const shape = await page.evaluate(async (url) => (await import(url)).HOME_CAKE, '/src/viewmodels/homeCake.ts')
  expect(shape.tiers).toHaveLength(2)
  expect(shape.tiers.map((tier: { frosting: string }) => tier.frosting)).toEqual(['betun', 'betun'])
  expect(shape.tiers.every((tier: { comb?: object }) => tier.comb)).toBe(true)
  expect(shape.tiers[0].radius).toBeGreaterThan(shape.tiers[1].radius)
  expect(shape.decoration).toMatchObject({ kind: 'roses', leaf: 'exito' })
  expect(shape.stand).toBe(false)
  expect(shape.board).toBeTruthy()
  expect(shape.topping).toBeUndefined()
})

test.describe('header logo on the home page', () => {
  const barLogo = (page: Page) => page.getByTestId('logo-barra')
  const bigLogo = (page: Page) => page.locator('#portada-titulo img')

  test('at desktop width the bar starts without its logo and shows it once the big logo is gone', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openHome(page)
    await expect(bigLogo(page)).toBeVisible()
    await expect(barLogo(page)).toBeHidden()
    await expect(barLogo(page)).toHaveCSS('visibility', 'hidden')
    // La navegación, la cuenta y el carrito sí están.
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
    await expect(page.getByRole('banner').getByRole('link', { name: /^Carrito/ })).toBeVisible()
    const logoBottom = await bigLogo(page).evaluate((img) => img.getBoundingClientRect().bottom + window.scrollY)
    await page.evaluate((y) => window.scrollTo(0, y), Math.ceil(logoBottom))
    await expect(barLogo(page)).toBeVisible()
    await expect(barLogo(page)).toHaveCSS('opacity', '1')
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(barLogo(page)).toBeHidden()
  })

  test('while hidden, the bar logo is not reachable with the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openHome(page)
    await expect(barLogo(page)).toBeHidden()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused()
    await page.keyboard.press('Tab')
    // Del enlace para saltar se pasa directo a la navegación, sin detenerse en el logo invisible.
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link').first()).toBeFocused()
    await expect(page.getByRole('link', { name: 'Pastelería Ilusión, inicio' })).toHaveCount(0)
  })

  test('a focused bar logo is never hidden, even if the page scrolls back to the top', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openHome(page)
    const logoBottom = await bigLogo(page).evaluate((img) => img.getBoundingClientRect().bottom + window.scrollY)
    await page.evaluate((y) => window.scrollTo(0, y), Math.ceil(logoBottom))
    await expect(barLogo(page)).toBeVisible()
    // Del primer enlace de la navegación, Mayús+Tab llega al logo por teclado.
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link').first().focus()
    await page.keyboard.press('Shift+Tab')
    await expect(barLogo(page)).toBeFocused()
    await page.evaluate(() => window.scrollTo(0, 0))
    // Tiempo para que el observador responda y la transición de 200 ms termine.
    await page.waitForTimeout(600)
    await expect(barLogo(page)).toHaveCSS('visibility', 'visible')
    await expect(barLogo(page)).toHaveCSS('opacity', '1')
    await expect(barLogo(page)).toBeFocused()
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('logo-barra')
  })

  test('with motion the big logo travels to the bar instead of a fade; with reduced motion it changes at once', async ({ page }) => {
    // D90: en escritorio el logotipo grande viaja a la barra (`home-header-morph.spec.ts`), así que el logo de la barra no se
    // desvanece: aparece cuando llega. Con "reducir movimiento" sigue lo de la tanda 6, sin transición.
    await page.setViewportSize({ width: 1440, height: 900 })
    await openHome(page)
    await expect(page.getByTestId('logo-viaje')).toBeAttached()
    await expect(barLogo(page)).toHaveCSS('transition-duration', '0s')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByTestId('logo-viaje')).toHaveCount(0)
    await expect(barLogo(page)).toHaveCSS('transition-property', 'none')
  })

  test('at 390 px the big logo is not shown and the bar logo always is', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openHome(page)
    await expect(bigLogo(page)).toBeHidden()
    await expect(barLogo(page)).toBeVisible()
    await expect(barLogo(page)).toHaveCSS('opacity', '1')
    // El menú móvil sobre la portada sigue funcionando.
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await expect(page.locator('#menu-sitio')).toBeVisible()
  })

  test('on other pages the bar logo is always there', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openHome(page)
    await expect(barLogo(page)).toBeHidden()
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Vitrina' }).click()
    await expect(page).toHaveURL(/\/vitrina$/)
    await expect(barLogo(page)).toBeVisible()
    await page.goto('/pedido')
    await expect(barLogo(page)).toBeVisible()
  })
})
