/** Cliente HTTP de la API. La API vive en el mismo origen bajo `/api/v1/` (D15). */
const API_BASE = '/api/v1/'

/** Respuesta de la API con un código fuera de 2xx. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, path: string) {
    super(`GET ${API_BASE}${path} respondió ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Arma la ruta de un recurso dentro de `/api/v1/` a partir de sus segmentos, con la barra final de Django.
 * Cada segmento pasa por `encodeURIComponent`, así un `:slug`, `:id` o `:token` que venga de la URL no puede
 * agregar segmentos ni desviar la petición (`../`, `?`, `#`). Los segmentos `.`, `..` y vacíos se rechazan:
 * `encodeURIComponent` no los cambia y el analizador de URL los colapsaría.
 */
export function apiPath(...segments: string[]): string {
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new RangeError(`Segmento de ruta de la API no válido: "${segment}"`)
    }
  }
  return `${segments.map(encodeURIComponent).join('/')}/`
}

/** Una petición colgada se corta a los 10 s: así ninguna pantalla espera sin fin. */
export const REQUEST_TIMEOUT_MS = 10_000

/**
 * Corte de una petición en desarrollo: las pruebas E2E pueden bajarlo con la variable global `override` (por
 * ejemplo `__catalogTimeoutMs`) para no esperar 10 s reales. Quien llama lo usa solo dentro de
 * `import.meta.env.DEV`, para que en el build la rama, y con ella el nombre de la variable, desaparezca:
 * `import.meta.env.DEV ? devRequestTimeoutMs('__catalogTimeoutMs') : REQUEST_TIMEOUT_MS`.
 */
export function devRequestTimeoutMs(override: string): number {
  const value: unknown = Reflect.get(globalThis, override)
  return typeof value === 'number' && value > 0 ? value : REQUEST_TIMEOUT_MS
}

/** Pide un recurso de la API y devuelve el JSON sin validar; el modelo de cada recurso lo valida. */
export async function getJson(segments: string[], init: { signal?: AbortSignal } = {}): Promise<unknown> {
  const path = apiPath(...segments)
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: init.signal,
  })
  if (!response.ok) throw new ApiError(response.status, path)
  return (await response.json()) as unknown
}
