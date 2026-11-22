import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'
import Card from '../../components/Card.tsx'
import ChoiceOption from '../../components/ChoiceOption.tsx'
import { focusRing, focusRingWithin } from '../../components/focus.ts'
import LoadErrorNotice from '../../components/LoadErrorNotice.tsx'
import Notice from '../../components/Notice.tsx'
import Skeleton, { LoadingRegion } from '../../components/Skeleton.tsx'
import { formatMonth } from '../../models/dates.ts'
import type { DayCell } from '../../viewmodels/deliverySchedule.ts'
import { dayName, earliestSentence, formatTime, nextFocus } from '../../viewmodels/deliverySchedule.ts'
import type { useDeliveryCalendar } from '../../viewmodels/useDeliveryCalendar.ts'

type Calendar = ReturnType<typeof useDeliveryCalendar>

/** Lo que necesita "Horario": también lo da `useDaySlots`, el día fijo de una cotización (D70). */
export type SlotChoices = Pick<Calendar, 'selectedDate' | 'periods' | 'period' | 'slot' | 'selectPeriod'>

const WEEKDAYS = [
  ['L', 'lunes'],
  ['M', 'martes'],
  ['M', 'miércoles'],
  ['J', 'jueves'],
  ['V', 'viernes'],
  ['S', 'sábado'],
  ['D', 'domingo'],
] as const

const navButton = `inline-flex h-11 w-11 items-center justify-center rounded-sm border border-relieve bg-betun text-mermelada enabled:cursor-pointer enabled:hover:bg-harina disabled:cursor-not-allowed disabled:border-dashed disabled:text-mermelada-suave ${focusRing}`

const DAY_STYLES: Record<DayCell['state'], string> = {
  available: 'cursor-pointer border border-relieve bg-betun font-semibold hover:bg-harina',
  selected: 'cursor-pointer border-2 border-mermelada bg-mermelada font-semibold text-sobre-color',
  full: 'cursor-not-allowed border border-dashed border-relieve bg-harina text-mermelada-suave',
  unavailable: 'cursor-not-allowed text-mermelada-suave line-through',
}

/**
 * Los días del mes como una tabla de botones con tabulador itinerante: un solo día entra con Tab y las flechas mueven el
 * foco entre los que se pueden elegir. La parada de Tab sigue al último día enfocado, así al salir y volver el foco
 * regresa a donde estaba.
 */
