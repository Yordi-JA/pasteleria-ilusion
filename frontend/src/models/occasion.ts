/**
 * La ocasión del pastel (regla 6.4): se pregunta en la revisión, es opcional y no cambia el precio; le sirve a la
 * pastelería para preparar el pastel. Los códigos van en inglés (D29) y la interfaz muestra la etiqueta.
 */
export const OCCASIONS = [
  { value: 'birthday', label: 'Cumpleaños' },
  { value: 'wedding', label: 'Boda' },
  { value: 'quinceanera', label: 'XV años' },
  { value: 'baptism', label: 'Bautizo' },
  { value: 'first_communion', label: 'Primera comunión' },
  { value: 'baby_shower', label: 'Baby shower' },
  { value: 'graduation', label: 'Graduación' },
  { value: 'anniversary', label: 'Aniversario' },
  { value: 'other', label: 'Otra' },
] as const

export type Occasion = (typeof OCCASIONS)[number]['value']

export function parseOccasion(value: unknown): Occasion | null {
  return OCCASIONS.find((occasion) => occasion.value === value)?.value ?? null
}

export function occasionLabel(value: Occasion | null): string | null {
  return OCCASIONS.find((occasion) => occasion.value === value)?.label ?? null
}
