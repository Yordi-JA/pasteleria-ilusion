import type { CakeDesignOptions, CakeDesignQuote } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import { formatPrice } from '../models/money.ts'
import { OCCASIONS } from '../models/occasion.ts'
import { decorationSummary, decorationSwatches, groupOf } from './cakeDecorations.ts'
import { lowerFirst } from './cakeDesignChoices.ts'
import { COVERAGE_STEP, DECORATION_STEP, LID_STEP } from './cakeDesignSteps.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'
import { messageColorPhrase, shapeLabel } from './cakeLid.ts'
import { colorPhrase } from './colors.ts'
import { messageInk } from './messageColors.ts'
import type { PriceState } from './useCakeDesignPrice.ts'

/**
 * La revisión del pedido (paso 8, reglas 6.4, 7 y 10): el desglose con los montos que dio la API, el anticipo y lo que se paga
 * hoy. El navegador no calcula ningún monto: todos salen de `POST cake-designs/price/` y aquí solo se les da formato y frase.
 * Sin sus montos (todavía calcula, falló o es un estimado), `ready` es falso y "Agregar al pedido" espera.
 */

export type ReviewLine = {
  key: string
  title: string
  detail?: string
  /** Muestras de color del renglón (cobertura, decoración, mensaje): van junto al detalle, que siempre dice el código. */
  swatches?: string[]
  /** "$3,825", "Incluido", "+$125" o "Por cotizar". */
  amount: string
  /** A qué paso lleva su "Cambiar" y cómo se dice ("el mensaje"); sin él (la base, los totales, los pagos), no se cambia aquí. */
  change?: { step: number; label: string }
}

/** Por qué no hay desglose: la petición del precio falló (se puede reintentar) o la API rechazó la elección (no, daría lo mismo). */
export type ReviewProblem = { title: string; detail: string | null; canRetry: boolean }

export type ReviewView = {
  ready: boolean
  /** Sin desglose y sin salida si esto no se muestra: la revisión nunca se queda en "Calculando" cuando el precio falló. */
  problem: ReviewProblem | null
  /** Todavía llegan los montos (no falló ni los rechazó la API). */
  calculating: boolean
  occasions: { value: string; label: string }[]
  occasion: string
  lines: ReviewLine[]
  /** "Total del pedido" y su monto con "MXN". */
  total: { label: string; amount: string } | null
  /** Las líneas de lo que se paga hoy; `null` si la pastelería aún no pone el precio (no se cobra nada). */
  payment: { advance: ReviewLine; deposit: ReviewLine | null; today: ReviewLine; onDelivery: ReviewLine } | null
  /** La decoración por cotizar deja el pedido en pausa. */
  quoteNotice: boolean
  footnote: string | null
}

