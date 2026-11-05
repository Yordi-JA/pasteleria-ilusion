import { getJson } from './apiClient.ts'

/** Datos de la pastelería de `GET /api/v1/store/info/`. `null` es un dato pendiente que no se inventa. */
export type StoreInfo = {
  address: string | null
  /** Solo dígitos internacionales, sin "+". */
  whatsapp: string | null
  /** "HH:MM" */
  opensAt: string | null
  /** "HH:MM" */
  closesAt: string | null
  /** Días de anticipación de un pedido de Diseña tu pastel. */
  customLeadDays: number | null
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function time(value: unknown): string | null {
  return typeof value === 'string' && TIME.test(value) ? value.slice(0, 5) : null
}

function wholeDays(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** Un campo con un tipo inesperado se trata como pendiente: nunca se muestra un valor dudoso. */
export function parseStoreInfo(data: unknown): StoreInfo {
  const raw = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  return {
    address: text(raw.address),
    whatsapp: text(raw.whatsapp),
    opensAt: time(raw.opens_at),
    closesAt: time(raw.closes_at),
    customLeadDays: wholeDays(raw.custom_lead_days),
  }
}

/** Una petición colgada se corta a los 10 s y termina como datos pendientes. */
const TIMEOUT_MS = 10_000

/**
 * Solo en desarrollo, las pruebas E2E pueden bajar el corte con `globalThis.__storeInfoTimeoutMs` para no
 * esperar 10 s reales. En el build `import.meta.env.DEV` es `false` y la rama desaparece.
 */
function timeoutMs(): number {
  if (import.meta.env.DEV) {
    const override: unknown = Reflect.get(globalThis, '__storeInfoTimeoutMs')
    if (typeof override === 'number' && override > 0) return override
  }
  return TIMEOUT_MS
}

// La franja, el menú y el pie comparten la misma promesa: una sola petición mientras haya datos, porque el
// endpoint tiene su propio cupo por IP. Si falla, la caché se vacía para que un reintento (lo acota
// `useStoreInfo`) pueda volver a pedir. Esta caché a nivel de módulo solo sirve para recursos públicos e
// iguales para todos; un dato por usuario debe guardarse con la identidad como clave y vaciarse al cerrar sesión.
let request: Promise<StoreInfo> | null = null

export function fetchStoreInfo(): Promise<StoreInfo> {
  request ??= getJson(['store', 'info'], { signal: AbortSignal.timeout(timeoutMs()) })
    .then(parseStoreInfo)
    .catch((error: unknown) => {
      request = null
      throw error
    })
  return request
}
