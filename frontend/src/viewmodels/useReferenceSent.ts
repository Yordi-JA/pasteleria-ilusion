import { useSearchParams } from 'react-router'
import { parseRequestId, referenceFacts, sentSteps } from './referenceView.ts'
import { useReferencePhotos, useReferenceRequest } from './useReferenceRequest.ts'
import { useSession } from './useSession.ts'

/**
 * View-model de `/pedido/referencia/enviada?solicitud=<id>` (D70, mockup `SolicitudEnviada`): la solicitud recién
 * enviada con su número, "Qué sigue" y lo que se mandó. El correo es el de la cuenta: ahí llega la cotización.
 */
export function useReferenceSent() {
  const [params] = useSearchParams()
  const id = parseRequestId(params.get('solicitud'))
  const { load, retry } = useReferenceRequest(id)
  const session = useSession()
  const request = load.status === 'ready' ? load.request : null
  const photos = useReferencePhotos(request?.images ?? [])
  return {
    load,
    retry,
    email: session.status === 'authenticated' ? session.user.email : null,
    view: request
      ? {
          id: request.id,
          statusLabel: request.statusLabel,
          steps: sentSteps(request),
          description: request.description,
          facts: referenceFacts(request),
          photos,
          quotePath: `/cuenta/cotizaciones/${request.id}`,
        }
      : null,
  }
}
