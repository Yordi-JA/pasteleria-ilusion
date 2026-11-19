import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { clearDraft, readDraft } from '../models/cakeDesignDraft.ts'
import { claimStoredDeliveryChoice, readDeliveryChoice, writeDeliveryChoice } from '../models/deliveryChoice.ts'
import type { PlacedOrder } from '../models/orders.ts'
import { ownerMarker, sessionOwner } from '../models/owner.ts'
import { getSessionState } from '../models/session.ts'
import { cartLines, cartSummary } from './cartLines.ts'
import { formatTime, lineKinds, scheduleText, shortDate } from './deliverySchedule.ts'
import type { OrderErrorsView } from './orderErrors.ts'
import { useCart } from './useCart.ts'
import { useDeliveryCalendar } from './useDeliveryCalendar.ts'
import { usePlaceOrder } from './usePlaceOrder.ts'
import { useSession } from './useSession.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** Los mismos separadores que acepta el servidor en un teléfono ("55 1234 5678", "55-1234-5678"). */
export const PHONE_SEPARATORS = /[\s().-]/g
export const PHONE_DIGITS = /^\d{10}$/
/** El tope de `pickup_name` en el servidor (el de `User.full_name`). */
export const PICKUP_NAME_MAX_LENGTH = 150

/** "5512345678" como lo escribe la gente y como lo pide el ejemplo: "55 1234 5678". */
export function displayPhone(digits: string | null): string {
  return digits && PHONE_DIGITS.test(digits) ? `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}` : ''
}

type FieldErrors = { pickupName?: string; pickupPhone?: string; schedule?: string }

/** A dónde va el foco después de un error o de crear el pedido; los elementos son de la vista. */
export type DeliveryFocus = Record<'alert' | 'name' | 'phone' | 'schedule' | 'placed', RefObject<HTMLElement | null>>

/** Además, en la entrega del carrito: el título de "¿Quién recoge?" y las partes, para llevarlas a la vista. */
export type CartDeliveryFocus = DeliveryFocus & Record<'pickup' | 'progress', RefObject<HTMLElement | null>>

/** Las dos partes de la entrega del carrito (tanda 3): "Fecha y hora" y "¿Quién recoge?". */
export type DeliveryPart = 1 | 2

/** La parte va en `?paso=2`; la primera no lleva parámetro. */
const PART_PARAM = 'paso'

/** El estado de la entrada de "¿Quién recoge?" cuando se llegó desde "Fecha y hora": atrás es esa misma entrada. */
type PartState = { fromSchedule?: boolean } | null

const MODE = 'Recoger en la pastelería'

/** Lo que dice "Fecha y hora" cuando lo restaurado de una recarga ya no se ofrece (D80). */
const LOST_MESSAGES = {
  day: 'La fecha que elegiste ya no está disponible. Elige otra.',
  slot: 'La hora que elegiste ya no está disponible. Elige otra.',
} as const

/** Olvida la fecha y la hora guardadas: al cerrar la sesión, otra persona en la misma pestaña no las hereda (D77). */
export function forgetDeliveryChoice() {
  writeDeliveryChoice(null)
}

/** Al entrar con una cuenta, la fecha y la hora que eligió otra se olvidan (tanda 5, `claimStoredDeliveryChoice`). */
export function claimDeliveryChoice(email: string) {
  claimStoredDeliveryChoice(ownerMarker(email))
}

/** Lo que falta de la fecha y la hora para continuar, con la frase de siempre (D66). */
function scheduleError(date: string | null, slot: string | null): string | undefined {
  if (!date) return 'Elige la fecha en que recoges tu pedido.'
  if (!slot) return 'Elige la hora en que recoges tu pedido.'
  return undefined
}

