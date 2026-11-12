import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { flightKeyframes, FLIGHT_MS, PEARL_SIZE } from '../viewmodels/useCartFlight.ts'
import type { Pearl } from '../viewmodels/useCartFlight.ts'

function FlyingPearl({ pearl, onArrive }: { pearl: Pearl; onArrive: (id: number) => void }) {
  const element = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = element.current
    if (!node) return
    const animation = node.animate(flightKeyframes(pearl), { duration: FLIGHT_MS, easing: 'linear', fill: 'forwards' })
    const done = () => onArrive(pearl.id)
    animation.onfinish = done
    animation.oncancel = done
    return () => {
      animation.onfinish = null
      animation.oncancel = null
      animation.cancel()
    }
  }, [pearl, onArrive])

  return (
    <span
      ref={element}
      aria-hidden="true"
      data-testid="perla-carrito"
      style={{ width: PEARL_SIZE, height: PEARL_SIZE, transform: `translate(${pearl.from.x - PEARL_SIZE / 2}px, ${pearl.from.y - PEARL_SIZE / 2}px)` }}
      className="pointer-events-none fixed left-0 top-0 z-[60] rounded-full border-[1.5px] border-mermelada-suave bg-fresa will-change-transform"
    />
  )
}

/**
 * Las perlas de duya que vuelan al carrito. Son decorativas: sin foco, sin clics y ocultas al lector de pantalla; lo que
 * se anuncia es el aviso "Agregado al pedido". Van en un portal `position: fixed` para que ningún contenedor las recorte.
 */
export default function CartPearls({ pearls, onArrive }: { pearls: Pearl[]; onArrive: (id: number) => void }) {
  return createPortal(
    pearls.map((pearl) => <FlyingPearl key={pearl.id} pearl={pearl} onArrive={onArrive} />),
    document.body,
  )
}
