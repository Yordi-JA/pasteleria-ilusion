import { useState, useSyncExternalStore } from 'react'
import { GALLERY_DURATION_SECONDS, GALLERY_PHOTOS } from './homeGallery.ts'
import { prefersReducedMotion, subscribeReducedMotion } from './reducedMotion.ts'

/**
 * "Hechos en la casa": la banda se desliza sola salvo que la persona la pause o pida reducir el movimiento. Con
 * "reducir movimiento" no hay banda animada ni botón de pausa: una sola copia de las fotos, que se recorre con el
 * scroll y el teclado. El pase del mouse y el foco los resuelve `index.css`.
 */
export function useHomeGallery() {
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion)
  const [paused, setPaused] = useState(false)
  return {
    photos: GALLERY_PHOTOS,
    duration: GALLERY_DURATION_SECONDS,
    reduced,
    paused,
    togglePause: () => setPaused((value) => !value),
  }
}
