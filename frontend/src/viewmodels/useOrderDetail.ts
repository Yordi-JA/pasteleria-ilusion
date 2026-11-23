import { useState } from 'react'
import { useParams } from 'react-router'
import type { AccountOrder } from '../models/accountOrders.ts'
import { orderThumbnails } from '../models/checkout.ts'
import { deliveryText, orderDates, paidSummary, paymentText, pearlStep, standViews, timelineSteps } from './orderView.ts'
import { parseOrderId, useAccountOrder } from './useAccountOrder.ts'
import { useNoteDownload } from './useNoteDownload.ts'
import { useOrderCancellation } from './useOrderCancellation.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/**
 * View-model de `/cuenta/pedidos/:id` (D69, mockup `DetallePedido`): el pedido de la cuenta con su línea de tiempo,
 * sus partidas, la entrega y el pago, la base y la nota. Un id que no es número no pide nada; uno ajeno o que no existe
 * (404) es `missing`.
 */
export function useOrderDetail() {
  const { id } = useParams()
  const orderId = parseOrderId(id)
  const { load, retry } = useAccountOrder(orderId)
  const note = useNoteDownload(orderId)
  const store = useStoreDetails()
  // El pedido que devolvió "Cancelar pedido" manda sobre el cargado: no hace falta volver a pedirlo.
  const [cancelled, setCancelled] = useState<AccountOrder | null>(null)
  const order = cancelled ?? (load.status === 'ready' ? load.order : null)
  const cancel = useOrderCancellation({ orderId, order, reload: retry, onCancelled: setCancelled })

  return {
    orderId,
    load,
    retry,
    note,
    store,
    cancel,
    view: order
      ? {
          dates: orderDates(order),
          pearl: pearlStep(order.status),
          statusLabel: order.statusLabel,
          payHref: order.status === 'awaiting_payment' ? `/pedido/pago?pedido=${order.id}` : null,
          steps: pearlStep(order.status) === null ? null : timelineSteps(order, 'detail'),
          // La captura del pastel diseñado si el pedido se hizo en esta pestaña; si no, la imagen del servidor (D103).
          summary: paidSummary(order, orderThumbnails(order.id)),
          delivery: deliveryText(order),
          pickup: order.fulfillment === 'pickup',
          payment: paymentText(order),
          stands: standViews(order),
          noteAvailable: order.noteAvailable,
        }
      : null,
  }
}
