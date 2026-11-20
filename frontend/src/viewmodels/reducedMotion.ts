const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** Si la persona pidió reducir el movimiento. Se lee en el momento: el sistema puede cambiarlo con la página abierta. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches
}

/** Avisa cuando la persona cambia la preferencia con la página abierta (para `useSyncExternalStore`). */
export function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
