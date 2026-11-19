import { Info, WarningCircle, WarningOctagon } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

type NoticeTone = 'info' | 'attention' | 'success' | 'error'

type NoticeProps = {
  tone?: NoticeTone
  /** Palabra o frase que nombra el estado; el color nunca va solo. */
  title: string
  children?: ReactNode
  className?: string
  /**
   * Con `false` el aviso no lleva `role`: va dentro de una región viva que ya estaba montada (ver
   * `AddToCartNotice`), y dos regiones anidadas pueden leerse dos veces.
   */
  live?: boolean
}

const borders: Record<NoticeTone, string> = {
  info: 'border border-relieve',
  attention: 'border-2 border-cajeta',
  success: 'border border-fresa bg-fresa-claro',
  error: 'border-2 border-error',
}

// Lo confirmado se pinta de glaseado (`fresa-claro`); el resto va sobre `betun`.
const surfaces: Record<NoticeTone, string> = {
  info: 'bg-betun',
  attention: 'bg-betun',
  success: '',
  error: 'bg-betun',
}

const iconColors: Record<NoticeTone, string> = {
  info: 'text-mermelada',
  attention: 'text-cajeta',
  success: '',
  error: 'text-error',
}

// Lo confirmado no lleva palomita verde: lleva la perla de duya de la marca, la misma que vuela al carrito.
const icons: Record<Exclude<NoticeTone, 'success'>, Icon> = {
  info: Info,
  attention: WarningCircle,
  error: WarningOctagon,
}

const titleColors: Record<NoticeTone, string> = {
  info: 'text-mermelada',
  attention: 'text-mermelada',
  success: 'text-mermelada',
  error: 'text-error',
}

// Un aviso con role status o alert se anuncia solo si se inserta de forma dinámica; uno presente al cargar la página no se lee.
export default function Notice({ tone = 'info', title, children, className = '', live = true }: NoticeProps) {
  const marker =
    tone === 'success' ? (
      <span aria-hidden="true" className="size-4 shrink-0 rounded-full border-[1.5px] border-mermelada-suave bg-fresa" />
    ) : (
      (() => {
        const ToneIcon = icons[tone]
        return <ToneIcon size={20} weight="regular" aria-hidden="true" className={`shrink-0 ${iconColors[tone]}`} />
      })()
    )
  return (
    <div
      role={live ? (tone === 'error' ? 'alert' : 'status') : undefined}
      className={`flex flex-col gap-1.5 rounded-md px-5 py-4 text-cuerpo text-mermelada ${surfaces[tone]} ${borders[tone]} ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-5 shrink-0 items-center justify-center">{marker}</span>
        <strong className={`font-display text-[18px] font-medium leading-snug ${titleColors[tone]}`}>{title}</strong>
      </div>
      {children && <div className="flex flex-col gap-1.5 pl-[30px] text-nota">{children}</div>}
    </div>
  )
}
