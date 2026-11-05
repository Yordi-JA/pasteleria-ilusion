import Pending from './Pending.tsx'

/** Frases con datos de la pastelería que se repiten en la franja, el menú y el pie. */

export function LeadDaysText({ days }: { days: number | null }) {
  if (days === null) {
    return (
      <>
        Pedidos con <Pending what="días" /> de anticipación
      </>
    )
  }
  return <>Pedidos con {days} {days === 1 ? 'día' : 'días'} de anticipación</>
}

export function WhatsAppNumber({ display }: { display?: string }) {
  return <>WhatsApp {display ?? <Pending what="número" />}</>
}

/**
 * Lo que ocupa el lugar del enlace "Escribir por WhatsApp" cuando no hay número: texto, nunca un enlace.
 * Va en un solo `<span>` para que, dentro de un contenedor flex, la frase no se parta ni pierda el espacio.
 */
export function WhatsAppWritePending() {
  return (
    <span>
      Escribir por WhatsApp <Pending what="número" />
    </span>
  )
}

type StoreSkeletonProps = {
  /** Ancho aproximado del texto que reemplaza, como clase de Tailwind (`w-64`). */
  width: string
  /** Campo sobre el que se dibuja: el bloque usa un tono cercano para no competir con el texto real. */
  on: 'mermelada' | 'fresa'
}

const skeletonTone = {
  mermelada: 'bg-mermelada-suave',
  fresa: 'bg-fresa-claro',
} as const

/**
 * Bloque de carga de una línea mientras llegan los datos de la pastelería. Es provisional y local: el
 * esqueleto de carga completo del libro de marca llega con su propio componente y lo reemplaza. Es
 * decorativo; la región que lo contiene lleva `aria-busy` y un solo `StoreLoadingLabel`.
 */
export function StoreSkeleton({ width, on }: StoreSkeletonProps) {
  return (
    <span
      data-esqueleto=""
      aria-hidden="true"
      className={`inline-block h-[1em] max-w-full rounded-sm align-[-0.15em] motion-safe:animate-pulse ${skeletonTone[on]} ${width}`}
    />
  )
}

/** Texto para lector de pantalla, uno por región con `aria-busy`. */
export function StoreLoadingLabel() {
  return <span className="sr-only">Cargando datos de la pastelería</span>
}
