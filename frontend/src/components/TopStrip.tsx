import type { StoreDetails } from '../viewmodels/useStoreInfo.ts'
import { LeadDaysText, StoreLoadingLabel, StoreSkeleton, WhatsAppNumber } from './StoreText.tsx'

type TopStripProps = { store: StoreDetails }

/** Franja `mermelada` sobre el toldo: anticipación de los pedidos y WhatsApp (este se oculta en móvil, como en el mockup). */
export default function TopStrip({ store }: TopStripProps) {
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
