import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ana, CSRF_TOKEN, mockAuth, mockGoogleIdentity, opened, rejected, sessionBody, signedIn, withoutGoogle } from './support/auth.ts'
import { mockStoreInfo } from './support/store-info.ts'
import { durazno, seedCart, storedCart } from './support/checkout.ts'

/** Acceso de clientes (D62): `/entrar`, `/registro`, la sesión en el marco y las rutas de la cuenta. */

const CART_KEY = 'ilusion.cart.v1'
const cartLine = {
  offeringId: 101,
  name: 'Tres leches de durazno',
  presentation: 'whole',
  unitPrice: '350.00',
  slug: 'tres-leches-de-durazno',
  fulfillment: 'order',
  kind: 'offering',
  quantity: 2,
}

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

async function fillRegister(page: Page, values: { name?: string; email?: string; phone?: string; password?: string; terms?: boolean } = {}) {
  await page.getByLabel('Nombre completo').fill(values.name ?? 'Ana López García')
  await page.getByLabel('Correo electrónico').fill(values.email ?? 'ana@correo.test')
  await page.getByLabel('Teléfono o WhatsApp (opcional)').fill(values.phone ?? '55 1234 5678')
  await page.getByLabel('Contraseña', { exact: true }).fill(values.password ?? 'pastel-de-fresa-2026')
  if (values.terms ?? true) await page.getByRole('checkbox', { name: /Acepto los Términos y condiciones/ }).check()
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
}

