import { expect, test } from '@playwright/test'
import { CSRF_TOKEN, INVALID_LINK, mockAuth, rejected, withoutGoogle } from './support/auth.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Recuperar la contraseña (D76): `/recuperar` (Recuperar.dc.html) pide el correo y responde siempre lo mismo;
 * `/recuperar#<token>` es "Crea tu nueva contraseña", que no está en el mockup y usa la misma tarjeta.
 */

const TOKEN = '1z.cb5k3a-0123456789abcdef0123456789abcdef'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await withoutGoogle(page)
})

test.describe('/recuperar', () => {
  test('shows the mockup card: slogan, email, button and the way back, without the Google note', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/recuperar')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recupera tu contraseña')
    await expect(page.getByText('Te ayudamos a entrar de nuevo.')).toBeVisible()
    await expect(page.getByText('Escribe el correo con el que te registraste y te enviamos un enlace para crear una nueva.')).toBeVisible()
    await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('autocomplete', 'email')
    await expect(page.getByRole('button', { name: 'Enviar enlace' })).toBeVisible()
    // El correo de recuperación ya le dice a una cuenta de Google que entre con Google: la tarjeta no lo repite (tanda 1).
    await expect(page.getByText(/Si entras con Google/)).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute('href', '/entrar')
    await expect(page.getByTestId('pastel-acceso-fijo')).toBeVisible()
    await expect(page.getByTestId('pastel-acceso')).toHaveCount(0)
  })

  test('sending says the same neutral message in a status region', async ({ page }) => {
    const calls = await mockAuth(page)
    await page.goto('/recuperar')
    const status = page.getByRole('status').filter({ hasText: 'Revisa tu correo.' })
    await page.getByLabel('Correo electrónico').fill(' Ana@Correo.test ')
    await page.getByRole('button', { name: 'Enviar enlace' }).click()
    await expect(status).toContainText('Si hay una cuenta con Ana@Correo.test, te enviamos un enlace para crear una contraseña nueva. Vence en 1 hora.')
    expect(calls.passwordReset).toHaveLength(1)
    expect(calls.passwordReset[0].postDataJSON()).toEqual({ email: 'Ana@Correo.test' })
    expect(calls.passwordReset[0].headers()['x-csrftoken']).toBe(CSRF_TOKEN)
  })

  test('an empty email is explained without calling the API', async ({ page }) => {
    const calls = await mockAuth(page)
    await page.goto('/recuperar')
    await page.getByRole('button', { name: 'Enviar enlace' }).click()
    await expect(page.getByText('Escribe tu correo.')).toBeVisible()
    await expect(page.getByLabel('Correo electrónico')).toBeFocused()
    expect(calls.passwordReset).toHaveLength(0)
  })

  test('a format error from the API goes under the field', async ({ page }) => {
    await mockAuth(page, {
      passwordReset: () => rejected(400, { email: ['Escribe un correo válido, por ejemplo nombre@correo.com.'], codes: { email: ['invalid'] } }),
    })
    await page.goto('/recuperar')
    await page.getByLabel('Correo electrónico').fill('ana@')
    await page.getByRole('button', { name: 'Enviar enlace' }).click()
    await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Escribe un correo válido, por ejemplo nombre@correo.com.')).toBeVisible()
  })

  test('too many requests say how long to wait', async ({ page }) => {
    await mockAuth(page, { passwordReset: () => rejected(429, { detail: 'x' }, { 'Retry-After': '120' }) })
    await page.goto('/recuperar')
    await page.getByLabel('Correo electrónico').fill('ana@correo.test')
    await page.getByRole('button', { name: 'Enviar enlace' }).click()
    await expect(page.getByRole('alert')).toContainText('Espera 2 minutos e inténtalo de nuevo.')
  })

  test('/entrar links to it and the register error offers it', async ({ page }) => {
    await mockAuth(page, {
      register: () => rejected(400, { email: ['Ya hay una cuenta con este correo.'], codes: { email: ['email_taken'] } }),
    })
    await page.goto('/entrar')
    await expect(page.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute('href', '/recuperar')
    await page.goto('/registro')
    await page.getByLabel('Nombre completo').fill('Ana López García')
    await page.getByLabel('Correo electrónico').fill('ana@correo.test')
    await page.getByLabel('Contraseña', { exact: true }).fill('pastel-de-fresa-2026')
    await page.getByRole('checkbox', { name: /Acepto los Términos y condiciones/ }).check()
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByRole('link', { name: 'recupera tu contraseña' })).toHaveAttribute('href', '/recuperar')
  })
})

test.describe('/recuperar#<token>', () => {
  test('asks for the new password, removes the token from the URL and opens the account', async ({ page }) => {
    const calls = await mockAuth(page)
    await page.goto(`/recuperar#${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Crea tu nueva contraseña')
    await expect(page).toHaveTitle('Crea tu nueva contraseña · Pastelería Ilusión')
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
    const field = page.getByLabel('Contraseña nueva', { exact: true })
    await expect(field).toHaveAttribute('autocomplete', 'new-password')
    await expect(page.getByText('Mínimo 8 caracteres.')).toBeVisible()
    await field.fill('merengue-de-limon-77')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()
    await expect(page).toHaveURL(/\/cuenta$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
    expect(calls.passwordResetConfirm[0].postDataJSON()).toEqual({ token: TOKEN, new_password: 'merengue-de-limon-77' })
    expect(calls.passwordResetConfirm[0].headers()['x-csrftoken']).toBe(CSRF_TOKEN)
  })

  test('a short password is explained before sending; the server rules come back under the field', async ({ page }) => {
    const calls = await mockAuth(page, {
      passwordResetConfirm: () =>
        rejected(400, { new_password: ['Esa contraseña es muy común. Elige otra.'], codes: { new_password: ['password_too_common'] } }),
    })
    await page.goto(`/recuperar#${TOKEN}`)
    const field = page.getByLabel('Contraseña nueva', { exact: true })
    await field.fill('corta')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()
    await expect(page.getByText('Te faltan caracteres: el mínimo es 8.')).toBeVisible()
    expect(calls.passwordResetConfirm).toHaveLength(0)
    await field.fill('password123')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()
    await expect(page.getByText('Esa contraseña es muy común. Elige otra.')).toBeVisible()
    await expect(field).toBeFocused()
    // El mismo enlace sirve para intentarlo otra vez.
    await field.fill('merengue-de-limon-77')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()
    await expect.poll(() => calls.passwordResetConfirm.length).toBe(2)
    expect(calls.passwordResetConfirm[1].postDataJSON()).toEqual({ token: TOKEN, new_password: 'merengue-de-limon-77' })
  })

  test('an expired or used link goes back to the email form and says so', async ({ page }) => {
    await mockAuth(page, { passwordResetConfirm: () => rejected(400, INVALID_LINK) })
    await page.goto(`/recuperar#${TOKEN}`)
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('merengue-de-limon-77')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recupera tu contraseña')
    await expect(page.getByRole('alert')).toContainText('Este enlace ya no sirve.')
    await expect(page.getByLabel('Correo electrónico')).toBeVisible()
  })
})

test.describe('mobile (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('one column without horizontal scroll, and the new password card too', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/recuperar')
    const card = await page.getByRole('heading', { level: 1 }).boundingBox()
    const cake = await page.getByTestId('pastel-acceso-fijo').boundingBox()
    expect(cake!.y).toBeGreaterThan(card!.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.goto(`/recuperar#${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Crea tu nueva contraseña')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
