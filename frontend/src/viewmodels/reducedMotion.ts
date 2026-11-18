const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** Si la persona pidió reducir el movimiento. Se lee en el momento: el sistema puede cambiarlo con la página abierta. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches
}
