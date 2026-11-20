import type { CakeShape } from '../three/cakeShape.ts'
import { useCakeScene } from './useCakeScene.ts'
import type { CakeSceneStatus, CakeSceneView } from './useCakeScene.ts'

/** `loading`: se ve el pastel fijo mientras llega la escena; `ready`: ya se dibujó; `fallback`: queda el pastel fijo. */
export type HeroCakeStatus = CakeSceneStatus

/**
 * El pastel de tres pisos de la marca (libro de marca, "Presencia de marca"), con las medidas del mockup: el de `/entrar` y
 * `/registro`. La portada lleva el de dos pisos de `homeCake.ts` (tanda 6).
 */
export const HERO_CAKE: CakeShape = {
  tiers: [
    { radius: 1.5, height: 1.12, frosting: 'betun' },
    { radius: 1.1, height: 0.96, frosting: 'fresa-claro' },
    { radius: 0.72, height: 0.8, frosting: 'betun' },
  ],
  festoons: true,
  stand: true,
}

/**
 * View-model del pastel del hero: la escena compartida (`useCakeScene`) con el pastel que se dibuja (`shape`; por omisión, el de
 * tres pisos). Desde D90 los pisos no se separan con el scroll en ninguna vista, así que solo cuenta su caja para saber si se ve.
 */
export function useHeroCake({ shape = HERO_CAKE }: { shape?: CakeShape } = {}) {
  return useCakeScene(shape)
}

export type HeroCakeView = CakeSceneView
