import { useCallback, useMemo, useState } from 'react'
import { getCakeDesignOptions } from '../models/cakeDesign.ts'
import { MAX_LINE_QUANTITY } from '../models/cart.ts'
import type { Fulfillment } from '../models/cart.ts'
import { getProduct, isPriced, PENDING_PRICE, toCartOffering } from '../models/catalog.ts'
import type { DetailOffering, ProductDetail } from '../models/catalog.ts'
import { formatPrice } from '../models/money.ts'
import { PRESENTATION_LABELS } from '../models/presentation.ts'
import { designPrefillHref } from './cakeDesignPrefill.ts'
import { productKind, showcaseStatus, toProductCardView } from './productCards.ts'
import { modelLabel, productModel } from './productModel.ts'
import { PHOTO_PLACEHOLDER, photoView, withCartImage } from './productPhoto.ts'
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
  /** "Agotada por hoy" en la rebanada sin piezas o "Precio por confirmar" sin precio (tanda 2); si no, `null`. */
  disabledReason: string | null
}

/** Por qué no se elige una presentación en la ficha: sin precio (PENDIENTE, tanda 2) o la rebanada agotada hoy. */
function presentationReason(offering: DetailOffering): string | null {
  if (offering.price === null) return 'Precio por confirmar'
  return offering.presentation === 'slice' && offering.stock === 0 ? 'Agotada por hoy' : null
}

/** Las rebanadas se venden solo de la vitrina del día, nunca por encargo (decisión del dueño, D60). */
export const SLICES_ONLY_TODAY = 'Las rebanadas son solo de la vitrina'

/**
 * Las presentaciones que ofrece la ficha. La rebanada solo sale si hoy hay rebanadas cargadas de ese producto (es el
 * rebanado); sin piezas, sale desactivada con "Agotada por hoy". Las demás salen siempre.
 */
