import { ApiError, devRequestTimeoutMs, getJson, postJson, REQUEST_TIMEOUT_MS } from './apiClient.ts'
import { PRICE_PATTERN } from './money.ts'

/**
 * Contrato de "Diseña tu pastel" (D39): `GET cake-designs/options/` y `POST cake-designs/price/`
 * (`CakeDesignOptionsSerializer` y `CakeDesignPriceSerializer` en `backend/core_pasteleria/api/serializers.py`).
 * Aquí viven los tipos, su validación defensiva y las peticiones. Los precios y los límites llegan de la API: el
 * frontend nunca los calcula ni los fija en el código (regla 2 de AGENTS.md).
 */

/** Motivo por tipo de pastel (`tres_leches`, `seco`, `envinado`) en que la opción no se ofrece. */
export type ReasonsByCakeType = Readonly<Record<string, string>>
/**
 * Código de cada motivo: `not_offered` (no se ofrece en ese tipo), `not_combinable` (no se combina con ese tipo) u
 * `only_in` (solo va en `allowedCakeTypes`). Las frases de la interfaz se arman con el código, nunca leyendo el texto.
 */
export type UnavailableCode = 'not_offered' | 'not_combinable' | 'only_in'
export type CodesByCakeType = Readonly<Record<string, UnavailableCode>>
/** Monto como texto ("180.00") por tipo de pastel. */
export type PriceByCakeType = Readonly<Record<string, string>>

export type CakeTypeOption = { value: string; label: string }

export type BreadPricingMode = 'extra_per_kg' | 'full_price_per_kg'

export type BreadOption = {
  slug: string
  name: string
  /** Vacía si la pastelería no la escribió. */
  description: string
  pricingMode: BreadPricingMode
  /** Relleno que trae el pan de precio completo ("Crema de chocolate sabor helado"); vacío si lleva relleno aparte. */
  includedFilling: string
  /** Color del pan en la vista previa, `#rrggbb` del admin; `null` si no lo tiene. En un pan de dos colores, el del pan que va encima del relleno. */
  previewColor: string | null
  /** Solo en un pan de dos colores (choco-vainilla): el del pan que va debajo del relleno. */
  previewColorBottom: string | null
  /** Solo en un pan con relleno incluido (Choco-pingüino, Red velvet): lo que lleva encima la crema pastelera blanca. */
  includedFillingStyle: FillingPreviewStyle
  /** Color de las chispas, los trozos o el granillo del relleno incluido; `null` si es liso. */
  includedFillingColorSecondary: string | null
  allowedCakeTypes: string[]
  unavailableReasons: ReasonsByCakeType
  unavailableCodes: CodesByCakeType
  /** "Desde $X por kg" en cada tipo en que se ofrece. */
  pricePerKgFrom: PriceByCakeType
}

/** Cómo se ve un sabor en la vista previa; lo elige la pastelería en el admin (D50). */
export type FillingPreviewStyle =
  | 'smooth'
  | 'fruit_slices'
  | 'fruit_chunks'
  | 'cookie_chunks'
  | 'sprinkles'
  | 'crumbles'
  | 'nut_pieces'
  | 'round_chips'

export type FillingFlavorOption = {
  slug: string
  name: string
  previewColor: string | null
  previewStyle: FillingPreviewStyle
  /** Color de las rebanadas, los trozos, el granillo o los grumitos más rojos; `null` en un relleno liso. */
  previewColorSecondary: string | null
  isCombinable: boolean
  allowedCakeTypes: string[]
  unavailableReasons: ReasonsByCakeType
  unavailableCodes: CodesByCakeType
  /** Precio propio del sabor por tipo; sin él, cuesta lo de su base. */
  pricePerKgByCakeType: PriceByCakeType
}

export type FillingBaseOption = {
  slug: string
  name: string
  previewColor: string | null
  maxFlavors: number
  /** Cargo por kilo del relleno combinado ("5.00"). */
  combinedExtraPerKg: string
  allowedCakeTypes: string[]
  unavailableReasons: ReasonsByCakeType
  unavailableCodes: CodesByCakeType
  pricePerKgByCakeType: PriceByCakeType
  flavors: FillingFlavorOption[]
}

