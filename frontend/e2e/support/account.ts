import type { Page, Request, Route } from '@playwright/test'
import { ana, sessionBody } from './auth.ts'

/** Simulación de "Datos y avisos" (D72) sin Django: `GET` y `PATCH account/` y `POST auth/password/`. */

export const anaAccount = {
  email: ana.email,
  full_name: ana.full_name,
  phone: ana.phone,
  has_password: true,
  google_linked: false,
  notify_whatsapp: false,
}

/** Una cuenta solo de Google: sin contraseña y sin teléfono. */
export const ginaUser = { email: 'gina@gmail.com', full_name: 'Gina Soto', phone: null }
export const ginaAccount = { ...ginaUser, has_password: false, google_linked: true, notify_whatsapp: false }

export type AccountReply = { status: number; body?: object; headers?: Record<string, string>; delayMs?: number }
type Handler = (request: Request) => AccountReply

export type AccountMock = { get?: Handler; patch?: Handler; password?: Handler }
export type AccountCalls = { get: Request[]; patch: Request[]; password: Request[] }

/** La sesión nueva que deja el cambio de contraseña: otro access y la pista de la cookie. */
export const NEW_ACCESS = 'access-tras-cambiar-la-contrasena'

async function fulfill(route: Route, { status, body, headers = {}, delayMs = 0 }: AccountReply) {
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
  await route.fulfill({ status, contentType: 'application/json', headers, body: body === undefined ? '' : JSON.stringify(body) })
}

/**
 * Responde la cuenta. Sin `patch`, guarda lo que llega y responde la cuenta cambiada (un teléfono vacío vuelve como
 * `null`). Sin `password`, cambia la contraseña y responde una sesión nueva con `NEW_ACCESS`.
 */
export async function mockAccount(page: Page, account: object = anaAccount, mock: AccountMock = {}): Promise<AccountCalls> {
  const calls: AccountCalls = { get: [], patch: [], password: [] }
  let current: Record<string, unknown> = { ...account }
  await page.route('**/api/v1/account/', async (route) => {
    const request = route.request()
    if (request.method() === 'PATCH') {
      calls.patch.push(request)
      const reply = mock.patch?.(request)
      if (reply) return fulfill(route, reply)
      const changes = request.postDataJSON() as Record<string, unknown>
      current = { ...current, ...changes, phone: changes.phone === '' ? null : (changes.phone ?? current.phone) }
      return fulfill(route, { status: 200, body: current })
    }
    calls.get.push(request)
    return fulfill(route, mock.get?.(request) ?? { status: 200, body: current })
  })
  await page.route('**/api/v1/auth/password/', async (route) => {
    calls.password.push(route.request())
    const user = { email: current.email, full_name: current.full_name, phone: current.phone }
    const reply = mock.password?.(route.request()) ?? {
      status: 200,
      body: sessionBody(user, { access: NEW_ACCESS }),
      headers: { 'Set-Cookie': 'ilusion_session=1; Path=/; SameSite=Lax' },
    }
    return fulfill(route, reply)
  })
  return calls
}
