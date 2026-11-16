import { LockSimple } from '@phosphor-icons/react'
import { lazy, Suspense } from 'react'
import type { Ref } from 'react'
import { Link } from 'react-router'
import mercadoPagoLogo from '../../../../assets/logos/mercado-pago.svg'
import Button from '../../components/Button.tsx'
import Card from '../../components/Card.tsx'
import { focusRing, inlineLink } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import Pending from '../../components/Pending.tsx'
import type { PaymentMethod } from '../../models/payments.ts'
import type { PaymentAlert } from '../../viewmodels/paymentView.ts'
import type { CardActions } from '../../viewmodels/useCardPayment.ts'
import type { PaymentPhase } from '../../viewmodels/usePayment.ts'
import CardShell from './CardShell.tsx'

/** Stripe.js y sus campos llegan en un chunk aparte, solo a esta pantalla. Si el chunk no carga, la tarjeta lo dice. */
const CardPayment = lazy(() =>
  import('./CardPayment.tsx').catch((error: unknown) => {
    console.warn('No se pudo cargar el pago con tarjeta.', error)
    return {
      default: ({ amount }: { amount: string }) => (
        <CardShell amount={amount} reason="No pudimos cargar el pago con tarjeta. Recarga la página o paga con Mercado Pago o en efectivo." />
      ),
    }
  }),
)

const UNAVAILABLE: Record<Exclude<PaymentMethod, 'cash'>, string> = {
  mercadopago: 'Por ahora no podemos cobrar con Mercado Pago.',
  stripe: 'Por ahora no podemos cobrar con tarjeta.',
}

type PaymentMethodsProps = {
  orderId: number
  payToday: string
  available: Record<PaymentMethod, boolean>
  stripeKey: string
  phase: PaymentPhase
  /** El aviso del último intento (rechazo, error del servidor), con `role="alert"`. */
  alert: PaymentAlert | null
  alertRef: Ref<HTMLDivElement>
  statusRef: Ref<HTMLParagraphElement>
  reserved: { due: string | null } | null
  cashDeadline: string | null
  card: CardActions
  onMercadoPago: () => void
  onCash: () => void
  onCheckAgain: () => void
}

function Divider({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-4 text-nota text-mermelada-suave before:h-px before:flex-1 before:bg-relieve after:h-px after:flex-1 after:bg-relieve">
      {children}
    </p>
  )
}

/**
 * "¿Cómo quieres pagar?" (mockup de Pago, Pago procesando y Pago rechazado): Mercado Pago, la tarjeta con Stripe y el
 * efectivo en la pastelería. Un método que no se ofrece se ve desactivado con su motivo. Mientras se cobra, los botones
 * quedan desactivados; el aviso de un rechazo o de un error va arriba, con el foco.
 */
export default function PaymentMethods(props: PaymentMethodsProps) {
  const { payToday, available, phase, alert, alertRef, statusRef } = props
  const idle = phase.kind === 'idle' || phase.kind === 'timedOut'
  const cardBusy =
    (phase.kind === 'starting' && phase.method === 'stripe') || phase.kind === 'confirming' || (phase.kind === 'waiting' && phase.source === 'card')
  const cardWaiting = phase.kind === 'waiting' && phase.source === 'card'
  const cardAvailable = available.stripe
  return (
    <section aria-labelledby="pago-metodos" className="flex flex-col gap-4">
      <h2 id="pago-metodos" className="font-display text-titulo-2">
        ¿Cómo quieres pagar?
      </h2>
      <Card large className="flex flex-col gap-6">
        {alert && (
          <div ref={alertRef} tabIndex={-1} className={`rounded-md ${focusRing}`}>
            <Notice tone="error" title={alert.title}>
              {alert.message}
            </Notice>
          </div>
        )}
        {phase.kind === 'waiting' && phase.source === 'checkout' && (
          <div>
            <Notice tone="info" title="Procesando pago…">
              <p ref={statusRef} tabIndex={-1} className="outline-none">
                Esperamos la confirmación de Mercado Pago. No cierres esta ventana.
              </p>
            </Notice>
          </div>
        )}
        {phase.kind === 'timedOut' && (
          <Notice tone="attention" title="Todavía no tenemos la confirmación de tu pago">
            <div className="flex flex-col items-start gap-3">
              <p>Si ya pagaste, no vuelvas a pagar: consulta otra vez en unos minutos. Si no terminaste el pago, puedes pagar de nuevo.</p>
              <Button variant="secondary" onClick={props.onCheckAgain}>
                Volver a consultar
              </Button>
            </div>
          </Notice>
        )}
        {props.reserved && (
          <Notice tone="attention" title="Apartado, falta tu pago" live={false}>
            <div className="flex flex-col items-start gap-1">
              <p>
                Lleva {payToday} a la pastelería hoy, antes de las {props.reserved.due ?? <Pending what="hora" />}. También puedes pagar en línea.
              </p>
              <Link to={`/pedido/apartado?pedido=${props.orderId}`} className={`${inlineLink} inline-flex min-h-11 items-center font-semibold`}>
                Ver tu pedido apartado
              </Link>
            </div>
          </Notice>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="w-full gap-3"
            disabled={!idle || !available.mercadopago}
            aria-describedby={available.mercadopago ? undefined : 'mercadopago-motivo'}
            onClick={props.onMercadoPago}
          >
            <img src={mercadoPagoLogo} alt="" aria-hidden="true" className={`h-10 w-auto shrink-0 ${idle && available.mercadopago ? '' : 'opacity-60'}`} />
            Pagar {payToday} con Mercado Pago
          </Button>
          {!available.mercadopago && (
            <p id="mercadopago-motivo" className="text-nota text-mermelada-suave">
              {UNAVAILABLE.mercadopago} Paga con tarjeta o en efectivo.
            </p>
          )}
        </div>

        <Divider>o paga con tarjeta</Divider>
        {cardAvailable ? (
          <Suspense fallback={<CardShell amount={payToday} loading />}>
            <CardPayment
              stripeKey={props.stripeKey}
              amount={payToday}
              actions={props.card}
              disabled={!idle}
              processing={cardBusy}
              waiting={cardWaiting}
              waitingRef={statusRef}
            />
          </Suspense>
        ) : (
          <CardShell amount={payToday} reason={`${UNAVAILABLE.stripe} Paga con Mercado Pago o en efectivo.`} />
        )}

        <Divider>o paga en efectivo</Divider>
        <div className="flex flex-col items-start gap-3 rounded-md border border-mermelada-suave p-4">
          <h3 className="text-cuerpo font-semibold">Efectivo en la pastelería</h3>
          <p className="text-nota">
            Lleva {payToday} a la pastelería hoy, antes de las {props.cashDeadline ?? <Pending what="hora" />}, o el pedido se cancela.
          </p>
          <Button variant="secondary" disabled={!idle || !available.cash} onClick={props.onCash}>
            Apartar y pagar en efectivo
          </Button>
        </div>

        <p className="flex items-start gap-3 text-nota text-mermelada-suave">
          <LockSimple size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-mermelada" />
          Pago seguro con Stripe y Mercado Pago. No guardamos los datos de tu tarjeta.
        </p>
        <p className="border-t border-relieve pt-4 text-nota text-mermelada-suave">
          Al pagar aceptas los{' '}
          <Link to="/legal#terminos" className={inlineLink}>
            Términos y condiciones
          </Link>{' '}
          y el{' '}
          <Link to="/legal#privacidad" className={inlineLink}>
            Aviso de privacidad
          </Link>
          .
        </p>
      </Card>
    </section>
  )
}
