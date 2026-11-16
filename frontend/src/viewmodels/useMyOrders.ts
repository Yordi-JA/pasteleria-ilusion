import { useEffect, useRef, useState } from 'react'
import { getOrders } from '../models/accountOrders.ts'
import type { AccountOrder } from '../models/accountOrders.ts'
import { isInProgress, orderCard } from './orderView.ts'
import type { OrderCardView } from './orderView.ts'

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; orders: AccountOrder[]; nextPage: number | null; more: 'idle' | 'loading' | 'error' }

/** El atributo que marca el enlace de cada tarjeta, para llevar el foco a la primera que llega con "Ver más". */
export const ORDER_LINK_ATTRIBUTE = 'data-order-link'

/**
 * View-model de "Mis pedidos" (`/cuenta`, D69): las páginas de `GET orders/` (20 por página, del más nuevo al más
 * viejo), separadas en curso y anteriores. "Ver más pedidos" pide la siguiente y lleva el foco al primer pedido nuevo;
 * si falla, lo ya cargado se queda y el botón sigue. Las solicitudes de cotización se sumarán como otra lista de la
 * misma pantalla, con su propio view-model: esta solo sabe de pedidos.
 */
export function useMyOrders() {
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // El primer pedido de la página que acaba de llegar: recibe el foco cuando ya está en pantalla.
  const pendingFocus = useRef<number | null>(null)
  const moreController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getOrders(1, controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) setState({ status: 'ready', orders: page.orders, nextPage: page.nextPage, more: 'idle' })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudieron cargar los pedidos.', error)
        setState({ status: 'error' })
      },
    )
    return () => {
      controller.abort()
      moreController.current?.abort()
    }
  }, [attempt])

  useEffect(() => {
    if (pendingFocus.current === null) return
    document.querySelector<HTMLElement>(`[${ORDER_LINK_ATTRIBUTE}="${pendingFocus.current}"]`)?.focus()
    pendingFocus.current = null
  }, [state])

  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((count) => count + 1)
  }

  const loadMore = () => {
    if (state.status !== 'ready' || state.nextPage === null || state.more === 'loading') return
    const loaded = state
    const nextPage: number = state.nextPage
    const controller = new AbortController()
    moreController.current = controller
    setState({ ...loaded, more: 'loading' })
    getOrders(nextPage, controller.signal).then(
      (page) => {
        if (controller.signal.aborted) return
        // Un pedido nuevo entre páginas corre la lista: el que ya está no se repite.
        const known = new Set(loaded.orders.map((order) => order.id))
        const fresh = page.orders.filter((order) => !known.has(order.id))
        pendingFocus.current = fresh[0]?.id ?? null
        setState({ status: 'ready', orders: [...loaded.orders, ...fresh], nextPage: page.nextPage, more: 'idle' })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo cargar la página siguiente de pedidos.', error)
        setState((current) => (current.status === 'ready' ? { ...current, more: 'error' } : current))
      },
    )
  }

  const orders = state.status === 'ready' ? state.orders : []
  const current: OrderCardView[] = orders.filter(isInProgress).map(orderCard)
  const previous: OrderCardView[] = orders.filter((order) => !isInProgress(order)).map(orderCard)

  return {
    status: state.status,
    retry,
    empty: state.status === 'ready' && orders.length === 0,
    current,
    previous,
    hasMore: state.status === 'ready' && state.nextPage !== null,
    more: state.status === 'ready' ? state.more : 'idle',
    loadMore,
  }
}
