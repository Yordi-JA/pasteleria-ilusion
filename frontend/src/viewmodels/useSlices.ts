import { useCallback, useMemo, useState } from 'react'
import { getSlices } from '../models/catalog.ts'
import { formatTodayDate } from '../models/dates.ts'
import { availableFirst, toSliceItem } from './todayItems.ts'
import type { SliceItemView } from './todayItems.ts'
import { useAddToCart } from './useAddToCart.ts'
import { useRemoteData } from './useRemoteData.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** Una rebanada en `/rebanadas`: con su contador, de 1 a lo que queda hoy. */
export type SlicePageItem = SliceItemView & {
  quantity: number
  /** Tope del contador: lo que queda hoy (al menos 1, para que el contador no quede en 0). */
  stepMax: number
}

/**
 * Cómo se acomoda la pantalla. Casi siempre hay rebanadas de un solo pastel (regla 2, D60): `single` las muestra en una
 * tarjeta ancha junto a "¿Lo quieres completo?", sin el hueco de tres columnas vacías. `grid` es el mockup, con varios
 * sabores. `empty` no tiene nada cargado hoy.
 */
export type SlicesLayout = 'empty' | 'single' | 'grid'

/**
 * View-model de `/rebanadas` (Rebanadas.dc.html): las rebanadas de hoy, lo que queda primero. Cada tarjeta tiene su
 * contador, y "Agregar al pedido" agrega esa cantidad como línea de la vitrina de hoy, con tope en lo que queda (D47).
 */
export function useSlices() {
  const { state, retry } = useRemoteData(getSlices, 'No se pudieron cargar las rebanadas de hoy.')
  const { add, feedback, dismiss } = useAddToCart()
  const store = useStoreDetails()
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const stock = state.status === 'ready' ? state.data : null
  const items = useMemo<SlicePageItem[]>(() => {
    if (!stock) return []
    return availableFirst(stock.items).map((item) => {
      const view = toSliceItem(item)
      const stepMax = Math.max(view.maxQuantity ?? 1, 1)
      return { ...view, stepMax, quantity: Math.min(Math.max(quantities[view.key] ?? 1, 1), stepMax) }
    })
  }, [stock, quantities])

  const setQuantity = useCallback((key: string, quantity: number) => setQuantities((current) => ({ ...current, [key]: quantity })), [])
  const addSlice = useCallback((item: SlicePageItem) => add(item.offering, item.quantity, item.maxQuantity), [add])

  const layout: SlicesLayout = items.length === 0 ? 'empty' : items.length === 1 ? 'single' : 'grid'
  return {
    status: state.status,
    retry,
    feedback,
    dismiss,
    items,
    layout,
    setQuantity,
    add: addSlice,
    /** "Viernes 6 de noviembre", la fecha de la pastelería; `null` mientras carga o si no llegó. */
    date: stock ? formatTodayDate(stock.date) : null,
    /** Días de anticipación de los pedidos: `null` pendiente, `undefined` mientras cargan los datos del negocio. */
    leadDays: store.status === 'loading' ? undefined : store.leadDays,
  }
}

export type SlicesView = ReturnType<typeof useSlices>
