import { useState } from 'react'
import { PHOTO_FILL } from '../viewmodels/productPhoto.ts'
import type { PhotoView } from '../viewmodels/productPhoto.ts'

/**
 * Silueta del hueco, la misma del mockup: tres pisos (tarjeta grande), dos pisos (lista y vitrina), una rebanada o un
 * postre redondo (los postres del catálogo).
 */
export type PhotoShape = 'tiers3' | 'tiers2' | 'slice' | 'round'

type ProductPhotoProps = {
  photo: PhotoView
  shape: PhotoShape
  className?: string
  /** El hueco sobre un campo `fresa` (el encabezado de la ficha): la silueta va en `betun` para que se lea. */
  onFresa?: boolean
  /**
   * La caja de la tarjeta grande (tanda 6, solo con `tiers3`, que tiene la proporción de la imagen del modelo): la imagen del
   * modelo ya la llena; una foto se agranda y se sube (`PHOTO_FILL`) para que su pastel mida y se apoye igual, y la fila se lea
   * pareja. Lo transparente de la foto sale de la caja.
   */
  fillBox?: boolean
}

// Proporciones de las siluetas del mockup: la foto real usa la misma caja para que nada salte al cambiarla.
const aspect: Record<PhotoShape, string> = {
  tiers3: 'aspect-[360/300]',
  tiers2: 'aspect-[200/150]',
  slice: 'aspect-[200/120]',
  round: 'aspect-[200/130]',
}

function Silhouette({ shape, label, onFresa = false }: { shape: PhotoShape; label: string; onFresa?: boolean }) {
  // El texto va dentro del SVG, como en el mockup, para que acompañe a la silueta a cualquier tamaño.
  const textClass = 'fill-mermelada-suave font-sans'
  if (shape === 'tiers3') {
    return (
      <svg viewBox="0 0 360 300" aria-hidden="true" className="block h-auto w-full">
        <g className={onFresa ? 'fill-betun' : 'fill-fresa'}>
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
  if (shape === 'round') {
    return (
      <svg viewBox="0 0 200 130" aria-hidden="true" className="block h-auto w-full">
        <path d="M20 64 V92 A80 24 0 0 0 180 92 V64 Z" className="fill-relieve" />
        <ellipse cx="100" cy="64" rx="80" ry="24" strokeWidth="2" className="fill-harina stroke-relieve" />
        <text x="100" y="108" textAnchor="middle" fontSize="12" className={textClass}>
          {label}
        </text>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true" className="block h-auto w-full">
      {/* Una rebanada en perspectiva: la punta a la izquierda, el lado curvo a la derecha y el corte de frente, con
          sus capas (cobertura, pan, relleno, pan). El texto va debajo, sobre el campo de la tarjeta. */}
      <g strokeWidth="1.5" strokeLinejoin="round" className="stroke-relieve">
        <path d="M170 46 L188 30 V68 L170 84 Z" className="fill-relieve" />
        <path d="M22 62 L170 46 L170 52 L22 68 Z" data-capa="cobertura" className="fill-betun" />
        <path d="M22 68 L170 52 L170 63 L22 79 Z" data-capa="pan" className="fill-fresa" />
        <path d="M22 79 L170 63 L170 69 L22 85 Z" data-capa="relleno" className="fill-harina" />
        <path d="M22 85 L170 69 L170 84 L22 100 Z" data-capa="pan" className="fill-fresa" />
        <path d="M22 62 L188 30 Q180 44 170 46 Z" className="fill-fresa-claro" />
      </g>
      <g strokeWidth="1.5" strokeLinecap="round" className="stroke-harina">
        <path d="M170 52 L188 36 M170 63 L188 47 M170 69 L188 53" fill="none" />
      </g>
      <g strokeWidth="1.5" className="fill-betun stroke-relieve">
        <circle cx="173" cy="45" r="3.5" />
        <circle cx="179" cy="40" r="3.5" />
        <circle cx="184" cy="34" r="3.5" />
      </g>
      <g strokeWidth="1.5" className="fill-betun stroke-relieve">
        <circle cx="136" cy="44" r="4.5" />
        <circle cx="146" cy="42" r="4" />
        <circle cx="140" cy="39" r="4" />
      </g>
      <text x="100" y="116" textAnchor="middle" fontSize="14" className={textClass}>
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
export default function ProductPhoto({ photo, shape, className = '', onFresa = false, fillBox = false }: ProductPhotoProps) {
  // Estado de presentación: la foto que no cargó (archivo que falta o dañado) cae al hueco, nunca a un ícono roto.
  // Se guarda la dirección y no un sí o no, así una foto nueva vuelve a intentarse.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (photo.src && photo.src !== failedSrc) {
    const src = photo.src
    if (fillBox && !photo.model) {
      return (
        <div className={`relative overflow-x-clip ${aspect[shape]} ${className}`}>
          <img
            src={src}
            alt={photo.alt}
            onError={() => setFailedSrc(src)}
            loading="lazy"
            decoding="async"
            style={PHOTO_FILL}
            className="pointer-events-none absolute left-1/2 block h-auto max-w-none -translate-x-1/2"
          />
        </div>
      )
    }
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
      <Silhouette shape={shape} label={photo.placeholder} onFresa={onFresa} />
    </div>
  )
}
