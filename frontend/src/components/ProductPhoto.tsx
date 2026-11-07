import { useState } from 'react'
import type { PhotoView } from '../viewmodels/productPhoto.ts'

/** Silueta del hueco, la misma del mockup: tres pisos (tarjeta grande), dos pisos (lista y vitrina) o una rebanada. */
export type PhotoShape = 'tiers3' | 'tiers2' | 'slice'

type ProductPhotoProps = {
  photo: PhotoView
  shape: PhotoShape
  className?: string
}

// Proporciones de las siluetas del mockup: la foto real usa la misma caja para que nada salte al cambiarla.
const aspect: Record<PhotoShape, string> = {
  tiers3: 'aspect-[360/300]',
  tiers2: 'aspect-[200/150]',
  slice: 'aspect-[200/120]',
}

function Silhouette({ shape, label }: { shape: PhotoShape; label: string }) {
  // El texto va dentro del SVG, como en el mockup, para que acompañe a la silueta a cualquier tamaño.
  const textClass = 'fill-mermelada-suave font-sans'
  if (shape === 'tiers3') {
    return (
      <svg viewBox="0 0 360 300" aria-hidden="true" className="block h-auto w-full">
        <g className="fill-fresa">
          <rect x="112" y="20" width="136" height="72" rx="6" />
          <rect x="72" y="92" width="216" height="88" rx="6" />
          <rect x="28" y="180" width="304" height="112" rx="6" />
        </g>
        <text x="180" y="248" textAnchor="middle" fontSize="16" className={textClass}>
          {label}
        </text>
      </svg>
    )
  }
  if (shape === 'tiers2') {
    return (
      <svg viewBox="0 0 200 150" aria-hidden="true" className="block h-auto w-full">
        <g className="fill-fresa">
          <rect x="62" y="22" width="76" height="46" rx="6" />
          <rect x="32" y="68" width="136" height="72" rx="6" />
        </g>
        <text x="100" y="110" textAnchor="middle" fontSize="12" className={textClass}>
          {label}
        </text>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true" className="block h-auto w-full">
      <path d="M24 84 L150 34 L178 56 L178 98 L24 112 Z" className="fill-relieve" />
      <path d="M24 84 L150 34 L178 56 Z" className="fill-harina" />
      <text x="104" y="96" textAnchor="middle" fontSize="12" className={textClass}>
        {label}
      </text>
    </svg>
  )
}

/**
 * Foto de un producto. Con foto, un `<img>` con su texto alternativo. Sin ella, el hueco del libro de marca: una
 * silueta con "Foto del pastel". El hueco no es decorativo: es una imagen (`role="img"`) cuyo nombre dice que la
 * foto está pendiente, como el mockup ("Foto del pastel pendiente"). Si la foto no carga, también se muestra el hueco.
 */
export default function ProductPhoto({ photo, shape, className = '' }: ProductPhotoProps) {
  // Estado de presentación: la foto que no cargó (archivo que falta o dañado) cae al hueco, nunca a un ícono roto.
  // Se guarda la dirección y no un sí o no, así una foto nueva vuelve a intentarse.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (photo.src && photo.src !== failedSrc) {
    const src = photo.src
    return (
      <img
        src={src}
        alt={photo.alt}
        onError={() => setFailedSrc(src)}
        loading="lazy"
        decoding="async"
        className={`block h-auto w-full object-contain ${aspect[shape]} ${className}`}
      />
    )
  }
  return (
    <div role="img" aria-label={`${photo.placeholder} pendiente`} data-foto-pendiente="" className={className}>
      <Silhouette shape={shape} label={photo.placeholder} />
    </div>
  )
}
