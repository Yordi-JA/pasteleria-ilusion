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

/**
 * Nombre de una presentación a la venta. El pastel completo lleva el nombre del producto; las demás, el de la
 * presentación seguido del producto: "Rebanada de tres leches de cajeta", "Mini de tres leches de cajeta". El
 * catálogo no tiene un nombre propio por presentación (el mockup dice "Pastel mini de cajeta", que no existe),
 * así que se arma con los dos datos de la API. La inicial del producto baja a minúscula, salvo en una sigla.
 */
export function offeringLabel(productName: string, presentation: OfferingPresentation): string {
  if (presentation === 'whole') return productName
  const [first = '', second = ''] = productName
  const isAcronym = second !== '' && second === second.toLocaleUpperCase('es-MX') && second !== second.toLocaleLowerCase('es-MX')
  const product = isAcronym ? productName : `${first.toLocaleLowerCase('es-MX')}${productName.slice(1)}`
  return `${PRESENTATION_LABELS[presentation]} de ${product}`
}
