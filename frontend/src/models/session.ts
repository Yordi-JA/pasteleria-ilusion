/**
 * Sesión del cliente (D15, D28, D62). El access token vive solo en la memoria de este módulo; el refresh lo pone el
 * backend en una cookie HttpOnly limitada a `/api/v1/auth/`, que el navegador manda solo. Nada de la sesión va a
 * `localStorage` ni a `sessionStorage`. Cada petición que pone o lee esa cookie lleva el token CSRF (`X-CSRFToken`).
 *
 * La renovación pasa por un candado del navegador (`navigator.locks`): con dos pestañas abiertas, la segunda espera a
 * que la primera rote la cookie y manda ya la nueva, en lugar de la vieja que el backend puso en la lista negra.
 */
import { ApiError, apiPath, REQUEST_TIMEOUT_MS } from './apiClient.ts'
import { resetPurchase } from './checkout.ts'

const API_BASE = '/api/v1/'

/** El mínimo de `AUTH_PASSWORD_VALIDATORS` del backend; `tests/test_settings.py` avisa si cambia allá. */
export const PASSWORD_MIN_LENGTH = 8

/** La cookie que el backend pone junto al refresh: legible, sin token, solo dice que vale la pena renovar. */
const SESSION_HINT_COOKIE = 'ilusion_session'
const CSRF_COOKIE = 'csrftoken'
/** Antes de que venza, el access se renueva con este margen. */
const RENEW_MARGIN_MS = 30_000
const REFRESH_LOCK = 'ilusion.session.refresh'
const CHANNEL = 'ilusion.session'

export type SessionUser = { email: string; fullName: string; phone: string | null }

/**
 * Sin sesión, `signedOutFrom` es la ruta donde la persona pulsó "Cerrar sesión" (aquí o en otra pestaña): esa ruta de
 * la cuenta lleva a la portada, no a `/entrar`. Se olvida al llegar a otra ruta (`acknowledgeSignOut`).
 * `logoutUnconfirmed`: la salida no llegó al servidor (sin red); la cookie del refresh puede seguir viva.
 */
export type SessionState =
  | { status: 'checking' }
  | { status: 'anonymous'; signedOutFrom?: string; logoutUnconfirmed?: boolean }
  | { status: 'authenticated'; user: SessionUser }

/** Un rechazo de la API de acceso, con el código que la pantalla convierte en frase. */
export class AuthRequestError extends Error {
  readonly status: number
  /** `invalid_credentials`, `locked_out`, `email_taken`, `google_invalid`... o `network`/`throttled`. */
  readonly code: string
  /** Errores por campo del registro, con sus mensajes en español tal como los manda el backend. */
  readonly fields: Record<string, string[]>
  readonly fieldCodes: Record<string, string[]>
  /** Segundos que pide esperar un 429 (`Retry-After`), si los dijo. */
  readonly retryAfterSeconds: number | null

  constructor(
    status: number,
    code: string,
    message = '',
    extra: { fields?: Record<string, string[]>; fieldCodes?: Record<string, string[]>; retryAfterSeconds?: number | null } = {},
  ) {
    super(message || code)
    this.name = 'AuthRequestError'
    this.status = status
    this.code = code
    this.fields = extra.fields ?? {}
    this.fieldCodes = extra.fieldCodes ?? {}
    this.retryAfterSeconds = extra.retryAfterSeconds ?? null
  }
}

// --- Estado observable ---

let state: SessionState = hasCookie(SESSION_HINT_COOKIE) ? { status: 'checking' } : { status: 'anonymous' }
let access: { token: string; expiresAt: number } | null = null
const listeners = new Set<() => void>()
let renewing: Promise<RenewResult> | null = null
/**
 * Sube cada vez que la sesión se cierra aquí. Una renovación que empezó antes y responde después ya no se aplica: si no,
 * "Cerrar sesión" con una renovación en vuelo dejaría la sesión abierta con la cookie nueva.
 */
let generation = 0
/** Espera antes de reintentar un refresh que otra pestaña acaba de rotar (sin `navigator.locks`). */
const ROTATED_RETRY_MS = 300
let channel: BroadcastChannel | null = null

