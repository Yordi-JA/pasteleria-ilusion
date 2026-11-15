/**
 * El calendario de la entrega (`GET /api/v1/delivery-slots/`, D66): cada día de un rango con sus lapsos y por qué no se
 * puede elegir. Pide sesión (JWT). Qué se puede elegir lo decide la API con su hora y las reglas de la pastelería
 * (anticipación por tipo de línea, cupo por lapso, días que se reservan); el navegador solo lo muestra.
 */
import { parseIsoDate } from './dates.ts'
import { getJsonWithSession } from './session.ts'

/** El tipo de cada línea del carrito, como lo nombra la API (`OrderLineKind`). */
export type LineKind = 'order' | 'showcase' | 'design'

/** `too_soon`: ya pasó o no alcanza la anticipación. `full`: "Lleno". */
export type SlotReason = 'too_soon' | 'full'
/** Además, `too_far`: después del último día que se reserva para el pedido. */
export type DayReason = SlotReason | 'too_far'

export type DeliverySlot = {
  /** "15:00", hora de la pastelería. */
  startsAt: string
  endsAt: string
  available: boolean
  reason: SlotReason | null
}

export type CalendarDay = {
  /** "AAAA-MM-DD". */
  date: string
  available: boolean
  reason: DayReason | null
  /** Vacío en los días `too_soon` y `too_far`. */
  slots: DeliverySlot[]
}

export type DeliveryCalendar = {
  start: string
  end: string
  /** El primer día con algún lapso que alcanza la anticipación; `null` si ya no hay. */
  earliestDate: string | null
  /** El último día que se reserva para este pedido. */
  latestDate: string
  days: CalendarDay[]
}

/** Lo más que se pide de una vez: un mes visible con sus semanas (el mismo tope que `MAX_CALENDAR_DAYS`). */
export const MAX_CALENDAR_DAYS = 42

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/
const SLOT_REASONS = new Set<string>(['too_soon', 'full'])
const DAY_REASONS = new Set<string>(['too_soon', 'full', 'too_far'])

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDate(value: unknown): value is string {
  return parseIsoDate(value) !== null
}

function reasonOf<T extends string>(value: unknown, known: Set<string>): T | null | undefined {
  if (value === null) return null
  return typeof value === 'string' && known.has(value) ? (value as T) : undefined
}

function parseSlot(data: unknown): DeliverySlot {
  if (!isRecord(data)) throw new TypeError('Un lapso no tiene la forma esperada.')
  const { starts_at: startsAt, ends_at: endsAt, available } = data
  const reason = reasonOf<SlotReason>(data.reason, SLOT_REASONS)
  if (typeof startsAt !== 'string' || !HH_MM.test(startsAt) || typeof endsAt !== 'string' || !HH_MM.test(endsAt)) {
    throw new TypeError('Un lapso no trae sus horas.')
  }
  if (typeof available !== 'boolean' || reason === undefined || available !== (reason === null)) {
    throw new TypeError('Un lapso no dice bien si se puede elegir.')
  }
  return { startsAt, endsAt, available, reason }
}

function parseDay(data: unknown): CalendarDay {
  if (!isRecord(data) || !isDate(data.date) || !Array.isArray(data.slots)) throw new TypeError('Un día no tiene la forma esperada.')
  const reason = reasonOf<DayReason>(data.reason, DAY_REASONS)
  if (typeof data.available !== 'boolean' || reason === undefined || data.available !== (reason === null)) {
    throw new TypeError('Un día no dice bien si se puede elegir.')
  }
  return { date: data.date, available: data.available, reason, slots: data.slots.map(parseSlot) }
}

/**
 * Valida la respuesta de la API. Una respuesta con otra forma es un `TypeError`: la pantalla la trata como una falla de
 * carga (nunca deja elegir un día o un lapso dudoso).
 */
export function parseDeliveryCalendar(data: unknown): DeliveryCalendar {
  if (!isRecord(data) || !isDate(data.start) || !isDate(data.end) || !isDate(data.latest_date) || !Array.isArray(data.days)) {
    throw new TypeError('El calendario no tiene la forma esperada.')
  }
  const earliest = data.earliest_date
  if (earliest !== null && !isDate(earliest)) throw new TypeError('El calendario no trae bien su primer día.')
  return {
    start: data.start,
    end: data.end,
    earliestDate: earliest,
    latestDate: data.latest_date,
    days: data.days.map(parseDay),
  }
}

export type CalendarQuery = { start: string; end: string; kinds: LineKind[] }

/** Pide el calendario de un rango para un pedido con esas líneas. */
export async function getDeliveryCalendar({ start, end, kinds }: CalendarQuery, signal?: AbortSignal): Promise<DeliveryCalendar> {
  const data = await getJsonWithSession(['delivery-slots'], { signal, query: { start, end, kind: kinds } })
  return parseDeliveryCalendar(data)
}
