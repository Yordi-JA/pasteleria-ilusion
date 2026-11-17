import { Minus, Plus } from '@phosphor-icons/react'
import { Link } from 'react-router'
import ChoiceOption from '../../components/ChoiceOption.tsx'
import { focusRing } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import { WhatsAppWritePending } from '../../components/StoreText.tsx'
import type { CakeSizeCode } from '../../models/cakeDesign.ts'
import type { CakeForm } from '../../models/cakeDesignDraft.ts'
import type { DesignerView } from '../../viewmodels/cakeDesignSummary.ts'
import type { StoreDetails } from '../../viewmodels/useStoreInfo.ts'

const FORMS: { value: CakeForm; label: string; description: string }[] = [
  { value: 'round', label: 'Redondo', description: 'Molde redondo' },
  { value: 'rectangular', label: 'Rectangular', description: 'Molde rectangular' },
]

const inlineLink = `rounded-sm font-semibold underline underline-offset-4 ${focusRing}`

const stepperButton = `flex h-full w-12 items-center justify-center rounded-sm hover:bg-fresa-claro disabled:cursor-not-allowed disabled:text-mermelada-suave ${focusRing}`

type SizeStepProps = {
  view: DesignerView['sizeStep']
  people: number
  form: CakeForm
  peopleText: string
  whatsapp: StoreDetails['whatsapp'] | undefined
  onPeople: (people: number) => void
  onTypePeople: (text: string) => void
  onSettlePeople: () => void
  onForm: (form: CakeForm) => void
  onTiers: (tiers: number) => void
  /** Entre dos tamaños que rinden (tanda 2): el pastel de vitrina o hacerlo por kilos. */
  onSize: (size: CakeSizeCode) => void
  /** Con un pastel de vitrina de origen: empezar uno desde el principio, para cambiar su tipo, pan o relleno. */
  onRestart: () => void
  /** Enter en las personas continúa, como en un formulario. */
  onSubmit: () => void
}

type View = DesignerView['sizeStep']

/** Los tamaños que rinden para las personas (tanda 2): tarjetas con nombre, personas y "Desde $X"; uno no disponible, desactivado. */
function Sizes({ sizes, onSize }: { sizes: NonNullable<View['sizes']>; onSize: (size: CakeSizeCode) => void }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="float-left mb-2.5 text-etiqueta">Tamaño</legend>
      <div className="clear-both grid grid-cols-1 gap-2">
        {sizes.map((size) => (
          <ChoiceOption
            key={size.value}
            name="tamano"
            value={size.value}
            label={size.label}
            description={size.description}
            trailing={size.trailing}
            checked={size.checked}
            disabled={size.disabledReason !== undefined}
            disabledReason={size.disabledReason}
            onChange={() => onSize(size.value)}
          />
        ))}
      </div>
    </fieldset>
  )
}

