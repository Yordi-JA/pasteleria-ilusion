import symbol from '../../../assets/logos/ilusion-simbolo.svg'
import Breadcrumb from '../components/Breadcrumb.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import { focusRing } from '../components/focus.ts'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Notice from '../components/Notice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import Pending from '../components/Pending.tsx'
import ProgressPearls from '../components/ProgressPearls.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import TextLink from '../components/TextLink.tsx'
import { PEARL_STEPS } from '../viewmodels/orderView.ts'
import { useOrderDetail } from '../viewmodels/useOrderDetail.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import type { StoreDetails } from '../viewmodels/useStoreInfo.ts'
import CancelOrder from './orders/CancelOrder.tsx'
import NoteDownloadButton from './orders/NoteDownloadButton.tsx'
import OrderTimeline from './orders/OrderTimeline.tsx'
import PaidSummary from './orders/PaidSummary.tsx'
import { StateCard } from './payment/PaymentStates.tsx'

const column = 'mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4'
const grid = `${column} grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-10 py-12 max-[900px]:grid-cols-1`
const sectionTitle = 'font-display text-titulo-2'

/** La misma estructura que el detalle (mockup `DetallePedidoCargando`): dos columnas de tarjetas. */
function DetailSkeleton() {
  return (
    <div className={grid}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton radius="md" className="h-72 w-full" />
        <Skeleton className="h-9 w-40" />
        <Skeleton radius="md" className="h-96 w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton radius="md" className="h-56 w-full" />
        <Skeleton className="h-9 w-44" />
        <Skeleton radius="md" className="h-56 w-full" />
      </div>
    </div>
  )
}

