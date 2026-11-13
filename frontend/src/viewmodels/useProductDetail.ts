import { useCallback, useMemo, useState } from 'react'
import { getCakeDesignOptions } from '../models/cakeDesign.ts'
import { MAX_LINE_QUANTITY } from '../models/cart.ts'
import type { Fulfillment } from '../models/cart.ts'
import { getProduct, toCartOffering } from '../models/catalog.ts'
import type { DetailOffering, ProductDetail } from '../models/catalog.ts'
import { formatPrice } from '../models/money.ts'
import { PRESENTATION_LABELS } from '../models/presentation.ts'
import { designPrefillHref } from './cakeDesignPrefill.ts'
import { priceSummary, productKind, showcaseStatus, toProductCardView } from './productCards.ts'
import { PHOTO_PLACEHOLDER, photoView } from './productPhoto.ts'
import { useAddToCart } from './useAddToCart.ts'
import { useRemoteData } from './useRemoteData.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** Una opción de "¿Cuándo lo quieres?". Las que no aplican se ven desactivadas con su motivo; nunca desaparecen. */
export type FulfillmentChoice = {
  value: Fulfillment
  label: string
  description: string | null
  disabledReason: string | null
  checked: boolean
}

export type PresentationChoice = {
  id: number
  label: string
  /** "Aprox. 2.7 kg, unas 19 personas"; `null` si no hay datos. */
  description: string | null
  price: string
  checked: boolean
}

function remaining(stock: number): string {
  return stock === 1 ? 'Queda 1' : `Quedan ${stock}`
}

/** Peso y personas de una presentación, como el mockup: "Aprox. 2.7 kg, unas 19 personas" o "Unas 3 personas". */
export function offeringSize(offering: Pick<DetailOffering, 'approxWeightKg' | 'servings'>): string | null {
  const weight = offering.approxWeightKg ? `Aprox. ${offering.approxWeightKg.replace(/\.0$/, '')} kg` : null
  const people = offering.servings ? `unas ${offering.servings} personas` : null
  if (weight && people) return `${weight}, ${people}`
  if (people) return `U${people.slice(1)}`
  return weight
}

/**
 * Qué se puede hacer hoy con una presentación (libro de marca, "Catálogo y vitrina"): llevarla de la vitrina si hoy
 * quedan piezas y el producto se vende ahí, o encargarla si se hace por pedido. La fecha y la hora de un encargo se
 * eligen en la entrega (Etapa 4), así que aquí no se piden.
 */
export function fulfillmentChoices(product: Pick<ProductDetail, 'salesChannel'>, offering: DetailOffering, chosen: Fulfillment | null): FulfillmentChoice[] {
  const orderOnly = product.salesChannel === 'order_only'
  const showcaseOnly = product.salesChannel === 'showcase_only'
  const stock = offering.stock
  const showcaseReason = orderOnly ? 'Solo por encargo' : stock === null ? 'Hoy no está en la vitrina' : stock === 0 ? 'Agotada por hoy' : null
  return [
    {
      value: 'showcase',
      label: 'Hoy, de la vitrina',
      description: showcaseReason === null && stock !== null ? remaining(stock) : null,
      disabledReason: showcaseReason,
      checked: chosen === 'showcase',
    },
    {
      value: 'order',
      label: 'Encargarlo para una fecha',
      description: showcaseOnly ? null : 'La fecha y la hora las eliges al terminar tu pedido.',
      disabledReason: showcaseOnly ? 'Solo en vitrina' : null,
      checked: chosen === 'order',
    },
  ]
}

/** La elección que vale: la de la persona si sigue disponible; si no, la vitrina de hoy y, sin piezas, el encargo. */
export function effectiveFulfillment(choices: FulfillmentChoice[], wanted: Fulfillment | null): Fulfillment | null {
  const available = choices.filter((choice) => choice.disabledReason === null).map((choice) => choice.value)
  if (wanted && available.includes(wanted)) return wanted
  return available[0] ?? null
}

const PRODUCT_FAILURE = 'No se pudo cargar la ficha del producto.'

