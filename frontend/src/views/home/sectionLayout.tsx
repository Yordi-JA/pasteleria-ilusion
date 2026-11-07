import type { ReactNode, RefObject } from 'react'
import { focusRing, focusRingOnColor } from '../../components/focus.ts'
import LoadErrorNotice from '../../components/LoadErrorNotice.tsx'

/** Columna de contenido de 1200 px de la portada, con el margen de 24 px (16 px en móvil). */
export const sectionColumn = 'mx-auto flex w-full max-w-[1200px] flex-col px-6 max-[600px]:px-4'

/**
 * Título de sección (h2). Enfocable por código: al reintentar, el foco vuelve aquí y no se pierde. Lleva el anillo
 * de foco del libro de marca (en `betun` sobre `mermelada`) para quien llega con el teclado.
 */
export const sectionHeading = `self-start rounded-sm font-display text-titulo-1 ${focusRing}`

/** El mismo título sobre `mermelada` (la vitrina). */
export const sectionHeadingOnColor = `self-start rounded-sm font-display text-titulo-1 ${focusRingOnColor}`

/** Frase de una sección que quedó vacía después de reintentar (D47). */
export function EmptyAfterError({ text, onColor = false }: { text: string; onColor?: boolean }) {
  return <p className={`text-cuerpo ${onColor ? 'text-sobre-color-suave' : 'text-mermelada-suave'}`}>{text}</p>
}

/** El aviso de "Agregar al pedido" no deja hueco mientras está vacío; con texto, separa de la cuadrícula. */
export const addNoticeSpacing = '[&:not(:empty)]:mb-8'

type SectionErrorProps = {
  title: string
  onRetry: () => void
  /** El título de la sección, que recibe el foco cuando el botón desaparece al reintentar. */
  headingRef: RefObject<HTMLHeadingElement | null>
}

export function SectionError({ title, onRetry, headingRef }: SectionErrorProps) {
  return (
    <LoadErrorNotice
      title={title}
      onRetry={() => {
        headingRef.current?.focus()
        onRetry()
      }}
    />
  )
}

/** Un campo de color de la portada. `data-campo` permite revisar en las pruebas el orden de los pisos. */
export function Field({
  field,
  labelledBy,
  className = '',
  children,
}: {
  field: 'fresa' | 'nata' | 'mermelada'
  labelledBy: string
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={labelledBy} data-campo={field} className={className}>
      {children}
    </section>
  )
}
