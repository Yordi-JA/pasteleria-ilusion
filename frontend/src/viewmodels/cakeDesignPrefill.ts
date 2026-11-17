import type { CakeDesignOptions } from '../models/cakeDesign.ts'
import { sizeOption } from './cakeSizes.ts'
import { emptyDraft } from '../models/cakeDesignDraft.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import type { ProductDetail } from '../models/catalog.ts'

/**
 * "Personalizar este pastel" (regla 2): la ficha abre "Diseña tu pastel" con `?pastel=<slug>` y el diseñador
 * arranca con el tipo, el pan, la base y el sabor de ese producto ya elegidos (no confirmados: la persona pasa por
 * cada paso, en el orden de la regla 4.1). Desde la tanda 2, un pastel que sale en la vitrina abre con
 * `&tamano=vitrina`: es un pastel de vitrina con su tipo, pan y relleno fijos, y el recorrido empieza en la cobertura. La
 * tarjeta del mini del catálogo abre con `?tamano=mini`. Un enlace viejo, solo con `?pastel=`, sigue como en D59. Funciones
 * puras, sin React.
 */

/** Parámetro de la URL con el `slug` del producto; el diseñador lo lee una vez y lo quita (D59). */
export const PREFILL_PARAM = 'pastel'
/** Parámetro del tamaño con que abre el diseñador (tanda 2): `vitrina` (con `pastel`) o `mini`. */
export const SIZE_PARAM = 'tamano'

export type PrefillSize = 'vitrina' | 'mini'

export function prefillSize(value: string | null): PrefillSize | null {
  return value === 'vitrina' || value === 'mini' ? value : null
}

/** El enlace de "Personalizar este pastel"; `showcase`, si el producto se personaliza como pastel de vitrina. */
export function designPrefillHref(slug: string, showcase = false): string {
  const params = new URLSearchParams({ [PREFILL_PARAM]: slug, ...(showcase ? { [SIZE_PARAM]: 'vitrina' } : {}) })
  return `/pedido/disena?${params.toString()}`
}

/** "Diseña tu pastel mini", desde la tarjeta del mini del catálogo. */
export const MINI_DESIGN_HREF = `/pedido/disena?${new URLSearchParams({ [SIZE_PARAM]: 'mini' }).toString()}`

/** Lo que el diseñador necesita de la ficha. */
export type PrefillProduct = Pick<ProductDetail, 'slug' | 'name' | 'cakeType' | 'bread' | 'fillingBase' | 'fillingFlavor' | 'showcaseDesign' | 'offerings'>

/**
 * Qué parte se eligió y qué parte se ignoró porque ya no está activa o el tipo de pastel no la admite. `relleno` es la
 * base con su sabor; `base` es la base sola, cuando el sabor no se pudo elegir (`sabor`).
 */
export type PrefillPart = 'tipo' | 'pan' | 'relleno' | 'base' | 'sabor'

export type Prefill = {
  draft: CakeDesignDraft
  applied: PrefillPart[]
  ignored: PrefillPart[]
  /**
   * Sin aviso de "Empezaste con…": el pastel de vitrina de origen lo dice su candado en la barra de pasos y el mini, su tarjeta
   * elegida en el paso 1 (tanda 2).
   */
  quiet?: boolean
}

type Restricted = { unavailableReasons: Readonly<Record<string, string>> }

/**
 * El borrador nuevo con lo del producto que sigue vigente en `cake-designs/options`. Respeta el orden de la regla
 * 4.1: sin un tipo activo no se elige pan ni relleno (quedan para su paso), y el pan y el relleno se revisan contra el
 * tipo elegido (un pan que el tipo no admite, como Red velvet fuera de seco, se ignora; regla 4.7). Con un pan de
 * relleno incluido (Choco-pingüino, Red velvet) no se elige relleno. Lo que no aplica se ignora sin romper.
 */
export function prefilledDraft(product: Omit<PrefillProduct, 'slug' | 'showcaseDesign' | 'offerings'>, options: CakeDesignOptions): Prefill {
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

/** Los pasos que un pastel de vitrina de origen ya trae hechos: el tamaño, el tipo, el pan y el relleno. */
const SOURCE_CONFIRMED = [1, 2, 3, 4]

/**
 * El pastel de vitrina de "Personalizar este pastel" (tanda 2): el producto con su tipo, pan y relleno, que no se cambian, ya
 * confirmados hasta el relleno. `null` si no se puede (la API dice que no, el tamaño de vitrina no está disponible o algo del
 * producto ya no está activo): entonces se arma como en D59.
 */
export function showcasePrefill(product: PrefillProduct, options: CakeDesignOptions): Prefill | null {
  const showcase = sizeOption(options, 'showcase')
  if (!product.showcaseDesign?.available || !showcase?.available || !product.bread) return null
  const prefill = prefilledDraft(product, options)
  const complete = prefill.ignored.length === 0 && prefill.applied.includes('tipo') && prefill.applied.includes('pan')
  if (!complete) return null
  const servings = product.offerings.find((offering) => offering.presentation === 'whole')?.servings ?? showcase.servings
  return {
    ...prefill,
    quiet: true,
    draft: {
      ...prefill.draft,
      people: servings ?? prefill.draft.people,
      cakeSize: 'showcase',
      source: { slug: product.slug, name: product.name, servings },
      confirmed: SOURCE_CONFIRMED,
    },
  }
}

/**
 * El mini de la tarjeta del catálogo (tanda 2): el tamaño ya elegido, con las personas que rinde. `null` si no se puede: sin mini
 * en la API, no disponible o sin sus personas (sin ellas no se sabe a cuántas abrirlo). Entonces el diseñador lo avisa y no
 * abre otro tamaño en silencio.
 */
export function miniPrefill(options: CakeDesignOptions): Prefill | null {
  const mini = sizeOption(options, 'mini')
  if (!mini?.available || !mini.servings) return null
  const draft = emptyDraft()
  return { draft: { ...draft, people: mini.servings, cakeSize: 'mini' }, applied: [], ignored: [], quiet: true }
}

/** Si el borrador tiene algo hecho: cualquier cosa distinta del borrador vacío (también un paso sin confirmar). */
export function hasProgress(draft: CakeDesignDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(emptyDraft())
}

/** Si el borrador ya tiene el tipo, el pan y el relleno del producto: no hay nada que preguntar ni que cambiar. */
export function matchesPrefill(draft: CakeDesignDraft, prefill: Prefill): boolean {
  const wanted = prefill.draft
  // El tamaño y el pastel de origen también cuentan (tanda 2): un pastel por kilos del mismo sabor no es el pastel de vitrina.
  if (draft.cakeSize !== wanted.cakeSize || draft.source?.slug !== wanted.source?.slug) return false
  if (wanted.cakeSize === 'mini' && wanted.cakeType === null) return draft.people === wanted.people
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
