import type { CakeDesignOptions, CakeSize } from '../models/cakeDesign.ts'
import type { CakeDesignDraft, CakeForm } from '../models/cakeDesignDraft.ts'
import { formatPrice } from '../models/money.ts'
import { reviewView } from './cakeDesignReview.ts'
import { lidSummary } from './cakeLid.ts'
import { decorationColorView, decorationGroups, decorationSummary } from './cakeDecorations.ts'
import { breadChoices, cakeTypeChoices, coverageChoices, fillingChoices, lowerFirst } from './cakeDesignChoices.ts'
import {
  conflictSentence,
  conflictTarget,
  continueLabel,
  DECORATION_STEP,
  DESIGN_STEPS,
  FILLING_STEP,
  firstIncompleteStep,
  isSkipped,
  LAST_BUILT_STEP,
  LID_STEP,
  REVIEW_STEP,
  stepStatus,
} from './cakeDesignSteps.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'
import type { PricePlan, PriceState } from './useCakeDesignPrice.ts'

/** Textos de "Tu pastel", del total y del paso 1, y la vista completa que pinta `CakeDesigner`. Sin React. */

const FORM_LABELS: Record<CakeForm, string> = { round: 'redondo', rectangular: 'rectangular' }

/** "redondo", "redondo de 2 pisos". */
export function formLabel(form: CakeForm, tiers: number) {
  return tiers > 1 ? `${FORM_LABELS[form]} de ${tiers} pisos` : FORM_LABELS[form]
}

const personas = (count: number) => `${count} ${count === 1 ? 'persona' : 'personas'}`

