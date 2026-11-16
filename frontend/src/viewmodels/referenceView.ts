/**
 * Lo que muestran el envío de referencia, la solicitud enviada y la cotización (D70), sin React: los errores del servidor
 * por campo, la línea de tiempo, los datos de la referencia, las fechas y la vigencia.
 */
import { ApiError } from '../models/apiClient.ts'
import { bakeryMoment, formatDateInSentence, formatTodayDate } from '../models/dates.ts'
import { formatPrice } from '../models/money.ts'
import type { ReferenceQuote, ReferenceRequest } from '../models/referenceRequests.ts'
import { cakeBrief, flavorFacts } from './referenceFlavorView.ts'
import { formatTime } from './deliverySchedule.ts'
import { messagesIn, NETWORK_MESSAGE, SESSION_MESSAGE } from './orderErrors.ts'
import type { TimelineStep } from './orderView.ts'

export type ReferenceField = 'photos' | 'description' | 'occasion' | 'people' | 'eventDate' | 'budget' | 'cakeType' | 'bread' | 'filling'

export type ReferenceErrorsView = {
  title: string
  messages: string[]
  fields: Partial<Record<ReferenceField, string>>
}

export const REFERENCE_NETWORK_MESSAGE = 'No pudimos conectar con la pastelería. Revisa tu conexión y vuelve a intentarlo: tu solicitud no se duplica.'
export const REFERENCE_THROTTLED_MESSAGE = 'Mandaste varias solicitudes seguidas. Espera unos minutos y vuelve a intentarlo.'
const SEND_TITLE = 'No pudimos enviar tu solicitud'

/** Los campos de la API y el de la pantalla que los muestra. */
const FIELD_OF: Record<string, ReferenceField> = {
  image_ids: 'photos',
  description: 'description',
  occasion: 'occasion',
  people: 'people',
  event_date: 'eventDate',
  budget: 'budget',
  cake_type: 'cakeType',
  bread: 'bread',
  filling_base: 'filling',
  filling_flavors: 'filling',
}

function plain(title: string, message: string): ReferenceErrorsView {
  return { title, messages: [message], fields: {} }
}

/** Un rechazo sin campos: sin red, límite de peticiones, sesión vencida. */
function transport(error: unknown, title: string): ReferenceErrorsView | null {
  if (!(error instanceof ApiError)) return plain(title, REFERENCE_NETWORK_MESSAGE)
  if (error.status === 429) return plain(title, REFERENCE_THROTTLED_MESSAGE)
  if (error.status === 401) return plain(title, SESSION_MESSAGE)
  return null
}

/** El rechazo de `POST reference-requests/` en frases: cada error bajo su campo y todos en el aviso, en orden. */
export function referenceErrorsFrom(error: unknown): ReferenceErrorsView {
  const early = transport(error, SEND_TITLE)
  if (early) return early
  const body = (error as ApiError).body
  if ((error as ApiError).status !== 400 || typeof body !== 'object' || body === null || Array.isArray(body)) return plain(SEND_TITLE, REFERENCE_NETWORK_MESSAGE)
  const view: ReferenceErrorsView = { title: SEND_TITLE, messages: [], fields: {} }
  for (const [key, value] of Object.entries(body)) {
    const messages = messagesIn(value)
    const field = FIELD_OF[key]
    // La base y los sabores van bajo el mismo relleno: manda el primero que llegue.
    if (field && messages[0] && !view.fields[field]) view.fields[field] = messages[0]
    view.messages.push(...messages)
  }
  if (view.messages.length === 0) view.messages.push(REFERENCE_NETWORK_MESSAGE)
  return view
}

export type PhotoUploadError = { view: ReferenceErrorsView; photoMessage: string | null }

/** El rechazo de subir una foto: con 400 o 413 el servidor dice qué le pasa a esa foto; lo demás no es de la foto. */
export function photoUploadErrorFrom(error: unknown, name: string): PhotoUploadError {
  const title = 'Una foto no se pudo subir'
  const early = transport(error, title)
  if (early) return { view: early, photoMessage: null }
  const api = error as ApiError
  if (api.status !== 400 && api.status !== 413) return { view: plain(title, NETWORK_MESSAGE), photoMessage: null }
  const body = typeof api.body === 'object' && api.body !== null ? (api.body as Record<string, unknown>) : {}
  const message = messagesIn(body.image)[0] ?? messagesIn(body)[0] ?? 'No pudimos subir esta foto. Elige otra.'
  return { view: plain(title, `${name}: ${message}`), photoMessage: message }
}

