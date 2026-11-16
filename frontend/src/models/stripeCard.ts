/**
 * Stripe.js para el pago con tarjeta (D68). Solo lo importa el chunk diferido de la tarjeta (`views/payment/CardPayment`):
 * usa `@stripe/stripe-js/pure`, que no inserta el script al importarse (la entrada principal lo haría en cuanto se
 * carga el módulo), así Stripe.js llega solo a `/pedido/pago` y solo si la tarjeta se ofrece. Los datos de la tarjeta
 * viven en los iframes de Stripe; este módulo nunca los ve.
 */
import { loadStripe } from '@stripe/stripe-js/pure'
import type { PaymentIntentResult, Stripe, StripeCardNumberElement, StripeElementStyle } from '@stripe/stripe-js'
import { color } from '../../../design/tokens.json'

let loading: Promise<Stripe> | null = null

/** Carga Stripe.js una vez por visita; si falla (red, bloqueador), el siguiente intento vuelve a probar. */
export function loadStripeOnce(publishableKey: string): Promise<Stripe> {
  loading ??= loadStripe(publishableKey).then((stripe) => {
    if (!stripe) throw new Error('Stripe.js no está disponible en este navegador.')
    return stripe
  })
  loading.catch(() => {
    loading = null
  })
  return loading
}

const tokens = new Map(color.tokens.map((token) => [token.name, token.value]))

/** Un color de la paleta como hexadecimal: Stripe pinta dentro de su iframe y no lee las variables CSS de la página. */
function token(name: string): string {
  const value = tokens.get(name)
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`El token de color "${name}" no está en design/tokens.json`)
  return value
}

/**
 * El estilo del texto de los campos de Stripe con los tokens. Los Card Elements (los que usa `confirmCardPayment`) no
 * leen la `appearance` de Elements, que es solo del Payment Element: reciben `style` por campo. El borde, el fondo, el
 * foco y el error los pinta nuestra caja alrededor del iframe, con las clases del preset. Instrument Sans no carga dentro
 * del iframe (es de nuestro origen), así que queda la pila de respaldo de `tokens.css`.
 */
export function cardElementStyle(): StripeElementStyle {
  return {
    base: {
      color: token('mermelada'),
      iconColor: token('mermelada'),
      fontFamily: '"Instrument Sans", "Segoe UI", system-ui, sans-serif',
      fontSize: '16px',
      lineHeight: '24px',
      '::placeholder': { color: token('mermelada-suave') },
    },
    invalid: { color: token('error'), iconColor: token('error') },
  }
}

/** Qué pasó al confirmar la tarjeta, ya sin la forma de Stripe. */
export type CardOutcome =
  | { kind: 'confirmed' }
  | { kind: 'declined' }
  | { kind: 'authentication_failed' }
  | { kind: 'invalid'; message: string }

/** Los estados de un PaymentIntent que ya no piden nada a la persona: el servidor lo confirma por webhook. */
const SETTLED = new Set(['succeeded', 'processing', 'requires_capture'])

export function cardOutcome(result: PaymentIntentResult): CardOutcome {
  const { error } = result
  if (error) {
    if (error.type === 'card_error') return { kind: 'declined' }
    if (error.code === 'payment_intent_authentication_failure') return { kind: 'authentication_failed' }
    if (error.type === 'validation_error') return { kind: 'invalid', message: error.message ?? 'Revisa los datos de tu tarjeta.' }
    // Sin red con Stripe, un error de su API o un PaymentIntent que ya se pagó: no se sabe si se cobró. Manda el servidor.
    return { kind: 'confirmed' }
  }
  return SETTLED.has(result.paymentIntent.status) ? { kind: 'confirmed' } : { kind: 'declined' }
}

/**
 * Confirma el PaymentIntent con la tarjeta de los campos de Stripe. Stripe abre solo la verificación del banco
 * (3D Secure) si hace falta, en su propio iframe, y responde cuando termina.
 */
export async function confirmCard(stripe: Stripe, clientSecret: string, card: StripeCardNumberElement, name: string): Promise<CardOutcome> {
  return cardOutcome(await stripe.confirmCardPayment(clientSecret, { payment_method: { card, billing_details: { name } } }))
}
