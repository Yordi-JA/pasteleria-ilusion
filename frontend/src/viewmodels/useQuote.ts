import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useParams } from 'react-router'
import { ApiError } from '../models/apiClient.ts'
import { cancelReferenceRequest } from '../models/referenceRequests.ts'
import { SESSION_MESSAGE } from './orderErrors.ts'
import { parseRequestId, quoteRows, referenceFacts, requestDates, validityOf } from './referenceView.ts'
import { useReferencePhotos, useReferenceRequest } from './useReferenceRequest.ts'
import { useStoreDetails } from './useStoreInfo.ts'

const CANCEL_NETWORK_MESSAGE = 'No pudimos conectar con la pastelería. Revisa tu conexión y vuelve a intentarlo.'

/** A dónde va el foco al pedir, conservar o terminar la cancelación. */
export type QuoteFocus = Record<'confirm' | 'cancel' | 'alert' | 'done', RefObject<HTMLElement | null>>

/**
 * View-model de `/cuenta/cotizaciones/:id` (D70, mockup `Cotizacion`): la solicitud con su estado ("En revisión",
 * "Cotización lista", "Aceptada" o "Cancelada"), la cotización (precio, nota, anticipo, resto y vigencia, todo de la API),
 * "Aceptar y pagar" (la entrega con `?cotizacion=`), los enlaces de WhatsApp y "Cancelar solicitud", que pregunta antes.
 */
export function useQuote(focus: QuoteFocus) {
  const { id } = useParams()
  const requestId = parseRequestId(id)
  const { load, retry, refresh, replace } = useReferenceRequest(requestId)
  const store = useStoreDetails()
  const request = load.status === 'ready' ? load.request : null
  const photos = useReferencePhotos(request?.images ?? [])

  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const focusTarget = useRef<keyof QuoteFocus | null>(null)
  useEffect(() => {
    const target = focusTarget.current
    if (!target) return
    focusTarget.current = null
    focus[target].current?.focus()
  })

  const askCancel = useCallback(() => {
    setCancelError(null)
    setConfirming(true)
    focusTarget.current = 'confirm'
  }, [])
  const keep = useCallback(() => {
    setConfirming(false)
    focusTarget.current = 'cancel'
  }, [])

  const confirmCancel = async () => {
    if (requestId === null || cancelling) return
    setCancelling(true)
    setCancelError(null)
    try {
      const cancelled = await cancelReferenceRequest(requestId)
      replace(cancelled)
      setConfirming(false)
      setDone(true)
      focusTarget.current = 'done'
    } catch (error) {
      console.warn('No se pudo cancelar la solicitud.', error)
      if (error instanceof ApiError && error.status === 409) {
        // Ya es un pedido (u otro cambio del servidor): se muestra lo que hay ahora.
        const detail = (error.body as { detail?: unknown } | undefined)?.detail
        setCancelError(typeof detail === 'string' ? detail : 'Esta solicitud ya no se puede cancelar.')
        setConfirming(false)
        refresh()
      } else {
        setCancelError(error instanceof ApiError && error.status === 401 ? SESSION_MESSAGE : CANCEL_NETWORK_MESSAGE)
      }
      focusTarget.current = 'alert'
    } finally {
      setCancelling(false)
    }
  }

  const status = request?.status
  const quote = request?.quote ?? null
  return {
    requestId,
    load,
    retry,
    store,
    title: requestId === null ? 'Solicitud' : `Solicitud #${requestId}`,
    confirming,
    cancelling,
    cancelError,
    cancelled: done,
    askCancel,
    keep,
    confirmCancel,
    view: request
      ? {
          status: request.status,
          statusLabel: request.statusLabel,
          dates: requestDates(request),
          quote: quote ? { rows: quoteRows(quote, request), note: quote.note.trim(), validity: validityOf(quote) } : null,
          acceptPath: status === 'quote_ready' && quote && !quote.expired ? `/pedido/entrega?cotizacion=${request.id}` : null,
          canCancel: status === 'in_review' || status === 'quote_ready',
          orderPath: request.orderId ? `/cuenta/pedidos/${request.orderId}` : null,
          orderId: request.orderId,
          description: request.description,
          facts: referenceFacts(request),
          photos,
          changeMessage: `Hola, quiero pedir un cambio a mi cotización de la solicitud #${request.id}.`,
          talkMessage: `Hola, tengo una pregunta sobre mi solicitud #${request.id}.`,
        }
      : null,
  }
}
