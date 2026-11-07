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
