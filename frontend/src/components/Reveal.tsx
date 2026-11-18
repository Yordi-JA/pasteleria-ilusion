import type { HTMLAttributes } from 'react'
import { useReveal } from '../viewmodels/useReveal.ts'

type RevealProps = HTMLAttributes<HTMLElement> & {
  /** `ul` para envolver una cuadrícula de tarjetas sin otro elemento (sus `li` siguen siendo hijos directos). */
  as?: 'div' | 'ul'
  /**
   * Solo en cuadrículas de tarjetas: en lugar de aparecer el bloque entero, aparecen sus hijos uno tras otro, 40 ms
   * entre cada uno y como máximo 240 ms (`index.css`).
   */
  stagger?: boolean
}

const ATTRIBUTE = { hidden: 'oculta', shown: 'visible' } as const

/**
 * Aparece al llegar a la vista (`useReveal`): sube 8 px y se desvanece una sola vez, en 250 ms. Lo que ya se ve al cargar,
 * o con "reducir movimiento", se pinta tal cual. Envuelve secciones o cuadrículas; no lleva estilo propio.
 */
export default function Reveal({ as = 'div', stagger = false, children, ...rest }: RevealProps) {
  // El mismo ref sirve para `div` o `ul`: la intersección de los dos tipos encaja en cualquiera.
  const { ref, phase } = useReveal<HTMLDivElement & HTMLUListElement>()
  const state = phase === 'static' ? undefined : ATTRIBUTE[phase]
  const props = { ...rest, 'data-aparicion': state, 'data-escalonada': stagger && state ? '' : undefined }
  if (as === 'ul') {
    return (
      <ul ref={ref} {...props}>
        {children}
      </ul>
    )
  }
  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  )
}