/** El presupuesto como lo escribe la gente ("$1,500", "1500.50") en la forma de la API ("1500.00"); `null` vacío. */
export function normalizeBudget(value: string): string | null | 'invalid' {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (cleaned === '') return null
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return 'invalid'
  return `${Number(match[1])}.${(match[2] ?? '').padEnd(2, '0')}`
}

/** "Viernes 13 de noviembre, 12:05 pm", en la hora de la pastelería. */
export function momentText(iso: string): string | null {
  const moment = bakeryMoment(iso)
  const date = moment ? formatTodayDate(moment.date) : null
  return moment && date ? `${date}, ${formatTime(moment.clock)}` : null
}

/** "el viernes 13 de noviembre". */
function dayInSentence(iso: string): string | null {
  const moment = bakeryMoment(iso)
  return moment ? formatDateInSentence(moment.date) : null
}

/** "Enviada el viernes 13 de noviembre. Cotizada el viernes 13 de noviembre." */
export function requestDates(request: ReferenceRequest): string {
  const sent = dayInSentence(request.createdAt)
  const quoted = request.quote ? dayInSentence(request.quote.quotedAt) : null
  return [sent && `Enviada el ${sent}.`, quoted && `Cotizada el ${quoted}.`].filter(Boolean).join(' ')
}

/** La línea de "Qué sigue" (mockup `SolicitudEnviada`): enviada, en revisión, cotización lista y aceptas y pagas. */
export function sentSteps(request: ReferenceRequest): TimelineStep[] {
  const ready = request.status !== 'in_review'
  return [
    { title: 'Solicitud enviada', detail: momentText(request.createdAt), state: 'done' },
    { title: 'En revisión', detail: 'Te escribimos si necesitamos algún detalle', state: ready ? 'done' : 'current' },
    { title: 'Cotización lista', detail: 'En máximo 1 hora, por correo y en tu cuenta', state: ready ? 'done' : 'pending' },
    { title: 'Aceptas y pagas', detail: 'Hasta entonces no se cobra nada', state: request.status === 'accepted' ? 'done' : 'pending' },
  ]
}

export type ReferenceFact = { label: string; value: string }

/** Los datos de "Lo que nos enviaste" y "Tu referencia". La ocasión y el presupuesto, solo si los dio. */
export function referenceFacts(request: ReferenceRequest): ReferenceFact[] {
  const facts: ReferenceFact[] = []
  if (request.occasionLabel) facts.push({ label: 'Ocasión', value: request.occasionLabel })
  facts.push({ label: 'Personas', value: String(request.people) })
  facts.push(...flavorFacts(request.flavor))
  facts.push({ label: 'Fecha del evento', value: formatTodayDate(request.eventDate) ?? request.eventDate })
  const budget = request.budget ? formatPrice(request.budget) : null
  if (budget) facts.push({ label: 'Presupuesto', value: budget })
  return facts
}

/** La vigencia: PENDIENTE (marcador), con fecha, o ya vencida. */
export type ValidityView = { kind: 'pending' } | { kind: 'until'; text: string } | { kind: 'expired' } | { kind: 'none' }

export function validityOf(quote: ReferenceQuote): ValidityView {
  if (quote.expired) return { kind: 'expired' }
  if (quote.validityPending) return { kind: 'pending' }
  const moment = quote.expiresAt ? bakeryMoment(quote.expiresAt) : null
  const day = moment ? formatDateInSentence(moment.date) : null
  return moment && day ? { kind: 'until', text: `${day} a las ${formatTime(moment.clock)}` } : { kind: 'none' }
}

export type QuoteRow = { label: string; amount: string }

export type QuoteRowsView = {
  /** "Pastel según tu referencia" con su detalle: los kilos, el pan y el relleno, o la frase de antes sin sabor. */
  line: QuoteRow & { detail: string }
  /** "Total del pedido": el precio cotizado, sin la base (libro de marca, "Pago y entrega"). */
  total: string
  advance: QuoteRow
  /** "Base para 6 kg" con su depósito; `null` sin base (una solicitud de antes de la `0040`). */
  base: QuoteRow | null
  payToday: QuoteRow
  payLater: QuoteRow
}

const ZERO = /^0+(?:\.0+)?$/

/**
 * El desglose de la cotización, en el orden del libro de marca: el pastel, el total sin la base, el anticipo, la base con
 * su depósito, "Pagas hoy" (el anticipo y el depósito completo, regla 10) y el resto. Todo viene de la API.
 */
