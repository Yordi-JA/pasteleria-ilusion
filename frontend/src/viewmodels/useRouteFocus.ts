import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/** El id de un ancla de la URL. Un `%` mal formado se usa tal cual: no hay elemento con ese id y se sigue sin ancla. */
function anchorId(hash: string): string {
  const raw = hash.slice(1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * Lleva el scroll y el foco a donde apunta la navegación, como lo haría una carga de página completa:
 * - con ancla (`/legal#terminos`), al elemento con ese id: en la primera carga, al cambiar solo el ancla y
 *   también al volver a pedir el ancla en la que ya estás (otra entrada del historial, misma URL);
 * - sin ancla, al cambiar de ruta, sube al inicio y enfoca `<main>`, para que el lector de pantalla y el
 *   teclado empiecen en el contenido nuevo. En la primera carga sin ancla no mueve nada.
 * Sin ancla y con la misma ruta (por ejemplo, un cambio solo en `?búsqueda`) no mueve nada, para que un
 * filtro no saque al usuario de donde está.
 * Con atrás y adelante (`POP`) no hay scroll: el navegador restaura la posición de esa entrada del historial;
 * el foco sí va al ancla o a `<main>`. La primera carga también es `POP`, pero ahí el ancla sí lleva el scroll.
 */
export function useRouteFocus(main: RefObject<HTMLElement | null>) {
  const { pathname, hash, key } = useLocation()
  const navigationType = useNavigationType()
  const previous = useRef<{ key: string; path: string } | null>(null)

  useEffect(() => {
    const prior = previous.current
    // StrictMode corre el efecto dos veces en desarrollo; con la misma entrada del historial no hay nada que hacer.
    if (prior?.key === key) return
    const path = pathname + hash
    previous.current = { key, path }
    const isFirstLoad = prior === null
    if (!isFirstLoad && prior.path === path && !hash) return
    const restoringHistory = navigationType === 'POP' && !isFirstLoad

    const target = hash ? document.getElementById(anchorId(hash)) : null
    if (target) {
      if (!restoringHistory) target.scrollIntoView()
      target.focus({ preventScroll: true })
      return
    }
    if (isFirstLoad) return
    if (!restoringHistory) window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
  }, [key, pathname, hash, navigationType, main])
}
