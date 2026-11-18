import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../models/apiClient.ts'
import { bakeryToday } from '../models/dates.ts'
import { getDeliveryCalendar } from '../models/deliveryCalendar.ts'
import type { CalendarDay, DeliveryCalendar, LineKind } from '../models/deliveryCalendar.ts'
import type { DeliveryChoice } from '../models/deliveryChoice.ts'
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
 *
 * `initial` es lo elegido antes de recargar (tanda 3): abre en su mes, pero no cuenta (`checking`) hasta que la primera
 * respuesta lo confirma. Si esa respuesta no es de su mes, se descarta; si su día o su hora ya no se ofrecen, se suelta y
 * `lost` dice qué se perdió. Un día que ya pasó no se retoma. `choice` es lo elegido ahora, para guardarlo.
 */
export function useDeliveryCalendar(kinds: LineKind[], enabled: boolean, initial: DeliveryChoice | null = null) {
  const kindsKey = kinds.join(',')
  const today = useMemo(() => bakeryToday(), [])
  const firstMonth = useMemo(() => monthOf(today), [today])
  const [restored] = useState(() => (initial && initial.day.date >= today ? initial : null))
  const [month, setMonth] = useState<MonthRef>(() => (restored ? monthOf(restored.day.date) : firstMonth))
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${month.year}-${month.month}|${kindsKey}|${attempt}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // El último día que se reserva, de la última respuesta buena: "Mes siguiente" sigue sirviendo si un mes no carga.
  const [latestDate, setLatestDate] = useState<string | null>(null)
  // El día elegido tal como estaba al elegirlo: sigue elegido aunque se vea otro mes.
  const [selected, setSelected] = useState<CalendarDay | null>(restored?.day ?? null)
  const [period, setPeriod] = useState<PeriodId | null>((restored?.period as PeriodId | null | undefined) ?? null)
  const [slot, setSlot] = useState<string | null>(restored?.slot ?? null)
  // Lo traído de una recarga no vale hasta que una respuesta de la API lo confirma.
  const [checked, setChecked] = useState(restored === null)
  // Lo restaurado que la API ya no ofrece: su día o su hora. La pantalla lo dice hasta que se elige otra cosa.
  const [lost, setLost] = useState<'day' | 'slot' | null>(null)
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

  // Lo elegido vale mientras la API lo siga ofreciendo. Cada respuesta que trae su día lo reemplaza por el de la respuesta;
  // si el día ya no se elige, se suelta de verdad (no vuelve al ver otro mes), y si su hora ya no se elige, se suelta la
  // hora. Se ajusta durante el render, así ningún efecto ni el salto de mes alcanza a usar lo de antes. Lo restaurado que la
  // primera respuesta no trae (otro mes) se descarta: nunca se usa sin revisar.
  if (calendar && selected) {
    const fresh = calendar.days.find((candidate) => candidate.date === selected.date)
    if (!fresh) {
      if (!checked) {
        setSelected(null)
        setPeriod(null)
        setSlot(null)
        setChecked(true)
      }
    } else if (!fresh.available) {
      setSelected(null)
      setPeriod(null)
      setSlot(null)
      if (!checked) {
        setLost('day')
        setChecked(true)
      }
    } else if (fresh !== selected || !checked) {
      setSelected(fresh)
      if (slot !== null && !fresh.slots.some((candidate) => candidate.startsAt === slot && candidate.available)) {
        setSlot(null)
        if (!checked) setLost('slot')
      }
      setChecked(true)
    }
  }
  const day = checked ? selected : null
  const periods = useMemo(() => (day ? slotPeriods(day.slots) : []), [day])
  const shownPeriod = periods.find((candidate) => candidate.id === period && candidate.available) ?? periods.find((candidate) => candidate.available) ?? null
  const chosenSlot = shownPeriod?.slots.find((candidate) => candidate.startsAt === slot && candidate.available) ?? null
  // Lo restaurado sin revisar se guarda tal cual: una recarga mientras llega la respuesta no lo pierde.
  const choice = useMemo<DeliveryChoice | null>(() => {
    if (!checked) return selected ? { day: selected, period, slot } : null
    return day ? { day, period: shownPeriod?.id ?? null, slot: chosenSlot?.startsAt ?? null } : null
  }, [checked, chosenSlot?.startsAt, day, period, selected, shownPeriod?.id, slot])
  const grid = useMemo(() => monthGrid(month, calendar && sameMonth(monthOf(calendar.start), month) ? calendar : null, day?.date ?? null), [calendar, day, month])

  const selectDay = useCallback(
    (date: string) => {
      setSelected(calendar?.days.find((candidate) => candidate.date === date && candidate.available) ?? null)
      setPeriod(null)
      setSlot(null)
      setChecked(true)
      setLost(null)
    },
    [calendar],
  )
  const selectPeriod = useCallback((id: PeriodId) => {
    setPeriod(id)
    setSlot(null)
    setLost(null)
  }, [])
  const selectSlot = useCallback((startsAt: string) => {
    setSlot(startsAt)
    setLost(null)
  }, [])
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
    choice,
    /** Hay una elección restaurada esperando la respuesta de la API: todavía no se puede usar. */
    checking: !checked && selected !== null && status !== 'error',
    lost,
    periods,
    period: shownPeriod,
    slot: chosenSlot,
    selectDay,
    selectPeriod,
    selectSlot,
    reload,
  }
}
