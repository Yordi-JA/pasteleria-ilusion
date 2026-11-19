import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/**
 * El logo de la barra y el logotipo grande de la portada nunca se ven juntos (tanda 6, decisión del usuario). En la portada, la
 * barra empieza sin su logo y lo muestra cuando el logotipo grande sale de la pantalla por arriba (pasa bajo la barra, que es
 * opaca). En las demás rutas no hay logotipo grande y la barra lleva su logo siempre. En móvil (hasta 600 px) el logotipo grande no
 * se muestra (`display: none` nunca cruza la pantalla), así que el logo de la barra se ve; la vista además lo fuerza con CSS.
 */

/** Lo que tapa la barra fija desde arriba: 16 px de `top-4` y 84 px de alto (el logo de 66 px, 16 de relleno y el borde). */
const BAR_BOTTOM_PX = 100

/** La vista de la portada registra aquí su logotipo grande (o `null` al salir). */
export const BarLogoContext = createContext<(logo: Element | null) => void>(() => {})

/**
 * Para el marco: si el logo de la barra se oculta y si el cambio se anima. `onHome` es si la ruta es la portada: ahí el logo empieza
 * oculto desde el primer cuadro, antes de que la portada registre su logotipo grande, y se queda así hasta que el
 * `IntersectionObserver` diga que el grande ya no se ve. La transición se activa después de esa primera respuesta, así al cargar la
 * portada el logo no se desvanece a la vista.
 */
export function useBarLogoState(onHome: boolean) {
  const [heroLogo, setHeroLogo] = useState<Element | null>(null)
  const [heroLogoVisible, setHeroLogoVisible] = useState(true)
  const [animate, setAnimate] = useState(false)

  // Sin observador no se sabe cuándo sale: se ven los dos antes que perder el logo de la barra.
  const observable = typeof window !== 'undefined' && 'IntersectionObserver' in window

  useEffect(() => {
    if (!heroLogo || !observable) return
    let first = true
    const observer = new IntersectionObserver(
      ([entry]) => {
        setHeroLogoVisible(entry.isIntersecting)
        if (first) {
          first = false
          // La primera respuesta solo fija el estado inicial; los cambios siguientes, al bajar o subir, sí se animan.
          requestAnimationFrame(() => setAnimate(true))
        }
      },
      { rootMargin: `-${BAR_BOTTOM_PX}px 0px 0px 0px` },
    )
    observer.observe(heroLogo)
    return () => {
      observer.disconnect()
      setHeroLogoVisible(true)
      setAnimate(false)
    }
  }, [heroLogo, observable])

  const hidden = observable && (heroLogo !== null ? heroLogoVisible : onHome)
  return { barLogoHidden: hidden, barLogoAnimated: animate, registerHeroLogo: setHeroLogo }
}

/** Para la portada: el `ref` de su logotipo grande. Al desmontarse lo quita y la barra vuelve a llevar su logo. */
export function useHeroLogoRef() {
  const register = useContext(BarLogoContext)
  return useCallback((logo: Element | null) => register(logo), [register])
}
