import { expect, test } from '@playwright/test'
import { mockAuth, sessionBody, signedIn } from './support/auth.ts'
import { mockStoreInfo } from './support/store-info.ts'

// No hay corredor de pruebas unitarias: los módulos se importan en el navegador desde el servidor de desarrollo.
const SESSION = '/src/models/session.ts'
const RETURN_PATH = '/src/viewmodels/returnPath.ts'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

test('safeReturnPath only keeps paths of this site', async ({ page }) => {
  await mockAuth(page)
  await page.goto('/')
  const results = await page.evaluate(async (url) => {
    const { safeReturnPath } = await import(url)
    return [
      '/carrito',
      '/pasteles/tres-leches?x=1#a',
      '//otro.sitio',
      '/\\otro.sitio',
      'https://otro.sitio/',
      'javascript:alert(1)',
      '/entrar',
      '/registro?volver=/x',
      '/a\nb',
      '',
      null,
    ].map((value) => safeReturnPath(value))
  }, RETURN_PATH)
  expect(results).toEqual(['/carrito', '/pasteles/tres-leches?x=1#a', '/cuenta', '/cuenta', '/cuenta', '/cuenta', '/cuenta', '/cuenta', '/cuenta', '/cuenta', '/cuenta'])
})

test('account requests carry the access as Bearer and renew once on a 401', async ({ page }) => {
  let refreshes = 0
  await signedIn(page)
  await page.unroute('**/api/v1/auth/refresh/')
  await page.route('**/api/v1/auth/refresh/', async (route) => {
    refreshes += 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionBody(undefined, { access: `access-${refreshes}` })) })
  })
  const seen: (string | undefined)[] = []
  await page.route('**/api/v1/orders/', async (route) => {
    seen.push(route.request().headers().authorization)
    const fresh = route.request().headers().authorization === 'Bearer access-2'
    await route.fulfill({ status: fresh ? 200 : 401, contentType: 'application/json', body: JSON.stringify(fresh ? [{ id: 1 }] : { detail: 'x' }) })
  })
  // `/cuenta` pide sus pedidos al cargar (D69): aquí hace falta una vista de la cuenta que no pida `orders/`.
  await page.goto('/cuenta/datos')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')

  const result = await page.evaluate(async (url) => {
    const { getJsonWithSession } = await import(url)
    return getJsonWithSession(['orders'])
  }, SESSION)
  expect(result).toEqual([{ id: 1 }])
  expect(seen).toEqual(['Bearer access-1', 'Bearer access-2'])
})

test('two tabs renewing at once take turns, so the second sends the rotated cookie', async ({ page }) => {
  // Cada renovación tarda; con el candado del navegador nunca hay dos a la vez.
  let active = 0
  let overlapped = false
  await signedIn(page)
  await page.unroute('**/api/v1/auth/refresh/')
  // En el contexto: lo comparten las dos pestañas.
  await page.context().route('**/api/v1/auth/refresh/', async (route) => {
    active += 1
    if (active > 1) overlapped = true
    await new Promise((resolve) => setTimeout(resolve, 300))
    active -= 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionBody()) })
  })
  await page.goto('/cuenta')
  const other = await page.context().newPage()
  await mockStoreInfo(other)
  await Promise.all([
    page.evaluate(async (url) => (await import(url)).renew(), SESSION),
    other.goto('/cuenta'),
  ])
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
  expect(overlapped).toBe(false)
})

// --- Ronda 1 de revisión (D62) ---

