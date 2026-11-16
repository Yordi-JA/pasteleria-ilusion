import { devRequestTimeoutMs, getJson, REQUEST_TIMEOUT_MS } from './apiClient.ts'
import { PRICE_PATTERN } from './money.ts'

/**
 * "Bases en préstamo" de `GET /api/v1/stands/` (`StandInfoSerializer` en `backend/core_pasteleria/api/serializers.py`):
 * las bases de la pastelería con su depósito y las condiciones del préstamo, tal como están en el admin (regla 7, D75).
 * Sin caché: cada visita pide lo vigente.
 */

/** Una base de la pastelería. El depósito llega como texto ("70.00"). */
export type Stand = {
  minKg: number
  maxKg: number
  deposit: string
  /** Nota de la base ("Madera forrada en aluminio"); vacía si no lleva. */
  description: string
}

/** Lo que se cobra arriba de la base más grande de la pastelería, hasta el máximo en línea (de 26 a 50 kg hoy). */
export type DepositsBeyond = {
  /** El kilo siguiente a la base más grande de la pastelería. */
  fromKg: number
  toKg: number
  minDeposit: string
  maxDeposit: string
}

export type StandInfo = {
  /** En el orden de la API: de menos a más kilos. */
  stands: Stand[]
  /** Días, desde la entrega, para regresar la base (`stand_return_days`); `null` si no llegó un plazo válido. */
  returnDays: number | null
  /** Desde cuántos kilos un pedido lleva base; `null` sin bases activas. */
  fromKg: number | null
  /** Qué pasa si la base regresa dañada; `null` es PENDIENTE. */
  damagedPolicy: string | null
  /** `null` si no hay nada que pedir en línea arriba de la base más grande. */
  beyond: DepositsBeyond | null
}

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw => value !== null && typeof value === 'object' && !Array.isArray(value)

/** El tope de `PositiveSmallIntegerField`, la columna de los kilos y de los días: más que eso no lo guarda la base. */
const MAX_SMALL_INTEGER = 32767

/** Un entero de `min` al tope de la columna; cualquier otra cosa es `null`. Los kilos aceptan 0, como la columna. */
function wholeNumber(value: unknown, min: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= MAX_SMALL_INTEGER ? value : null
}

function price(value: unknown): string | null {
  return typeof value === 'string' && PRICE_PATTERN.test(value) ? value : null
}

function parseStand(data: unknown): Stand | null {
  if (!isRaw(data)) return null
  const minKg = wholeNumber(data.min_kg, 0)
  const maxKg = wholeNumber(data.max_kg, 0)
  const deposit = price(data.deposit)
  if (minKg === null || maxKg === null || maxKg < minKg || deposit === null) return null
  return { minKg, maxKg, deposit, description: typeof data.description === 'string' ? data.description.trim() : '' }
}

function parseBeyond(data: unknown): DepositsBeyond | null {
  if (!isRaw(data)) return null
  const fromKg = wholeNumber(data.from_kg, 1)
  const toKg = wholeNumber(data.to_kg, 1)
  const minDeposit = price(data.min_deposit)
  const maxDeposit = price(data.max_deposit)
  if (fromKg === null || toKg === null || toKg < fromKg || minDeposit === null || maxDeposit === null) return null
  return { fromKg, toKg, minDeposit, maxDeposit }
}

/**
 * Valida la respuesta. Sin `stands` en lista es un `TypeError` (la pantalla muestra el error, nunca una lista vacía); una
 * base dudosa se descarta, y si ninguna sirve, también es un `TypeError`. Un plazo de 0 días o dudoso no tumba la
 * página: queda `null` y la pantalla lo muestra como pendiente, sin inventar una cifra.
 */
export function parseStandInfo(data: unknown): StandInfo {
  if (!isRaw(data) || !Array.isArray(data.stands)) throw new TypeError('Las bases no tienen la forma esperada.')
  const stands = data.stands.map(parseStand).filter((stand): stand is Stand => stand !== null)
  if (data.stands.length > 0 && stands.length === 0) throw new TypeError(`Ninguna de las ${data.stands.length} bases tiene la forma esperada.`)
  const damaged = typeof data.damaged_policy === 'string' ? data.damaged_policy.trim() : ''
  return {
    stands,
    returnDays: wholeNumber(data.return_days, 1),
    fromKg: wholeNumber(data.from_kg, 0),
    damagedPolicy: damaged === '' ? null : damaged,
    beyond: parseBeyond(data.beyond),
  }
}

/**
 * Pide las bases. Se cancela si la pantalla ya no las necesita (`signal`) o a los 10 s; solo en desarrollo, las pruebas
 * E2E bajan el corte con `globalThis.__standsTimeoutMs`.
 */
export async function getStandInfo(signal: AbortSignal): Promise<StandInfo> {
  const ms = import.meta.env.DEV ? devRequestTimeoutMs('__standsTimeoutMs') : REQUEST_TIMEOUT_MS
  return parseStandInfo(await getJson(['stands'], { signal: AbortSignal.any([signal, AbortSignal.timeout(ms)]) }))
}
