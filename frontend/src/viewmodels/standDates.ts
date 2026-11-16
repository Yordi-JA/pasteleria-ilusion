import { bakeryMoment, formatDateInSentence, parseIsoDate } from '../models/dates.ts'

/** "lunes 30 de noviembre" para una fecha "AAAA-MM-DD"; si no existe, el texto tal cual (nunca una fecha dudosa inventada). */
export function longDate(value: string): string {
  return formatDateInSentence(value) ?? value
}

/** Los días de `from` a `to` (fechas "AAAA-MM-DD"): negativo si `to` ya pasó. */
export function dayDifference(from: string, to: string): number {
  const a = parseIsoDate(from)
  const b = parseIsoDate(to)
  if (!a || !b) return 0
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000)
}

/** La fecha y la hora de la pastelería de un instante de la API. */
export const bakeMoment = bakeryMoment