function MonthTable({ days, leading, onChoose }: { days: DayCell[]; leading: number; onChoose: (date: string) => void }) {
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  // Estado de presentación: el último día que tuvo el foco.
  const [focused, setFocused] = useState<string | null>(null)
  const choosable = days.filter((day) => day.state === 'available' || day.state === 'selected')
  // El último enfocado si todavía se elige; si no, el elegido o el primero que se puede elegir.
  const tabStop = (choosable.find((day) => day.date === focused) ?? days.find((day) => day.state === 'selected') ?? choosable[0])?.date

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const target = nextFocus(days, date, event.key)
    if (!target) return
    event.preventDefault()
    setFocused(target)
    buttons.current.get(target)?.focus()
  }

  const cells: (DayCell | null)[] = [...Array<null>(leading).fill(null), ...days]
  const weeks: (DayCell | null)[][] = []
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7))

  return (
    <table className="w-full max-w-[350px] table-fixed border-separate border-spacing-1.5">
      <thead>
        <tr>
          {WEEKDAYS.map(([short, name]) => (
            <th key={name} scope="col" className="pb-1 text-nota font-semibold text-mermelada-suave">
              <abbr title={name} className="no-underline">
                {short}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week.find(Boolean)?.date}>
            {week.map((cell, index) =>
              cell ? (
                <td key={cell.date} className="p-0">
                  <button
                    type="button"
                    ref={(element) => {
                      if (element) buttons.current.set(cell.date, element)
                      else buttons.current.delete(cell.date)
                    }}
                    disabled={cell.state === 'full' || cell.state === 'unavailable'}
                    aria-pressed={cell.state === 'selected' || cell.state === 'available' ? cell.state === 'selected' : undefined}
                    aria-label={cell.label}
                    tabIndex={cell.date === tabStop ? 0 : -1}
                    onClick={() => onChoose(cell.date)}
                    onFocus={() => setFocused(cell.date)}
                    onKeyDown={(event) => onKeyDown(event, cell.date)}
                    className={`flex h-11 w-full flex-col items-center justify-center rounded-sm text-nota tabular-nums ${DAY_STYLES[cell.state]} ${focusRing}`}
                  >
                    <span aria-hidden="true">{cell.day}</span>
                    {cell.state === 'full' && (
                      <span aria-hidden="true" className="text-[11px] leading-none">
                        Lleno
                      </span>
                    )}
                  </button>
                </td>
              ) : (
                <td key={`vacio-${index}`} aria-hidden="true" />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** La forma del calendario mientras llega: el mes y sus semanas en bloques, sin datos. */
function CalendarSkeleton() {
  return (
    <div className="grid max-w-[350px] grid-cols-7 gap-1.5">
      {Array.from({ length: 35 }, (_, index) => (
        <Skeleton key={index} radius="sm" className="h-11" />
      ))}
    </div>
  )
}

/** La leyenda del mockup: elegido, lleno y no disponible, cada uno con su palabra. */
function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-nota text-mermelada-suave" aria-label="Qué quiere decir cada día">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-4 w-4 rounded-[4px] bg-mermelada" />
        Elegido
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-4 w-4 rounded-[4px] border border-dashed border-relieve bg-harina" />
        Lleno
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="relative h-4 w-4 overflow-hidden rounded-[4px] border border-relieve">
          <span className="absolute left-1/2 top-[-2px] h-5 w-px origin-center rotate-45 bg-mermelada-suave" />
        </span>
        No disponible
      </li>
    </ul>
  )
}

type DateAndTimeProps = {
  calendar: Calendar
  onChooseDay: (date: string) => void
  onChooseSlot: (startsAt: string) => void
  error?: string
  headingRef: RefObject<HTMLHeadingElement | null>
}

/**
 * "Fecha y hora" (mockup de Entrega): el calendario del mes con "Lleno" y "No disponible", la fecha más cercana y los
 * horarios por mañana, tarde y noche, como chips; un horario lleno se ve y no se elige. Desde la tanda 3 el calendario y los
 * horarios van lado a lado (en una sola columna hasta 600 px), y el título deja aire para la barra fija de arriba.
 */
export default function DateAndTime({ calendar, onChooseDay, onChooseSlot, error, headingRef }: DateAndTimeProps) {
  const loading = calendar.status === 'loading'
  return (
    <section aria-labelledby="fecha-hora" className="flex flex-col gap-4">
      <h2 id="fecha-hora" ref={headingRef} tabIndex={-1} className={`scroll-mt-28 self-start rounded-sm font-display text-titulo-2 ${focusRing}`}>
        Fecha y hora
      </h2>
      <Card large className="flex flex-col gap-5">
        {error && (
          <p className="text-nota font-semibold text-error">
            {error}
          </p>
        )}
        {calendar.errorMessage ? (
          // Un rechazo del carrito (la vitrina de hoy con un diseño): no hay mes que mirar.
          <Notice tone="attention" title="Revisa tu carrito">
            {calendar.errorMessage}
          </Notice>
        ) : (
          <div className="grid grid-cols-[minmax(0,330px)_minmax(0,1fr)] gap-8 max-[600px]:grid-cols-1 max-[600px]:gap-6">
            <div className="flex min-w-0 flex-col gap-3">
              <h3 className="text-etiqueta">Fecha</h3>
              {/* Los controles del mes quedan aunque ese mes no cargue: se puede volver al anterior. */}
              <div className="flex max-w-[350px] items-center justify-between gap-3">
                <button type="button" className={navButton} aria-label="Mes anterior" disabled={!calendar.canGoBack} onClick={calendar.previousMonth}>
                  <CaretLeft size={18} aria-hidden="true" />
                </button>
                <p aria-live="polite" className="font-display text-titulo-3">
                  {formatMonth(calendar.month.year, calendar.month.month)}
                </p>
                <button type="button" className={navButton} aria-label="Mes siguiente" disabled={!calendar.canGoForward} onClick={calendar.nextMonth}>
                  <CaretRight size={18} aria-hidden="true" />
                </button>
              </div>
              {calendar.status === 'error' ? (
                <LoadErrorNotice title="No pudimos cargar las fechas" onRetry={calendar.reload} />
              ) : (
                <>
                  <LoadingRegion loading={loading && !calendar.calendar} label="Cargando las fechas…" skeleton={<CalendarSkeleton />}>
                    <div aria-busy={loading || undefined}>
                      <MonthTable days={calendar.grid.days} leading={calendar.grid.leading} onChoose={onChooseDay} />
                    </div>
                  </LoadingRegion>
                  <Legend />
                  {!loading && (
                    <p className="text-nota text-mermelada-suave">
                      {earliestSentence(calendar.calendar) ?? 'Este mes ya no tiene fechas para tu pedido. Mira el siguiente.'}
                    </p>
                  )}
                </>
              )}
            </div>
            {calendar.status !== 'error' && <SlotPicker calendar={calendar} onChooseSlot={onChooseSlot} layout="beside" />}
          </div>
        )}
      </Card>
    </section>
  )
}

/**
 * Cómo se acomodan los horarios: `beside`, junto al calendario (una columna angosta en escritorio); `full`, a todo lo ancho
 * de la tarjeta (el día fijo de una cotización). En los dos, los periodos son un control segmentado de tres; las horas van en
 * dos columnas junto al calendario y en tres hasta 900 px (tanda 3).
 */
type SlotLayout = 'beside' | 'full'

const SLOT_GRID: Record<SlotLayout, string> = {
  beside: 'grid-cols-2 max-[900px]:grid-cols-3',
  full: 'grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] max-[600px]:grid-cols-3',
}
/**
 * Los chips llenan su celda, centrados y del mismo alto: `ChoiceOption` deja el chip de una línea a su ancho (`items-start`),
 * así que la cuadrícula estira su contenedor y su etiqueta.
 */
const CELLS = '[&>div>label]:flex-1 [&>div>label]:justify-center [&>div]:items-stretch'

// El periodo elegido se marca con el fondo `betun`, el borde `mermelada` y el texto en negritas, no con el relleno `mermelada`
// de la hora elegida: así la única opción llena es la hora, que es lo que se elige (correcciones del 21 de noviembre).
const segmentEnabled =
  'cursor-pointer text-mermelada hover:bg-betun has-[:checked]:border-mermelada has-[:checked]:bg-betun has-[:checked]:font-semibold ' +
  'motion-safe:transition-colors'
const segmentDisabled = 'cursor-not-allowed text-mermelada-suave'

/**
 * Mañana, tarde y noche como un control segmentado de una sola línea (libro de marca, "Horarios": se agrupan para no mostrar
 * todas las horas juntas). Es un filtro de las horas, no otra lista de horarios: no repite el rango de cada periodo, que las
 * horas de abajo ya dicen; el rango queda en el nombre accesible, para quien no ve las horas hasta cambiar de periodo. Un periodo
 * sin horas dice por qué ("Lleno") debajo de su nombre.
 */
function PeriodSegments({ periods, selected, onSelect }: { periods: SlotChoices['periods']; selected: string | null; onSelect: (id: SlotChoices['periods'][number]['id']) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-md border border-relieve bg-harina p-1">
      {periods.map((option) => {
        const disabled = !option.available
        return (
          <label
            key={option.id}
            className={`flex min-h-11 flex-col items-center justify-center rounded-sm border border-transparent px-1 text-center text-etiqueta ${disabled ? segmentDisabled : segmentEnabled} ${focusRingWithin}`}
          >
            <input
              type="radio"
              name="periodo"
              className="sr-only"
              checked={selected === option.id}
              disabled={disabled}
              onChange={() => onSelect(option.id)}
            />
            <span>{option.label}</span>
            <span className="sr-only"> {option.range}</span>
            {disabled && option.disabledReason && <span className="text-[11px] font-normal leading-none">{option.disabledReason}</span>}
          </label>
        )
      })}
    </div>
  )
}

/**
 * "Horario": mañana, tarde y noche como un control segmentado (`PeriodSegments`) y, debajo, las horas del periodo elegido como
 * chips en cuadrícula: una sola lista de horas, la que se elige. El título dice de qué día: "Horario del lunes 16".
 */
export function SlotPicker({
  calendar,
  onChooseSlot,
  layout = 'full',
}: {
  calendar: SlotChoices
  onChooseSlot: (startsAt: string) => void
  layout?: SlotLayout
}) {
  if (!calendar.selectedDate) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-etiqueta">Horario</h3>
        <p className="text-nota text-mermelada-suave">Elige una fecha para ver sus horarios.</p>
      </div>
    )
  }
  const period = calendar.period
  const day = layout === 'beside' ? dayName(calendar.selectedDate) : null
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <fieldset className="flex flex-col">
        <legend className="mb-3 text-etiqueta">{day ? `Horario del ${day}` : 'Horario'}</legend>
        <PeriodSegments periods={calendar.periods} selected={period?.id ?? null} onSelect={calendar.selectPeriod} />
      </fieldset>
      {period && (
        <fieldset>
          <legend className="sr-only">Hora en la {period.label.toLocaleLowerCase('es-MX')}</legend>
          <div className={`grid gap-2 ${SLOT_GRID[layout]} ${CELLS}`}>
            {period.slots.map((slot) => (
              <ChoiceOption
                key={slot.startsAt}
                variant="chip"
                name="horario"
                label={formatTime(slot.startsAt)}
                description={slot.available ? undefined : 'Lleno'}
                checked={calendar.slot?.startsAt === slot.startsAt}
                disabled={!slot.available}
                onChange={() => onChooseSlot(slot.startsAt)}
              />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}
