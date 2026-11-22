import type { CakeDesignOptions } from '../models/cakeDesign.ts'
import type { MessageLayout, WaferLayout, WaferShape } from '../models/cakeDesignLayout.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import { LAYOUT_BOUNDS, messageText, TIER_EDGE_UNITS } from '../models/cakeDesignLayout.ts'
import type { CakeLid } from '../three/cakeShape.ts'
import { clampCm, tierSizes, UNITS_PER_CM } from './cakeMolds.ts'
import { fitWafer, initialWafer } from './lidGeometry.ts'
import type { Lid } from './lidGeometry.ts'
import { BASELINE_BELOW_CENTER, fitMessage, messageFits, messageGeometry } from './messageGeometry.ts'
import type { MessageMetrics } from './messageGeometry.ts'
import { messageInk } from './messageColors.ts'
import { MESSAGE_FONT_FAMILY, MESSAGE_FONT_WEIGHT } from './messageMetrics.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'

/**
 * La tapa del último piso con lo que lleva (paso 7, D55): su medida según el molde, el acomodo permitido de la oblea y del
 * mensaje, y la forma que dibuja la vista previa. Sin React ni three. La tapa sale de los mismos moldes y pisos que el pastel de
 * la vista previa, así el editor de vista superior y el 3D muestran lo mismo.
 */

/**
 * El molde real del pastel de vitrina o del mini (tanda 2): redondo, de 1 piso, con el diámetro y el alto de `sizes`. `null` por
 * kilos o si la API no manda el diámetro (entonces se dibuja como por kilos).
 */
export function smallMold(design: Pick<DesignDerived, 'small' | 'sizeOption'>): { diameterCm: number; heightCm: number | null; lidRadiusCm: number } | null {
  const option = design.small ? design.sizeOption : null
  if (!option?.diameterCm) return null
  // La parte plana de la tapa: la de la API o, sin ella, el diámetro sin el canto del piso (como `round_lid` del backend).
  const lidRadiusCm = option.lidRadiusCm ?? option.diameterCm / 2 - TIER_EDGE_UNITS / UNITS_PER_CM
  return { diameterCm: option.diameterCm, heightCm: option.heightCm, lidRadiusCm }
}

/** Los kilos y los pisos con que se dibuja el pastel: sin kilos de la API, el más chico; los pisos, los que permiten los kilos. */
export function previewSize(draft: Pick<CakeDesignDraft, 'tiers'>, design: Pick<DesignDerived, 'kg' | 'maxTiers'>, options: CakeDesignOptions) {
  return {
    kg: design.kg ?? options.limits.minCustomKg,
    tiers: Math.min(Math.max(draft.tiers, 1), Math.max(design.maxTiers, 1)),
  }
}

/**
 * La parte plana de la tapa del último piso, en cm: el radio en redondo; en rectangular, el largo y el ancho (el radio es la
 * mitad del ancho). Sin el canto redondeado del piso (`TIER_EDGE_UNITS`): la oblea y el mensaje no llegan a él. Las posiciones
 * relativas son al radio de esta parte plana.
 */
export function lidOf(options: CakeDesignOptions, form: Lid['form'], kg: number, tiers: number): Lid {
  const sizes = tierSizes(options, form, kg, tiers)
  const top = sizes[sizes.length - 1]
  const edge = TIER_EDGE_UNITS / UNITS_PER_CM
  const [halfX, halfY] = [clampCm(top.lengthCm) / 2 - edge, clampCm(top.widthCm) / 2 - edge]
  return form === 'round' ? { form, halfX, halfY: halfX, radius: halfX } : { form, halfX, halfY, radius: halfY }
}

export function lidFor(draft: CakeDesignDraft, design: DesignDerived, options: CakeDesignOptions): Lid {
  // El pastel de vitrina y el mini: la tapa de su molde real, sin recortarla al tamaño mínimo de los pisos por kilos (el mini mide 14 cm).
  const mold = smallMold(design)
  if (mold) return { form: 'round', halfX: mold.lidRadiusCm, halfY: mold.lidRadiusCm, radius: mold.lidRadiusCm }
  const { kg, tiers } = previewSize(draft, design, options)
  return lidOf(options, draft.form, kg, tiers)
}

/** La escala más chica de la letra en esa tapa: la letra mínima de la pastelería entre el radio de la parte plana (0 sin mínimo). */
export function minLetterScale(options: CakeDesignOptions, lid: Lid): number {
  const minimum = options.limits.messageMinLetterCm
  return minimum && lid.radius > 0 ? minimum / lid.radius : 0
}

/** "1.5", como el backend (`{minimum:g}`). */
const cm = (value: number) => String(Number(value.toFixed(2)))

/**
 * Lo que impide el mensaje por la letra mínima (tanda 2), o `null`: en una tapa tan chica que ni con la letra más grande se
 * llega al mínimo, ningún mensaje cabe; si no, el texto tiene que caber con la letra en el mínimo. Las mismas frases del
 * servidor cuando rechaza el acomodo.
 */
