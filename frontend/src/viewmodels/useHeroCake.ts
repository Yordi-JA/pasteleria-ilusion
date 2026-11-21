import type { SceneShape } from '../three/dessertShape.ts'
import { HOME_CAKE } from './homeCake.ts'
import { useCakeScene } from './useCakeScene.ts'
import type { CakeSceneStatus, CakeSceneView } from './useCakeScene.ts'

/** `loading`: se ve el pastel fijo mientras llega la escena; `ready`: ya se dibujó; `fallback`: queda el pastel fijo. */
export type HeroCakeStatus = CakeSceneStatus

/**
 * View-model del pastel del hero: la escena compartida (`useCakeScene`) con el pastel que se dibuja (`shape`). Por omisión, el de
 * dos pisos de la marca (`homeCake.ts`), el mismo en la portada, `/entrar` y `/registro` desde la tanda 8; el de tres pisos con
 * festones sobre el stand ya no se usa. Desde D90 los pisos no se separan con el scroll en ninguna vista, así que solo cuenta su
 * caja para saber si se ve.
 */
export function useHeroCake({ shape = HOME_CAKE }: { shape?: SceneShape } = {}) {
  return useCakeScene(shape)
}

export type HeroCakeView = CakeSceneView
