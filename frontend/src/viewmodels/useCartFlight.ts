import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

/** Lo que dura el vuelo de la perla (libro de marca: los movimientos largos del sitio rondan los 300 ms; este cruza la pantalla). */
export const FLIGHT_MS = 550
/** Lo que dura el rebote del ícono al llegar la perla. */
export const BOUNCE_MS = 200
/** Diámetro de la perla en px. */
export const PEARL_SIZE = 13

type Point = { x: number; y: number }

/** Una perla en vuelo: de dónde sale, a dónde llega (centros, en px de la ventana) y cuántas piezas trae. */
export type Pearl = { id: number; from: Point; to: Point; pieces: number }

export type CartFlight = {
  /** Lanza una perla desde el botón presionado hacia el carrito; `pieces` es lo que agregó. Sin vuelo posible, no hace nada. */
  launch: (pieces: number) => void
}

/**
 * Lo que `useAddToCart` y `useAddDesignToCart` usan para pedir la perla. Fuera del marco del sitio no hay encabezado a donde
 * volar, y el vuelo es solo un adorno: por eso el valor de respaldo no hace nada, en lugar de fallar como `useCart`.
 */
export const CartFlightContext = createContext<CartFlight>({ launch: () => {} })

export function useCartFlight(): CartFlight {
  return useContext(CartFlightContext)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function centerOf(element: Element): Point | null {
  const { left, top, width, height } = element.getBoundingClientRect()
  if (width === 0 || height === 0) return null
  return { x: left + width / 2, y: top + height / 2 }
}

/**
 * Los cuadros del vuelo: una curva cuadrática que sube antes de bajar al carrito, muestreada con desaceleración
 * (ease-out cúbico) para que solo se animen `transform` y `opacity`. La perla se encoge y se desvanece al final.
 */
export function flightKeyframes({ from, to }: Pick<Pearl, 'from' | 'to'>): Keyframe[] {
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 90 }
  const steps = 16
  const half = PEARL_SIZE / 2
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps
    const s = 1 - (1 - t) ** 3
    const mix = (a: number, b: number, c: number) => (1 - s) ** 2 * a + 2 * (1 - s) * s * b + s ** 2 * c
    const x = mix(from.x, control.x, to.x) - half
    const y = mix(from.y, control.y, to.y) - half
    return {
      offset: t,
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 - 0.4 * t).toFixed(3)})`,
      opacity: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
    }
  })
}

/**
 * El vuelo "agregado al carrito" del marco del sitio. Un clic en un botón guarda cuál fue (escucha en captura, antes de
 * que React corra el manejador); cuando el carrito agrega algo, `launch` mide ese botón y el ícono del carrito una sola
 * vez y deja una perla en `pearls`. El estado del carrito cambia al instante; solo el número del encabezado espera:
 * `shownCount` es el valor real menos lo que traen las perlas aún en el aire, y baja a cero pendiente cuando cada una
 * llega (`arrive`), cuando la vista se desmonta o cuando el vuelo se cancela.
 * Con `prefers-reduced-motion`, o si no se puede medir el botón o el ícono, no hay perla ni rebote.
 */
export function useCartFlightState(count: number) {
  const [pearls, setPearls] = useState<Pearl[]>([])
  const iconRef = useRef<HTMLAnchorElement | null>(null)
  const lastButton = useRef<Element | null>(null)
  const nextId = useRef(1)

  useEffect(() => {
    const remember = (event: MouseEvent) => {
      lastButton.current = event.target instanceof Element ? event.target.closest('button') : null
    }
    document.addEventListener('click', remember, true)
    return () => document.removeEventListener('click', remember, true)
  }, [])

  const launch = useCallback((pieces: number) => {
    const button = lastButton.current
    const icon = iconRef.current
    if (pieces <= 0 || !button?.isConnected || !icon?.isConnected || prefersReducedMotion()) return
    const from = centerOf(button)
    const to = centerOf(icon)
    if (!from || !to) return
    setPearls((current) => [...current, { id: nextId.current++, from, to, pieces }])
  }, [])

  const arrive = useCallback((id: number) => {
    setPearls((current) => current.filter((pearl) => pearl.id !== id))
    iconRef.current?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
      { duration: BOUNCE_MS, easing: 'ease-out' },
    )
  }, [])

  const pending = pearls.reduce((sum, pearl) => sum + pearl.pieces, 0)
  const shownCount = Math.max(0, count - pending)
  const flight = useMemo(() => ({ launch }), [launch])
  return { flight, pearls, arrive, iconRef, shownCount }
}
