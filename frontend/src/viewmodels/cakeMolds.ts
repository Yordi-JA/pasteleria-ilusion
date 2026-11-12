import type { CakeDesignOptions, CakeMold } from '../models/cakeDesign.ts'

/**
 * El tamaño del pastel de la vista previa según los kilos, con los moldes de la pastelería (D52). Sin React ni three.
 * Las medidas llegan de la API (`cake_molds`, editables en el admin); aquí solo se interpolan y se reparten.
 *
 * Tamaño de un piso: entre dos moldes, se interpolan sus medidas por los kilos; arriba del mayor o debajo del menor, el
 * área crece en proporción a los kilos y la forma sigue igual (la pastelería combina moldes).
 *
 * Varios pisos ("molde descendente", decisión del usuario): cada piso usa un molde más chico que el de abajo y la suma de
 * los pisos da los kilos del pedido. Regla de `tierKilos`:
 *  1. Se parte de un reparto ideal: cada piso pesa `TIER_WEIGHT_RATIO` veces lo que el de abajo.
 *  2. Cada piso de arriba se redondea al kilo del molde real más cercano de esa forma, del piso de abajo hacia arriba.
 *  3. Cada piso debe ser claramente más chico que el de abajo (su área, a lo más `MAX_AREA_STEP` del área del anterior). Si el
 *     redondeo no lo cumple, baja al molde menor siguiente; si ya no hay moldes menores, usa los kilos ideales (y, si hace
 *     falta, los reduce) con el criterio de área.
 *  4. El piso de abajo absorbe la diferencia, así que la suma es exacta (con interpolación entre moldes). Si no queda
 *     claramente más grande que el de arriba, se descarta el redondeo y se usa el reparto ideal, que cumple la regla.
 * Ejemplo: 18 kg en 3 pisos, en redondo y en rectangular, son 8 + 6 + 4.
 */

/** Largo y ancho en cm de un piso; en redondo son iguales (el diámetro). */
export type Footprint = { lengthCm: number; widthCm: number }

/** Cuánto pesa cada piso respecto del de abajo en el reparto ideal (paso 1). */
export const TIER_WEIGHT_RATIO = 0.7
/** Cuánto puede medir de área un piso respecto del de abajo para verse claramente más chico. */
export const MAX_AREA_STEP = 0.9

const lerp = (from: number, to: number, t: number) => from + (to - from) * t
const area = (size: Footprint) => size.lengthCm * size.widthCm

function measures(mold: CakeMold): Footprint {
  return { lengthCm: mold.lengthCm, widthCm: mold.widthCm ?? mold.lengthCm }
}

/** El tamaño del molde para esos kilos, o `null` si la pastelería no tiene moldes de esa forma. */
export function moldFootprint(molds: readonly CakeMold[], form: CakeMold['form'], kg: number): Footprint | null {
  const sorted = molds.filter((mold) => mold.form === form).sort((a, b) => a.kg - b.kg)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last || !(kg > 0)) return null
  // Fuera del rango de los moldes, el área crece (o baja) con los kilos: las medidas, con su raíz.
  if (kg <= first.kg || kg >= last.kg) {
    const edge = kg <= first.kg ? first : last
    const scale = Math.sqrt(kg / edge.kg)
    const base = measures(edge)
    return { lengthCm: base.lengthCm * scale, widthCm: base.widthCm * scale }
  }
  const upper = sorted.findIndex((mold) => mold.kg >= kg)
  const high = sorted[upper]
  const low = sorted[upper - 1]
  const t = (kg - low.kg) / (high.kg - low.kg)
  const a = measures(low)
  const b = measures(high)
  return { lengthCm: lerp(a.lengthCm, b.lengthCm, t), widthCm: lerp(a.widthCm, b.widthCm, t) }
}

/** El reparto ideal: cada piso pesa `TIER_WEIGHT_RATIO` veces lo que el de abajo. De abajo hacia arriba. */
function idealKilos(kg: number, count: number): number[] {
  const weights = Array.from({ length: count }, (_, index) => TIER_WEIGHT_RATIO ** index)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  return weights.map((weight) => (kg * weight) / total)
}

