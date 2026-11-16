import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { bakeryMoment } from '../models/dates.ts'
import { formatPrice } from '../models/money.ts'
import { getNote, NoteError } from '../models/notes.ts'
import type { Note, NoteFailure } from '../models/notes.ts'
import { formatTime } from './deliverySchedule.ts'
import { longDate } from './standDates.ts'

export type NoteStandView = {
  title: string
  statusLabel: string
  /** "Regresarla antes del" o "Devuelta el", con su fecha. */
  dateLabel: string
  date: string
  deposit: string
}

export type NoteView = {
  heading: string
  customer: string
  delivery: string
  fulfillment: string
  stands: NoteStandView[]
}

type Load = { status: 'loading' } | { status: 'ready'; note: Note } | { status: 'error'; failure: NoteFailure }

function toView(note: Note): NoteView {
  const created = bakeryMoment(note.createdAt)
  const { delivery } = note
  return {
    heading: `Pedido #${note.orderId}${created ? `, hecho el ${longDate(created.date)}` : ''}`,
    customer: note.customer,
    delivery: `${longDate(delivery.date)}, de ${formatTime(delivery.startsAt)} a ${formatTime(delivery.endsAt)}`,
    fulfillment: delivery.fulfillmentLabel,
    stands: note.stands.map((stand) => {
      const returned = stand.status === 'returned' ? bakeryMoment(stand.returnedAt) : null
      const notLent = stand.status === null
      return {
        title: `Base para ${stand.kg} kg`,
        statusLabel: notLent ? 'Se presta al entregar' : (stand.statusLabel ?? ''),
        dateLabel: returned ? 'Devuelta el' : notLent ? 'Regrésala antes del' : 'Regresarla antes del',
        date: longDate(returned ? returned.date : stand.returnBy),
        deposit: formatPrice(stand.deposit) ?? '',
      }
    }),
  }
}

/**
 * View-model de `/nota/:token` (D69, mockup `NotaVerificada`): la página pública que abre el QR. Pide la nota con el
 * `:token` de la URL; sin nota dice por qué (`invalid`: no es válida; `throttled`: demasiadas consultas; `unavailable`:
 * no se pudo verificar). La vista deja volver a intentar salvo con una nota no válida.
 */
export function useNoteVerification() {
  const { token = '' } = useParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getNote(token, controller.signal).then(
      (note) => {
        if (!controller.signal.aborted) setLoad({ status: 'ready', note })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo verificar la nota.', error)
        setLoad({ status: 'error', failure: error instanceof NoteError ? error.failure : 'unavailable' })
      },
    )
    return () => controller.abort()
  }, [token, attempt])

  const retry = useCallback(() => {
    setLoad({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])

  const view = useMemo(() => (load.status === 'ready' ? toView(load.note) : null), [load])
  return { status: load.status, failure: load.status === 'error' ? load.failure : null, view, retry }
}
