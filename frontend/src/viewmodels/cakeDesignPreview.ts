import type { BreadOption, CakeDesignOptions, FillingFlavorOption, FillingPreviewStyle } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import type { CakeComb, CakeFinish, CakeLayer, CakePieces, CakeShape, CakeSpread, CakeTier, CakeTint, ShapeColor } from '../three/cakeShape.ts'
import type { SceneColor } from '../three/palette.ts'
import { clampCm, tierSizes, UNITS_PER_CM } from './cakeMolds.ts'
import type { Footprint } from './cakeMolds.ts'
import { decorationShape } from './cakeDecorations.ts'
import { cakeLidShape, lidFor, previewSize, smallMold } from './cakeLid.ts'
import type { LoadedImage } from './cakeLid.ts'
import { dataColor, finishFor, piecesFor } from './fillingPieces.ts'
import type { MessageMetrics } from './messageGeometry.ts'
import { DECORATION_STEP, LID_STEP } from './cakeDesignSteps.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'

/**
 * La vista previa de "Diseña tu pastel" por etapas, como `design/referencia/pastel-css3d.js` y el libro de marca
 * ("Cotizador 3D"), con lo que pidió la dueña (D50 y D51): el pan con miga, en dos colores si el pan los tiene
 * (choco-vainilla: en cada piso, todo el pan que va debajo del relleno es de vainilla y todo el que va encima, de
 * chocolate); el matiz del tipo (tres leches más claro, envinado hacia el vino); el relleno al centro del costado con
 * su estilo (liso, rebanadas o trozos de fruta, trozos de galleta o granillo; mitad y mitad con dos sabores); con
 * queso o con flan, la crema abajo y el sabor arriba; todo relleno lleva una capa delgada de crema pastelera blanca
 * arriba y otra abajo (D52); desde el paso 5, la cobertura de crema pastelera en su color, sin perlas; y desde el paso 6,
 * la decoración elegida encima de la cobertura, con su color (D53). "Sin decoración" y "Otra decoración" muestran solo
 * la cobertura.
 *
 * Tamaño (D52): el de cada piso sale de los moldes de la pastelería según los kilos (`cakeMolds.ts`) y todos los pisos
 * tienen el mismo alto. El plato y la cámara se acomodan al pastel en la escena.
 *
 * Los colores de la comida son los `preview_color` de la API, que la pastelería edita; los matices, la corteza y el
 * fondo cremoso de algunos rellenos se describen como mezclas con tokens y los resuelve la escena. Sin React ni three.
 */

/** Alto de todos los pisos, sin importar el molde ni los kilos: un poco menos que el de los pisos de antes (de 1.04 a 0.62). */
const TIER_HEIGHT = 0.72
/** Matiz del pan por tipo de pastel: hacia `betun` (tres leches) o hacia `mermelada`, el vino (envinado). */
const TYPE_TINT: Record<string, { toward: SceneColor; amount: number }> = {
  tres_leches: { toward: 'betun', amount: 0.12 },
  envinado: { toward: 'mermelada', amount: 0.2 },
}
const CRUST = { toward: 'mermelada' as const, amount: 0.18 }
/** Fondo de crema de los rellenos con trozos de galleta o granillo: `betun` con un poco del color del sabor. */
const CREAMY_BODY = 0.35
/** Respaldo del pan si ninguna opción trae color: un token, nunca un color inventado. */
const FALLBACK_BREAD: SceneColor = 'harina'

const mix = (from: ShapeColor, toward: ShapeColor, amount: number): ShapeColor => ({ mix: [from, toward], amount })

/** La crema pastelera: blanca, el `betun` de la paleta. Todo relleno la lleva arriba y abajo (D52). */
const PASTRY_CREAM: SceneColor = 'betun'

/**
 * El peine del peinado lateral (tanda 4), en cm del pastel real: un surco cada 6 mm, de 1.2 mm de hondo. Es el aspecto de la vista
 * previa, como el untado de D81, no una regla de negocio. Se pasa a unidades de escena con la escala de los moldes, así un pastel
 * chico lleva menos surcos que uno grande, como con un peine de verdad.
 */
const SIDE_COMB_CM = { pitch: 0.6, depth: 0.12 }
const SIDE_COMB: CakeComb = { pitch: SIDE_COMB_CM.pitch * UNITS_PER_CM, depth: SIDE_COMB_CM.depth * UNITS_PER_CM }