/**
 * Los kilos de cada piso, de abajo hacia arriba; suman `kg` y cada piso es más chico que el de abajo (regla en el
 * encabezado). Sin moldes de esa forma, solo se usa el reparto ideal. Un piso lleva todos los kilos.
 */
export function tierKilos(molds: readonly CakeMold[], form: CakeMold['form'], kg: number, tiers: number): number[] {
  const count = Math.max(1, Math.floor(tiers))
  const ideal = idealKilos(kg, count)
  if (count === 1) return [kg]
  const rungs = molds.filter((mold) => mold.form === form).map((mold) => mold.kg).sort((a, b) => b - a)
  const sizeAt = (share: number) => moldFootprint(molds, form, share)
  if (rungs.length === 0) return ideal

  // Los pisos de arriba, del de abajo hacia el de arriba; el primero solo toma el molde más cercano (el de abajo aún no se sabe).
  const upper: number[] = []
  for (let i = 1; i < count; i++) {
    const nearest = rungs.reduce((best, rung) => (Math.abs(rung - ideal[i]) < Math.abs(best - ideal[i]) ? rung : best))
    const lower = upper[i - 2]
    const fits = (share: number) => {
      const size = sizeAt(share)
      const under = lower === undefined ? null : sizeAt(lower)
      return size !== null && (under === null || area(size) <= area(under) * MAX_AREA_STEP)
    }
    const candidates = [nearest, ...rungs.filter((rung) => rung < nearest), ideal[i]]
    let pick = candidates.find(fits)
    // Ya no hay molde menor que quepa: se reducen los kilos ideales hasta que el área baje lo suficiente.
    for (let shrink = ideal[i]; pick === undefined; shrink *= 0.8) if (fits(shrink)) pick = shrink
    upper.push(pick)
  }
  const bottom = kg - upper.reduce((sum, share) => sum + share, 0)
  const below = sizeAt(bottom)
  const first = sizeAt(upper[0])
  if (bottom > 0 && below && first && area(first) <= area(below) * MAX_AREA_STEP) {
    return [bottom, ...upper]
  }
  return ideal
}

/** El tamaño de cada piso, de abajo hacia arriba, o `null` si no hay moldes de esa forma. */
export function tierFootprints(molds: readonly CakeMold[], form: CakeMold['form'], kg: number, tiers: number): Footprint[] | null {
  const sizes = tierKilos(molds, form, kg, tiers).map((share) => moldFootprint(molds, form, share))
  return sizes.every((size): size is Footprint => size !== null) ? sizes : null
}

/** Unidades de escena por centímetro de molde: el molde de 12 kg (51.5 cm) llena casi todo el plato de la base. */
export const UNITS_PER_CM = 0.068
/**
 * Medidas en cm de un piso cuando la API no manda moldes de esa forma: un tamaño neutro, el mismo para cualquier número
 * de kilos. Es un respaldo para que la vista previa siga dibujando; no es un dato de la pastelería.
 */
const FALLBACK_CM: Record<CakeMold['form'], Footprint> = {
  round: { lengthCm: 38, widthCm: 38 },
  rectangular: { lengthCm: 44, widthCm: 29 },
}

/** Cuánto más chico es cada piso que el de abajo en el tamaño de respaldo (el área baja a 0.64). */
const FALLBACK_STEP = 0.8
/** Medidas plausibles de un piso en cm (también las que salen de interpolar o de repartir): un molde mal escrito en el admin no saca el pastel de la tarjeta ni lo borra. */
const MIN_CM = 15
const MAX_CM = 150

/** Una medida de piso dentro de lo plausible. */
export const clampCm = (cm: number) => Math.min(MAX_CM, Math.max(MIN_CM, cm))

/**
 * Los pisos de la forma pedida con el tamaño que dan los moldes para esos kilos; sin moldes, el tamaño de respaldo, también
 * escalonado: cada piso más chico que el de abajo.
 */
export function tierSizes(options: CakeDesignOptions, form: CakeMold['form'], kg: number, count: number): Footprint[] {
  return (
    tierFootprints(options.cakeMolds, form, kg, count) ??
    Array.from({ length: count }, (_, index) => ({
      lengthCm: FALLBACK_CM[form].lengthCm * FALLBACK_STEP ** index,
      widthCm: FALLBACK_CM[form].widthCm * FALLBACK_STEP ** index,
    }))
  )
}
