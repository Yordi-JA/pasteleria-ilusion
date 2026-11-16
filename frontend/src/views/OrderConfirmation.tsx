import { Navigate } from 'react-router'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import CheckoutPageHeader from '../components/CheckoutPageHeader.tsx'
import DirectionsLink from '../components/DirectionsLink.tsx'
import { inlineLink } from '../components/focus.ts'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Pending from '../components/Pending.tsx'
import ProgressPearls from '../components/ProgressPearls.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import TextLink from '../components/TextLink.tsx'
import { PEARL_STEPS } from '../viewmodels/orderView.ts'
import { useOrderConfirmation } from '../viewmodels/useOrderConfirmation.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useStoreDetails } from '../viewmodels/useStoreInfo.ts'
import NoteDownloadButton from './orders/NoteDownloadButton.tsx'
import OrderTimeline from './orders/OrderTimeline.tsx'
import PaidSummary from './orders/PaidSummary.tsx'
import { StateCard } from './payment/PaymentStates.tsx'

const TITLE = 'Recibimos tu pedido'

const column = 'mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4'
const grid = `${column} grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-12 py-12 max-[900px]:grid-cols-1`

function ConfirmationSkeleton() {
  return (
    <div className={grid}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-56 max-w-full" />
        <Skeleton radius="md" className="h-[420px] w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-40 max-w-full" />
        <Skeleton radius="md" className="h-80 w-full" />
      </div>
    </div>
  )
}

/**
 * `/pedido/confirmacion?pedido=<id>` (mockup `Confirmacion`). D68 llega aquí cuando el servidor dice `received`; D69 lo
 * verifica: pide el pedido y, si todavía no está pagado, regresa al pago. Pide sesión.
 */
export default function OrderConfirmation() {
  usePageTitle(TITLE)
  const confirmation = useOrderConfirmation()
  const { load, view, orderId, note } = confirmation
  const store = useStoreDetails()
  if (confirmation.redirect) return <Navigate to={confirmation.redirect} replace />

  let body
  if (load.status === 'missing' || orderId === null) {
    body = (
      <div className="py-12">
        <StateCard title="No encontramos tu pedido">
          <p className="text-cuerpo text-mermelada-suave">Revisa tus pedidos para ver en qué va cada uno.</p>
          <ButtonLink to="/cuenta">Ver mis pedidos</ButtonLink>
        </StateCard>
      </div>
    )
  } else if (load.status === 'error') {
    body = (
      <div className={`${column} flex flex-col py-12`}>
        <LoadErrorNotice title="No pudimos cargar tu pedido" onRetry={confirmation.retry} />
      </div>
    )
  } else if (view) {
    body = (
      <div className={grid}>
        <section aria-labelledby="confirmacion-pedido" className="flex min-w-0 flex-col gap-4">
          <h2 id="confirmacion-pedido" className="font-display text-titulo-2">
            Pedido #{orderId}
          </h2>
          <Card large className="flex flex-col gap-6 max-[600px]:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              {view.created && <p className="text-cuerpo text-mermelada-suave">Hecho el {view.created}</p>}
              <ProgressPearls steps={PEARL_STEPS} current={view.pearl} />
            </div>
            <div className="flex flex-col gap-4">
              <h3 id="confirmacion-avance" className="font-display text-titulo-3">
                Cómo va tu pedido
              </h3>
              <OrderTimeline steps={view.steps} labelledBy="confirmacion-avance" />
              {view.pickup && store.status !== 'loading' && (
                <p className="text-cuerpo text-mermelada-suave">
                  Recoges en Pastelería Ilusión, {store.address ?? <Pending what="Dirección" />}.
                  {store.directionsUrl && (
                    <>
                      {' '}
                      <DirectionsLink url={store.directionsUrl} className={`${inlineLink} font-semibold`} />
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <ButtonLink to={`/cuenta/pedidos/${orderId}`}>Ver mi pedido</ButtonLink>
              <TextLink to="/catalogo">Seguir comprando</TextLink>
              {view.noteAvailable && <NoteDownloadButton state={note.state} onDownload={note.download} />}
            </div>
          </Card>
        </section>
        <PaidSummary summary={view.summary} title="Resumen" headingId="confirmacion-resumen" depositNote />
      </div>
    )
  }

  return (
    <>
      <CheckoutPageHeader title={TITLE} step="Confirmación" drawing="toldo">
        {view && confirmation.email && (
          <p className="max-w-[480px] text-cuerpo text-mermelada-suave">
            Te enviamos la confirmación a <span className="break-all">{confirmation.email}</span>. Te avisaremos cada vez que cambie de estado.
          </p>
        )}
      </CheckoutPageHeader>
      <LoadingRegion loading={body === undefined} label="Cargando tu pedido…" skeleton={<ConfirmationSkeleton />}>
        {body}
      </LoadingRegion>
    </>
  )
}
