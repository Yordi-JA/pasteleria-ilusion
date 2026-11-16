import { useEffect, useState } from 'react'
import { getOrder } from '../models/accountOrders.ts'
import type { AccountOrder } from '../models/accountOrders.ts'
import { ApiError } from '../models/apiClient.ts'

export type AccountOrderLoad = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; order: AccountOrder }

/** Un id de pedido de la URL (`?pedido=` o `:id`): un entero positivo, o `null`. */
export function parseOrderId(raw: string | null | undefined): number | null {
  return raw && /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null
}

/**
 * Pide un pedido de la cuenta (D69) para la confirmación y el detalle. Sin id válido, o con un 404 (ajeno, no existe),
 * `missing`: no se muestra nada del pedido. Cualquier otra falla es `error`, con `retry`.
 */
export function useAccountOrder(orderId: number | null) {
  const [fetched, setLoad] = useState<AccountOrderLoad>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const load: AccountOrderLoad = orderId === null ? { status: 'missing' } : fetched

  useEffect(() => {
    if (orderId === null) return
    const controller = new AbortController()
    getOrder(orderId, controller.signal).then(
      (order) => {
        if (!controller.signal.aborted) setLoad({ status: 'ready', order })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo cargar el pedido.', error)
        setLoad(error instanceof ApiError && error.status === 404 ? { status: 'missing' } : { status: 'error' })
      },
    )
    return () => controller.abort()
  }, [orderId, attempt])

  const retry = () => {
    setLoad({ status: 'loading' })
    setAttempt((count) => count + 1)
  }

  return { load, retry }
}
