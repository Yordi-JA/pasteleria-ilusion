/**
 * Lo que muestran la confirmación, "Mis pedidos" y el detalle del pedido (D69), sin React: las perlas y la línea de
 * tiempo del estado, las partidas con los nombres del diseño, el desglose pagado, la entrega, el pago y la base.
 * Ningún monto se calcula aquí: todos vienen del servidor. La API solo da la fecha del pago (`paid_with.paid_at`) y la
 * del estado actual (`status_changed_at`); los pasos intermedios dicen que ya pasaron, sin fecha.
 */
import type { AccountOrder, AccountOrderItem, OrderStand } from '../models/accountOrders.ts'
import { bakeryMoment, formatDateInSentence } from '../models/dates.ts'
import { formatPrice } from '../models/money.ts'
import type { OrderPayment } from '../models/orders.ts'
import { offeringLabel, PRESENTATION_LABELS } from '../models/presentation.ts'
import { orderLineThumbnail, whenText } from './paymentView.ts'
import { flavorSentence } from './referenceFlavorView.ts'

/** Las perlas del pedido (libro de marca): un paso por estado desde que se paga. */
export const PEARL_STEPS = ['Recibido', 'En preparación', 'Listo para entregar', 'Entregado']

const PEARL_INDEX: Record<string, number> = { received: 1, in_preparation: 2, ready_for_delivery: 3, delivered: 4 }

const ZERO = /^0+(?:\.0+)?$/

function isZero(amount: string): boolean {
  return ZERO.test(amount)
}

function price(amount: string): string {
  return formatPrice(amount) ?? amount
}

/** El paso de las perlas (1 a 4), o `null` si el pedido todavía no se paga, se canceló o espera cotización. */
export function pearlStep(status: string): number | null {
  return PEARL_INDEX[status] ?? null
}

/** Si el pedido ya está pagado (regla 12): de `received` en adelante. */
export function isPaid(status: string): boolean {
  return pearlStep(status) !== null
}

/** En curso: todavía no se entrega ni se canceló. */
export function isInProgress(order: AccountOrder): boolean {
  return order.status !== 'delivered' && order.status !== 'cancelled'
}

/** "viernes 13 de noviembre": el día de un instante de la API, en la hora de la pastelería. */
function dayOf(instant: string | null): string | null {
  const moment = bakeryMoment(instant)
  return moment ? formatDateInSentence(moment.date) : null
}

/** "viernes 13 de noviembre, 12:09". */
function momentOf(instant: string | null): string | null {
  const moment = bakeryMoment(instant)
  const day = moment ? formatDateInSentence(moment.date) : null
  return moment && day ? `${day}, ${moment.clock}` : null
}

