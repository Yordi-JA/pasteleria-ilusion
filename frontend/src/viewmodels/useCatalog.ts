import { useCallback, useEffect, useMemo, useState } from 'react'
import { getProducts } from '../models/catalog.ts'
import type { ProductCard } from '../models/catalog.ts'
import { countLabel, toProductCardView } from './productCards.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** Resultado de la última respuesta que llegó. */
type Result = { status: 'ready' | 'error'; cards: ProductCard[] }

/**
 * View-model de `/catalogo`. El catálogo es corto (unos 20 productos), así que se pide completo una vez y se muestra en dos
 * secciones, pasteles y postres. Los filtros y la búsqueda se quitaron en la tanda 1 de correcciones (D77): el usuario
 * decidió que con tan pocos productos no hacían falta. "Volver a intentar" cancela la petición anterior.
 */
export function useCatalog() {
  const [result, setResult] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    getProducts({ category: null, search: '' }, controller.signal).then(
      (cards) => {
        if (!controller.signal.aborted) setResult({ status: 'ready', cards })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo cargar el catálogo.', error)
        setResult({ status: 'error', cards: [] })
      },
    )
    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => {
    setResult(null)
    setAttempt((count) => count + 1)
  }, [])

  const status: 'loading' | 'ready' | 'error' = result === null ? 'loading' : result.status
  const store = useStoreDetails()

  const view = useMemo(() => {
    const cards = result?.status === 'ready' ? result.cards : []
    const cakes = cards.filter((card) => card.category === 'cake').map((card) => toProductCardView(card))
    const desserts = cards.filter((card) => card.category === 'dessert').map((card) => toProductCardView(card))
    return {
      cakes,
      desserts,
      cakeCount: countLabel(cakes.length, 'cake'),
      dessertCount: countLabel(desserts.length, 'dessert'),
      empty: cakes.length === 0 && desserts.length === 0,
    }
  }, [result])

  return {
    status,
    retry,
    ...view,
    /** Días de anticipación de los pedidos: `null` pendiente, `undefined` mientras carga. */
    leadDays: store.status === 'loading' ? undefined : store.leadDays,
  }
}

export type CatalogView = ReturnType<typeof useCatalog>
