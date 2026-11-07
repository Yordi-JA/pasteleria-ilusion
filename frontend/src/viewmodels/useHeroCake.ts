import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { CakeShape } from '../three/cakeShape.ts'

/** `loading`: se ve el pastel fijo mientras llega la escena; `ready`: ya se dibujó; `fallback`: queda el pastel fijo. */
export type HeroCakeStatus = 'loading' | 'ready' | 'fallback'

/** El pastel de la portada (libro de marca, "Presencia de marca"), con las medidas del mockup. */
export const HERO_CAKE: CakeShape = {
  tiers: [
    { radius: 1.5, height: 1.12, frosting: 'betun' },
    { radius: 1.1, height: 0.96, frosting: 'fresa-claro' },
    { radius: 0.72, height: 0.8, frosting: 'betun' },
  ],
  festoons: true,
  stand: true,
  candle: true,
}

/** El lienzo sube 72 px por encima de la caja (la vela con los pisos separados): también cuenta para "se ve". */
const VISIBLE_MARGIN = '72px 0px 0px 0px'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}
const tabVisible = () => document.visibilityState === 'visible'

/**
 * Si el navegador puede crear un contexto WebGL 2 (three ya no dibuja con WebGL 1). Se prueba antes de pedir la
 * escena, para no descargarla en vano; el contexto de prueba se suelta enseguida.
 */
function supportsWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return gl !== null
  } catch {
    // Algunos navegadores lanzan en vez de devolver null cuando WebGL está bloqueado: es lo mismo que no tenerlo.
    return false
  }
}

type CakeState = {
  status: HeroCakeStatus
  /** Solo una pérdida de contexto se reintenta; sin WebGL o con el chunk roto, el pastel fijo se queda. */
  retryable: boolean
}

/**
 * View-model del pastel de la portada: decide si hay escena 3D o pastel fijo, si la escena corre (en pantalla y
 * con la pestaña visible), si el usuario pidió reducir el movimiento y si la escena tiene el foco del teclado.
 */
export function useHeroCake() {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion)
  const visibleTab = useSyncExternalStore(subscribeVisibility, tabVisible)
  const [cake, setCake] = useState<CakeState>(() => ({ status: supportsWebGL2() ? 'loading' : 'fallback', retryable: false }))
  // Sin IntersectionObserver no se puede saber si se ve: la escena corre y se pausa solo con la pestaña oculta.
  const [onScreen, setOnScreen] = useState(() => !('IntersectionObserver' in window))
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  // Ref de callback: el observador se conecta cuando la caja existe y se desconecta si cambia.
  const [box, observeBox] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!box || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { rootMargin: VISIBLE_MARGIN })
    observer.observe(box)
    return () => observer.disconnect()
  }, [box])

  // Tras perder el contexto (el sistema lo reclama, por ejemplo al suspender la GPU), se reintenta la escena la
  // próxima vez que la pestaña vuelve a verse.
  useEffect(() => {
    if (!cake.retryable) return
    const retry = () => {
      if (document.visibilityState === 'visible') setCake({ status: 'loading', retryable: false })
    }
    document.addEventListener('visibilitychange', retry)
    return () => document.removeEventListener('visibilitychange', retry)
  }, [cake.retryable])

  const onReady = useCallback(
    () => setCake((current) => (current.status === 'loading' ? { status: 'ready', retryable: false } : current)),
    [],
  )
  const onContextLost = useCallback(() => {
    setKeyboardFocus(false)
    setCake({ status: 'fallback', retryable: true })
  }, [])
  const onChunkError = useCallback(() => setCake({ status: 'fallback', retryable: false }), [])

  return {
    observeBox,
    status: cake.status,
    shape: HERO_CAKE,
    reducedMotion,
    running: onScreen && visibleTab,
    keyboardFocus,
    onKeyboardFocusChange: setKeyboardFocus,
    onReady,
    onContextLost,
    onChunkError,
  }
}

export type HeroCakeView = ReturnType<typeof useHeroCake>