function dateOf(isoDate: string): string {
  return formatDateInSentence(isoDate) ?? isoDate
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

const DESIGN_NAME = 'Pastel de Diseña tu pastel'
/** El nombre de la línea de una cotización aceptada si el servidor no lo manda; el suyo es el mismo (D70). */
export const REFERENCE_NAME = 'Pastel según tu referencia'

function itemName(item: AccountOrderItem): string {
  if (item.kind === 'reference') return item.productName ?? REFERENCE_NAME
  if (item.kind === 'design' || !item.productName || !item.presentation) return DESIGN_NAME
  return offeringLabel(item.productName, item.presentation)
}

/**
 * Una partida del pedido: nombre, detalle corto, los nombres del diseño (si es uno), importe y la miniatura del pastel
 * diseñado si se acaba de pedir en esta pestaña (tanda 4).
 */
export type OrderItemView = { key: string; name: string; brief: string; detail: string | null; total: string; thumbnail: string | null }

function itemView(item: AccountOrderItem, index: number): Omit<OrderItemView, 'thumbnail'> {
  const pieces = `${item.quantity} ${item.quantity === 1 ? 'pieza' : 'piezas'}`
  // El pastel de una cotización aceptada (D70): su nombre es el del servidor y su sabor, el de la solicitud.
  if (item.kind === 'reference') {
    const kg = item.reference?.kg ? `${item.reference.kg} kg` : null
    const detail = item.reference ? flavorSentence(item.reference) : null
    return { key: `linea-${index}`, name: itemName(item), brief: kg ?? 'Cotizado por la pastelería', detail, total: price(item.lineTotal) }
  }
  if (item.kind === 'design' || !item.productName || !item.presentation) {
    // La etiqueta del tamaño del servidor (tanda 2): "Pastel mini, ~3 personas" sin kilos ni pisos; por kilos, con sus pisos.
    const kg = item.design?.sizeLabel ?? (item.design?.kg ? `${item.design.kg} kg` : null)
    const tiers = item.design?.tiers && !item.design.small ? `${item.design.tiers} ${item.design.tiers === 1 ? 'piso' : 'pisos'}` : null
    const names = item.names
    const filling = names ? [names.fillingBase, ...names.fillingFlavors].filter((name): name is string => Boolean(name)) : []
    const detail = names
      ? [`Pan: ${names.bread}.`, filling.length > 0 ? `Relleno: ${joinList(filling)}.` : null, `Decoración: ${names.decoration}.`].filter(Boolean).join(' ')
      : null
    return { key: `linea-${index}`, name: DESIGN_NAME, brief: [kg, tiers].filter(Boolean).join(', ') || pieces, detail, total: price(item.lineTotal) }
  }
  return { key: `linea-${index}`, name: itemName(item), brief: `${PRESENTATION_LABELS[item.presentation]}, ${pieces}`, detail: null, total: price(item.lineTotal) }
}

/** "Tres leches de durazno y 1 producto más". */
export function orderBrief(order: AccountOrder): string {
  const [first, ...rest] = order.items
  if (!first) return 'Sin productos'
  if (rest.length === 0) return itemName(first)
  return `${itemName(first)} y ${rest.length} ${rest.length === 1 ? 'producto' : 'productos'} más`
}

export type SummaryRow = { label: string; amount: string }

/** El desglose del pedido (libro de marca, "Pago y entrega"), "pagado" o "por pagar" según el estado. */
function summaryRows(payment: OrderPayment | null, paid: boolean): SummaryRow[] {
  if (!payment) return []
  const suffix = paid ? ' pagado' : ' por pagar'
  let advance = `Anticipo${suffix} (${payment.advancePercent}%)`
  if (isZero(payment.payOnDelivery)) advance = `Pedido completo${suffix}`
  else if (!isZero(payment.paidInFull)) advance = `Anticipo${suffix}, con la vitrina de hoy completa`
  const rows: SummaryRow[] = [{ label: advance, amount: price(payment.advance) }]
  if (!isZero(payment.baseDeposit)) rows.push({ label: `Depósito de la base${suffix}`, amount: price(payment.baseDeposit) })
  if (!isZero(payment.deliveryFee)) rows.push({ label: `Envío${suffix}`, amount: price(payment.deliveryFee) })
  if (!isZero(payment.payOnDelivery)) rows.push({ label: 'Resto, el día de la entrega', amount: price(payment.payOnDelivery) })
  return rows
}

export type PaidSummaryView = {
  items: OrderItemView[]
  /** "Total del pedido": sin la base (libro de marca). */
  total: string
  rows: SummaryRow[]
  /** "Te lo devolvemos si regresas la base antes del martes 1 de diciembre con tu nota."; `null` sin base. */
  depositNote: string | null
}

function firstReturnBy(stands: OrderStand[]): string | null {
  const dates = stands.filter((stand) => stand.status !== 'returned').map((stand) => stand.returnBy)
  return dates.length > 0 ? [...dates].sort()[0] : null
}

/** `thumbnails`: las miniaturas por línea del pedido recién creado (la confirmación); el detalle del pedido no las lleva. */
export function paidSummary(order: AccountOrder, thumbnails: (string | null)[] = []): PaidSummaryView {
  const returnBy = firstReturnBy(order.stands)
  return {
    items: order.items.map((item, index) => ({ ...itemView(item, index), thumbnail: orderLineThumbnail(thumbnails, order.items, index) })),
    total: `${price(order.subtotal)} MXN`,
    rows: summaryRows(order.payment, isPaid(order.status)),
    depositNote: returnBy ? `Te lo devolvemos si regresas la base antes del ${dateOf(returnBy)} con tu nota.` : null,
  }
}

export type StepState = 'done' | 'current' | 'pending'
export type TimelineStep = { title: string; detail: string | null; state: StepState }

/** Las palabras que oye un lector de pantalla junto al paso. */
export const STEP_STATE_WORDS: Record<StepState, string> = { done: 'hecho', current: 'en curso', pending: 'pendiente' }

/**
 * La línea de tiempo del pedido pagado. `confirmation` usa los textos del mockup de la confirmación ("Listo para
 * recoger", la hora de la entrega y la base); `detail`, los del detalle. Un paso ya pasado sin fecha conocida no lleva
 * detalle: la API todavía no guarda el historial de estados.
 */
export function timelineSteps(order: AccountOrder, variant: 'detail' | 'confirmation'): TimelineStep[] {
  const current = pearlStep(order.status) ?? 0
  const delivered = order.status === 'delivered'
  const since = momentOf(order.statusChangedAt)
  // "Recibido" y "Entregado" son hechos, no procesos: en su estado ya están hechos (mockup `Confirmacion`).
  const stateOf = (step: number): StepState => (step < current || (step === current && (step === 1 || delivered)) ? 'done' : step === current ? 'current' : 'pending')
  const returnBy = firstReturnBy(order.stands)

  const received = momentOf(order.paidWith?.paidAt ?? null) ?? (current === 1 ? since : null)
  const preparing = stateOf(2) === 'current' && since ? `Desde el ${since}` : stateOf(2) === 'pending' ? 'Te avisamos por correo cuando empecemos' : null
  let ready: string | null = null
  if (stateOf(3) === 'current') ready = since ? `Desde el ${since}` : null
  else if (stateOf(3) === 'pending') ready = variant === 'confirmation' ? `${whenText(order).replace(/^el /, '')}, en la pastelería` : 'Te avisamos por correo'
  let handed: string | null
  if (delivered) handed = since ? `El ${since}` : dateOf(order.deliveryDate)
  else if (variant === 'confirmation') {
    handed = returnBy ? `Y regresas la base antes del ${dateOf(returnBy)}, con tu nota, para recuperar tu depósito` : 'Lo recoges con tu nombre y tu teléfono'
  } else handed = dateOf(order.deliveryDate)

  return [
    { title: 'Recibido', detail: received ?? 'Cuando registremos tu pago', state: stateOf(1) },
    { title: 'En preparación', detail: preparing, state: stateOf(2) },
    { title: variant === 'confirmation' ? 'Listo para recoger' : 'Listo para entregar', detail: ready, state: stateOf(3) },
    { title: 'Entregado', detail: handed, state: stateOf(4) },
  ]
}

/** "Recoger en la pastelería el lunes 16 de noviembre a las 3:30 pm". */
export function deliveryText(order: AccountOrder): string {
  return `${order.fulfillment === 'delivery' ? 'Entrega a domicilio' : 'Recoger en la pastelería'} ${whenText(order)}`
}

/** "Anticipo del 50% con Tarjeta (Stripe), el viernes 13 de noviembre. Resta $2,087.50 para el día de la entrega." */
export function paymentText(order: AccountOrder): string {
  const { payment, paidWith } = order
  if (order.status === 'cancelled') return 'El pedido se canceló sin pagarse. No se te cobró nada.'
  if (order.status === 'awaiting_quote' || !payment) return 'Espera su cotización: todavía no hay nada que pagar.'
  if (!paidWith || !isPaid(order.status)) return 'Falta tu pago.'
  const what = isZero(payment.payOnDelivery) ? 'Pago completo' : `Anticipo del ${payment.advancePercent}%`
  const day = dayOf(paidWith.paidAt)
  const rest = isZero(payment.payOnDelivery) ? '' : ` Resta ${price(payment.payOnDelivery)} para el día de la entrega.`
  return `${what} con ${paidWith.methodLabel}${day ? `, el ${day}` : ''}.${rest}`
}

export type StandView = { key: string; title: string; status: string; sentence: string }

export function standViews(order: AccountOrder): StandView[] {
  return order.stands.map((stand, index) => {
    const deposit = price(stand.deposit)
    const returned = stand.status === 'returned'
    const day = returned ? dayOf(stand.returnedAt) : null
    const sentence = returned
      ? `${day ? `La regresaste el ${day}. ` : ''}Te devolvimos el depósito de ${deposit}.`
      : `Depósito de ${deposit}. Regresa la base antes del ${dateOf(stand.returnBy)} (${stand.returnDays} días) con tu nota y te devolvemos el importe.`
    return {
      key: `base-${index}`,
      title: `Base para ${stand.kg} kg`,
      status: stand.statusLabel ?? (isPaid(order.status) ? 'Depósito retenido' : 'Depósito por pagar'),
      sentence,
    }
  })
}

/** "Hecho el viernes 13 de noviembre. Para el lunes 16 de noviembre." */
export function orderDates(order: AccountOrder): string {
  const made = dayOf(order.createdAt)
  return `${made ? `Hecho el ${made}. ` : ''}Para el ${dateOf(order.deliveryDate)}.`
}

/** Una tarjeta de "Mis pedidos". */
export type OrderCardView = {
  id: number
  title: string
  href: string
  /** El paso de las perlas, o `null`: entonces el estado va solo en palabras. */
  pearl: number | null
  statusLabel: string
  /** "Apartado, falta tu pago": va como aviso y lleva a pagar. */
  payHref: string | null
  brief: string
  when: string
  remaining: string | null
  created: string | null
  total: string
}

export function orderCard(order: AccountOrder): OrderCardView {
  const payment = order.payment
  const made = dayOf(order.createdAt)
  const place = order.fulfillment === 'delivery' ? 'a domicilio' : 'a recoger en la pastelería'
  return {
    id: order.id,
    title: `Pedido #${order.id}`,
    href: `/cuenta/pedidos/${order.id}`,
    pearl: pearlStep(order.status),
    statusLabel: order.statusLabel,
    payHref: order.status === 'awaiting_payment' ? `/pedido/pago?pedido=${order.id}` : null,
    brief: orderBrief(order),
    when: `Para el ${dateOf(order.deliveryDate)}, ${place}`,
    remaining: payment && isPaid(order.status) && order.status !== 'delivered' && !isZero(payment.payOnDelivery) ? `Resta ${price(payment.payOnDelivery)} al entregar` : null,
    created: made ? `del ${made}` : null,
    total: price(order.subtotal),
  }
}
