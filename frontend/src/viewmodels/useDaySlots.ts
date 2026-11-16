import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDeliveryCalendar } from '../models/deliveryCalendar.ts'
import type { CalendarDay, LineKind } from '../models/deliveryCalendar.ts'
import { slotPeriods } from './deliverySchedule.ts'
import type { PeriodId } from './deliverySchedule.ts'

type Loaded = { key: string } & ({ status: 'ready'; day: CalendarDay | null } | { status: 'error' })

/**
 * Los horarios de un solo día ya fijo (D70: el día del evento de una cotización): `GET delivery-slots/?start=D&end=D&kind=`
 * y lo elegido, con la misma forma que el calendario de la entrega para reutilizar `SlotPicker`. Lo elegido que deja de
 * estar disponible (al recargar tras un "Lleno") se suelta solo.
 */
export function useDaySlots(date: string | null, kind: LineKind, enabled: boolean) {
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${date}|${kind}|${attempt}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [period, setPeriod] = useState<PeriodId | null>(null)
  const [slot, setSlot] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !date) return
    const controller = new AbortController()
    getDeliveryCalendar({ start: date, end: date, kinds: [kind] }, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setLoaded({ key: requestKey, status: 'ready', day: data.days.find((candidate) => candidate.date === date) ?? null })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudieron cargar los horarios del día.', error)
        setLoaded({ key: requestKey, status: 'error' })
      },
    )
    return () => controller.abort()
  }, [date, enabled, kind, requestKey])

  // Mientras recarga, se conserva la respuesta anterior: los chips no parpadean.
  const day = loaded?.status === 'ready' ? loaded.day : null
  const status: 'loading' | 'ready' | 'error' = !loaded ? 'loading' : loaded.key !== requestKey ? (loaded.status === 'ready' ? 'ready' : 'loading') : loaded.status
  const periods = useMemo(() => (day?.available ? slotPeriods(day.slots) : []), [day])
  const shownPeriod = periods.find((candidate) => candidate.id === period && candidate.available) ?? periods.find((candidate) => candidate.available) ?? null
  const chosenSlot = shownPeriod?.slots.find((candidate) => candidate.startsAt === slot && candidate.available) ?? null

  const selectPeriod = useCallback((id: PeriodId) => {
    setPeriod(id)
    setSlot(null)
  }, [])
  const selectSlot = useCallback((startsAt: string) => setSlot(startsAt), [])
  const reload = useCallback(() => setAttempt((count) => count + 1), [])

  return {
    status,
    /** El día tiene algún horario que se puede elegir. */
    open: periods.some((candidate) => candidate.available),
    selectedDate: day?.available ? day.date : null,
    periods,
    period: shownPeriod,
    slot: chosenSlot,
    selectPeriod,
    selectSlot,
    reload,
  }
}
