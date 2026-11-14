import type { Page, Request, Route } from '@playwright/test'

/** Simulación de la API de acceso (D62) sin Django: CSRF, renovación, entrada, registro, Google y salida. */

export const CSRF_TOKEN = 'token-csrf-de-prueba'

export const ana = { email: 'ana@correo.test', full_name: 'Ana López García', phone: '5512345678' }

export function sessionBody(user: object = ana, extra: object = {}) {
  return { access: 'access-de-prueba', access_expires_in: 600, user, ...extra }
}

type Reply = { status: number; body?: object; headers?: Record<string, string> }
type Handler = (request: Request) => Reply

const HINT = 'ilusion_session=1; Path=/; SameSite=Lax'
const CLEAR_HINT = 'ilusion_session=; Path=/; Max-Age=0; SameSite=Lax'

/** Una sesión abierta: el cuerpo y la pista que el backend pone junto a la cookie del refresh. */
export const opened = (body: object = sessionBody(), status = 200): Reply => ({ status, body, headers: { 'Set-Cookie': HINT } })
export const rejected = (status: number, body: object, headers: Record<string, string> = {}): Reply => ({ status, body, headers })

export type AuthMock = {
  refresh?: Handler
  login?: Handler
  register?: Handler
  google?: Handler
}

/** Lo que llegó a cada endpoint, para revisar cuerpos y encabezados. */
export type AuthCalls = Record<'csrf' | 'refresh' | 'login' | 'register' | 'google' | 'logout', Request[]>

async function fulfill(route: Route, { status, body, headers = {} }: Reply) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: body === undefined ? '' : JSON.stringify(body),
  })
}

/**
 * Responde los endpoints de `/api/v1/auth/`. Sin `refresh`, no hay sesión (401). Sin `login`, `register` o `google`,
 * responden la sesión de Ana. La cookie `csrftoken` se pone al pedir `auth/csrf/`, como Django.
 */
export async function mockAuth(page: Page, mock: AuthMock = {}): Promise<AuthCalls> {
  const calls: AuthCalls = { csrf: [], refresh: [], login: [], register: [], google: [], logout: [] }
  await page.route('**/api/v1/auth/csrf/', async (route) => {
    calls.csrf.push(route.request())
    await route.fulfill({ status: 204, headers: { 'Set-Cookie': `csrftoken=${CSRF_TOKEN}; Path=/; SameSite=Lax` } })
  })
  await page.route('**/api/v1/auth/refresh/', async (route) => {
    calls.refresh.push(route.request())
    const reply = mock.refresh?.(route.request()) ?? rejected(401, { detail: 'Tu sesión terminó. Vuelve a entrar.', code: 'session_expired' }, { 'Set-Cookie': CLEAR_HINT })
    await fulfill(route, reply)
  })
  for (const name of ['login', 'register', 'google'] as const) {
    await page.route(`**/api/v1/auth/${name}/`, async (route) => {
      calls[name].push(route.request())
      await fulfill(route, mock[name]?.(route.request()) ?? opened(sessionBody(), name === 'register' ? 201 : 200))
    })
  }
  await page.route('**/api/v1/auth/logout/', async (route) => {
    calls.logout.push(route.request())
    await route.fulfill({ status: 204, headers: { 'Set-Cookie': CLEAR_HINT } })
  })
  return calls
}

/** Como si el navegador ya tuviera una sesión: la pista y la cookie CSRF; `refresh` responde la sesión de Ana. */
export async function signedIn(page: Page, user: object = ana): Promise<AuthCalls> {
  // El mismo origen que `baseURL` de `playwright.config.ts`.
  const baseURL = `http://127.0.0.1:${process.env.E2E_PORT ?? '5173'}`
  await page.context().addCookies([
    { name: 'ilusion_session', value: '1', url: baseURL },
    { name: 'csrftoken', value: CSRF_TOKEN, url: baseURL },
  ])
  return mockAuth(page, { refresh: () => opened(sessionBody(user)) })
}

/**
 * Google Identity Services simulado: fija el client ID de las pruebas y sirve una librería falsa cuyo botón entrega
 * `credential` al pulsarlo. Con `fail`, la librería no carga.
 */
export async function mockGoogleIdentity(page: Page, { credential = 'credential-de-google', fail = false } = {}) {
  await page.addInitScript(() => Reflect.set(globalThis, '__googleClientId', '1234-prueba.apps.googleusercontent.com'))
  const loads: Request[] = []
  await page.route('https://accounts.google.com/gsi/client', async (route) => {
    loads.push(route.request())
    if (fail) {
      await route.abort()
      return
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: `
        (() => {
          let callback = null
          window.google = { accounts: { id: {
            initialize(config) { callback = config.callback; window.__gisConfig = config },
            renderButton(parent, options) {
              window.__gisOptions = options
              const button = document.createElement('button')
              button.type = 'button'
              button.textContent = options.text === 'signup_with' ? 'Registrarse con Google' : 'Continuar con Google'
              button.addEventListener('click', () => callback({ credential: ${JSON.stringify(credential)} }))
              parent.append(button)
            },
          } } }
        })()
      `,
    })
  })
  return loads
}

/** Sin client ID de Google, aunque quien corra las pruebas tenga uno en su `.env.local`. */
export async function withoutGoogle(page: Page) {
  await page.addInitScript(() => Reflect.set(globalThis, '__googleClientId', ''))
}
