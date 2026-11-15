/**
 * Los rechazos al crear el pedido en frases para la pantalla (D66), sin React. El servidor ya manda sus mensajes en
 * español (lapso lleno, existencias, topes por cliente, días a futuro, quién recoge): se muestran tal cual, bajo su
 * campo o en el aviso. Lo que no trae mensaje (sin red, 429, 5xx) se dice aquí.
 */
import { ApiError } from '../models/apiClient.ts'

export type OrderErrorsView = {
  title: string
  /** Lo que va en el aviso, en orden. */
  messages: string[]
  pickupName?: string
  pickupPhone?: string
  /** Bajo la fecha y la hora: un lapso lleno o una fecha que ya no alcanza. */
  schedule?: string
  /** El horario cambió en el servidor: hay que volver a pedir el calendario. */
  reloadSchedule: boolean
}

export const NETWORK_MESSAGE = 'No pudimos conectar con la pastelería. Revisa tu conexión y vuelve a intentarlo: tu pedido no se duplica.'
export const THROTTLED_MESSAGE = 'Hiciste varios pedidos seguidos. Espera unos minutos y vuelve a intentarlo.'
export const SESSION_MESSAGE = 'Tu sesión terminó. Vuelve a entrar para hacer tu pedido.'
const TITLE = 'No pudimos crear tu pedido'

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Todos los mensajes de un error de DRF, también los anidados (`items.1.design.decoration`), en orden. */
export function messagesIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(messagesIn)
  if (isRecord(value)) return Object.values(value).flatMap(messagesIn)
  return []
}

function first(value: unknown): string | undefined {
  return messagesIn(value)[0]
}

/** Solo el mensaje de lo que pasó, para un aviso sin campos (sin red, límite de peticiones, un pedido vencido). */
export function plainError(message: string): OrderErrorsView {
  return { title: TITLE, messages: [message], reloadSchedule: false }
}

/** Una línea del pedido que no se pudo preparar en el navegador (por ejemplo, su imagen ya no está). */
export function lineError(name: string, message: string): OrderErrorsView {
  return plainError(`${name}: ${message}`)
}

/**
 * Convierte el error de crear el pedido (o de subir sus imágenes) en lo que muestra la pantalla. `lineNames` son los
 * nombres de las líneas en el orden del carrito, para decir de cuál habla un error de `items`.
 */
export function orderErrorsFrom(error: unknown, lineNames: string[], imageLine?: string): OrderErrorsView {
  if (!(error instanceof ApiError)) return plainError(NETWORK_MESSAGE)
  if (error.status === 429) return plainError(THROTTLED_MESSAGE)
  if (error.status === 401) return plainError(SESSION_MESSAGE)
  if (error.status !== 400 && error.status !== 413) return plainError(NETWORK_MESSAGE)
  const body = isRecord(error.body) ? error.body : {}
  // Una imagen rechazada (tipo, tamaño, megapíxeles, demasiadas sin pedido): dice de qué pastel.
  if (imageLine !== undefined) {
    const message = first(body.image) ?? first(body) ?? 'No pudimos subir tu imagen.'
    return plainError(`${imageLine}: ${message}`)
  }
  const view: OrderErrorsView = { title: TITLE, messages: [], reloadSchedule: false }
  for (const [field, value] of Object.entries(body)) {
    if (field === 'pickup_name') view.pickupName = first(value)
    else if (field === 'pickup_phone') view.pickupPhone = first(value)
    else if (field === 'slot_starts_at' || field === 'delivery_date') {
      view.schedule ??= first(value)
      view.reloadSchedule = true
    } else if (field === 'items' && (isRecord(value) || Array.isArray(value))) {
      // Los errores de la creación llegan por posición (`{"1": ...}`); los de formato de DRF, como lista (`[{}, {...}]`).
      for (const [index, line] of Object.entries(value)) {
        const name = lineNames[Number(index)]
        for (const message of messagesIn(line)) view.messages.push(name ? `${name}: ${message}` : message)
      }
    } else view.messages.push(...messagesIn(value))
  }
  if (view.schedule) view.messages.unshift(view.schedule)
  if (view.pickupName) view.messages.push(view.pickupName)
  if (view.pickupPhone) view.messages.push(view.pickupPhone)
  if (view.messages.length === 0) view.messages.push(NETWORK_MESSAGE)
  return view
}
