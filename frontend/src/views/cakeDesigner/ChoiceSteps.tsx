import { Check } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import ChoiceOption from '../../components/ChoiceOption.tsx'
import ColorPicker from '../../components/ColorPicker.tsx'
import { focusRing, focusRingWithin } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import type { BreadGroups, Choice, FillingView } from '../../viewmodels/cakeDesignChoices.ts'

const inlineLink = `rounded-sm font-semibold underline underline-offset-4 ${focusRing}`

/**
 * Las opciones de un paso como renglones de una lista con líneas `relieve`, no como tarjetas dentro de la tarjeta del paso
 * (tanda 3). Cada renglón lleva solo su línea de arriba: lo que sigue (otro encabezado, la línea del pie de la tarjeta)
 * cierra la lista, sin dos líneas seguidas. `columns` reparte los renglones en columnas, cada una con sus líneas.
 */
export function OptionList({ columns = '', children }: { columns?: string; children: ReactNode }) {
  return <div className={`grid gap-x-6 ${columns}`}>{children}</div>
}

type OptionRowsProps = {
  name: string
  choices: Choice[]
  onChoose: (value: string) => void
  type?: 'radio' | 'checkbox'
}

/** Los renglones sueltos, para ponerlos en una `OptionList` junto con otros (los grupos de la decoración). */
export function OptionRows({ name, choices, onChoose, type = 'radio' }: OptionRowsProps) {
  return choices.map((choice) => (
    <ChoiceOption
      key={choice.value}
      variant="row"
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
  ))
}

export function Options({ columns, ...rows }: OptionRowsProps & { columns?: string }) {
  return (
    <OptionList columns={columns}>
      <OptionRows {...rows} />
    </OptionList>
  )
}

/**
 * Un grupo de opciones con su leyenda. `hideLegend`: el título del paso ya lo dice a la vista, así que la leyenda queda solo
 * para el lector de pantalla (tanda 1). `min-w-0`: un `fieldset` crece al ancho de su contenido más largo (un nombre de
 * archivo) y se saldría de la tarjeta.
 */
export function Group({ legend, children, describedBy, hideLegend = false }: { legend: string; children: ReactNode; describedBy?: string; hideLegend?: boolean }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5" aria-describedby={describedBy}>
      <legend className={hideLegend ? 'sr-only' : 'float-left mb-2.5 text-etiqueta'}>{legend}</legend>
      <div className="clear-both flex flex-col gap-2.5">{children}</div>
    </fieldset>
  )
}

type Conflict = { title: string; target: string; alsoFilling: boolean }

/** Paso 2: el tipo de pastel y, si el nuevo invalida algo ya elegido, el aviso antes de continuar (regla 4.7). */
export function CakeTypeStep({
  choices,
  conflict,
  onChoose,
  describedBy,
  legendHidden = false,
}: {
  choices: Choice[]
  conflict: Conflict | null
  onChoose: (value: string) => void
  /** El id del error del campo, cuando el paso vive dentro de un formulario (el envío de referencia). */
  describedBy?: string
  /** En "Diseña tu pastel" el título del paso ya lo dice: la leyenda queda solo para el lector de pantalla. */
  legendHidden?: boolean
}) {
  return (
    <>
      <Group legend="Elige el tipo de pastel" describedBy={describedBy} hideLegend={legendHidden}>
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
export function BreadStep({ groups, onChoose, describedBy, legendHidden = false }: { groups: BreadGroups; onChoose: (value: string) => void; describedBy?: string; legendHidden?: boolean }) {
  return (
    <>
      <Group legend="Elige el pan" describedBy={describedBy} hideLegend={legendHidden}>
        <p className="text-nota font-semibold">Para combinar con un relleno</p>
        <Options name="pan" choices={groups.withFilling} onChoose={onChoose} />
        {groups.fillingIncluded.length > 0 && (
          <>
            <p className="pt-3 text-nota font-semibold">Con relleno incluido: se salta el paso de relleno</p>
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
  /** El id del error del relleno, cuando el paso vive dentro de un formulario (el envío de referencia). */
  describedBy?: string
  legendHidden?: boolean
}

/** Paso 4: la base, uno o dos sabores y los sabores (reglas 4.4 y 4.7). */
export function FillingStep({ view, onBase, onCount, onFlavor, describedBy, legendHidden = false }: FillingStepProps) {
  return (
    <>
      <Group legend="Primero, la base del relleno" describedBy={describedBy} hideLegend={legendHidden}>
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
 * Pocos colores como círculos que se eligen: los dos tonos que combinan del texto del mensaje (paso 7). Son colores de comida
 * calculados de la cobertura, no de la interfaz.
 */
export function ColorGrid({ legend, name, colors, onChoose }: { legend: string; name: string; colors: ColorChoice[]; onChoose: (value: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="float-left mb-2.5 text-etiqueta">{legend}</legend>
      <div className="clear-both grid grid-cols-5 gap-2 max-[600px]:grid-cols-3">
        {colors.map((color) => (
          <label
            key={color.value}
            // El tono elegido se llena de `harina` y lleva la palomita, como los renglones elegidos (D79): el borde sigue suave y
            // el hover subraya el nombre, sin el fondo del elegido.
            className={`relative flex min-h-11 cursor-pointer flex-col items-center gap-2 rounded-md border border-relieve px-1 py-3 text-center text-nota font-semibold hover:underline hover:underline-offset-4 has-[:checked]:bg-harina ${focusRingWithin}`}
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

/**
 * Paso 5: crema pastelera y su color (regla 5). El color es libre, con el selector de color: arranca en el primero de la lista de
 * la pastelería. Por qué se saltó el relleno lo dice el candado del paso 4 en la barra de pasos (tanda 1), no una tarjeta aquí.
 */
export function CoverageStep({
  color,
  onChoose,
}: {
  /** El color de la cobertura (`#rrggbb`); `null` si la pastelería no tiene lista y todavía no se elige. */
  color: string | null
  onChoose: (value: string) => void
}) {
  return (
    <>
      <p className="flex flex-col">
        <span className="text-nota text-mermelada-suave">Cobertura</span>
        <span className="text-cuerpo font-semibold">Crema pastelera</span>
      </p>
      <ColorPicker legend="Elige el color de la cobertura" value={color} onChange={onChoose} />
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