/**
 * View-model de `/pedido/entrega` (D66): la forma de entrega (solo recoger en la pastelería; a domicilio va por WhatsApp,
 * decisión B del usuario), el calendario con sus horarios, quién recoge (con el nombre y el teléfono de la cuenta) y
 * "Continuar al pago", que sube las imágenes y crea el pedido. El carrito se vacía al crear el pedido: el pedido ya apartó
 * el lapso, la vitrina y el pan, y dejarlo invitaría a crear otro igual; si el pago falla, se paga ese mismo pedido.
 * Un pedido con "Otra decoración" nace en pausa por cotización: no hay nada que pagar y la pantalla lo dice.
 *
 * Desde la tanda 3 el formulario va en dos partes, como un carrusel: "Fecha y hora" y "¿Quién recoge?". La parte va en la URL
 * (`?paso=2`, con `navigate`), así atrás del navegador regresa de la segunda a la primera y de la primera al carrito; la
 * segunda sin hora elegida se cambia por la primera. Lo elegido va en `sessionStorage` (`deliveryChoice.ts`) y sobrevive a
 * una recarga. Al cambiar de parte, el foco va a su título.
 */
export function useDelivery(focus: CartDeliveryFocus) {
  const cart = useCart()
  const session = useSession()
  const store = useStoreDetails()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const summary = useMemo(() => cartSummary(cart.items), [cart.items])
  const lines = useMemo(() => cartLines(cart.items), [cart.items])
  const kinds = useMemo(() => lineKinds(cart.items), [cart.items])
  const [placedQuote, setPlacedQuote] = useState<PlacedOrder | null>(null)
  const blocked = cart.items.length === 0 || summary.conflict !== null
  const [initialChoice] = useState(() => readDeliveryChoice(sessionOwner(session)))
  const calendar = useDeliveryCalendar(kinds, !blocked && placedQuote === null, initialChoice)
  const { place, status } = usePlaceOrder()

  // Lo elegido se guarda con cada cambio, hasta que el pedido se crea.
  const finished = useRef(false)
  const { choice } = calendar
  useEffect(() => {
    // Con la cuenta de ahora (tanda 5): lo que cambia ya lo eligió quien tiene la sesión.
    if (!finished.current) writeDeliveryChoice(choice, sessionOwner(getSessionState()))
  }, [choice])

  // Quién recoge: el nombre y el teléfono de la cuenta, una vez, mientras la persona no haya escrito nada.
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

  // --- La parte que se ve ---
  const selectedDate = calendar.selectedDate
  const chosenSlot = calendar.slot?.startsAt ?? null
  const requestedPart: DeliveryPart = searchParams.get(PART_PARAM) === '2' ? 2 : 1
  // Con `?paso=2` y una elección restaurada que la API todavía no confirma, la parte espera: no se muestra ni se manda nada.
  const checking = requestedPart === 2 && calendar.checking
  // "¿Quién recoge?" solo con la fecha y la hora elegidas (y confirmadas por la API).
  const part: DeliveryPart = requestedPart === 2 && (checking || (selectedDate !== null && chosenSlot !== null)) ? 2 : 1
  const showsForm = !blocked && placedQuote === null

  // Una URL con otra parte (`?paso=2` sin hora, `?paso=7`) se corrige sin agregar otra entrada al historial.
  const pathname = location.pathname
  useEffect(() => {
    if (showsForm && !checking && searchParams.has(PART_PARAM) && !(part === 2 && searchParams.get(PART_PARAM) === '2')) {
      navigate(pathname, { replace: true })
    }
  }, [checking, navigate, part, pathname, searchParams, showsForm])

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  /** El aviso del servidor y la parte donde se muestra: un horario lleno, en "Fecha y hora"; lo demás, en "¿Quién recoge?". */
  const [errors, setErrors] = useState<{ view: OrderErrorsView; part: DeliveryPart } | null>(null)

  // Después de pintar el error, el foco va a donde hay que corregir; si el error es de otra parte, espera a que se vea.
  const focusRequest = useRef<{ target: keyof DeliveryFocus; part: DeliveryPart | null } | null>(null)
  useEffect(() => {
    const request = focusRequest.current
    if (!request || (request.part !== null && request.part !== part)) return
    focusRequest.current = null
    focus[request.target].current?.focus()
  })

  // Al cambiar de parte, el foco va a su título (como los pasos de "Diseña tu pastel"); la parte entra desde la derecha al
  // avanzar y desde la izquierda al regresar. Antes, las partes se traen a la vista si quedaron arriba de la ventana.
  const shownPart = useRef<DeliveryPart | null>(null)
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null)
  useLayoutEffect(() => {
    if (!showsForm || checking) return
    const previous = shownPart.current
    shownPart.current = part
    if (previous === null || previous === part) return
    setDirection(part > previous ? 'forward' : 'back')
    // Un error pidió el foco en otro lugar (el aviso o un campo): ese manda.
    if (focusRequest.current) return
    const title = (part === 1 ? focus.schedule : focus.pickup).current
    focus.progress.current?.scrollIntoView?.({ block: 'nearest' })
    title?.focus({ preventScroll: true })
    title?.scrollIntoView?.({ block: 'nearest' })
  }, [checking, focus, part, showsForm])

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

  const { selectDay, selectSlot } = calendar
  const chooseDay = useCallback(
    (date: string) => {
      selectDay(date)
      setFieldErrors((current) => ({ ...current, schedule: undefined }))
    },
    [selectDay],
  )
  const chooseSlot = useCallback(
    (startsAt: string) => {
      selectSlot(startsAt)
      setFieldErrors((current) => ({ ...current, schedule: undefined }))
    },
    [selectSlot],
  )

  /**
   * A "Fecha y hora". Si se llegó a "¿Quién recoge?" desde ella, es la entrada anterior del historial: se regresa (así atrás,
   * desde ahí, lleva al carrito y no otra vez a la segunda parte). Si no (una recarga o un enlace directo), se reemplaza.
   */
  const fromSchedule = (location.state as PartState)?.fromSchedule === true
  const toSchedule = useCallback(() => {
    if (fromSchedule) navigate(-1)
    else navigate(pathname, { replace: true })
  }, [fromSchedule, navigate, pathname])

  /** "Continuar" de "Fecha y hora": solo revisa la fecha y la hora. */
  const toPickup = () => {
    const schedule = scheduleError(selectedDate, chosenSlot)
    if (schedule) {
      setFieldErrors((current) => ({ ...current, schedule }))
      focusRequest.current = { target: 'schedule', part: 1 }
      return
    }
    // El aviso de un horario lleno ya se atendió al elegir otro.
    if (errors?.part === 1) setErrors(null)
    navigate({ pathname, search: `?${PART_PARAM}=2` }, { state: { fromSchedule: true } satisfies PartState })
  }

  /** Lo que el navegador puede revisar antes de mandar: nombre y 10 dígitos (la fecha y la hora, por si cambiaron). */
  function validate(): FieldErrors {
    const found: FieldErrors = { schedule: scheduleError(selectedDate, chosenSlot) }
    const name = pickupName.trim()
    if (name === '') found.pickupName = 'Escribe el nombre de quien recoge.'
    else if (name.length > PICKUP_NAME_MAX_LENGTH) found.pickupName = `Escribe el nombre en ${PICKUP_NAME_MAX_LENGTH} caracteres o menos.`
    if (!PHONE_DIGITS.test(pickupPhone.replace(PHONE_SEPARATORS, ''))) found.pickupPhone = 'Escribe 10 dígitos, por ejemplo 55 1234 5678.'
    return found
  }

  const submit = async () => {
    if (status !== 'idle' || blocked) return
    const found = validate()
    setErrors(null)
    setFieldErrors(found)
    if (found.schedule) {
      focusRequest.current = { target: 'schedule', part: 1 }
      toSchedule()
      return
    }
    if (found.pickupName || found.pickupPhone) {
      focusRequest.current = { target: found.pickupName ? 'name' : 'phone', part: 2 }
      return
    }
    const result = await place({
      items: cart.items,
      deliveryDate: selectedDate as string,
      slotStartsAt: chosenSlot as string,
      pickupName: pickupName.trim(),
      pickupPhone: pickupPhone.replace(PHONE_SEPARATORS, ''),
    })
    if (!result) return
    if (!result.ok) {
      const view = result.errors
      setFieldErrors({ pickupName: view.pickupName, pickupPhone: view.pickupPhone, schedule: view.schedule })
      if (view.reloadSchedule) {
        // Un lapso que se llenó o una fecha que ya no alcanza: de vuelta a "Fecha y hora", con los horarios pedidos otra vez.
        setErrors({ view, part: 1 })
        calendar.reload()
        focusRequest.current = { target: 'alert', part: 1 }
        toSchedule()
        return
      }
      setErrors({ view, part: 2 })
      focusRequest.current = { target: 'alert', part: 2 }
      return
    }
    finished.current = true
    writeDeliveryChoice(null)
    cart.clear()
    // Una edición de "Editar pedido" que no se volvió a agregar ya no tiene línea que reemplazar: el pastel de antes va en el
    // pedido. Un diseño nuevo a medias, que nunca se agregó, se queda (D49).
    if (readDraft().replaces !== null) clearDraft()
    if (result.order.status === 'awaiting_quote') {
      setPlacedQuote(result.order)
      focusRequest.current = { target: 'placed', part: null }
      return
    }
    // El pedido va en la URL (sobrevive a una recarga y al regreso de Mercado Pago, D68) y en el estado de la navegación.
    navigate(`/pedido/pago?pedido=${result.order.id}`, { state: { orderId: result.order.id } })
  }

  const requiresQuote = summary.requiresQuote
  const when = selectedDate && chosenSlot ? scheduleText(selectedDate, chosenSlot) : null
  const dateShort = selectedDate ? shortDate(selectedDate) : null
  const action = part === 1 ? 'Continuar' : requiresQuote ? 'Enviar pedido' : 'Continuar al pago'

  return {
    store,
    lines,
    summary,
    blocked,
    empty: cart.items.length === 0,
    conflict: summary.conflict,
    part,
    checking,
    direction,
    /** "Lunes 16 de noviembre, 3:30 pm", o `null` sin fecha y hora. */
    when,
    /** Las filas de la entrega en el resumen. */
    deliveryRows: { mode: MODE, when: when ?? 'Por elegir' },
    /** "Resumen del pedido, 2 productos" del panel de móvil. */
    summaryTitle: `Resumen del pedido, ${summary.count} ${summary.count === 1 ? 'producto' : 'productos'}`,
    /** Lo que dice la barra de móvil: lo elegido en "Fecha y hora", el total en "¿Quién recoge?". */
    bar:
      part === 1
        ? {
            label: dateShort ? `Recoges el ${dateShort}` : 'Recoges en la pastelería',
            value: chosenSlot ? formatTime(chosenSlot) : selectedDate ? 'Elige la hora' : 'Elige fecha y hora',
            action,
          }
        : { label: 'Total estimado', value: summary.total ? `${summary.total} MXN` : 'Por confirmar', action },
    calendar,
    chooseDay,
    chooseSlot,
    pickupName,
    pickupPhone,
    editName,
    editPhone,
    fieldErrors,
    /** Bajo "Fecha y hora": lo que falta elegir o, si lo restaurado ya no se ofrece, por qué se soltó. */
    scheduleError: fieldErrors.schedule ?? (calendar.lost ? LOST_MESSAGES[calendar.lost] : undefined),
    /** El aviso del servidor, solo en la parte donde va. */
    errors: errors?.part === part ? errors.view : null,
    toPickup,
    toSchedule,
    submit,
    status,
    placedQuote,
  }
}
