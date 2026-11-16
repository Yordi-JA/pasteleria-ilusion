import { getReferenceRequests } from '../models/referenceRequests.ts'
import { isOpenRequest, isPastRequest, requestRow } from './referenceView.ts'
import type { RequestRowView } from './referenceView.ts'
import { useRemoteData } from './useRemoteData.ts'

const FAILURE = 'No se pudieron cargar las solicitudes de cotización.'

/**
 * View-model de "Solicitudes de cotización" en "Mis pedidos" (D70, mockup `Cuenta`): la primera página de
 * `GET reference-requests/` (de la más nueva a la más vieja), solo las que siguen en curso (en revisión o con su
 * cotización) en `rows`, y las canceladas, como historial, en `history`. Una aceptada no se repite: ya aparece como su
 * pedido. Va aparte de `useMyOrders`: si falla, los pedidos
 * se siguen viendo.
 */
export function useMyQuoteRequests() {
  const { state, retry } = useRemoteData(getReferenceRequests, FAILURE)
  const rows: RequestRowView[] = state.status === 'ready' ? state.data.requests.filter(isOpenRequest).map(requestRow) : []
  const history: RequestRowView[] = state.status === 'ready' ? state.data.requests.filter(isPastRequest).map(requestRow) : []
  return { status: state.status, retry, rows, history }
}
