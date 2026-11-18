import { useLayoutEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './reducedMotion.ts'

/**
 * `static`: se ve desde el principio y no anima (ya estaba a la vista, reducir movimiento o sin IntersectionObserver).
 * `hidden`: espera abajo del pliegue, transparente y 8 px abajo. `shown`: entró a la vista y aparece una sola vez.
 */
export type RevealPhase = 'static' | 'hidden' | 'shown'

/** Margen bajo la ventana: aparece cuando ya asoma un poco, para que el movimiento se alcance a ver. */
const ROOT_MARGIN = '0px 0px -48px 0px'

/**
 * Red de seguridad: un IntersectionObserver siempre avisa una vez al empezar a observar. Si en este tiempo no avisó,
 * se da por descompuesto y el contenido se muestra, para que nunca quede invisible.
 */
const OBSERVER_WATCHDOG_MS = 1000

/**
 * La aparición al llegar a la vista (tanda 3): el contenido que empieza abajo del pliegue sube 8 px y se desvanece la
 * primera vez que entra a la ventana. Lo que ya se ve al cargar no cambia, así no hay un cuadro vacío. La decisión se
 * toma antes de pintar (`useLayoutEffect`), con una sola medición. También se muestra si recibe el foco (el teclado
 * nunca llega a algo invisible). El CSS (`index.css`) solo oculta con `prefers-reduced-motion: no-preference` y nunca
 * al imprimir.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [phase, setPhase] = useState<RevealPhase>('static')

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return
    // Ya a la vista, o arriba de ella: se queda como está.
    if (element.getBoundingClientRect().top < window.innerHeight) return

    setPhase('hidden')
    let answered = false
    const show = () => {
      setPhase('shown')
      stop()
    }
    const observer = new IntersectionObserver(
      (entries) => {
        answered = true
        if (entries.some((entry) => entry.isIntersecting)) show()
      },
      { rootMargin: ROOT_MARGIN },
    )
    const watchdog = window.setTimeout(() => {
      if (!answered) show()
    }, OBSERVER_WATCHDOG_MS)
    function stop() {
      observer.disconnect()
      window.clearTimeout(watchdog)
      element?.removeEventListener('focusin', show)
    }
    observer.observe(element)
    element.addEventListener('focusin', show)
    return stop
  }, [])

  return { ref, phase }
}
