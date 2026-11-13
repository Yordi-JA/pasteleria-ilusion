import { useMemo, useState } from 'react'
import { featuredOffering, getFeaturedProducts, getShowcase, getSlices, toCartOffering } from '../models/catalog.ts'
import type { ProductCard, StockItem, TodayStock } from '../models/catalog.ts'
import { formatTodayDate } from '../models/dates.ts'
import { formatPrice } from '../models/money.ts'
import { offeringLabel, PRESENTATION_LABELS } from '../models/presentation.ts'
import { availableFirst, showcaseView, toSliceItem } from './todayItems.ts'
import type { ShowcaseFilter } from './todayItems.ts'
import { useAddOne } from './useAddToCart.ts'
import type { AddFeedback, Addable } from './useAddToCart.ts'
import { PHOTO_PLACEHOLDER, photoView } from './productPhoto.ts'
import type { PhotoView } from './productPhoto.ts'
import { useRemoteData } from './useRemoteData.ts'
import type { RemoteData } from './useRemoteData.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** Lo que la portada muestra de la vitrina: la maqueta tiene dos filas de cuatro. */
export const SHOWCASE_LIMIT = 8

/** Rebanadas en la portada: una fila de cuatro, en escritorio y en móvil (decisión del usuario, D47). */
export const SLICES_LIMIT = 4

/** Lo común a las tres secciones de datos. */
export type SectionBase = {
  status: RemoteData<unknown>['status']
  /**
   * Con la carga lista y nada que mostrar, la sección no aparece (decisión del usuario, D47), salvo que antes haya
   * fallado: entonces sigue, con `emptyAfterError`, para que el foco que dejó el reintento no se pierda.
   */
  visible: boolean
  /** Frase de la sección vacía después de un reintento, o `null`. */
  emptyAfterError: string | null
  retry: () => void
  /** Aviso de "Agregar al pedido" de esta sección: uno por sección, nunca uno por tarjeta. */
  feedback: AddFeedback | null
}

function price(value: string): string {
  // El modelo ya validó el monto; el respaldo vacío solo cubre al tipo.
  return formatPrice(value) ?? ''
}

/** Si la sección aparece y qué dice vacía (ver `SectionBase`). */
function presence(status: RemoteData<unknown>['status'], empty: boolean, hadError: boolean, emptyText: string) {
  const emptyNow = status === 'ready' && empty
  return { visible: !emptyNow || hadError, emptyAfterError: emptyNow && hadError ? emptyText : null }
}

// --- Pasteles de la casa ---

export type FeaturedItemView = {
  key: string
  name: string
  summary: string
  /** "$350" con el pastel completo; con otra presentación, también su nombre: "Vaso, $45.50". */
  price: string | null
  photo: PhotoView
  /** `null` si el producto no tiene presentaciones a la venta: no lleva precio ni botón. */
  addable: (Addable & { label: string }) | null
}

function toFeaturedItem(card: ProductCard): FeaturedItemView {
  const offering = featuredOffering(card)
  const amount = offering && price(offering.price)
  return {
    key: card.slug,
    name: card.name,
    summary: card.summary,
    price: offering && (offering.presentation === 'whole' ? amount : `${PRESENTATION_LABELS[offering.presentation]}, ${amount}`),
    photo: photoView(card.photo, card.name, PHOTO_PLACEHOLDER[card.category]),
    addable: offering && { offering: toCartOffering(card, offering), label: offeringLabel(card.name, offering.presentation) },
  }
}

export function useFeaturedSection() {
  const { state, retry, hadError } = useRemoteData(getFeaturedProducts, 'No se pudieron cargar los pasteles de la casa.')
  const { add, feedback } = useAddOne()
  const items = useMemo(() => (state.status === 'ready' ? state.data.map(toFeaturedItem) : []), [state])
  return {
    status: state.status,
    ...presence(state.status, items.length === 0, hadError, 'Por ahora no hay pasteles de la casa.'),
    retry,
    feedback,
    add,
    /** El primero va en la tarjeta grande; los demás, en la lista. */
    items,
  }
}