test.describe('/entrar', () => {
  test('shows the mockup card on fresa with email only when there is no Google client ID', async ({ page }) => {
    await withoutGoogle(page)
    const calls = await mockAuth(page)
    await page.goto('/entrar')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inicia sesión')
    await expect(page.getByText('Qué gusto verte de nuevo.')).toBeVisible()
    await expect(page.getByText('Entra con tu correo.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('boton-google')).toHaveCount(0)
    await expect(page.getByText('o con tu correo', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro')
    const main = page.locator('main')
    await expect(main.getByRole('link', { name: 'Términos y condiciones' })).toHaveAttribute('href', '/legal#terminos')
    await expect(main.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', '/legal#privacidad')
    // Recuperar la contraseña existe desde D76: el enlace del mockup vuelve.
    await expect(page.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute('href', '/recuperar')
    await expect(page.getByTestId('pastel-acceso')).toBeVisible()
    // La página termina en fresa: la guirnalda cuelga de ese campo.
    await expect(page.locator('.duya:has(+ footer)')).toHaveClass(/colors\.fresa/)
    // Un visitante sin sesión no gasta una petición de renovación.
    expect(calls.refresh).toHaveLength(0)
  })

  test('empty fields are explained without calling the API and the focus goes to the first one', async ({ page }) => {
    const calls = await mockAuth(page)
    await page.goto('/entrar')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByText('Escribe tu correo.')).toBeVisible()
    await expect(page.getByText('Escribe tu contraseña.')).toBeVisible()
    await expect(page.getByLabel('Correo electrónico')).toBeFocused()
    await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('aria-invalid', 'true')
    expect(calls.login).toHaveLength(0)
  })

  test('wrong credentials show the LoginError notice, keep the email and clear the password', async ({ page }) => {
    const calls = await mockAuth(page, {
      login: () => rejected(401, { detail: 'El correo o la contraseña no coinciden.', code: 'invalid_credentials' }),
    })
    await page.goto('/entrar')
    await fillLogin(page, 'ana@correo.test', 'incorrecta')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('El correo o la contraseña no coinciden.')
    await expect(alert).toContainText('Revísalos e inténtalo de nuevo.')
    await expect(page.getByLabel('Correo electrónico')).toHaveValue('ana@correo.test')
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('')
    // La petición lleva el token CSRF y el cuerpo que espera la API.
    expect(calls.login[0].headers()['x-csrftoken']).toBe(CSRF_TOKEN)
    expect(calls.login[0].postDataJSON()).toEqual({ email: 'ana@correo.test', password: 'incorrecta' })
  })

  test('a lockout says how long to wait', async ({ page }) => {
    await mockAuth(page, {
      login: () => rejected(429, { detail: 'Demasiados intentos fallidos. Intenta de nuevo más tarde.', code: 'locked_out' }, { 'Retry-After': '3600' }),
    })
    await page.goto('/entrar')
    await fillLogin(page, 'ana@correo.test', 'incorrecta')
    await expect(page.getByRole('alert')).toContainText('Demasiados intentos fallidos.')
    await expect(page.getByRole('alert')).toContainText('Espera 60 minutos e inténtalo de nuevo.')
  })

  test('a dropped connection says so', async ({ page }) => {
    await mockAuth(page)
    await page.route('**/api/v1/auth/login/', (route) => route.abort())
    await page.goto('/entrar')
    await fillLogin(page, 'ana@correo.test', 'pastel-de-fresa-2026')
    await expect(page.getByRole('alert')).toContainText('No pudimos conectar.')
  })

  test('logging in opens the account, keeps the cart and never stores a token', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/entrar')
    // El carrito se guarda una sola vez, antes de entrar (no en cada carga).
    await page.evaluate(([key, line]) => localStorage.setItem(key as string, JSON.stringify({ items: [line] })), [CART_KEY, cartLine])
    await page.reload()
    await expect(page.getByRole('link', { name: 'Carrito, 2 productos' })).toBeVisible()

    await fillLogin(page, 'ana@correo.test', 'pastel-de-fresa-2026')
    await expect(page).toHaveURL(/\/cuenta$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
    await expect(page.getByText('ana@correo.test')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute('href', '/cuenta')
    await expect(page.getByRole('link', { name: 'Carrito, 2 productos' })).toBeVisible()
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
    expect(stored).not.toContain('access-de-prueba')
  })

  test('after logging in it returns to ?volver= and ignores another site', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/entrar?volver=%2Fcarrito')
    await expect(page.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro?volver=%2Fcarrito')
    await fillLogin(page, 'ana@correo.test', 'pastel-de-fresa-2026')
    await expect(page).toHaveURL(/\/carrito$/)

    for (const unsafe of ['//otro.sitio/x', '/\\otro.sitio', 'https://otro.sitio', '/entrar']) {
      await page.goto('/')
      await page.context().clearCookies()
      await page.goto(`/entrar?volver=${encodeURIComponent(unsafe)}`)
      await fillLogin(page, 'ana@correo.test', 'pastel-de-fresa-2026')
      await expect(page).toHaveURL(/\/cuenta$/)
    }
  })

  test('the password can be shown and hidden', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/entrar')
    const password = page.getByLabel('Contraseña', { exact: true })
    await password.fill('pastel')
    await expect(password).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Mostrar contraseña' }).click()
    await expect(password).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Ocultar contraseña' }).click()
    await expect(password).toHaveAttribute('type', 'password')
  })

  test('someone who already has a session goes straight to the account', async ({ page }) => {
    await signedIn(page)
    await page.goto('/entrar')
    await expect(page).toHaveURL(/\/cuenta$/)
  })
})

test.describe('/registro', () => {
  test('shows the benefits on desktop and the fields of the mockup', async ({ page }) => {
    await withoutGoogle(page)
    await mockAuth(page)
    await page.goto('/registro')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Crea tu cuenta')
    await expect(page.getByText('Tu próximo pastel empieza aquí.')).toBeVisible()
    await expect(page.getByText('Sigue tu pedido')).toBeVisible()
    await expect(page.getByText('Tu depósito, a la vista')).toBeVisible()
    await expect(page.getByText('Sabes qué base te prestamos, hasta cuándo la regresas y cuánto te devolvemos.')).toBeVisible()
    await expect(page.getByText('Tu historial')).toBeVisible()
    await expect(page.getByText('Todos tus pedidos en un solo lugar.')).toBeVisible()
    await expect(page.getByText('Repite lo que te gustó')).toHaveCount(0)
    // Sin la franja de arriba no queda ningún marcador pendiente en el acceso (tanda 1).
    await expect(page.locator('[data-pendiente]')).toHaveCount(0)
    await expect(page.getByText('Mínimo 8 caracteres.')).toBeVisible()
    await expect(page.getByText('10 dígitos. Lo usamos si hay algún detalle con tu pedido.')).toBeVisible()
    await expect(page.getByLabel('Teléfono o WhatsApp (opcional)')).toHaveAttribute('type', 'tel')
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('autocomplete', 'new-password')
  })

  test('validates before sending, with the RegistroError texts', async ({ page }) => {
    const calls = await mockAuth(page)
    await page.goto('/registro')
    await fillRegister(page, { phone: '55 1234', password: 'corta', terms: false })
    await expect(page.getByText('Escribe 10 dígitos, por ejemplo 55 1234 5678.')).toBeVisible()
    await expect(page.getByText('Te faltan caracteres: el mínimo es 8.')).toBeVisible()
    await expect(page.getByText('Acepta los términos y el aviso de privacidad para crear tu cuenta.')).toBeVisible()
    await expect(page.getByLabel('Teléfono o WhatsApp (opcional)')).toBeFocused()
    expect(calls.register).toHaveLength(0)
  })

  test('an email that already has an account says so with a link to log in', async ({ page }) => {
    await mockAuth(page, {
      register: () =>
        rejected(400, { email: ['Ya hay una cuenta con este correo.'], codes: { email: ['email_taken'] } }),
    })
    await page.goto('/registro?volver=%2Fcarrito')
    await fillRegister(page)
    const email = page.getByLabel('Correo electrónico')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toBeFocused()
    await expect(page.getByText('Ya hay una cuenta con este correo.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Inicia sesión' }).first()).toHaveAttribute('href', '/entrar?volver=%2Fcarrito')
    // Como RegistroError.dc.html: "Inicia sesión o recupera tu contraseña" (D76).
    await expect(page.getByRole('link', { name: 'recupera tu contraseña' })).toHaveAttribute('href', '/recuperar')
  })

  test('server password rules come back under the password', async ({ page }) => {
    await mockAuth(page, {
      register: () => rejected(400, { password: ['Esa contraseña es muy común. Elige otra.'], codes: { password: ['password_too_common'] } }),
    })
    await page.goto('/registro')
    await fillRegister(page, { password: 'password123' })
    await expect(page.getByText('Esa contraseña es muy común. Elige otra.')).toBeVisible()
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused()
  })

  test('creating the account sends the form and asks to confirm the email, without a session', async ({ page }) => {
    const calls = await mockAuth(page)
    await page.goto('/registro')
    await fillRegister(page)
    // Desde D76 la cuenta nace sin confirmar: no se abre la sesión, se pide abrir el enlace del correo.
    await expect(page).toHaveURL(/\/verificar$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revisa tu correo')
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    expect(calls.register[0].postDataJSON()).toEqual({
      full_name: 'Ana López García',
      email: 'ana@correo.test',
      phone: '55 1234 5678',
      password: 'pastel-de-fresa-2026',
      accepts_terms: true,
    })
  })
})

test.describe('Google', () => {
  test('the official button signs in with the credential and follows ?volver=', async ({ page }) => {
    const loads = await mockGoogleIdentity(page, { credential: 'id-token-de-ana' })
    const calls = await mockAuth(page)
    await page.goto('/entrar?volver=%2Fcarrito')
    await expect(page.getByText('Entra con Google o con tu correo.')).toBeVisible()
    await expect(page.getByText('o con tu correo', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Continuar con Google' }).click()
    await expect(page).toHaveURL(/\/carrito$/)
    expect(loads).toHaveLength(1)
    expect(calls.google[0].postDataJSON()).toEqual({ credential: 'id-token-de-ana' })
    const config = await page.evaluate(() => Reflect.get(globalThis, '__gisConfig'))
    expect(config).toMatchObject({ client_id: '1234-prueba.apps.googleusercontent.com', ux_mode: 'popup', context: 'signin' })
  })

  test('the Google button keeps its height while it loads: it waits for its stylesheet and never shows a giant logo', async ({ page }) => {
    await mockGoogleIdentity(page, { styleDelayMs: 1500 })
    await mockAuth(page)
    await page.goto('/registro')
    const slot = page.getByTestId('boton-google')
    await expect(slot).toHaveAttribute('data-state', 'loading')
    // Mientras llega la hoja de estilos el botón no se dibuja, y su lugar ya mide lo que medirá.
    expect(await page.evaluate(() => Reflect.get(globalThis, '__gisOptions'))).toBeUndefined()
    const before = (await slot.boundingBox())!
    expect(before.height).toBeGreaterThanOrEqual(40)
    expect(before.height).toBeLessThanOrEqual(44)
    await expect(page.getByRole('button', { name: 'Registrarse con Google' })).toBeVisible()
    const after = (await slot.boundingBox())!
    expect(after.height).toBe(before.height)
    const logo = (await slot.locator('[data-logo-google]').boundingBox())!
    expect(logo.height).toBeLessThanOrEqual(44)
  })

  test('the register page asks Google for its sign-up text', async ({ page }) => {
    await mockGoogleIdentity(page)
    await mockAuth(page)
    await page.goto('/registro')
    await expect(page.getByRole('button', { name: 'Registrarse con Google' })).toBeVisible()
    expect(await page.evaluate(() => Reflect.get(globalThis, '__gisOptions'))).toMatchObject({ text: 'signup_with', theme: 'outline', shape: 'pill' })
  })

  test('linking an account with a password warns before going on', async ({ page }) => {
    await mockGoogleIdentity(page)
    await mockAuth(page, { google: () => opened(sessionBody(ana, { password_removed: true })) })
    await page.goto('/entrar')
    await page.getByRole('button', { name: 'Continuar con Google' }).click()
    await expect(page.getByText('Tu cuenta ya entra con Google.')).toBeVisible()
    await expect(page).toHaveURL(/\/entrar$/)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page).toHaveURL(/\/cuenta$/)
  })

  test('an existing account that is not linked says to use the password', async ({ page }) => {
    await mockGoogleIdentity(page)
    await mockAuth(page, {
      google: () => rejected(409, { detail: 'Ya hay una cuenta con este correo. Entra con tu correo y contraseña.', code: 'account_exists' }),
    })
    await page.goto('/entrar')
    await page.getByRole('button', { name: 'Continuar con Google' }).click()
    await expect(page.getByRole('alert')).toContainText('Ya hay una cuenta con este correo.')
    await expect(page.getByRole('alert')).toContainText('Entra con tu correo y contraseña.')
  })

  test('if the Google library cannot load, the email still works', async ({ page }) => {
    await mockGoogleIdentity(page, { fail: true })
    await mockAuth(page)
    await page.goto('/entrar')
    await expect(page.getByText('No pudimos cargar el acceso con Google.')).toBeVisible()
    await fillLogin(page, 'ana@correo.test', 'pastel-de-fresa-2026')
    await expect(page).toHaveURL(/\/cuenta$/)
  })
})

test.describe('session and account routes', () => {
  test('an account route without a session goes to /entrar and comes back after logging in', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/cuenta/bases')
    await expect(page).toHaveURL(/\/entrar\?volver=%2Fcuenta%2Fbases$/)
    await fillLogin(page, 'ana@correo.test', 'pastel-de-fresa-2026')
    await expect(page).toHaveURL(/\/cuenta\/bases$/)
    await expect(page).toHaveTitle('Bases en préstamo · Pastelería Ilusión')
  })

  test('a reload keeps the session through the refresh cookie', async ({ page }) => {
    const calls = await signedIn(page)
    await page.goto('/cuenta')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
    expect(calls.refresh.length).toBeGreaterThan(0)
    expect(calls.refresh[0].headers()['x-csrftoken']).toBe(CSRF_TOKEN)
  })

  test('an expired session at load goes to /entrar, with ?volver= unless it is the account itself', async ({ page }) => {
    await signedIn(page)
    await page.unroute('**/api/v1/auth/refresh/')
    await page.route('**/api/v1/auth/refresh/', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Tu sesión terminó. Vuelve a entrar.', code: 'session_expired' }) }),
    )
    await page.goto('/cuenta/datos')
    await expect(page).toHaveURL(/\/entrar\?volver=%2Fcuenta%2Fdatos$/)
    // `/cuenta` es el destino de siempre: el enlace no lo repite.
    await page.goto('/cuenta')
    await expect(page).toHaveURL(/\/entrar$/)
  })

  test('"Cerrar sesión" logs out, goes home and the header asks to log in again', async ({ page }) => {
    const calls = await signedIn(page)
    await page.goto('/cuenta')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toHaveAttribute('href', '/entrar')
    expect(calls.logout).toHaveLength(1)
    expect(calls.logout[0].headers()['x-csrftoken']).toBe(CSRF_TOKEN)
  })

  test('without a name the greeting is just "Hola"', async ({ page }) => {
    await signedIn(page, { ...ana, full_name: '' })
    await page.goto('/cuenta')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola')
  })

  test('"Cerrar sesión" empties the cart and the header counter', async ({ page }) => {
    // Desde el menú de la portada: no necesita las pantallas de la cuenta.
    await page.setViewportSize({ width: 390, height: 844 })
    await seedCart(page, [durazno])
    await signedIn(page)
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible()
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('dialog', { name: 'Menú' }).getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect.poll(async () => (await storedCart(page))?.items ?? []).toEqual([])
    await expect(page.getByRole('banner').getByRole('link', { name: 'Carrito, vacío' })).toBeVisible()
  })

  test('logging out in one tab empties the cart in the other', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedCart(page, [durazno])
    await signedIn(page)
    await page.goto('/')
    const other = await page.context().newPage()
    await mockStoreInfo(other)
    await mockAuth(other, { refresh: () => opened() })
    await other.goto('/')
    await expect(other.getByRole('banner').getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible()
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('dialog', { name: 'Menú' }).getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(other.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    await expect(other.getByRole('banner').getByRole('link', { name: 'Carrito, vacío' })).toBeVisible()
    await expect.poll(async () => (await storedCart(other))?.items ?? []).toEqual([])
  })

  test('logging out in one tab logs out the other', async ({ page }) => {
    await signedIn(page)
    await page.goto('/cuenta')
    const other = await page.context().newPage()
    await mockStoreInfo(other)
    await mockAuth(other, { refresh: () => opened() })
    await other.goto('/')
    await expect(other.getByRole('link', { name: 'Mi cuenta' })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(other.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
  })
})

test.describe('mobile (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('one column: slogan, card and the cake below; no benefits list', async ({ page }) => {
    await withoutGoogle(page)
    await mockAuth(page)
    await page.goto('/registro')
    const card = page.getByRole('heading', { level: 1 })
    const cake = page.getByTestId('pastel-acceso')
    await expect(page.getByText('Sigue tu pedido')).toBeHidden()
    const cardBox = await card.boundingBox()
    const cakeBox = await cake.boundingBox()
    expect(cakeBox!.y).toBeGreaterThan(cardBox!.y)
    // Nada se sale de lo ancho de la pantalla.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('the site menu offers the account and "Cerrar sesión" with a session', async ({ page }) => {
    const calls = await signedIn(page)
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Mi cuenta' })).toBeVisible()
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    const menu = page.getByRole('dialog', { name: 'Menú' })
    await expect(menu.getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute('href', '/cuenta')
    await menu.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    // La sesión local se borra en el acto; la salida al servidor espera el candado y llega un momento después.
    await expect.poll(() => calls.logout.length).toBe(1)
  })
})

test.describe('round 1 of the review', () => {
  test('after signing out, going back to an account route asks to log in again', async ({ page }) => {
    await signedIn(page)
    await page.goto('/cuenta/bases')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/$/)
    // Navegación dentro del sitio (sin recargar), como la de un enlace.
    await page.evaluate(() => {
      history.pushState({}, '', '/cuenta/bases')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page).toHaveURL(/\/entrar\?volver=%2Fcuenta%2Fbases$/)
  })

  test('signing out without a connection forgets the session here and says the server did not get it', async ({ page }) => {
    await signedIn(page)
    await page.goto('/cuenta')
    await page.unroute('**/api/v1/auth/logout/')
    await page.route('**/api/v1/auth/logout/', (route) => route.abort())
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page.getByText('No pudimos avisar que saliste.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.cookie)).not.toContain('ilusion_session')
  })

  test('field errors from the API go under their field', async ({ page }) => {
    await mockAuth(page, {
      login: () => rejected(400, { password: ['Asegúrese de que este campo no tenga más de 128 caracteres.'] }),
    })
    await page.goto('/entrar')
    await fillLogin(page, 'ana@correo.test', 'x')
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Asegúrese de que este campo no tenga más de 128 caracteres.')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})

test.describe('the cake of the access pages (tanda 8)', () => {
  // `/entrar` y `/registro` llevan el pastel de la portada (`homeCake.ts`): dos pisos peinados con rosas sobre la charola negra.
  for (const path of ['/entrar', '/registro']) {
    test(`${path} draws the brand cake of the home page, not the old three-tier one`, async ({ page }) => {
      await withoutGoogle(page)
      await mockAuth(page)
      await page.goto(path)
      await expect(page.getByTestId('pastel-acceso')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
      const scene = page.getByRole('img', { name: 'Pastel de dos pisos', exact: true })
      await expect(scene).toHaveAttribute('data-tiers', '2')
      await expect(scene).toHaveAttribute('data-decoration', 'roses')
      await expect(scene).toHaveAttribute('data-board', 'true')
      await expect(page.getByRole('img', { name: 'Pastel de tres pisos' })).toHaveCount(0)
    })
  }

  test('the still drawing while the scene loads has two tiers in the cream of the cake', async ({ page }) => {
    await page.route('**/src/three/**', () => {})
    await withoutGoogle(page)
    await mockAuth(page)
    await page.goto('/entrar')
    const still = page.getByTestId('pastel-acceso-fijo')
    await expect(still).toBeVisible()
    await expect(still.locator('rect')).toHaveCount(2)
    for (const rect of await still.locator('rect').all()) await expect(rect).toHaveClass(/fill-betun/)
  })

  test('on desktop the cake takes a 480 px column and ends with the card (tanda 9)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await withoutGoogle(page)
    await mockAuth(page)
    await page.goto('/registro')
    const box = await page.getByTestId('pastel-acceso').boundingBox()
    const card = await page.getByRole('heading', { level: 1 }).locator('xpath=ancestor::*[contains(@class,"rounded")][1]').boundingBox()
    expect(box!.width).toBe(480)
    // El pastel se apoya abajo, a la altura del final de la tarjeta (la tarjeta lleva unos px de margen dentro de su celda).
    expect(Math.abs(box!.y + box!.height - (card!.y + card!.height))).toBeLessThanOrEqual(8)
  })

  test('/recuperar keeps the still cake, in the same colors', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/recuperar')
    const still = page.getByTestId('pastel-acceso-fijo')
    await expect(still.locator('rect')).toHaveCount(2)
    for (const rect of await still.locator('rect').all()) await expect(rect).toHaveClass(/fill-betun/)
  })
})
