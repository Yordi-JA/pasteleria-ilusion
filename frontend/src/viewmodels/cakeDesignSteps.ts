import { recommendedTiers } from '../models/cakeDesign.ts'
import type {
  BreadOption,
  CakeDesignOptions,
  CakeTypeOption,
  CoverageColorOption,
  FillingBaseOption,
  FillingFlavorOption,
  PeopleSize,
  UnavailableCode,
} from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'

/**
 * Pasos de "Diseña tu pastel" y lo que se deriva del borrador con las opciones y el tamaño que calculó la API:
 * conflictos, validez, avance, el mensaje de lo que falta y el cambio de borrador al continuar. Funciones puras, sin
 * React: el view-model las combina. Los kilos nunca se calculan aquí (regla 3.1, en el backend).
 */

export const DESIGN_STEPS = [
  { short: 'Tamaño', title: 'Tamaño y forma' },
  { short: 'Tipo', title: 'Tipo de pastel' },
  { short: 'Pan', title: 'Pan' },
  { short: 'Relleno', title: 'Relleno' },
  { short: 'Cobertura', title: 'Cobertura' },
  { short: 'Decoración', title: 'Decoración' },
  { short: 'Mensaje', title: 'Mensaje y oblea' },
  { short: 'Revisión', title: 'Revisión' },
] as const

export const STEP_COUNT = DESIGN_STEPS.length
export const FILLING_STEP = 4
/** Último paso que esta versión arma; del 6 en adelante llegan en las tandas 2 y 3. */
export const LAST_BUILT_STEP = 5

/** Una opción elegida que el tipo de pastel ya no admite: nombre, motivo y código de la API. */
export type Issue = { name: string; reason: string; code: UnavailableCode | null; allowedCakeTypes: string[] }

/** El tamaño que calculó la API y si corresponde a las personas de ahora (`current`) o a las de antes. */
export type DesignSize = PeopleSize & { current: boolean }

export type DesignDerived = {
  /** `null` mientras la API no responde ningún tamaño. */
  size: DesignSize | null
  /** Kilos del pedido según la API; `null` sin tamaño. */
  kg: number | null
  belowMinimum: boolean
  aboveMaximum: boolean
  maxTiers: number
  /** Pisos que la pastelería recomienda para los kilos. */
  suggestedTiers: number
  /** Los pisos elegidos piden más kilos: el mínimo recomendado de ese número de pisos. */
  tierShortfall: { tiers: number; minKg: number } | null
  cakeType: CakeTypeOption | null
  bread: BreadOption | null
  breadIssue: Issue | null
  /** El pan elegido (y válido) trae su relleno: el paso 4 queda "Incluido". */
  fillingIncluded: boolean
  base: FillingBaseOption | null
  flavors: FillingFlavorOption[]
  fillingIssue: Issue | null
  /** Sabores que pide el modo elegido: 1, o 2 con una base que los admite. */
  flavorsNeeded: number
  coverage: CoverageColorOption | null
  /** Si los datos de cada paso (1 a 8) están completos y son válidos. */
  valid: boolean[]
}

type Restricted = { name: string; unavailableReasons: Readonly<Record<string, string>>; unavailableCodes: Readonly<Record<string, UnavailableCode>>; allowedCakeTypes: string[] }

function issueIn(option: Restricted, cakeType: string | null): Issue | null {
  const reason = cakeType ? option.unavailableReasons[cakeType] : undefined
  if (!cakeType || !reason) return null
  return { name: option.name, reason, code: option.unavailableCodes[cakeType] ?? null, allowedCakeTypes: option.allowedCakeTypes }
}

/** Sabores de la base que se pueden elegir en el tipo de pastel (los demás se muestran desactivados). */
export function choosableFlavors(base: FillingBaseOption | null, cakeType: string | null): FillingFlavorOption[] {
  return (base?.flavors ?? []).filter((flavor) => !cakeType || !flavor.unavailableReasons[cakeType])
}

