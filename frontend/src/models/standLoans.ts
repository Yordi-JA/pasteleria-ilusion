/**
 * Las bases en préstamo de la cuenta (D69): `GET stand-loans/`, con JWT, paginado de 20 en 20, solo del dueño. Primero
 * vienen las prestadas por fecha límite y después las devueltas. Una respuesta con otra forma es un `TypeError`.
 */
import { PRICE_PATTERN } from './money.ts'
import { getJsonWithSession } from './session.ts'

export type StandLoan = {
  id: number
  orderId: number
  kg: number
  /** El monto tal como lo manda la API ("70.00"); se muestra con `formatPrice`. */
  deposit: string
  status: 'on_loan' | 'returned'
  statusLabel: string
  deliveredOn: string
  dueDate: string
  /** El instante de la devolución (ISO 8601), o `null` si sigue prestada. */
  returnedAt: string | null
  depositRefunded: boolean
}

/** Un tope técnico contra una respuesta que no termina nunca, no una regla del negocio. */
const MAX_PAGES = 10

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw => value !== null && typeof value === 'object' && !Array.isArray(value)

function text(raw: Raw, key: string): string {
  const value = raw[key]
  if (typeof value !== 'string' || value === '') throw new TypeError(`La base no trae "${key}".`)
  return value
}

function whole(raw: Raw, key: string): number {
  const value = raw[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new TypeError(`La base no trae "${key}".`)
  return value
}

export function parseStandLoan(data: unknown): StandLoan {
  if (!isRaw(data)) throw new TypeError('Una base no tiene la forma esperada.')
  const status = data.status
  if (status !== 'on_loan' && status !== 'returned') throw new TypeError('La base trae un estado desconocido.')
  const deposit = text(data, 'deposit')
  if (!PRICE_PATTERN.test(deposit)) throw new TypeError('La base trae un depósito no válido.')
  const returnedAt = data.returned_at
  return {
    id: whole(data, 'id'),
    orderId: whole(data, 'order_id'),
    kg: whole(data, 'kg'),
    deposit,
    status,
    statusLabel: text(data, 'status_label'),
    deliveredOn: text(data, 'delivered_on'),
    dueDate: text(data, 'due_date'),
    returnedAt: typeof returnedAt === 'string' && returnedAt !== '' ? returnedAt : null,
    depositRefunded: data.deposit_refunded === true,
  }
}

/** Una página de la lista: sus bases y si hay otra detrás. */
export function parseStandLoanPage(data: unknown): { loans: StandLoan[]; hasNext: boolean } {
  if (!isRaw(data) || !Array.isArray(data.results)) throw new TypeError('La lista de bases no tiene la forma esperada.')
  return { loans: data.results.map(parseStandLoan), hasNext: typeof data.next === 'string' && data.next !== '' }
}

/** Todas las bases del cliente, página por página, en el orden de la API. */
export async function getStandLoans(signal: AbortSignal): Promise<StandLoan[]> {
  const loans: StandLoan[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = parseStandLoanPage(await getJsonWithSession(['stand-loans'], { signal, query: page === 1 ? undefined : { page: String(page) } }))
    loans.push(...result.loans)
    if (!result.hasNext) break
  }
  return loans
}