type FlavorLook = {
  body: ShapeColor
  pieces: CakePieces | null
  /** Mermelada o cajeta: la franja brilla con su textura (tanda 4). */
  finish?: CakeFinish | null
  /** El fondo ya es crema pastelera (con el sabor y sus trozos encima): no lleva las capas delgadas de crema. */
  creamy?: boolean
}

/**
 * Estilos cuyo fondo es la crema pastelera con un poco del color del sabor, y no el color del sabor solo: el granillo de
 * choco-vainilla, la galleta, las chispas redondas. Ya se ven como crema con el sabor encima (la dueña los aprobó así), así
 * que no llevan las capas delgadas de crema arriba y abajo.
 */
const CREAMY_STYLES: readonly FillingPreviewStyle[] = ['cookie_chunks', 'sprinkles', 'round_chips']

/** Cómo se ve un sabor: el color de la franja y, si los lleva, sus trozos (estilo que elige la pastelería). */
function flavorLook(flavor: FillingFlavorOption): FlavorLook | null {
  const color = dataColor(flavor.previewColor)
  if (!color) return null
  const accent = dataColor(flavor.previewColorSecondary)
  const finish = finishFor(flavor.previewStyle)
  if (!accent || finish || flavor.previewStyle === 'smooth') return { body: color, pieces: null, finish }
  const creamy = CREAMY_STYLES.includes(flavor.previewStyle)
  return { body: creamy ? mix(PASTRY_CREAM, color, CREAMY_BODY) : color, pieces: piecesFor(flavor.previewStyle, color, accent), creamy }
}

/**
 * El relleno incluido de un pan de precio completo (Choco-pingüino, Red velvet): su crema (la del color que guarda la
 * pastelería, café claro en Choco-pingüino; sin color, la crema pastelera blanca) y, encima, lo que la pastelería eligió
 * para ese pan. Se ve desde el paso 3, porque el paso del relleno se salta.
 */
function includedFillingLook(bread: BreadOption): FlavorLook {
  const accent = dataColor(bread.includedFillingColorSecondary)
  const body = dataColor(bread.includedFillingColor) ?? PASTRY_CREAM
  const finish = finishFor(bread.includedFillingStyle)
  // Es crema: con trozos encima se unta apenas, como las otras cremas con trozos.
  return { body, pieces: accent && !finish ? piecesFor(bread.includedFillingStyle, null, accent) : null, finish, creamy: true }
}

type Bread = { top: ShapeColor; bottom: ShapeColor }

/** Una capa de pan de un solo color, con miga. */
const breadLayer = (height: number, color: ShapeColor): CakeLayer => ({ height, colors: [color], crumb: true })

/** Una capa delgada de crema pastelera, arriba y abajo del sabor, untada a mano (tanda 4); teñida si toca una mermelada o cajeta. */
const pastryCreamLayer = (height: number, tint: CakeTint | null = null): CakeLayer => ({
  height,
  colors: [PASTRY_CREAM],
  spread: 'cream',
  ...(tint ? { tint } : {}),
})

/**
 * El tinte de la crema pastelera que toca el sabor (tanda 4): la mermelada y la cajeta se mezclan con ella ("físicamente se
 * unifican y se mezclan"), con el color de cada mitad; la fruta, la galleta, las chispas, los grumitos y la nuez, no. `null` si
 * ninguna mitad tiñe.
 */
function tintFrom([first, second]: readonly FlavorLook[], toward: CakeTint['toward']): CakeTint | null {
  const tintOf = (look: FlavorLook) => (look.finish ? look.body : null)
  const colors: CakeTint['colors'] = second ? [tintOf(first), tintOf(second)] : [tintOf(first)]
  return colors.some(Boolean) ? { colors, toward } : null
}

/**
 * Cómo se unta un sabor solo (tanda 4): la crema lisa, a mano; la mermelada, la cajeta y las cremas con trozos encima, apenas
 * (sus trozos siguen asomando); los rellenos con trozos que no son crema (fruta, grumitos, nuez) quedan rectos.
 */
function spreadOf(look: FlavorLook): CakeSpread | null {
  if (look.finish) return 'mild'
  if (!look.pieces) return 'cream'
  return look.creamy ? 'mild' : null
}

