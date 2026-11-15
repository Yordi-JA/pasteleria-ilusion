import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Stripe, StripeCardCvcElement, StripeCardExpiryElement, StripeCardNumberElement, StripeElementChangeEvent } from '@stripe/stripe-js'
import { cardElementStyle, confirmCard, loadStripeOnce } from '../models/stripeCard.ts'
import { declinedAlert } from './paymentView.ts'
import type { PaymentAlert } from './paymentView.ts'

/** Lo que el pago le presta a la tarjeta: iniciar el cobro con Stripe y avisar cómo terminó. Ver `usePayment`. */
export type CardActions = {
  begin: () => Promise<string | null>
  confirmed: () => void
  declined: (alert: PaymentAlert) => void
}

export type CardField = 'cardNumber' | 'cardExpiry' | 'cardCvc'

export const CARD_FIELDS: readonly CardField[] = ['cardNumber', 'cardExpiry', 'cardCvc']

type CardElement = StripeCardNumberElement | StripeCardExpiryElement | StripeCardCvcElement

type FieldState = { complete: boolean; empty: boolean; error: string | null; focused: boolean }

const EMPTY_FIELD: FieldState = { complete: false, empty: true, error: null, focused: false }

/** Lo que falta en cada campo al pagar sin llenarlo (Stripe solo dice el error de un campo a medias). */
const MISSING: Record<CardField, string> = {
  cardNumber: 'Escribe el número de tu tarjeta.',
  cardExpiry: 'Escribe el vencimiento de tu tarjeta.',
  cardCvc: 'Escribe el código de seguridad.',
}

const NAME_MISSING = 'Escribe el nombre como aparece en la tarjeta.'
/** El tope de Stripe para `billing_details.name`. */
export const CARD_NAME_MAX_LENGTH = 150

const AUTHENTICATION_FAILED: PaymentAlert = {
  title: 'Tu banco no confirmó el pago.',
  message: 'No se completó la verificación de tu tarjeta. Vuelve a intentarlo o paga con otro método. No se hizo ningún cargo.',
}

/** Carga Stripe.js con la llave pública. `failed`: no cargó (red, bloqueador); la tarjeta lo dice y lo demás sigue. */
export function useStripeLoader(publishableKey: string) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; stripe: Stripe } | { status: 'failed' }>({ status: 'loading' })
  useEffect(() => {
    let active = true
    loadStripeOnce(publishableKey).then(
      (stripe) => {
        if (active) setState({ status: 'ready', stripe })
      },
      (error: unknown) => {
        console.warn('No se pudo cargar Stripe.js.', error)
        if (active) setState({ status: 'failed' })
      },
    )
    return () => {
      active = false
    }
  }, [publishableKey])
  return state
}

/**
 * View-model de los campos de la tarjeta (D68): el estado de cada campo de Stripe (completo, error, foco), el nombre y
 * "Pagar $X con tarjeta", que revisa los campos, pide el `client_secret` al pago (`begin`) y confirma con Stripe. Los
 * datos de la tarjeta nunca salen de los iframes de Stripe.
 */
export function useCardPayment(stripe: Stripe, actions: CardActions) {
  const elements = useRef<Partial<Record<CardField, CardElement>>>({})
  const [fields, setFields] = useState<Record<CardField, FieldState>>({ cardNumber: EMPTY_FIELD, cardExpiry: EMPTY_FIELD, cardCvc: EMPTY_FIELD })
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const running = useRef(false)

  const patch = useCallback((field: CardField, next: Partial<FieldState>) => {
    setFields((current) => ({ ...current, [field]: { ...current[field], ...next } }))
  }, [])

  const handlers = useMemo(
    () =>
      Object.fromEntries(
        CARD_FIELDS.map((field) => [
          field,
          {
            onReady: (element: CardElement) => {
              elements.current[field] = element
            },
            onChange: (event: StripeElementChangeEvent) => patch(field, { complete: event.complete, empty: event.empty, error: event.error?.message ?? null }),
            onFocus: () => patch(field, { focused: true }),
            onBlur: () => patch(field, { focused: false }),
          },
        ]),
      ) as Record<CardField, { onReady: (element: CardElement) => void; onChange: (event: StripeElementChangeEvent) => void; onFocus: () => void; onBlur: () => void }>,
    [patch],
  )

  /** La etiqueta de un campo de Stripe lleva el foco a su iframe (no hay `for` que lo haga). */
  const focusField = useCallback((field: CardField) => elements.current[field]?.focus(), [])

  const editName = (value: string) => {
    setName(value)
    setNameError(null)
  }

  const options = useMemo(() => {
    const style = cardElementStyle()
    return {
      cardNumber: { style, placeholder: '1234 1234 1234 1234', disableLink: true },
      cardExpiry: { style, placeholder: 'MM / AA' },
      cardCvc: { style, placeholder: '123' },
    }
  }, [])

  const pay = useCallback(async () => {
    if (running.current) return
    // Lo que falta, bajo su campo; el foco va al primero.
    let firstMissing: CardField | 'name' | null = null
    const missing: Partial<Record<CardField, string>> = {}
    for (const field of CARD_FIELDS) {
      const state = fields[field]
      if (state.error) firstMissing ??= field
      else if (!state.complete) {
        missing[field] = MISSING[field]
        firstMissing ??= field
      }
    }
    const trimmed = name.trim()
    if (trimmed === '') firstMissing ??= 'name'
    for (const [field, message] of Object.entries(missing)) patch(field as CardField, { error: message })
    setNameError(trimmed === '' ? NAME_MISSING : null)
    if (firstMissing) {
      if (firstMissing === 'name') nameRef.current?.focus()
      else focusField(firstMissing)
      return
    }
    const card = elements.current.cardNumber as StripeCardNumberElement | undefined
    if (!card) return
    running.current = true
    try {
      const secret = await actions.begin()
      if (!secret) return
      const outcome = await confirmCard(stripe, secret, card, trimmed)
      if (outcome.kind === 'confirmed') actions.confirmed()
      else if (outcome.kind === 'declined') actions.declined(declinedAlert('stripe'))
      else if (outcome.kind === 'authentication_failed') actions.declined(AUTHENTICATION_FAILED)
      else actions.declined({ title: 'Revisa los datos de tu tarjeta.', message: outcome.message })
    } catch (error) {
      // `confirmCardPayment` no debería lanzar; si lo hace, no se sabe si cobró: manda el servidor.
      console.warn('Stripe no respondió al confirmar la tarjeta.', error)
      actions.confirmed()
    } finally {
      running.current = false
    }
  }, [fields, name, patch, focusField, actions, stripe])

  return { fields, handlers, options, focusField, name, editName, nameError, nameRef, pay }
}
