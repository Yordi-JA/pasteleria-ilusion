import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '../models/apiClient.ts'
import { attemptKey, fingerprintOf, forgetAttempt } from '../models/attempts.ts'
import { formatTodayDate } from '../models/dates.ts'
import { acceptQuote } from '../models/referenceRequests.ts'
import { orderErrorsFrom, plainError } from './orderErrors.ts'
import type { OrderErrorsView } from './orderErrors.ts'
import { payTodaySentence, quoteRows } from './referenceView.ts'
import { displayPhone, PHONE_DIGITS, PHONE_SEPARATORS, PICKUP_NAME_MAX_LENGTH } from './useDelivery.ts'
import type { DeliveryFocus } from './useDelivery.ts'
import { useDaySlots } from './useDaySlots.ts'
import { useReferenceRequest } from './useReferenceRequest.ts'
import { useSession } from './useSession.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** La llave del intento de aceptar (D70): una por cotización, hora y quién recoge. */
const ATTEMPT_STORAGE = 'ilusion.quoteAccept.v1'

const EXPIRED_MESSAGE = 'Esta cotización venció. Pide una nueva por WhatsApp o desde tu solicitud.'
const NOT_READY_MESSAGE = 'Tu cotización todavía no está lista. Te avisamos por correo en cuanto la tengamos.'
const CONFLICT_MESSAGE = 'Cambió algo de tu elección mientras la mandábamos. Vuelve a intentarlo.'

type FieldErrors = { pickupName?: string; pickupPhone?: string; schedule?: string }

/** Por qué no se puede aceptar aquí: la pantalla lo dice y enlaza a la solicitud o al pedido. */
export type QuoteBlock = 'not_ready' | 'expired' | 'accepted' | 'cancelled' | null

/**
 * View-model de `/pedido/entrega?cotizacion=<id>` (D70): aceptar la cotización con el día del evento fijo. Solo se eligen
 * la hora (`GET delivery-slots/?start=D&end=D&kind=reference`) y quién recoge; "Continuar al pago" llama a `accept/` con
 * su llave de idempotencia (nunca a `POST orders/`) y, con el pedido apartado, lleva a `/pedido/pago?pedido=<id>` (D68).
 * El carrito no se toca.
 */
export function useQuoteDelivery(requestId: number | null, focus: DeliveryFocus) {
  const navigate = useNavigate()
  const session = useSession()
  const store = useStoreDetails()
  const { load, retry } = useReferenceRequest(requestId)
  const request = load.status === 'ready' ? load.request : null
  const quote = request?.quote ?? null
  const block: QuoteBlock = !request
    ? null
    : request.status === 'accepted'
      ? 'accepted'
      : request.status === 'cancelled'
        ? 'cancelled'
        : request.status !== 'quote_ready' || !quote
          ? 'not_ready'
          : quote.expired
            ? 'expired'
            : null
  const slots = useDaySlots(request?.eventDate ?? null, 'reference', request !== null && block === null)

  const [pickupName, setPickupName] = useState('')
  const [pickupPhone, setPickupPhone] = useState('')
  const touched = useRef(false)
  const user = session.status === 'authenticated' ? session.user : null
  useEffect(() => {
    if (!user || touched.current) return
    touched.current = true
    setPickupName(user.fullName)
    setPickupPhone(displayPhone(user.phone))
  }, [user])

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [errors, setErrors] = useState<OrderErrorsView | null>(null)
  const [status, setStatus] = useState<'idle' | 'creating'>('idle')
  const running = useRef(false)
  const focusTarget = useRef<keyof DeliveryFocus | null>(null)
  useEffect(() => {
    const target = focusTarget.current
    if (!target) return
    focusTarget.current = null
    focus[target].current?.focus()
  })

  const editName = useCallback((value: string) => {
    touched.current = true
    setPickupName(value)
    setFieldErrors((current) => ({ ...current, pickupName: undefined }))
  }, [])
  const editPhone = useCallback((value: string) => {
    touched.current = true
    setPickupPhone(value)
    setFieldErrors((current) => ({ ...current, pickupPhone: undefined }))
  }, [])
  const { selectSlot } = slots
  const chooseSlot = useCallback(
    (startsAt: string) => {
      selectSlot(startsAt)
      setFieldErrors((current) => ({ ...current, schedule: undefined }))
    },
    [selectSlot],
  )

  function validate(): FieldErrors {
    const found: FieldErrors = {}
    if (!slots.slot) found.schedule = 'Elige la hora en que recoges tu pedido.'
    const name = pickupName.trim()
    if (name === '') found.pickupName = 'Escribe el nombre de quien recoge.'
    else if (name.length > PICKUP_NAME_MAX_LENGTH) found.pickupName = `Escribe el nombre en ${PICKUP_NAME_MAX_LENGTH} caracteres o menos.`
    if (!PHONE_DIGITS.test(pickupPhone.replace(PHONE_SEPARATORS, ''))) found.pickupPhone = 'Escribe 10 dígitos, por ejemplo 55 1234 5678.'
    return found
  }

  const submit = async () => {
    if (running.current || !request || block !== null) return
    const found = validate()
    setErrors(null)
    setFieldErrors(found)
    if (found.schedule || found.pickupName || found.pickupPhone) {
      focusTarget.current = found.schedule ? 'schedule' : found.pickupName ? 'name' : 'phone'
      return
    }
    const acceptance = {
      slot_starts_at: slots.slot?.startsAt as string,
      pickup_name: pickupName.trim(),
      pickup_phone: pickupPhone.replace(PHONE_SEPARATORS, ''),
      delivery_date: request.eventDate,
    }
    running.current = true
    setStatus('creating')
    try {
      const key = attemptKey(ATTEMPT_STORAGE, await fingerprintOf(JSON.stringify([request.id, acceptance])))
      const order = await acceptQuote(request.id, acceptance, key)
      forgetAttempt(ATTEMPT_STORAGE)
      navigate(`/pedido/pago?pedido=${order.id}`, { state: { orderId: order.id } })
    } catch (error) {
      console.warn('No se pudo aceptar la cotización.', error)
      let view: OrderErrorsView
      if (error instanceof ApiError && error.status === 409) {
        const code = (error.body as { code?: unknown } | undefined)?.code
        if (code === 'idempotency_conflict') forgetAttempt(ATTEMPT_STORAGE)
        view = plainError(code === 'quote_expired' ? EXPIRED_MESSAGE : code === 'quote_not_ready' ? NOT_READY_MESSAGE : CONFLICT_MESSAGE)
      } else {
        view = orderErrorsFrom(error, [])
      }
      setErrors(view)
      setFieldErrors({ pickupName: view.pickupName, pickupPhone: view.pickupPhone, schedule: view.schedule })
      // Un lapso que se llenó: los horarios se vuelven a pedir.
      if (view.reloadSchedule) slots.reload()
      focusTarget.current = 'alert'
    } finally {
      running.current = false
      setStatus('idle')
    }
  }

  return {
    store,
    load,
    retry,
    block,
    requestId: request?.id ?? requestId,
    quotePath: `/cuenta/cotizaciones/${request?.id ?? requestId ?? ''}`,
    orderPath: request?.orderId ? `/cuenta/pedidos/${request.orderId}` : null,
    eventDay: request ? (formatTodayDate(request.eventDate) ?? request.eventDate) : null,
    summary: quote && request ? { rows: quoteRows(quote, request), payToday: payTodaySentence(quote) } : null,
    slots,
    chooseSlot,
    pickupName,
    pickupPhone,
    editName,
    editPhone,
    fieldErrors,
    errors,
    status,
    submit,
  }
}
