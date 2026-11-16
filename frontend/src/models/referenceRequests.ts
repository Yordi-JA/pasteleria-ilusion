/**
 * El envío de referencia y su cotización (D70): las fotos (`POST customer-images/` con `purpose=reference`), la solicitud
 * (`POST reference-requests/`, con `Idempotency-Key`), su detalle, "Aceptar y pagar" (`accept/`, que crea el pedido) y
 * "Cancelar solicitud" (`cancel/`). Todo pide sesión (JWT); una solicitud ajena responde 404. El precio, el anticipo y la
 * vigencia los da el servidor: el navegador solo los muestra.
 */
import { parseIsoDate } from './dates.ts'
import { PRICE_PATTERN } from './money.ts'
import { parseOccasion } from './occasion.ts'
import type { Occasion } from './occasion.ts'
import { parsePlacedOrder } from './orders.ts'
import type { PlacedOrder } from './orders.ts'
import { parseReferenceFlavor } from './referenceFlavor.ts'
import type { ReferenceFlavor } from './referenceFlavor.ts'
import { requestWithSession } from './session.ts'

/**
 * Cuántas fotos caben en una solicitud: el tope duro del servidor (`UPLOAD_HARD_LIMIT_IMAGES`) y el de la regla 9. El
 * del admin (`UploadSettings.max_reference_images`, hoy 3) puede ser menor; la API no lo publica y lo dice al enviar.
 */
export const REFERENCE_MAX_PHOTOS = 3

/** El tope de la descripción en el servidor (`REFERENCE_TEXT_MAX_LENGTH`). */
export const REFERENCE_DESCRIPTION_MAX_LENGTH = 1000

/** El tope de personas en una petición (`MAX_PEOPLE_IN_REQUEST`). */
export const REFERENCE_MAX_PEOPLE = 10_000

/** Una subida grande en una conexión lenta tarda más que una consulta. */
const UPLOAD_TIMEOUT_MS = 60_000
/** Aceptar crea el pedido y revisa la agenda en una transacción: un poco más que una consulta. */
const ACCEPT_TIMEOUT_MS = 20_000

export type ReferenceStatus = 'in_review' | 'quote_ready' | 'accepted' | 'cancelled'

const STATUSES = new Set<unknown>(['in_review', 'quote_ready', 'accepted', 'cancelled'])

export type ReferenceImage = { id: string; originalName: string }

export type ReferenceQuote = {
  price: string
  /** Puede venir vacía. */
  note: string
  quotedAt: string
  /** `null` mientras la vigencia siga PENDIENTE. */
  expiresAt: string | null
  expired: boolean
  /** La pastelería no fijó la vigencia: la pantalla muestra el marcador. */
  validityPending: boolean
  advancePercent: number
  /** El anticipo sin la base; `null` si el servidor no lo manda (una respuesta anterior a la `0040`). */
  advance: string | null
  /** El depósito de la base asignada; `null` sin base. */
  standDeposit: string | null
  /** El anticipo más el depósito completo de la base (regla 10). */
  payToday: string
  payOnDelivery: string
}

export type ReferenceRequest = {
  id: number
  status: ReferenceStatus
  statusLabel: string
  statusChangedAt: string
  createdAt: string
  description: string
  occasion: Occasion | null
  occasionLabel: string | null
  people: number
  /** El tipo, el pan, el relleno y la base (segunda ronda de D70); vacíos en una solicitud vieja. */
  flavor: ReferenceFlavor
  eventDate: string
  budget: string | null
  images: ReferenceImage[]
  quote: ReferenceQuote | null
  orderId: number | null
}

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new TypeError(`La solicitud no trae ${what}.`)
  return value
}

function money(value: unknown, what: string): string {
  if (typeof value !== 'string' || !PRICE_PATTERN.test(value)) throw new TypeError(`${what} no tiene la forma esperada.`)
  return value
}

function optionalMoney(value: unknown, what: string): string | null {
  return value === null || value === undefined ? null : money(value, what)
}

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseImage(data: unknown): ReferenceImage {
  if (!isRecord(data) || typeof data.id !== 'string' || !UUID.test(data.id)) throw new TypeError('Una foto de la solicitud no tiene la forma esperada.')
  return { id: data.id, originalName: typeof data.original_name === 'string' ? data.original_name : '' }
}

function parseQuote(data: unknown): ReferenceQuote | null {
  if (data === null || data === undefined) return null
  if (!isRecord(data) || typeof data.expired !== 'boolean' || typeof data.validity_pending !== 'boolean' || whole(data.advance_percent) === null) {
    throw new TypeError('La cotización no tiene la forma esperada.')
  }
  const expires = data.expires_at
  if (expires !== null && typeof expires !== 'string') throw new TypeError('La cotización no trae bien su vigencia.')
  return {
    price: money(data.price, 'El precio'),
    note: typeof data.note === 'string' ? data.note : '',
    quotedAt: text(data.quoted_at, 'la fecha de la cotización'),
    expiresAt: expires,
    expired: data.expired,
    validityPending: data.validity_pending,
    advancePercent: data.advance_percent as number,
    advance: optionalMoney(data.advance, 'El anticipo'),
    standDeposit: optionalMoney(data.stand_deposit, 'El depósito de la base'),
    payToday: money(data.pay_today, 'Lo que se paga hoy'),
    payOnDelivery: money(data.pay_on_delivery, 'El resto'),
  }
}