/** Un nombre de referencia de la pastelería: no limita los colores que se eligen, solo da el "parecido a". */
export type CoverageColorOption = { slug: string; name: string; previewColor: string }

/** Cómo se cobra una decoración (regla 6.1): incluida, precio fijo o por cotizar. */
export type DecorationPricing = 'included' | 'fixed' | 'quote'

/**
 * Una decoración o un diseño del paso 6 (D53). Los precios llegan de la API: uno fijo sin precio (PENDIENTE) viene no
 * disponible con "Precio por confirmar" y se activa solo cuando la pastelería lo captura (D39). Qué dibuja la vista
 * previa y cómo se agrupa lo decide el identificador (`cakeDecorations.ts`).
 */
export type DecorationOption = {
  slug: string
  name: string
  description: string
  pricing: DecorationPricing
  /** Monto como texto; `null` si no lo lleva o es PENDIENTE. */
  price: string | null
  /** Por cotizar: el pedido queda en pausa hasta que la pastelería dé el precio. */
  requiresQuote: boolean
  available: boolean
  unavailableReason: string | null
  /** Solo las chispas: el sabor de relleno o el pan de donde salen su estilo y sus colores en la vista previa (D54). */
  previewFlavor: string | null
  previewBread: string | null
}

export type CakeDesignLimits = {
  peoplePerKg: number
  minCustomKg: number
  maxOnlineKg: number
  /** Precio de la oblea (regla 6.3); `null` es PENDIENTE: se ve desactivada con "Precio por confirmar" (D39). */
  waferPrice: string | null
  /** La hoja carta (21.6 × 27.9 cm): ninguna oblea pasa de ahí, en cualquier orientación. */
  waferMaxWidthCm: number
  waferMaxHeightCm: number
  /** Palabras que la pastelería sugiere para el mensaje (4): es una sugerencia, no bloquea. */
  messageSuggestedMaxWords: number
}

/** Kilos mínimos para un número de pisos (regla 3.3, D50): con menos kilos, esos pisos no se eligen. */
export type TierMinimum = { tiers: number; minKg: number }

/**
 * Un molde de la pastelería (D52): los kilos que rinde y sus medidas en cm. Solo alimenta el tamaño de la vista previa;
 * la interfaz no muestra medidas.
 */
export type CakeMold = {
  form: 'round' | 'rectangular'
  kg: number
  /** El diámetro en un molde redondo; el largo en uno rectangular. */
  lengthCm: number
  /** El ancho en un molde rectangular; `null` en uno redondo. */
  widthCm: number | null
}

/** Peso y personas de un pastel del catálogo; `null` es un dato que aún no se define. */
export type CakeSize = { approxWeightKg: string | null; servings: number | null }

export type SmallerAlternatives = { showcaseCake: CakeSize | null; miniCake: CakeSize | null }

export type CakeDesignOptions = {
  cakeTypes: CakeTypeOption[]
  breads: BreadOption[]
  fillingBases: FillingBaseOption[]
  coverageColors: CoverageColorOption[]
  decorations: DecorationOption[]
  limits: CakeDesignLimits
  /** Una por número de pisos, en orden; su largo es el máximo de pisos. */
  tierMinimums: TierMinimum[]
  /** Moldes de la pastelería; vacío si la API no los manda (la vista previa usa un tamaño de respaldo). */
  cakeMolds: CakeMold[]
  smallerAlternatives: SmallerAlternatives
}

/** Lo que el precio necesita. Forma y pisos no cambian el precio, así que no van. Los kilos los calcula la API. */
export type CakeDesignPriceRequest = {
  people: number
  cakeType: string
  bread: string
  fillingBase: string | null
  fillingFlavors: string[]
  /** La decoración elegida y disponible, o `null`. El color no cambia el precio y no va. */
  decoration: string | null
  /** Lleva oblea (con precio). El acomodo de la oblea y del mensaje no cambia el precio y no va. */
  wafer: boolean
  /** Total estimado sin sabores todavía: la API cuenta el precio general de la base. */
  estimate: boolean
}

