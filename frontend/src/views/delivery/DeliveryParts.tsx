import { CalendarBlank, CaretDown } from '@phosphor-icons/react'
import { useId } from 'react'
import type { RefObject } from 'react'
import symbol from '../../../../assets/logos/ilusion-simbolo.svg'
import Card from '../../components/Card.tsx'
import ChoiceOption from '../../components/ChoiceOption.tsx'
import { focusRing, inlineLink } from '../../components/focus.ts'
import DirectionsLink from '../../components/DirectionsLink.tsx'
import LinePhoto from '../../components/LinePhoto.tsx'
import Pending from '../../components/Pending.tsx'
import Skeleton from '../../components/Skeleton.tsx'
import TextField from '../../components/TextField.tsx'
import type { CartLineView, CartSummaryView } from '../../viewmodels/cartLines.ts'
import { productsLabel } from '../../viewmodels/cartLines.ts'
import type { StoreDetails } from '../../viewmodels/useStoreInfo.ts'

/**
 * "Forma de entrega": recoger en la pastelería, la única que se elige en línea. A domicilio se ve desactivada y se
 * coordina por WhatsApp (decisión B del usuario, D66): la regla 8 pide dirección y costo por distancia, que todavía no
 * existen (D61), así que gana sobre el mockup.
 */
export function Fulfillment({ store }: { store: StoreDetails }) {
  return (
    <section aria-labelledby="forma-entrega" className="flex flex-col gap-4">
      <h2 id="forma-entrega" className="font-display text-titulo-2">
        Forma de entrega
      </h2>
      <Card large>
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Forma de entrega</legend>
          <ChoiceOption name="entrega" value="pickup" label="Recoger en la pastelería" description="Sin costo." checked onChange={() => {}} />
          <PickupAddress store={store} />
          <ChoiceOption name="entrega" value="delivery" label="Entrega a domicilio" disabled disabledReason="Por ahora la coordinamos por WhatsApp." />
        </fieldset>
        <p className="mt-2 text-nota text-mermelada-suave">
          {store.whatsapp ? (
            <a href={store.whatsapp.url} target="_blank" rel="noopener noreferrer" className={`${inlineLink} font-semibold text-mermelada`}>
              Escribir por WhatsApp para la entrega a domicilio
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          ) : (
            <span>
              WhatsApp para la entrega a domicilio: <Pending what="número" />
            </span>
          )}
        </p>
      </Card>
    </section>
  )
}

/** Dónde se recoge: la dirección con "Cómo llegar" (D71), o su marcador sin enlace si falta (regla 1). */
function PickupAddress({ store }: { store: StoreDetails }) {
  if (store.status === 'loading') return <Skeleton className="h-4 w-64 max-w-full" />
  return (
    <p className="-mt-1 flex flex-wrap items-center gap-x-3 text-nota text-mermelada-suave">
      <span>Recoges en {store.address ?? <Pending what="Dirección" />}</span>
      {store.directionsUrl && (
        <DirectionsLink url={store.directionsUrl} className={`${inlineLink} inline-flex min-h-11 items-center font-semibold text-mermelada`} />
      )}
    </p>
  )
}

/** El enlace de WhatsApp para coordinar la entrega a domicilio, o su marcador si falta el número (regla 1). */
function HomeDeliveryWhatsApp({ store }: { store: StoreDetails }) {
  if (!store.whatsapp) {
    return (
      <span>
        WhatsApp: <Pending what="número" />
      </span>
    )
  }
  return (
    <a href={store.whatsapp.url} target="_blank" rel="noopener noreferrer" className={`${inlineLink} font-semibold text-mermelada`}>
      Escribir por WhatsApp
      <span className="sr-only"> para la entrega a domicilio (se abre en otra pestaña)</span>
    </a>
  )
}

/** Dónde se recoge, en la línea de la franja: la dirección y "Cómo llegar", o su marcador sin enlace (regla 1, D71). */
function StripAddress({ store }: { store: StoreDetails }) {
  if (store.status === 'loading') return <Skeleton className="h-4 w-48 max-w-full" />
  return (
    <span className="text-nota text-mermelada-suave">
      {store.address ?? <Pending what="Dirección" />}
      {store.directionsUrl && (
        <>
          <span aria-hidden="true"> · </span>
          <DirectionsLink url={store.directionsUrl} className={`${inlineLink} font-semibold text-mermelada`} />
        </>
      )}
    </span>
  )
}

/** El punto medio entre los datos de una opción de la franja; el lector de pantalla no lo dice. */
function Dot() {
  return (
    <span aria-hidden="true" className="text-mermelada-suave">
      ·
    </span>
  )
}

