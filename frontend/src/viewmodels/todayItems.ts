import { stockItemToCartOffering } from '../models/catalog.ts'
import type { ProductCategory, StockItem } from '../models/catalog.ts'
import { formatPrice } from '../models/money.ts'
import { offeringLabel } from '../models/presentation.ts'
import type { Addable } from './useAddToCart.ts'
import { PHOTO_PLACEHOLDER, photoView } from './productPhoto.ts'
import type { PhotoView } from './productPhoto.ts'
import { productHref } from './productCards.ts'

/**
 * Lo que muestran las partidas de hoy (vitrina y rebanadas) en la portada, en `/vitrina` y en `/rebanadas`, sin
 * saber de dónde salió cada una. Funciones puras, sin React.
 */

function price(value: string): string {
  // El modelo ya validó el monto; el respaldo vacío solo cubre al tipo.
  return formatPrice(value) ?? ''
}

/** Lo disponible primero, en el orden de la API; lo agotado al final, para que no ocupe los primeros lugares. */
export function availableFirst<T extends Pick<StockItem, 'soldOut'>>(items: T[]): T[] {
  return [...items.filter((item) => !item.soldOut), ...items.filter((item) => item.soldOut)]
}

/** "Quedan 3", "Queda 1"; `null` si no queda nada. */
export function remainingLabel(stock: number): string | null {
  if (stock <= 0) return null
  return stock === 1 ? 'Queda 1' : `Quedan ${stock}`
}

// --- Vitrina ---

type ShowcaseItemBase = {
  key: string
  /** El producto, con la presentación cuando no es el completo: "Mini de tres leches de durazno". */
  label: string
  /** "$350"; en el rebanado, "$35 la rebanada". */
  price: string
  photo: PhotoView
  soldOut: boolean
  /** "Quedan 2", también en el rebanado (sus rebanadas). `null` si se agotó. */
  remaining: string | null
}

/**
 * Una partida de la vitrina. `stock` se agrega al pedido como línea de la vitrina de hoy, con tope en lo que queda.
 * `sliced` es el rebanado (D60): se ve completo con la palabra "Rebanado", pero no se agrega completo; ofrece sus
 * rebanadas y encargarlo completo desde la ficha.
 */
export type ShowcaseItemView =
  | (ShowcaseItemBase & Addable & { kind: 'stock' })
  | (ShowcaseItemBase & { kind: 'sliced'; slicesHref: string; orderHref: string })

export function toShowcaseItem(item: StockItem): ShowcaseItemView {
  if (item.sliced) {
    return {
      kind: 'sliced',
      key: String(item.offeringId),
      label: item.productName,
      price: `${price(item.price)} la rebanada`,
      photo: photoView(item.photo, item.productName, PHOTO_PLACEHOLDER[item.category]),
      soldOut: item.soldOut,
      // Sin la unidad: el precio de arriba ya dice "la rebanada", y en 390 px la frase cabe en una línea.
      remaining: item.soldOut ? null : remainingLabel(item.stock),
      slicesHref: '/rebanadas',
      orderHref: productHref(item.productSlug),
    }
  }
  const label = offeringLabel(item.productName, item.presentation)
  return {
    kind: 'stock',
    key: String(item.offeringId),
    label,
    price: price(item.price),
    photo: photoView(item.photo, label, PHOTO_PLACEHOLDER[item.category]),
    soldOut: item.soldOut,
    remaining: item.soldOut ? null : remainingLabel(item.stock),
    offering: stockItemToCartOffering(item),
    maxQuantity: item.stock,
  }
}

export type ShowcaseFilter = 'all' | ProductCategory

export const SHOWCASE_FILTERS: { value: ShowcaseFilter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'cake', label: 'Pasteles' },
  { value: 'dessert', label: 'Postres' },
]

const FILTER_EMPTY: Record<ProductCategory, string> = {
  cake: 'Hoy no hay pasteles en la vitrina.',
  dessert: 'Hoy no hay postres en la vitrina.',
}

/**
 * La vitrina con un filtro: lo disponible primero (hasta `limit`), si todo lo cargado hoy se agotó ("Por hoy se vendió
 * todo lo de la vitrina", también el rebanado sin rebanadas) y la frase de un chip sin nada. Los chips se muestran
 * solo con algo que filtrar.
 */
export function showcaseView(all: StockItem[], filter: ShowcaseFilter, limit = Infinity) {
  const allSoldOut = all.length > 0 && all.every((item) => item.soldOut)
  const inFilter = filter === 'all' ? all : all.filter((item) => item.category === filter)
  const items = availableFirst(inFilter).slice(0, limit).map(toShowcaseItem)
  const emptyFilter = !allSoldOut && items.length === 0 && filter !== 'all' ? FILTER_EMPTY[filter] : null
  const filters = all.length > 0 && !allSoldOut ? SHOWCASE_FILTERS.map((option) => ({ ...option, checked: option.value === filter })) : []
  return { total: all.length, allSoldOut, items, emptyFilter, filters }
}

// --- Rebanadas ---

export type SliceItemView = Addable & {
  key: string
  name: string
  /** "$35 la rebanada". */
  price: string
  /** "Quedan 3", "Queda 1"; `null` si se agotó. */
  remaining: string | null
  soldOut: boolean
  photo: PhotoView
  /** La ficha del pastel, para encargarlo completo. */
  productHref: string
}

export function toSliceItem(item: StockItem): SliceItemView {
  return {
    key: String(item.offeringId),
    name: item.productName,
    price: `${price(item.price)} la rebanada`,
    remaining: item.soldOut ? null : remainingLabel(item.stock),
    soldOut: item.soldOut,
    photo: photoView(item.photo, offeringLabel(item.productName, item.presentation), 'Foto de la rebanada'),
    offering: stockItemToCartOffering(item),
    maxQuantity: item.stock,
    productHref: productHref(item.productSlug),
  }
}