/** Valida una solicitud de la API. Otra forma es un `TypeError`: la pantalla lo trata como una falla de carga. */
export function parseReferenceRequest(data: unknown): ReferenceRequest {
  if (!isRecord(data) || whole(data.id) === null || !STATUSES.has(data.status) || whole(data.people) === null || !parseIsoDate(data.event_date)) {
    throw new TypeError('La solicitud no tiene la forma esperada.')
  }
  if (!Array.isArray(data.images)) throw new TypeError('La solicitud no trae sus fotos.')
  const orderId = data.order_id === null || data.order_id === undefined ? null : whole(data.order_id)
  if (data.order_id && orderId === null) throw new TypeError('La solicitud no trae bien su pedido.')
  return {
    id: data.id as number,
    status: data.status as ReferenceStatus,
    statusLabel: text(data.status_label, 'su estado'),
    statusChangedAt: text(data.status_changed_at, 'la fecha de su estado'),
    createdAt: text(data.created_at, 'su fecha'),
    description: text(data.description, 'su descripción'),
    occasion: parseOccasion(data.occasion),
    occasionLabel: typeof data.occasion_label === 'string' && data.occasion_label !== '' ? data.occasion_label : null,
    people: data.people as number,
    flavor: parseReferenceFlavor(data),
    eventDate: data.event_date as string,
    budget: data.budget === null || data.budget === undefined ? null : money(data.budget, 'El presupuesto'),
    images: data.images.map(parseImage),
    quote: parseQuote(data.quote),
    orderId,
  }
}

/** Sube una foto de referencia y devuelve su id. Un rechazo es un `ApiError` con su cuerpo (`{"image": [...]}`). */
export async function uploadReferencePhoto(file: Blob, name: string): Promise<string> {
  const form = new FormData()
  form.append('image', file, name)
  form.append('purpose', 'reference')
  const { body } = await requestWithSession(['customer-images'], { method: 'POST', form, timeoutMs: UPLOAD_TIMEOUT_MS })
  if (!isRecord(body) || typeof body.id !== 'string' || body.id === '') throw new TypeError('La foto subida no trae su id.')
  return body.id
}

/** Lo que manda "Enviar solicitud", campo por campo como lo lee `ReferenceRequestCreateSerializer`. */
export type ReferenceSubmission = {
  image_ids: string[]
  description: string
  occasion: Occasion | ''
  people: number
  event_date: string
  budget: string | null
  cake_type: string
  bread: string
  /** `null` con un pan de relleno incluido. */
  filling_base: string | null
  /** Vacía con relleno incluido; uno o dos sabores con la base que los admite. */
  filling_flavors: string[]
}

/** Crea la solicitud. Con la misma llave, el servidor responde la misma (200). */
export async function submitReferenceRequest(submission: ReferenceSubmission, idempotencyKey: string): Promise<ReferenceRequest> {
  const { body } = await requestWithSession(['reference-requests'], {
    method: 'POST',
    json: submission,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
  return parseReferenceRequest(body)
}

/** Una página de `GET reference-requests/` (del cliente, de la más nueva a la más vieja). */
export type ReferenceRequestPage = { count: number; requests: ReferenceRequest[] }

/** La primera página de las solicitudes de la cuenta, para "Mis pedidos". Otra forma es un `TypeError`. */
export async function getReferenceRequests(signal?: AbortSignal): Promise<ReferenceRequestPage> {
  const { body } = await requestWithSession(['reference-requests'], { signal })
  if (!isRecord(body) || typeof body.count !== 'number' || !Array.isArray(body.results)) throw new TypeError('La lista de solicitudes no tiene la forma esperada.')
  return { count: body.count, requests: body.results.map(parseReferenceRequest) }
}

export async function getReferenceRequest(id: number, signal?: AbortSignal): Promise<ReferenceRequest> {
  const { body } = await requestWithSession(['reference-requests', String(id)], { signal })
  return parseReferenceRequest(body)
}

export type QuoteAcceptance = { slot_starts_at: string; pickup_name: string; pickup_phone: string; delivery_date: string }

/** "Aceptar y pagar": crea el pedido apartado con el precio cotizado. Si ya estaba aceptada, el servidor responde el mismo. */
export async function acceptQuote(id: number, acceptance: QuoteAcceptance, idempotencyKey: string): Promise<PlacedOrder> {
  const { body } = await requestWithSession(['reference-requests', String(id), 'accept'], {
    method: 'POST',
    json: acceptance,
    headers: { 'Idempotency-Key': idempotencyKey },
    timeoutMs: ACCEPT_TIMEOUT_MS,
  })
  return parsePlacedOrder(body)
}

/** "Cancelar solicitud": sin cobro; el servidor borra las fotos. Ya aceptada, 409 `already_accepted`. */
export async function cancelReferenceRequest(id: number): Promise<ReferenceRequest> {
  const { body } = await requestWithSession(['reference-requests', String(id), 'cancel'], { method: 'POST' })
  return parseReferenceRequest(body)
}

/** Una foto de la solicitud como archivo: se pide con la sesión (el token nunca va en la URL de un `<img>`). */
export async function getReferencePhoto(id: string, signal?: AbortSignal): Promise<Blob> {
  const { body } = await requestWithSession(['customer-images', id], { signal, as: 'blob' })
  if (!(body instanceof Blob)) throw new TypeError('La foto no llegó como archivo.')
  return body
}
