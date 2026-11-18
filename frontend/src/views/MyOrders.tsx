import Button from '../components/Button.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import LineDrawing from '../components/LineDrawing.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Reveal from '../components/Reveal.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import { useMyOrders } from '../viewmodels/useMyOrders.ts'
import { useMyQuoteRequests } from '../viewmodels/useMyQuoteRequests.ts'
import type { RequestRowView } from '../viewmodels/referenceView.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import AccountHeader from './account/AccountHeader.tsx'
import { CurrentOrderCard, PreviousOrderRow, QuoteRequestRow } from './account/OrderCards.tsx'

const column = 'mx-auto w-full max-w-[1200px] px-6 py-10 max-[600px]:px-4'

/** La misma estructura que "Mis pedidos" (mockup `CuentaCargando`): dos columnas de tarjetas. */
function OrdersSkeleton() {
  const rows = (count: number) =>
    Array.from({ length: count }, (_, index) => (
      <div key={index} className="flex items-center gap-3">
        <Skeleton radius="md" className="h-12 w-12 shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
        <Skeleton className="h-3 w-14" />
      </div>
    ))
  return (
    <div className={`${column} grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-8 max-[900px]:grid-cols-1`}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-48" />
        <div className="flex flex-col gap-3 rounded-lg border border-relieve p-5">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-3 w-80 max-w-full" />
          <Skeleton className="h-3 w-60 max-w-full" />
          <Skeleton radius="md" className="h-9 w-full" />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-52" />
        <div className="flex flex-col gap-4 rounded-lg border border-relieve p-5">{rows(4)}</div>
      </div>
    </div>
  )
}

type QuoteRequestsProps = {
  status: 'loading' | 'ready' | 'error'
  rows: RequestRowView[]
  history: RequestRowView[]
  retry: () => void
}

/** "Solicitudes de cotización" (mockup `Cuenta`): bajo los pedidos en curso. Si no cargan, lo dice sin tapar los pedidos. */
function QuoteRequests({ status, rows, history, retry }: QuoteRequestsProps) {
  if (status === 'loading' || (status === 'ready' && rows.length === 0 && history.length === 0)) return null
  return (
    <>
      {(status === 'error' || rows.length > 0) && <OpenQuoteRequests status={status} rows={rows} retry={retry} />}
      {status === 'ready' && history.length > 0 && <PastQuoteRequests rows={history} />}
    </>
  )
}

