import { useMemo, useState } from 'react'
import { getShowcase } from '../models/catalog.ts'
import type { StockItem } from '../models/catalog.ts'
import { formatTodayDate } from '../models/dates.ts'
import { showcaseView } from './todayItems.ts'
import type { ShowcaseFilter } from './todayItems.ts'
import { useAddOne } from './useAddToCart.ts'
import { useRemoteData } from './useRemoteData.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/**
 * View-model de `/vitrina` (Vitrina.dc.html). Pide la vitrina completa una vez y los chips filtran en el navegador,
 * como la portada (D47): el filtro no va en la URL. Muestra todo lo cargado hoy, lo disponible primero. "Agregar al
 * pedido" agrega una pieza como línea de la vitrina de hoy, con tope en lo que queda; el rebanado no se agrega
 * completo (D60).
 */
export function useShowcase() {
  const { state, retry } = useRemoteData(getShowcase, 'No se pudo cargar la vitrina.')
  const { add, feedback, dismiss } = useAddOne()
  const store = useStoreDetails()
  const [filter, setFilter] = useState<ShowcaseFilter>('all')

  const view = useMemo(() => {
    const all: StockItem[] = state.status === 'ready' ? state.data.items : []
    return showcaseView(all, filter)
  }, [state, filter])

  const ready = state.status === 'ready'
  return {
    status: state.status,
    retry,
    feedback,
    dismiss,
    add,
    items: view.items,
    /** Nada cargado hoy: la vitrina vacía, con su dibujo y "Realizar pedido". */
    empty: ready && view.total === 0,
    /** "Por hoy se vendió todo lo de la vitrina" (VitrinaAgotada.dc.html). */
    allSoldOut: view.allSoldOut,
    emptyFilter: view.emptyFilter,
    filters: view.filters,
    setFilter,
    /** "Viernes 6 de noviembre", la fecha de la pastelería; `null` mientras carga o si no llegó. */
    date: ready ? formatTodayDate(state.data.date) : null,
    /** Días de anticipación de los pedidos: `null` pendiente, `undefined` mientras cargan los datos del negocio. */
    leadDays: store.status === 'loading' ? undefined : store.leadDays,
  }
}

export type ShowcaseView = ReturnType<typeof useShowcase>
