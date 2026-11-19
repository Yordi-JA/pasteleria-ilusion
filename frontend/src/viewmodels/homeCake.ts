import type { CakeComb, CakeShape, CakeTier, ShapeColor } from '../three/cakeShape.ts'
import { UNITS_PER_CM } from './cakeMolds.ts'
import { SAMPLE_BOARD } from './sampleDesign.ts'

/**
 * El pastel 3D de la portada (tanda 6): arte de la marca fijo en el código, como el pastel de tres pisos de antes, armado con las
 * piezas que ya dibuja "Diseña tu pastel": dos pisos con la cobertura de crema pastelera peinada (D84) y una de sus decoraciones
 * modeladas (`three/Decoration.tsx`). No pide nada a la API ni lleva fruta. De cuatro propuestas (conchas, festones, rosas y
 * rosetones, sobre la charola o la base), el usuario eligió esta: crema `betun` peinada con rosas en `fresa` y un `fresa` más hondo,
 * hojitas en `exito`, sobre la charola negra de las imágenes del catálogo (`SAMPLE_BOARD`, la excepción de color ya documentada).
 * Los demás colores son tokens o mezclas de tokens, como los matices del diseñador. Sin React ni three.
 */

/** Pisos de 30 y 22 cm de diámetro, del alto de los pisos del diseñador (`TIER_HEIGHT` de `cakeDesignPreview.ts`, unos 10.6 cm). */
const TIER_CM = { bottom: 30, top: 22 }
const TIER_HEIGHT = 0.72
/** El peine del peinado lateral del diseñador (D84): un surco cada 6 mm, de 1.2 mm de hondo. */
const SIDE_COMB: CakeComb = { pitch: 0.6 * UNITS_PER_CM, depth: 0.12 * UNITS_PER_CM }
const COVERAGE = 'betun'
/** Un `fresa` más hondo, hacia `frambuesa`: el tono de rosa que se lee sobre la crema clara. */
const DEEP_FRESA: ShapeColor = { mix: ['fresa', 'frambuesa'], amount: 0.4 }

const tier = (diameterCm: number): CakeTier => ({
  radius: (diameterCm * UNITS_PER_CM) / 2,
  height: TIER_HEIGHT,
  frosting: COVERAGE,
  comb: SIDE_COMB,
})

/** El pastel de la portada: dos pisos peinados con rosas en el borde de arriba de cada piso, sobre la charola. */
export const HOME_CAKE: CakeShape = {
  tiers: [tier(TIER_CM.bottom), tier(TIER_CM.top)],
  festoons: false,
  decoration: { kind: 'roses', petals: ['fresa', DEEP_FRESA], leaf: 'exito' },
  form: 'round',
  stand: false,
  board: SAMPLE_BOARD,
}

/** El dibujo fijo mientras llega la escena (`StaticCake`): los dos pisos en el color de la cobertura. */
export const HOME_CAKE_STILL = [COVERAGE, COVERAGE] as const

/** Nombre accesible de la escena: lo que se ve, sin nombre de producto. */
export const HOME_CAKE_LABEL = 'Pastel de dos pisos'