/**
 * Las capas del relleno entre el pan, de abajo hacia arriba: lo de adentro (la crema de la base, si la hay, y el sabor) con una
 * capa delgada de crema pastelera en cada extremo, junto al pan (tanda 4: "aunque sea flan o queso, la crema va en los extremos de
 * las bases"). Si el sabor ya es crema, no las lleva y su franja se queda con su grueso.
 */
function creamAround(inner: readonly CakeLayer[], creamy: boolean, cream: number, tints: { below: CakeTint | null; above: CakeTint | null }): CakeLayer[] {
  if (!creamy) return [pastryCreamLayer(cream, tints.below), ...inner, pastryCreamLayer(cream, tints.above)]
  const flavor = inner[inner.length - 1]
  return [...inner.slice(0, -1), { ...flavor, height: flavor.height + 2 * cream }]
}

type FillingLook = {
  flavors: FlavorLook[]
  /** La crema de la base con queso o con flan; `null` en la base normal. */
  cream: ShapeColor | null
  /** El relleno viene con el pan: una sola franja de crema con sus trozos, sin las capas delgadas. */
  included?: boolean
}

/**
 * Las capas del costado de abajo hacia arriba: corteza, pan, relleno (si hay), pan y corteza. En un pan de dos
 * colores, el pan de abajo (y su corteza) es todo del color de abajo y el de arriba, todo del de arriba (D51). El
 * relleno lleva una capa delgada de crema pastelera en cada extremo, junto al pan (con queso o flan, la crema de la base y el
 * sabor van entre las dos), salvo los que ya son crema (D52).
 */
function layers(bread: Bread, filling: FillingLook | null): CakeLayer[] {
  const crustBottom: CakeLayer = { height: 0.04, colors: [mix(bread.bottom, CRUST.toward, CRUST.amount)], crumb: true }
  const crustTop: CakeLayer = { height: 0.05, colors: [mix(bread.top, CRUST.toward, CRUST.amount)], crumb: true }
  if (!filling || filling.flavors.length === 0) {
    return [crustBottom, breadLayer(0.46, bread.bottom), breadLayer(0.45, bread.top), crustTop]
  }
  const [first, second] = filling.flavors
  // El acabado va solo si alguna mitad lo lleva: las capas de siempre quedan igual.
  const finishes = (looks: FlavorLook[]) => (looks.some((look) => look.finish) ? { finishes: looks.map((look) => look.finish ?? null) } : {})
  // Mitad y mitad, la franja queda recta: cada mitad es su propia malla y sus ondas no se juntarían.
  const spread = (look: FlavorLook) => {
    const level = spreadOf(look)
    return level ? { spread: level } : {}
  }
  const flavorLayer = (height: number): CakeLayer =>
    second
      ? { height, colors: [first.body, second.body], pieces: [first.pieces, second.pieces], ...finishes([first, second]) }
      : { height, colors: [first.body], pieces: [first.pieces], ...finishes([first]), ...spread(first) }
  if (filling.included) {
    return [crustBottom, breadLayer(0.36, bread.bottom), flavorLayer(0.2), breadLayer(0.35, bread.top), crustTop]
  }
  // Con dos sabores, las capas de crema son de todo el piso: basta que uno de los dos no sea ya crema.
  const creamy = filling.flavors.every((flavor) => flavor.creamy)
  if (filling.cream) {
    // Con queso o con flan (decisión de la dueña, D50): la crema de la base abajo y el sabor arriba, las dos entre la crema
    // pastelera, que va junto al pan.
    const base: CakeLayer = { height: 0.12, colors: [filling.cream], spread: 'cream' }
    return [
      crustBottom,
      breadLayer(0.28, bread.bottom),
      // La crema de abajo toca la de la base, no el sabor: solo la de arriba se tiñe.
      ...creamAround([base, flavorLayer(0.13)], creamy, 0.04, { below: null, above: tintFrom(filling.flavors, 'below') }),
      breadLayer(0.3, bread.top),
      crustTop,
    ]
  }
  const tints = { below: tintFrom(filling.flavors, 'above'), above: tintFrom(filling.flavors, 'below') }
  return [crustBottom, breadLayer(0.34, bread.bottom), ...creamAround([flavorLayer(0.15)], creamy, 0.04, tints), breadLayer(0.34, bread.top), crustTop]
}

