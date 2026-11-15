import { useMemo, useRef } from 'react'
import CheckoutPageHeader from '../components/CheckoutPageHeader.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import TextLink from '../components/TextLink.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { usePayment } from '../viewmodels/usePayment.ts'
import PaymentMethods from './payment/PaymentMethods.tsx'
import { ExpiredOrder, MissingOrder, QuoteOrder, RefundOrder } from './payment/PaymentStates.tsx'
import PaymentSummary from './payment/PaymentSummary.tsx'

const TITLE = 'Paga tu pedido'

const column = 'mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4'
const grid = `${column} grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-12 py-12 max-[900px]:grid-cols-1`

/** El esqueleto con la forma de la pantalla: los métodos a la izquierda y el resumen a la derecha. */
function PaymentSkeleton() {
  return (
    <div className={grid}>
      <div className="flex flex-col gap-4 max-[900px]:order-2">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton radius="md" className="h-[520px] w-full" />
      </div>
      <div className="flex flex-col gap-4 max-[900px]:order-1">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton radius="md" className="h-80 w-full" />
      </div>
    </div>
  )
}

/**
 * `/pedido/pago` (D68): el pedido de `?pedido=` con el desglose del servidor y los tres métodos (Mercado Pago, la
 * tarjeta con Stripe y el efectivo), con sus estados: procesando, rechazado, vencido, por reembolsar y apartado. Pide
 * sesión (`RequireSession`). Un pedido pagado sigue a `/pedido/confirmacion`; uno apartado en efectivo, a
 * `/pedido/apartado`.
 */
export default function Payment() {
  usePageTitle(TITLE)
  const alertRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const focus = useMemo(() => ({ alert: alertRef, status: statusRef }), [])
  const payment = usePayment(focus)
  const { load, stage, view, orderId, phase } = payment

  let body
  if (load.status === 'missing' || orderId === null) body = <MissingOrder />
  else if (load.status === 'error') {
    body = (
      <div className={`${column} flex flex-col py-12`}>
        <LoadErrorNotice title="No pudimos cargar tu pedido" onRetry={payment.retryLoad} />
      </div>
    )
  } else if (stage?.kind === 'expired') body = <ExpiredOrder />
  else if (stage?.kind === 'quote') body = <QuoteOrder />
  else if (stage?.kind === 'refund') body = <RefundOrder orderId={orderId} amount={stage.amount} orderReceived={stage.orderReceived} store={payment.store} />
  else if (view) {
    const idle = phase.kind === 'idle' || phase.kind === 'timedOut'
    body = (
      <div className={grid}>
        <div className="flex flex-col gap-6 max-[900px]:order-2">
          <PaymentMethods
            orderId={orderId}
            payToday={view.summary.payToday}
            available={view.available}
            stripeKey={payment.stripeKey}
            phase={phase}
            alert={payment.alert ?? (idle ? view.rejected : null)}
            alertRef={alertRef}
            statusRef={statusRef}
            reserved={view.reserved}
            cashDeadline={view.cashDeadline}
            card={payment.card}
            onMercadoPago={() => void payment.payWithMercadoPago()}
            onCash={() => void payment.reserveInCash()}
            onCheckAgain={payment.checkAgain}
          />
          <TextLink to="/pedido/entrega">Volver a entrega</TextLink>
        </div>
        <PaymentSummary summary={view.summary} className="max-[900px]:order-1" />
      </div>
    )
  }

  // Cargando, o pagado mientras pasa a la confirmación: el esqueleto.
  const loading = body === undefined
  return (
    <>
      <CheckoutPageHeader title={TITLE} step="Pago">
        {view && <p className="max-w-[480px] text-cuerpo text-mermelada-suave">{view.sentence}</p>}
      </CheckoutPageHeader>
      <LoadingRegion loading={loading} label="Cargando tu pedido…" skeleton={<PaymentSkeleton />}>
        {body}
      </LoadingRegion>
    </>
  )
}