/**
 * View-model de la ficha (`/pasteles/:slug`). La vista lo monta con `key={slug}`: al pasar a un relacionado, la
 * elección empieza de nuevo. Pide la ficha (un 404 es "no encontrado", no un error), las opciones de "Diseña tu
 * pastel" (solo para los kilos mínimos y el precio por kilo de un pan de precio completo; si fallan, esos datos
 * quedan pendientes y la ficha sigue) y usa los días de anticipación del marco.
 */
export function useProductDetail(slug: string) {
  const load = useCallback((signal: AbortSignal) => getProduct(slug, signal), [slug])
  const { state, retry } = useRemoteData(load, PRODUCT_FAILURE)
  const { state: optionsState } = useRemoteData(getCakeDesignOptions, 'No se pudieron cargar los kilos mínimos de la ficha.')
  const options = optionsState.status === 'ready' ? optionsState.data : null
  const store = useStoreDetails()
  const { add, feedback } = useAddToCart()

  const [offeringId, setOfferingId] = useState<number | null>(null)
  const [wanted, setWanted] = useState<Fulfillment | null>(null)
  const [quantity, setQuantity] = useState(1)

  const product = state.status === 'ready' ? state.data : null

  const view = useMemo(() => {
    if (!product) return null
    const offering = product.offerings.find((o) => o.id === offeringId) ?? product.offerings[0] ?? null
    const fulfillments = offering ? fulfillmentChoices(product, offering, null) : []
    const fulfillment = effectiveFulfillment(fulfillments, wanted)
    const maxQuantity = fulfillment === 'showcase' && offering?.stock ? offering.stock : MAX_LINE_QUANTITY
    // La cantidad que se ve, ajustada al tope: la usan el contador y el "c/u".
    const shown = Math.min(quantity, maxQuantity)
    const summary = priceSummary(product, options)
    const minKg = optionsState.status === 'loading' ? undefined : (options?.limits.minCustomKg ?? null)
    return {
      name: product.name,
      kind: productKind(product),
      status: showcaseStatus(product),
      description: product.description || product.summary,
      /** "$350 · $35 la rebanada". */
      price: [summary.price, summary.secondaryPrice].filter(Boolean).join(' · '),
      photo: photoView(offering?.photo ?? product.photo, product.name, PHOTO_PLACEHOLDER[product.category]),
      presentations: product.offerings.map<PresentationChoice>((o) => ({
        id: o.id,
        label: PRESENTATION_LABELS[o.presentation],
        description: offeringSize(o),
        price: formatPrice(o.price) ?? '',
        checked: o.id === offering?.id,
      })),
      fulfillments: fulfillments.map((choice) => ({ ...choice, checked: choice.value === fulfillment })),
      canAdd: offering !== null && fulfillment !== null,
      quantity: shown,
      maxQuantity,
      /** Precio por pieza de la presentación elegida; con más de una, "c/u" (el total lo calcula el backend). */
      unitPrice: offering ? `${formatPrice(offering.price) ?? ''}${shown > 1 ? ' c/u' : ''}` : null,
      storageNotes: product.storageNotes,
      transportNotes: product.transportNotes,
      personalize:
        product.category === 'cake' && product.cakeType
          ? {
              href: designPrefillHref(product.slug),
              // Un pastel con su pan fijo (Choco-pingüino, Red velvet) no se ofrece en todos los tipos: no se promete.
              title: product.bread === null ? '¿Lo quieres seco, envinado o más grande?' : '¿Lo quieres más grande o a tu gusto?',
              minKg,
              leadDays: store.status === 'loading' ? undefined : store.leadDays,
            }
          : null,
      related: product.related.map((card) => toProductCardView(card, options)),
      offering,
      fulfillment,
    }
  }, [offeringId, options, optionsState.status, product, quantity, store, wanted])

  const addToOrder = useCallback(() => {
    if (!product || !view?.offering || !view.fulfillment) return
    const { offering, fulfillment } = view
    add(toCartOffering(product, offering, fulfillment), view.quantity, fulfillment === 'showcase' ? (offering.stock ?? 0) : undefined)
  }, [add, product, view])

  return {
    status: state.status === 'ready' ? (product ? 'ready' : 'notFound') : state.status,
    retry,
    view,
    feedback,
    actions: {
      choosePresentation: setOfferingId,
      chooseFulfillment: setWanted,
      setQuantity,
      addToOrder,
    },
  }
}

export type ProductDetailView = ReturnType<typeof useProductDetail>
