import type { RefObject } from 'react'
import symbol from '../../../../assets/logos/ilusion-simbolo.svg'
import Card from '../../components/Card.tsx'
import ChoiceOption from '../../components/ChoiceOption.tsx'
import { inlineLink } from '../../components/focus.ts'
import DirectionsLink from '../../components/DirectionsLink.tsx'
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

type PickupProps = {
  name: string
  phone: string
  onName: (value: string) => void
  onPhone: (value: string) => void
  errors: { pickupName?: string; pickupPhone?: string }
  nameRef: RefObject<HTMLInputElement | null>
  phoneRef: RefObject<HTMLInputElement | null>
}

/** "¿Quién recoge?" (decisión A del usuario): el nombre y el teléfono, ya con los de la cuenta. */
export function Pickup({ name, phone, onName, onPhone, errors, nameRef, phoneRef }: PickupProps) {
  return (
    <section aria-labelledby="quien-recoge" className="flex flex-col gap-4">
      <h2 id="quien-recoge" className="font-display text-titulo-2">
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

type SummaryProps = { lines: CartLineView[]; summary: CartSummaryView; paymentNote: string }

/**
 * El resumen de la entrega (mockup de Entrega): lo que lleva el pedido y el total estimado. El anticipo y lo que se paga
 * hoy los calcula el servidor al crear el pedido (con el porcentaje del admin), así que aquí van en una frase.
 */
export function DeliverySummary({ lines, summary, paymentNote }: SummaryProps) {
  return (
    <section aria-labelledby="entrega-resumen" className="flex flex-col gap-4">
      <h2 id="entrega-resumen" className="font-display text-titulo-2">
        Resumen
      </h2>
      <Card large className="flex flex-col gap-4">
        <ul className="flex flex-col border-t border-relieve">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center gap-3 border-b border-relieve py-3">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-harina text-nota text-mermelada-suave">
                Foto
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-cuerpo font-semibold">{line.name}</span>
                <span className="text-nota text-mermelada-suave">{line.brief}</span>
              </span>
              <span className="text-cuerpo font-semibold tabular-nums">{line.total ?? 'Por confirmar'}</span>
            </li>
          ))}
        </ul>
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
      </Card>
    </section>
  )
}