export function getSessionState(): SessionState {
  return state
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setState(next: SessionState) {
  state = next
  for (const listener of listeners) listener()
}

function signOutLocally({ byPerson = false } = {}) {
  access = null
  generation += 1
  // La compra en curso es de esta cuenta: su llave y sus imágenes subidas no pasan a la siguiente (D66). También corre
  // con el aviso de salida de otra pestaña, que llega aquí.
  resetPurchase()
  setState({ status: 'anonymous', signedOutFrom: byPerson ? window.location.pathname : undefined })
}

/** Ya en otra ruta, "acaba de salir" deja de contar: entrar a la cuenta otra vez pide iniciar sesión. */
export function acknowledgeSignOut(pathname: string) {
  if (state.status === 'anonymous' && state.signedOutFrom && state.signedOutFrom !== pathname) {
    setState({ status: 'anonymous', logoutUnconfirmed: state.logoutUnconfirmed })
  }
}

// --- Cookies y CSRF ---

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

function hasCookie(name: string): boolean {
  return typeof document !== 'undefined' && Boolean(readCookie(name))
}

/** Borra la pista legible; la cookie del refresh es HttpOnly y solo la borra el backend. */
function forgetSessionHint() {
  document.cookie = `${SESSION_HINT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
}

/** El token CSRF de la cookie `csrftoken`; si no está, la pide primero (`GET auth/csrf/`). */
async function csrfToken(): Promise<string> {
  const current = readCookie(CSRF_COOKIE)
  if (current) return current
  await send('GET', ['auth', 'csrf'])
  const fresh = readCookie(CSRF_COOKIE)
  if (!fresh) throw new AuthRequestError(0, 'cookies_blocked')
  return fresh
}

// --- Peticiones ---

type Raw = Record<string, unknown>

function retryAfter(response: Response): number | null {
  const seconds = Number(response.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function asMessages(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** El cuerpo de un error de la API de acceso, en la forma de `AuthRequestError`. */
function toAuthError(response: Response, body: unknown): AuthRequestError {
  const raw: Raw = body !== null && typeof body === 'object' ? (body as Raw) : {}
  const retry = retryAfter(response)
  if (response.status === 429) {
    return new AuthRequestError(429, raw.code === 'locked_out' ? 'locked_out' : 'throttled', '', { retryAfterSeconds: retry })
  }
  const fields: Record<string, string[]> = {}
  const fieldCodes: Record<string, string[]> = {}
  const codes = raw.codes !== null && typeof raw.codes === 'object' ? (raw.codes as Raw) : {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'detail' || key === 'code' || key === 'codes') continue
    const messages = asMessages(value)
    if (messages.length > 0) {
      fields[key] = messages
      fieldCodes[key] = asMessages(codes[key])
    }
  }
  const code = typeof raw.code === 'string' ? raw.code : Object.keys(fields).length > 0 ? 'invalid_fields' : `http_${response.status}`
  return new AuthRequestError(response.status, code, typeof raw.detail === 'string' ? raw.detail : '', { fields, fieldCodes })
}

async function send(method: 'GET' | 'POST', segments: string[], body?: unknown, headers: Record<string, string> = {}): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${apiPath(...segments)}`, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new AuthRequestError(0, 'network')
  }
  if (response.status === 204) return null
  const data: unknown = await response.json().catch(() => undefined)
  if (!response.ok) throw toAuthError(response, data)
  return data
}

/** Una petición que pone o lee la cookie del refresh: siempre con CSRF. */
async function sendWithCsrf(segments: string[], body: unknown = {}): Promise<unknown> {
  return send('POST', segments, body, { 'X-CSRFToken': await csrfToken() })
}

function parseUser(data: unknown): SessionUser {
  const raw = data !== null && typeof data === 'object' ? (data as Raw) : {}
  if (typeof raw.email !== 'string') throw new TypeError('La sesión no trae el correo.')
  return {
    email: raw.email,
    fullName: typeof raw.full_name === 'string' ? raw.full_name : '',
    phone: typeof raw.phone === 'string' && raw.phone ? raw.phone : null,
  }
}

/** Guarda el access en memoria y publica la cuenta. Devuelve el cuerpo para quien necesite más (Google). */
function applySession(data: unknown): Raw {
  const raw = data !== null && typeof data === 'object' ? (data as Raw) : {}
  if (typeof raw.access !== 'string' || typeof raw.access_expires_in !== 'number') {
    throw new TypeError('La sesión no trae el access token.')
  }
  access = { token: raw.access, expiresAt: Date.now() + raw.access_expires_in * 1000 }
  setState({ status: 'authenticated', user: parseUser(raw.user) })
  return raw
}

