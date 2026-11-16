import type { StoreDetails } from '../viewmodels/useStoreInfo.ts'
import { focusRingOnColor } from './focus.ts'
import Pending from './Pending.tsx'
import { StoreLoadingLabel, StoreSkeleton } from './StoreText.tsx'

type CheckoutStripProps = {
  store: StoreDetails
  /** Solo en el pago: quién procesa los pagos (tanda 1, D77). En la entrega todavía no se paga. */
  payments: boolean
}

/**
 * La franja `mermelada` del marco de la compra (mockup de Entrega y Pago): en el pago, quién procesa los pagos a la izquierda
 * (se oculta en móvil), y siempre "¿Dudas con tu pedido?" con el WhatsApp. El resto del sitio ya no lleva franja (D77).
 */
export default function CheckoutStrip({ store, payments }: CheckoutStripProps) {
  const loading = store.status === 'loading'
  return (
    <div data-testid="franja" className="bg-mermelada text-nota text-betun">
      <div
        aria-busy={loading || undefined}
        className={`mx-auto flex max-w-[1200px] flex-wrap gap-x-6 gap-y-1 px-6 py-2.5 max-[600px]:px-4 ${payments ? 'justify-between' : 'justify-end'}`}
      >
        {loading && <StoreLoadingLabel />}
        {payments && <p className="max-[600px]:hidden">Pagos procesados por Stripe y Mercado Pago</p>}
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