/** Un piso con las medidas de su molde: el radio en redondo; en rectangular, la mitad del largo y del ancho. */
function tierShape(size: Footprint, form: 'round' | 'rectangular'): Pick<CakeTier, 'radius' | 'halfWidth' | 'halfDepth' | 'height'> {
  const halfLength = (clampCm(size.lengthCm) * UNITS_PER_CM) / 2
  const halfWidth = (clampCm(size.widthCm) * UNITS_PER_CM) / 2
  if (form === 'round') return { radius: halfLength, height: TIER_HEIGHT }
  return { radius: halfWidth, halfWidth: halfLength, halfDepth: halfWidth, height: TIER_HEIGHT }
}

type PreviewInput = {
  draft: CakeDesignDraft
  design: DesignDerived
  options: CakeDesignOptions
  current: number
  /** El pan que se muestra mientras no se elige uno (el del estimado): "Paso 1: solo el pan de vainilla". */
  defaultBread: BreadOption | null
  /** Lo que mide el texto del mensaje con su letra, y la imagen de la oblea cuando ya cargó (paso 7). */
  metrics: MessageMetrics
  waferImage: LoadedImage | null
}

export function designPreview({ draft, design, options, current, defaultBread, metrics, waferImage }: PreviewInput): CakeShape {
  const bread = design.bread ?? defaultBread
  const top = dataColor(bread?.previewColor) ?? dataColor(defaultBread?.previewColor) ?? FALLBACK_BREAD
  // Un pan de dos colores trae el de abajo aparte (el admin lo controla); sin él, es de un solo color.
  const bottom = dataColor(bread?.previewColorBottom) ?? top
  const tint = design.cakeType ? TYPE_TINT[design.cakeType.value] : undefined
  const tinted = (color: ShapeColor) => (tint ? mix(color, tint.toward, tint.amount) : color)
  const breadColors: Bread = { top: tinted(top), bottom: bottom === top ? tinted(top) : tinted(bottom) }

  const showFilling = !design.fillingIncluded && design.base !== null && design.flavors.length > 0
  const looks = showFilling ? design.flavors.map(flavorLook).filter((look): look is FlavorLook => look !== null) : []
  const filling: FillingLook | null = design.fillingIncluded && design.bread
    ? { flavors: [includedFillingLook(design.bread)], cream: null, included: true }
    : looks.length
      ? { flavors: looks, cream: dataColor(design.base?.previewColor) }
      : null
  const frosting = current >= 5 && design.coverage ? (dataColor(design.coverage) ?? undefined) : undefined

  const sides = layers(breadColors, filling)
  // El peinado lateral (tanda 4) va en la cobertura, en todos los pisos, salvo que la persona lo quite en el paso 5.
  const look = frosting ? { frosting, ...(draft.sideComb ? { comb: SIDE_COMB } : {}) } : { layers: sides }
  // El pastel de vitrina y el mini (tanda 2): su molde real, redondo y de 1 piso, sin recortarlo al tamaño de los pisos por kilos.
  const mold = smallMold(design)
  const form = mold ? 'round' : draft.form
  // Sin kilos de la API todavía, el pastel se ve como el más chico.
  const { kg, tiers: count } = previewSize(draft, design, options)
  const tiers: CakeTier[] = mold
    ? [{ radius: (mold.diameterCm * UNITS_PER_CM) / 2, height: mold.heightCm ? mold.heightCm * UNITS_PER_CM : TIER_HEIGHT, ...look }]
    : tierSizes(options, form, kg, count).map((size) => ({ ...tierShape(size, form), ...look }))
  // La decoración va sobre la cobertura: sin ella (pasos 1 a 4) no se dibuja, aunque ya esté elegida.
  const decoration = frosting && current >= DECORATION_STEP ? decorationShape(draft, design, options) : null
  // El mensaje y la oblea (paso 7) van sobre la tapa del último piso, también en la revisión.
  const lid =
    frosting && current >= LID_STEP
      ? cakeLidShape({ draft, coverage: design.coverage, options, lid: lidFor(draft, design, options), metrics, waferImage })
      : null
  return {
    tiers,
    // La cobertura es solo crema pastelera: la duya y las perlas llegan con la decoración (paso 6), que lleva las suyas.
    festoons: false,
    ...(decoration ? { decoration } : {}),
    ...(lid ? { lid } : {}),
    stand: true,
    form,
    // La base mide un poco más que el piso de abajo: crece y se achica con él.
    fitStand: true,
  }
}