// --- Entre pestañas ---

type ChannelMessage = 'login' | 'logout'

function broadcast(message: ChannelMessage) {
  channel?.postMessage(message)
}

/** Las otras pestañas siguen la entrada y la salida: al salir sueltan su access; al entrar, renuevan con la cookie. */
function listenToOtherTabs() {
  if (channel || typeof BroadcastChannel === 'undefined') return
  channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
    if (event.data === 'logout') signOutLocally({ byPerson: true })
    else if (event.data === 'login' && state.status !== 'authenticated') void renew()
  }
}

// --- Operaciones ---

/** Sin red, con el límite de peticiones de la IP (429) o con el servidor caído (5xx): puede salir bien después. */
function isTransient(error: unknown): boolean {
  return error instanceof AuthRequestError && (error.code === 'network' || error.code === 'throttled' || error.status >= 500)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** El refresh con un reintento si otra pestaña lo acaba de rotar (la cookie ya es la nueva). */
async function sendRefresh(): Promise<unknown> {
  try {
    return await sendWithCsrf(['auth', 'refresh'])
  } catch (error) {
    // Con `navigator.locks` casi no pasa; sin él (el sitio abierto por `http://<IP>`), dos pestañas pueden cruzarse.
    if (!(error instanceof AuthRequestError && error.code === 'session_rotated')) throw error
    await wait(ROTATED_RETRY_MS)
    return sendWithCsrf(['auth', 'refresh'])
  }
}

/** `ok`: hay sesión; `rejected`: el backend la terminó o la persona salió; `transient`: sin red, 429 o 5xx, puede salir bien después. */
type RenewResult = 'ok' | 'rejected' | 'transient'

/** Renueva con la cookie del refresh. `true` si hay sesión; la misma promesa para llamadas simultáneas. */
export async function renew(): Promise<boolean> {
  return (await renewOutcome()) === 'ok'
}

function renewOutcome(): Promise<RenewResult> {
  renewing ??= withRefreshLock<RenewResult>(async () => {
    const startedAt = generation
    let data: unknown
    try {
      data = await sendRefresh()
    } catch (error) {
      // Si la persona ya salió mientras tanto, no hay nada que cerrar (y se conserva desde dónde salió).
      if (generation !== startedAt) return 'rejected'
      // Lo pasajero deja abierta una sesión ya abierta (el siguiente intento puede salir bien); al cargar, se sigue
      // como visitante. Un rechazo del backend (401, 403) termina la sesión.
      const transient = isTransient(error)
      if (!(transient && state.status === 'authenticated')) signOutLocally()
      return transient ? 'transient' : 'rejected'
    }
    if (generation !== startedAt) {
      // La persona salió mientras llegaba: no se aplica, y la cookie recién rotada también se cierra.
      await sendWithCsrf(['auth', 'logout']).catch(() => undefined)
      return 'rejected'
    }
    applySession(data)
    return 'ok'
  }).finally(() => {
    renewing = null
  })
  return renewing
}

function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  return locks ? locks.request(REFRESH_LOCK, task) : task()
}

/** Al cargar el sitio: si la pista dice que hay sesión, la recupera; si no, queda como visitante sin pedir nada. */
export async function restoreSession(): Promise<void> {
  listenToOtherTabs()
  if (!hasCookie(SESSION_HINT_COOKIE)) {
    if (state.status !== 'authenticated') setState({ status: 'anonymous' })
    return
  }
  if (state.status === 'authenticated') return
  await renew()
}

export async function login(email: string, password: string): Promise<SessionUser> {
  applySession(await sendWithCsrf(['auth', 'login'], { email, password }))
  broadcast('login')
  return currentUser()
}

export type RegistrationInput = { fullName: string; email: string; phone: string; password: string; acceptsTerms: boolean }

export async function register(input: RegistrationInput): Promise<SessionUser> {
  applySession(
    await sendWithCsrf(['auth', 'register'], {
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      password: input.password,
      accepts_terms: input.acceptsTerms,
    }),
  )
  broadcast('login')
  return currentUser()
}