export function deriveDesign(draft: CakeDesignDraft, options: CakeDesignOptions, apiSize: PeopleSize | null): DesignDerived {
  const { tierRecommendations } = options
  const size = apiSize ? { ...apiSize, current: apiSize.people === draft.people } : null
  const kg = size?.kg ?? null
  const maxTiers = tierRecommendations.length
  const tierMin = tierRecommendations.find((tier) => tier.tiers === draft.tiers)?.minKg ?? 0

  const cakeType = options.cakeTypes.find((type) => type.value === draft.cakeType) ?? null
  const typeValue = cakeType?.value ?? null
  const bread = options.breads.find((option) => option.slug === draft.bread) ?? null
  const breadIssue = bread ? issueIn(bread, typeValue) : null
  const breadValid = Boolean(cakeType && bread && !breadIssue)
  const fillingIncluded = breadValid && bread?.pricingMode === 'full_price_per_kg'

  const base = options.fillingBases.find((option) => option.slug === draft.fillingBase) ?? null
  const flavors = base ? draft.flavors.flatMap((slug) => base.flavors.filter((flavor) => flavor.slug === slug)) : []
  const flavorsNeeded = base && base.maxFlavors >= 2 && draft.flavorCount === 2 ? 2 : 1
  const fillingIssue = base ? (issueIn(base, typeValue) ?? flavors.map((flavor) => issueIn(flavor, typeValue)).find(Boolean) ?? null) : null

  const coverage = options.coverageColors.find((option) => option.slug === draft.coverageColor) ?? null
  // Arriba del máximo solo cuenta lo que la API dijo de las personas de ahora.
  const aboveMaximum = Boolean(size?.current && size.aboveMaximum)
  const design: DesignDerived = {
    size,
    kg,
    belowMinimum: Boolean(size?.belowMinimum),
    aboveMaximum,
    maxTiers,
    suggestedTiers: kg === null ? 1 : Math.min(recommendedTiers(kg, tierRecommendations), maxTiers),
    tierShortfall: kg !== null && kg < tierMin ? { tiers: draft.tiers, minKg: tierMin } : null,
    cakeType,
    bread,
    breadIssue,
    fillingIncluded,
    base,
    flavors,
    // Con el relleno incluido, el elegido antes no se usa: no hay conflicto que avisar.
    fillingIssue: fillingIncluded || !bread ? null : fillingIssue,
    flavorsNeeded,
    coverage,
    valid: [],
  }
  design.valid = [
    draft.people >= 1 && !aboveMaximum && draft.tiers >= 1 && draft.tiers <= maxTiers,
    Boolean(cakeType),
    breadValid,
    fillingProblem(design, draft) === null,
    Boolean(coverage),
    false,
    false,
    false,
  ]
  return design
}

/**
 * Qué le falta al relleno para continuar, o `null` si está completo. Es la única regla del paso 4: la usan la
 * validez del paso y el mensaje de "Continuar".
 */
export function fillingProblem(design: DesignDerived, draft: CakeDesignDraft): string | null {
  if (design.fillingIncluded) return null
  if (!design.cakeType || !design.base) return 'Elige la base del relleno.'
  if (design.fillingIssue?.name === design.base.name) return 'Elige otra base del relleno.'
  // Un sabor que ya no existe, que no está en la base o que el tipo no admite se tiene que cambiar.
  if (design.flavors.length !== draft.flavors.length || design.fillingIssue) return 'Elige otro sabor del relleno.'
  if (design.flavors.length < design.flavorsNeeded) return design.flavorsNeeded === 2 ? 'Elige 2 sabores.' : 'Elige el sabor del relleno.'
  if (design.flavors.length > design.flavorsNeeded) return 'Elige un solo sabor.'
  const single = design.flavorsNeeded === 2 ? design.flavors.find((flavor) => !flavor.isCombinable) : undefined
  return single ? `${single.name} no se combina con otro sabor.` : null
}

/** El paso 4 no se elige cuando el pan trae su relleno. */
export function isSkipped(step: number, design: DesignDerived): boolean {
  return step === FILLING_STEP && design.fillingIncluded
}

export function isComplete(step: number, design: DesignDerived, draft: CakeDesignDraft): boolean {
  if (isSkipped(step, design)) return true
  return design.valid[step - 1] === true && draft.confirmed.includes(step)
}

/** El primer paso sin completar: hasta ahí se puede llegar. */
export function firstIncompleteStep(design: DesignDerived, draft: CakeDesignDraft): number {
  for (let step = 1; step <= STEP_COUNT; step++) {
    if (!isComplete(step, design, draft)) return step
  }
  return STEP_COUNT
}

export function nextStep(step: number, design: DesignDerived): number {
  const next = step + 1
  return isSkipped(next, design) ? next + 1 : Math.min(next, STEP_COUNT)
}

export function previousStep(step: number, design: DesignDerived): number {
  const previous = step - 1
  return isSkipped(previous, design) ? previous - 1 : Math.max(previous, 1)
}

/**
 * Cómo se ve cada paso en la barra: completado (palomita), actual, incluido (candado), con algo que cambiar ("!",
 * un paso ya confirmado que el tipo de pastel invalidó) o en espera.
 */
export type StepStatus = 'complete' | 'current' | 'included' | 'attention' | 'upcoming'

export function stepStatus(step: number, current: number, design: DesignDerived, draft: CakeDesignDraft): StepStatus {
  if (step === current) return 'current'
  // El relleno de un pan de precio completo sigue "Incluido" aunque el tipo nuevo ya no admita el pan (mockup 072).
  if (isSkipped(step, design) || (step === FILLING_STEP && design.breadIssue && design.bread?.pricingMode === 'full_price_per_kg')) {
    return 'included'
  }
  if ((step === 3 && design.breadIssue) || (step === FILLING_STEP && design.fillingIssue)) return 'attention'
  return isComplete(step, design, draft) ? 'complete' : 'upcoming'
}

