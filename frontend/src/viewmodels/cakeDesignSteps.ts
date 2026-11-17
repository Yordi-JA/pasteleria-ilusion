import type {
  BreadOption,
  CakeDesignOptions,
  CakeSizeCode,
  CakeTypeOption,
  DecorationOption,
  DesignSizeOption,
  FillingBaseOption,
  FillingFlavorOption,
  PeopleSize,
  UnavailableCode,
} from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import { normalizeHex } from '../models/color.ts'
import { lidFor, messageLetterProblem } from './cakeLid.ts'
import { effectiveSize, hasConflicts, isSmall, NO_CONFLICTS, sizeConflicts, sizeOption } from './cakeSizes.ts'
import type { SizeConflicts } from './cakeSizes.ts'
import type { MessageMetrics } from './messageGeometry.ts'

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
/** La cobertura (paso 5) y la decoración (paso 6). */
export const COVERAGE_STEP = 5
export const DECORATION_STEP = 6
/** El mensaje y la oblea (paso 7) y la revisión (paso 8, el último). */
export const LID_STEP = 7
export const REVIEW_STEP = 8
/** Último paso que esta versión arma. */
export const LAST_BUILT_STEP = REVIEW_STEP

/** Una opción elegida que el tipo de pastel ya no admite: nombre, motivo y código de la API. */
export type Issue = { name: string; reason: string; code: UnavailableCode | null; allowedCakeTypes: string[] }

/** El tamaño que calculó la API y si corresponde a las personas de ahora (`current`) o a las de antes. */
export type DesignSize = PeopleSize & { current: boolean }

