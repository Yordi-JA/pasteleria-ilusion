/**
 * El calendario y los horarios de la entrega como los muestra la pantalla (D66), sin React: el mes con sus días, los
 * lapsos agrupados en mañana, tarde y noche y las horas como en el mockup ("2:00 pm"). Qué se puede elegir lo dice la API;
 * aquí solo se acomoda.
 */
import type { CartItem } from '../models/cart.ts'
import { formatDateInSentence, formatTodayDate, parseIsoDate } from '../models/dates.ts'
import type { CalendarDay, DeliveryCalendar, DeliverySlot, LineKind } from '../models/deliveryCalendar.ts'
import { lineKind } from '../models/orders.ts'

/** Un mes del calendario; `month` va de 1 a 12. */
export type MonthRef = { year: number; month: number }

export function monthOf(isoDate: string): MonthRef {
  const parsed = parseIsoDate(isoDate)
  if (!parsed) throw new RangeError(`Fecha no válida: ${isoDate}`)
  return { year: parsed.year, month: parsed.month }
}

export function addMonths({ year, month }: MonthRef, count: number): MonthRef {
  const index = year * 12 + (month - 1) + count
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function sameMonth(a: MonthRef, b: MonthRef): boolean {
  return a.year === b.year && a.month === b.month
}

const pad = (value: number) => String(value).padStart(2, '0')

function daysIn({ year, month }: MonthRef): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isoDate({ year, month }: MonthRef, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

/** El primer y el último día del mes: lo que se pide a la API (como mucho 31 días, dentro del tope de 42). */
export function monthRange(month: MonthRef): { start: string; end: string } {
  return { start: isoDate(month, 1), end: isoDate(month, daysIn(month)) }
}

/** Cómo se ve un día: elegible, elegido, lleno o no disponible (ya pasó, no alcanza la anticipación o está muy lejos). */
export type DayState = 'available' | 'selected' | 'full' | 'unavailable'

export type DayCell = {
  date: string
  day: number
  state: DayState
  /** Nombre para el lector de pantalla: "Viernes 6 de noviembre, lleno". */
  label: string
}

export type MonthGrid = {
  /** Celdas vacías antes del día 1, con la semana de lunes a domingo (como el mockup). */
  leading: number
  days: DayCell[]
}

const STATE_WORDS: Record<DayState, string> = { available: '', selected: '', full: ', lleno', unavailable: ', no disponible' }

function dayState(day: CalendarDay | undefined, selected: boolean): DayState {
  if (!day) return 'unavailable'
  if (day.available) return selected ? 'selected' : 'available'
  return day.reason === 'full' ? 'full' : 'unavailable'
}

/** El mes con sus días; sin datos de la API (cargando o con error), todos quedan sin elegir. */
export function monthGrid(month: MonthRef, calendar: DeliveryCalendar | null, selected: string | null): MonthGrid {
  const byDate = new Map((calendar?.days ?? []).map((day) => [day.date, day]))
  // `getUTCDay` da 0 en domingo: con la semana de lunes a domingo, el lunes es 0.
  const leading = (new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay() + 6) % 7
  const days: DayCell[] = []
  for (let day = 1; day <= daysIn(month); day++) {
    const date = isoDate(month, day)
    const state = dayState(byDate.get(date), date === selected)
    days.push({ date, day, state, label: `${formatTodayDate(date) ?? date}${STATE_WORDS[state]}` })
  }
  return { leading, days }
}

/** El primer día que se puede elegir en lo cargado, en frase: "La fecha más cercana para tu pedido es el jueves 5 de noviembre." */
export function earliestSentence(calendar: DeliveryCalendar | null): string | null {
  const first = calendar?.days.find((day) => day.available)
  const text = first ? formatDateInSentence(first.date) : null
  return text ? `La fecha más cercana para tu pedido es el ${text}.` : null
}

const SHORT_MONTHS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.']

/** "lunes 16 nov.": la fecha corta de la barra de móvil de la entrega (tanda 3). */
export function shortDate(isoDate: string): string | null {
  const parsed = parseIsoDate(isoDate)
  const sentence = formatDateInSentence(isoDate)
  if (!parsed || !sentence) return null
  return `${sentence.split(' ')[0]} ${parsed.day} ${SHORT_MONTHS[parsed.month - 1]}`
}

/** "lunes 16": el día de "Horario del lunes 16". */
export function dayName(isoDate: string): string | null {
  const sentence = formatDateInSentence(isoDate)
  return sentence ? sentence.split(' ').slice(0, 2).join(' ') : null
}

/** "Lunes 16 de noviembre, 3:30 pm": la fecha y la hora elegidas, en el resumen y al volver a "Fecha y hora". */
export function scheduleText(isoDate: string, startsAt: string): string {
  return `${formatTodayDate(isoDate) ?? isoDate}, ${formatTime(startsAt)}`
}

/** "15:00" en la forma del mockup: "3:00 pm", "10:30 am", "12:00 pm". */
export function formatTime(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return `${hours % 12 === 0 ? 12 : hours % 12}:${pad(minutes)} ${hours < 12 ? 'am' : 'pm'}`
}

/** "10:30 am a 1:30 pm"; en el mismo medio día, la primera sin "am" o "pm": "2:00 a 5:30 pm". */
function rangeText(first: string, last: string): string {
  const [start, end] = [formatTime(first), formatTime(last)]
  const [startTime, startHalf] = start.split(' ')
  return startHalf === end.split(' ')[1] ? `${startTime} a ${end}` : `${start} a ${end}`
}

export type PeriodId = 'morning' | 'afternoon' | 'night'

export type SlotPeriod = {
  id: PeriodId
  label: string
  /** Desde el primer lapso que empieza en él hasta el último: "2:00 a 5:30 pm". */
  range: string
  /** Los lapsos que se muestran: los que alcanzan la anticipación, elegibles o llenos. */
  slots: DeliverySlot[]
  available: boolean
  /** Por qué no se elige: todos llenos, o ninguno alcanza la anticipación ese día. */
  disabledReason: string | null
}

/**
 * Cortes de presentación del mockup (no son reglas de negocio: los lapsos los da la API): mañana hasta antes de las 14:00,
 * tarde hasta antes de las 18:00 y noche después.
 */
const PERIODS: { id: PeriodId; label: string; before: string }[] = [
  { id: 'morning', label: 'Mañana', before: '14:00' },
  { id: 'afternoon', label: 'Tarde', before: '18:00' },
  { id: 'night', label: 'Noche', before: '24:00' },
]

/** Los lapsos de un día en mañana, tarde y noche. Un periodo sin lapsos en la cuadrícula no sale. */
export function slotPeriods(slots: DeliverySlot[]): SlotPeriod[] {
  const periods: SlotPeriod[] = []
  let from = '00:00'
  for (const { id, label, before } of PERIODS) {
    const all = slots.filter((slot) => slot.startsAt >= from && slot.startsAt < before)
    from = before
    if (all.length === 0) continue
    const shown = all.filter((slot) => slot.reason !== 'too_soon')
    const available = shown.some((slot) => slot.available)
    periods.push({
      id,
      label,
      range: rangeText(all[0].startsAt, all[all.length - 1].startsAt),
      slots: shown,
      available,
      disabledReason: available ? null : shown.length > 0 ? 'Lleno' : 'Ya no hay horarios',
    })
  }
  return periods
}

/** Los tipos de línea del carrito, sin repetir, para la anticipación del calendario. */
export function lineKinds(items: CartItem[]): LineKind[] {
  return [...new Set(items.map(lineKind))].sort()
}

/**
 * A qué día pasa el foco con las flechas en el calendario: izquierda y derecha, al día elegible anterior o siguiente;
 * arriba y abajo, a una semana (si ese día no se elige, al elegible más cercano en esa dirección); Inicio y Fin, al
 * primero y al último. `null` si no hay a dónde ir.
 */
export function nextFocus(days: DayCell[], from: string, key: string): string | null {
  const choosable = days.filter((day) => day.state === 'available' || day.state === 'selected')
  const index = days.findIndex((day) => day.date === from)
  if (index === -1 || choosable.length === 0) return null
  const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  if (key === 'Home') return choosable[0].date
  if (key === 'End') return choosable[choosable.length - 1].date
  const move = step[key]
  if (move === undefined) return null
  const direction = Math.sign(move)
  for (let at = index + move; at >= 0 && at < days.length; at += direction) {
    const day = days[at]
    if (day.state === 'available' || day.state === 'selected') return day.date
  }
  return null
}
