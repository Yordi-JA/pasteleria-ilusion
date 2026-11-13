import type { CakeDesignOptions } from '../models/cakeDesign.ts'
import { CAKE_TYPE_LABELS, featuredOffering } from '../models/catalog.ts'
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
  /** "En vitrina hoy" o `null`. */
  status: string | null
  /** El precio principal: "$350" o, si no es el completo, "Grande, $360". `null` sin presentaciones. */
  price: string | null
  /** El segundo precio: "$35 la rebanada", "Individual, $35" o "Por pedido, $280 por kg". */
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
  const price = amount(offering.price)
  if (offering.presentation === 'whole') return price
  if (offering.presentation === 'slice') return `${price} la rebanada`
  return `${PRESENTATION_LABELS[offering.presentation]}, ${price}`
}

/**
 * El segundo precio de una tarjeta: la rebanada si la hay; si no, la primera otra presentación. En un pastel, el
 * mini no cuenta: el catálogo lo anuncia aparte, en "Pastel mini" (mockup).
 */
function secondaryOffering(card: Pick<ProductCard, 'category' | 'offerings'>, main: CardOffering | null): CardOffering | null {
  const others = card.offerings.filter((offering) => offering !== main && !(card.category === 'cake' && offering.presentation === 'mini'))
  return others.find((offering) => offering.presentation === 'slice') ?? others[0] ?? null
}

/**
 * El precio por kilo de un pan de precio completo (Red velvet: "Por pedido, $280 por kg"), de las opciones de
 * "Diseña tu pastel" (D45: `bread` de la tarjeta sirve para esto). `null` si no aplica o si las opciones no llegaron.
 */
export function orderPricePerKg(card: Pick<ProductCard, 'bread' | 'cakeType'>, options: CakeDesignOptions | null): string | null {
  if (!options || !card.bread || !card.cakeType) return null
  const bread = options.breads.find((option) => option.slug === card.bread)
  const perKg = bread?.pricingMode === 'full_price_per_kg' ? bread.pricePerKgFrom[card.cakeType] : undefined
  const price = perKg ? formatPrice(perKg) : null
  return price ? `Por pedido, ${price} por kg` : null
}

/** Los dos precios de una tarjeta o del encabezado de la ficha. */
export function priceSummary(card: Pick<ProductCard, 'category' | 'offerings' | 'bread' | 'cakeType'>, options: CakeDesignOptions | null = null) {
  const main = featuredOffering(card)
  const second = secondaryOffering(card, main)
  return {
    price: main ? offeringPrice(main) : null,
    secondaryPrice: second ? offeringPrice(second) : orderPricePerKg(card, options),
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
 * "En vitrina hoy" (regla 2: alguna presentación que no es rebanada tiene piezas hoy, según `in_showcase_today`), o
 * `null`. Un producto solo por encargo nunca la lleva. Única fuente de esta etiqueta para la tarjeta y la ficha.
 */
export function showcaseStatus(card: Pick<ProductCard, 'inShowcaseToday' | 'salesChannel'>): string | null {
  return card.inShowcaseToday && card.salesChannel !== 'order_only' ? 'En vitrina hoy' : null
}

/** "Ver pastel" o "Ver detalle", como el mockup. */
const LINK_LABEL: Record<ProductCategory, string> = { cake: 'Ver pastel', dessert: 'Ver detalle' }

export function productHref(slug: string): string {
  return `/pasteles/${encodeURIComponent(slug)}`
}

export function toProductCardView(card: ProductCard, options: CakeDesignOptions | null = null): ProductCardView {
  return {
    key: card.slug,
    name: card.name,
    href: productHref(card.slug),
    linkLabel: LINK_LABEL[card.category],
    summary: card.summary,
    photo: photoView(card.photo, card.name, PHOTO_PLACEHOLDER[card.category]),
    kind: productKind(card),
    status: showcaseStatus(card),
    ...priceSummary(card, options),
  }
}

/** "14 pasteles", "1 pastel", "8 postres". */
export function countLabel(count: number, category: ProductCategory): string {
  const [one, many] = category === 'cake' ? ['pastel', 'pasteles'] : ['postre', 'postres']
  return `${count} ${count === 1 ? one : many}`
}
