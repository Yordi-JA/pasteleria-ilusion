import ChoiceOption from './ChoiceOption.tsx'
import { focusRingWithin } from './focus.ts'

export type FilterChip<T extends string> = { value: T; label: string; checked: boolean }

type FilterChipsProps<T extends string> = {
  /** Qué filtran, para el lector de pantalla: "Tipo de producto". */
  legend: string
  /** Nombre del grupo de radios; uno por pantalla. */
  name: string
  options: FilterChip<T>[]
  onChange: (value: T) => void
  /** Sobre un campo `mermelada` (la vitrina de la portada). */
  onColor?: boolean
  /**
   * Los chips juntos en una sola pieza, sobre el campo de la página (la barra del catálogo, tanda 1): un contenedor `betun`
   * con borde `relieve` y la opción elegida llena de `mermelada`, sin un borde oscuro por chip.
   */
  segmented?: boolean
  className?: string
}

const segment =
  'relative inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-4 text-etiqueta text-mermelada ' +
  'hover:bg-harina has-[:checked]:bg-mermelada has-[:checked]:text-sobre-color has-[:checked]:hover:bg-mermelada-profunda ' +
  'motion-safe:transition-colors motion-safe:duration-150'

/**
 * Filtros de una sola elección (Todo, Pasteles, Postres) como chips de `ChoiceOption`: un grupo de radios con su
 * leyenda, así las flechas del teclado recorren los chips y el lector dice cuál está elegido.
 */
export default function FilterChips<T extends string>({ legend, name, options, onChange, onColor = false, segmented = false, className }: FilterChipsProps<T>) {
  if (segmented) {
    return (
      <fieldset className={className}>
        <legend className="sr-only">{legend}</legend>
        <div className="flex gap-1 rounded-md border border-relieve bg-betun p-[3px]">
          {options.map((option) => (
            <label key={option.value} className={`${segment} ${focusRingWithin}`}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={option.checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    )
  }
  return (
    <fieldset className={className}>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <ChoiceOption
            key={option.value}
            variant="chip"
            onColor={onColor}
            name={name}
            value={option.value}
            label={option.label}
            checked={option.checked}
            onChange={() => onChange(option.value)}
          />
        ))}
      </div>
    </fieldset>
  )
}
