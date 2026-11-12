import type { CakeShape, CakeTier } from './cakeShape.ts'

/**
 * Medidas del pastel que comparten la escena y el encuadre, sin React ni three: dónde queda cada piso, qué tan grande
 * debe ser el plato y qué espacio ocupa todo el pastel. Las unidades son las de la escena (1 unidad son 100 px del
 * mockup, `Main.dc.html`).
 */

/** Holgura entre el plato y el primer piso (2 px en el mockup). */
export const PLATE_GAP = 0.02
/** Radio del plato de la base y lo que baja la columna con su pie, bajo el plato (`Stand` en `CakeModel.tsx`). */
export const PLATE_RADIUS = 1.96
export const STAND_DEPTH = 0.82
/** Aire entre el borde del piso de abajo y el del plato. */
const PLATE_MARGIN = 0.14
/** Molde rectangular sin medidas propias: largo y ancho respecto al radio, como el prototipo. */
const DEFAULT_RECT = { width: 2.1, depth: 1.4 }

type Form = NonNullable<CakeShape['form']>

/** Mitad del largo (x) y del ancho (z) de un piso; en redondo, las dos son el radio. */
export function halfExtents(tier: Pick<CakeTier, 'radius' | 'halfWidth' | 'halfDepth'>, form: Form): { x: number; z: number } {
  if (form === 'round') return { x: tier.radius, z: tier.radius }
  return { x: tier.halfWidth ?? (tier.radius * DEFAULT_RECT.width) / 2, z: tier.halfDepth ?? (tier.radius * DEFAULT_RECT.depth) / 2 }
}

/** El círculo más chico que envuelve al piso: el radio en redondo y la media diagonal en rectangular. */
export function circumradius(tier: Pick<CakeTier, 'radius' | 'halfWidth' | 'halfDepth'>, form: Form): number {
  if (form === 'round') return tier.radius
  const { x, z } = halfExtents(tier, form)
  return Math.hypot(x, z)
}

/**
 * Cuánto se escala el plato (y su columna) con el piso de abajo. Con `fitStand` (la vista previa), mide un poco más que
 * el piso, grande o chico; sin él (la portada), solo crece cuando el piso no cabe y nunca baja de 1.
 */
export function standScale(shape: CakeShape): number {
  const bottom = shape.tiers[0]
  if (!shape.stand || !bottom) return 1
  const fit = (circumradius(bottom, shape.form ?? 'round') + PLATE_MARGIN) / PLATE_RADIUS
  return shape.fitStand ? fit : Math.max(1, fit)
}

/**
 * Lo que ocupa el pastel con su base, como círculos horizontales (altura y radio): los bordes del plato, del pie y de
 * cada piso. Su proyección da el espacio que ocupa en pantalla desde cualquier elevación de la cámara.
 */
export type Circle = { y: number; r: number }
export type Content = { circles: readonly Circle[] }

/** La base (plato, columna y pie, `Stand` en `CakeModel.tsx`) con su escala. */
function standCircles(scale: number): Circle[] {
  return [
    { y: 0, r: PLATE_RADIUS * scale },
    { y: -0.1 * scale, r: PLATE_RADIUS * scale },
    { y: -0.74 * scale, r: 0.74 * scale },
    { y: -STAND_DEPTH * scale, r: 0.74 * scale },
  ]
}

export function contentOf(shape: CakeShape): Content {
  const form = shape.form ?? 'round'
  const circles = shape.stand ? standCircles(standScale(shape)) : []
  let base = PLATE_GAP
  for (const tier of shape.tiers) {
    const r = circumradius(tier, form)
    circles.push({ y: base, r }, { y: base + tier.height, r })
    base += tier.height
  }
  return { circles }
}

/**
 * El pastel grande de un piso con el que se fija la escala de la cámara: el que llena el plato, con el alto de los pisos
 * de `shape` (en la vista previa todos miden lo mismo).
 */
export function referenceContent(shape: CakeShape): Content {
  return contentOf({
    tiers: [{ radius: PLATE_RADIUS - PLATE_MARGIN, height: shape.tiers[0]?.height ?? 0 }],
    festoons: false,
    stand: true,
  })
}

/** Aire alrededor del pastel dentro de la caja (15%: la perspectiva agranda lo que queda cerca de la cámara). */
const FIT_MARGIN = 1.15

/**
 * Hasta dónde llega el pastel en pantalla, hacia arriba y hacia abajo del punto al que mira la cámara, y su mitad de
 * ancho, a esa elevación (en grados). Un círculo a la altura `y` y radio `r` se ve como una elipse: su borde de atrás
 * sube `r · sen(elevación)` y el de adelante baja lo mismo, sobre `y · cos(elevación)`. Con la cámara bajo el horizonte
 * pasa lo mismo, con el borde de adelante arriba.
 */
export function viewExtent(content: Content, elevation: number): { top: number; bottom: number; halfWidth: number } {
  const angle = (elevation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.abs(Math.sin(angle))
  let top = -Infinity
  let bottom = Infinity
  let halfWidth = 0
  for (const { y, r } of content.circles) {
    top = Math.max(top, y * cos + r * sin)
    bottom = Math.min(bottom, y * cos - r * sin)
    halfWidth = Math.max(halfWidth, r)
  }
  return { top, bottom, halfWidth }
}

/** Píxeles por unidad con los que el pastel cabe en una caja a esa elevación de la cámara. */
export function fitScale(content: Content, box: { width: number; height: number }, elevation: number): number {
  const { top, bottom, halfWidth } = viewExtent(content, elevation)
  return Math.max(1, Math.min(box.width / (2 * halfWidth * FIT_MARGIN), box.height / ((top - bottom) * FIT_MARGIN)))
}

/**
 * La altura de la escena a la que debe mirar la cámara, a esa elevación, para que el pastel con su base quede centrado
 * en vertical: la elipse de cada círculo sube y baja con la elevación, así que el centro del cuerpo no es el de la vista.
 */
export function lookAtHeight(content: Content, elevation: number): number {
  const { top, bottom } = viewExtent(content, elevation)
  return (top + bottom) / 2 / Math.max(0.1, Math.cos((elevation * Math.PI) / 180))
}
