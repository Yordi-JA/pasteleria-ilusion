/**
 * De qué cuenta es lo que el navegador guarda entre visitas (tanda 5): el borrador de "Diseña tu pastel", el carrito y la
 * fecha y hora de la entrega. Una sesión que termina sola no lo borra (la misma cuenta puede volver), pero otra cuenta que
 * entra nunca lo ve; lo que se armó sin cuenta pasa a la primera con que se entra, para pagarlo.
 */
import { fallbackHash } from './attempts.ts'
import type { SessionState } from './session.ts'

/** La forma de `fallbackHash`: una `c` y 11 caracteres en base 36. */
const OWNER = /^c[0-9a-z]{11}$/

/**
 * La marca de una cuenta: un hash corto del correo, sin el correo. Es síncrono (cyrb53), para decidir al renderizar sin
 * esperar a `crypto.subtle`; no protege el correo contra quien pruebe correos uno por uno, pero el almacenamiento no lo
 * muestra y basta para distinguir dos cuentas.
 */
export function ownerMarker(email: string): string {
  return fallbackHash(email)
}

/** La marca guardada, o `null` si no la hay o no tiene la forma de `ownerMarker`. */
export function parseOwner(value: unknown): string | null {
  return typeof value === 'string' && OWNER.test(value) ? value : null
}

/** La marca de la cuenta con sesión abierta; `null` sin sesión o mientras se recupera. */
export function sessionOwner(state: SessionState): string | null {
  return state.status === 'authenticated' ? ownerMarker(state.user.email) : null
}

/** Qué pasa con lo guardado cuando entra la cuenta `account`: es suyo, lo adopta (se hizo sin cuenta) o es de otra y se descarta. */
export type OwnerClaim = 'keep' | 'adopt' | 'discard'

export function ownerClaim(stored: string | null, account: string): OwnerClaim {
  if (stored === account) return 'keep'
  return stored === null ? 'adopt' : 'discard'
}
