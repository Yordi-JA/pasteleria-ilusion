import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { emptyStoreInfo, hangStoreInfo, mockStoreInfo } from './support/store-info.ts'

test.use({ viewport: { width: 390, height: 844 } })

const menuButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Abrir menú' })
const menu = (page: Page) => page.getByRole('dialog', { name: 'Menú' })
const rootOverflow = (page: Page) =>
  page.locator('html').evaluate((el) => el.ownerDocument.defaultView!.getComputedStyle(el).overflow)
const focusInMenu = (page: Page) => page.locator('#menu-sitio').evaluate((el) => el.contains(el.ownerDocument.activeElement))

async function openMenu(page: Page) {
  await menuButton(page).click()
  await expect(menu(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/')
})

test('at 390px the bar shows the menu button instead of the links', async ({ page }) => {
  await expect(page.getByRole('banner').getByRole('navigation', { name: 'Principal' })).toBeHidden()
  await expect(menuButton(page)).toBeVisible()
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(menuButton(page)).toHaveAttribute('aria-controls', 'menu-sitio')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Cuenta' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Carrito' })).toBeVisible()
  const height = (await menuButton(page).boundingBox())!.height
  expect(height).toBeGreaterThanOrEqual(44)
  const logo = (await page.getByRole('banner').getByRole('img', { name: 'Pastelería Ilusión, inicio' }).boundingBox())!
  expect(logo.width).toBeGreaterThanOrEqual(120)
  const awning = (await page.getByTestId('toldo').boundingBox())!
  const bar = (await page.getByTestId('barra').boundingBox())!
  expect(bar.y - (awning.y + awning.height)).toBeCloseTo(12, 0)
})

test('opening the menu: content of capture 020, focus inside and the page does not scroll', async ({ page }) => {
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'true')
  const dialog = menu(page)
  await expect(dialog).toHaveAttribute('id', 'menu-sitio')
  await expect(dialog.getByRole('navigation', { name: 'Principal' }).getByRole('link')).toHaveText([
    'Catálogo',
    'Vitrina',
    'Rebanadas de hoy',
  ])
  await expect(dialog.getByRole('link', { name: 'Realizar pedido' })).toHaveAttribute('href', '/pedido')
  await expect(dialog.getByRole('link', { name: 'Iniciar sesión o crear cuenta' })).toHaveAttribute('href', '/entrar')
  await expect(dialog).toContainText('Pedidos con 2 días de anticipación')
  await expect(dialog.getByRole('link', { name: /Escribir por WhatsApp \+520000000000/ })).toHaveAttribute(
    'href',
    'https://wa.me/520000000000',
  )
  await expect(dialog).toHaveCSS('box-shadow', /rgba\(94, 25, 33/)
  await expect(dialog.getByRole('button', { name: 'Cerrar menú' })).toBeFocused()
  expect(await rootOverflow(page)).toBe('hidden')
})

test('Tab stays inside the open menu', async ({ page }) => {
  await openMenu(page)
  const controls = await menu(page).locator('a[href], button').count()
  for (let i = 0; i < controls + 2; i++) {
    await page.keyboard.press('Tab')
    expect(await focusInMenu(page)).toBe(true)
  }
  for (let i = 0; i < controls + 2; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await focusInMenu(page)).toBe(true)
  }
})

test('Escape closes the menu and returns focus to the button', async ({ page }) => {
  await openMenu(page)
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()
  await expect(menuButton(page)).toBeFocused()
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false')
  expect(await rootOverflow(page)).not.toBe('hidden')
})

test('"Cerrar menú" and a click outside close it too', async ({ page }) => {
  await openMenu(page)
  await menu(page).getByRole('button', { name: 'Cerrar menú' }).click()
  await expect(menu(page)).toBeHidden()
  await expect(menuButton(page)).toBeFocused()
  await openMenu(page)
  await page.mouse.click(10, 400)
  await expect(menu(page)).toBeHidden()
})

test('navigating from the menu closes it and moves focus to the new page', async ({ page }) => {
  await openMenu(page)
  // Cuenta cada vez que el botón del menú recibe el foco desde que el menú está abierto (el clic que lo abrió
  // ya no cuenta): al navegar, el foco va directo a <main>.
  const button = page.locator('button[aria-controls="menu-sitio"]')
  await button.evaluate((el) => {
    Reflect.set(el, '__focusCount', 0)
    el.addEventListener('focus', () => Reflect.set(el, '__focusCount', Reflect.get(el, '__focusCount') + 1))
  })
  await menu(page).getByRole('link', { name: 'Vitrina' }).click()
  await expect(page).toHaveURL('/vitrina')
  await expect(menu(page)).toBeHidden()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vitrina')
  await expect(page.locator('main#contenido')).toBeFocused()
  expect(await rootOverflow(page)).not.toBe('hidden')
  expect(await button.evaluate((el) => Reflect.get(el, '__focusCount'))).toBe(0)
})

test('while loading, the menu box is busy with one loading text and no marker', async ({ page }) => {
  await page.unroute('**/api/v1/store/info/')
  await hangStoreInfo(page)
  await page.reload()
  await openMenu(page)
  const box = menu(page).locator('[aria-busy="true"]')
  await expect(box).toHaveCount(1)
  await expect(box.getByText('Cargando datos de la pastelería')).toHaveCount(1)
  await expect(menu(page).locator('[data-pendiente]')).toHaveCount(0)
})

test('without a WhatsApp number the menu shows the marker and no link', async ({ page }) => {
  await page.unroute('**/api/v1/store/info/')
  await mockStoreInfo(page, emptyStoreInfo)
  await page.reload()
  await openMenu(page)
  await expect(menu(page)).toContainText('Pedidos con [días por confirmar] de anticipación')
  await expect(menu(page).getByText('Escribir por WhatsApp [número por confirmar]')).toBeVisible()
  await expect(menu(page).locator('a[href*="wa.me"]')).toHaveCount(0)
})

test.describe('between 601 and 767px', () => {
  test.use({ viewport: { width: 700, height: 900 } })

  test('the links move into the menu instead of wrapping, and the strip keeps WhatsApp', async ({ page }) => {
    await expect(page.getByRole('banner').getByRole('navigation', { name: 'Principal' })).toBeHidden()
    await expect(menuButton(page)).toBeVisible()
    await expect(page.getByTestId('franja')).toContainText('WhatsApp +520000000000')
    await expect(page.getByTestId('franja').getByText(/WhatsApp/)).toBeVisible()
  })

  test('the open menu closes when the window grows to desktop', async ({ page }) => {
    await openMenu(page)
    await page.setViewportSize({ width: 1024, height: 900 })
    await expect(menu(page)).toBeHidden()
    expect(await rootOverflow(page)).not.toBe('hidden')
    // El botón del menú ya no se ve en escritorio: el foco no se pierde, va a <main>.
    await expect(menuButton(page)).toBeHidden()
    await expect(page.locator('main#contenido')).toBeFocused()
  })
})