/** Entra con el `credential` de Google Identity Services. `passwordRemoved`: la contraseña anterior dejó de servir. */
export async function loginWithGoogle(credential: string): Promise<{ user: SessionUser; passwordRemoved: boolean }> {
  const raw = applySession(await sendWithCsrf(['auth', 'google'], { credential }))
  broadcast('login')
  return { user: currentUser(), passwordRemoved: raw.password_removed === true }
}

/**
 * Sale aunque la red falle: la sesión local se borra en el acto (y una renovación en vuelo ya no se aplica). La salida
 * al servidor espera el candado de la renovación, así viaja con la cookie más reciente. Si no llega, se borra la pista y
 * el estado lo dice (`logoutUnconfirmed`), porque la cookie del refresh puede seguir viva en este navegador.
 */
export async function logout(): Promise<void> {
  signOutLocally({ byPerson: true })
  broadcast('logout')
  try {
    await withRefreshLock(() => sendWithCsrf(['auth', 'logout']))
    if (state.status === 'anonymous' && state.logoutUnconfirmed) setState({ ...state, logoutUnconfirmed: undefined })
  } catch {
    forgetSessionHint()
    if (state.status === 'anonymous') setState({ ...state, logoutUnconfirmed: true })
  }
}

function currentUser(): SessionUser {
  if (state.status !== 'authenticated') throw new Error('Sin sesión.')
  return state.user
}

/** La generación de la sesión: cambia cada vez que se cierra aquí. Quien espera una respuesta la guarda antes de pedir. */
export function sessionGeneration(): number {
  return generation
}

/**
 * La cuenta cambió sus datos en "Datos y avisos" (D72): la sesión publica el nombre y el teléfono nuevos, así el saludo
 * del encabezado cambia sin pedir otra vez la sesión. `startedAt` es la generación de cuando se mandó el cambio: si la
 * sesión se cerró (o se abrió otra cuenta) mientras tanto, el cambio no se aplica. Sin sesión no hace nada. El correo no
 * cambia.
 */
export function updateSessionUser(changes: Partial<Omit<SessionUser, 'email'>>, startedAt: number) {
  if (state.status !== 'authenticated' || generation !== startedAt) return
  setState({ status: 'authenticated', user: { ...state.user, ...changes } })
}

/**
 * Cambia la contraseña (`POST auth/password/`, D72): con el access y con CSRF, porque la respuesta pone la cookie del
 * refresh. El backend cierra todas las sesiones de la cuenta y responde una nueva, que se aplica aquí como al entrar:
 * esta pestaña sigue y las otras del navegador renuevan con la cookie nueva al primer 401. Va bajo el candado de la
 * renovación, para que otra pestaña no rote la cookie vieja mientras tanto. Un 401 renueva una vez y reintenta; un
 * segundo 401 cierra la sesión. Los errores por campo llegan en `AuthRequestError.fields` (`current_password`,
 * `new_password`).
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<SessionUser> {
  const startedAt = generation
  const body = { current_password: currentPassword, new_password: newPassword }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await freshAccess()
    if (token === 'transient') throw new AuthRequestError(0, 'network')
    if (!token) break
    let data: unknown
    try {
      data = await withRefreshLock(async () =>
        send('POST', ['auth', 'password'], body, { Authorization: `Bearer ${token}`, 'X-CSRFToken': await csrfToken() }),
      )
    } catch (error) {
      if (!(error instanceof AuthRequestError && error.status === 401)) throw error
      if (attempt === 1) break
      // Solo se olvida el access que falló: otra petición pudo traer uno nuevo mientras tanto.
      if (access?.token === token) access = null
      continue
    }
    if (generation !== startedAt) {
      // La persona salió mientras llegaba: la cookie nueva también se cierra.
      await sendWithCsrf(['auth', 'logout']).catch(() => undefined)
      throw new AuthRequestError(401, 'session_expired')
    }
    applySession(data)
    return currentUser()
  }
  signOutLocally()
  throw new AuthRequestError(401, 'session_expired')
}

/** El access vigente, renovado antes si está por vencer; `null` sin sesión; `'transient'` si la renovación no pudo hacerse. */
async function freshAccess(): Promise<string | null | 'transient'> {
  if (access && access.expiresAt - Date.now() > RENEW_MARGIN_MS) return access.token
  if (state.status === 'anonymous') return null
  const outcome = await renewOutcome()
  if (outcome === 'transient') return 'transient'
  return outcome === 'ok' && access ? access.token : null
}

