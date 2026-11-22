import { useEffect, useRef, useState } from 'react'

/**
 * Si el contenido de un contenedor con desplazamiento propio es más alto que el contenedor (la tarjeta del paso de
 * "Diseña tu pastel" en escritorio, tanda 3). `viewport` es el que se desplaza y `content`, lo de adentro: se miden los
 * dos, porque el contenido crece sin que cambie el alto del contenedor (un grupo de decoración que se despliega) y el
 * contenedor cambia sin que cambie el contenido (la ventana). Sin desbordar, la vista no agrega una parada del
 * tabulador que no desplaza nada.
 */
export function useScrollOverflow<Viewport extends HTMLElement, Content extends HTMLElement>() {
  const viewport = useRef<Viewport>(null)
  const content = useRef<Content>(null)
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    const outer = viewport.current
    const inner = content.current
    if (!outer || !inner) return
    // 1 px de margen: el redondeo de los altos fraccionarios no cuenta como desbordar.
    const measure = () => setOverflowing(outer.scrollHeight > outer.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    observer.observe(inner)
    // Una fila que entra desplazada (la de "Tu pastel", 8 px abajo) cuenta en `scrollHeight` mientras se mueve: al terminar,
    // sin otro cambio de tamaño, se mide de nuevo.
    outer.addEventListener('animationend', measure)
    return () => {
      observer.disconnect()
      outer.removeEventListener('animationend', measure)
    }
  }, [])
  return { viewport, content, overflowing }
}
