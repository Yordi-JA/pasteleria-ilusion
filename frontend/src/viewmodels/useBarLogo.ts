import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useHeaderMorph, useHeaderMorphParts, useMorphAllowed } from './useHeaderMorph.ts'

/**
 * El logo de la barra y el logotipo grande de la portada nunca se ven juntos (tanda 6, decisión del usuario). En la portada, la
 * barra empieza sin su logo. En escritorio y sin "reducir movimiento" (tanda 7, D90), el logotipo grande se encoge y viaja a la
 * barra con el scroll y los enlaces se recorren a su lugar (`useHeaderMorph`). Con "reducir movimiento" la barra muestra su logo
 * cuando el logotipo grande sale de la pantalla por arriba (pasa bajo la barra, que es opaca), como antes. En las demás rutas no
 * hay logotipo grande y la barra lleva su logo siempre. En móvil (hasta 600 px) el logotipo grande no se muestra (`display:
 * none` nunca cruza la pantalla), así que el logo de la barra se ve; la vista además lo fuerza con CSS.
 */

/** Lo que tapa la barra fija desde arriba: 16 px de `top-4` y 84 px de alto (el logo de 66 px, 16 de relleno y el borde). */
const BAR_BOTTOM_PX = 100

/** La vista de la portada registra aquí su logotipo grande (o `null` al salir). */
export const BarLogoContext = createContext<(logo: HTMLElement | null) => void>(() => {})

/**
 * Para el marco: si el logo de la barra se oculta, si el cambio se anima, si el logotipo grande viaja a la barra (`morphing`) y
 * las referencias que el encabezado presta para ese cambio (`morphParts`). `onHome` es si la ruta es la portada: ahí el logo empieza oculto
 * desde el primer cuadro, antes de que la portada registre su logotipo grande. Con el cambio, el logo de la barra lo muestra
 * `useHeaderMorph` cuando el logotipo llega. Sin él, se queda oculto hasta que el `IntersectionObserver` diga que el grande ya no
 * se ve; la transición se activa después de esa primera respuesta, así al cargar la portada el logo no se desvanece a la vista.
 */
export function useBarLogoState(onHome: boolean) {
  const [heroLogo, setHeroLogo] = useState<HTMLElement | null>(null)
  const [heroLogoVisible, setHeroLogoVisible] = useState(true)
  const [animate, setAnimate] = useState(false)
  const parts = useHeaderMorphParts()
  const morphing = useMorphAllowed() && onHome

  // Sin observador no se sabe cuándo sale: se ven los dos antes que perder el logo de la barra.
  const observable = typeof window !== 'undefined' && 'IntersectionObserver' in window

  useEffect(() => {
    if (!heroLogo || !observable || morphing) return
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
  }, [heroLogo, observable, morphing])

  useHeaderMorph(morphing ? heroLogo : null, parts)

  const hidden = morphing || (observable && (heroLogo !== null ? heroLogoVisible : onHome))
  return { barLogoHidden: hidden, barLogoAnimated: animate && !morphing, registerHeroLogo: setHeroLogo, morphing, morphParts: parts }
}

/** Para la portada: el `ref` de su logotipo grande. Al desmontarse lo quita y la barra vuelve a llevar su logo. */
export function useHeroLogoRef() {
  const register = useContext(BarLogoContext)
  return useCallback((logo: HTMLElement | null) => register(logo), [register])
}