export type DesignDerived = {
  /** El tamaño que vale (tanda 2): por kilos, de vitrina o mini; `null` si entre dos todavía no se elige. */
  cakeSize: CakeSizeCode | null
  /** Sus datos de la API; `null` sin tamaño o si la API no manda tamaños. */
  sizeOption: DesignSizeOption | null
  /** El pastel de vitrina o el mini: redondo, de 1 piso, sin kilos ni base. */
  small: boolean
  /** Parte de un pastel de vitrina ("Personalizar este pastel"): su tipo, pan y relleno no se cambian. */
  locked: boolean
  /** Lo ya elegido que el tamaño no admite (el mini), con su motivo. */
  sizeConflicts: SizeConflicts
  /** `null` mientras la API no responde ningún tamaño. */
  size: DesignSize | null
  /** Kilos del pedido según la API; `null` sin tamaño. */
  kg: number | null
  belowMinimum: boolean
  aboveMaximum: boolean
  maxTiers: number
  /** El mayor número de pisos que permiten los kilos (regla 3.3, de la API); `null` sin tamaño. */
  allowedTiers: number | null
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
  /** El color de la cobertura (`#rrggbb`): el elegido o, mientras no se elige, el primero de la lista de la pastelería. */
  coverage: string | null
  /** La decoración elegida (esté o no disponible); `null` si no se eligió o ya no existe. */
  decoration: DecorationOption | null
  /** Lo que falta al mensaje o a la oblea para continuar (paso 7), o `null` si está completo. */
  layoutProblem: string | null
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

/**
 * El color de la cobertura (paso 5): el elegido o, si todavía no se elige, el primero de la lista activa de la pastelería (no se
 * inventa uno). `null` si no hay elegido y la lista está vacía: entonces hay que elegir uno.
 */
export function coverageColor(draft: Pick<CakeDesignDraft, 'coverageColor'>, options: CakeDesignOptions): string | null {
  return normalizeHex(draft.coverageColor) ?? options.coverageColors.map((option) => normalizeHex(option.previewColor)).find(Boolean) ?? null
}

/**
 * `imageReady`: la imagen de "Otra decoración" está en la memoria de la pestaña. No va en el borrador porque no se
 * guarda (D53): tras recargar, el borrador conserva su nombre pero la imagen se tiene que elegir otra vez. Lo mismo con
 * `waferReady`, la imagen de la oblea (D55).
 */
export function deriveDesign(
  draft: CakeDesignDraft,
  options: CakeDesignOptions,
  apiSize: PeopleSize | null,
  imageReady = false,
  waferReady = false,
  /** Lo que mide el texto del mensaje: con él, el paso 7 revisa que quepa con la letra mínima (tanda 2). */
  metrics?: MessageMetrics,
): DesignDerived {
  const { tierMinimums } = options
  const cakeSize = effectiveSize(draft, options)
  const small = isSmall(cakeSize)
  const chosenSize = cakeSize ? sizeOption(options, cakeSize) : null
  // El pastel de vitrina y el mini no tienen kilos: un tamaño por personas que llegó antes no cuenta.
  const size = apiSize && !small ? { ...apiSize, current: apiSize.people === draft.people } : null
  const kg = size?.kg ?? null
  const maxTiers = tierMinimums.length
  const locked = Boolean(draft.source) && cakeSize === 'showcase'
  const sized = small ? sizeConflicts(draft, chosenSize) : NO_CONFLICTS
  // El pan y el relleno de un pastel de vitrina de origen no se cambian (sus pasos van bloqueados) y el servidor acepta los del
  // producto: no se marcan para cambiarlos aunque el tamaño no los tuviera.
  const conflicts = locked ? { ...sized, bread: null, base: null } : sized

  const cakeType = options.cakeTypes.find((type) => type.value === draft.cakeType) ?? null
  const typeValue = cakeType?.value ?? null
  const bread = options.breads.find((option) => option.slug === draft.bread) ?? null
  const breadIssue = bread ? issueIn(bread, typeValue) : null
  const breadValid = Boolean(cakeType && bread && !breadIssue && !conflicts.bread)
  const fillingIncluded = breadValid && bread?.pricingMode === 'full_price_per_kg'

  const base = options.fillingBases.find((option) => option.slug === draft.fillingBase) ?? null
  const flavors = base ? draft.flavors.flatMap((slug) => base.flavors.filter((flavor) => flavor.slug === slug)) : []
  const flavorsNeeded = base && base.maxFlavors >= 2 && draft.flavorCount === 2 ? 2 : 1
  const fillingIssue = base ? (issueIn(base, typeValue) ?? flavors.map((flavor) => issueIn(flavor, typeValue)).find(Boolean) ?? null) : null

  const coverage = coverageColor(draft, options)
  const decoration = options.decorations.find((option) => option.slug === draft.decoration) ?? null
  // Arriba del máximo solo cuenta lo que la API dijo de las personas de ahora.
  const aboveMaximum = Boolean(size?.current && size.aboveMaximum)
  const design: DesignDerived = {
    cakeSize,
    sizeOption: chosenSize,
    small,
    locked,
    // Con el relleno incluido, la base elegida antes no se usa: no hay conflicto que avisar.
    sizeConflicts: fillingIncluded ? { ...conflicts, base: null } : conflicts,
    size,
    kg,
    belowMinimum: Boolean(size?.belowMinimum),
    aboveMaximum,
    maxTiers,
    allowedTiers: size ? Math.min(size.maxTiers, maxTiers) : null,
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
    decoration,
    layoutProblem: layoutProblem(draft, options, waferReady, conflicts.wafer),
    valid: [],
  }
  // La letra mínima del mensaje se revisa con la tapa de este pastel (tanda 2), cuando se sabe lo que mide el texto.
  if (design.layoutProblem === null && metrics) design.layoutProblem = messageLetterProblem(draft, lidFor(draft, design, options), metrics, options)
  design.valid = [
    cakeSize === null
      ? false
      : small
        ? Boolean(chosenSize?.available)
        : // Regla 3.3 (D50): los pisos no pasan de lo que permiten los kilos de ahora.
          draft.people >= 1 && !aboveMaximum && draft.tiers >= 1 && draft.tiers <= maxTiers && !(size?.current && draft.tiers > size.maxTiers),
    Boolean(cakeType),
    breadValid,
    fillingProblem(design, draft) === null,
    Boolean(coverage),
    decorationProblem(decoration, imageReady, draft, design.sizeConflicts.decoration) === null,
    design.layoutProblem === null,
    // La revisión no pide nada: se llega a ella con todo lo anterior completo y desde ahí se agrega al pedido.
    true,
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
  if (design.fillingIssue?.name === design.base.name || design.sizeConflicts.base) return 'Elige otra base del relleno.'
  // Un sabor que ya no existe, que no está en la base o que el tipo no admite se tiene que cambiar.
  if (design.flavors.length !== draft.flavors.length || design.fillingIssue) return 'Elige otro sabor del relleno.'
  if (design.flavors.length < design.flavorsNeeded) return design.flavorsNeeded === 2 ? 'Elige 2 sabores.' : 'Elige el sabor del relleno.'
  if (design.flavors.length > design.flavorsNeeded) return 'Elige un solo sabor.'
  const single = design.flavorsNeeded === 2 ? design.flavors.find((flavor) => !flavor.isCombinable) : undefined
  return single ? `${single.name} no se combina con otro sabor.` : null
}

/**
 * Qué le falta a la decoración para continuar, o `null` si está completa. Una opción sin precio (PENDIENTE) no se
 * puede elegir (D39); "Otra decoración" nunca sigue sin su imagen (D53).
 */
export function decorationProblem(
  decoration: DecorationOption | null,
  imageReady: boolean,
  draft: Pick<CakeDesignDraft, 'decorationImageName'>,
  /** Por qué el tamaño no la admite (el mini, tanda 2), o `null`. */
  sizeReason: string | null = null,
): string | null {
  if (!decoration) return 'Elige una decoración.'
  if (!decoration.available) return `${decoration.name} todavía no tiene precio. Elige otra decoración.`
  if (sizeReason) return `${sizeReasonSentence(decoration.name, sizeReason)} Elige otra decoración.`
  if (decoration.requiresQuote && !imageReady) {
    return draft.decorationImageName ? 'Tu imagen no se conservó al recargar. Elígela otra vez.' : 'Elige la imagen de la decoración.'
  }
  return null
}

/**
 * Qué le falta al mensaje o a la oblea para continuar, o `null` si está completo (regla 6.2 y 6.3). Ninguno de los dos es
 * obligatorio, pero lo que se agrega se completa: el mensaje lleva texto y la oblea, su imagen y su precio. Un mensaje de más
 * de 4 palabras no falta nada: es una sugerencia.
 */
export function layoutProblem(draft: CakeDesignDraft, options: CakeDesignOptions, waferReady: boolean, waferRefusal: string | null = null): string | null {
  if (draft.messageEnabled && draft.message.text.trim() === '') return 'Escribe tu mensaje o quítalo.'
  if (!draft.waferEnabled) return null
  if (waferRefusal) return `${waferRefusal} Quítala para continuar.`
  if (options.limits.waferPrice === null) return 'La oblea todavía no tiene precio. Quítala para continuar.'
  if (waferReady) return null
  return draft.waferImageName ? 'Tu imagen no se conservó al recargar. Elígela otra vez.' : 'Elige la imagen de la oblea.'
}

/** "Con 10 kg el pastel va de 1 piso." o "Con 20 kg el pastel va de hasta 3 pisos." (regla 3.3, D50). */
export function tierLimitSentence(kg: number, maxTiers: number) {
  return maxTiers === 1 ? `Con ${kg} kg el pastel va de 1 piso.` : `Con ${kg} kg el pastel va de hasta ${maxTiers} pisos.`
}

/**
 * El motivo de un tamaño como frase: los de la API ya la traen ("Rosetones no va en el pastel mini."); uno corto, como "Precio
 * por confirmar", lleva el nombre: "Rosas: precio por confirmar.".
 */
export function sizeReasonSentence(name: string, reason: string): string {
  return /[.:]$/.test(reason) || reason.includes(name) ? reason : `${name}: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`
}

/** El tipo, el pan y el relleno del pastel de vitrina de "Personalizar este pastel" (tanda 2): se ven hechos y no se cambian. */
export const LOCKED_STEPS = [2, 3, FILLING_STEP]

export function isLocked(step: number, design: Pick<DesignDerived, 'locked'>): boolean {
  return design.locked && LOCKED_STEPS.includes(step)
}

/** El paso 4 no se elige cuando el pan trae su relleno; el tipo, el pan y el relleno de un pastel de vitrina, tampoco. */
export function isSkipped(step: number, design: DesignDerived): boolean {
  return (step === FILLING_STEP && design.fillingIncluded) || isLocked(step, design)
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
  let next = step + 1
  while (next < STEP_COUNT && isSkipped(next, design)) next++
  return Math.min(next, STEP_COUNT)
}

export function previousStep(step: number, design: DesignDerived): number {
  let previous = step - 1
  while (previous > 1 && isSkipped(previous, design)) previous--
  return Math.max(previous, 1)
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
  const { sizeConflicts: conflicts } = design
  if ((step === 3 && (design.breadIssue || conflicts.bread)) || (step === FILLING_STEP && (design.fillingIssue || conflicts.base))) return 'attention'
  // Lo que el tamaño no admite (tanda 2) también se marca, como un pan que el tipo de pastel ya no admite (regla 4.7).
  if ((step === DECORATION_STEP && conflicts.decoration) || (step === LID_STEP && conflicts.wafer)) return 'attention'
  return isComplete(step, design, draft) ? 'complete' : 'upcoming'
}

// --- Continuar ---

/** Lo que falta para confirmar el paso, o `null` si se puede. */
export function missingChoice(step: number, design: DesignDerived, draft: CakeDesignDraft, imageReady = false): string | null {
  switch (step) {
    case 1:
      if (design.cakeSize === null) return 'Elige el tamaño.'
      if (design.small) return design.sizeOption?.available ? null : (design.sizeOption?.unavailableReason ?? 'Ese tamaño no está disponible por ahora.')
      if (!design.size || !design.size.current) return 'Todavía calculamos los kilos. Intenta de nuevo en un momento.'
      if (design.aboveMaximum) return 'Para tantas personas, escríbenos por WhatsApp.'
      return draft.tiers > design.size.maxTiers ? tierLimitSentence(design.size.kg, design.size.maxTiers) : null
    case 2:
      return design.cakeType ? null : 'Elige el tipo de pastel.'
    case 3:
      return design.bread && !design.breadIssue ? null : 'Elige el pan.'
    case FILLING_STEP:
      return fillingProblem(design, draft)
    case 5:
      return design.coverage ? null : 'Elige el color de la cobertura.'
    case DECORATION_STEP:
      return decorationProblem(design.decoration, imageReady, draft)
    case LID_STEP:
      return design.layoutProblem
    default:
      return null
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

/**
 * Lo que el tamaño nuevo no admite, para el aviso del paso 1 (tanda 2, como el cambio de tipo de la regla 4.7): cada motivo de la
 * API como frase. Vacío si no hay nada que cambiar.
 */
export function sizeConflictItems(design: DesignDerived): string[] {
  const { bread, base, decoration, wafer } = design.sizeConflicts
  return [
    bread && design.bread ? sizeReasonSentence(design.bread.name, bread) : null,
    base && design.base ? sizeReasonSentence(design.base.name, base) : null,
    decoration && design.decoration ? sizeReasonSentence(design.decoration.name, decoration) : null,
    wafer,
  ].filter((item): item is string => Boolean(item))
}

/** Qué hará "Continuar" con lo que el tamaño no admite: elegir otro pan, otro relleno, otra decoración o quitar la oblea. */
function sizeConflictAction(conflicts: SizeConflicts): string | null {
  const found = (['bread', 'base', 'decoration', 'wafer'] as const).filter((key) => conflicts[key])
  if (found.length === 0) return null
  if (found.length > 1) return 'Continuar y cambiarlo'
  return { bread: 'Continuar y elegir otro pan', base: 'Continuar y elegir otro relleno', decoration: 'Continuar y elegir otra decoración', wafer: 'Continuar sin la oblea' }[found[0]]
}

/** "Continuar", "Continuar con 4 kg, unas 28 personas" o "Continuar y elegir otro pan": el botón dice qué pasará. */
export function continueLabel(step: number, design: DesignDerived) {
  if (step === 1 && design.cakeSize === 'by_weight' && design.belowMinimum && !design.aboveMaximum && design.size) {
    return `Continuar con ${design.size.kg} kg, unas ${design.size.minimumPeople} personas`
  }
  const sizeAction = step === 1 ? sizeConflictAction(design.sizeConflicts) : null
  if (sizeAction) return sizeAction
  const conflict = step === 2 ? conflictTarget(design) : null
  if (step === REVIEW_STEP) return 'Agregar al pedido'
  return conflict ? `Continuar y elegir otro ${conflict.target}` : 'Continuar'
}

/**
 * El borrador después de confirmar el paso: lo marca confirmado, bajo el mínimo sigue con las personas del mínimo
 * y, tras un cambio de tipo, quita solo lo que ya no aplica (y su confirmación) para volver a pedirlo.
 */
export function confirmStep(step: number, design: DesignDerived, draft: CakeDesignDraft): CakeDesignDraft {
  let next: CakeDesignDraft = { ...draft, confirmed: [...new Set([...draft.confirmed, step])].sort((a, b) => a - b) }
  // El primer color de la lista que se ve en el paso 5 queda elegido al continuar.
  if (step === COVERAGE_STEP) next = { ...next, coverageColor: design.coverage }
  if (step === 1) {
    // El tamaño que valió queda elegido; por kilos bajo el mínimo, sigue con las personas del mínimo.
    if (design.cakeSize && !draft.source) next = { ...next, cakeSize: design.cakeSize }
    if (design.cakeSize === 'by_weight' && design.belowMinimum && design.size) next = { ...next, people: design.size.minimumPeople }
    next = withoutSizeConflicts(next, design)
  }
  if (step === 2) {
    const conflict = conflictTarget(design)
    if (conflict?.target === 'pan') next = { ...next, bread: null, confirmed: next.confirmed.filter((n) => n !== 3) }
    if (conflict && (conflict.target === 'relleno' || conflict.alsoFilling)) {
      next = { ...next, fillingBase: null, flavors: [], confirmed: next.confirmed.filter((n) => n !== FILLING_STEP) }
    }
  }
  return next
}

/**
 * Quita lo que el tamaño no admite, avisado antes en el paso 1 (tanda 2): el pan, el relleno o la decoración vuelven a pedirse
 * (sin su confirmación) y la oblea se quita. Lo demás se conserva.
 */
function withoutSizeConflicts(draft: CakeDesignDraft, design: DesignDerived): CakeDesignDraft {
  const { bread, base, decoration, wafer } = design.sizeConflicts
  const unconfirm = new Set<number>()
  let next = draft
  if (bread) {
    next = { ...next, bread: null }
    unconfirm.add(3)
    // Un pan de relleno incluido no dejó relleno elegido: con el pan nuevo hay que elegirlo.
    if (design.bread?.pricingMode === 'full_price_per_kg') unconfirm.add(FILLING_STEP)
  }
  if (base) {
    next = { ...next, fillingBase: null, flavors: [] }
    unconfirm.add(FILLING_STEP)
  }
  if (decoration) {
    next = { ...next, decoration: null, decorationImageName: null }
    unconfirm.add(DECORATION_STEP)
  }
  if (wafer) next = { ...next, waferEnabled: false, waferImageName: null }
  return unconfirm.size ? { ...next, confirmed: next.confirmed.filter((step) => !unconfirm.has(step)) } : next
}

/** A dónde lleva "Continuar": tras un conflicto, a lo que hay que cambiar; si no, al paso siguiente. */
export function stepAfter(step: number, before: DesignDerived, after: DesignDerived, draft: CakeDesignDraft) {
  const firstIncomplete = firstIncompleteStep(after, draft)
  const conflict = (step === 2 && conflictTarget(before)) || (step === 1 && hasConflicts(before.sizeConflicts))
  return conflict ? firstIncomplete : Math.min(nextStep(step, after), firstIncomplete)
}