/** Kilos que la API calculó por personas (regla 3.1) y dónde quedan contra el mínimo y el máximo en línea. */
export type PeopleSize = {
  people: number
  /** Personas entre personas por kilo, de .5 hacia arriba, sin el mínimo ("Aprox. 2 kg para 15 personas"). */
  roundedKg: number
  /** Kilos del pedido: nunca menos que el mínimo. */
  kg: number
  belowMinimum: boolean
  aboveMaximum: boolean
  minimumPeople: number
  maxOnlinePeople: number
  /** El mayor número de pisos que permiten los kilos (regla 3.3, lo decide la API). */
  maxTiers: number
}

/** Los montos del pedido, tal como los calcula la API (texto decimal, "3825.00"); el navegador nunca los calcula. */
export type QuoteBreakdown = {
  kg: number
  pricePerKg: string
  cakeSubtotal: string
  wafer: string
  decoration: string
  total: string
  requiresQuote: boolean
}

/** La base del pastel: su depósito va aparte del pedido y se devuelve al regresarla (regla 7). */
export type StandDeposit = { minKg: number; maxKg: number; deposit: string; returnDays: number }

/** Anticipo, lo que se paga hoy y lo que queda para la entrega (regla 10). El envío se decide en el carrito. */
export type PaymentSummary = {
  advancePercent: number
  advance: string
  baseDeposit: string
  deliveryFee: string
  payToday: string
  payOnDelivery: string
}

/**
 * Desglose del precio que esta pantalla usa. Con más personas de las que se piden en línea, sin montos. `rejected`: la
 * API rechazó la elección (400) pero mandó los kilos por personas, así el paso 1 sigue; no hay total.
 */
export type CakeDesignQuote = {
  total: string | null
  pricePerKg: string | null
  /** El desglose de la revisión (paso 8); `null` si la API no lo mandó completo. */
  breakdown: QuoteBreakdown | null
  /** La base que toca al pedido (regla 7); `null` sin base. */
  stand: StandDeposit | null
  /** Lo que se paga hoy (regla 10); `null` con una decoración por cotizar. */
  payment: PaymentSummary | null
  size: PeopleSize | null
  /** El total es un estimado sin sabores: ningún pedido lo acepta. */
  isEstimate: boolean
  rejected: boolean
  /** Con `rejected`, el primer motivo de la API ("Ese pan no existe o no está disponible."). */
  rejectedReason: string | null
}

type Raw = Record<string, unknown>

const SLUG = /^[-a-zA-Z0-9_]+$/
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const WEIGHT = /^\d{1,2}(?:\.\d)?$/
// Kilos y medidas de un molde, con un decimal ("51.5").
const MOLD_NUMBER = /^\d{1,3}(?:\.\d)?$/
// Los topes del backend (`MOLD_MAX_KG` y `MOLD_MAX_CM`).
const MOLD_MAX_KG = 100
const MOLD_MAX_CM = 150
// `max_length` de los nombres de las opciones en el backend.
const MAX_NAME_LENGTH = 120
const DECORATION_PRICINGS = new Set<string>(['included', 'fixed', 'quote'])
const BREAD_MODES = new Set<string>(['extra_per_kg', 'full_price_per_kg'])
const CODES = new Set<string>(['not_offered', 'not_combinable', 'only_in'])
// Un estilo que esta versión no conoce se ve liso.
const PREVIEW_STYLES = new Set<string>([
  'smooth',
  'fruit_slices',
  'fruit_chunks',
  'cookie_chunks',
  'sprinkles',
  'crumbles',
  'nut_pieces',
  'round_chips',
])

function previewStyle(value: unknown): FillingPreviewStyle {
  return typeof value === 'string' && PREVIEW_STYLES.has(value) ? (value as FillingPreviewStyle) : 'smooth'
}

function code(value: unknown): UnavailableCode | null {
  return typeof value === 'string' && CODES.has(value) ? (value as UnavailableCode) : null
}

function slugList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => slug(entry) !== null) : []
}

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function slug(value: unknown): string | null {
  return typeof value === 'string' && SLUG.test(value) && value.length <= 80 ? value : null
}

function name(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null
}

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH * 2) : ''
}

function color(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : null
}

function count(value: unknown, min = 0): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : null
}

function money(value: unknown): string | null {
  return typeof value === 'string' && PRICE_PATTERN.test(value) ? value : null
}

