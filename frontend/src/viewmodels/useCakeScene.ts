import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { CakeShape, Viewpoint } from '../three/cakeShape.ts'

/** `loading`: se ve el pastel fijo mientras llega la escena; `ready`: ya se dibujó; `fallback`: queda el pastel fijo. */
export type CakeSceneStatus = 'loading' | 'ready' | 'fallback'

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
  status: CakeSceneStatus
  /** Solo una pérdida de contexto se reintenta; sin WebGL o con el chunk roto, el pastel fijo se queda. */
  retryable: boolean
}

/**
 * View-model de una escena del pastel (la portada y "Diseña tu pastel"): decide si hay escena 3D o pastel fijo, si la
 * escena corre (en pantalla y con la pestaña visible), si el usuario pidió reducir el movimiento y si la escena tiene
 * el foco del teclado. `visibleMargin` amplía la caja que cuenta como "en pantalla" (el lienzo de la portada sube
 * 72 px sobre ella). `viewpoint` es desde dónde se ve el pastel (la vista previa de "Diseña tu pastel", por paso).
 */
export function useCakeScene(shape: CakeShape, visibleMargin = '0px', viewpoint?: Viewpoint) {
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
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { rootMargin: visibleMargin })
    observer.observe(box)
    return () => observer.disconnect()
  }, [box, visibleMargin])

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
    shape,
    viewpoint,
    reducedMotion,
    running: onScreen && visibleTab,
    keyboardFocus,
    onKeyboardFocusChange: setKeyboardFocus,
    onReady,
    onContextLost,
    onChunkError,
  }
}

export type CakeSceneView = ReturnType<typeof useCakeScene>
