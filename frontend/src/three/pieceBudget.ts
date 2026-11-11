import { halfExtents } from './cakeMetrics.ts'
import type { CakePieces, CakeShape } from './cakeShape.ts'
import { decorationTriangles } from './decorationLayout.ts'

/**
 * Cuántos trozos lleva cada franja de relleno y la decoración, y cuántos puede llevar toda la escena (D52, D53), sin React
 * ni three. Cada estilo
 * pide una densidad (instancias por unidad de área del costado) y tiene un número de caras por instancia. El pedido de
 * toda la escena se compara con `TRIANGLE_BUDGET`: si se pasa, todas las franjas bajan su densidad en la misma proporción,
 * así el piso de abajo nunca queda más ralo que los de arriba. Un tope por franja solo protege contra medidas absurdas.
 */
export const PIECE_STYLES: Record<CakePieces['style'], { density: number; faces: number }> = {
  fruit_slices: { density: 34, faces: 72 },
  fruit_chunks: { density: 300, faces: 80 },
  cookie_chunks: { density: 300, faces: 36 },
  sprinkles: { density: 520, faces: 60 },
  crumbles: { density: 700, faces: 20 },
  nut_pieces: { density: 300, faces: 20 },
  round_chips: { density: 420, faces: 80 },
}

/** Triángulos de todos los trozos y de la decoración de la escena: unos 150 000, lo que un teléfono de gama media dibuja sin esfuerzo en reposo. */
export const TRIANGLE_BUDGET = 150_000
/** Tope de instancias por franja, solo contra un relleno desmedido (un piso de cientos de kilos). */
export const MAX_PIECES = 2500

/** Instancias que pide una franja antes de repartir el presupuesto: perímetro, parte del costado, alto y estilo. */
export function wantedPieces(style: CakePieces['style'], perimeter: number, share: number, height: number): number {
  return Math.max(1, Math.round(perimeter * share * height * PIECE_STYLES[style].density))
}

/** Las franjas con trozos de un pastel: su estilo, su perímetro, la parte del costado y su alto. */
function strips(shape: CakeShape) {
  const form = shape.form ?? 'round'
  const found: { style: CakePieces['style']; perimeter: number; share: number; height: number }[] = []
  for (const tier of shape.tiers) {
    if (tier.frosting) continue
    const { x, z } = halfExtents(tier, form)
    const perimeter = form === 'round' ? 2 * Math.PI * tier.radius : 4 * (x + z)
    for (const layer of tier.layers ?? []) {
      layer.pieces?.forEach((pieces) => {
        if (pieces) found.push({ style: pieces.style, perimeter, share: layer.colors.length === 2 ? 0.5 : 1, height: layer.height * tier.height })
      })
    }
  }
  return found
}

/**
 * Triángulos de los trozos y de la decoración de toda la escena con la densidad de cada estilo y el número de piezas de
 * la decoración multiplicados por `scale`. El pastel con decoración lleva cobertura en todos sus pisos, así que no tiene
 * franjas de relleno: cada uno pide lo suyo, pero comparten el mismo presupuesto.
 */
export function sceneTriangles(shape: CakeShape, scale = 1): number {
  const pieces = strips(shape).reduce(
    (sum, strip) =>
      sum + Math.min(MAX_PIECES, Math.max(1, Math.round(wantedPieces(strip.style, strip.perimeter, strip.share, strip.height) * scale))) * PIECE_STYLES[strip.style].faces,
    0,
  )
  return pieces + decorationTriangles(shape, scale)
}

/** Veces que se corrige la escala: los triángulos no crecen en línea recta con ella (pisos mínimos, redondeos). */
const SCALE_PASSES = 8

/**
 * Cuánto se multiplica la densidad de todas las franjas y el número de piezas de la decoración para no pasar del
 * presupuesto: 1 mientras cabe. Parte de la proporción directa y la corrige midiendo los triángulos que de verdad salen
 * (`sceneTriangles`) hasta que caben; si hay un mínimo que no baja (un anillo siempre lleva su mínimo de piezas), se
 * queda con la mejor escala que alcanzó.
 */
export function pieceDensityScale(shape: CakeShape): number {
  const wanted = sceneTriangles(shape)
  if (wanted <= TRIANGLE_BUDGET) return 1
  let scale = TRIANGLE_BUDGET / wanted
  for (let pass = 0; pass < SCALE_PASSES; pass++) {
    const actual = sceneTriangles(shape, scale)
    if (actual <= TRIANGLE_BUDGET) break
    // Un poco por debajo de la proporción, para no quedar siempre al borde.
    scale *= (TRIANGLE_BUDGET / actual) * 0.97
  }
  return scale
}
