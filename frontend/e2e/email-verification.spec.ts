import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { CSRF_TOKEN, INVALID_LINK, mockAuth, registered, rejected, signedIn, withoutGoogle } from './support/auth.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Confirmación del correo al registrarse (D76): `/verificar` ("Revisa tu correo", Verificar.dc.html), el enlace
 * `/verificar#<token>` que confirma la cuenta sin abrir sesión y lleva a `/entrar`, el reenvío con su espera de 60 s y
 * "Confirma tu correo" en `/entrar`.
 */

const TOKEN = '1z.cb5k3a-0123456789abcdef0123456789abcdef'
const CONFIRMED = 'Tu cuenta quedó confirmada. Entra con tu contraseña.'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await withoutGoogle(page)
})

async function register(page: Page) {
  await page.goto('/registro')
  await page.getByLabel('Nombre completo').fill('Ana López García')
  await page.getByLabel('Correo electrónico').fill('ana@correo.test')
  await page.getByLabel('Contraseña', { exact: true }).fill('pastel-de-fresa-2026')
  await page.getByRole('checkbox', { name: /Acepto los Términos y condiciones/ }).check()
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
}

test.describe('after registering', () => {
  test('/verificar says where the link went and when it expires, with the hours from the API', async ({ page }) => {
    await page.clock.install()
    const calls = await mockAuth(page, { register: () => registered('ana@correo.test', 48) })
    await register(page)
    await expect(page).toHaveURL(/\/verificar$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revisa tu correo')
    await expect(page).toHaveTitle('Revisa tu correo · Pastelería Ilusión')
    await expect(page.getByText('Ya casi está lista tu cuenta.')).toBeVisible()
    const intro = page.getByTestId('verificacion-intro')
    await expect(intro).toHaveText('Te enviamos un enlace a ana@correo.test para confirmar tu cuenta. Vence en 48 horas.')
    await expect(intro.locator('strong')).toHaveText('ana@correo.test')
    // Registrarse no abre sesión: el encabezado sigue pidiendo entrar y no hay pista de sesión.
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.cookie)).not.toContain('ilusion_session')
    expect(calls.refresh).toHaveLength(0)
    // El 3D no va en esta vista: el pastel es el dibujo fijo.
    await expect(page.getByTestId('pastel-acceso-fijo')).toBeVisible()
    await expect(page.getByTestId('pastel-acceso')).toHaveCount(0)
  })

  test('the link was just sent: "Reenviar enlace" waits 60 s without announcing every second', async ({ page }) => {
    await page.clock.install()
    const calls = await mockAuth(page)
    await register(page)
    await expect(page.getByText('¿No te llegó?')).toBeVisible()
    await expect(page.getByText('Revisa la carpeta de correo no deseado o pide otro enlace.')).toBeVisible()
    const button = page.getByRole('button', { name: 'Reenviar enlace' })
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    const countdown = page.getByTestId('espera-reenvio')
    await expect(countdown).toHaveText(/^Podrás pedir otro en 0:(59|60|5\d)$/)
    // El contador no es una región viva ni está dentro de una.
    await expect(countdown).not.toHaveAttribute('aria-live', /.+/)
    expect(await countdown.evaluate((node) => node.closest('[aria-live],[role="status"],[role="alert"]'))).toBeNull()
    // Playwright no pulsa un botón con `aria-disabled`; una persona sí puede, y no pasa nada.
    await button.click({ force: true })
    expect(calls.verifyResend).toHaveLength(0)

    await page.clock.fastForward(61_000)
    await expect(countdown).toBeHidden()
    await expect(button).not.toHaveAttribute('aria-disabled', 'true')
    await button.click()
    await expect.poll(() => calls.verifyResend.length).toBe(1)
    expect(calls.verifyResend[0].postDataJSON()).toEqual({ email: 'ana@correo.test' })
    expect(calls.verifyResend[0].headers()['x-csrftoken']).toBe(CSRF_TOKEN)
    // Un solo anuncio, en la región de estado; y otra espera.
    await expect(page.getByRole('status').filter({ hasText: 'Si tu cuenta está pendiente de confirmar, te enviamos otro enlace.' })).toBeVisible()
    await expect(countdown).toHaveText(/^Podrás pedir otro en 0:5\d$|^Podrás pedir otro en 1:00$/)
    await expect(button).toBeFocused()
  })

  test('"¿Escribiste mal tu correo? Cámbialo" goes back to /registro', async ({ page }) => {
    await mockAuth(page)
    await register(page)
    await expect(page.getByText('¿Escribiste mal tu correo?')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cámbialo' })).toHaveAttribute('href', '/registro')
  })
})

test.describe('/verificar without state', () => {
  test('says "a tu correo" and asks for the email to resend', async ({ page }) => {
    const calls = await mockAuth(page)
    await page.goto('/verificar')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revisa tu correo')
    await expect(page.getByTestId('verificacion-intro')).toHaveText('Te enviamos un enlace a tu correo para confirmar tu cuenta.')
    const button = page.getByRole('button', { name: 'Reenviar enlace' })
    await button.click()
    await expect(page.getByText('Escribe tu correo.')).toBeVisible()
    await expect(page.getByLabel('Correo electrónico')).toBeFocused()
    expect(calls.verifyResend).toHaveLength(0)
    await page.getByLabel('Correo electrónico').fill(' ana@correo.test ')
    await button.click()
    await expect.poll(() => calls.verifyResend.length).toBe(1)
    expect(calls.verifyResend[0].postDataJSON()).toEqual({ email: 'ana@correo.test' })
    await expect(page.getByRole('status').filter({ hasText: 'te enviamos otro enlace' })).toContainText('Vence en 24 horas.')
  })

  test('a throttled resend says how long to wait', async ({ page }) => {
    await mockAuth(page, { verifyResend: () => rejected(429, { detail: 'Demasiadas peticiones.' }, { 'Retry-After': '1800' }) })
    await page.goto('/verificar')
    await page.getByLabel('Correo electrónico').fill('ana@correo.test')
    await page.getByRole('button', { name: 'Reenviar enlace' }).click()
    await expect(page.getByRole('alert')).toContainText('Espera 30 minutos e inténtalo de nuevo.')
  })
})

