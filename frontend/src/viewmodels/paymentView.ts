/**
 * Lo que muestran el pago y el apartado (D68), sin React: el resumen con el desglose de la API, las frases del
 * anticipo y del plazo, el estado de la pantalla y los errores del inicio del pago en español. Ningún monto se calcula
 * aquí: todos vienen del servidor (`order.payment`); el porcentaje también.
 */
import { ApiError } from '../models/apiClient.ts'
import { bakeryMoment, bakeryToday, formatDateInSentence } from '../models/dates.ts'
import { formatPrice } from '../models/money.ts'
import type { OrderPayment } from '../models/orders.ts'
import { paymentErrorBody } from '../models/payments.ts'
import type { PaymentMethod, PaymentOrder, PaymentOrderItem, PaymentState } from '../models/payments.ts'
import { offeringLabel, PRESENTATION_LABELS } from '../models/presentation.ts'
import { formatTime } from './deliverySchedule.ts'
import { cakeBrief } from './referenceFlavorView.ts'

/** Los estados de un pedido ya pagado (regla 12): de `received` en adelante. */
const PAID_STATUSES = new Set(['received', 'in_preparation', 'ready_for_delivery', 'delivered'])

export const METHOD_NAMES: Record<PaymentMethod, string> = { mercadopago: 'Mercado Pago', stripe: 'tarjeta', cash: 'efectivo' }

const ZERO = /^0+(?:\.0+)?$/

function isZero(amount: string): boolean {
  return ZERO.test(amount)
}

function price(amount: string): string {
  return formatPrice(amount) ?? amount
}

/** "el 50% del pedido, el depósito de la base y el envío": une con comas y una "y" al final. */
function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

/**
 * Lo que se paga del pedido hoy, en palabras: "el 50% del pedido", "todo el pedido" (anticipo del 100%, o solo vitrina
 * de hoy) o "el anticipo del pedido" (un encargo junto con vitrina de hoy, que va completa: el monto no es un porcentaje
 * del total, D63).
 */
function advanceWords(payment: OrderPayment): string {
  if (isZero(payment.payOnDelivery)) return 'todo el pedido'
  if (!isZero(payment.paidInFull)) return 'el anticipo del pedido'
  return `el ${payment.advancePercent}% del pedido`
}

/** La frase del encabezado del pago: "Hoy pagas el 50% del pedido y el depósito de la base; el resto, al entregar." */
export function paymentSentence(payment: OrderPayment): string {
  const parts = [advanceWords(payment)]
  if (!isZero(payment.baseDeposit)) parts.push('el depósito de la base')
  if (!isZero(payment.deliveryFee)) parts.push('el envío')
  const rest = isZero(payment.payOnDelivery) ? '.' : '; el resto, al entregar.'
  const showcase = !isZero(payment.paidInFull) && !isZero(payment.payOnDelivery) ? ' Lo de la vitrina de hoy va completo.' : ''
  return `Hoy pagas ${joinList(parts)}${rest}${showcase}`
}

/** "Paga $X: el 50% del pedido y el depósito de la base. El resto, el día de la entrega." (mockup del apartado). */
export function reservedPaymentSentence(payment: OrderPayment): string {
  const parts = [advanceWords(payment)]
  if (!isZero(payment.baseDeposit)) parts.push('el depósito de la base')
  if (!isZero(payment.deliveryFee)) parts.push('el envío')
  const rest = isZero(payment.payOnDelivery) ? '' : ' El resto, el día de la entrega.'
  return `Paga ${price(payment.payToday)}: ${joinList(parts)}.${rest}`
}

export type SummaryRow = { label: string; amount: string; strong?: boolean }

/** Una línea del resumen: nombre, detalle corto, importe y la miniatura del pastel diseñado, si la hay (tanda 4). */
export type SummaryItem = { key: string; name: string; brief: string; total: string; thumbnail: string | null }

function itemView(item: PaymentOrderItem, index: number): Omit<SummaryItem, 'thumbnail'> {
  const pieces = `${item.quantity} ${item.quantity === 1 ? 'pieza' : 'piezas'}`
  // El pastel de una cotización aceptada (D70): el servidor lo nombra ("Pastel según tu referencia").
  if (item.kind === 'reference') {
    const brief = (item.reference && cakeBrief(item.reference)) ?? 'Cotizado por la pastelería'
    return { key: `linea-${index}`, name: item.productName ?? 'Pastel según tu referencia', brief, total: price(item.lineTotal) }
  }
  if (item.kind === 'design' || !item.productName || !item.presentation) {
    // La etiqueta del tamaño del servidor (tanda 2): "Pastel mini, ~3 personas" sin kilos ni pisos; por kilos, con sus pisos.
    const kg = item.design?.sizeLabel ?? (item.design?.kg ? `${item.design.kg} kg` : null)
    const tiers = item.design?.tiers && !item.design.small ? `${item.design.tiers} ${item.design.tiers === 1 ? 'piso' : 'pisos'}` : null
    return { key: `linea-${index}`, name: 'Pastel de Diseña tu pastel', brief: [kg, tiers].filter(Boolean).join(', ') || pieces, total: price(item.lineTotal) }
  }
  return {
    key: `linea-${index}`,
    name: offeringLabel(item.productName, item.presentation),
    brief: `${PRESENTATION_LABELS[item.presentation]}, ${pieces}`,
    total: price(item.lineTotal),
  }
}