function WhatsAppCard({ store }: { store: StoreDetails }) {
  return (
    <section aria-labelledby="detalle-ayuda">
      <Card large className="flex flex-col items-start gap-3 max-[600px]:p-4">
        <h2 id="detalle-ayuda" className="font-display text-titulo-3">
          ¿Algún detalle con tu pedido?
        </h2>
        <p className="text-cuerpo text-mermelada-suave">Escríbenos y lo revisamos contigo.</p>
        {store.status === 'loading' ? (
          <Skeleton className="h-11 w-full" />
        ) : store.whatsapp ? (
          <a
            href={store.whatsapp.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-11 w-full items-center justify-center rounded-md border-[1.5px] border-mermelada px-4 text-etiqueta font-semibold hover:bg-harina ${focusRing}`}
          >
            Escribir por WhatsApp
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        ) : (
          <p className="text-cuerpo font-semibold">
            WhatsApp <Pending what="número" />
          </p>
        )}
      </Card>
    </section>
  )
}

/**
 * `/cuenta/pedidos/:id` (D69, mockups `DetallePedido` y `DetallePedidoCargando`). El `h1` es el número de la URL desde
 * el principio; un pedido ajeno o que no existe (404) no muestra nada más que el aviso. Pide sesión.
 */
export default function OrderDetail() {
  const detail = useOrderDetail()
  const { load, view, orderId, note, store, cancel } = detail
  const title = orderId === null ? 'Pedido' : `Pedido #${orderId}`
  usePageTitle(title)

  let body
  if (load.status === 'missing') {
    body = (
      <div className="py-12">
        <StateCard title="No encontramos este pedido">
          <p className="text-cuerpo text-mermelada-suave">Revisa tus pedidos para ver en qué va cada uno.</p>
          <ButtonLink to="/cuenta">Ver mis pedidos</ButtonLink>
        </StateCard>
      </div>
    )
  } else if (load.status === 'error') {
    body = (
      <div className={`${column} flex flex-col py-12`}>
        <LoadErrorNotice title="No pudimos cargar tu pedido" onRetry={detail.retry} />
      </div>
    )
  } else if (view) {
    const noteButton = view.noteAvailable ? <NoteDownloadButton state={note.state} onDownload={note.download} /> : null
    body = (
      <div className={grid}>
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="detalle-estado" className="flex flex-col gap-4">
            <h2 id="detalle-estado" className={sectionTitle}>
              Estado
            </h2>
            <Card large className="flex flex-col gap-4 max-[600px]:p-4">
              {view.steps ? (
                <OrderTimeline steps={view.steps} labelledBy="detalle-estado" />
              ) : view.payHref ? (
                <Notice tone="attention" title="Apartado, falta tu pago" live={false}>
                  <p>Paga tu pedido para confirmarlo: si vence sin pagarse, se cancela.</p>
                  <TextLink to={view.payHref} className="mt-1.5">
                    Pagar mi pedido
                  </TextLink>
                </Notice>
              ) : (
                <p className="text-cuerpo font-semibold">{view.statusLabel}</p>
              )}
              <CancelOrder cancel={cancel} />
            </Card>
          </section>
          <PaidSummary summary={view.summary} title="Productos" headingId="detalle-productos" />
        </div>
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="detalle-entrega" className="flex flex-col gap-4">
            <h2 id="detalle-entrega" className={sectionTitle}>
              Entrega y pago
            </h2>
            <Card large className="flex flex-col gap-4 max-[600px]:p-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-cuerpo font-semibold">Entrega</h3>
                <p className="text-cuerpo text-mermelada-suave">{view.delivery}</p>
                {view.pickup && (
                  <p className="text-cuerpo text-mermelada-suave">
                    {store.status === 'loading' ? <Skeleton inline className="h-4 w-56 align-middle" /> : (store.address ?? <Pending what="Dirección" />)}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1 border-t border-relieve pt-4">
                <h3 className="text-cuerpo font-semibold">Pago</h3>
                <p className="text-cuerpo text-mermelada-suave">{view.payment}</p>
                {view.stands.length === 0 && noteButton}
              </div>
            </Card>
          </section>
          {view.stands.length > 0 && (
            <section aria-labelledby="detalle-base" className="flex flex-col gap-4">
              <h2 id="detalle-base" className={sectionTitle}>
                {view.stands.length === 1 ? 'Base prestada' : 'Bases prestadas'}
              </h2>
              <Card large className="flex flex-col gap-4 max-[600px]:p-4">
                {view.stands.map((stand) => (
                  <div key={stand.key} className="flex flex-col gap-3 border-b border-relieve pb-4 last:border-b-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <img src={symbol} alt="" width={44} height={44} className="h-11 w-11 shrink-0" />
                      <div className="flex flex-col">
                        <h3 className="font-display text-titulo-3">{stand.title}</h3>
                        <p className="text-nota font-semibold">{stand.status}</p>
                      </div>
                    </div>
                    <p className="text-cuerpo text-mermelada-suave">{stand.sentence}</p>
                  </div>
                ))}
                {noteButton}
                <TextLink to="/bases" className="self-start">
                  Cómo devolver una base
                </TextLink>
              </Card>
            </section>
          )}
          <WhatsAppCard store={store} />
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader title={title} before={<Breadcrumb items={[{ label: 'Mi cuenta', to: '/cuenta' }, { label: 'Mis pedidos', to: '/cuenta' }, { label: title }]} />}>
        {view ? (
          <>
            <p className="text-cuerpo text-mermelada-suave">{view.dates}</p>
            {view.pearl !== null ? (
              <ProgressPearls steps={PEARL_STEPS} current={view.pearl} />
            ) : (
              <p className="text-etiqueta font-semibold">{view.statusLabel}</p>
            )}
          </>
        ) : (
          load.status === 'loading' && (
            <div aria-hidden="true" className="flex flex-col gap-3">
              <Skeleton tone="fresa" className="h-5 w-80 max-w-full" />
              <Skeleton tone="fresa" className="h-4 w-36" />
            </div>
          )
        )}
      </PageHeader>
      <LoadingRegion loading={body === undefined} label="Cargando tu pedido…" skeleton={<DetailSkeleton />}>
        {body}
      </LoadingRegion>
    </>
  )
}
