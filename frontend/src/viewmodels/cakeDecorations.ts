import type { CakeDesignOptions, DecorationOption } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import { normalizeHex } from '../models/color.ts'
import { formatPrice } from '../models/money.ts'
import type { CakeDecoration } from '../three/cakeShape.ts'
import type { Choice } from './cakeDesignChoices.ts'
import { colorPhrase } from './colors.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'
import { automaticTones, chosenTones } from './decorationTones.ts'
import { dataColor, piecesFor } from './fillingPieces.ts'

/**
 * La decoración del paso 6 (regla 6.1, D53): cómo se agrupan las opciones, qué dibuja la vista previa con cada una, el
 * color de la duya y de las rosas, y los textos de "Tu pastel". Los precios y la disponibilidad son los de la API;
 * aquí solo se les da forma. Sin React ni three.
 *
 * El identificador de cada opción decide su grupo y su dibujo (el mismo contrato que dice el modelo `DecorationOption`
 * del backend: "la vista previa lo traduce a una forma"). Una opción que esta versión no conoce se ofrece igual, sin
 * dibujo: la vista previa muestra solo la cobertura.
 */

type DecorationKind = CakeDecoration['kind']
export type DecorationGroup = 'none' | 'piping' | 'roses' | 'sprinkles' | 'custom' | 'other'

const KNOWN: Record<string, { group: DecorationGroup; kind: DecorationKind | null }> = {
  ninguna: { group: 'none', kind: null },
  duya: { group: 'piping', kind: 'shells' },
  rosetones: { group: 'piping', kind: 'rosettes' },
  festones: { group: 'piping', kind: 'swags' },
  olanes: { group: 'piping', kind: 'ruffles' },
  // Rosas de duya. El `slug` sigue siendo `flores`: lo conocen los borradores guardados y el contrato con la vista previa.
  flores: { group: 'roses', kind: 'roses' },
  // Tres tipos de chispas (D54): el estilo y los colores salen del sabor o del pan que dice la API, no de aquí.
  chispas: { group: 'sprinkles', kind: 'sprinkles' },
  'chispas-chocolate': { group: 'sprinkles', kind: 'sprinkles' },
  'chispas-choco-vainilla': { group: 'sprinkles', kind: 'sprinkles' },
  otra: { group: 'custom', kind: null },
}

/**
 * Los diseños de duya van agrupados bajo "Patrón con duya", como la opción del mockup, y los tipos de chispas bajo
 * "Chispas". Cada grupo es un radio más de la lista; sus diseños solo se despliegan al elegirlo (D54).
 */
const GROUP_TITLES: Partial<Record<DecorationGroup, { title: string; hint: string }>> = {
  piping: { title: 'Patrón con duya', hint: 'Elige uno de los diseños.' },
  sprinkles: { title: 'Chispas', hint: 'Elige el tipo de chispas.' },
}

/** La duya y las rosas llevan color; las chispas son de colores y las demás no tienen cuál elegir. */
const COLORED_GROUPS: readonly DecorationGroup[] = ['piping', 'roses']

export const groupOf = (slug: string): DecorationGroup => KNOWN[slug]?.group ?? 'other'

/** La decoración elegida, si se puede elegir ahora (tiene precio o no lo necesita). */
export function chosenDecoration(draft: CakeDesignDraft, options: CakeDesignOptions): DecorationOption | null {
  return options.decorations.find((option) => option.slug === draft.decoration) ?? null
}

/** Si la decoración elegida lleva color (duya o rosas). */
export const hasColor = (decoration: DecorationOption | null) => decoration !== null && COLORED_GROUPS.includes(groupOf(decoration.slug))

/** "+$85", "Incluido" o "Por cotizar": lo que va a la derecha de la opción. Sin precio, nada (se dice el motivo). */
function trailing(option: DecorationOption): string | undefined {
  if (option.pricing === 'included') return 'Incluido'
  if (option.requiresQuote) return 'Por cotizar'
  const price = formatPrice(option.price)
  return price ? `+${price}` : undefined
}

export type DecorationGroupView = {
  key: DecorationGroup
  /** El nombre del grupo ("Patrón con duya") si tiene varios diseños; con una sola opción, `null` y va suelta. */
  title: string | null
  hint: string | null
  /** El grupo está elegido: alguno de sus diseños lo está, y entonces se despliegan. */
  checked: boolean
  /** Lo que va a la derecha del grupo cuando todos sus diseños dicen lo mismo ("Incluido"). */
  trailing?: string
  /** El diseño que queda elegido al elegir el grupo: el primero que se puede elegir. `null` si ninguno. */
  first: string | null
  /** Por qué no se puede elegir el grupo (ninguno de sus diseños se puede). */
  disabledReason?: string
  choices: Choice[]
}

/**
 * Las opciones agrupadas, en el orden en que la API las trae (el grupo ocupa el lugar de su primer diseño). Una opción
 * sin precio se ve desactivada con el motivo de la API, "Precio por confirmar" (regla 6.1, D39); nunca desaparece.
 */
export function decorationGroups(draft: CakeDesignDraft, options: CakeDesignOptions): DecorationGroupView[] {
  const groups = new Map<DecorationGroup, Choice[]>()
  for (const option of options.decorations) {
    const choice: Choice = {
      value: option.slug,
      label: option.name,
      description: option.description || undefined,
      trailing: option.available ? trailing(option) : undefined,
      checked: draft.decoration === option.slug,
      disabledReason: option.available ? undefined : (option.unavailableReason ?? 'No disponible'),
    }
    const key = groupOf(option.slug)
    groups.set(key, [...(groups.get(key) ?? []), choice])
  }
  return [...groups].map(([key, choices]) => {
    const titles = choices.length > 1 ? GROUP_TITLES[key] : undefined
    const open = choices.find((choice) => choice.disabledReason === undefined)
    const sameTrailing = new Set(choices.map((choice) => choice.trailing))
    return {
      key,
      title: titles?.title ?? null,
      hint: titles?.hint ?? null,
      checked: choices.some((choice) => choice.checked),
      trailing: sameTrailing.size === 1 ? choices[0].trailing : undefined,
      first: open?.value ?? null,
      disabledReason: open ? undefined : (choices[0].disabledReason ?? 'No disponible'),
      choices,
    }
  })
}