const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`)

/** "Pastel tres leches de pan de chocolate, relleno con queso y zarzamora". */
export function cakeTitle(design: DesignDerived): string {
  const type = design.cakeType ? ` ${lowerFirst(design.cakeType.label)}` : ''
  const bread = design.bread ? ` de pan de ${lowerFirst(design.bread.name)}` : ''
  if (design.fillingIncluded || !design.base) return `Pastel${type}${bread}${design.fillingIncluded ? ', relleno incluido' : ''}`
  const flavors = joinNames(design.flavors.map((flavor) => lowerFirst(flavor.name)))
  // "relleno con queso y zarzamora", "relleno normal de durazno y nuez".
  const connector = /^con /i.test(design.base.name) ? 'y' : 'de'
  return `Pastel${type}${bread}, relleno ${lowerFirst(design.base.name)}${flavors ? ` ${connector} ${flavors}` : ''}`
}

/** "color lila" -> "Color lila"; vacío, nada. */
const upperFirst = (text: string) => (text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : undefined)

const money = (value: string) => formatPrice(value) ?? value

/** Un monto de una línea que puede ser parte del pedido: "Incluido" si es $0, "+$125" si suma. */
function surcharge(value: string): string {
  return Number(value) === 0 ? 'Incluido' : `+${money(value)}`
}

type ReviewInput = {
  draft: CakeDesignDraft
  design: DesignDerived
  options: CakeDesignOptions
  price: PriceState
  /** Los días de anticipación de un pedido (de la pastelería); `null` mientras se cargan. */
  leadDays: number | null
}

export function reviewView({ draft, design, options, price, leadDays }: ReviewInput): ReviewView {
  const quote: CakeDesignQuote | null = price.quote
  const breakdown = quote?.breakdown ?? null
  const ready = Boolean(breakdown) && !price.estimate && !price.updating && !price.failed && !quote?.rejected
  const rejected = Boolean(quote?.rejected) && !price.updating
  const problem: ReviewProblem | null = price.failed
    ? { title: 'No pudimos calcular tu pedido', detail: 'Revisa tu conexión y vuelve a intentarlo.', canRetry: true }
    : rejected
      ? { title: 'No pudimos calcular tu pedido', detail: quote?.rejectedReason ?? 'Lo que elegiste no se puede calcular. Cambia algún paso.', canRetry: false }
      : null
  const view: ReviewView = {
    ready,
    problem,
    calculating: !breakdown && !problem,
    occasions: OCCASIONS.map(({ value, label }) => ({ value, label })),
    occasion: draft.occasion ?? '',
    lines: [],
    total: null,
    payment: null,
    quoteNotice: false,
    footnote: null,
  }
  if (!breakdown || !quote) return view
  view.lines.push({
    key: 'cake',
    title: cakeTitle(design),
    detail: `${breakdown.kg} kg × ${money(breakdown.pricePerKg)} por kg`,
    amount: money(breakdown.cakeSubtotal),
    // El renglón junta cuatro pasos (tamaño, tipo, pan y relleno): lleva al primero, y de ahí se avanza por el resto.
    change: { step: 1, label: 'el pastel: tamaño, tipo, pan y relleno' },
  })
  if (design.coverage) {
    view.lines.push({
      key: 'coverage',
      title: 'Cobertura de crema pastelera',
      detail: `Color ${colorPhrase(design.coverage, options.coverageColors)}`,
      swatches: [design.coverage],
      amount: 'Incluido',
      change: { step: COVERAGE_STEP, label: 'la cobertura' },
    })
  }
  if (design.decoration) {
    const summary = decorationSummary(draft, design, options)
    const none = groupOf(design.decoration.slug) === 'none'
    view.lines.push({
      key: 'decoration',
      title: none ? design.decoration.name : `Decoración: ${design.decoration.name}`,
      detail: none ? undefined : upperFirst(summary?.value.slice(design.decoration.name.length + 2) ?? ''),
      swatches: none || breakdown.requiresQuote ? undefined : decorationSwatches(draft, design),
      amount: breakdown.requiresQuote ? 'Por cotizar' : surcharge(breakdown.decoration),
      change: { step: DECORATION_STEP, label: 'la decoración' },
    })
  }
  if (draft.messageEnabled && draft.message.text.trim() !== '') {
    view.lines.push({
      key: 'message',
      title: `Mensaje: ${draft.message.text.trim()}`,
      detail: upperFirst(messageColorPhrase(draft, design.coverage, options.coverageColors) ?? 'color negro'),
      swatches: [messageInk(draft.message.color, design.coverage)],
      amount: 'Incluido',
      change: { step: LID_STEP, label: 'el mensaje' },
    })
  }
  if (draft.waferEnabled) {
    const shape = draft.wafer ? shapeLabel(draft.wafer.shape) : null
    view.lines.push({
      key: 'wafer',
      title: 'Oblea con tu imagen',
      detail: [shape, draft.waferImageName].filter(Boolean).join(', ') || undefined,
      amount: surcharge(breakdown.wafer),
      change: { step: LID_STEP, label: 'la oblea' },
    })
  }
  const { stand } = quote
  if (stand) {
    view.lines.push({
      key: 'stand',
      title: `Base para ${breakdown.kg} kg`,
      detail: `Depósito aparte del pedido: te lo devolvemos si regresas la base en ${stand.returnDays} días con tu nota`,
      amount: money(stand.deposit),
    })
  }
  view.quoteNotice = breakdown.requiresQuote
  view.total = { label: breakdown.requiresQuote ? 'Total sin la decoración' : 'Total del pedido', amount: `${money(breakdown.total)} MXN` }
  const { payment } = quote
  if (payment) {
    view.payment = {
      advance: { key: 'advance', title: `Anticipo (${payment.advancePercent}% del pedido)`, amount: money(payment.advance) },
      deposit: stand ? { key: 'deposit', title: 'Depósito de la base', amount: money(payment.baseDeposit) } : null,
      today: { key: 'today', title: 'Pagas hoy', amount: money(payment.payToday) },
      onDelivery: { key: 'delivery', title: 'Resto, el día de la entrega', amount: money(payment.payOnDelivery) },
    }
    const delivery = leadDays === null ? '' : `; tu pastel puede ser para dentro de ${leadDays} días o después`
    view.footnote =
      `Precio final. Hoy pagas el ${payment.advancePercent}% del pedido más el depósito de la base, y el resto el día de la entrega. ` +
      `La fecha y la forma de entrega las eliges en el carrito${delivery}.`
  }
  return view
}
