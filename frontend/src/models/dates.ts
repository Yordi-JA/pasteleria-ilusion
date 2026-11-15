const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * Fecha de la pastelería ("AAAA-MM-DD", la de la Ciudad de México que manda la API) en español de México, con el
 * día de la semana: "Viernes 6 de noviembre". Se calcula en UTC a partir de los números, nunca con la zona del
 * navegador: un cliente en otra zona vería otro día. Una fecha que no existe o con otra forma devuelve `null`.
 */
export function formatTodayDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  // `Date.UTC` acomoda un 30 de febrero en marzo: si cambió, la fecha no existe.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${WEEKDAYS[date.getUTCDay()]} ${day} de ${MONTHS[month - 1]}`
}

/** La zona de la pastelería: "hoy" es el de la Ciudad de México, no el del navegador. */
const BAKERY_TIME_ZONE = 'America/Mexico_City'

/**
 * El día de hoy en la pastelería, "AAAA-MM-DD". Solo sirve para saber qué mes abrir en el calendario de la entrega:
 * qué días se pueden elegir lo dice la API, que usa su propia hora.
 */
export function bakeryToday(now: Date = new Date()): string {
  // `en-CA` da el formato AAAA-MM-DD; el texto no se muestra.
  return new Intl.DateTimeFormat('en-CA', { timeZone: BAKERY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Los números de una fecha "AAAA-MM-DD" que existe, o `null`. */
export function parseIsoDate(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string') return null
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { year, month, day }
}

/** "Viernes 6 de noviembre" en minúscula al inicio, para dentro de una frase: "el viernes 6 de noviembre". */
export function formatDateInSentence(value: unknown): string | null {
  const text = formatTodayDate(value)
  return text ? `${text.charAt(0).toLocaleLowerCase('es-MX')}${text.slice(1)}` : null
}

/** El nombre del mes con su año: "Noviembre 2026". */
export function formatMonth(year: number, month: number): string {
  const name = MONTHS[month - 1] ?? ''
  return `${name.charAt(0).toLocaleUpperCase('es-MX')}${name.slice(1)} ${year}`
}