export function offeredPresentations(offerings: DetailOffering[]): DetailOffering[] {
  return offerings.filter((offering) => offering.presentation !== 'slice' || offering.stock !== null)
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
export function fulfillmentChoices(
  product: Pick<ProductDetail, 'salesChannel' | 'slicedToday'>,
  offering: DetailOffering,
  chosen: Fulfillment | null,
): FulfillmentChoice[] {
  const orderOnly = product.salesChannel === 'order_only'
  const showcaseOnly = product.salesChannel === 'showcase_only'
  const stock = offering.stock
  const slice = offering.presentation === 'slice'
  // El rebanado (D60) se ve completo en la vitrina, pero completo solo se encarga; eso va antes que sus existencias.
  const showcaseReason = orderOnly
    ? 'Solo por encargo'
    : product.slicedToday && offering.presentation === 'whole'
      ? 'Hoy se vende en rebanadas'
      : stock === null
        ? 'Hoy no está en la vitrina'
        : stock === 0
          ? 'Agotada por hoy'
          : null
  const orderReason = showcaseOnly ? 'Solo en vitrina' : slice ? SLICES_ONLY_TODAY : null
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
      description: orderReason ? null : 'La fecha y la hora las eliges al terminar tu pedido.',
      disabledReason: orderReason,
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
 * pastel" (para los kilos mínimos, el precio por kilo de un pan de precio completo y el modelo del pastel; si fallan, esos
 * datos quedan pendientes, el pastel se ve en su foto y la ficha sigue) y usa los días de anticipación del marco.
 *
 * Desde D95 la ficha muestra el modelo 3D del producto (`model`) con la misma forma que su imagen del catálogo (`productModel`): el
 * pastel con su muestra o el postre con su modelo. Sin modelo, la foto o su hueco, como antes.
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
  // Aparte de `view`: la forma cambia solo con el producto y las opciones, no con cada elección, así la escena no se rearma.
  const model = useMemo(() => {
    const shape = product ? productModel(product, options).shape : null
    return product && shape ? { shape, label: modelLabel(product) } : null
  }, [options, product])

  const view = useMemo(() => {
    if (!product) return null
    const offered = offeredPresentations(product.offerings)
    const selectable = offered.filter((o) => presentationReason(o) === null)
    const offering = selectable.find((o) => o.id === offeringId) ?? selectable[0] ?? null
    const fulfillments = offering ? fulfillmentChoices(product, offering, null) : []
    const fulfillment = effectiveFulfillment(fulfillments, wanted)
    const maxQuantity = fulfillment === 'showcase' && offering?.stock ? offering.stock : MAX_LINE_QUANTITY
    // La cantidad que se ve, ajustada al tope: la usan el contador y el "c/u".
    const shown = Math.min(quantity, maxQuantity)
    const minKg = optionsState.status === 'loading' ? undefined : (options?.limits.minCustomKg ?? null)
    return {
      name: product.name,
      kind: productKind(product),
      statuses: showcaseStatus(product),
      /** Hoy es el rebanado: la ficha dice que hay rebanadas y que el completo se encarga. */
      slicedToday: product.slicedToday && product.salesChannel !== 'order_only',
      description: product.description || product.summary,
      photo: photoView(offering?.photo ?? product.photo, product.name, PHOTO_PLACEHOLDER[product.category]),
      presentations: offered.map<PresentationChoice>((o) => ({
        id: o.id,
        label: PRESENTATION_LABELS[o.presentation],
        description: offeringSize(o),
        price: o.price === null ? PENDING_PRICE : (formatPrice(o.price) ?? ''),
        checked: o.id === offering?.id,
        disabledReason: presentationReason(o),
      })),
      fulfillments: fulfillments.map((choice) => ({ ...choice, checked: choice.value === fulfillment })),
      canAdd: offering !== null && fulfillment !== null,
      /** Ninguna presentación se puede pedir porque todas esperan su precio (tanda 2). */
      pricePending: offering === null && offered.some((o) => o.price === null),
      quantity: shown,
      maxQuantity,
      /** Precio por pieza de la presentación elegida; con más de una, "c/u" (el total lo calcula el backend). */
      unitPrice: offering?.price ? `${formatPrice(offering.price) ?? ''}${shown > 1 ? ' c/u' : ''}` : null,
      storageNotes: product.storageNotes,
      transportNotes: product.transportNotes,
      personalize:
        product.category === 'cake' && product.cakeType
          ? {
              // Un pastel que sale en la vitrina se personaliza como pastel de vitrina (tanda 2): con su tipo, pan y relleno.
              showcase: product.showcaseDesign?.available === true,
              href: designPrefillHref(product.slug, product.showcaseDesign?.available === true),
              // Un pastel con su pan fijo (Choco-pingüino, Red velvet) no se ofrece en todos los tipos: no se promete.
              title: product.showcaseDesign?.available
                ? '¿Lo quieres con tu decoración?'
                : product.bread === null
                  ? '¿Lo quieres seco, envinado o más grande?'
                  : '¿Lo quieres más grande o a tu gusto?',
              minKg,
              leadDays: store.status === 'loading' ? undefined : store.leadDays,
            }
          : null,
      related: product.related.map((card) => toProductCardView(card)),
      /** El modelo 3D que gira en el encabezado, con su nombre accesible; `null` sin modelo (se ve `photo`). */
      model,
      offering,
      fulfillment,
    }
  }, [model, offeringId, options, optionsState.status, product, quantity, store, wanted])

  const addToOrder = useCallback(() => {
    if (!product || !view?.offering || !view.fulfillment) return
    const { offering, fulfillment } = view
    // Sin precio (PENDIENTE) no se agrega: la opción ya va desactivada.
    if (!isPriced(offering)) return
    // Defensa: una rebanada nunca se encarga (la opción ya va desactivada).
    if (offering.presentation === 'slice' && fulfillment === 'order') return
    // Una rebanada no lleva la imagen del modelo (es la del pastel completo): el carrito muestra su foto, como en `toSliceItem`.
    const image = offering.presentation === 'slice' ? { ...product, modelImage: null } : product
    add(withCartImage(toCartOffering(product, offering, fulfillment), image), view.quantity, fulfillment === 'showcase' ? (offering.stock ?? 0) : undefined)
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
