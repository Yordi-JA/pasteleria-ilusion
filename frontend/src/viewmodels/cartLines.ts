/**
 * Lo que muestran el carrito y el resumen de la entrega (D66), sin React: cada línea en frases y el resumen con montos
 * estimados. Los montos son los que dio la API al agregar (precio por pieza o el total del pastel diseñado); el total
 * real lo calcula el servidor al crear el pedido, así que aquí solo se suman para mostrarlos como estimado.
 */
import type { CartItem, DesignItem, LineKey, OfferingItem } from '../models/cart.ts'
import { photoUrl } from '../models/catalog.ts'
import { formatPrice, PRICE_PATTERN } from '../models/money.ts'
import { PRESENTATION_LABELS } from '../models/presentation.ts'

export type CartLineView = {
  /** Clave estable para React y para los errores del servidor por línea. */
  id: string
  /** "En vitrina hoy" o "Por encargo". */
  origin: string
  name: string
  /** "Completo", "Rebanada"; `null` en un pastel diseñado. */
  presentation: string | null
  quantity: number
  /** El importe de la línea ("$70"); `null` si el monto guardado no se puede leer. */
  total: string | null
  /** "$35 la rebanada", "$350 por pieza" o "Estimado". */
  unitNote: string | null
  /** El enlace a la ficha, en una línea del catálogo. */
  slug: string | null
  /** Lo elegido en cada paso de un pastel diseñado. */
  details: string[]
  /** Una línea corta para el resumen de la entrega: "Completo, 1 pieza", "4 kg, decoración por cotizar". */
  brief: string
  /** Los kilos del pastel, para el resumen ("4 kg"); `null` si no los guardó. */
  kg: number | null
  /** La base que lleva un pastel diseñado y su depósito ya con formato. */
  base: { kg: number | null; deposit: string } | null
  requiresQuote: boolean
  /**
   * La miniatura de la línea: la del pastel diseñado (tanda 4) o la imagen de la tarjeta del catálogo (`OfferingItem.image`); `null`
   * sin ninguna: se ve el hueco de la foto.
   */
  thumbnail: string | null
  /** Para cambiar o quitar la línea. */
  key: { kind: 'offering'; line: LineKey } | { kind: 'design'; designId: string }
}

/** Por qué el carrito no puede ser un solo pedido (D63, decisión B; ronda 2 de D63). */
export type CartConflict = 'showcase_and_design' | 'two_quotes'

export type CartSummaryView = {
  /** Piezas, como el contador del encabezado. */
  count: number
  /** El estimado del pedido sin la base ("$1,250"); `null` si algún monto guardado no se puede leer. */
  total: string | null
  /** La suma de los depósitos de las bases ("$150"); `null` sin base. */
  deposit: string | null
  hasShowcase: boolean
  /** Todo es de la vitrina de hoy: se paga completo. */
  onlyShowcase: boolean
  requiresQuote: boolean
  conflict: CartConflict | null
}

