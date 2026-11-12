import type { CakeDesignOptions } from '../models/cakeDesign.ts'
import type { MessageLayout, WaferLayout, WaferShape } from '../models/cakeDesignLayout.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import { TIER_EDGE_UNITS } from '../models/cakeDesignLayout.ts'
import { displayHex } from '../models/color.ts'
import type { CakeLid } from '../three/cakeShape.ts'
import { clampCm, tierSizes, UNITS_PER_CM } from './cakeMolds.ts'
import { colorPhrase } from './colors.ts'
import { fitWafer, initialWafer } from './lidGeometry.ts'
import type { Lid } from './lidGeometry.ts'
import { BASELINE_BELOW_CENTER, fitMessage, messageGeometry } from './messageGeometry.ts'
import type { MessageMetrics } from './messageGeometry.ts'
import { messageInk } from './messageColors.ts'
import { MESSAGE_FONT_FAMILY, MESSAGE_FONT_WEIGHT } from './messageMetrics.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'

/**
 * La tapa del último piso con lo que lleva (paso 7, D55): su medida según el molde, el acomodo permitido de la oblea y del
 * mensaje, y la forma que dibuja la vista previa. Sin React ni three. La tapa sale de los mismos moldes y pisos que el pastel de
 * la vista previa, así el editor de vista superior y el 3D muestran lo mismo.
 */

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
  const { kg, tiers } = previewSize(draft, design, options)
  return lidOf(options, draft.form, kg, tiers)
}

/** El acomodo de la oblea que se dibuja y se guarda: el elegido, ajustado a la hoja carta y a la tapa. `null` sin oblea. */
export function effectiveWafer(draft: CakeDesignDraft, lid: Lid, options: CakeDesignOptions): WaferLayout | null {
  return draft.waferEnabled ? fitWafer(draft.wafer ?? initialWafer(lid, options.limits), lid, options.limits) : null
}

/** El acomodo del mensaje que se dibuja y se guarda, ajustado a la tapa. `null` sin mensaje (o sin texto). */
export function effectiveMessage(draft: CakeDesignDraft, lid: Lid, metrics: MessageMetrics): MessageLayout | null {
  return draft.messageEnabled && draft.message.text.trim() !== '' ? fitMessage(draft.message, metrics, lid) : null
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
  const message = effectiveMessage(draft, lid, metrics)
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
 * El color del mensaje en palabras, o `null` en el automático (negro, que no hace falta decir): "color #A1B2C3, parecido a rosa" o
 * "color más oscuro de tu cobertura, #6B2A47".
 */
export function messageColorPhrase(draft: CakeDesignDraft, coverage: string | null, references: CakeDesignOptions['coverageColors']): string | null {
  const { mode, value } = draft.message.color
  const ink = messageInk(draft.message.color, coverage)
  if (mode === 'custom') return `color ${colorPhrase(ink, references)}`
  if (mode === 'tones') return `color ${value === 'light' ? 'más claro' : 'más oscuro'} de tu cobertura, ${displayHex(ink)}`
  return null
}

/** El texto de "Tu pastel" para el paso 7: "Mensaje: Feliz cumpleaños Ana, color #A1B2C3. Oblea: círculo, foto.jpg", o que no lleva ninguno. */
export function lidSummary(draft: CakeDesignDraft, coverage: string | null, references: CakeDesignOptions['coverageColors']): string {
  const parts: string[] = []
  if (draft.messageEnabled && draft.message.text.trim() !== '') {
    parts.push(['Mensaje: ' + draft.message.text.trim(), messageColorPhrase(draft, coverage, references)].filter(Boolean).join(', '))
  }
  if (draft.waferEnabled) parts.push(`Oblea: ${[draft.wafer ? shapeLabel(draft.wafer.shape) : null, draft.waferImageName].filter(Boolean).join(', ')}`.replace(/: $/, ''))
  return parts.length ? parts.join('. ') : 'Sin mensaje ni oblea'
}