test.describe('/verificar#<token>', () => {
  test('confirms the account without a session and asks to log in, removing the token from the URL', async ({ page }) => {
    const calls = await mockAuth(page)
    await page.goto(`/verificar#${TOKEN}`)
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inicia sesión')
    await expect(page.getByRole('status').filter({ hasText: CONFIRMED })).toBeVisible()
    // Confirmar no abre sesión: el encabezado sigue pidiendo entrar y no hay pista de sesión.
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.cookie)).not.toContain('ilusion_session')
    expect(calls.verify).toHaveLength(1)
    expect(calls.verify[0].postDataJSON()).toEqual({ token: TOKEN })
    expect(calls.verify[0].headers()['x-csrftoken']).toBe(CSRF_TOKEN)
    // El token nunca quedó en el historial: atrás no vuelve a `/verificar#...`.
    expect(await page.evaluate(() => window.location.hash)).toBe('')
  })

  test('a session already open in the browser stays as it was', async ({ page }) => {
    const calls = await signedIn(page)
    await page.goto(`/verificar#${TOKEN}`)
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('status').filter({ hasText: CONFIRMED })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mi cuenta' })).toBeVisible()
    expect(calls.verify).toHaveLength(1)
    expect(calls.logout).toHaveLength(0)
    expect(calls.login).toHaveLength(0)
  })

  test('removes the token from the URL before the answer arrives', async ({ page }) => {
    let release: () => void = () => undefined
    const answered = new Promise<void>((resolve) => (release = resolve))
    await mockAuth(page)
    await page.unroute('**/api/v1/auth/verify/')
    await page.route('**/api/v1/auth/verify/', async (route) => {
      await answered
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(INVALID_LINK) })
    })
    await page.goto(`/verificar#${TOKEN}`)
    await expect(page.getByRole('status').filter({ hasText: 'Confirmando tu cuenta…' })).toBeAttached()
    await expect.poll(() => page.evaluate(() => window.location.href)).toMatch(/\/verificar$/)
    release()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Este enlace ya no sirve')
  })

  test('an expired, used or broken link says so and offers another one', async ({ page }) => {
    const calls = await mockAuth(page, { verify: () => rejected(400, INVALID_LINK) })
    await page.goto(`/verificar#${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Este enlace ya no sirve')
    await expect(page.getByRole('alert')).toContainText('Venció, ya se usó o está incompleto.')
    await page.getByLabel('Correo electrónico').fill('ana@correo.test')
    await page.getByRole('button', { name: 'Reenviar enlace' }).click()
    await expect.poll(() => calls.verifyResend.length).toBe(1)
    await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/entrar')
    expect(calls.verify).toHaveLength(1)
  })

  test('without a connection it can try the same link again', async ({ page }) => {
    let fail = true
    const calls = await mockAuth(page)
    await page.unroute('**/api/v1/auth/verify/')
    await page.route('**/api/v1/auth/verify/', async (route) => {
      calls.verify.push(route.request())
      if (fail) {
        await route.abort()
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email_verified: true }) })
    })
    await page.goto(`/verificar#${TOKEN}`)
    await expect(page.getByRole('alert')).toContainText('No pudimos confirmar tu cuenta.')
    fail = false
    await page.getByRole('button', { name: 'Volver a intentar' }).click()
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('status').filter({ hasText: CONFIRMED })).toBeVisible()
    expect(calls.verify.map((request) => request.postDataJSON())).toEqual([{ token: TOKEN }, { token: TOKEN }])
  })
})

test.describe('/entrar with an unconfirmed account', () => {
  test('says to confirm the email and resends the link', async ({ page }) => {
    const calls = await mockAuth(page, {
      login: () =>
        rejected(403, {
          detail: 'Confirma tu correo para entrar. Te enviamos un enlace al crear tu cuenta.',
          code: 'email_unverified',
        }),
    })
    await page.goto('/entrar')
    await page.getByLabel('Correo electrónico').fill('ana@correo.test')
    await page.getByLabel('Contraseña', { exact: true }).fill('pastel-de-fresa-2026')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    const notice = page.getByRole('status').filter({ hasText: 'Confirma tu correo.' })
    await expect(notice).toContainText('Te enviamos un enlace al crear tu cuenta.')
    await page.getByRole('button', { name: 'Reenviar enlace' }).click()
    await expect(page).toHaveURL(/\/verificar$/)
    expect(calls.verifyResend[0].postDataJSON()).toEqual({ email: 'ana@correo.test' })
    await expect(page.getByTestId('verificacion-intro')).toHaveText(
      'Te enviamos un enlace a ana@correo.test para confirmar tu cuenta. Vence en 24 horas.',
    )
    await expect(page.getByRole('button', { name: 'Reenviar enlace' })).toHaveAttribute('aria-disabled', 'true')
  })
})

test.describe('mobile (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('one column: slogan, card and the cake below, without horizontal scroll', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/verificar')
    const slogan = await page.getByText('Ya casi está lista tu cuenta.').boundingBox()
    const card = await page.getByRole('heading', { level: 1 }).boundingBox()
    const cake = await page.getByTestId('pastel-acceso-fijo').boundingBox()
    expect(card!.y).toBeGreaterThan(slogan!.y)
    expect(cake!.y).toBeGreaterThan(card!.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