/** Lo ya elegido que el tamaño no admite (tanda 2, como el cambio de tipo de la regla 4.7): se avisa antes de continuar. */
function SizeConflict({ conflict }: { conflict: NonNullable<View['sizeConflict']> }) {
  return (
    <Notice tone="attention" title={conflict.title}>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {conflict.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-2">Si continúas, te pediremos cambiarlo. Lo demás se conserva.</p>
    </Notice>
  )
}

/** El pastel de vitrina de "Personalizar este pastel": fijo, sin personas, con la salida para armar uno desde el principio. */
function SourceSize({ view, onRestart }: { view: View; onRestart: () => void }) {
  return (
    <>
      {view.sizes && <Sizes sizes={view.sizes} onSize={() => undefined} />}
      <p className="text-nota">
        ¿Quieres cambiar el tipo, el pan o el relleno?{' '}
        <button type="button" onClick={onRestart} className={`min-h-11 ${inlineLink}`}>
          Arma tu pastel desde el principio
        </button>
      </p>
    </>
  )
}

/** Paso 1: personas, kilos (los calcula la API), forma y pisos (regla 3). */
export default function SizeStep({
  view,
  people,
  form,
  peopleText,
  whatsapp,
  onPeople,
  onTypePeople,
  onSettlePeople,
  onForm,
  onTiers,
  onSize,
  onRestart,
  onSubmit,
}: SizeStepProps) {
  if (view.source) return <SourceSize view={view} onRestart={onRestart} />
  return (
    <>
      <div className="flex flex-col gap-2">
        <label htmlFor="personas" className="text-etiqueta">
          ¿Para cuántas personas?
        </label>
        <div className="flex h-12 w-[176px] items-center justify-between rounded-md border border-mermelada-suave bg-harina">
          <button type="button" className={stepperButton} onClick={() => onPeople(people - 1)} disabled={people <= 1}>
            <Minus size={18} aria-hidden="true" />
            <span className="sr-only">Una persona menos</span>
          </button>
          <input
            id="personas"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={peopleText}
            onChange={(event) => onTypePeople(event.target.value)}
            onBlur={onSettlePeople}
            onKeyDown={(event) => {
              // Mantener Enter presionado no continúa varias veces.
              if (event.key === 'Enter' && !event.repeat) onSubmit()
            }}
            className={`h-10 w-16 rounded-sm bg-transparent text-center text-titulo-3 tabular-nums ${focusRing}`}
          />
          <button type="button" className={stepperButton} onClick={() => onPeople(people + 1)}>
            <Plus size={18} aria-hidden="true" />
            <span className="sr-only">Una persona más</span>
          </button>
        </div>
      </div>

      {view.showKilos && (
        <div className="flex flex-col gap-1 rounded-md bg-harina px-4 py-3.5">
          {/* Los kilos de antes se quedan, tenues, mientras la API calcula los nuevos. */}
          <p
            aria-live="polite"
            aria-busy={view.kgStale || undefined}
            data-testid="kilos"
            className={`text-titulo-3 motion-safe:transition-opacity motion-safe:duration-150 ${view.kgStale ? 'opacity-60' : ''}`}
          >
            {view.kgLine}
          </p>
        </div>
      )}

      {view.sizes && <Sizes sizes={view.sizes} onSize={onSize} />}
      {view.sizeConflict && <SizeConflict conflict={view.sizeConflict} />}
      {view.tooLarge && (
        <Notice tone="attention" title={view.tooLarge.title}>
          <p>{view.tooLarge.body}</p>
          <p className="mt-2 font-semibold">
            {whatsapp ? (
              <a href={whatsapp.url} target="_blank" rel="noopener noreferrer" className={inlineLink}>
                Escribir por WhatsApp
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            ) : (
              <WhatsAppWritePending />
            )}
          </p>
        </Notice>
      )}

      {view.showShape && (
        <>
          <fieldset className="flex flex-col gap-2.5 border-t border-relieve pt-5">
            <legend className="float-left mb-2.5 text-etiqueta">Forma</legend>
            <div className="clear-both grid grid-cols-2 gap-2 max-[600px]:grid-cols-1">
              {FORMS.map((option) => (
                <ChoiceOption
                  key={option.value}
                  name="forma"
                  value={option.value}
                  label={option.label}
                  description={option.description}
                  checked={form === option.value}
                  onChange={() => onForm(option.value)}
                />
              ))}
            </div>
            <p className="text-nota">
              ¿Otra forma?{' '}
              <Link to="/pedido/referencia" className={inlineLink}>
                Envía una referencia
              </Link>
              .
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="float-left mb-2.5 text-etiqueta">Pisos</legend>
            <div className="clear-both grid grid-cols-[repeat(3,minmax(0,112px))] gap-2 max-[600px]:grid-cols-[minmax(0,168px)]">
              {view.tiers.map((tier) => (
                <ChoiceOption
                  key={tier.value}
                  variant="chip"
                  name="pisos"
                  value={tier.value}
                  label={tier.label}
                  description={tier.description}
                  checked={tier.checked}
                  disabled={tier.disabled}
                  onChange={() => onTiers(tier.value)}
                />
              ))}
            </div>
          </fieldset>
        </>
      )}

      {view.tierNotice && <Notice title={view.tierNotice} />}
    </>
  )
}