/** Lo que acepta `requestWithSession`. `query` admite listas (`?kind=order&kind=design`). */
export type SessionRequest = {
  /** `PATCH` cambia los datos de la cuenta (D72). */
  method?: 'GET' | 'POST' | 'PATCH'
  query?: Record<string, string | string[]>
  /** El cuerpo JSON de un `POST`. */
  json?: unknown
  /** El cuerpo multipart de una subida (el navegador pone el `Content-Type` con su separador). */
  form?: FormData
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Corte propio, por ejemplo para subir una imagen grande; por omisión, 10 s. */
  timeoutMs?: number
  /**
   * `blob`: la respuesta exitosa es un archivo (la nota en PDF, D69) y `body` es un `Blob`; un error sigue leyéndose
   * como JSON. Por omisión, JSON.
   */
  as?: 'json' | 'blob'
  /** `false` para una ruta de Django sin barra final, como `orders/<id>/note.pdf`. Por omisión, con barra. */
  trailingSlash?: boolean
}

/** La respuesta de un recurso de la cuenta: el código y el JSON sin validar (`null` sin cuerpo). */
export type SessionResponse = { status: number; body: unknown }

function searchOf(query: SessionRequest['query']): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item)
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/**
 * Pide o envía un recurso de la cuenta (pedidos, agenda, imágenes) con `Authorization: Bearer`. Un 401 renueva una vez
 * y reintenta (con el mismo cuerpo: el servidor no hizo nada con el 401); un segundo 401 o un refresh rechazado
 * terminan la sesión; una renovación pasajera falla con 503 sin cerrarla. Una respuesta fuera de 2xx es un `ApiError`
 * con su cuerpo, para que quien llama lea los errores por campo. Los endpoints con JWT no piden CSRF: el token no viaja
 * solo como una cookie. Se corta a los 10 s (o `timeoutMs`), además de la señal de quien llama; sin red, `fetch` lanza.
 */
export async function requestWithSession(segments: string[], init: SessionRequest = {}): Promise<SessionResponse> {
  const slashed = apiPath(...segments)
  const path = init.trailingSlash === false ? slashed.slice(0, -1) : slashed
  const method = init.method ?? 'GET'
  const timeout = AbortSignal.timeout(init.timeoutMs ?? REQUEST_TIMEOUT_MS)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  const body = init.form ?? (init.json === undefined ? undefined : JSON.stringify(init.json))
  const contentType: Record<string, string> = init.json === undefined ? {} : { 'Content-Type': 'application/json' }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await freshAccess()
    // Sin red, con límite de peticiones o con el servidor caído no se sabe si la sesión sigue: se falla sin cerrarla.
    if (token === 'transient') throw new ApiError(503, path, method)
    if (!token) break
    const response = await fetch(`${API_BASE}${path}${searchOf(init.query)}`, {
      method,
      headers: { Accept: 'application/json', ...contentType, ...init.headers, Authorization: `Bearer ${token}` },
      body,
      signal,
    })
    if (response.status === 401) {
      if (attempt === 1) break
      // Solo se olvida el access que falló: otra petición pudo traer uno nuevo mientras tanto.
      if (access?.token === token) access = null
      continue
    }
    if (!response.ok) throw new ApiError(response.status, path, method, await response.json().catch(() => undefined))
    if (response.status === 204) return { status: response.status, body: null }
    const data: unknown = init.as === 'blob' ? await response.blob() : await response.json().catch(() => undefined)
    return { status: response.status, body: data }
  }
  signOutLocally()
  throw new ApiError(401, path, method)
}

/**
 * Pide un recurso de la cuenta (por ejemplo, "Mis pedidos") y devuelve su JSON sin validar. Es `requestWithSession`
 * con `GET`: las mismas reglas de renovación, cierre y corte.
 */
export async function getJsonWithSession(
  segments: string[],
  init: { signal?: AbortSignal; query?: SessionRequest['query'] } = {},
): Promise<unknown> {
  return (await requestWithSession(segments, init)).body
}
