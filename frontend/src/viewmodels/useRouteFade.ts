import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useLocation } from 'react-router'
import { prefersReducedMotion } from './reducedMotion.ts'

/** Lo que dura el desvanecido al cambiar de ruta, con la curva de entrada del sitio (`ease-entrada`). */
const FADE = { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }

/**
 * Al cambiar de ruta, el contenido nuevo de `<main>` se desvanece de entrada en 180 ms (tanda 3). Solo opacidad, con WAAPI:
 * no mueve nada, así el foco y el scroll de `useRouteFocus` no cambian. No corre en la primera carga, ni cuando solo
 * cambian la búsqueda o el ancla (los pasos de "Diseña tu pastel" tienen su propia entrada), ni con "reducir movimiento".
 * Una navegación nueva cancela el desvanecido anterior.
 */
export function useRouteFade(main: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation()
  const previous = useRef<string | null>(null)

  useEffect(() => {
    const prior = previous.current
    previous.current = pathname
    // StrictMode corre el efecto dos veces al montar: la segunda vez la ruta es la misma y no hay nada que hacer.
    if (prior === null || prior === pathname) return
    const element = main.current
    if (!element || typeof element.animate !== 'function' || prefersReducedMotion()) return
    const fade = element.animate([{ opacity: 0 }, { opacity: 1 }], FADE)
    return () => fade.cancel()
  }, [pathname, main])
}
