import type { Page, Request, Route } from '@playwright/test'

/**
 * Simulación de la API de acceso (D62) sin Django: CSRF, renovación, entrada, registro, Google y salida; y los enlaces
 * por correo (D76): confirmar la cuenta, reenviarla y recuperar la contraseña.
 */

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

/** El registro (D76): crea la cuenta sin confirmar, no abre sesión y dice a qué correo fue el enlace. */
export const registered = (email = ana.email, hours = 24): Reply => ({ status: 201, body: { email, expires_in_hours: hours } })

export const RESEND_ANSWER = 'Si tu cuenta está pendiente de confirmar, te enviamos otro enlace.'
export const RESET_ANSWER = 'Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva.'
export const INVALID_LINK = { detail: 'Este enlace ya no sirve: venció, ya se usó o está incompleto.', code: 'invalid_link' }

export type AuthMock = {
  refresh?: Handler
  login?: Handler
  register?: Handler
  google?: Handler
  verify?: Handler
  verifyResend?: Handler
  passwordReset?: Handler
  passwordResetConfirm?: Handler
}

type Endpoint = 'csrf' | 'refresh' | 'login' | 'register' | 'google' | 'logout' | 'verify' | 'verifyResend' | 'passwordReset' | 'passwordResetConfirm'

/** Lo que llegó a cada endpoint, para revisar cuerpos y encabezados. */
export type AuthCalls = Record<Endpoint, Request[]>

/**
 * Sin `handler`, la respuesta de cada endpoint de los enlaces (D76): confirmar la cuenta no abre sesión ni pone cookies;
 * crear la contraseña nueva abre la sesión de Ana.
 */
const LINK_ENDPOINTS: { name: 'verify' | 'verifyResend' | 'passwordReset' | 'passwordResetConfirm'; path: string; reply: () => Reply }[] = [
  { name: 'verify', path: 'verify/', reply: () => ({ status: 200, body: { email_verified: true } }) },
  { name: 'verifyResend', path: 'verify/resend/', reply: () => ({ status: 200, body: { detail: RESEND_ANSWER, expires_in_hours: 24 } }) },
  { name: 'passwordReset', path: 'password/reset/', reply: () => ({ status: 200, body: { detail: RESET_ANSWER, expires_in_hours: 1 } }) },
  { name: 'passwordResetConfirm', path: 'password/reset/confirm/', reply: () => opened() },
]

async function fulfill(route: Route, { status, body, headers = {} }: Reply) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: body === undefined ? '' : JSON.stringify(body),
  })
}

/**
 * Responde los endpoints de `/api/v1/auth/`. Sin `refresh`, no hay sesión (401). Sin `login` o `google`, responden la
 * sesión de Ana; sin `register`, la cuenta creada sin confirmar (D76). Sin los de los enlaces, sus respuestas de siempre.
 * La cookie `csrftoken` se pone al pedir `auth/csrf/`, como Django.
 */
export async function mockAuth(page: Page, mock: AuthMock = {}): Promise<AuthCalls> {
  const calls: AuthCalls = {
    csrf: [],
    refresh: [],
    login: [],
    register: [],
    google: [],
    logout: [],
    verify: [],
    verifyResend: [],
    passwordReset: [],
    passwordResetConfirm: [],
  }
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
      await fulfill(route, mock[name]?.(route.request()) ?? (name === 'register' ? registered() : opened()))
    })
  }
  for (const { name, path, reply } of LINK_ENDPOINTS) {
    await page.route(`**/api/v1/auth/${path}`, async (route) => {
      calls[name].push(route.request())
      await fulfill(route, mock[name]?.(route.request()) ?? reply())
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
