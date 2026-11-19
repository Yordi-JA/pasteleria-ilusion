/**
 * La llave de idempotencia de un intento (D66, D70): una llave al azar ligada al hash de lo que se manda, en
 * `sessionStorage`. Con la misma huella, un reintento, un doble clic o una recarga a media petición mandan la misma llave
 * y el servidor responde lo mismo; con otra huella (cambió algo) es otro intento, con otra llave. El navegador guarda el
 * hash, nunca los datos.
 */

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const FINGERPRINT_PATTERN = /^[a-z0-9]{8,128}$/

type Attempt = { key: string; fingerprint: string }

/**
 * Un hash estable sin `crypto.subtle` (el sitio abierto por `http://<IP>`): cyrb53, en base 36. También da, sin esperar, la
 * marca de la cuenta dueña de lo que se guarda en el navegador (`ownerMarker` de `owner.ts`).
 */
export function fallbackHash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `c${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(11, '0')}`
}

/** La huella de un texto: SHA-256 con `crypto.subtle`; sin contexto seguro, cyrb53. */
export async function fingerprintOf(text: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return fallbackHash(text)
  }
}

function readAttempt(storageKey: string): Attempt | null {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const { key, fingerprint } = raw as Record<string, unknown>
    return typeof key === 'string' && KEY_PATTERN.test(key) && typeof fingerprint === 'string' && FINGERPRINT_PATTERN.test(fingerprint)
      ? { key, fingerprint }
      : null
  } catch {
    return null
  }
}

const memory = new Map<string, Attempt>()

/**
 * La llave del intento guardado en `storageKey` para esa huella: la misma huella da la misma llave; otra huella, una
 * nueva (un UUID, que la API acepta). Sin almacenamiento, el intento vive en memoria durante la visita.
 */
export function attemptKey(storageKey: string, fingerprint: string): string {
  const current = memory.get(storageKey) ?? readAttempt(storageKey)
  if (current?.fingerprint === fingerprint) return current.key
  const next = { key: crypto.randomUUID(), fingerprint }
  memory.set(storageKey, next)
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    // Sin almacenamiento, el intento sigue en memoria.
  }
  return next.key
}

/** Olvida el intento (ya se logró o el servidor dijo que la llave no sirve): el siguiente lleva otra llave. */
export function forgetAttempt(storageKey: string) {
  memory.delete(storageKey)
  try {
    window.sessionStorage.removeItem(storageKey)
  } catch {
    // Nada que borrar.
  }
}
