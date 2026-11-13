import ChoiceOption from './ChoiceOption.tsx'

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
}

/**
 * Filtros de una sola elección (Todo, Pasteles, Postres) como chips de `ChoiceOption`: un grupo de radios con su
 * leyenda, así las flechas del teclado recorren los chips y el lector dice cuál está elegido.
 */
export default function FilterChips<T extends string>({ legend, name, options, onChange, onColor = false }: FilterChipsProps<T>) {
  return (
    <fieldset>
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
