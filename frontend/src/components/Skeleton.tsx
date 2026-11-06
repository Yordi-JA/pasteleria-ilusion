import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

type SkeletonTone = 'nata' | 'fresa' | 'mermelada'

type SkeletonProps = {
  /** Campo sobre el que se dibuja el bloque. */
  tone?: SkeletonTone
  /** Bloque en línea, para sustituir una palabra dentro de un texto. */
  inline?: boolean
  /** Radio del bloque: `sm` (6 px) para líneas, `md` (12 px) para fotos y botones. */
  radius?: 'sm' | 'md'
  /** Tamaño y posición, como clases de Tailwind (`h-5 w-2/3`). */
  className?: string
}

// Harina sobre nata y fresa claro sobre fresa llevan el brillo del libro de marca. Sobre `mermelada` el
// libro no define un tono: se conserva `mermelada-suave`, liso y sin brillo, que el marco ya usaba (D43).
// El brillo es un ::after que se desliza con `transform` (se compone en la GPU, a diferencia de animar
// `background-position`). Con `prefers-reduced-motion` no se muestra: el bloque queda liso, sin franja fija.
const shimmer =
  "relative isolate overflow-hidden after:absolute after:inset-0 after:hidden after:bg-esqueleto-brillo after:content-[''] motion-safe:after:block motion-safe:after:animate-esqueleto"

const tones: Record<SkeletonTone, string> = {
  nata: `bg-harina ${shimmer}`,
  fresa: `bg-fresa-claro ${shimmer}`,
  mermelada: 'bg-mermelada-suave',
}

const radii = { sm: 'rounded-sm', md: 'rounded-md' } as const

/**
 * Bloque de esqueleto de carga: decorativo, así que no se anuncia. Quien agrupa los bloques los pone
 * dentro de `LoadingRegion`, que dice una sola vez qué se carga. El brillo (1.4 s, `ease-in-out`) se
 * detiene con `prefers-reduced-motion` y deja el bloque liso.
 */
export default function Skeleton({ tone = 'nata', inline = false, radius = 'sm', className = '' }: SkeletonProps) {
  return (
    <span
      data-esqueleto=""
      aria-hidden="true"
      className={`${inline ? 'inline-block' : 'block'} ${radii[radius]} ${tones[tone]} ${className}`}
    />
  )
}

type LoadingRegionProps = {
  /** Si los datos todavía no llegan. */
  loading: boolean
  /** Qué se carga, en una frase para el lector de pantalla ("Cargando el catálogo…"). */
  label: string
  /** Lo que se muestra mientras carga: los bloques `Skeleton` con la forma de la pantalla real. */
  skeleton: ReactNode
  /** Lo que se muestra al terminar. */
  children: ReactNode
  className?: string
}

/**
 * Envoltorio de una pantalla con datos: muestra `skeleton` mientras `loading` y `children` después.
 * Se queda siempre montado, porque una región `role="status"` solo anuncia los cambios de un texto que
 * ya estaba en la página. Por eso el `<p>` del estado es hermano del contenedor, fuera del `aria-busy`
 * (un lector puede ignorar lo que está dentro de un elemento ocupado), y el texto llega un tick
 * después del montaje para que también se anuncie en la primera carga. Al terminar el estado queda
 * vacío: no hay texto de "cargado". El encabezado de la página va fuera del componente.
 */
export function LoadingRegion({ loading, label, skeleton, children, className = '' }: LoadingRegionProps) {
  // Estado de presentación: retrasa un tick el primer texto para que la región viva ya exista.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <p role="status" className="sr-only">
        {loading && mounted ? label : ''}
      </p>
      <div aria-busy={loading || undefined} className={className}>
        {loading ? skeleton : children}
      </div>
    </>
  )
}
