import type { StoreDetails } from '../viewmodels/useStoreInfo.ts'
import { focusRingOnColor } from './focus.ts'
import Pending from './Pending.tsx'
import { LeadDaysText, StoreLoadingLabel, StoreSkeleton, WhatsAppNumber } from './StoreText.tsx'

type TopStripProps = {
  store: StoreDetails
  /** En la entrega y el pago (mockup de Entrega y Pago): quién procesa los pagos y el WhatsApp para dudas. */
  checkout?: boolean
}

/** La franja de la compra: los pagos a la izquierda (se oculta en móvil) y "¿Dudas con tu pedido?" con el WhatsApp. */
function CheckoutStrip({ store }: { store: StoreDetails }) {
  const loading = store.status === 'loading'
  return (
    <div data-testid="franja" className="bg-mermelada text-nota text-betun">
      <div
        aria-busy={loading || undefined}
        className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-x-6 gap-y-1 px-6 py-2.5 max-[600px]:px-4"
      >
        {loading && <StoreLoadingLabel />}
        <p className="max-[600px]:hidden">Pagos procesados por Stripe y Mercado Pago</p>
        <p className="text-sobre-color-suave">
          ¿Dudas con tu pedido?{' '}
          {loading ? (
            <StoreSkeleton width="w-36" on="mermelada" />
          ) : store.whatsapp ? (
            <a href={store.whatsapp.url} target="_blank" rel="noopener noreferrer" className={`rounded-sm font-semibold text-betun underline underline-offset-2 ${focusRingOnColor}`}>
              WhatsApp {store.whatsapp.display}
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          ) : (
            <span className="font-semibold text-betun">
              WhatsApp <Pending what="número" />
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

/** Franja `mermelada` sobre el toldo: anticipación de los pedidos y WhatsApp (este se oculta en móvil, como en el mockup). */
export default function TopStrip({ store, checkout = false }: TopStripProps) {
  if (checkout) return <CheckoutStrip store={store} />
  const loading = store.status === 'loading'
  return (
    <div data-testid="franja" className="bg-mermelada text-nota text-betun">
      <div
        aria-busy={loading || undefined}
        className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-x-6 gap-y-1 px-6 py-2.5 max-[600px]:px-4"
      >
        {loading && <StoreLoadingLabel />}
        <p className="min-w-0 max-[600px]:truncate">
          {loading ? <StoreSkeleton width="w-60" on="mermelada" /> : <LeadDaysText days={store.leadDays} />}
        </p>
        <p className="text-sobre-color-suave max-[600px]:hidden">
          {loading ? <StoreSkeleton width="w-44" on="mermelada" /> : <WhatsAppNumber display={store.whatsapp?.display} />}
        </p>
      </div>
    </div>
  )
}