/** Un monto de la API ("350.00") en centavos, sin pasar por un flotante; `null` si no es un monto. */
export function toCents(value: string): number | null {
  const match = PRICE_PATTERN.exec(value)
  if (!match) return null
  const [, whole, fraction = ''] = match
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

/** Centavos como monto de la API ("1250.00"), para `formatPrice`. */
export function fromCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

function money(cents: number | null): string | null {
  return cents === null ? null : formatPrice(fromCents(cents))
}

function kgOf(item: DesignItem): number | null {
  const kg = item.design.kg
  return typeof kg === 'number' && Number.isFinite(kg) && kg > 0 ? kg : null
}

function offeringLine(item: OfferingItem): CartLineView {
  const unit = toCents(item.unitPrice)
  const unitPrice = money(unit)
  return {
    id: `${item.fulfillment}-${item.offeringId}`,
    origin: item.fulfillment === 'showcase' ? 'En vitrina hoy' : 'Por encargo',
    name: item.name,
    presentation: PRESENTATION_LABELS[item.presentation],
    quantity: item.quantity,
    total: money(unit === null ? null : unit * item.quantity),
    unitNote: unitPrice ? `${unitPrice} ${item.presentation === 'slice' ? 'la rebanada' : 'por pieza'}` : null,
    slug: item.slug,
    details: [],
    brief: `${PRESENTATION_LABELS[item.presentation]}, ${item.quantity} ${item.quantity === 1 ? 'pieza' : 'piezas'}`,
    kg: null,
    base: null,
    requiresQuote: false,
    thumbnail: item.image ? photoUrl(item.image) : null,
    key: { kind: 'offering', line: { offeringId: item.offeringId, fulfillment: item.fulfillment } },
  }
}

/** "Pastel mini, ~3 personas" o "Pastel de vitrina, ~19 personas" (tanda 2): el tamaño que guardó la línea; `null` por kilos. */
function sizeLabelOf(item: DesignItem): string | null {
  const label = item.design.sizeLabel
  return typeof label === 'string' && label.trim() !== '' && label.length <= 80 ? label : null
}

/** El renglón del paso 7 que guardó `designLine` ("Mensaje y oblea: Mensaje: Feliz día, color elegido. Oblea: …"). */
const MESSAGE_ROW = 'Mensaje y oblea: '

/**
 * Lo elegido sin el "parecido a" del color (21 de noviembre): un pastel guardado antes trae "Crema pastelera, parecido a
 * amarillo, con peinado lateral" o "color parecido a rosa", y el sitio ya no nombra el color (se ve en su muestra). Se quita al
 * leer, con las mismas palabras de ahora: "Crema pastelera, con peinado lateral", "color elegido".
 */
export function withoutColorName(detail: string): string {
  // El mensaje lo escribió quien pide: solo se cambia el color que el sitio puso al final del mensaje (antes de ". Oblea: " o del
  // final del renglón), nunca un "parecido a" del texto ("Feliz día, parecido a papá").
  if (detail.startsWith(MESSAGE_ROW)) return detail.replace(/, color parecido a [^,.\n]+(?=\. Oblea: |$)/, ', color elegido')
  return detail.replace(/color parecido a [^,.\n]+/g, 'color elegido').replace(/, parecido a [^,.\n]+/g, '')
}

function designLine(item: DesignItem): CartLineView {
  const kg = kgOf(item)
  const sizeLabel = sizeLabelOf(item)
  const deposit = item.baseDeposit ? money(toCents(item.baseDeposit)) : null
  return {
    id: `design-${item.designId}`,
    origin: 'Por encargo',
    name: item.name,
    presentation: null,
    quantity: 1,
    total: money(toCents(item.total)),
    unitNote: 'Estimado',
    slug: null,
    details: item.details.map(withoutColorName),
    brief: [sizeLabel ?? (kg ? `${kg} kg` : 'Diseña tu pastel'), item.requiresQuote ? 'decoración por cotizar' : null].filter(Boolean).join(', '),
    kg,
    base: deposit ? { kg, deposit } : null,
    requiresQuote: item.requiresQuote,
    thumbnail: item.thumbnail ?? null,
    key: { kind: 'design', designId: item.designId },
  }
}

export function cartLines(items: CartItem[]): CartLineView[] {
  return items.map((item) => (item.kind === 'design' ? designLine(item) : offeringLine(item)))
}

/** Por qué estas líneas no caben en un solo pedido, o `null`. */
export function cartConflict(items: CartItem[]): CartConflict | null {
  const hasShowcase = items.some((item) => item.kind === 'offering' && item.fulfillment === 'showcase')
  const hasDesign = items.some((item) => item.kind === 'design')
  if (hasShowcase && hasDesign) return 'showcase_and_design'
  return items.filter((item) => item.kind === 'design' && item.requiresQuote).length > 1 ? 'two_quotes' : null
}

export function cartSummary(items: CartItem[]): CartSummaryView {
  let total: number | null = 0
  let deposit = 0
  for (const item of items) {
    const cents = item.kind === 'design' ? toCents(item.total) : toCents(item.unitPrice)
    total = total === null || cents === null ? null : total + cents * item.quantity
    if (item.kind === 'design' && item.baseDeposit) deposit += toCents(item.baseDeposit) ?? 0
  }
  return {
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    total: money(total),
    deposit: deposit > 0 ? money(deposit) : null,
    hasShowcase: items.some((item) => item.kind === 'offering' && item.fulfillment === 'showcase'),
    onlyShowcase: items.length > 0 && items.every((item) => item.kind === 'offering' && item.fulfillment === 'showcase'),
    requiresQuote: items.some((item) => item.kind === 'design' && item.requiresQuote),
    conflict: cartConflict(items),
  }
}

/** "Productos (4)", como el resumen del mockup. */
export function productsLabel(count: number): string {
  return `Productos (${count})`
}

/**
 * Lo que se paga hoy, en una frase, sin cifras que dependan de la configuración (el porcentaje lo da el servidor). El anticipo
 * solo es de los encargos (diseños, encargos del catálogo y referencias); lo de la vitrina de hoy se paga completo (regla 10).
 * Lo decide el `fulfillment` de las líneas, no la vista: solo vitrina, solo encargos o los dos.
 */
export function paymentNote(summary: CartSummaryView): string {
  if (summary.onlyShowcase) return 'Hoy pagas todo: lo de la vitrina de hoy se paga completo.'
  if (summary.hasShowcase) {
    const base = summary.deposit ? ', el depósito de la base' : ''
    return `Hoy pagas el anticipo de los encargos${base} y lo de la vitrina completo.`
  }
  const base = summary.deposit ? ' y el depósito de la base' : ''
  return `Hoy pagas un anticipo del pedido${base}; el resto, al entregar.`
}
