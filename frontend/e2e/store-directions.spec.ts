import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { accountOrder, mockOrderDetail } from './support/account-orders.ts'
import { signedIn } from './support/auth.ts'
import { durazno, mockCalendar, NOW, seedCart } from './support/checkout.ts'
import { emptyStoreInfo, fullStoreInfo, mockStoreInfo } from './support/store-info.ts'

/**
 * "Cómo llegar" (D71): con la dirección de `store/info/`, un enlace a la búsqueda pública de Google Maps con la
 * dirección codificada, sin llave ni mapa embebido. Sin dirección (PENDIENTE), no hay enlace.
 */

// Una dirección de prueba con coma, punto y acentos, para ver la codificación completa.
const ADDRESS = 'Calle Ficticia 12, Coyoacán, 04369 Ciudad de México'
const MAPS_URL =
  'https://www.google.com/maps/search/?api=1&query=Calle%20Ficticia%2012%2C%20Coyoac%C3%A1n%2C%2004369%20Ciudad%20de%20M%C3%A9xico'
const withAddress = { ...fullStoreInfo, address: ADDRESS }

const footer = (page: Page) => page.getByRole('contentinfo')
const directions = (scope: ReturnType<Page['getByRole']>) => scope.getByRole('link', { name: /^Cómo llegar/ })
const fulfillment = (page: Page) => page.getByRole('region', { name: 'Forma de entrega' })

async function openDelivery(page: Page) {
  await page.clock.setFixedTime(NOW)
  await signedIn(page)
  await mockCalendar(page)
  await seedCart(page, [durazno])
  await page.goto('/pedido/entrega')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿Cómo recibes tu pedido?')
}

test('with the address, the footer opens Google Maps with it encoded, in a new tab', async ({ page }) => {
  await mockStoreInfo(page, withAddress)
  await page.goto('/legal')
  const link = directions(footer(page))
  await expect(link).toHaveAttribute('href', MAPS_URL)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(link).toHaveAccessibleName('Cómo llegar (se abre en otra pestaña)')
})

test('with the address, picking up at the bakery shows it with the directions link', async ({ page }) => {
  await mockStoreInfo(page, withAddress)
  await openDelivery(page)
  await expect(fulfillment(page)).toContainText(ADDRESS)
  await expect(directions(fulfillment(page))).toHaveAttribute('href', MAPS_URL)
})

test('without the address there is no directions link, only the marker', async ({ page }) => {
  await mockStoreInfo(page, emptyStoreInfo)
  await page.goto('/legal')
  await expect(footer(page)).toContainText('[Dirección por confirmar]')
  await expect(directions(footer(page))).toHaveCount(0)
  await openDelivery(page)
  await expect(fulfillment(page)).toContainText('[Dirección por confirmar]')
  await expect(directions(fulfillment(page))).toHaveCount(0)
  await expect(page.locator('a[href*="google.com/maps"]')).toHaveCount(0)
})

test('the confirmation shows the address with the directions link when picking up', async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page, withAddress)
  await signedIn(page)
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ status: 'received' }) })
  await page.goto('/pedido/confirmacion?pedido=57')
  const place = page.getByRole('region', { name: 'Pedido #57' })
  await expect(place).toContainText(ADDRESS)
  await expect(directions(place)).toHaveAttribute('href', MAPS_URL)
})

test('the confirmation shows the address marker without the address', async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page, emptyStoreInfo)
  await signedIn(page)
  await mockOrderDetail(page, 57, { status: 200, body: accountOrder({ status: 'received' }) })
  await page.goto('/pedido/confirmacion?pedido=57')
  const place = page.getByRole('region', { name: 'Pedido #57' })
  await expect(place).toContainText('[Dirección por confirmar]')
  await expect(directions(place)).toHaveCount(0)
})

test('the WhatsApp number reads as 55 9094 9101 in the footer, and the delivery link keeps the digits', async ({ page }) => {
  await mockStoreInfo(page, { ...fullStoreInfo, whatsapp: '525590949101' })
  await openDelivery(page)
  // La entrega ya no lleva la franja del WhatsApp (correcciones del 21 de noviembre): el enlace es el de la entrega a domicilio.
  await expect(page.getByTestId('franja')).toHaveCount(0)
  const link = page.getByRole('link', { name: /Escribir por WhatsApp para la entrega a domicilio/ })
  await expect(link).toHaveAttribute('href', 'https://wa.me/525590949101')
  await page.goto('/legal')
  const note = footer(page).getByRole('link', { name: /Escribir por WhatsApp/ })
  await expect(footer(page)).toContainText('WhatsApp 55 9094 9101')
  await expect(note).toHaveAttribute('href', 'https://wa.me/525590949101')
})

test('a non-Mexican number keeps the + and the digits', async ({ page }) => {
  await mockStoreInfo(page, { ...fullStoreInfo, whatsapp: '14155550123' })
  await page.goto('/legal')
  await expect(footer(page)).toContainText('WhatsApp +14155550123')
})
