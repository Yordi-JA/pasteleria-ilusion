import type { CakeDesignOptions } from '../models/cakeDesign.ts'
import { emptyDraft } from '../models/cakeDesignDraft.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import type { ProductDetail } from '../models/catalog.ts'

/**
 * "Personalizar este pastel" (regla 2): la ficha abre "Diseña tu pastel" con `?pastel=<slug>` y el diseñador
 * arranca con el tipo, el pan, la base y el sabor de ese producto ya elegidos (no confirmados: la persona pasa por
 * cada paso, en el orden de la regla 4.1). Funciones puras, sin React.
 */

/** Parámetro de la URL con el `slug` del producto; el diseñador lo lee una vez y lo quita (D59). */
export const PREFILL_PARAM = 'pastel'

export function designPrefillHref(slug: string): string {
  return `/pedido/disena?${new URLSearchParams({ [PREFILL_PARAM]: slug }).toString()}`
}

/** Lo que el diseñador necesita de la ficha. */
export type PrefillProduct = Pick<ProductDetail, 'name' | 'cakeType' | 'bread' | 'fillingBase' | 'fillingFlavor'>

/**
 * Qué parte se eligió y qué parte se ignoró porque ya no está activa o el tipo de pastel no la admite. `relleno` es la
 * base con su sabor; `base` es la base sola, cuando el sabor no se pudo elegir (`sabor`).
 */
export type PrefillPart = 'tipo' | 'pan' | 'relleno' | 'base' | 'sabor'

export type Prefill = {
  draft: CakeDesignDraft
  applied: PrefillPart[]
  ignored: PrefillPart[]
}

type Restricted = { unavailableReasons: Readonly<Record<string, string>> }

/**
 * El borrador nuevo con lo del producto que sigue vigente en `cake-designs/options`. Respeta el orden de la regla
 * 4.1: sin un tipo activo no se elige pan ni relleno (quedan para su paso), y el pan y el relleno se revisan contra el
 * tipo elegido (un pan que el tipo no admite, como Red velvet fuera de seco, se ignora; regla 4.7). Con un pan de
 * relleno incluido (Choco-pingüino, Red velvet) no se elige relleno. Lo que no aplica se ignora sin romper.
 */
export function prefilledDraft(product: PrefillProduct, options: CakeDesignOptions): Prefill {
  const applied: PrefillPart[] = []
  const ignored: PrefillPart[] = []
  const empty: Prefill = { draft: emptyDraft(), applied, ignored }

  const cakeType = options.cakeTypes.find((type) => type.value === product.cakeType)?.value ?? null
  if (!cakeType) {
    if (product.cakeType !== null) ignored.push('tipo')
    return empty
  }
  applied.push('tipo')
  const allowed = (option: Restricted) => !option.unavailableReasons[cakeType]

  const bread = options.breads.find((option) => option.slug === product.bread && allowed(option)) ?? null
  if (bread) applied.push('pan')
  else if (product.bread !== null) ignored.push('pan')
  const included = bread?.pricingMode === 'full_price_per_kg'

  const base = included ? null : (options.fillingBases.find((option) => option.slug === product.fillingBase && allowed(option)) ?? null)
  const flavor = base?.flavors.find((option) => option.slug === product.fillingFlavor && allowed(option)) ?? null
  if (!included) {
    if (base && flavor) applied.push('relleno')
    else if (base) {
      applied.push('base')
      if (product.fillingFlavor !== null) ignored.push('sabor')
    } else if (product.fillingBase !== null || product.fillingFlavor !== null) ignored.push('relleno')
  }

  return {
    draft: {
      ...emptyDraft(),
      cakeType,
      bread: bread?.slug ?? null,
      fillingBase: base?.slug ?? null,
      flavors: base && flavor ? [flavor.slug] : [],
    },
    applied,
    ignored,
  }
}

/** Si el borrador tiene algo hecho: cualquier cosa distinta del borrador vacío (también un paso sin confirmar). */
export function hasProgress(draft: CakeDesignDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(emptyDraft())
}

/** Si el borrador ya tiene el tipo, el pan y el relleno del producto: no hay nada que preguntar ni que cambiar. */
export function matchesPrefill(draft: CakeDesignDraft, prefill: Prefill): boolean {
  const wanted = prefill.draft
  return (
    draft.cakeType === wanted.cakeType &&
    draft.bread === wanted.bread &&
    draft.fillingBase === wanted.fillingBase &&
    JSON.stringify(draft.flavors) === JSON.stringify(wanted.flavors)
  )
}

const PART_NAMES: Record<PrefillPart, string> = {
  tipo: 'el tipo',
  pan: 'el pan',
  relleno: 'el relleno',
  base: 'la base del relleno',
  sabor: 'el sabor',
}

function list(parts: PrefillPart[]): string {
  const names = parts.map((part) => PART_NAMES[part])
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

/**
 * Lo que dice el aviso del prellenado: qué quedó elegido y qué hay que elegir. "Ya elegimos el tipo y la base del
 * relleno; puedes cambiarlo en cada paso. El sabor de Tres leches de fresa ya no está disponible: elígelo en su paso."
 * Sin tipo, solo dice eso: el pan y el relleno se eligen después, en su orden (regla 4.1).
 */
export function prefillSummary(prefill: Prefill, productName: string): string {
  if (prefill.ignored.includes('tipo')) {
    return `El tipo de pastel de ${productName} ya no está disponible: empieza por elegirlo en su paso.`
  }
  const parts: string[] = []
  if (prefill.applied.length > 0) parts.push(`Ya elegimos ${list(prefill.applied)}; puedes cambiarlo en cada paso.`)
  if (prefill.applied.includes('base') && !prefill.ignored.includes('sabor')) parts.push('Elige el sabor en su paso.')
  if (prefill.ignored.length > 0) {
    const plural = prefill.ignored.length > 1
    parts.push(
      `${capitalized(list(prefill.ignored))} de ${productName} ya no ${plural ? 'están disponibles' : 'está disponible'}: ${plural ? 'elígelos' : 'elígelo'} en su paso.`,
    )
  }
  return parts.join(' ')
}