/** Un diccionario por tipo de pastel con texto; las entradas que no sirven se descartan. */
function textByType(value: unknown, pick: (entry: unknown) => string | null): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {}
  const entries = Object.entries(value).flatMap(([key, entry]) => {
    const parsed = pick(entry)
    return slug(key) && parsed !== null ? [[key, parsed] as const] : []
  })
  return Object.freeze(Object.fromEntries(entries))
}

function list<T>(value: unknown, parse: (entry: unknown) => T | null, what: string): T[] {
  if (!Array.isArray(value)) throw new TypeError(`${what}: la API no mandó una lista.`)
  const parsed = value.map(parse).filter((entry): entry is T => entry !== null)
  if (parsed.length < value.length) console.warn(`Se descartaron ${value.length - parsed.length} de ${value.length} ${what}.`)
  return parsed
}

function parseCakeType(data: unknown): CakeTypeOption | null {
  if (!isRecord(data)) return null
  const value = slug(data.value)
  const label = name(data.label)
  return value && label ? { value, label } : null
}

function parseBread(data: unknown): BreadOption | null {
  if (!isRecord(data)) return null
  const breadSlug = slug(data.slug)
  const breadName = name(data.name)
  if (!breadSlug || !breadName || typeof data.pricing_mode !== 'string' || !BREAD_MODES.has(data.pricing_mode)) return null
  return {
    slug: breadSlug,
    name: breadName,
    description: optionalText(data.description),
    pricingMode: data.pricing_mode as BreadPricingMode,
    includedFilling: optionalText(data.included_filling),
    previewColor: color(data.preview_color),
    previewColorBottom: color(data.preview_color_bottom),
    includedFillingStyle: previewStyle(data.included_filling_preview_style),
    includedFillingColorSecondary: color(data.included_filling_preview_color_secondary),
    allowedCakeTypes: slugList(data.allowed_cake_types),
    unavailableReasons: textByType(data.unavailable_reasons, name),
    unavailableCodes: textByType(data.unavailable_codes, code) as CodesByCakeType,
    pricePerKgFrom: textByType(data.price_per_kg_from, money),
  }
}

function parseFlavor(data: unknown): FillingFlavorOption | null {
  if (!isRecord(data)) return null
  const flavorSlug = slug(data.slug)
  const flavorName = name(data.name)
  if (!flavorSlug || !flavorName) return null
  return {
    slug: flavorSlug,
    name: flavorName,
    previewColor: color(data.preview_color),
    previewStyle: previewStyle(data.preview_style),
    previewColorSecondary: color(data.preview_color_secondary),
    isCombinable: data.is_combinable === true,
    allowedCakeTypes: slugList(data.allowed_cake_types),
    unavailableReasons: textByType(data.unavailable_reasons, name),
    unavailableCodes: textByType(data.unavailable_codes, code) as CodesByCakeType,
    pricePerKgByCakeType: textByType(data.price_per_kg_by_cake_type, money),
  }
}

function parseBase(data: unknown): FillingBaseOption | null {
  if (!isRecord(data)) return null
  const baseSlug = slug(data.slug)
  const baseName = name(data.name)
  const maxFlavors = count(data.max_flavors, 1)
  const extra = money(data.combined_extra_per_kg)
  if (!baseSlug || !baseName || maxFlavors === null || extra === null) return null
  return {
    slug: baseSlug,
    name: baseName,
    previewColor: color(data.preview_color),
    maxFlavors,
    combinedExtraPerKg: extra,
    allowedCakeTypes: slugList(data.allowed_cake_types),
    unavailableReasons: textByType(data.unavailable_reasons, name),
    unavailableCodes: textByType(data.unavailable_codes, code) as CodesByCakeType,
    pricePerKgByCakeType: textByType(data.price_per_kg_by_cake_type, money),
    flavors: Array.isArray(data.flavors) ? data.flavors.map(parseFlavor).filter((f): f is FillingFlavorOption => f !== null) : [],
  }
}

function parseCoverageColor(data: unknown): CoverageColorOption | null {
  if (!isRecord(data)) return null
  const colorSlug = slug(data.slug)
  const colorName = name(data.name)
  const preview = color(data.preview_color)
  return colorSlug && colorName && preview ? { slug: colorSlug, name: colorName, previewColor: preview } : null
}

