import type { CakeDesignOptions, CakeSizeCode, DesignSizeOption } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'

/**
 * Los tamaños de "Diseña tu pastel" (tanda 2 de correcciones): cuál rinde para las personas, cuál vale, lo que un tamaño no admite
 * de lo ya elegido y cómo se nombra. Los umbrales salen de `sizes` de la API (`servings` del mini y de la vitrina, `min_people`
 * por kilos); nunca del código. Funciones puras, sin React.
 */

/** El tamaño de ese código, si la API lo manda. */
export function sizeOption(options: CakeDesignOptions, code: CakeSizeCode): DesignSizeOption | null {
  return options.sizes.find((size) => size.code === code) ?? null
}

/** Las personas desde las que un pedido es por kilos (28): las de la API o, si no las manda, las de los kilos mínimos. */
export function minimumPeople(options: CakeDesignOptions): number {
  return sizeOption(options, 'by_weight')?.minPeople ?? options.limits.minCustomKg * options.limits.peoplePerKg
}

export const isSmall = (code: CakeSizeCode | null): code is 'showcase' | 'mini' => code === 'showcase' || code === 'mini'

/**
 * Los tamaños que se ofrecen para esas personas, solo el que rinde: hasta las del mini, el mini; hasta las de la vitrina, la
 * vitrina; de ahí al mínimo por kilos, la vitrina o hacerlo por kilos con el mínimo; desde el mínimo, por kilos. Sin tamaños en
 * la API (una versión anterior), siempre por kilos.
 *
 * Si el tamaño chico que rinde no está disponible (por ejemplo, su precio quedó PENDIENTE), se ofrece también hacerlo por kilos:
 * la tarjeta no disponible se sigue viendo, desactivada con su motivo, y el paso 1 no se queda sin salida. Un tamaño sin
 * personas definidas (`servings` en `null`) no tiene rango propio: el mini cae en el de la vitrina, y sin las personas de la
 * vitrina se ofrecen la vitrina y por kilos.
 */
export function offeredSizes(people: number, options: CakeDesignOptions): CakeSizeCode[] {
  const mini = sizeOption(options, 'mini')
  const showcase = sizeOption(options, 'showcase')
  if (people >= minimumPeople(options) || (!mini && !showcase)) return ['by_weight']
  const withFallback = (size: DesignSizeOption): CakeSizeCode[] => (size.available ? [size.code] : [size.code, 'by_weight'])
  if (mini?.servings && people <= mini.servings) return withFallback(mini)
  if (showcase?.servings && people <= showcase.servings) return withFallback(showcase)
  return showcase ? ['showcase', 'by_weight'] : ['by_weight']
}

/**
 * El tamaño que vale: el del pastel de vitrina de origen; el único que se puede elegir de los que rinden para esas personas; o
 * el que la persona eligió entre dos disponibles. `null` si hay que elegir.
 */
export function effectiveSize(draft: Pick<CakeDesignDraft, 'people' | 'cakeSize' | 'source'>, options: CakeDesignOptions): CakeSizeCode | null {
  if (draft.source) return 'showcase'
  const offered = offeredSizes(draft.people, options)
  if (offered.length === 1) return offered[0]
  // Uno no disponible se ve, pero no se elige: si solo queda uno que se pueda elegir, ese vale.
  const choosable = offered.filter((code) => code === 'by_weight' ? (sizeOption(options, code)?.available ?? true) : sizeOption(options, code)?.available)
  if (choosable.length === 1) return choosable[0]
  return draft.cakeSize && choosable.includes(draft.cakeSize) ? draft.cakeSize : null
}

/**
 * Cómo se nombra el tamaño en "Tu pastel", la revisión y el carrito, igual que `describe_cake_size` del backend (la etiqueta de
 * los pedidos ya creados, `cake_size_label`): "Pastel de 4 kg, 30 personas", "Pastel mini, ~3 personas" o "Pastel de vitrina,
 * ~19 personas" (sin personas si no se definen).
 */
export function sizeLabel(code: CakeSizeCode, option: Pick<DesignSizeOption, 'name'> | null, kg: number | null, people: number | null): string {
  if (code === 'by_weight') return `Pastel de ${kg} kg, ${people} personas`
  const name = option?.name ?? (code === 'mini' ? 'Pastel mini' : 'Pastel de vitrina')
  return people ? `${name}, ~${people} personas` : name
}

/** Lo ya elegido que el tamaño no admite, con el motivo de la API; `null` en lo que sí admite o no se eligió. */
export type SizeConflicts = { bread: string | null; base: string | null; decoration: string | null; wafer: string | null }

export const NO_CONFLICTS: SizeConflicts = { bread: null, base: null, decoration: null, wafer: null }

export function sizeConflicts(draft: CakeDesignDraft, option: DesignSizeOption | null): SizeConflicts {
  if (!option) return NO_CONFLICTS
  return {
    bread: (draft.bread && option.unavailableBreads[draft.bread]) || null,
    base: (draft.fillingBase && option.unavailableFillingBases[draft.fillingBase]) || null,
    decoration: (draft.decoration && option.unavailableDecorations[draft.decoration]) || null,
    wafer: draft.waferEnabled ? option.waferUnavailableReason : null,
  }
}

export const hasConflicts = (conflicts: SizeConflicts) => Object.values(conflicts).some(Boolean)

/** "Pastel mini" → "pastel mini", para las frases. */
export const sizeName = (option: Pick<DesignSizeOption, 'name'>) => `${option.name.charAt(0).toLowerCase()}${option.name.slice(1)}`

/**
 * El tamaño en palabras de un pastel de vitrina o mini: "Pastel mini, ~3 personas", "Pastel de vitrina, ~19 personas" (las del
 * pastel de origen, si parte de uno). Por kilos o sin tamaño, `null`: se dice con personas y kilos.
 */
export function smallSizeLabel(draft: Pick<CakeDesignDraft, 'source'>, design: Pick<DesignDerived, 'small' | 'cakeSize' | 'sizeOption'>): string | null {
  if (!design.small || !design.cakeSize) return null
  return sizeLabel(design.cakeSize, design.sizeOption, null, draft.source?.servings ?? design.sizeOption?.servings ?? null)
}
