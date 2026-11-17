import { useCallback, useEffect, useMemo, useState } from 'react'
import { getProducts } from '../models/catalog.ts'
import type { ProductCard } from '../models/catalog.ts'
import { formatPrice } from '../models/money.ts'
import { MINI_DESIGN_HREF } from './cakeDesignPrefill.ts'
import { countLabel, toProductCardView } from './productCards.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** Resultado de la última respuesta que llegó. */
type Result = { status: 'ready' | 'error'; cards: ProductCard[] }

/**
 * El precio del pastel mini ("$130") para su tarjeta: solo si algún pastel de la lista tiene mini y todos cuestan lo
 * mismo; si los precios difieren, no hay tarjeta (no se inventa un "desde").
 */
function miniPrice(cards: ProductCard[]): string | null {
  // Un mini sin precio (PENDIENTE) no cuenta: el de la tarjeta es el de los que sí lo tienen.
  const prices = new Set(
    cards.flatMap((card) => card.offerings.filter((offering) => offering.presentation === 'mini' && offering.price !== null).map((offering) => offering.price)),
  )
  if (prices.size !== 1) return null
  return formatPrice([...prices][0]) || null
}

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
    const cakeCards = cards.filter((card) => card.category === 'cake')
    const cakes = cakeCards.map((card) => toProductCardView(card))
    const desserts = cards.filter((card) => card.category === 'dessert').map((card) => toProductCardView(card))
    return {
      cakes,
      desserts,
      cakeCount: countLabel(cakes.length, 'cake'),
      dessertCount: countLabel(desserts.length, 'dessert'),
      /** Precio de la tarjeta del pastel mini, o `null` si no va. */
      miniPrice: miniPrice(cakeCards),
      /** "Diseña tu pastel mini" (tanda 2): abre el diseñador con el mini ya elegido. */
      miniDesignHref: MINI_DESIGN_HREF,
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
