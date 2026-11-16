import { useEffect, useState } from 'react'
import { cancelOrder, getCancellationPreview } from '../models/accountOrders.ts'
import type { AccountOrder, CancellationPreview } from '../models/accountOrders.ts'
import { cancelDialogText, cancelFailure, cancelledNoticeText, cancelReasonText } from './cancelView.ts'

type Options = {
  orderId: number | null
  /** El pedido cargado, o `null` mientras carga o si falló. */
  order: AccountOrder | null
  /** Vuelve a pedir el pedido (tras un 409 el estado cambió). */
  reload: () => void
  /** El pedido ya cancelado que devuelve el servidor. */
  onCancelled: (order: AccountOrder) => void
}

/**
 * View-model de "Cancelar pedido" en el detalle (D70): pide la vista previa (`GET orders/<id>/cancel/`) de todo pedido
 * que no esté cancelado (uno entregado responde `not_cancellable` con su frase), controla el diálogo de confirmación y envía `POST`. Un 409 cierra el diálogo, muestra su texto
 * y vuelve a pedir el pedido; un 429, un 5xx o la falta de red dejan el diálogo abierto con el error.
 */
export function useOrderCancellation({ orderId, order, reload, onCancelled }: Options) {
  const [preview, setPreview] = useState<CancellationPreview | null>(null)
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [doneText, setDoneText] = useState<string | null>(null)
  const status = order?.status ?? null
  // Se cancela en cualquier estado antes de la entrega (D70, segunda ronda); entregado, la vista previa trae el motivo en texto.
  const watching = orderId !== null && status !== null && status !== 'cancelled'

  useEffect(() => {
    if (!watching || orderId === null) return
    const controller = new AbortController()
    getCancellationPreview(orderId, controller.signal).then(
      (next) => {
        if (!controller.signal.aborted) setPreview(next)
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) console.warn('No se pudo consultar la cancelación del pedido.', failure)
      },
    )
    return () => controller.abort()
  }, [watching, orderId, status])

  const confirm = async () => {
    if (orderId === null || preview === null || sending) return
    setSending(true)
    setError(null)
    try {
      const result = await cancelOrder(orderId, preview.status)
      setDoneText(cancelledNoticeText(preview))
      setPreview(null)
      setOpen(false)
      onCancelled(result.order)
    } catch (failure) {
      console.warn('No se pudo cancelar el pedido.', failure)
      const { kind, text } = cancelFailure(failure)
      if (kind === 'conflict') {
        setConflict(text)
        setPreview(null)
        setOpen(false)
        reload()
      } else {
        setError(text)
      }
    } finally {
      setSending(false)
    }
  }

  return {
    cancellable: preview?.cancellable === true,
    reasonText: preview ? cancelReasonText(preview) : null,
    dialogText: preview ? cancelDialogText(preview) : null,
    open,
    sending,
    error,
    conflict,
    doneText,
    openDialog: () => {
      setError(null)
      setConflict(null)
      setOpen(true)
    },
    closeDialog: () => {
      if (!sending) setOpen(false)
    },
    confirm: () => void confirm(),
  }
}
