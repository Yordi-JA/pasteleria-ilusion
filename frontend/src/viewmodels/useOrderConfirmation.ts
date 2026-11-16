import { useSearchParams } from 'react-router'
import { isPaid, paidSummary, pearlStep, timelineSteps } from './orderView.ts'
import { createdText } from './paymentView.ts'
import { parseOrderId, useAccountOrder } from './useAccountOrder.ts'
import { useNoteDownload } from './useNoteDownload.ts'
import { useSession } from './useSession.ts'

/**
 * View-model de `/pedido/confirmacion` (D68 la abre con `?pedido=<id>`; D69 la verifica contra el servidor). Un pedido
 * pagado muestra su confirmación; uno que todavía no se paga (o que venció o espera cotización) vuelve a
 * `/pedido/pago`, que muestra ese estado. Uno ajeno o que no existe es `missing`, como en el pago.
 */
export function useOrderConfirmation() {
  const [search] = useSearchParams()
  const orderId = parseOrderId(search.get('pedido'))
  const { load, retry } = useAccountOrder(orderId)
  const note = useNoteDownload(orderId)
  const session = useSession()
  const order = load.status === 'ready' ? load.order : null
  const paid = order !== null && isPaid(order.status)

  return {
    orderId,
    load,
    retry,
    note,
    email: session.status === 'authenticated' ? session.user.email : null,
    redirect: order && !paid ? `/pedido/pago?pedido=${order.id}` : null,
    view:
      order && paid
        ? {
            created: createdText(order),
            pearl: pearlStep(order.status) ?? 1,
            steps: timelineSteps(order, 'confirmation'),
            summary: paidSummary(order),
            noteAvailable: order.noteAvailable,
            pickup: order.fulfillment === 'pickup',
          }
        : null,
  }
}
