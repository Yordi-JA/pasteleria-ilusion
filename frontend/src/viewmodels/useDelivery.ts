import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useNavigate } from 'react-router'
import type { PlacedOrder } from '../models/orders.ts'
import { cartLines, cartSummary } from './cartLines.ts'
import { lineKinds } from './deliverySchedule.ts'
import type { OrderErrorsView } from './orderErrors.ts'
import { useCart } from './useCart.ts'
import { useDeliveryCalendar } from './useDeliveryCalendar.ts'
import { usePlaceOrder } from './usePlaceOrder.ts'
import { useSession } from './useSession.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** Los mismos separadores que acepta el servidor en un teléfono ("55 1234 5678", "55-1234-5678"). */
const PHONE_SEPARATORS = /[\s().-]/g
const PHONE_DIGITS = /^\d{10}$/
/** El tope de `pickup_name` en el servidor (el de `User.full_name`). */
export const PICKUP_NAME_MAX_LENGTH = 150

/** "5512345678" como lo escribe la gente y como lo pide el ejemplo: "55 1234 5678". */
function displayPhone(digits: string | null): string {
  return digits && PHONE_DIGITS.test(digits) ? `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}` : ''
}

type FieldErrors = { pickupName?: string; pickupPhone?: string; schedule?: string }

/** A dónde va el foco después de un error o de crear el pedido; los elementos son de la vista. */
export type DeliveryFocus = Record<'alert' | 'name' | 'phone' | 'schedule' | 'placed', RefObject<HTMLElement | null>>

/**
 * View-model de `/pedido/entrega` (D66): la forma de entrega (solo recoger en la pastelería; a domicilio va por WhatsApp,
 * decisión B del usuario), el calendario con sus horarios, quién recoge (con el nombre y el teléfono de la cuenta) y
 * "Continuar al pago", que sube las imágenes y crea el pedido. El carrito se vacía al crear el pedido: el pedido ya apartó
 * el lapso, la vitrina y el pan, y dejarlo invitaría a crear otro igual; si el pago falla, se paga ese mismo pedido.
 * Un pedido con "Otra decoración" nace en pausa por cotización: no hay nada que pagar y la pantalla lo dice.
 */
export function useDelivery(focus: DeliveryFocus) {
  const cart = useCart()
  const session = useSession()
  const store = useStoreDetails()
  const navigate = useNavigate()
  const summary = useMemo(() => cartSummary(cart.items), [cart.items])
  const lines = useMemo(() => cartLines(cart.items), [cart.items])
  const kinds = useMemo(() => lineKinds(cart.items), [cart.items])
  const [placedQuote, setPlacedQuote] = useState<PlacedOrder | null>(null)
  const blocked = cart.items.length === 0 || summary.conflict !== null
  const calendar = useDeliveryCalendar(kinds, !blocked && placedQuote === null)
  const { place, status } = usePlaceOrder()

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

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [errors, setErrors] = useState<OrderErrorsView | null>(null)
  // Después de pintar el error, el foco va a donde hay que corregir.
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

  /** Lo que el navegador puede revisar antes de mandar: fecha y hora elegidas, nombre y 10 dígitos. */
  function validate(): FieldErrors {
    const found: FieldErrors = {}
    if (!calendar.selectedDate) found.schedule = 'Elige la fecha en que recoges tu pedido.'
    else if (!calendar.slot) found.schedule = 'Elige la hora en que recoges tu pedido.'
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
    if (found.schedule || found.pickupName || found.pickupPhone) {
      focusTarget.current = found.schedule ? 'schedule' : found.pickupName ? 'name' : 'phone'
      return
    }
    const result = await place({
      items: cart.items,
      deliveryDate: calendar.selectedDate as string,
      slotStartsAt: calendar.slot?.startsAt as string,
      pickupName: pickupName.trim(),
      pickupPhone: pickupPhone.replace(PHONE_SEPARATORS, ''),
    })
    if (!result) return
    if (!result.ok) {
      const view = result.errors
      setErrors(view)
      setFieldErrors({ pickupName: view.pickupName, pickupPhone: view.pickupPhone, schedule: view.schedule })
      // Un lapso que se llenó o una fecha que ya no alcanza: los horarios se vuelven a pedir.
      if (view.reloadSchedule) calendar.reload()
      focusTarget.current = 'alert'
      return
    }
    cart.clear()
    if (result.order.status === 'awaiting_quote') {
      setPlacedQuote(result.order)
      focusTarget.current = 'placed'
      return
    }
    navigate('/pedido/pago', { state: { orderId: result.order.id } })
  }

  return {
    store,
    lines,
    summary,
    blocked,
    empty: cart.items.length === 0,
    conflict: summary.conflict,
    calendar,
    chooseDay,
    chooseSlot,
    pickupName,
    pickupPhone,
    editName,
    editPhone,
    fieldErrors,
    errors,
    submit,
    status,
    placedQuote,
  }
}