function parseDecoration(data: unknown): DecorationOption | null {
  if (!isRecord(data)) return null
  const decorationSlug = slug(data.slug)
  const decorationName = name(data.name)
  if (!decorationSlug || !decorationName || typeof data.pricing !== 'string' || !DECORATION_PRICINGS.has(data.pricing)) return null
  return {
    slug: decorationSlug,
    name: decorationName,
    description: optionalText(data.description),
    pricing: data.pricing as DecorationPricing,
    price: money(data.price),
    requiresQuote: data.requires_quote === true,
    // Solo un `true` explícito la deja elegir: una opción dudosa no se ofrece.
    available: data.available === true,
    unavailableReason: name(data.unavailable_reason),
    previewFlavor: slug(data.preview_flavor),
    previewBread: slug(data.preview_bread),
  }
}

function parseTier(data: unknown): TierMinimum | null {
  if (!isRecord(data)) return null
  const tiers = count(data.tiers, 1)
  const minKg = count(data.min_kg)
  return tiers !== null && minKg !== null ? { tiers, minKg } : null
}

/** Una medida en cm con un decimal ("51.5", "21.6"): la de un molde o la de la hoja carta. */
function cmNumber(value: unknown): number | null {
  if (typeof value !== 'string' || !MOLD_NUMBER.test(value)) return null
  const parsed = Number(value)
  return parsed > 0 ? parsed : null
}

function parseMold(data: unknown): CakeMold | null {
  if (!isRecord(data) || (data.form !== 'round' && data.form !== 'rectangular')) return null
  const kg = cmNumber(data.kg)
  const lengthCm = cmNumber(data.length_cm)
  const widthCm = cmNumber(data.width_cm)
  // Un dedazo en el admin (kilos o medidas absurdos) no entra: sacaría al pastel de la tarjeta.
  if (kg === null || lengthCm === null || kg > MOLD_MAX_KG || lengthCm > MOLD_MAX_CM || (widthCm !== null && widthCm > MOLD_MAX_CM)) return null
  // Un rectangular sin ancho no se puede dibujar; un redondo ignora el ancho.
  if (data.form === 'rectangular') return widthCm === null ? null : { form: data.form, kg, lengthCm, widthCm }
  return { form: data.form, kg, lengthCm, widthCm: null }
}

function parseSize(data: unknown): CakeSize | null {
  if (!isRecord(data)) return null
  const weight = typeof data.approx_weight_kg === 'string' && WEIGHT.test(data.approx_weight_kg) ? data.approx_weight_kg : null
  const servings = count(data.servings, 1)
  return weight === null && servings === null ? null : { approxWeightKg: weight, servings }
}

function parseLimits(data: unknown): CakeDesignLimits {
  if (!isRecord(data)) throw new TypeError('Los límites de "Diseña tu pastel" no tienen la forma esperada.')
  const peoplePerKg = count(data.people_per_kg, 1)
  const minCustomKg = count(data.min_custom_kg, 1)
  const maxOnlineKg = count(data.max_online_kg)
  if (peoplePerKg === null || minCustomKg === null || maxOnlineKg === null) {
    throw new TypeError('Los límites de "Diseña tu pastel" no tienen la forma esperada.')
  }
  const waferMaxWidthCm = cmNumber(data.wafer_max_width_cm)
  const waferMaxHeightCm = cmNumber(data.wafer_max_height_cm)
  const messageSuggestedMaxWords = count(data.message_suggested_max_words, 1)
  // `null` es PENDIENTE; cualquier otra cosa que no sea un monto no se ofrece.
  const waferPrice = data.wafer_price === null ? null : money(data.wafer_price)
  if (waferMaxWidthCm === null || waferMaxHeightCm === null || messageSuggestedMaxWords === null) {
    throw new TypeError('Los límites de "Diseña tu pastel" no tienen la forma esperada.')
  }
  return { peoplePerKg, minCustomKg, maxOnlineKg, waferPrice, waferMaxWidthCm, waferMaxHeightCm, messageSuggestedMaxWords }
}

/**
 * Valida las opciones. Una opción con otra forma se descarta; sin tipos, panes, bases, colores, límites o pisos la
 * pantalla no se puede armar, y eso es un `TypeError` para que muestre su error en vez de un paso vacío.
 */
