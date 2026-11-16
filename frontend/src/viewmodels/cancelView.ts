/**
 * Los textos de "Cancelar pedido" (D70), sin React. Los montos y el porcentaje salen tal cual de la API
 * (`CancellationPreview`): aquí solo se dan formato y se arman frases.
 */
import { ApiError } from '../models/apiClient.ts'
import type { CancellationPreview } from '../models/accountOrders.ts'
import { formatPrice } from '../models/money.ts'

const ZERO = /^0+(?:\.0+)?$/

function price(amount: string): string {
  return formatPrice(amount) ?? amount
}

/** Si se devuelve algo al cancelar. */
export function hasRefund(preview: CancellationPreview): boolean {
  return !ZERO.test(preview.refund)
}

export type CancelDialogText = {
  /** Lo principal: lo que pasa con el dinero. */
  headline: string
  /** Quién hace la devolución, si hay una. */
  detail: string | null
}

/** Lo que dice el diálogo de confirmación. Sin pagar, "No se cobra nada"; pagado, lo retenido y lo devuelto. */
export function cancelDialogText(preview: CancellationPreview): CancelDialogText {
  if (ZERO.test(preview.paid)) return { headline: 'No se cobra nada.', detail: null }
  const kept = `La pastelería retiene ${price(preview.retained)} (el ${preview.retentionPercent}% del pedido)`
  return hasRefund(preview)
    ? { headline: `${kept} y te devolvemos ${price(preview.refund)}.`, detail: 'La devolución la hace la pastelería.' }
    : { headline: `${kept} y no queda nada por devolver.`, detail: null }
}

/** El aviso de éxito: lo que se retuvo no se repite; si hay devolución, queda pendiente. */
export function cancelledNoticeText(preview: CancellationPreview): string {
  return hasRefund(preview)
    ? `La devolución de ${price(preview.refund)} está pendiente: la hace la pastelería.`
    : 'No se cobró nada por esta cancelación.'
}

/** Si el motivo se muestra como texto en el detalle: un pedido ya cancelado no dice nada. */
export function cancelReasonText(preview: CancellationPreview): string | null {
  return !preview.cancellable && preview.reason !== 'already_cancelled' ? preview.message : null
}

export type CancelFailure = { kind: 'conflict' | 'retry'; text: string }

/** El texto de un error al cancelar. Un 409 trae su propio `detail`, que ya está en español. */
export function cancelFailure(error: unknown): CancelFailure {
  if (error instanceof ApiError && error.status === 409) {
    const detail = typeof error.body === 'object' && error.body !== null ? Reflect.get(error.body, 'detail') : undefined
    return { kind: 'conflict', text: typeof detail === 'string' && detail !== '' ? detail : 'Este pedido ya no se puede cancelar.' }
  }
  if (error instanceof ApiError && error.status === 429) {
    return { kind: 'retry', text: 'Hiciste muchos intentos. Espera un momento y vuelve a intentarlo.' }
  }
  return { kind: 'retry', text: 'No pudimos cancelar tu pedido. Vuelve a intentarlo en un momento.' }
}