/** "a y b", "a, b y c". */
function joinNames(names: string[]) {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** "Normal, durazno y nuez", "Con queso, zarzamora". */
export function fillingLabel(design: DesignDerived) {
  if (!design.base) return ''
  const flavors = joinNames(design.flavors.map((flavor) => lowerFirst(flavor.name)))
  return flavors ? `${design.base.name}, ${flavors}` : design.base.name
}

export type SummaryRow = {
  step: number
  label: string
  value: string
  /** Un estado escrito bajo el valor: "Hay que cambiarlo", "Incluido, no se cambia". */
  note?: string
  /** Si lleva "Cambiar"; el relleno incluido no se cambia. */
  canChange: boolean
}

/**
 * Lo elegido en cada paso confirmado, menos el que se está viendo, como "Tu pastel" del mockup. El relleno incluido
 * se lista sin "Cambiar"; un pan que el tipo de pastel ya no admite dice "Hay que cambiarlo".
 */
export function summaryRows(draft: CakeDesignDraft, design: DesignDerived, current: number, options: CakeDesignOptions): SummaryRow[] {
  const rows: SummaryRow[] = []
  const shown = (step: number) => step !== current && step <= LAST_BUILT_STEP && (draft.confirmed.includes(step) || isSkipped(step, design))
  if (shown(1)) {
    const kg = design.size?.current ? `, ${design.size.kg} kg` : ''
    rows.push({ step: 1, label: DESIGN_STEPS[0].title, value: `${personas(draft.people)}${kg}, ${formLabel(draft.form, draft.tiers)}`, canChange: true })
  }
  if (shown(2) && design.cakeType) rows.push({ step: 2, label: DESIGN_STEPS[1].title, value: design.cakeType.label, canChange: true })
  if (shown(3) && design.bread) {
    const included = design.bread.pricingMode === 'full_price_per_kg' && !design.breadIssue
    rows.push({
      step: 3,
      label: DESIGN_STEPS[2].title,
      value: included ? `${design.bread.name}, relleno incluido` : design.bread.name,
      note: design.breadIssue ? 'Hay que cambiarlo' : undefined,
      canChange: true,
    })
  }
  const includedFilling = design.bread?.pricingMode === 'full_price_per_kg' ? design.bread.includedFilling : ''
  if (current !== FILLING_STEP && includedFilling && (design.fillingIncluded || design.breadIssue) && draft.confirmed.includes(3)) {
    rows.push({ step: FILLING_STEP, label: DESIGN_STEPS[3].title, value: includedFilling, note: 'Incluido, no se cambia', canChange: false })
  } else if (shown(FILLING_STEP) && design.base && !design.fillingIncluded) {
    rows.push({
      step: FILLING_STEP,
      label: DESIGN_STEPS[3].title,
      value: fillingLabel(design),
      note: design.fillingIssue ? 'Hay que cambiarlo' : undefined,
      canChange: true,
    })
  }
  if (shown(5) && design.coverage) {
    rows.push({ step: 5, label: DESIGN_STEPS[4].title, value: `Crema pastelera, ${lowerFirst(design.coverage.name)}`, canChange: true })
  }
  const decoration = shown(DECORATION_STEP) ? decorationSummary(draft, design, options) : null
  if (decoration) rows.push({ step: DECORATION_STEP, label: DESIGN_STEPS[5].title, value: decoration.value, note: decoration.note, canChange: true })
  if (shown(LID_STEP)) rows.push({ step: LID_STEP, label: DESIGN_STEPS[6].title, value: lidSummary(draft), canChange: true })
  return rows
}

/** La línea del total: "Para 40 personas, aprox. 6 kg, redondo" o, bajo el mínimo, "Mínimo 4 kg, para unas 28 personas". */
export function sizeLine(draft: CakeDesignDraft, design: DesignDerived, withForm: boolean) {
  const size = design.size
  if (size?.belowMinimum) return `Mínimo ${size.kg} kg, para unas ${size.minimumPeople} personas`
  const kg = size ? `, aprox. ${size.kg} kg` : ''
  const line = `Para ${personas(draft.people)}${kg}`
  return withForm ? `${line}, ${formLabel(draft.form, draft.tiers)}` : line
}

/** "aprox. 2.7 kg, unas 19 personas, y puede ser para hoy mismo." con lo que el catálogo tenga. */
function showcaseText(size: CakeSize | null) {
  const parts = [size?.approxWeightKg ? `aprox. ${size.approxWeightKg} kg` : null, size?.servings ? `unas ${size.servings} personas` : null].filter(Boolean)
  return parts.length ? `${parts.join(', ')}, y puede ser para hoy mismo.` : 'puede ser para hoy mismo.'
}

/** Lo que pinta el paso 1, con los kilos, el mínimo y el máximo que calculó la API. */
export function sizeStepView(draft: CakeDesignDraft, design: DesignDerived, options: CakeDesignOptions, tierNotice: string | null) {
  const size = design.size
  const { showcaseCake, miniCake } = options.smallerAlternatives
  return {
    /** "Aprox. 6 kg para 40 personas", "Menos de 1 kg para 3 personas" o, sin respuesta, "Calculando los kilos…". */
    kgLine: size
      ? `${size.roundedKg < 1 ? 'Menos de 1 kg' : `Aprox. ${size.roundedKg} kg`} para ${personas(size.people)}`
      : 'Calculando los kilos…',
    /** Los kilos son de otras personas mientras llega la respuesta nueva. */
    kgStale: !size?.current,
    kgNote: `Calculamos 1 kg por cada ${options.limits.peoplePerKg} personas y redondeamos.`,
    minimum:
      size?.belowMinimum
        ? {
            title: `Para ${personas(size.people)} hay opciones más chicas`,
            intro: `Los pedidos son desde ${size.kg} kg, que alcanzan para unas ${size.minimumPeople} personas. Si prefieres algo más chico:`,
            showcase: showcaseText(showcaseCake),
            mini: miniCake?.servings ? `unas ${miniCake.servings} personas cada uno.` : '',
          }
        : null,
    tooLarge: design.aboveMaximum && size
      ? options.limits.maxOnlineKg <= 0
        ? {
            // Sin ninguna base activa no hay pedido en línea posible (D50).
            title: 'Por ahora no tomamos pedidos en línea',
            body: 'Escríbenos por WhatsApp y lo vemos contigo.',
          }
        : {
            title: `Para más de ${options.limits.maxOnlineKg} kg, escríbenos por WhatsApp`,
            body: `En línea tomamos pedidos de hasta ${options.limits.maxOnlineKg} kg, unas ${size.maxOnlinePeople} personas. Uno más grande lo platicamos contigo.`,
          }
      : null,
    // Regla 3.3 (D50): los kilos por pisos son mínimos que bloquean. Los pisos que los kilos de ahora no permiten
    // se ven desactivados con su mínimo; nunca desaparecen.
    tiers: options.tierMinimums.map((tier) => ({
      value: tier.tiers,
      label: `${tier.tiers} ${tier.tiers === 1 ? 'piso' : 'pisos'}`,
      description: tier.minKg > 0 ? `Desde ${tier.minKg} kg` : 'Cualquier peso',
      checked: draft.tiers === tier.tiers,
      disabled: design.allowedTiers !== null && tier.tiers > design.allowedTiers,
    })),
    /** "Con 10 kg el pastel va de 1 piso." después de bajar los pisos solos. */
    tierNotice,
  }
}

/**
 * El total para el escritorio y la barra móvil. Nunca presenta como vigente un total que ya no corresponde: si la
 * petición falló o no hay nada que pedir, dice "Sin calcular"; mientras llega el nuevo, el anterior va tenue.
 */
export type PriceView = {
  /** "Desde $1,080", "$3,825", "Calculando…", "Sin calcular" o "Por WhatsApp" (sin "MXN"). */
  amount: string
  /** Si `amount` es una cifra (para agregar "MXN"). */
  isFigure: boolean
  updating: boolean
  failed: boolean
  /** "Con pan de vainilla y relleno normal." mientras el total es un estimado. */
  assumed: string | null
  /** La API rechazó la elección: su primer motivo, sin reintento (repetir daría lo mismo). */
  rejectedReason: string | null
  /** "No incluye la decoración": con "Otra decoración" el total no la suma hasta que la pastelería dé su precio. */
  note: string | null
}

export function priceView(price: PriceState, plan: PricePlan | null, design: DesignDerived): PriceView {
  const base = { updating: false, failed: false, assumed: null, isFigure: false, rejectedReason: null, note: null }
  if (design.aboveMaximum) return { ...base, amount: 'Por WhatsApp' }
  // Una falla de red (429, 5xx, tiempo agotado) no deja total y ofrece reintentar.
  if (price.failed) return { ...base, amount: 'Sin calcular', failed: true }
  // Una elección rechazada (400 con los kilos) tampoco deja total, pero reintentar daría lo mismo: se dice por qué.
  if (price.quote?.rejected && !price.updating) {
    return { ...base, amount: 'Sin calcular', rejectedReason: price.quote.rejectedReason ?? 'No se pudo calcular el total con lo elegido.' }
  }
  if (!plan) return { ...base, amount: 'Sin calcular' }
  const total = price.quote?.total ? formatPrice(price.quote.total) : null
  // Sin cifra que dejar tenue, mientras llega la nueva se dice "Calculando…", venga de donde venga la anterior.
  if (!total) return { ...base, amount: price.updating ? 'Calculando…' : 'Sin calcular', updating: price.updating }
  const assumed = plan.assumedBread
    ? `Con pan de ${lowerFirst(plan.assumedBread.name)}${plan.assumedBase ? ` y relleno ${lowerFirst(plan.assumedBase.name)}` : ''}.`
    : plan.assumedBase
      ? `Con relleno ${lowerFirst(plan.assumedBase.name)}.`
      : null
  const note = design.decoration?.requiresQuote ? 'No incluye la decoración: la pastelería te dice su precio.' : null
  return { amount: price.estimate ? `Desde ${total}` : total, isFigure: true, updating: price.updating, failed: false, assumed, rejectedReason: null, note }
}

type ViewInput = {
  draft: CakeDesignDraft
  design: DesignDerived
  options: CakeDesignOptions
  current: number
  price: PriceState
  plan: PricePlan | null
  /** El aviso de los pisos que bajaron solos, o `null`. */
  tierNotice: string | null
  /** "Continuar" espera los kilos del paso 1: el botón se desactiva mientras tanto. */
  proceeding: boolean
  /** Los días de anticipación de un pedido, para la revisión; `null` mientras llegan los datos de la pastelería. */
  leadDays: number | null
}

/** Todo lo que pinta la pantalla, armado con lo elegido, las opciones y el precio. */
export function designerView({ draft, design, options, current, price, plan, tierNotice, proceeding, leadDays }: ViewInput) {
  const conflict = current === 2 && design.cakeType ? conflictTarget(design) : null
  const reachableUpTo = firstIncompleteStep(design, draft)
  const review = current === REVIEW_STEP ? reviewView({ draft, design, options, price, leadDays }) : null
  return {
    steps: DESIGN_STEPS.map((step, index) => {
      const number = index + 1
      const status = stepStatus(number, current, design, draft)
      // Se puede volver a un paso ya alcanzado; los siguientes y el relleno incluido no se tocan.
      return { number, ...step, status, reachable: number !== current && status !== 'included' && number <= reachableUpTo }
    }),
    summary: summaryRows(draft, design, current, options),
    conflict:
      conflict && design.cakeType
        ? { title: conflictSentence(conflict.target, conflict.issue, design.cakeType, options), target: conflict.target, alsoFilling: conflict.alsoFilling }
        : null,
    changedType: Boolean(design.breadIssue ?? design.fillingIssue),
    sizeLine: sizeLine(draft, design, current === 1),
    sizeStep: sizeStepView(draft, design, options, tierNotice),
    price: priceView(price, plan, design),
    choices: {
      cakeTypes: cakeTypeChoices(draft, options),
      breads: breadChoices(draft, design, options),
      filling: fillingChoices(draft, design, options),
      colors: coverageChoices(draft, options),
      decorations: decorationGroups(draft, options),
      decorationColor: decorationColorView(draft, design, options),
      decorationQuote: Boolean(design.decoration?.requiresQuote),
      includedFilling:
        design.fillingIncluded && design.bread ? { bread: design.bread.name, filling: lowerFirst(design.bread.includedFilling) } : null,
    },
    continueLabel: continueLabel(current, design),
    continueShort:
      current === 1 && design.belowMinimum && !design.aboveMaximum && design.size ? `Continuar con ${design.size.kg} kg` : 'Continuar',
    // El paso 1 arriba del máximo no se puede confirmar; la revisión espera los montos de la API.
    continueDisabled: (current === 1 && design.aboveMaximum) || current > LAST_BUILT_STEP || proceeding || (review !== null && !review.ready),
    proceeding,
    review,
  }
}

export type DesignerView = ReturnType<typeof designerView>