export function parseCakeDesignOptions(data: unknown): CakeDesignOptions {
  if (!isRecord(data)) throw new TypeError('Las opciones de "Diseña tu pastel" no tienen la forma esperada.')
  const options: CakeDesignOptions = {
    cakeTypes: list(data.cake_types, parseCakeType, 'tipos de pastel'),
    breads: list(data.breads, parseBread, 'panes'),
    fillingBases: list(data.filling_bases, parseBase, 'bases de relleno'),
    // La lista ya no limita ningún color: es la tabla de nombres del "parecido a". Vacía o dañada, el diseño sigue sin ella.
    coverageColors: Array.isArray(data.coverage_colors) ? list(data.coverage_colors, parseCoverageColor, 'nombres de color') : [],
    decorations: list(data.decorations, parseDecoration, 'decoraciones'),
    limits: parseLimits(data.limits),
    // Los pisos van del 1 al máximo, sin huecos: se cortan en el primero que falte.
    tierMinimums: list(data.tier_minimums, parseTier, 'mínimos por pisos')
      .sort((a, b) => a.tiers - b.tiers)
      .filter((tier, index) => tier.tiers === index + 1),
    // Sin moldes (o con moldes dañados) la vista previa sigue: usa su tamaño de respaldo.
    cakeMolds: Array.isArray(data.cake_molds) ? list(data.cake_molds, parseMold, 'moldes') : [],
    smallerAlternatives: {
      showcaseCake: isRecord(data.smaller_alternatives) ? parseSize(data.smaller_alternatives.showcase_cake) : null,
      miniCake: isRecord(data.smaller_alternatives) ? parseSize(data.smaller_alternatives.mini_cake) : null,
    },
  }
  const missing = (['cakeTypes', 'breads', 'fillingBases', 'decorations', 'tierMinimums'] as const).filter(
    (key) => options[key].length === 0,
  )
  if (missing.length > 0) throw new TypeError(`Faltan opciones de "Diseña tu pastel": ${missing.join(', ')}.`)
  return options
}

function parseSizeBlock(data: unknown): PeopleSize | null {
  if (!isRecord(data)) return null
  const people = count(data.people, 1)
  const roundedKg = count(data.rounded_kg)
  const kg = count(data.kg, 1)
  const minimumPeople = count(data.minimum_people)
  const maxOnlinePeople = count(data.max_online_people)
  const maxTiers = count(data.max_tiers, 1)
  if (people === null || roundedKg === null || kg === null || minimumPeople === null || maxOnlinePeople === null || maxTiers === null) {
    return null
  }
  return {
    people,
    roundedKg,
    kg,
    belowMinimum: data.below_minimum === true,
    aboveMaximum: data.above_maximum === true,
    minimumPeople,
    maxOnlinePeople,
    maxTiers,
  }
}

function parseBreakdown(data: Raw): QuoteBreakdown | null {
  const kg = count(data.kg, 1)
  const [pricePerKg, cakeSubtotal, wafer, decoration, total] = [data.price_per_kg, data.cake_subtotal, data.wafer, data.decoration, data.total].map(money)
  if (kg === null || [pricePerKg, cakeSubtotal, wafer, decoration, total].includes(null) || typeof data.requires_quote !== 'boolean') return null
  return {
    kg,
    pricePerKg: pricePerKg as string,
    cakeSubtotal: cakeSubtotal as string,
    wafer: wafer as string,
    decoration: decoration as string,
    total: total as string,
    requiresQuote: data.requires_quote,
  }
}

function parseStand(data: unknown): StandDeposit | null {
  if (!isRecord(data)) return null
  const minKg = count(data.min_kg)
  const maxKg = count(data.max_kg)
  const returnDays = count(data.return_days, 1)
  const deposit = money(data.deposit)
  return minKg === null || maxKg === null || returnDays === null || deposit === null ? null : { minKg, maxKg, deposit, returnDays }
}

function parsePayment(data: unknown): PaymentSummary | null {
  if (!isRecord(data)) return null
  const advancePercent = count(data.advance_percent, 1)
  const [advance, baseDeposit, deliveryFee, payToday, payOnDelivery] = [data.advance, data.base_deposit, data.delivery_fee, data.pay_today, data.pay_on_delivery].map(money)
  if (advancePercent === null || [advance, baseDeposit, deliveryFee, payToday, payOnDelivery].includes(null)) return null
  return {
    advancePercent,
    advance: advance as string,
    baseDeposit: baseDeposit as string,
    deliveryFee: deliveryFee as string,
    payToday: payToday as string,
    payOnDelivery: payOnDelivery as string,
  }
}

