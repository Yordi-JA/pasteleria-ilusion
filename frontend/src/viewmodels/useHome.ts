import { useMemo, useState } from 'react'
import { featuredOffering, getFeaturedProducts, getShowcase, isPriced, PENDING_PRICE, toCartOffering } from '../models/catalog.ts'
import type { ProductCard, StockItem } from '../models/catalog.ts'
import { formatPrice } from '../models/money.ts'
import { offeringLabel, PRESENTATION_LABELS } from '../models/presentation.ts'
import { showcaseView } from './todayItems.ts'
import type { ShowcaseFilter } from './todayItems.ts'
import { useAddOne } from './useAddToCart.ts'
import type { AddFeedback, Addable } from './useAddToCart.ts'
import { catalogImageView, withCartImage } from './productPhoto.ts'
import type { PhotoView } from './productPhoto.ts'
import { useRemoteData } from './useRemoteData.ts'
import type { RemoteData } from './useRemoteData.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** Lo que la portada muestra de la vitrina: la maqueta tiene dos filas de cuatro. */
export const SHOWCASE_LIMIT = 8

/** Lo común a las dos secciones de datos. */
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
  // Un precio PENDIENTE (tanda 2) lleva su marcador y no se agrega al pedido.
  const priced = offering && isPriced(offering) ? offering : null
  const amount = offering && (priced ? price(priced.price) : PENDING_PRICE)
  return {
    key: card.slug,
    name: card.name,
    summary: card.summary,
    price: offering && (offering.presentation === 'whole' ? amount : `${PRESENTATION_LABELS[offering.presentation]}, ${amount}`),
    photo: catalogImageView(card),
    addable: priced && { offering: withCartImage(toCartOffering(card, priced), card), label: offeringLabel(card.name, priced.presentation) },
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
    // La portada muestra la imagen del modelo donde la API la da (D86); `/vitrina` conserva las fotos.
    return showcaseView(all, filter, SHOWCASE_LIMIT, { modelImages: true })
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

// --- Portada ---

/**
 * Las dos secciones de datos de la portada, cada una con su carga, su reintento y su aviso, y el campo de color que depende de
 * cuáles aparecen. `afterHero` es el campo del que cuelgan los 21 px de la guirnalda del hero: `nata` con pasteles de la casa,
 * `fresa` si la vitrina sigue al hero (mismo color, sin borde) y `nata` si solo quedan las fotos de "Hechos en la casa", que
 * siempre están. Esas fotos cierran la página y la guirnalda del marco cuelga de ellas, en `nata`.
 */
export function useHome() {
  const featured = useFeaturedSection()
  const showcase = useShowcaseSection()
  const afterHero: 'nata' | 'fresa' = !featured.visible && showcase.visible ? 'fresa' : 'nata'
  return { featured, showcase, afterHero }
}

export type FeaturedSection = ReturnType<typeof useFeaturedSection>
export type ShowcaseSection = ReturnType<typeof useShowcaseSection>
