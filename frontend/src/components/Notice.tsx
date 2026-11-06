import { CheckCircle, Info, WarningCircle, WarningOctagon } from '@phosphor-icons/react'
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
  success: 'border-2 border-exito',
  error: 'border-2 border-error',
}

const iconColors: Record<NoticeTone, string> = {
  info: 'text-mermelada',
  attention: 'text-cajeta',
  success: 'text-exito',
  error: 'text-error',
}

const icons: Record<NoticeTone, Icon> = {
  info: Info,
  attention: WarningCircle,
  success: CheckCircle,
  error: WarningOctagon,
}

const titleColors: Record<NoticeTone, string> = {
  info: 'text-mermelada',
  attention: 'text-mermelada',
  success: 'text-exito',
  error: 'text-error',
}

// Un aviso con role status o alert se anuncia solo si se inserta de forma dinámica; uno presente al cargar la página no se lee.
export default function Notice({ tone = 'info', title, children, className = '', live = true }: NoticeProps) {
  const ToneIcon = icons[tone]
  return (
    <div
      role={live ? (tone === 'error' ? 'alert' : 'status') : undefined}
      className={`flex items-start gap-3 rounded-md bg-betun px-4 py-3.5 text-cuerpo text-mermelada ${borders[tone]} ${className}`}
    >
      <ToneIcon size={22} weight="regular" aria-hidden="true" className={`mt-px shrink-0 ${iconColors[tone]}`} />
      <div className="flex flex-col gap-1.5">
        <strong className={`font-semibold ${titleColors[tone]}`}>{title}</strong>
        {children && <div className="text-nota">{children}</div>}
      </div>
    </div>
  )
}
