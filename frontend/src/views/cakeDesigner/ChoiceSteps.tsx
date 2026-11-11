import { Check, LockSimple } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import ChoiceOption from '../../components/ChoiceOption.tsx'
import { focusRing, focusRingWithin } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import type { BreadGroups, Choice, FillingView } from '../../viewmodels/cakeDesignChoices.ts'

const inlineLink = `rounded-sm font-semibold underline underline-offset-4 ${focusRing}`

export function Options({ name, choices, onChoose, type = 'radio', columns = '' }: {
  name: string
  choices: Choice[]
  onChoose: (value: string) => void
  type?: 'radio' | 'checkbox'
  columns?: string
}) {
  return (
    <div className={`grid gap-2 ${columns}`}>
      {choices.map((choice) => (
        <ChoiceOption
          key={choice.value}
          type={type}
          name={name}
          value={choice.value}
          label={choice.label}
          description={choice.description}
          trailing={choice.trailing}
          checked={choice.checked}
          disabled={choice.disabledReason !== undefined}
          disabledReason={choice.disabledReason || undefined}
          onChange={() => onChoose(choice.value)}
        />
      ))}
    </div>
  )
}

export function Group({ legend, children, describedBy }: { legend: string; children: ReactNode; describedBy?: string }) {
  return (
    <fieldset className="flex flex-col gap-2.5" aria-describedby={describedBy}>
      <legend className="float-left mb-2.5 text-etiqueta">{legend}</legend>
      <div className="clear-both flex flex-col gap-2.5">{children}</div>
    </fieldset>
  )
}

type Conflict = { title: string; target: string; alsoFilling: boolean }

/** Paso 2: el tipo de pastel y, si el nuevo invalida algo ya elegido, el aviso antes de continuar (regla 4.7). */
export function CakeTypeStep({ choices, conflict, onChoose }: { choices: Choice[]; conflict: Conflict | null; onChoose: (value: string) => void }) {
  return (
    <>
      <Group legend="Elige el tipo de pastel">
        <Options name="tipo" choices={choices} onChoose={onChoose} />
      </Group>
      {conflict && (
        <Notice tone="attention" title={conflict.title}>
          <p>
            Si continúas, te pediremos elegir otro {conflict.target}
            {conflict.alsoFilling ? ' y un relleno' : ''}. Lo demás se conserva.
          </p>
        </Notice>
      )}
    </>
  )
}

/** Paso 3: el pan, con el grupo aparte de los que traen su relleno (regla 4.3). */
export function BreadStep({ groups, onChoose }: { groups: BreadGroups; onChoose: (value: string) => void }) {
  return (
    <>
      <Group legend="Elige el pan">
        <p className="text-nota font-semibold">Para combinar con un relleno</p>
        <Options name="pan" choices={groups.withFilling} onChoose={onChoose} />
        {groups.fillingIncluded.length > 0 && (
          <>
            <p className="pt-2 text-nota font-semibold">Con relleno incluido: se salta el paso de relleno</p>
            <Options name="pan" choices={groups.fillingIncluded} onChoose={onChoose} />
          </>
        )}
      </Group>
      <p className="text-nota">{groups.hint ?? 'El precio final depende del relleno.'}</p>
    </>
  )
}

type FillingStepProps = {
  view: FillingView
  onBase: (value: string) => void
  onCount: (count: 1 | 2) => void
  onFlavor: (value: string) => void
}