/**
 * La forma de entrega como franja compacta arriba de "Fecha y hora" (tanda 3, con el estilo de filas de D79): una caja con
 * línea `relieve` y una fila por opción, de una o dos líneas. Recoger en la pastelería va elegido (radio marcado), sin
 * costo, con la dirección y "Cómo llegar"; a domicilio se ve apagado y desactivado, con su motivo y el WhatsApp (regla 8,
 * D66). Son radios reales con su etiqueta; los enlaces van fuera de ella.
 */
export function FulfillmentStrip({ store }: { store: StoreDetails }) {
  const pickupId = useId()
  const homeId = useId()
  const reasonId = useId()
  return (
    <section aria-label="Forma de entrega">
      <fieldset className="rounded-md border border-relieve bg-betun">
        <legend className="sr-only">Forma de entrega</legend>
        <div className="flex items-start gap-3 px-4 py-2.5">
          <input
            id={pickupId}
            type="radio"
            name="entrega"
            value="pickup"
            checked
            onChange={() => {}}
            className={`mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-mermelada ${focusRing}`}
          />
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <label htmlFor={pickupId} className="cursor-pointer text-cuerpo">
              <span className="font-semibold">Recoger en la pastelería</span> <Dot />{' '}
              <span className="text-nota text-mermelada-suave">Sin costo.</span>
            </label>
            <StripAddress store={store} />
          </div>
        </div>
        <div className="flex items-start gap-3 border-t border-relieve px-4 py-2.5 text-mermelada-suave">
          <input id={homeId} type="radio" name="entrega" value="delivery" disabled aria-describedby={reasonId} className="mt-0.5 h-5 w-5 shrink-0 cursor-not-allowed" />
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <label htmlFor={homeId} className="cursor-not-allowed text-cuerpo font-semibold">
              Entrega a domicilio
            </label>
            <span className="text-nota">
              <span id={reasonId}>Por ahora la coordinamos por WhatsApp.</span> <HomeDeliveryWhatsApp store={store} />
            </span>
          </div>
        </div>
      </fieldset>
    </section>
  )
}

/**
 * Lo elegido en "Fecha y hora", arriba de "¿Quién recoge?" (tanda 3): dónde y cuándo se recoge, con "Cambiar", que regresa a
 * la primera parte.
 */
export function ScheduleRecap({ when, onChange }: { when: string; onChange: () => void }) {
  return (
    <div data-testid="entrega-elegida" className="flex items-center justify-between gap-4 rounded-md border border-relieve bg-betun px-4 py-3 max-[600px]:items-start">
      <p className="flex min-w-0 items-start gap-3">
        <CalendarBlank size={22} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="text-nota text-mermelada-suave">Recoges en la pastelería</span>
          <span className="text-cuerpo font-semibold">{when}</span>
        </span>
      </p>
      <button
        type="button"
        onClick={onChange}
        className={`inline-flex min-h-11 shrink-0 items-center rounded-sm text-etiqueta underline underline-offset-4 ${focusRing}`}
      >
        Cambiar<span className="sr-only"> fecha y hora</span>
      </button>
    </div>
  )
}

type PickupProps = {
  name: string
  phone: string
  onName: (value: string) => void
  onPhone: (value: string) => void
  errors: { pickupName?: string; pickupPhone?: string }
  nameRef: RefObject<HTMLInputElement | null>
  phoneRef: RefObject<HTMLInputElement | null>
  /** El título recibe el foco al llegar a "¿Quién recoge?" en la entrega del carrito (tanda 3). */
  headingRef?: RefObject<HTMLHeadingElement | null>
}

/** "¿Quién recoge?" (decisión A del usuario): el nombre y el teléfono, ya con los de la cuenta. */
export function Pickup({ name, phone, onName, onPhone, errors, nameRef, phoneRef, headingRef }: PickupProps) {
  return (
    <section aria-labelledby="quien-recoge" className="flex flex-col gap-4">
      <h2
        id="quien-recoge"
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className={`self-start rounded-sm font-display text-titulo-2 ${headingRef ? `scroll-mt-28 ${focusRing}` : ''}`}
      >
        ¿Quién recoge?
      </h2>
      <Card large className="grid grid-cols-2 items-start gap-4 max-[600px]:grid-cols-1">
        <TextField
          ref={nameRef}
          label="Nombre"
          placeholder="Ej. Ana López García"
          autoComplete="name"
          maxLength={150}
          value={name}
          onChange={(event) => onName(event.target.value)}
          error={errors.pickupName}
        />
        <TextField
          ref={phoneRef}
          label="Teléfono"
          placeholder="Ej. 55 1234 5678"
          help="10 dígitos. Te llamamos si hay algún detalle."
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={20}
          value={phone}
          onChange={(event) => onPhone(event.target.value)}
          error={errors.pickupPhone}
        />
      </Card>
    </section>
  )
}

