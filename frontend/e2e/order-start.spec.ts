import { expect, test } from '@playwright/test'
import { fullStoreInfo, mockStoreInfo } from './support/store-info.ts'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

test('/pedido shows both choices with their texts and links', async ({ page }) => {
  await page.goto('/pedido')
  await expect(page.getByRole('heading', { level: 1, name: 'Realizar pedido' })).toBeVisible()
  await expect(page.getByText('Elige cómo quieres encargar tu pastel.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Ruta' }).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/')

  const design = page.getByRole('region', { name: 'Diseña tu pastel' })
  await expect(design.getByText('Precio al momento', { exact: true })).toBeVisible()
  await expect(design.getByRole('link', { name: 'Empezar a diseñar' })).toHaveAttribute('href', '/pedido/disena')

  const reference = page.getByRole('region', { name: 'Envía una foto de referencia' })
  await expect(reference.getByText('Cotización en máximo 1 hora')).toBeVisible()
  await expect(reference.getByRole('link', { name: 'Enviar referencia' })).toHaveAttribute('href', '/pedido/referencia')
  await expect(page.getByTestId('pastel-portada')).toHaveCount(0)
  await expect(page.getByTestId('pastel-portada-fijo')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('the lead days of "Diseña tu pastel" come from the store settings', async ({ page }) => {
  await mockStoreInfo(page, { ...fullStoreInfo, custom_lead_days: 3 })
  await page.goto('/pedido')
  const design = page.getByRole('region', { name: 'Diseña tu pastel' })
  await expect(design).toContainText('Se pide con 3 días de anticipación.')
  await expect(design).not.toContainText('2 días')
})

test('without lead days "Diseña tu pastel" shows the pending marker', async ({ page }) => {
  await mockStoreInfo(page, { ...fullStoreInfo, custom_lead_days: null })
  await page.goto('/pedido')
  await expect(page.getByRole('region', { name: 'Diseña tu pastel' })).toContainText('Se pide con [días por confirmar] de anticipación.')
})

test('the "Realizar pedido" link of the menu leads to the choices', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('banner').getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Realizar pedido' }).click()
  await expect(page).toHaveURL(/\/pedido$/)
  await expect(page.getByRole('region', { name: 'Diseña tu pastel' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Envía una foto de referencia' })).toBeVisible()
})

test('each choice is reachable and activated with the keyboard', async ({ page }) => {
  await page.goto('/pedido')
  const start = page.getByRole('link', { name: 'Empezar a diseñar' })
  const send = page.getByRole('link', { name: 'Enviar referencia' })
  await start.focus()
  await expect(start).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(send).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/pedido\/referencia/)
})

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the cards stack and the page does not scroll sideways', async ({ page }) => {
    await page.goto('/pedido')
    const first = (await page.getByRole('region', { name: 'Diseña tu pastel' }).boundingBox())!
    const second = (await page.getByRole('region', { name: 'Envía una foto de referencia' }).boundingBox())!
    expect(second.y).toBeGreaterThan(first.y + first.height - 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test('at 1440px the cards sit side by side', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/pedido')
  const first = (await page.getByRole('region', { name: 'Diseña tu pastel' }).boundingBox())!
  const second = (await page.getByRole('region', { name: 'Envía una foto de referencia' }).boundingBox())!
  expect(second.x).toBeGreaterThan(first.x + first.width - 1)
  expect(Math.abs(second.y - first.y)).toBeLessThan(2)
})
