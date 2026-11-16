/**
 * Los textos del sabor de un envío de referencia (segunda ronda de D70), sin React: los datos de "Lo que nos enviaste" y
 * "Tu referencia", el detalle de la línea de la cotización y del pedido. Los nombres son los de la API; una solicitud de
 * antes del sabor no trae tipo ni pan, y entonces no se dice nada de ellos.
 */
import type { ReferenceFlavor } from '../models/referenceFlavor.ts'
import { lowerFirst } from './cakeDesignChoices.ts'

export type FlavorFact = { label: string; value: string }

/** "fresa y nuez", "durazno, fresa y nuez". */
function joinAnd(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** "Normal de fresa y nuez", "Con queso de zarzamora" o, con un pan de relleno incluido, "Incluido en el pan". */
export function fillingText(flavor: ReferenceFlavor): string | null {
  if (!flavor.breadName) return null
  if (!flavor.fillingBaseName) return 'Incluido en el pan'
  const flavors = joinAnd(flavor.fillingFlavorNames.map(lowerFirst))
  return flavors ? `${flavor.fillingBaseName} de ${flavors}` : flavor.fillingBaseName
}

/** Tipo de pastel, pan y relleno, solo los que la solicitud trae. */
export function flavorFacts(flavor: ReferenceFlavor): FlavorFact[] {
  const facts: FlavorFact[] = []
  if (flavor.cakeTypeLabel) facts.push({ label: 'Tipo de pastel', value: flavor.cakeTypeLabel })
  if (flavor.breadName) facts.push({ label: 'Pan', value: flavor.breadName })
  const filling = fillingText(flavor)
  if (filling) facts.push({ label: 'Relleno', value: filling })
  return facts
}

/** "6 kg, pan de chocolate con relleno normal de fresa y nuez", como el mockup `Cotizacion`; `null` sin pan. */
export function cakeBrief(flavor: ReferenceFlavor): string | null {
  if (!flavor.breadName) return null
  const bread = `pan de ${lowerFirst(flavor.breadName)}`
  const filling = flavor.fillingBaseName
    ? ` con relleno ${lowerFirst(flavor.fillingBaseName)}${flavor.fillingFlavorNames.length ? ` de ${joinAnd(flavor.fillingFlavorNames.map(lowerFirst))}` : ''}`
    : ' con su relleno'
  return `${flavor.kg ? `${flavor.kg} kg, ` : ''}${bread}${filling}`
}

/** "Tipo: Tres leches. Pan: Chocolate. Relleno: Normal de fresa y nuez." para el detalle del pedido; `null` sin datos. */
export function flavorSentence(flavor: ReferenceFlavor): string | null {
  const parts = flavorFacts(flavor).map((fact) => `${fact.label === 'Tipo de pastel' ? 'Tipo' : fact.label}: ${fact.value}.`)
  return parts.length ? parts.join(' ') : null
}
