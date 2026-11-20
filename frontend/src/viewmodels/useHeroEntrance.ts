import { useEffect, useState } from 'react'
import { prefersReducedMotion } from './reducedMotion.ts'

/**
 * Si la entrada del hero ya corrió en esta carga de la página. Vive en el módulo, acotado a esto: al volver a la portada desde
 * otra ruta, el hero ya se vio y no vuelve a entrar (el cambio de ruta tiene su propio desvanecido).
 */
let played = false

/**
 * La entrada del hero de la portada (tanda 7, D90): el logotipo grande, el lema, la frase, los dos botones y el pastel suben y
 * aparecen en escalón, una sola vez por carga. Devuelve si esta vez hay entrada; la vista pone entonces las clases de la
 * animación, que solo corren con `prefers-reduced-motion: no-preference` (`motion-safe:`). Sin JavaScript, o con "reducir
 * movimiento", el contenido se pinta tal cual. No retrasa nada: los botones se pueden usar desde el primer cuadro.
 *
 * El valor se decide al montar y no cambia: StrictMode monta dos veces en desarrollo, pero las dos leen el estado antes del
 * efecto que marca la entrada como vista.
 */
export function useHeroEntrance(): boolean {
  const [entering] = useState(() => !played && !prefersReducedMotion())
  useEffect(() => {
    played = true
  }, [])
  return entering
}