/** "Anticipo (50% del pedido)", o lo que corresponda si va completo o lleva vitrina de hoy. */
function advanceLabel(payment: OrderPayment, suffix: string): string {
  if (isZero(payment.payOnDelivery)) return `Pedido completo${suffix}`
  if (!isZero(payment.paidInFull)) return `Anticipo, con la vitrina de hoy completa${suffix}`
  return suffix ? `Anticipo${suffix} (${payment.advancePercent}%)` : `Anticipo (${payment.advancePercent}% del pedido)`
}

export type OrderSummaryView = {
  items: SummaryItem[]
  /** "Recoger en la pastelería el lunes 16 de noviembre a las 3:30 pm". */
  delivery: string
  hasDeposit: boolean
  total: string
  rows: SummaryRow[]
  payToday: string
}

/**
 * El resumen del pago (libro de marca, "Pago y entrega"): "Total del pedido" (sin la base), el anticipo, el depósito, el
 * envío solo si cuesta algo, "Pagas hoy" y el resto. `reserved` usa las etiquetas del apartado ("por pagar hoy").
 */
export function orderSummary(
  order: PaymentOrder,
  payment: OrderPayment,
  { reserved = false, thumbnails = [] }: { reserved?: boolean; thumbnails?: (string | null)[] } = {},
): OrderSummaryView {
  const suffix = reserved ? ' por pagar hoy' : ''
  const rows: SummaryRow[] = [{ label: advanceLabel(payment, suffix), amount: price(payment.advance) }]
  if (!isZero(payment.baseDeposit)) rows.push({ label: `Depósito de la base${suffix}`, amount: price(payment.baseDeposit) })
  if (!isZero(payment.deliveryFee)) rows.push({ label: reserved ? `Envío${suffix}` : 'Envío a domicilio', amount: price(payment.deliveryFee) })
  if (!reserved) rows.push({ label: 'Pagas hoy', amount: price(payment.payToday), strong: true })
  if (!isZero(payment.payOnDelivery)) rows.push({ label: 'Resto, el día de la entrega', amount: price(payment.payOnDelivery) })
  return {
    items: order.items.map((item, index) => ({ ...itemView(item, index), thumbnail: orderLineThumbnail(thumbnails, order.items, index) })),
    delivery: `Recoger en la pastelería ${whenText(order)}`,
    hasDeposit: !isZero(payment.baseDeposit),
    total: `${price(order.subtotal)} MXN`,
    rows,
    payToday: price(payment.payToday),
  }
}

/**
 * La miniatura que guardó el carrito para la línea `index` (`orderThumbnails` de `checkout.ts`): la del pastel diseñado o la
 * imagen de una línea del catálogo, solo si la lista es de estas líneas (el mismo largo). Una referencia nunca sale del carrito,
 * así que no lleva ninguna. Sin ella, `null` y se ve el hueco de la foto.
 */
export function orderLineThumbnail(thumbnails: (string | null)[], items: { kind: string }[], index: number): string | null {
  return thumbnails.length === items.length && items[index].kind !== 'reference' ? (thumbnails[index] ?? null) : null
}

/** "el lunes 16 de noviembre a las 3:30 pm", como la entrega. */
export function whenText(order: PaymentOrder): string {
  return `el ${formatDateInSentence(order.deliveryDate) ?? order.deliveryDate} a las ${formatTime(order.slotStartsAt)}`
}

/**
 * Hasta qué hora se lleva el efectivo antes de elegirlo (regla 10): el cierre del día o, si el pedido es para hoy, el
 * inicio de su lapso. Es solo la frase: el plazo real lo fija el servidor al apartar y llega en `payment_due_at`.
 * `null` si no se conoce la hora de cierre.
 */
export function cashDeadline(order: PaymentOrder, closesAt: string | null): string | null {
  if (order.deliveryDate === bakeryToday()) return order.slotStartsAt
  return closesAt
}