// --- Continuar ---

/** Lo que falta para confirmar el paso, o `null` si se puede. */
export function missingChoice(step: number, design: DesignDerived, draft: CakeDesignDraft): string | null {
  switch (step) {
    case 1:
      if (!design.size || !design.size.current) return 'Todavía calculamos los kilos. Intenta de nuevo en un momento.'
      return design.aboveMaximum ? 'Para tantas personas, escríbenos por WhatsApp.' : null
    case 2:
      return design.cakeType ? null : 'Elige el tipo de pastel.'
    case 3:
      return design.bread && !design.breadIssue ? null : 'Elige el pan.'
    case FILLING_STEP:
      return fillingProblem(design, draft)
    case 5:
      return design.coverage ? null : 'Elige el color de la cobertura.'
    default:
      return 'Este paso todavía no se puede completar.'
  }
}

/** Lo que el tipo nuevo invalidó: el pan, el relleno o los dos (un pan de relleno incluido pide otro relleno). */
export function conflictTarget(design: DesignDerived) {
  if (design.breadIssue) {
    return { target: 'pan' as const, issue: design.breadIssue, alsoFilling: design.bread?.pricingMode === 'full_price_per_kg' }
  }
  return design.fillingIssue ? { target: 'relleno' as const, issue: design.fillingIssue, alsoFilling: false } : null
}

/**
 * La frase del conflicto, armada con el código del motivo (nunca leyendo su texto): "Tu pan Choco-pingüino no se
 * combina con pastel envinado.", "Tu relleno Fresa con yogurt no está disponible en pastel envinado.", "Tu pan Red
 * velvet solo va en pastel seco.". Un código que esta versión no conoce usa el texto de la API tal cual.
 */
export function conflictSentence(target: string, issue: Issue, cakeType: CakeTypeOption, options: CakeDesignOptions) {
  const typeName = (value: string) => `pastel ${(options.cakeTypes.find((type) => type.value === value)?.label ?? value).toLowerCase()}`
  const subject = `Tu ${target} ${issue.name}`
  switch (issue.code) {
    case 'not_combinable':
      return `${subject} no se combina con ${typeName(cakeType.value)}.`
    case 'not_offered':
      return `${subject} no está disponible en ${typeName(cakeType.value)}.`
    case 'only_in':
      return `${subject} solo va en ${issue.allowedCakeTypes.map(typeName).join(' o ')}.`
    default:
      return `${subject}: ${issue.reason.charAt(0).toLowerCase()}${issue.reason.slice(1)}.`
  }
}

/** "Continuar", "Continuar con 4 kg, unas 28 personas" o "Continuar y elegir otro pan": el botón dice qué pasará. */
export function continueLabel(step: number, design: DesignDerived) {
  if (step === 1 && design.belowMinimum && !design.aboveMaximum && design.size) {
    return `Continuar con ${design.size.kg} kg, unas ${design.size.minimumPeople} personas`
  }
  const conflict = step === 2 ? conflictTarget(design) : null
  return conflict ? `Continuar y elegir otro ${conflict.target}` : 'Continuar'
}

/**
 * El borrador después de confirmar el paso: lo marca confirmado, bajo el mínimo sigue con las personas del mínimo
 * y, tras un cambio de tipo, quita solo lo que ya no aplica (y su confirmación) para volver a pedirlo.
 */
export function confirmStep(step: number, design: DesignDerived, draft: CakeDesignDraft): CakeDesignDraft {
  let next: CakeDesignDraft = { ...draft, confirmed: [...new Set([...draft.confirmed, step])].sort((a, b) => a - b) }
  if (step === 1 && design.belowMinimum && design.size) next = { ...next, people: design.size.minimumPeople }
  if (step === 2) {
    const conflict = conflictTarget(design)
    if (conflict?.target === 'pan') next = { ...next, bread: null, confirmed: next.confirmed.filter((n) => n !== 3) }
    if (conflict && (conflict.target === 'relleno' || conflict.alsoFilling)) {
      next = { ...next, fillingBase: null, flavors: [], confirmed: next.confirmed.filter((n) => n !== FILLING_STEP) }
    }
  }
  return next
}

/** A dónde lleva "Continuar": tras un conflicto, a lo que hay que cambiar; si no, al paso siguiente. */
export function stepAfter(step: number, before: DesignDerived, after: DesignDerived, draft: CakeDesignDraft) {
  const firstIncomplete = firstIncompleteStep(after, draft)
  return step === 2 && conflictTarget(before) ? firstIncomplete : Math.min(nextStep(step, after), firstIncomplete)
}
