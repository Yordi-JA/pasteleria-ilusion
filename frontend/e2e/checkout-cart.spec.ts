import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { cajetaSlice, designLine, DRAFT_KEY, durazno, quoteDesignLine, seedCart, storedCart } from './support/checkout.ts'
import { mockStoreInfo } from './support/store-info.ts'

/** `/carrito` (D66): cada tipo de línea, cantidades, quitar, la mezcla de vitrina y diseño y el estado vacío. */

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

const products = (page: Page) => page.getByRole('region', { name: 'Productos' })
const summary = (page: Page) => page.getByRole('region', { name: 'Resumen' })
const line = (page: Page, name: string) => products(page).getByRole('listitem').filter({ has: page.getByRole('heading', { name, level: 3 }) })

test('an empty cart says so and offers the showcase and the catalog', async ({ page }) => {
  await page.goto('/carrito')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu carrito')
  await expect(page.getByRole('heading', { level: 2, name: 'Tu carrito está vacío' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver la vitrina' })).toHaveAttribute('href', '/vitrina')
  await expect(page.getByRole('link', { name: 'Ver el catálogo' })).toHaveAttribute('href', '/catalogo')
  // El estado vacío del mockup no lleva los pasos de la compra.
  await expect(page.getByRole('navigation', { name: 'Pasos de tu compra' })).toHaveCount(0)
})

test('a catalog order and a designed cake, with the base deposit apart from the estimate', async ({ page }) => {
  await seedCart(page, [durazno, designLine])
  await page.goto('/carrito')
  const steps = page.getByRole('navigation', { name: 'Pasos de tu compra' })
  await expect(steps.locator('[aria-current="step"]')).toContainText('Carrito')
  const order = line(page, 'Tres leches de durazno')
  await expect(order).toContainText('Por encargo')
  await expect(order).toContainText('$350')
  await expect(order).toContainText('$350 por pieza')
  await expect(order).toContainText('Completo')
  await expect(order.getByRole('link', { name: 'Tres leches de durazno' })).toHaveAttribute('href', '/pasteles/tres-leches-de-durazno')
  await expect(order.getByRole('button', { name: /Editar pedido/ })).toHaveCount(0)
  const cake = line(page, designLine.name)
  await expect(cake).toContainText('$3,825')
  await expect(cake).toContainText('Estimado')
  await expect(cake).toContainText('Pan: Chocolate')
  await expect(cake).toContainText('Incluye base para 15 kg')
  await expect(cake).toContainText('Depósito de $200: te lo devolvemos al regresar la base.')
  await expect(cake.getByRole('button', { name: `Editar pedido: ${designLine.name}` })).toBeVisible()
  await expect(cake.getByRole('group', { name: /Cantidad/ })).toHaveCount(0)
  const resume = summary(page)
  await expect(resume).toContainText('Productos (2)')
  await expect(resume).toContainText('Total estimado del pedido')
  await expect(resume).toContainText('$4,175 MXN')
  await expect(resume).toContainText('Depósito de la base, se devuelve')
  await expect(resume).toContainText('$200')
  await expect(resume).toContainText('Hoy pagas un anticipo del pedido y el depósito de la base; el resto, al entregar.')
  await expect(resume.getByRole('link', { name: 'Continuar a entrega' })).toHaveAttribute('href', '/pedido/entrega')
})

test('quantities change the line and the estimate, and removing a line keeps the focus', async ({ page }) => {
  await seedCart(page, [cajetaSlice, durazno])
  await page.goto('/carrito')
  const slice = line(page, 'Rebanada de tres leches de cajeta')
  await expect(slice).toContainText('En vitrina hoy')
  await expect(slice).toContainText('$70')
  await expect(slice).toContainText('$35 la rebanada')
  await expect(summary(page)).toContainText('Hoy pagas un anticipo del pedido; el resto, al entregar. Lo de la vitrina de hoy se paga completo.')
  await slice.getByRole('button', { name: 'Agregar uno de Rebanada de tres leches de cajeta' }).click()
  await expect(slice).toContainText('$105')
  await expect(summary(page)).toContainText('Productos (4)')
  await expect(summary(page)).toContainText('$455 MXN')
  expect((await storedCart(page)).items[0].quantity).toBe(3)
  // El contador del encabezado sigue al carrito.
  await expect(page.getByRole('banner').getByRole('link', { name: 'Carrito, 4 productos' })).toBeVisible()
  await slice.getByRole('button', { name: 'Quitar uno de Rebanada de tres leches de cajeta' }).click()
  await expect(slice).toContainText('$70')
  await slice.getByRole('button', { name: 'Quitar Rebanada de tres leches de cajeta' }).click()
  await expect(line(page, 'Rebanada de tres leches de cajeta')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Quitaste Rebanada de tres leches de cajeta de tu pedido.' })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 2, name: 'Productos' })).toBeFocused()
  // La última línea: el foco pasa al carrito vacío.
  await line(page, 'Tres leches de durazno').getByRole('button', { name: 'Quitar Tres leches de durazno' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Tu carrito está vacío' })).toBeFocused()
  expect((await storedCart(page)).items).toEqual([])
})

test('only the showcase: today is paid in full', async ({ page }) => {
  await seedCart(page, [cajetaSlice])
  await page.goto('/carrito')
  await expect(summary(page)).toContainText('Hoy pagas todo: lo de la vitrina de hoy se paga completo.')
})

test('the showcase and a designed cake cannot continue together until one goes', async ({ page }) => {
  await seedCart(page, [cajetaSlice, designLine])
  await page.goto('/carrito')
  const resume = summary(page)
  await expect(resume).toContainText('La vitrina de hoy y tu pastel diseñado van en pedidos separados')
  const continueButton = resume.getByRole('button', { name: 'Continuar a entrega' })
  await expect(continueButton).toBeDisabled()
  await expect(continueButton).toHaveAccessibleDescription(/Quita uno de los dos para continuar/)
  await expect(resume.getByRole('link', { name: 'Continuar a entrega' })).toHaveCount(0)
  await line(page, 'Rebanada de tres leches de cajeta').getByRole('button', { name: /^Quitar Rebanada/ }).click()
  await expect(resume.getByRole('link', { name: 'Continuar a entrega' })).toBeVisible()
})

test('two decorations to quote cannot go in one order', async ({ page }) => {
  await seedCart(page, [quoteDesignLine('k1', 'otra1'), quoteDesignLine('k2', 'otra2')])
  await page.goto('/carrito')
  await expect(summary(page)).toContainText('Un pedido lleva una sola decoración por cotizar')
  await expect(summary(page).getByRole('button', { name: 'Continuar a entrega' })).toBeDisabled()
  await expect(summary(page)).toContainText('La decoración por cotizar no está en el total')
  await expect(line(page, quoteDesignLine(null).name).first()).toContainText('En pausa por cotización')
})

test('"Editar pedido" opens the cake in Diseña tu pastel, and asks first over a design in progress', async ({ page }) => {
  await mockCakeDesignOptions(page)
  await seedCart(page, [designLine])
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('__draftSeeded')) {
      sessionStorage.setItem(key, JSON.stringify({ people: 60, cakeType: 'envinado', confirmed: [1] }))
      sessionStorage.setItem('__draftSeeded', '1')
    }
  }, DRAFT_KEY)
  await page.goto('/carrito')
  const cake = line(page, designLine.name)
  await cake.getByRole('button', { name: `Editar pedido: ${designLine.name}` }).click()
  await expect(cake).toContainText('Tienes otro pastel a medias en Diseña tu pastel')
  await expect(cake.getByRole('button', { name: 'Editar este pastel' })).toBeFocused()
  await cake.getByRole('button', { name: 'Seguir en el carrito' }).click()
  await expect(cake).not.toContainText('Tienes otro pastel a medias')
  await cake.getByRole('button', { name: `Editar pedido: ${designLine.name}` }).click()
  await cake.getByRole('button', { name: 'Editar este pastel' }).click()
  await expect(page).toHaveURL(/\/pedido\/disena\?paso=/)
  const draft = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'), DRAFT_KEY)
  expect(draft).toMatchObject({ people: 100, bread: 'chocolate', flavors: ['zarzamora'], decoration: 'flores', messageEnabled: true, replaces: 'pastel15kg' })
  // El pastel sigue en el carrito hasta que se agregue el editado.
  expect((await storedCart(page)).items).toHaveLength(1)
})

test('keyboard: every control is reachable with a visible focus ring', async ({ page }) => {
  await seedCart(page, [durazno])
  await page.goto('/carrito')
  const continueLink = summary(page).getByRole('link', { name: 'Continuar a entrega' })
  for (let i = 0; i < 40 && !(await continueLink.evaluate((element) => element === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(continueLink).toBeFocused()
  const outline = await continueLink.evaluate((element) => getComputedStyle(element).outlineStyle)
  expect(outline).toBe('solid')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('fits 390 px, with the summary after the products and only the current step named', async ({ page }) => {
    await seedCart(page, [durazno, designLine])
    await page.goto('/carrito')
    await expect(summary(page)).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const productsBox = await products(page).boundingBox()
    const summaryBox = await summary(page).boundingBox()
    expect(summaryBox!.y).toBeGreaterThan(productsBox!.y + productsBox!.height - 1)
    // "Entrega" queda solo para el lector de pantalla: su caja mide 1 px.
    const label = page.getByRole('navigation', { name: 'Pasos de tu compra' }).locator('li', { hasText: 'Entrega' }).locator('> span').nth(1)
    expect(await label.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
  })
})