/** Paso 4: la base, uno o dos sabores y los sabores (reglas 4.4 y 4.7). */
export function FillingStep({ view, onBase, onCount, onFlavor }: FillingStepProps) {
  return (
    <>
      <Group legend="Primero, la base del relleno">
        <Options name="base" choices={view.bases} onChoose={onBase} columns="grid-cols-3 max-[600px]:grid-cols-1" />
      </Group>
      {view.countChoice && (
        <Group legend="¿Uno o dos sabores?">
          <Options
            name="sabores"
            choices={[view.countChoice.one, view.countChoice.two]}
            onChoose={(value) => onCount(value === '2' ? 2 : 1)}
            columns="grid-cols-2 max-[600px]:grid-cols-1"
          />
        </Group>
      )}
      {view.showFlavors && (
        <Group legend={view.flavorsHeading} describedBy={view.counter ? 'contador-sabores' : undefined}>
          {view.counter && (
            <p id="contador-sabores" role="status" className="text-nota font-semibold">
              {view.counter}
            </p>
          )}
          <Options
            name="sabor"
            type={view.multiple ? 'checkbox' : 'radio'}
            choices={view.flavors}
            onChoose={onFlavor}
            columns="grid-cols-2 max-[600px]:grid-cols-1"
          />
        </Group>
      )}
      {view.note && <p className="text-nota">{view.note}</p>}
    </>
  )
}

export type ColorChoice = { value: string; label: string; color: string; checked: boolean }

/**
 * Los colores de la cobertura como círculos que se eligen (regla 5): los usa el paso 5 y, con otro `name`, el color de la
 * decoración (paso 6). El color es el que la pastelería guarda en el admin para la vista previa: es comida, no interfaz.
 */
export function ColorGrid({ legend, name, colors, onChoose }: { legend: string; name: string; colors: ColorChoice[]; onChoose: (value: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="float-left mb-2.5 text-etiqueta">{legend}</legend>
      <div className="clear-both grid grid-cols-5 gap-2 max-[600px]:grid-cols-3">
        {colors.map((color) => (
          <label
            key={color.value}
            className={`relative flex min-h-11 cursor-pointer flex-col items-center gap-2 rounded-md border px-1 py-3 text-center text-nota font-semibold hover:bg-harina has-[:checked]:border-2 has-[:checked]:border-mermelada has-[:checked]:px-[3px] has-[:checked]:py-[11px] ${color.checked ? '' : 'border-relieve'} ${focusRingWithin}`}
          >
            <input
              type="radio"
              name={name}
              value={color.value}
              checked={color.checked}
              onChange={() => onChoose(color.value)}
              className="sr-only"
            />
            <span aria-hidden="true" className="h-8 w-8 rounded-full border border-relieve" style={{ backgroundColor: color.color }} />
            {color.label}
            {color.checked && (
              <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-mermelada text-sobre-color">
                <Check size={12} weight="bold" />
              </span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Paso 5: crema pastelera y su color (regla 5). Con el relleno incluido, primero dice por qué se saltó el paso 4. */
export function CoverageStep({
  colors,
  includedFilling,
  onChoose,
}: {
  colors: ColorChoice[]
  includedFilling: { bread: string; filling: string } | null
  onChoose: (value: string) => void
}) {
  return (
    <>
      {includedFilling && (
        <p className="flex items-start gap-2.5 rounded-md bg-harina px-4 py-3 text-nota">
          <LockSimple size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            Tu pan <strong className="font-semibold">{includedFilling.bread}</strong> ya trae su relleno de{' '}
            {includedFilling.filling}, así que seguimos con la cobertura.
          </span>
        </p>
      )}
      <div className="flex items-center justify-between gap-4 rounded-md bg-harina px-4 py-3">
        <p className="flex flex-col">
          <span className="text-nota text-mermelada-suave">Cobertura</span>
          <span className="text-cuerpo font-semibold">Crema pastelera</span>
        </p>
        <p className="text-nota text-mermelada-suave">La única que manejamos</p>
      </div>
      <ColorGrid legend="Elige el color" name="color" colors={colors} onChoose={onChoose} />
      <p className="text-nota">
        ¿Varios colores o un diseño específico?{' '}
        <Link to="/pedido/referencia" className={inlineLink}>
          Envía una referencia
        </Link>
        .
      </p>
    </>
  )
}

/** Pasos 7 y 8: llegan en la tanda siguiente. Mientras tanto lo dicen, sin datos inventados, y no se pueden confirmar. */
export function UpcomingStep() {
  return <p className="text-cuerpo">Este paso está en construcción.</p>
}