/**
 * Valida el desglose del precio; uno con otra forma es un `TypeError`, nunca un precio dudoso. Los montos solo
 * pueden faltar cuando la API dice que son más personas de las que se piden en línea.
 */
export function parseCakeDesignQuote(data: unknown): CakeDesignQuote {
  if (!isRecord(data)) throw new TypeError('El precio no tiene la forma esperada.')
  const size = parseSizeBlock(data.size)
  if (data.size !== null && data.size !== undefined && size === null) throw new TypeError('El tamaño no tiene la forma esperada.')
  const empty = { total: null, pricePerKg: null, breakdown: null, stand: null, payment: null }
  if (size?.aboveMaximum) return { ...empty, size, isEstimate: false, rejected: false, rejectedReason: null }
  const total = money(data.total)
  const pricePerKg = money(data.price_per_kg)
  if (total === null || pricePerKg === null) throw new TypeError('El precio no tiene la forma esperada.')
  return {
    total,
    pricePerKg,
    breakdown: parseBreakdown(data),
    stand: parseStand(data.stand),
    payment: parsePayment(data.payment),
    size,
    isEstimate: data.is_estimate === true,
    rejected: false,
    rejectedReason: null,
  }
}

/** Un 400 de la elección que trae `size`: sin total, pero con los kilos. Sin `size`, `null` (es una falla). */
function rejectedQuote(error: unknown): CakeDesignQuote | null {
  if (!(error instanceof ApiError) || error.status !== 400 || !isRecord(error.body)) return null
  const size = parseSizeBlock(error.body.size)
  if (!size) return null
  // El 400 trae los errores por campo junto a `size` (forma plana, ver la descripción del endpoint): el primero se muestra.
  const reasons = Object.entries(error.body)
    .filter(([field]) => field !== 'size')
    .flatMap(([, value]) => (Array.isArray(value) ? value : []))
    .map((reason) => name(reason))
    .filter((reason): reason is string => reason !== null)
  return { total: null, pricePerKg: null, breakdown: null, stand: null, payment: null, size, isEstimate: false, rejected: true, rejectedReason: reasons[0] ?? null }
}

/**
 * Corte de 10 s, como el resto de las peticiones. Solo en desarrollo, las pruebas E2E lo bajan con
 * `globalThis.__cakeDesignTimeoutMs`; en el build la rama desaparece.
 */
function withTimeout(signal: AbortSignal): AbortSignal {
  const ms = import.meta.env.DEV ? devRequestTimeoutMs('__cakeDesignTimeoutMs') : REQUEST_TIMEOUT_MS
  return AbortSignal.any([signal, AbortSignal.timeout(ms)])
}

/** Opciones vigentes, sin caché: un cambio del admin se ve en la siguiente visita. */
export async function getCakeDesignOptions(signal: AbortSignal): Promise<CakeDesignOptions> {
  return parseCakeDesignOptions(await getJson(['cake-designs', 'options'], { signal: withTimeout(signal) }))
}

/** Precio de un diseño. El servidor lo calcula todo; aquí solo se manda lo elegido. */
export async function getCakeDesignQuote(request: CakeDesignPriceRequest, signal: AbortSignal): Promise<CakeDesignQuote> {
  const body = {
    people: request.people,
    cake_type: request.cakeType,
    bread: request.bread,
    ...(request.fillingBase ? { filling_base: request.fillingBase, filling_flavors: request.fillingFlavors } : {}),
    ...(request.decoration ? { decoration: request.decoration } : {}),
    ...(request.wafer ? { wafer: true } : {}),
    ...(request.estimate ? { estimate: true } : {}),
  }
  let data: unknown
  try {
    data = await postJson(['cake-designs', 'price'], body, { signal: withTimeout(signal) })
  } catch (error) {
    const rejected = rejectedQuote(error)
    if (rejected) return rejected
    throw error
  }
  return parseCakeDesignQuote(data)
}

/** Para comparar dos montos de la API (nunca para calcular uno). */
export function compareMoney(a: string, b: string): number {
  return Number(a) - Number(b)
}