/** La entrega en el resumen (tanda 3): la forma y la fecha y hora elegidas ("Por elegir" mientras no hay). */
export type SummaryDelivery = { mode: string; when: string }

type SummaryProps = { lines: CartLineView[]; summary: CartSummaryView; paymentNote: string; delivery: SummaryDelivery }

/**
 * El resumen de la entrega (mockup de Entrega): lo que lleva el pedido y el total estimado. El anticipo y lo que se paga
 * hoy los calcula el servidor al crear el pedido (con el porcentaje del admin), así que aquí van en una frase.
 */
export function DeliverySummary(props: SummaryProps) {
  return (
    <section aria-labelledby="entrega-resumen" className="flex flex-col gap-4 max-[900px]:hidden">
      <h2 id="entrega-resumen" className="font-display text-titulo-2">
        Resumen
      </h2>
      <Card large className="flex flex-col gap-4">
        <SummaryContent {...props} />
      </Card>
    </section>
  )
}

/**
 * En móvil (hasta 900 px) el resumen es un panel que se abre, después de la tarjeta de la parte y antes de la barra
 * (tanda 3): "Resumen del pedido, 2 productos" con el total estimado.
 */
export function SummaryPanel({ title, ...props }: SummaryProps & { title: string }) {
  return (
    <details className="group hidden rounded-md border border-relieve bg-betun max-[900px]:block">
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-4 py-3 [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        <span className="flex flex-col">
          <span className="text-nota text-mermelada-suave">{title}</span>
          <span className="text-cuerpo font-semibold tabular-nums">{props.summary.total ? `${props.summary.total} MXN` : 'Por confirmar'}</span>
        </span>
        <CaretDown size={18} aria-hidden="true" className="shrink-0 motion-safe:transition-transform group-open:rotate-180" />
      </summary>
      {/* Al abrir, el resumen baja 8 px y aparece, como "Tu pastel" en Diseña tu pastel. */}
      <div className="flex flex-col gap-4 px-4 pb-4 motion-safe:group-open:animate-aparece">
        <SummaryContent {...props} />
      </div>
    </details>
  )
}

function SummaryContent({ lines, summary, paymentNote, delivery }: SummaryProps) {
  return (
    <>
      <ul className="flex flex-col border-t border-relieve">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center gap-3 border-b border-relieve py-3">
            <LinePhoto thumbnail={line.thumbnail} placeholder="Foto" className="h-12 w-12" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-cuerpo font-semibold">{line.name}</span>
              <span className="text-nota text-mermelada-suave">{line.brief}</span>
            </span>
            <span className="text-cuerpo font-semibold tabular-nums">{line.total ?? 'Por confirmar'}</span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-3 border-b border-relieve pb-4">
        <div className="flex flex-col">
          <dt className="text-nota text-mermelada-suave">Entrega</dt>
          <dd className="text-cuerpo font-semibold">{delivery.mode}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-nota text-mermelada-suave">Fecha y hora</dt>
          <dd className="text-cuerpo font-semibold">{delivery.when}</dd>
        </div>
      </dl>
      <p className="flex justify-between gap-4 text-cuerpo">
        <span className="text-mermelada-suave">{productsLabel(summary.count)}</span>
        <span className="font-semibold tabular-nums">{summary.total ?? 'Por confirmar'}</span>
      </p>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-relieve pt-4 text-titulo-3">
        <span>Total estimado del pedido</span>
        <span className="tabular-nums">{summary.total ? `${summary.total} MXN` : 'Por confirmar'}</span>
      </p>
      {summary.deposit && (
        <p className="flex justify-between gap-4 text-cuerpo">
          <span className="text-mermelada-suave">Depósito de la base</span>
          <span className="font-semibold tabular-nums">{summary.deposit}</span>
        </p>
      )}
      <p className="text-nota text-mermelada-suave">{paymentNote} El total y lo que pagas hoy los confirmas en el pago.</p>
      {summary.deposit && (
        <div className="flex items-start gap-3 rounded-md bg-harina px-4 py-3.5 text-nota">
          <img src={symbol} alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
          <p>
            <strong className="block font-semibold">Incluye depósito por base</strong>
            Te lo devolvemos al regresar la base.
          </p>
        </div>
      )}
    </>
  )
}
