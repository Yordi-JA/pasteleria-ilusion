import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '../models/apiClient.ts'
import { getPaymentState } from '../models/payments.ts'
import type { PaymentState } from '../models/payments.ts'
import { createdText, dueClock, isReservedInCash, orderSummary, paymentStage, reservedPaymentSentence, whenText } from './paymentView.ts'
import { useStoreDetails } from './useStoreInfo.ts'

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; data: PaymentState }

/**
 * View-model de `/pedido/apartado` (D68, mockup `ConfirmacionEfectivo`): el pedido de `?pedido=`, apartado para pagar en
 * efectivo, con el monto, el plazo que fijó el servidor al elegir efectivo (`payment_due_at`) y los datos de la
 * pastelería. Si el pedido ya no está apartado en efectivo, `redirect` dice a dónde va: la confirmación si ya se pagó o
 * `/pedido/pago`, que muestra cualquier otro estado.
 */
export function useOrderReserved() {
  const [search] = useSearchParams()
  const store = useStoreDetails()
  const raw = search.get('pedido')
  const orderId = raw !== null && /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null
  const [fetched, setLoad] = useState<Load>({ status: 'loading' })
  const load: Load = orderId === null ? { status: 'missing' } : fetched
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (orderId === null) return
    const controller = new AbortController()
    getPaymentState(orderId, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setLoad({ status: 'ready', data })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo cargar el pedido apartado.', error)
        setLoad(error instanceof ApiError && error.status === 404 ? { status: 'missing' } : { status: 'error' })
      },
    )
    return () => controller.abort()
  }, [orderId, attempt])

  const retry = () => {
    setLoad({ status: 'loading' })
    setAttempt((count) => count + 1)
  }

  const data = load.status === 'ready' ? load.data : null
  const stage = data ? paymentStage(data) : null
  const reserved = data !== null && stage?.kind === 'payable' && isReservedInCash(data) ? { data, payment: stage.payment } : null
  const redirect =
    data === null || reserved ? null : stage?.kind === 'paid' ? `/pedido/confirmacion?pedido=${orderId}` : `/pedido/pago?pedido=${orderId}`

  return {
    orderId,
    load,
    retry,
    store,
    redirect,
    view: reserved
      ? {
          due: dueClock(reserved.data.order),
          paymentSentence: reservedPaymentSentence(reserved.payment),
          created: createdText(reserved.data.order),
          pickup: `${whenText(reserved.data.order).replace(/^el /, '')}, en la pastelería`,
          summary: orderSummary(reserved.data.order, reserved.payment, { reserved: true }),
        }
      : null,
  }
}
