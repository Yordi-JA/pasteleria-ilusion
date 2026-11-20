import { useLayoutEffect, useRef } from 'react'
import { prefersReducedMotion } from './reducedMotion.ts'
import { OBSERVER_WATCHDOG_MS, ROOT_MARGIN } from './useReveal.ts'

/** El atributo de cada tarjeta mientras dura su cascada: `oculta` espera abajo, `visible` está subiendo. */
export const CASCADE_ATTRIBUTE = 'data-cascada'
/** El retraso de cada tarjeta dentro de su tanda; lo lee la transición de `index.css`. */
export const CASCADE_DELAY_PROPERTY = '--cascada-retraso'

/**
 * La cascada de las tarjetas (D90). Cada tarjeta sube 20 px en 450 ms (`index.css`); las que entran juntas a la ventana
 * salen una tras otra, 60 ms entre cada una y como máximo 300 ms, así una cuadrícula larga nunca tarda segundos.
 */
export const CASCADE = { stepMs: 60, maxDelayMs: 300, riseMs: 450 } as const

/** Margen tras la subida para quitar los atributos: la transición ya terminó y la tarjeta queda como si nunca se hubiera movido. */
const SETTLE_MARGIN_MS = 100

export function cascadeDelay(index: number): number {
  return Math.min(index * CASCADE.stepMs, CASCADE.maxDelayMs)
}

/**
 * Si la cuadrícula, o algo que la contiene, se desliza de lado (las rebanadas de la portada hasta 960 px). Ahí la cascada no
 * aplica: las tarjetas fuera del borde no se cruzan con la ventana hasta deslizar, quedarían 20 px abajo y el contenedor, que
 * con `overflow-x` también recorta en vertical, se desbordaría y mostraría una barra. Se mide una vez, al montar.
 */
function insideSideScroller(grid: HTMLElement): boolean {
  for (let element: HTMLElement | null = grid; element && element !== document.body; element = element.parentElement) {
    const overflow = getComputedStyle(element).overflowX
    if (overflow === 'auto' || overflow === 'scroll') return true
  }
  return false
}

function byDocumentOrder(a: Element, b: Element): number {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
}

/**
 * Las tarjetas de una cuadrícula aparecen en cascada, cada una al entrar a la ventana y una sola vez (D90). A diferencia de
 * `useReveal`, que muestra un bloque entero, aquí cada hijo directo se observa por separado: una fila que llega con el scroll
 * sube cuando se ve, no cuando asomó la primera. Las tarjetas que ya se ven al cargar (o quedan arriba) no se mueven, y nada
 * se oculta sin IntersectionObserver o con "reducir movimiento". Al recibir el foco, la tarjeta aparece de inmediato.
 *
 * Los hijos los dibuja React; el hook solo les pone y les quita `data-cascada` y `--cascada-retraso`, que React no maneja.
 * Un hijo que llega después (otro filtro, "Ver más") aparece tal cual. El CSS solo oculta con
 * `prefers-reduced-motion: no-preference` y nunca al imprimir.
 */
export function useCascade<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const grid = ref.current
    if (!grid || typeof IntersectionObserver === 'undefined' || prefersReducedMotion() || insideSideScroller(grid)) return

    // Una sola lectura antes de escribir: lo que ya asoma o quedó arriba se queda como está.
    const below = Array.from(grid.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.getBoundingClientRect().top >= window.innerHeight,
    )
    if (below.length === 0) return

    const pending = new Set(below)
    const timers = new Set<number>()
    for (const item of below) item.setAttribute(CASCADE_ATTRIBUTE, 'oculta')

    function settle(item: HTMLElement) {
      item.removeAttribute(CASCADE_ATTRIBUTE)
      item.style.removeProperty(CASCADE_DELAY_PROPERTY)
    }

    function reveal(items: HTMLElement[]) {
      const batch = items.filter((item) => pending.has(item)).sort(byDocumentOrder)
      if (batch.length === 0) return
      batch.forEach((item, index) => {
        pending.delete(item)
        observer.unobserve(item)
        item.style.setProperty(CASCADE_DELAY_PROPERTY, `${cascadeDelay(index)}ms`)
        item.setAttribute(CASCADE_ATTRIBUTE, 'visible')
      })
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        batch.forEach(settle)
      }, cascadeDelay(batch.length - 1) + CASCADE.riseMs + SETTLE_MARGIN_MS)
      timers.add(timer)
      if (pending.size === 0) stopWatching()
    }

    let answered = false
    const observer = new IntersectionObserver(
      (entries) => {
        answered = true
        reveal(entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target as HTMLElement))
      },
      { rootMargin: ROOT_MARGIN },
    )
    // Red de seguridad, como en `useReveal`: un observador que nunca avisa no deja tarjetas invisibles.
    const watchdog = window.setTimeout(() => {
      if (!answered) reveal([...pending])
    }, OBSERVER_WATCHDOG_MS)

    // El teclado nunca llega a algo invisible: la tarjeta que recibe el foco aparece sin esperar al scroll.
    function onFocus(event: FocusEvent) {
      const item = [...pending].find((candidate) => event.target instanceof Node && candidate.contains(event.target))
      if (item) reveal([item])
    }

    function stopWatching() {
      observer.disconnect()
      window.clearTimeout(watchdog)
      grid?.removeEventListener('focusin', onFocus)
    }

    for (const item of below) observer.observe(item)
    grid.addEventListener('focusin', onFocus)

    return () => {
      stopWatching()
      for (const timer of timers) window.clearTimeout(timer)
      // Al desmontar (o en el doble efecto de StrictMode) todo vuelve a su estado fijo.
      below.forEach(settle)
    }
  }, [])

  return ref
}
