import { CAKE_TYPE_LABELS, featuredOffering, PENDING_PRICE } from '../models/catalog.ts'
import type { CardOffering, ProductCard, ProductCategory } from '../models/catalog.ts'
import { formatPrice } from '../models/money.ts'
import { PRESENTATION_LABELS } from '../models/presentation.ts'
import { PHOTO_PLACEHOLDER, photoView } from './productPhoto.ts'
import type { PhotoView } from './productPhoto.ts'

/**
 * Lo que muestra una tarjeta de producto (`components/ProductCard.tsx`), sin saber de dónde salió: el catálogo y la
 * ficha la arman con `toProductCardView`; la vitrina y las rebanadas podrán armarla con sus partidas de hoy.
 * Funciones puras, sin React.
 */
export type ProductCardView = {
  key: string
  name: string
  /** A dónde lleva "Ver pastel": la ficha. */
  href: string
  linkLabel: string
  summary: string
  photo: PhotoView
  /** Tipo y canal de venta, como texto pequeño: "Tres leches", "Seco, solo por encargo", "Solo en vitrina". */
  kind: string | null
  /** "En vitrina hoy" y "Rebanado hoy", las que apliquen (ver `showcaseStatus`). */
  statuses: string[]
  /** El precio principal: "$350" o, si no es el completo, "Grande, $360". `null` sin presentaciones. */
  price: string | null
  /** El segundo precio, de otra presentación que no es la rebanada: "Individual, $35". */
  secondaryPrice: string | null
}

function amount(value: string): string {
  // El modelo ya validó el monto; el respaldo vacío solo cubre al tipo.
  return formatPrice(value) ?? ''
}

/**
 * El precio de una presentación como lo dicen la portada y el mockup: el completo solo con su monto, la rebanada
 * "$35 la rebanada" y las demás con su nombre, "Grande, $360", sin concordar con el género del producto (la API no
 * lo da).
 */
export function offeringPrice(offering: CardOffering): string {
  // Un precio PENDIENTE (tanda 2) lleva su marcador, nunca un monto supuesto.
  const price = offering.price === null ? PENDING_PRICE : amount(offering.price)
  if (offering.presentation === 'whole') return price
  if (offering.presentation === 'slice') return `${price} la rebanada`
  return `${PRESENTATION_LABELS[offering.presentation]}, ${price}`
}

/**
 * El segundo precio de una tarjeta: la primera otra presentación (el flan individual junto al grande). La rebanada no
 * va: solo se ofrece en la vitrina y en las rebanadas de hoy. En un pastel, el mini tampoco: el catálogo lo anuncia
 * aparte, en "Pastel mini" (mockup). El precio por kilo de un encargo solo se ve al armar el pedido (tanda 1).
 */
function secondaryOffering(card: Pick<ProductCard, 'category' | 'offerings'>, main: CardOffering | null): CardOffering | null {
  const others = card.offerings.filter(
    (offering) => offering !== main && offering.presentation !== 'slice' && !(card.category === 'cake' && offering.presentation === 'mini'),
  )
  return others[0] ?? null
}

/** Los dos precios de una tarjeta del catálogo. */
export function priceSummary(card: Pick<ProductCard, 'category' | 'offerings'>) {
  const main = featuredOffering(card)
  const second = secondaryOffering(card, main)
  return {
    price: main ? offeringPrice(main) : null,
    secondaryPrice: second ? offeringPrice(second) : null,
  }
}

/** El tipo de producto y por dónde se vende, como lo escribe el mockup en cada tarjeta. */
export function productKind(card: Pick<ProductCard, 'category' | 'cakeType' | 'salesChannel'>): string | null {
  const channel = card.salesChannel === 'order_only' ? 'Solo por encargo' : card.salesChannel === 'showcase_only' ? 'Solo en vitrina' : null
  const type = card.category === 'cake' && card.cakeType ? (CAKE_TYPE_LABELS[card.cakeType] ?? null) : null
  if (type && channel) return `${type}, ${channel.charAt(0).toLowerCase()}${channel.slice(1)}`
  return type ?? channel
}

/**
 * Las etiquetas de hoy de un producto, única fuente para la tarjeta y la ficha (regla 2):
 * - "En vitrina hoy": alguna presentación que no es rebanada tiene piezas hoy (`in_showcase_today`).
 * - "Rebanado hoy": es el pastel que se vende en rebanadas y le quedan (`sliced_today`, D60). No se compra completo.
 * Pueden ir las dos: un mini de cajeta en la vitrina y el pastel de cajeta rebanado. Un producto solo por encargo no
 * lleva ninguna.
 */
export function showcaseStatus(card: Pick<ProductCard, 'inShowcaseToday' | 'slicedToday' | 'salesChannel'>): string[] {
  if (card.salesChannel === 'order_only') return []
  return [card.inShowcaseToday && 'En vitrina hoy', card.slicedToday && 'Rebanado hoy'].filter((label): label is string => Boolean(label))
}

/** "Ver pastel" o "Ver detalle", como el mockup. */
const LINK_LABEL: Record<ProductCategory, string> = { cake: 'Ver pastel', dessert: 'Ver detalle' }

export function productHref(slug: string): string {
  return `/pasteles/${encodeURIComponent(slug)}`
}

export function toProductCardView(card: ProductCard): ProductCardView {
  return {
    key: card.slug,
    name: card.name,
    href: productHref(card.slug),
    linkLabel: LINK_LABEL[card.category],
    summary: card.summary,
    photo: photoView(card.photo, card.name, PHOTO_PLACEHOLDER[card.category]),
    kind: productKind(card),
    statuses: showcaseStatus(card),
    ...priceSummary(card),
  }
}

/** "14 pasteles", "1 pastel", "8 postres". */
export function countLabel(count: number, category: ProductCategory): string {
  const [one, many] = category === 'cake' ? ['pastel', 'pasteles'] : ['postre', 'postres']
  return `${count} ${count === 1 ? one : many}`
}