// --- Vitrina ---

/**
 * La vitrina se pide completa una vez y los chips filtran en el navegador: cambiar de chip es inmediato, no gasta
 * el cupo del catálogo ni muestra un esqueleto, y la fecha y lo agotado salen de la misma respuesta (D47). El
 * rebanado sale en su lugar, con sus rebanadas y el encargo del completo (D60).
 */
export function useShowcaseSection() {
  const { state, retry, hadError } = useRemoteData(getShowcase, 'No se pudo cargar la vitrina.')
  const { add, feedback } = useAddOne()
  const store = useStoreDetails()
  const [filter, setFilter] = useState<ShowcaseFilter>('all')

  const view = useMemo(() => {
    const all: StockItem[] = state.status === 'ready' ? state.data.items : []
    return showcaseView(all, filter, SHOWCASE_LIMIT)
  }, [state, filter])

  return {
    status: state.status,
    ...presence(state.status, view.total === 0, hadError, 'Hoy no hay nada cargado en la vitrina.'),
    retry,
    feedback,
    add,
    items: view.items,
    /** "Por hoy se vendió todo lo de la vitrina": todo lo cargado hoy está agotado. */
    allSoldOut: view.allSoldOut,
    /** Frase para un chip sin nada hoy ("Hoy no hay postres en la vitrina."), o `null`. */
    emptyFilter: view.emptyFilter,
    /** Los chips se muestran solo con algo que filtrar. */
    filters: view.filters,
    setFilter,
    /** Días de anticipación para el texto de la vitrina agotada: `null` pendiente, `undefined` mientras carga. */
    leadDays: store.status === 'loading' ? undefined : store.leadDays,
  }
}

// --- Rebanadas de hoy ---

export function useSlicesSection() {
  const { state, retry, hadError } = useRemoteData(getSlices, 'No se pudieron cargar las rebanadas de hoy.')
  const { add, feedback } = useAddOne()
  const stock: TodayStock | null = state.status === 'ready' ? state.data : null
  // Hasta cuatro, primero las que quedan: una agotada solo entra si no hay cuatro disponibles.
  const items = useMemo(() => (stock ? availableFirst(stock.items).slice(0, SLICES_LIMIT).map(toSliceItem) : []), [stock])
  return {
    status: state.status,
    ...presence(state.status, items.length === 0, hadError, 'Hoy no hay rebanadas cargadas.'),
    retry,
    feedback,
    add,
    items,
    /** "Viernes 6 de noviembre", la fecha de la pastelería que manda la API; `null` si no llegó. */
    date: stock ? formatTodayDate(stock.date) : null,
  }
}

// --- Portada ---

/**
 * Las tres secciones de datos de la portada, cada una con su carga, su reintento y su aviso, y los campos de color
 * que dependen de cuáles aparecen. `afterHero` es el campo del que cuelgan los 21 px de la concha del hero.
 * `closingField` dice si la página necesita un campo `nata` antes de la guirnalda: la guirnalda cuelga de `nata`
 * y el pie es `mermelada`, así que la vitrina (o el hero solo) nunca queda pegada al pie (dos campos oscuros
 * seguidos).
 */
export function useHome() {
  const featured = useFeaturedSection()
  const showcase = useShowcaseSection()
  const slices = useSlicesSection()
  const afterHero: 'nata' | 'mermelada' = !featured.visible && showcase.visible ? 'mermelada' : 'nata'
  const closingField = !slices.visible && (showcase.visible || !featured.visible)
  return { featured, showcase, slices, afterHero, closingField }
}

export type FeaturedSection = ReturnType<typeof useFeaturedSection>
export type ShowcaseSection = ReturnType<typeof useShowcaseSection>
export type SlicesSection = ReturnType<typeof useSlicesSection>
