import { expect, test } from '@playwright/test'
import { mockAuth, signedIn } from './support/auth.ts'
import { NOW } from './support/checkout.ts'
import { loanPage, mockRecovering, mockStandLoans, onLoan, overdue, returned } from './support/stand-notes.ts'
import { mockStoreInfo } from './support/store-info.ts'

/** `/cuenta/bases` (D69, mockup `CuentaBases`): las bases prestadas y las devueltas del cliente. */

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
})

test('without a session it asks to sign in and comes back', async ({ page }) => {
  await mockAuth(page)
  await page.goto('/cuenta/bases')
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fcuenta%2Fbases$/)
})

test('lists the loaned, the overdue and the returned bases with their state in words', async ({ page }) => {
  await signedIn(page)
  const requests = await mockStandLoans(page, { status: 200, body: loanPage([overdue, onLoan, returned]) })
  await page.goto('/cuenta/bases')
  await expect(page).toHaveTitle('Bases en préstamo · Pastelería Ilusión')
  await expect(page.getByRole('heading', { level: 2, name: 'Bases en préstamo' })).toBeVisible()
  expect(requests[0].headers().authorization).toBe('Bearer access-de-prueba')

  const loaned = page.getByRole('list', { name: 'Bases prestadas' }).getByRole('listitem')
  await expect(loaned).toHaveCount(2)
  const late = loaned.nth(0)
  await expect(late.getByRole('heading', { name: 'Base para 15 kg' })).toBeVisible()
  await expect(late).toContainText('Prestada')
  await expect(late).toContainText('Venció el')
  await expect(late).toContainText('martes 10 de noviembre')
  await expect(late).toContainText('Ya pasó la fecha límite')
  await expect(late.getByRole('link', { name: '#41' })).toHaveAttribute('href', '/cuenta/pedidos/41')
  await expect(late).toContainText('$200')

  const open = loaned.nth(1)
  await expect(open.getByRole('heading', { name: 'Base para 4 kg' })).toBeVisible()
  await expect(open).toContainText('Prestada')
  await expect(open).toContainText('Devuélvela antes del')
  await expect(open).toContainText('lunes 30 de noviembre')
  await expect(open).toContainText('Faltan 17 días')
  await expect(open).not.toContainText('Ya pasó')
  await expect(open.getByRole('link', { name: '#57' })).toHaveAttribute('href', '/cuenta/pedidos/57')
  await expect(open).toContainText('$70')

  await expect(page.getByRole('heading', { level: 2, name: 'Bases devueltas' })).toBeVisible()
  const done = page.getByRole('list', { name: 'Bases devueltas' }).getByRole('listitem')
  await expect(done).toHaveCount(1)
  await expect(done).toContainText('Base para 8 kg')
  await expect(done).toContainText('Devuelta el lunes 12 de octubre')
  await expect(done).toContainText('Depósito liberado')
  await expect(page.getByRole('link', { name: 'Ver las condiciones del préstamo' })).toHaveAttribute('href', '/bases')
  await expect(page.locator('body')).not.toContainText(/stand|bizcocho|cotizador/i)
})

test('shows the empty state when there are no bases', async ({ page }) => {
  await signedIn(page)
  await mockStandLoans(page, { status: 200, body: loanPage([]) })
  await page.goto('/cuenta/bases')
  await expect(page.getByText('Todavía no tienes bases en préstamo.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bases devueltas' })).toHaveCount(0)
})

test('shows an error with a retry that loads the list', async ({ page }) => {
  await signedIn(page)
  const server = await mockRecovering(page, '**/api/v1/stand-loans/**', { status: 500, body: { detail: 'Error' } }, { status: 200, body: loanPage([onLoan]) })
  await page.goto('/cuenta/bases')
  await expect(page.getByRole('alert')).toContainText('No se pudieron cargar tus bases')
  server.recover()
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByRole('heading', { name: 'Base para 4 kg' })).toBeVisible()
})

test('shows a loading state with a screen reader label while the list loads', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/v1/stand-loans/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(loanPage([onLoan])) })
  })
  await page.goto('/cuenta/bases')
  await expect(page.getByText('Cargando tus bases')).toBeAttached()
  await expect(page.getByRole('main').locator('[aria-busy="true"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Base para 4 kg' })).toBeVisible()
})

test('the order link is reachable and works with the keyboard', async ({ page }) => {
  await signedIn(page)
  await mockStandLoans(page, { status: 200, body: loanPage([onLoan]) })
  await page.goto('/cuenta/bases')
  const link = page.getByRole('link', { name: '#57' })
  await link.focus()
  await expect(link).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/cuenta\/pedidos\/57$/)
})

test('fits a 390 px screen without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signedIn(page)
  await mockStandLoans(page, { status: 200, body: loanPage([overdue, onLoan, returned]) })
  await page.goto('/cuenta/bases')
  await expect(page.getByRole('heading', { name: 'Base para 4 kg' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('heading', { name: 'Cómo funciona el depósito' })).toBeVisible()
})
