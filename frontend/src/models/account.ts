/**
 * "Datos y avisos" de la cuenta (D72): `GET` y `PATCH account/`, con JWT y solo de quien inició sesión. El correo no se
 * cambia; la preferencia de WhatsApp necesita teléfono (el backend lo revisa). Al guardar, la sesión publica el nombre
 * nuevo para el saludo del encabezado. Una respuesta con otra forma es un `TypeError`.
 */
import { ApiError } from './apiClient.ts'
import { getJsonWithSession, requestWithSession, sessionGeneration, updateSessionUser } from './session.ts'

export type Account = {
  email: string
  fullName: string
  /** 10 dígitos, o `null` sin teléfono. */
  phone: string | null
  /** Tiene contraseña: solo entonces puede cambiarla aquí. */
  hasPassword: boolean
  googleLinked: boolean
  notifyWhatsapp: boolean
}

export type AccountChanges = { fullName: string; phone: string; notifyWhatsapp: boolean }

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw => value !== null && typeof value === 'object' && !Array.isArray(value)

function flag(raw: Raw, key: string): boolean {
  const value = raw[key]
  if (typeof value !== 'boolean') throw new TypeError(`La cuenta no trae "${key}".`)
  return value
}

export function parseAccount(data: unknown): Account {
  if (!isRaw(data) || typeof data.email !== 'string' || data.email === '') throw new TypeError('La cuenta no tiene la forma esperada.')
  return {
    email: data.email,
    fullName: typeof data.full_name === 'string' ? data.full_name : '',
    phone: typeof data.phone === 'string' && data.phone !== '' ? data.phone : null,
    hasPassword: flag(data, 'has_password'),
    googleLinked: flag(data, 'google_linked'),
    notifyWhatsapp: flag(data, 'notify_whatsapp'),
  }
}

export async function getAccount(signal: AbortSignal): Promise<Account> {
  return parseAccount(await getJsonWithSession(['account'], { signal }))
}

/** Guarda los tres datos y devuelve la cuenta como quedó; la sesión toma el nombre y el teléfono nuevos si sigue siendo la misma. */
export async function updateAccount(changes: AccountChanges): Promise<Account> {
  const startedAt = sessionGeneration()
  const { body } = await requestWithSession(['account'], {
    method: 'PATCH',
    json: { full_name: changes.fullName, phone: changes.phone, notify_whatsapp: changes.notifyWhatsapp },
  })
  const account = parseAccount(body)
  // Si la sesión se cerró mientras llegaba, el saludo de otra cuenta no toma este nombre.
  updateSessionUser({ fullName: account.fullName, phone: account.phone }, startedAt)
  return account
}

/** Los errores por campo de un 400 de `PATCH account/` (`{"phone": ["..."]}`), o `null` si no es un 400 con campos. */
export function accountFieldErrors(error: unknown): Record<string, string[]> | null {
  if (!(error instanceof ApiError) || error.status !== 400 || !isRaw(error.body)) return null
  const fields: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(error.body)) {
    const messages = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    if (messages.length > 0) fields[key] = messages
  }
  return Object.keys(fields).length > 0 ? fields : null
}