export function quoteRows(quote: ReferenceQuote, request: Pick<ReferenceRequest, 'flavor'>): QuoteRowsView {
  const price = (value: string) => formatPrice(value) ?? value
  const kg = request.flavor.kg
  const deposit = quote.standDeposit
  return {
    line: { label: 'Pastel según tu referencia', detail: cakeBrief(request.flavor) ?? 'Según tus fotos y lo que nos contaste', amount: price(quote.price) },
    total: `${price(quote.price)} MXN`,
    // Sin `advance` (una respuesta anterior), lo de hoy era solo el anticipo.
    advance: { label: `Anticipo para apartar (${quote.advancePercent}%)`, amount: price(quote.advance ?? quote.payToday) },
    base: kg && deposit && !ZERO.test(deposit) ? { label: `Base para ${kg} kg`, amount: price(deposit) } : null,
    payToday: { label: 'Pagas hoy', amount: price(quote.payToday) },
    payLater: { label: 'El día de la entrega', amount: price(quote.payOnDelivery) },
  }
}

/**
 * "Hoy pagas $990: el anticipo del 50% y el depósito de la base. El resto, $900, el día de la entrega." Sin base, "Hoy
 * pagas $900, el anticipo del 50%. …".
 */
export function payTodaySentence(quote: ReferenceQuote): string {
  const today = formatPrice(quote.payToday) ?? quote.payToday
  const later = formatPrice(quote.payOnDelivery) ?? quote.payOnDelivery
  const withBase = quote.standDeposit !== null && !ZERO.test(quote.standDeposit)
  const what = withBase ? `: el anticipo del ${quote.advancePercent}% y el depósito de la base.` : `, el anticipo del ${quote.advancePercent}%.`
  return `Hoy pagas ${today}${what} El resto, ${later}, el día de la entrega.`
}

/** El enlace de WhatsApp con el mensaje ya escrito; `null` si el número sigue PENDIENTE. */
export function whatsappLink(url: string | null, message: string): string | null {
  return url ? `${url}?text=${encodeURIComponent(message)}` : null
}

/** Un id de solicitud de la URL: un entero positivo, o `null`. */
export function parseRequestId(raw: string | null | undefined): number | null {
  return raw && /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null
}

/** Una solicitud en "Mis pedidos" (mockup `Cuenta`, "Solicitudes de cotización"). */
export type RequestRowView = {
  id: number
  title: string
  href: string
  statusLabel: string
  /** "Ver cotización" con la cotización lista; "Ver solicitud" mientras se revisa. */
  linkLabel: string
  /** "Enviada el …. Te respondemos en máximo 1 hora." o la vigencia de la cotización. */
  line: { kind: 'text'; text: string } | { kind: 'pending' }
}

/** Las que siguen en curso: en revisión o con su cotización. Una aceptada ya es su pedido; una cancelada ya no sigue. */
export function isOpenRequest(request: ReferenceRequest): boolean {
  return request.status === 'in_review' || request.status === 'quote_ready'
}

/** El historial: las canceladas. Una aceptada ya es su pedido y no se repite. */
export function isPastRequest(request: ReferenceRequest): boolean {
  return request.status === 'cancelled'
}

export function requestRow(request: ReferenceRequest): RequestRowView {
  const ready = request.status === 'quote_ready' && request.quote
  let line: RequestRowView['line']
  if (ready && request.quote) {
    const validity = validityOf(request.quote)
    if (validity.kind === 'pending') line = { kind: 'pending' }
    else if (validity.kind === 'until') line = { kind: 'text', text: `Válida hasta el ${validity.text}` }
    else if (validity.kind === 'expired') line = { kind: 'text', text: 'Esta cotización venció' }
    else line = { kind: 'text', text: requestDates(request) }
  } else {
    const sent = dayInSentence(request.createdAt)
    const answer = isPastRequest(request) ? '' : ' Te respondemos en máximo 1 hora.'
    line = { kind: 'text', text: sent ? `Enviada el ${sent}.${answer}` : answer.trim() }
  }
  return {
    id: request.id,
    title: `Solicitud #${request.id}`,
    href: `/cuenta/cotizaciones/${request.id}`,
    statusLabel: request.statusLabel,
    linkLabel: ready ? 'Ver cotización' : 'Ver solicitud',
    line,
  }
}

/** El enlace de regreso de la barra de la compra: a la cotización en `/pedido/entrega?cotizacion=<id>`, si no, al carrito. */
export type CheckoutBack = { to: string; label: string }

export function checkoutBack(pathname: string, search: string): CheckoutBack {
  const id = pathname === '/pedido/entrega' ? parseRequestId(new URLSearchParams(search).get('cotizacion')) : null
  return id === null ? { to: '/carrito', label: 'Volver al carrito' } : { to: `/cuenta/cotizaciones/${id}`, label: 'Volver a la cotización' }
}