/** La hora del plazo del servidor ("22:30"), en la hora de la pastelería. */
export function dueClock(order: PaymentOrder): string | null {
  return bakeryMoment(order.paymentDueAt)?.clock ?? null
}

/** "viernes 13 de noviembre a las 12:00": cuándo se hizo el pedido. */
export function createdText(order: PaymentOrder): string | null {
  const moment = bakeryMoment(order.createdAt)
  const date = moment ? formatDateInSentence(moment.date) : null
  return moment && date ? `${date} a las ${moment.clock}` : null
}

/** En qué estado está el pedido para la pantalla del pago. */
export type PaymentStage =
  | { kind: 'paid' }
  | { kind: 'expired' }
  | { kind: 'quote' }
  | { kind: 'refund'; amount: string; orderReceived: boolean }
  | { kind: 'payable'; payment: OrderPayment }

/**
 * El estado de la pantalla según el servidor (D68): un cobro por reembolsar primero (aunque el pedido esté pagado,
 * ese cobro de más se devuelve), luego pagado, vencido o en pausa por cotización; si no, se paga.
 */
export function paymentStage(state: PaymentState): PaymentStage {
  const { order, latest } = state
  if (latest?.status === 'refund_required') return { kind: 'refund', amount: price(latest.amount), orderReceived: PAID_STATUSES.has(order.status) }
  if (PAID_STATUSES.has(order.status)) return { kind: 'paid' }
  if (order.status === 'cancelled') return { kind: 'expired' }
  if (order.status !== 'awaiting_payment' || !order.payment) return { kind: 'quote' }
  return { kind: 'payable', payment: order.payment }
}

/** Si el pedido está apartado para pagar en efectivo: sigue esperando pago y el último intento es en la pastelería. */
export function isReservedInCash(state: PaymentState): boolean {
  return state.order.status === 'awaiting_payment' && state.latest?.method === 'cash' && state.latest.status === 'pending'
}

/** Si el último intento en línea espera la confirmación de la pasarela. */
export function onlinePending(state: PaymentState): boolean {
  return state.order.status === 'awaiting_payment' && state.latest !== null && state.latest.method !== 'cash' && state.latest.status === 'pending'
}

/** El aviso de un rechazo (mockup de Pago rechazado): quién lo rechazó y qué hacer. */
export function declinedAlert(method: PaymentMethod): PaymentAlert {
  return {
    title: method === 'mercadopago' ? 'Mercado Pago rechazó el pago.' : 'Tu banco rechazó el pago.',
    message: 'Revisa los datos de tu tarjeta o paga con otro método. No se hizo ningún cargo.',
  }
}

export type PaymentAlert = { title: string; message: string }

export const NETWORK_ALERT: PaymentAlert = {
  title: 'No pudimos iniciar tu pago',
  message: 'No pudimos conectar con la pastelería. Revisa tu conexión y vuelve a intentarlo: no se te cobra dos veces.',
}

/** Qué hacer después de un rechazo del inicio del pago: volver a pedir el estado, olvidar la llave o solo avisar. */
export type StartFailure = { alert: PaymentAlert | null; reload: boolean; forgetKey: boolean }

/** Convierte el error de `POST orders/<id>/payment/` en lo que hace la pantalla. */
export function startFailure(error: unknown): StartFailure {
  if (!(error instanceof ApiError)) return { alert: NETWORK_ALERT, reload: false, forgetKey: false }
  const { code, detail } = paymentErrorBody(error)
  const title = 'No pudimos iniciar tu pago'
  if (error.status === 429) return { alert: { title, message: 'Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.' }, reload: false, forgetKey: false }
  if (error.status === 401) return { alert: { title, message: 'Tu sesión terminó. Vuelve a entrar para pagar tu pedido.' }, reload: false, forgetKey: false }
  // Vencido, ya pagado, ajeno o un método que ya no se ofrece: el estado del servidor dice qué mostrar ahora.
  if (code === 'order_expired' || code === 'order_not_payable' || error.status === 404) return { alert: null, reload: true, forgetKey: false }
  if (code === 'method_unavailable') return { alert: { title, message: detail ?? 'Elige otro método de pago.' }, reload: true, forgetKey: false }
  if (code === 'idempotency_conflict') return { alert: { title, message: 'Vuelve a intentarlo: tu pago no se duplica.' }, reload: false, forgetKey: true }
  if (code === 'gateway_error' && detail) return { alert: { title, message: detail }, reload: false, forgetKey: false }
  return { alert: { title, message: 'La pastelería no respondió. Vuelve a intentarlo en un momento: no se te cobra dos veces.' }, reload: false, forgetKey: false }
}