/** "Solicitudes anteriores": las canceladas, con su estado en texto, su fecha y su enlace. */
function PastQuoteRequests({ rows }: { rows: RequestRowView[] }) {
  return (
    <section aria-labelledby="solicitudes-anteriores" className="flex flex-col gap-4">
      <h2 id="solicitudes-anteriores" className="font-display text-titulo-2">
        Solicitudes anteriores
      </h2>
      <Card large className="py-1 max-[600px]:px-4">
        <ul className="flex flex-col divide-y divide-relieve">
          {rows.map((request) => (
            <li key={request.id}>
              <QuoteRequestRow request={request} />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

function OpenQuoteRequests({ status, rows, retry }: Omit<QuoteRequestsProps, 'history'>) {
  return (
    <section aria-labelledby="solicitudes-cotizacion" className="flex flex-col gap-4">
      <h2 id="solicitudes-cotizacion" className="font-display text-titulo-2">
        Solicitudes de cotización
      </h2>
      {status === 'error' ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-nota text-error">
            No pudimos cargar tus solicitudes de cotización.
          </p>
          <Button variant="secondary" onClick={retry}>
            Volver a intentar
          </Button>
        </div>
      ) : (
        <Card large className="py-1 max-[600px]:px-4">
          <ul className="flex flex-col divide-y divide-relieve">
            {rows.map((request) => (
              <li key={request.id}>
                <QuoteRequestRow request={request} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

function EmptyOrders() {
  return (
    <div className={column}>
      <Card large className="mx-auto flex max-w-[540px] flex-col items-center gap-4 text-center">
        <LineDrawing drawing="toldo" size={80} className="text-mermelada-suave" />
        <h2 className="font-display text-titulo-2">Aún no tienes pedidos</h2>
        <p className="text-cuerpo text-mermelada-suave">Cuando hagas tu primer pedido, aquí verás en qué va y podrás volver a pedirlo.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink to="/catalogo">Ver el catálogo</ButtonLink>
          <ButtonLink to="/vitrina" variant="secondary">
            Ver la vitrina
          </ButtonLink>
        </div>
      </Card>
    </div>
  )
}

/**
 * `/cuenta`, "Mis pedidos" (D69, mockups `Cuenta`, `PedidosVacio` y `CuentaCargando`): los pedidos en curso a la
 * izquierda y los anteriores a la derecha, con "Ver más pedidos" al pie. Las solicitudes de cotización en curso (D70) van
 * en la columna izquierda, bajo los pedidos en curso, como el mockup; una aceptada ya es su pedido. Pide sesión.
 */
export default function MyOrders() {
  usePageTitle('Mis pedidos')
  const list = useMyOrders()
  const quotes = useMyQuoteRequests()
  const quoteSection = <QuoteRequests status={quotes.status} rows={quotes.rows} history={quotes.history} retry={quotes.retry} />
  const hasQuotes = quotes.status === 'error' || quotes.rows.length > 0 || quotes.history.length > 0

  let body
  if (list.status === 'error') {
    body = (
      <div className={column}>
        <LoadErrorNotice title="No pudimos cargar tus pedidos" onRetry={list.retry} />
      </div>
    )
  } else if (list.empty && quotes.status === 'loading') {
    // Sin pedidos, el estado vacío espera a saber si hay solicitudes.
    body = undefined
  } else if (list.empty && !hasQuotes) {
    body = <EmptyOrders />
  } else if (list.status === 'ready') {
    const left = list.current.length > 0 || hasQuotes
    const both = left && list.previous.length > 0
    const more = list.hasMore && (
      <div className="flex flex-col items-start gap-2 pt-2">
        <Button variant="secondary" onClick={list.loadMore} disabled={list.more === 'loading'}>
          {list.more === 'loading' ? 'Cargando más pedidos…' : 'Ver más pedidos'}
        </Button>
        {list.more === 'error' && (
          <p role="alert" className="text-nota text-error">
            No pudimos cargar más pedidos. Vuelve a intentarlo.
          </p>
        )}
      </div>
    )
    body = (
      <div className={`${column} grid items-start gap-x-8 gap-y-10 ${both ? 'grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] max-[900px]:grid-cols-1' : 'grid-cols-1'}`}>
        {left && (
          <div className="flex min-w-0 flex-col gap-10">
            {list.current.length > 0 && (
              <section aria-labelledby="pedidos-en-curso" className="flex flex-col gap-4">
                <h2 id="pedidos-en-curso" className="font-display text-titulo-2">
                  {list.current.length === 1 ? 'Pedido en curso' : 'Pedidos en curso'}
                </h2>
                <Reveal stagger className="flex flex-col gap-4">
                  {list.current.map((order) => (
                    <CurrentOrderCard key={order.id} order={order} />
                  ))}
                </Reveal>
              </section>
            )}
            {quoteSection}
          </div>
        )}
        {(list.previous.length > 0 || list.hasMore) && (
          <section aria-labelledby="pedidos-anteriores" className="flex min-w-0 flex-col gap-4">
            <h2 id="pedidos-anteriores" className="font-display text-titulo-2">
              Pedidos anteriores
            </h2>
            {list.previous.length > 0 ? (
              <Reveal as="ul" stagger className="flex flex-col border-t border-relieve">
                {list.previous.map((order) => (
                  <li key={order.id}>
                    <PreviousOrderRow order={order} />
                  </li>
                ))}
              </Reveal>
            ) : (
              <p className="text-cuerpo text-mermelada-suave">Tus pedidos entregados aparecerán aquí.</p>
            )}
            {more}
          </section>
        )}
      </div>
    )
  }

  return (
    <>
      <AccountHeader />
      <LoadingRegion loading={body === undefined} label="Cargando tus pedidos…" skeleton={<OrdersSkeleton />}>
        {body}
      </LoadingRegion>
    </>
  )
}
