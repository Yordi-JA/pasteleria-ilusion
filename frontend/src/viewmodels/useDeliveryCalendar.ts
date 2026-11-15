import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../models/apiClient.ts'
import { bakeryToday } from '../models/dates.ts'
import { getDeliveryCalendar } from '../models/deliveryCalendar.ts'
import type { CalendarDay, DeliveryCalendar, LineKind } from '../models/deliveryCalendar.ts'
import { messagesIn } from './orderErrors.ts'
import { addMonths, monthGrid, monthOf, monthRange, sameMonth, slotPeriods } from './deliverySchedule.ts'
import type { MonthRef, PeriodId } from './deliverySchedule.ts'

/** Un número por mes, para compararlos. */
const monthIndex = ({ year, month }: MonthRef) => year * 12 + month

/** La última respuesta, con la petición que la pidió (`key`): si la petición vigente es otra, está cargando. */
type Loaded = { key: string } & (
  | { status: 'ready'; data: DeliveryCalendar }
  /** `message`: el motivo que dio la API (por ejemplo, un pedido que junta la vitrina de hoy con un diseño). */
  | { status: 'error'; message: string | null }
)

/**
 * El calendario de la entrega (D66): el mes visible, sus días y horarios de la API y lo elegido. Pide un mes a la vez
 * (`GET delivery-slots/?start=&end=&kind=`); al cambiar de mes o al recargar, cancela la petición anterior. Si el mes de
 * hoy ya no tiene fechas para el pedido, abre una vez el del primer día posible. Lo elegido que deja de estar disponible
 * (al recargar tras un "Lleno") se suelta solo.
 */
export function useDeliveryCalendar(kinds: LineKind[], enabled: boolean) {
  const kindsKey = kinds.join(',')
  const firstMonth = useMemo(() => monthOf(bakeryToday()), [])
  const [month, setMonth] = useState<MonthRef>(firstMonth)
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${month.year}-${month.month}|${kindsKey}|${attempt}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // El último día que se reserva, de la última respuesta buena: "Mes siguiente" sigue sirviendo si un mes no carga.
  const [latestDate, setLatestDate] = useState<string | null>(null)
  // El día elegido tal como estaba al elegirlo: sigue elegido aunque se vea otro mes.
  const [selected, setSelected] = useState<CalendarDay | null>(null)
  const [period, setPeriod] = useState<PeriodId | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const jumped = useRef(false)

  useEffect(() => {
    if (!enabled || kindsKey === '') return
    const controller = new AbortController()
    getDeliveryCalendar({ ...monthRange(month), kinds: kindsKey.split(',') as LineKind[] }, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        setLoaded({ key: requestKey, status: 'ready', data })
        setLatestDate(data.latestDate)
        // El mes de hoy ya no tiene fechas (por ejemplo, el último día del mes con 2 días de anticipación): una sola vez,
        // al del primer día posible.
        const earliest = data.earliestDate
        const jump = !jumped.current && earliest !== null && !data.days.some((day) => day.available) && !sameMonth(monthOf(earliest), month)
        jumped.current = true
        if (jump && earliest) setMonth(monthOf(earliest))
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo cargar el calendario de la entrega.', error)
        const message = error instanceof ApiError && error.status === 400 ? (messagesIn(error.body)[0] ?? null) : null
        setLoaded({ key: requestKey, status: 'error', message })
      },
    )
    return () => controller.abort()
  }, [enabled, kindsKey, month, requestKey])

  const status: 'loading' | 'ready' | 'error' = !loaded || loaded.key !== requestKey ? 'loading' : loaded.status
  const calendar = loaded?.status === 'ready' ? loaded.data : null
  // Lo elegido vale mientras la API lo siga ofreciendo: con datos nuevos de su mes, se vuelve a buscar (y se suelta si ya
  // no se puede elegir, por ejemplo tras un "Lleno"); viendo otro mes, se conserva.
  const fresh = calendar !== null && selected !== null && calendar.days.some((candidate) => candidate.date === selected.date)
  const day = fresh ? (calendar.days.find((candidate) => candidate.date === selected.date && candidate.available) ?? null) : selected
  const periods = useMemo(() => (day ? slotPeriods(day.slots) : []), [day])
  const shownPeriod = periods.find((candidate) => candidate.id === period && candidate.available) ?? periods.find((candidate) => candidate.available) ?? null
  const chosenSlot = shownPeriod?.slots.find((candidate) => candidate.startsAt === slot && candidate.available) ?? null
  const grid = useMemo(() => monthGrid(month, calendar && sameMonth(monthOf(calendar.start), month) ? calendar : null, day?.date ?? null), [calendar, day, month])

  const selectDay = useCallback(
    (date: string) => {
      setSelected(calendar?.days.find((candidate) => candidate.date === date && candidate.available) ?? null)
      setPeriod(null)
      setSlot(null)
    },
    [calendar],
  )
  const selectPeriod = useCallback((id: PeriodId) => {
    setPeriod(id)
    setSlot(null)
  }, [])
  const selectSlot = useCallback((startsAt: string) => setSlot(startsAt), [])
  const reload = useCallback(() => setAttempt((count) => count + 1), [])
  const showMonth = useCallback((change: number) => setMonth((current) => addMonths(current, change)), [])

  const latest = latestDate ? monthOf(latestDate) : null
  return {
    month,
    grid,
    status,
    errorMessage: loaded?.status === 'error' && status === 'error' ? loaded.message : null,
    /** El primer mes es el de hoy en la pastelería: antes no hay nada que elegir. */
    canGoBack: monthIndex(month) > monthIndex(firstMonth),
    canGoForward: latest !== null && monthIndex(month) < monthIndex(latest),
    previousMonth: () => showMonth(-1),
    nextMonth: () => showMonth(1),
    calendar,
    selectedDate: day?.date ?? null,
    periods,
    period: shownPeriod,
    slot: chosenSlot,
    selectDay,
    selectPeriod,
    selectSlot,
    reload,
  }
}
