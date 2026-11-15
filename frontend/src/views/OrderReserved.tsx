import { Navigate } from 'react-router'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import CheckoutPageHeader from '../components/CheckoutPageHeader.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Notice from '../components/Notice.tsx'
import Pending from '../components/Pending.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import TextLink from '../components/TextLink.tsx'
import { useOrderReserved } from '../viewmodels/useOrderReserved.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import type { StoreDetails } from '../viewmodels/useStoreInfo.ts'
import PaymentSummary from './payment/PaymentSummary.tsx'
import { StateCard } from './payment/PaymentStates.tsx'

const TITLE = 'Tu pedido está apartado'

const column = 'mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4'
const grid = `${column} grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-12 py-12 max-[900px]:grid-cols-1`

function ReservedSkeleton() {
  return (
    <div className={grid}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-56 max-w-full" />
        <Skeleton radius="md" className="h-[480px] w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-40 max-w-full" />
        <Skeleton radius="md" className="h-72 w-full" />
      </div>
    </div>
  )
}

/** "Pastelería Ilusión, <dirección>. Todos los días, de 10:00 a 22:30.", con sus marcadores si faltan (regla 1). */
function StoreAddress({ store }: { store: StoreDetails }) {
  if (store.status === 'loading') return <Skeleton inline className="h-4 w-64 max-w-full align-middle" />
  return (
    <>
      Pastelería Ilusión, {store.address ?? <Pending what="Dirección" />}. Todos los días,{' '}
      {store.hours ? `de ${store.hours.opensAt} a ${store.hours.closesAt}` : <Pending what="horario" />}.
    </>
  )
}

type Step = { title: string; detail: string }

/**
 * La línea de tiempo del pedido apartado. "Recibido" todavía no está hecho: el pedido se recibe cuando la pastelería
 * registra el pago (regla 12); el mockup lo pinta hecho, y gana la regla.
 */
function Timeline({ steps }: { steps: Step[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 id="apartado-avance" className="font-display text-titulo-3">
        Cómo va tu pedido
      </h3>
      <ol aria-labelledby="apartado-avance" className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 && <span aria-hidden="true" className="absolute left-[12px] top-[26px] h-[calc(100%-26px)] w-px bg-relieve" />}
            <span aria-hidden="true" className="h-[26px] w-[26px] shrink-0 rounded-full border-[1.5px] border-mermelada-suave bg-betun" />
            <span className="flex flex-col">
              <span className="text-cuerpo font-semibold">
                {step.title}
                <span className="sr-only">, pendiente</span>
              </span>
              <span className="text-nota text-mermelada-suave">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * `/pedido/apartado` (D68, mockup `ConfirmacionEfectivo`): el pedido apartado para pagar en efectivo, con el monto, el
 * plazo del servidor y los datos de la pastelería. Pide sesión. Si el pedido ya no está apartado en efectivo, sigue a
 * `/pedido/pago` (o a la confirmación, si ya se pagó).
 */
export default function OrderReserved() {
  usePageTitle(TITLE)
  const reserved = useOrderReserved()
  const { load, view, orderId } = reserved
  if (reserved.redirect) return <Navigate to={reserved.redirect} replace />

  let body
  if (load.status === 'missing' || orderId === null) {
    body = (
      <StateCard title="No encontramos tu pedido apartado">
        <p className="text-cuerpo text-mermelada-suave">Revisa tus pedidos para ver cuánto falta pagar.</p>
        <ButtonLink to="/cuenta">Ver mis pedidos</ButtonLink>
      </StateCard>
    )
  } else if (load.status === 'error') {
    body = (
      <div className={`${column} flex flex-col py-12`}>
        <LoadErrorNotice title="No pudimos cargar tu pedido" onRetry={reserved.retry} />
      </div>
    )
  } else if (view) {
    const due = view.due ?? <Pending what="hora" />
    const steps: Step[] = [
      { title: 'Recibido', detail: 'Cuando la pastelería registre tu pago' },
      { title: 'En preparación', detail: 'Empezamos en cuanto recibamos tu pago' },
      { title: 'Listo para recoger', detail: view.pickup },
      {
        title: 'Entregado',
        detail: view.summary.hasDeposit ? 'Y regresas la base con tu nota para recuperar tu depósito' : 'Lo recoges con tu nombre y tu teléfono',
      },
    ]
    body = (
      <div className={grid}>
        <section aria-labelledby="apartado-pedido" className="flex flex-col gap-4">
          <h2 id="apartado-pedido" className="font-display text-titulo-2">
            Pedido #{orderId}
          </h2>
          <Card large className="flex flex-col gap-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              {view.created && <p className="text-cuerpo text-mermelada-suave">Hecho el {view.created}</p>}
              <p className="text-nota font-semibold">Apartado, falta tu pago</p>
            </div>
            <Notice tone="attention" title="Falta tu pago en la pastelería" live={false}>
              <p>
                <StoreAddress store={reserved.store} />
              </p>
              <p className="mt-1.5">
                {view.paymentSentence} Llévalo antes de las {due}.
              </p>
            </Notice>
            <Timeline steps={steps} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <ButtonLink to={`/cuenta/pedidos/${orderId}`}>Ver mi pedido</ButtonLink>
              <TextLink to="/catalogo">Seguir comprando</TextLink>
            </div>
          </Card>
        </section>
        <PaymentSummary summary={view.summary} variant="reserved" />
      </div>
    )
  }

  return (
    <>
      <CheckoutPageHeader title={TITLE} step="Confirmación" drawing="toldo">
        {view && (
          <p className="max-w-[480px] text-cuerpo text-mermelada-suave">
            Lleva hoy mismo {view.summary.payToday} a la pastelería, antes de las {view.due ?? <Pending what="hora" />}, para confirmarlo. Si no lo
            recibimos hoy, el pedido se cancela.
          </p>
        )}
      </CheckoutPageHeader>
      <LoadingRegion loading={body === undefined} label="Cargando tu pedido…" skeleton={<ReservedSkeleton />}>
        {body}
      </LoadingRegion>
    </>
  )
}
