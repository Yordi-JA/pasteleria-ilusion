/**
 * La fecha y la hora elegidas en la entrega (tanda 3), en `sessionStorage` como el borrador de "Diseña tu pastel": recargar
 * "¿Quién recoge?" no borra lo que se eligió en "Fecha y hora". Guarda el día tal como lo dio la API (con sus lapsos), el
 * periodo y la hora; nunca quién recoge (el nombre y el teléfono son datos de la cuenta). No decide nada: el calendario lo
 * vuelve a validar con la API en cuanto carga ese mes, y el servidor al crear el pedido. Leer y escribir va en `try/catch`:
 * con el almacenamiento bloqueado, lo elegido vive en memoria; con datos dañados, se empieza sin elegir. Va con la marca de la
 * cuenta que lo eligió (tanda 5, `owner.ts`): otra cuenta que entra en la pestaña no lo hereda.
 */
import { parseIsoDate } from './dates.ts'
import type { CalendarDay, DeliverySlot } from './deliveryCalendar.ts'
import { ownerClaim, parseOwner } from './owner.ts'

export const DELIVERY_CHOICE_KEY = 'ilusion.deliveryChoice.v1'

/** Los ids de los periodos del día (`PeriodId` de `deliverySchedule.ts`), repetidos aquí para no depender de la vista. */
const PERIOD_IDS = new Set(['morning', 'afternoon', 'night'])
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/
/** Un día de la API trae, como mucho, un lapso cada media hora. */
const MAX_SLOTS = 48

export type DeliveryChoice = {
  day: CalendarDay
  period: string | null
  /** "15:30", o `null` si todavía no se elige la hora. */
  slot: string | null
}

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSlot(value: unknown): DeliverySlot | null {
  if (!isRecord(value)) return null
  const { startsAt, endsAt, available, reason } = value
  if (typeof startsAt !== 'string' || !HH_MM.test(startsAt) || typeof endsAt !== 'string' || !HH_MM.test(endsAt)) return null
  if (typeof available !== 'boolean') return null
  if (available) return reason === null ? { startsAt, endsAt, available, reason } : null
  return reason === 'full' || reason === 'too_soon' ? { startsAt, endsAt, available, reason } : null
}

/** Lo guardado si tiene la forma esperada; un día que ya no se puede elegir no vale (`null`). */
export function parseDeliveryChoice(value: unknown): DeliveryChoice | null {
  if (!isRecord(value) || !isRecord(value.day)) return null
  const { date, slots } = value.day
  if (typeof date !== 'string' || !parseIsoDate(date) || !Array.isArray(slots) || slots.length > MAX_SLOTS) return null
  const parsed = slots.map(readSlot)
  if (parsed.some((slot) => slot === null)) return null
  const period = value.period === null || (typeof value.period === 'string' && PERIOD_IDS.has(value.period)) ? value.period : undefined
  const slot = value.slot === null || (typeof value.slot === 'string' && HH_MM.test(value.slot)) ? value.slot : undefined
  if (period === undefined || slot === undefined) return null
  return { day: { date, available: true, reason: null, slots: parsed as DeliverySlot[] }, period, slot }
}

/** Lo guardado sin validar y la cuenta que lo eligió; `null` sin nada guardado o con un JSON dañado. */
function readStored(): { raw: unknown; owner: string | null } | null {
  try {
    const stored = window.sessionStorage.getItem(DELIVERY_CHOICE_KEY)
    if (!stored) return null
    const raw: unknown = JSON.parse(stored)
    return { raw, owner: isRecord(raw) ? parseOwner(raw.owner) : null }
  } catch {
    return null
  }
}

/** Lo elegido, si lo hay; con la cuenta `account` abierta, nunca lo que eligió otra cuenta. */
export function readDeliveryChoice(account: string | null = null): DeliveryChoice | null {
  const stored = readStored()
  if (!stored || (account && ownerClaim(stored.owner, account) === 'discard')) return null
  return parseDeliveryChoice(stored.raw)
}

/** Guarda lo elegido con la cuenta que lo eligió (`owner`); `null` lo olvida (sin día elegido, o con el pedido ya creado). */
export function writeDeliveryChoice(choice: DeliveryChoice | null, owner: string | null = null) {
  try {
    if (choice) window.sessionStorage.setItem(DELIVERY_CHOICE_KEY, JSON.stringify(owner ? { ...choice, owner } : choice))
    else window.sessionStorage.removeItem(DELIVERY_CHOICE_KEY)
  } catch {
    // Sin almacenamiento, lo elegido vive en memoria durante la visita.
  }
}

/**
 * Al entrar la cuenta `account`, aunque la entrega no esté abierta (`ownerClaim`): lo que eligió otra cuenta se borra y lo
 * elegido sin cuenta queda con su marca.
 */
export function claimStoredDeliveryChoice(account: string) {
  const stored = readStored()
  if (!stored) return
  const claim = ownerClaim(stored.owner, account)
  if (claim === 'discard') writeDeliveryChoice(null)
  else if (claim === 'adopt') writeDeliveryChoice(parseDeliveryChoice(stored.raw), account)
}