export function messageLetterProblem(draft: CakeDesignDraft, lid: Lid, metrics: MessageMetrics, options: CakeDesignOptions): string | null {
  const minimum = options.limits.messageMinLetterCm
  if (!minimum || !draft.messageEnabled || messageText(draft.message.text) === '') return null
  const scale = minLetterScale(options, lid)
  if (scale > LAYOUT_BOUNDS.messageScale.max) return `En este pastel no cabe un mensaje con letra de al menos ${cm(minimum)} cm.`
  return messageFits(draft.message, metrics, lid, scale) ? null : `Acorta tu mensaje: con letra de al menos ${cm(minimum)} cm no cabe en el pastel.`
}

/** El acomodo de la oblea que se dibuja y se guarda: el elegido, ajustado a la hoja carta y a la tapa. `null` sin oblea. */
export function effectiveWafer(draft: CakeDesignDraft, lid: Lid, options: CakeDesignOptions): WaferLayout | null {
  return draft.waferEnabled ? fitWafer(draft.wafer ?? initialWafer(lid, options.limits), lid, options.limits) : null
}

/**
 * El acomodo del mensaje que se dibuja y se guarda, ajustado a la tapa y a la letra mínima, con el texto sin renglones vacíos ni
 * espacios en las orillas de cada renglón (`messageText`). `null` sin mensaje (o sin texto).
 */
export function effectiveMessage(draft: CakeDesignDraft, lid: Lid, metrics: MessageMetrics, minScale = 0): MessageLayout | null {
  const text = messageText(draft.message.text)
  return draft.messageEnabled && text !== '' ? fitMessage({ ...draft.message, text }, metrics, lid, minScale) : null
}

/** La imagen de la oblea ya cargada, con su tamaño en píxeles. */
export type LoadedImage = { element: HTMLImageElement; width: number; height: number }

type LidInput = {
  draft: CakeDesignDraft
  /** El color de la cobertura (`#rrggbb`). */
  coverage: string | null
  options: CakeDesignOptions
  lid: Lid
  metrics: MessageMetrics
  waferImage: LoadedImage | null
}

/** Lo que dibuja la vista previa sobre la tapa; `null` si no hay nada que dibujar. La oblea espera a que cargue su imagen. */
export function cakeLidShape({ draft, coverage, options, lid, metrics, waferImage }: LidInput): CakeLid | null {
  const wafer = effectiveWafer(draft, lid, options)
  const message = effectiveMessage(draft, lid, metrics, minLetterScale(options, lid))
  const shape: CakeLid = { unitsPerCm: UNITS_PER_CM }
  if (wafer && waferImage) {
    shape.wafer = {
      shape: wafer.shape,
      widthCm: wafer.widthCm,
      heightCm: wafer.heightCm,
      rotation: wafer.rotation,
      x: wafer.x * lid.radius,
      y: wafer.y * lid.radius,
      image: waferImage.element,
      imageWidth: waferImage.width,
      imageHeight: waferImage.height,
      imageZoom: wafer.imageZoom,
      imageX: wafer.imageX,
      imageY: wafer.imageY,
    }
  }
  if (message) {
    const geometry = messageGeometry(message, metrics, lid.radius)
    shape.message = {
      glyphs: geometry.glyphs,
      fontSizeCm: geometry.fontSizeCm,
      baselineCm: BASELINE_BELOW_CENTER * geometry.fontSizeCm,
      fontFamily: MESSAGE_FONT_FAMILY,
      fontWeight: MESSAGE_FONT_WEIGHT,
      color: messageInk(message.color, coverage),
      bounds: geometry.bounds,
      rotation: message.rotation,
      x: message.x * lid.radius,
      y: message.y * lid.radius,
    }
  }
  return shape.wafer || shape.message ? shape : null
}

const SHAPE_LABELS: Record<WaferShape, string> = { sheet: 'hoja', circle: 'círculo' }

/** "hoja" o "círculo": la forma de la oblea. */
export function shapeLabel(shape: WaferShape) {
  return SHAPE_LABELS[shape]
}

/**
 * El color del mensaje en palabras, o `null` en el automático (negro, que no hace falta decir): "color elegido" o "color más
 * oscuro de tu cobertura". Sin el código (tanda 1) ni el "parecido a" (21 de noviembre): el color lo muestra la muestra redonda.
 */
export function messageColorPhrase(draft: CakeDesignDraft): string | null {
  const { mode, value } = draft.message.color
  if (mode === 'custom') return 'color elegido'
  if (mode === 'tones') return `color ${value === 'light' ? 'más claro' : 'más oscuro'} de tu cobertura`
  return null
}

/**
 * El texto de "Tu pastel" para el paso 7: "Mensaje: Feliz cumpleaños Ana, color elegido. Oblea: círculo, foto.jpg", o que
 * no lleva ninguno. Un mensaje de varios renglones conserva sus saltos (`
`): la vista los muestra con `whitespace-pre-line`.
 */
export function lidSummary(draft: CakeDesignDraft): string {
  const parts: string[] = []
  const text = messageText(draft.message.text)
  if (draft.messageEnabled && text !== '') {
    parts.push(['Mensaje: ' + text, messageColorPhrase(draft)].filter(Boolean).join(', '))
  }
  if (draft.waferEnabled) parts.push(`Oblea: ${[draft.wafer ? shapeLabel(draft.wafer.shape) : null, draft.waferImageName].filter(Boolean).join(', ')}`.replace(/: $/, ''))
  return parts.length ? parts.join('. ') : 'Sin mensaje ni oblea'
}
