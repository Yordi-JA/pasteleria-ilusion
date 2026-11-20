/**
 * La geometría del encabezado de la portada en escritorio (tanda 7, D90), sin React ni DOM: dado lo que se midió una vez y el
 * scroll, dónde va el logo que viaja y cuánto se recorre la navegación. Todo sale del scroll, sin tiempo: al subir, cada cuadro
 * vuelve exactamente al mismo lugar que tuvo al bajar.
 */

/** Un rectángulo en px. */
export type Box = { left: number; top: number; width: number; height: number }

export type MorphGeometry = {
  /** El logotipo grande en su lugar con el scroll en 0 (px del documento, que con el scroll en 0 son los de la ventana). */
  start: Box
  /** El lugar del logo de la barra con la barra ya fija (px de la ventana). */
  end: Box
  /** Lo que se baja antes de que la barra quede fija; antes de eso la barra sube con la página. */
  stickScroll: number
  /** Lo que se baja para que el logotipo grande, que sube con la página, llegue al lugar del logo de la barra. */
  distance: number
  /** Lo que la navegación se recorre a la izquierda arriba de todo: hasta donde empieza el logo de la barra (0 si no se ve). */
  navOffset: number
}

/** `top`: el logotipo grande en su lugar. `travel`: el logo viaja. `docked`: llegó y la barra es la de las demás páginas. */
export type MorphPhase = 'top' | 'travel' | 'docked'

export type MorphFrame = {
  /** De 0 (arriba) a 1 (el logo llegó a la barra). */
  progress: number
  phase: MorphPhase
  /** Esquina de arriba a la izquierda del logo que viaja (px de la ventana) y su escala respecto al logotipo grande. */
  logo: { x: number; y: number; scale: number }
  /** Desplazamiento horizontal de la navegación en px (negativo: a la izquierda). */
  navShift: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const lerp = (from: number, to: number, t: number) => from + (to - from) * t

/**
 * Curvas que frenan al final. La navegación se recorre con la cúbica y el logo se encoge con la cuadrática: los enlaces dejan
 * libre el lugar del logo antes de que el logo, ya chico, entre a la barra, y el logo no se queda chico lejos de ella. La posición
 * del logo es lineal: su borde de arriba sube junto con la página, como si el logotipo grande siguiera ahí.
 */
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
export const easeOutQuad = (t: number) => 1 - (1 - t) ** 2

/** La distancia del cambio: lo que sube el logotipo grande, con la página, hasta el lugar del logo de la barra fija. */
export function morphDistance(start: Box, end: Box): number {
  return Math.max(1, start.top - end.top)
}

/** El cuadro del encabezado para un scroll dado. */
export function morphFrame(geometry: MorphGeometry, scrollY: number): MorphFrame {
  const { start, end, stickScroll, distance, navOffset } = geometry
  const progress = clamp01(scrollY / distance)
  const phase: MorphPhase = progress <= 0 ? 'top' : progress >= 1 ? 'docked' : 'travel'
  // Mientras la barra todavía no está fija, su logo queda más abajo: lo que falta para fijarse.
  const endTop = end.top + Math.max(0, stickScroll - scrollY)
  return {
    progress,
    phase,
    logo: {
      x: lerp(start.left, end.left, progress),
      y: lerp(start.top, endTop, progress),
      scale: lerp(1, end.width / start.width, easeOutQuad(progress)),
    },
    navShift: -navOffset * (1 - easeOutCubic(progress)),
  }
}
