import { useEffect } from 'react'
import type { RefObject } from 'react'

/** Aire entre lo enfocado y la barra, como el del aviso fijo del carrito. */
const BAR_GAP_PX = 12

/**
 * Mientras una barra fija de abajo se ve, el documento reserva su alto (`scroll-padding-bottom`): lo que el teclado
 * enfoca, y el título que recibe el foco al cambiar de parte, no quedan debajo de ella. Se mide con cada cambio de tamaño,
 * porque en escritorio la barra no se muestra y mide 0. Al irse, vuelve el valor de antes. Es el mismo arreglo que la
 * barra de "Diseña tu pastel" (`MobileBar`, tanda 3), aquí para la entrega.
 */
export function useBarClearance(bar: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = bar.current
    if (!element) return
    const root = document.documentElement
    const previous = root.style.scrollPaddingBottom
    const measure = () => {
      root.style.scrollPaddingBottom = element.offsetHeight > 0 ? `${element.offsetHeight + BAR_GAP_PX}px` : previous
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.scrollPaddingBottom = previous
    }
  }, [bar])
}
