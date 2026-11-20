import type { HTMLAttributes } from 'react'
import { useCascade } from '../viewmodels/useCascade.ts'
import { useReveal } from '../viewmodels/useReveal.ts'

type RevealProps = HTMLAttributes<HTMLElement> & {
  /** `ul` para envolver una cuadrícula de tarjetas sin otro elemento (sus `li` siguen siendo hijos directos). */
  as?: 'div' | 'ul'
  /**
   * Solo en cuadrículas de tarjetas (D90): en lugar de aparecer el bloque entero, cada hijo sube en cascada al entrar a la
   * ventana (`useCascade`), 60 ms tras el anterior de su tanda y como máximo 300 ms.
   */
  stagger?: boolean
}

type BlockProps = Omit<RevealProps, 'stagger'>

const ATTRIBUTE = { hidden: 'oculta', shown: 'visible' } as const

/** El bloque entero: sube 8 px y se desvanece una sola vez, en 250 ms (`useReveal`). */
function SectionReveal({ as = 'div', children, ...rest }: BlockProps) {
  // El mismo ref sirve para `div` o `ul`: la intersección de los dos tipos encaja en cualquiera.
  const { ref, phase } = useReveal<HTMLDivElement & HTMLUListElement>()
  const props = { ...rest, 'data-aparicion': phase === 'static' ? undefined : ATTRIBUTE[phase] }
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

/** La cuadrícula cuyos hijos suben uno tras otro; `data-escalonada` solo la marca, el estado va en cada hijo. */
function CascadeReveal({ as = 'div', children, ...rest }: BlockProps) {
  const ref = useCascade<HTMLDivElement & HTMLUListElement>()
  const props = { ...rest, 'data-escalonada': '' }
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

/**
 * Aparece al llegar a la vista. Lo que ya se ve al cargar, o con "reducir movimiento", se pinta tal cual. Envuelve secciones
 * o cuadrículas; no lleva estilo propio.
 */
export default function Reveal({ stagger = false, ...rest }: RevealProps) {
  return stagger ? <CascadeReveal {...rest} /> : <SectionReveal {...rest} />
}
