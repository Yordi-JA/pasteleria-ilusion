/** Código de la presentación a la venta, como lo manda la API (`Presentation` en `backend/core_pasteleria/models.py`). */
export type OfferingPresentation = 'whole' | 'large' | 'mini' | 'slice' | 'individual' | 'cup'

/** Nombre de cada presentación en la interfaz, tomado de las `choices` de `Presentation`. */
export const PRESENTATION_LABELS: Record<OfferingPresentation, string> = {
  whole: 'Completo',
  large: 'Grande',
  mini: 'Mini',
  slice: 'Rebanada',
  individual: 'Individual',
  cup: 'Vaso',
}

const CODES = new Set<string>(Object.keys(PRESENTATION_LABELS))

export function isOfferingPresentation(value: unknown): value is OfferingPresentation {
  return typeof value === 'string' && CODES.has(value)
}
