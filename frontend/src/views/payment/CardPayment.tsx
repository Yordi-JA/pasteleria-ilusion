import { CardCvcElement, CardExpiryElement, CardNumberElement, Elements } from '@stripe/react-stripe-js'
import type { Stripe } from '@stripe/stripe-js'
import type { Ref } from 'react'
import TextField from '../../components/TextField.tsx'
import { CARD_NAME_MAX_LENGTH, useCardPayment, useStripeLoader } from '../../viewmodels/useCardPayment.ts'
import type { CardActions, CardField } from '../../viewmodels/useCardPayment.ts'
import CardShell from './CardShell.tsx'

export type CardPaymentProps = {
  stripeKey: string
  amount: string
  actions: CardActions
  disabled: boolean
  processing: boolean
  waiting: boolean
  waitingRef?: Ref<HTMLParagraphElement>
}

/** Stripe pide el español de Latinoamérica para los textos de sus campos y sus errores. */
const ELEMENTS_OPTIONS = { locale: 'es-419' } as const

/**
 * La tarjeta con Stripe Elements (D68), en su propio chunk: llega solo a `/pedido/pago`, con Stripe.js. Mientras Stripe
 * carga se ve el esqueleto; si no carga, la tarjeta lo dice y los otros métodos siguen.
 */
export default function CardPayment(props: CardPaymentProps) {
  const loader = useStripeLoader(props.stripeKey)
  if (loader.status === 'loading') return <CardShell amount={props.amount} loading />
  if (loader.status === 'failed') {
    return <CardShell amount={props.amount} reason="No pudimos cargar el pago con tarjeta. Recarga la página o paga con Mercado Pago o en efectivo." />
  }
  return (
    <Elements stripe={loader.stripe} options={ELEMENTS_OPTIONS}>
      <CardForm {...props} stripe={loader.stripe} />
    </Elements>
  )
}

const FIELD_LABELS: Record<CardField, string> = {
  cardNumber: 'Número de tarjeta',
  cardExpiry: 'Vencimiento (MM/AA)',
  cardCvc: 'Código de seguridad',
}

function CardForm({ stripe, amount, actions, disabled, processing, waiting, waitingRef }: CardPaymentProps & { stripe: Stripe }) {
  const card = useCardPayment(stripe, actions)
  const { nameRef } = card
  const field = (name: CardField, help?: string) => {
    const state = card.fields[name]
    const Element = name === 'cardNumber' ? CardNumberElement : name === 'cardExpiry' ? CardExpiryElement : CardCvcElement
    const errorId = `${name}-error`
    return (
      <div className="flex flex-col gap-1.5">
        {/* El campo vive en un iframe de Stripe: la etiqueta lo enfoca con un clic; su nombre accesible lo pone Stripe. */}
        <label className="cursor-pointer self-start text-etiqueta text-mermelada" onClick={() => card.focusField(name)}>
          {FIELD_LABELS[name]}
        </label>
        <div
          data-testid={`campo-${name}`}
          className={`flex h-12 items-center rounded-sm bg-harina px-[14px] ${
            state.error ? 'border-2 border-error px-[13px]' : 'border border-mermelada-suave hover:border-mermelada'
          } ${state.focused ? 'outline outline-2 outline-offset-2 outline-mermelada' : ''}`}
        >
          <Element
            className="w-full"
            options={card.options[name]}
            onReady={card.handlers[name].onReady}
            onChange={card.handlers[name].onChange}
            onFocus={card.handlers[name].onFocus}
            onBlur={card.handlers[name].onBlur}
          />
        </div>
        {help && <p className="text-nota text-mermelada-suave">{help}</p>}
        {state.error && (
          <p id={errorId} className="text-nota font-semibold text-error">
            {state.error}
          </p>
        )}
      </div>
    )
  }
  return (
    <CardShell
      amount={amount}
      disabled={disabled}
      processing={processing}
      waiting={waiting}
      waitingRef={waitingRef}
      onPay={() => void card.pay()}
    >
      <div className="flex flex-col gap-4">
        {field('cardNumber')}
        <div className="grid grid-cols-2 items-start gap-4 max-[600px]:grid-cols-1">
          {field('cardExpiry')}
          {field('cardCvc', '3 dígitos al reverso (4 al frente en American Express).')}
        </div>
        <TextField
          ref={nameRef}
          label="Nombre como aparece en la tarjeta"
          placeholder="Ej. Ana López García"
          autoComplete="cc-name"
          maxLength={CARD_NAME_MAX_LENGTH}
          value={card.name}
          onChange={(event) => card.editName(event.target.value)}
          error={card.nameError ?? undefined}
        />
      </div>
    </CardShell>
  )
}