test('signing out while a slow renewal is in flight does not bring the session back', async ({ page }) => {
  const calls = await signedIn(page)
  await page.goto('/cuenta')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
  let refreshAnsweredAt = 0
  await page.unroute('**/api/v1/auth/refresh/')
  await page.route('**/api/v1/auth/refresh/', async (route) => {
    calls.refresh.push(route.request())
    await new Promise((resolve) => setTimeout(resolve, 1500))
    refreshAnsweredAt = Date.now()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionBody()) })
  })
  const logoutTimes: number[] = []
  await page.unroute('**/api/v1/auth/logout/')
  await page.route('**/api/v1/auth/logout/', async (route) => {
    logoutTimes.push(Date.now())
    await route.fulfill({ status: 204 })
  })
  // Una renovación lenta en vuelo y, enseguida, "Cerrar sesión".
  await page.evaluate((url) => {
    void import(url).then((module) => module.renew())
  }, SESSION)
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect.poll(() => refreshAnsweredAt).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  // La renovación que llegó tarde no abre otra vez la sesión, y la salida viaja con la cookie ya rotada.
  await expect(page.getByRole('link', { name: 'Cuenta', exact: true })).toBeVisible()
  expect(logoutTimes.length).toBeGreaterThan(0)
  expect(Math.max(...logoutTimes)).toBeGreaterThanOrEqual(refreshAnsweredAt)
})

test('a throttled or failing renewal keeps an open session', async ({ page }) => {
  await signedIn(page)
  await page.goto('/cuenta')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
  const replies: { status: number; headers: Record<string, string>; body: object }[] = [
    { status: 429, headers: { 'Retry-After': '30' }, body: { detail: 'x' } },
    { status: 500, headers: {}, body: { detail: 'x' } },
    { status: 503, headers: {}, body: { detail: 'x' } },
  ]
  for (const reply of replies) {
    await page.unroute('**/api/v1/auth/refresh/')
    await page.route('**/api/v1/auth/refresh/', (route) =>
      route.fulfill({ status: reply.status, headers: reply.headers, contentType: 'application/json', body: JSON.stringify(reply.body) }),
    )
    const renewed = await page.evaluate(async (url) => (await import(url)).renew(), SESSION)
    expect(renewed).toBe(false)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
  }
})

// --- Ronda 2 de revisión (D62) ---

test('an account request with an expired access and a throttled renewal fails without closing the session', async ({ page }) => {
  await signedIn(page)
  // El access dura menos que el margen de renovación: ya nace "vencido".
  await page.unroute('**/api/v1/auth/refresh/')
  await page.route('**/api/v1/auth/refresh/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionBody(undefined, { access_expires_in: 5 })) }),
  )
  let orderRequests = 0
  await page.route('**/api/v1/orders/', async (route) => {
    orderRequests += 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  // `/cuenta` pide sus pedidos al cargar (D69): aquí hace falta una vista de la cuenta que no pida `orders/`.
  await page.goto('/cuenta/datos')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')

  for (const status of [429, 503]) {
    await page.unroute('**/api/v1/auth/refresh/')
    await page.route('**/api/v1/auth/refresh/', (route) =>
      route.fulfill({ status, headers: status === 429 ? { 'Retry-After': '30' } : {}, contentType: 'application/json', body: '{"detail":"x"}' }),
    )
    const outcome = await page.evaluate(async (url) => {
      const { getJsonWithSession } = await import(url)
      try {
        await getJsonWithSession(['orders'])
        return 'ok'
      } catch (error) {
        return (error as { status?: number }).status
      }
    }, SESSION)
    // Un error que no es 401, sin llegar a pedir el recurso, y la sesión sigue abierta.
    expect(outcome).toBe(503)
    expect(orderRequests).toBe(0)
    await expect(page).toHaveURL(/\/cuenta\/datos$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
  }
})

test('two 401s in a row on an account request end the session', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/v1/orders/', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await page.goto('/cuenta')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
  const outcome = await page.evaluate(async (url) => {
    const { getJsonWithSession } = await import(url)
    try {
      await getJsonWithSession(['orders'])
      return 'ok'
    } catch (error) {
      return (error as { status?: number }).status
    }
  }, SESSION)
  expect(outcome).toBe(401)
  await expect(page).toHaveURL(/\/entrar$/)
})

test('without navigator.locks a just-rotated refresh is retried once', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }))
  await signedIn(page)
  let refreshes = 0
  await page.unroute('**/api/v1/auth/refresh/')
  await page.route('**/api/v1/auth/refresh/', async (route) => {
    refreshes += 1
    if (refreshes === 1) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'x', code: 'session_rotated' }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionBody()) })
  })
  await page.goto('/cuenta')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hola, Ana')
  expect(refreshes).toBeGreaterThanOrEqual(2)
})
