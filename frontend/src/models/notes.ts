/**
 * La verificación pública de una nota (D69): `GET notes/<token>/`, sin sesión. Solo se lee lo que la pantalla muestra:
 * aunque la respuesta trajera teléfono, correo o dirección, no pasan de aquí.
 */
import { ApiError, getJson } from './apiClient.ts'
import { PRICE_PATTERN } from './money.ts'

export type NoteStand = {
  kg: number
  deposit: string
  /** `null` mientras el pedido no se entrega: la base todavía no se presta. */
  status: 'on_loan' | 'returned' | null
  statusLabel: string | null
  returnBy: string
  returnedAt: string | null
}

export type Note = {
  orderId: number
  createdAt: string
  customer: string
  delivery: { fulfillmentLabel: string; date: string; startsAt: string; endsAt: string }
  stands: NoteStand[]
}

/** Por qué no hay nota que mostrar: `invalid` (404), `throttled` (429) o `unavailable` (sin red o falla del servidor). */
export type NoteFailure = 'invalid' | 'throttled' | 'unavailable'

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw => value !== null && typeof value === 'object' && !Array.isArray(value)

function text(raw: Raw, key: string): string {
  const value = raw[key]
  if (typeof value !== 'string' || value === '') throw new TypeError(`La nota no trae "${key}".`)
  return value
}

function parseStand(data: unknown): NoteStand {
  if (!isRaw(data)) throw new TypeError('Una base de la nota no tiene la forma esperada.')
  const status = data.status
  if (status !== null && status !== 'on_loan' && status !== 'returned') throw new TypeError('Una base de la nota trae un estado desconocido.')
  const deposit = text(data, 'deposit')
  if (!PRICE_PATTERN.test(deposit)) throw new TypeError('Una base de la nota trae un depósito no válido.')
  if (typeof data.kg !== 'number' || !Number.isInteger(data.kg) || data.kg < 1) throw new TypeError('Una base de la nota no trae los kilos.')
  return {
    kg: data.kg,
    deposit,
    status,
    statusLabel: status === null ? null : text(data, 'status_label'),
    returnBy: text(data, 'return_by'),
    returnedAt: typeof data.returned_at === 'string' && data.returned_at !== '' ? data.returned_at : null,
  }
}

export function parseNote(data: unknown): Note {
  if (!isRaw(data) || data.valid !== true) throw new TypeError('La nota no tiene la forma esperada.')
  const delivery = data.delivery
  if (!isRaw(delivery) || typeof data.order_id !== 'number' || !Array.isArray(data.stands)) throw new TypeError('La nota está incompleta.')
  return {
    orderId: data.order_id,
    createdAt: text(data, 'created_at'),
    customer: text(data, 'customer'),
    delivery: {
      fulfillmentLabel: text(delivery, 'fulfillment_label'),
      date: text(delivery, 'date'),
      startsAt: text(delivery, 'starts_at'),
      endsAt: text(delivery, 'ends_at'),
    },
    stands: data.stands.map(parseStand),
  }
}

/** Pide la nota. Un 404 es una nota no válida y un 429, demasiadas consultas; lo demás, que no se pudo verificar. */
export async function getNote(token: string, signal: AbortSignal): Promise<Note> {
  try {
    return parseNote(await getJson(['notes', token], { signal }))
  } catch (error) {
    if (signal.aborted) throw error
    throw new NoteError(error instanceof ApiError && error.status === 404 ? 'invalid' : error instanceof ApiError && error.status === 429 ? 'throttled' : 'unavailable')
  }
}

export class NoteError extends Error {
  readonly failure: NoteFailure

  constructor(failure: NoteFailure) {
    super(`No se pudo verificar la nota: ${failure}`)
    this.name = 'NoteError'
    this.failure = failure
  }
}