export type DecorationColorView = {
  /** "Automático": los tonos que saldrían de la cobertura, para mostrarlos. */
  automatic: { checked: boolean; swatches: string[] }
  /** "Elegir un color": cualquier color, con el selector libre. */
  pick: { checked: boolean }
  /** El color que muestra el selector: el elegido o, mientras es automático, el tono principal de la cobertura. */
  value: string
  /** Lo que no cambia con el color, por ejemplo las hojas de las rosas. */
  note: string | null
}

/** El color libre elegido (`#rrggbb`); `null` es automático (también un valor que no es un color, de un borrador viejo sin migrar). */
export function pickedColor(draft: CakeDesignDraft): string | null {
  return normalizeHex(draft.decorationColor)
}

/**
 * Con qué color arranca "Elegir un color": el tono principal que ya se veía en automático, así la vista previa no salta al
 * cambiar de modo. `null` si todavía no hay cobertura.
 */
export function defaultPickedColor(coverage: string | null): string | null {
  return coverage ? automaticTones(coverage).main : null
}

/** El selector de color de la duya y de las rosas; `null` si la decoración elegida no lleva color. */
export function decorationColorView(draft: CakeDesignDraft, design: DesignDerived): DecorationColorView | null {
  if (!hasColor(design.decoration) || !design.coverage) return null
  const picked = pickedColor(draft)
  const tones = automaticTones(design.coverage)
  return {
    automatic: { checked: picked === null, swatches: [tones.main, tones.accent] },
    pick: { checked: picked !== null },
    value: picked ?? tones.main,
    note: groupOf(design.decoration?.slug ?? '') === 'roses' ? 'Las hojitas siempre van en verde.' : null,
  }
}

/**
 * Las chispas dibujan lo que la pastelería ya maneja en sus rellenos: el estilo y los colores del sabor o del pan a los
 * que apunta la decoración (`previewFlavor`, `previewBread`). Sin ese dato (o con un sabor o un pan que ya no existe), no
 * se dibujan; nunca se inventa un color.
 */
function sprinklesShape(decoration: DecorationOption, options: CakeDesignOptions): CakeDecoration | null {
  const flavor = decoration.previewFlavor
    ? options.fillingBases.flatMap((base) => base.flavors).find((option) => option.slug === decoration.previewFlavor)
    : undefined
  const bread = decoration.previewBread ? options.breads.find((option) => option.slug === decoration.previewBread) : undefined
  const style = flavor?.previewStyle ?? bread?.includedFillingStyle
  const accent = dataColor(flavor?.previewColorSecondary ?? bread?.includedFillingColorSecondary)
  // Solo se dibujan el granillo y las chispas redondas, que son las chispas de la pastelería; otro estilo no se dibuja.
  if ((style !== 'sprinkles' && style !== 'round_chips') || !accent) return null
  const pieces = piecesFor(style, dataColor(flavor?.previewColor), accent)
  return pieces ? { kind: 'sprinkles', style: pieces.style, colors: pieces.colors } : null
}

/**
 * Lo que la vista previa dibuja sobre la cobertura; `null` si la decoración no se dibuja (sin decoración, "Otra
 * decoración", una opción desconocida) o no hay cobertura. Con duya o rosas, los tonos salen del color de la
 * cobertura (automático) o del color elegido (`decorationTones.ts`). Las chispas usan los de su sabor o su pan.
 */
export function decorationShape(draft: CakeDesignDraft, design: DesignDerived, options: CakeDesignOptions): CakeDecoration | null {
  const decoration = design.decoration
  const cover = design.coverage
  const kind = decoration?.available ? (KNOWN[decoration.slug]?.kind ?? null) : null
  if (!decoration || !cover || !kind) return null
  if (kind === 'sprinkles') return sprinklesShape(decoration, options)
  const picked = pickedColor(draft)
  const tones = picked ? chosenTones(picked) : automaticTones(cover)
  if (kind === 'roses') return { kind, petals: tones.petals, leaf: 'exito' }
  return { kind, main: tones.main, accent: tones.accent }
}

/** El texto de "Tu pastel" para el paso 6: "Borde de conchas, color automático", "Rosas, color lila". */
export function decorationSummary(draft: CakeDesignDraft, design: DesignDerived, options: CakeDesignOptions): { value: string; note?: string } | null {
  const decoration = design.decoration
  if (!decoration) return null
  if (decoration.requiresQuote) return { value: draft.decorationImageName ? `${decoration.name}, ${draft.decorationImageName}` : decoration.name, note: 'Por cotizar' }
  if (!hasColor(decoration)) return { value: decoration.name }
  const picked = pickedColor(draft)
  return { value: `${decoration.name}, color ${picked ? colorPhrase(picked, options.coverageColors) : 'automático'}` }
}

/** Las muestras del color de la decoración: el color elegido o, en automático, los dos tonos que salen de la cobertura. Sin color, ninguna. */
export function decorationSwatches(draft: CakeDesignDraft, design: DesignDerived): string[] | undefined {
  if (!hasColor(design.decoration) || !design.decoration?.available || !design.coverage) return undefined
  const picked = pickedColor(draft)
  if (picked) return [picked]
  const tones = automaticTones(design.coverage)
  return [tones.main, tones.accent]
}
