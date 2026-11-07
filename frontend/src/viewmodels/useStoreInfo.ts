import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router'
import { fetchStoreInfo } from '../models/storeInfo.ts'
import type { StoreInfo } from '../models/storeInfo.ts'

/**
 * Datos de la pastelería listos para mostrar. Con `loading` todavía no se sabe nada (se muestra un esqueleto);
 * con `ready` cada `null` es un dato pendiente; con `unavailable` todo queda pendiente.
 */
export type StoreDetails = {
  status: 'loading' | 'ready' | 'unavailable'
  address: string | null
  hours: { opensAt: string; closesAt: string } | null
  whatsapp: { display: string; url: string } | null
  leadDays: number | null
}

// Un número de WhatsApp internacional (E.164) tiene de 8 a 15 dígitos.
const WHATSAPP_DIGITS = /^\d{8,15}$/

/** Tras una falla, navegar o volver a la pestaña reintenta como mucho una vez por minuto: el endpoint tiene su propio cupo por IP. */
const RETRY_AFTER_MS = 60_000

/** Volver la conexión es la señal más clara de que vale la pena reintentar: basta un piso corto contra ráfagas. */
const ONLINE_RETRY_AFTER_MS = 5_000

function toStoreDetails(info: StoreInfo | null, status: StoreDetails['status']): StoreDetails {
  const digits = info?.whatsapp
  const opensAt = info?.opensAt
  const closesAt = info?.closesAt
  return {
    status,
    address: info?.address ?? null,
    hours: opensAt && closesAt ? { opensAt, closesAt } : null,
    whatsapp: digits && WHATSAPP_DIGITS.test(digits) ? { display: `+${digits}`, url: `https://wa.me/${digits}` } : null,
    leadDays: info?.customLeadDays ?? null,
  }
}

/**
 * Dirección, horario, WhatsApp y anticipación de la pastelería. Si la API falla, todo queda pendiente y se
 * reintenta al navegar o al volver a la pestaña (como mucho una vez por minuto) y al volver la conexión
 * (con un piso de 5 s).
 */
export function useStoreInfo(): StoreDetails {
  const { pathname } = useLocation()
  const [state, setState] = useState<{ info: StoreInfo | null; status: StoreDetails['status'] }>({
    info: null,
    status: 'loading',
  })
  const lastAttempt = useRef(0)
  const mounted = useRef(false)

  // Una falla que se repite se queda en `unavailable`: los marcadores no parpadean a esqueleto en cada reintento.
  const load = useCallback(() => {
    lastAttempt.current = Date.now()
    fetchStoreInfo().then(
      (info) => {
        if (mounted.current) setState({ info, status: 'ready' })
      },
      (error: unknown) => {
        // La falla no detiene el sitio: los datos se muestran como pendientes. Se registra para diagnosticarla.
        console.warn('No se pudieron cargar los datos de la pastelería.', error)
        if (mounted.current) setState({ info: null, status: 'unavailable' })
      },
    )
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
    }
  }, [load])

  const unavailable = state.status === 'unavailable'
  useEffect(() => {
    if (!unavailable) return
    const retryAfter = (ms: number) => {
      if (Date.now() - lastAttempt.current >= ms) load()
    }
    const retryIfDue = () => retryAfter(RETRY_AFTER_MS)
    const retryOnline = () => retryAfter(ONLINE_RETRY_AFTER_MS)
    const retryIfVisible = () => {
      if (document.visibilityState === 'visible') retryIfDue()
    }
    // Corre en cada cambio de ruta mientras no haya datos; el plazo evita una petición por navegación.
    retryIfDue()
    window.addEventListener('online', retryOnline)
    document.addEventListener('visibilitychange', retryIfVisible)
    return () => {
      window.removeEventListener('online', retryOnline)
      document.removeEventListener('visibilitychange', retryIfVisible)
    }
  }, [unavailable, pathname, load])

  return useMemo(() => toStoreDetails(state.info, state.status), [state])
}

/**
 * Los datos de la pastelería que ya pidió el marco (`SiteLayout` los pasa por el `Outlet`), para una vista que los
 * muestra (por ejemplo, los días de anticipación en la vitrina agotada). No hace otra petición ni otro reintento.
 */
export function useStoreDetails(): StoreDetails {
  const store: unknown = useOutletContext()
  if (!isStoreDetails(store)) throw new Error('useStoreDetails necesita el Outlet de SiteLayout con los datos de la pastelería.')
  return store
}

const STORE_STATUSES = new Set<unknown>(['loading', 'ready', 'unavailable'])

/** El contexto del `Outlet` no tiene tipo: se revisa su forma antes de usarlo, por si otro marco pasara otra cosa. */
function isStoreDetails(value: unknown): value is StoreDetails {
  if (typeof value !== 'object' || value === null) return false
  const details = value as Record<string, unknown>
  return STORE_STATUSES.has(details.status) && ['address', 'hours', 'whatsapp', 'leadDays'].every((key) => key in details)
}
