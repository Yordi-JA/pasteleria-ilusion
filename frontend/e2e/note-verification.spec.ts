import { expect, test } from '@playwright/test'
import { NOW } from './support/checkout.ts'
import { mockNote, mockRecovering, NOTE_TOKEN, notDeliveredNote, validNote } from './support/stand-notes.ts'
import { mockStoreInfo } from './support/store-info.ts'

/** `/nota/:token` (D69, mockup `NotaVerificada`): la página pública que abre el QR de la nota. */

const NOTE = `/nota/${NOTE_TOKEN}`

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await mockStoreInfo(page)
})

test('shows a valid note with its data, with no session and no purchase header', async ({ page }) => {
  const requests = await mockNote(page, { status: 200, body: validNote })
  await page.goto(NOTE)
  await expect(page).toHaveTitle('Verificación de nota · Pastelería Ilusión')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Verificación de nota')
  await expect(page.getByText('Esta nota la emitió Pastelería Ilusión.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nota válida' })).toBeVisible()
  await expect(page.getByText('Pedido #57, hecho el viernes 13 de noviembre')).toBeVisible()
  const card = page.getByRole('region', { name: 'Nota válida' })
  await expect(card.getByRole('row', { name: /Cliente/ })).toContainText('Mariana P.')
  await expect(card.getByRole('row', { name: /Entrega/ })).toContainText('domingo 15 de noviembre, de 3:00 pm a 3:30 pm')
  await expect(card.getByRole('row', { name: /Entrega/ })).toContainText('Recoger en la pastelería')
  await expect(card.getByRole('row', { name: /Base para 4 kg/ })).toContainText('Prestada')
  await expect(card.getByRole('row', { name: /Regresarla antes del/ })).toContainText('lunes 30 de noviembre')
  await expect(card.getByRole('row', { name: /Depósito/ })).toContainText('$70')
  expect(requests[0].headers().authorization).toBeUndefined()
  await expect(page.getByRole('navigation', { name: 'Pasos de tu compra' })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/stand|bizcocho|cotizador/i)
})

test('a returned base says so with its date', async ({ page }) => {
  const stand = { kg: 4, deposit: '70.00', status: 'returned', status_label: 'Devuelta', return_by: '2026-11-30', returned_at: '2026-11-20T11:00:00-06:00' }
  await mockNote(page, { status: 200, body: { ...validNote, stands: [stand] } })
  await page.goto(NOTE)
  await expect(page.getByRole('row', { name: /Base para 4 kg/ })).toContainText('Devuelta')
  await expect(page.getByRole('row', { name: /Devuelta el/ })).toContainText('viernes 20 de noviembre')
})

test('before the delivery the base has no status: it says it is lent on delivery with the expected date', async ({ page }) => {
  await mockNote(page, { status: 200, body: notDeliveredNote })
  await page.goto(NOTE)
  await expect(page.getByRole('heading', { name: 'Nota válida' })).toBeVisible()
  const card = page.getByRole('region', { name: 'Nota válida' })
  await expect(card.getByRole('row', { name: /Base para 4 kg/ })).toContainText('Se presta al entregar')
  await expect(card.getByRole('row', { name: /Regrésala antes del/ })).toContainText('lunes 30 de noviembre')
  await expect(card.getByRole('row', { name: /Depósito/ })).toContainText('$70')
})

test('does not show a phone or an email even when the API sends them', async ({ page }) => {
  await mockNote(page, { status: 200, body: { ...validNote, phone: '5512345678', email: 'ana@correo.test', address: 'Calle Falsa 123' } })
  await page.goto(NOTE)
  await expect(page.getByRole('heading', { name: 'Nota válida' })).toBeVisible()
  const text = await page.getByRole('main').innerText()
  expect(text).not.toContain('5512345678')
  expect(text).not.toContain('ana@correo.test')
  expect(text).not.toContain('Calle Falsa')
})

test('an unknown token says clearly that the note is not valid', async ({ page }) => {
  await mockNote(page, { status: 404, body: { detail: 'No encontrado.' } })
  await page.goto(NOTE)
  await expect(page.getByRole('alert')).toContainText('Esta nota no es válida')
  await expect(page.getByRole('heading', { name: 'Nota válida' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Volver a intentar' })).toHaveCount(0)
})

test('too many requests asks to wait and retries', async ({ page }) => {
  const server = await mockRecovering(page, '**/api/v1/notes/**', { status: 429, body: { detail: 'Throttled' }, headers: { 'Retry-After': '30' } }, { status: 200, body: validNote })
  await page.goto(NOTE)
  await expect(page.getByText('Demasiadas consultas')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nota válida' })).toHaveCount(0)
  server.recover()
  await page.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(page.getByRole('heading', { name: 'Nota válida' })).toBeVisible()
})

test('without a network it offers to retry, without saying the note is invalid', async ({ page }) => {
  await page.route('**/api/v1/notes/**', (route) => route.abort('connectionrefused'))
  await page.goto(NOTE)
  await expect(page.getByRole('alert')).toContainText('No se pudo verificar la nota')
  await expect(page.getByRole('alert')).not.toContainText('no es válida')
  await expect(page.getByRole('button', { name: 'Volver a intentar' })).toBeVisible()
})

test('shows a loading state while the note is checked', async ({ page }) => {
  await page.route('**/api/v1/notes/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(validNote) })
  })
  await page.goto(NOTE)
  await expect(page.getByText('Verificando la nota')).toBeAttached()
  await expect(page.getByRole('main').locator('[aria-busy="true"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nota válida' })).toBeVisible()
})

test('the retry button works with the keyboard', async ({ page }) => {
  const server = await mockRecovering(page, '**/api/v1/notes/**', { status: 429, body: {} }, { status: 200, body: validNote })
  await page.goto(NOTE)
  const retry = page.getByRole('button', { name: 'Volver a intentar' })
  await retry.focus()
  await expect(retry).toBeFocused()
  server.recover()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Nota válida' })).toBeVisible()
})

test('fits a 390 px screen without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockNote(page, { status: 200, body: validNote })
  await page.goto(NOTE)
  await expect(page.getByRole('heading', { name: 'Nota válida' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
