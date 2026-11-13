import Pending from './Pending.tsx'
import Skeleton from './Skeleton.tsx'

type LeadDaysProps = {
  /** Días de anticipación de los pedidos: `null` pendiente, `undefined` mientras cargan los datos del negocio. */
  days: number | null | undefined
  /** Campo sobre el que va el texto, para el tono del esqueleto. */
  tone?: 'nata' | 'fresa' | 'mermelada'
}

/** "2 días" dentro de una frase: un esqueleto en línea mientras carga y el marcador de pendiente si falta el dato. */
export default function LeadDays({ days, tone = 'nata' }: LeadDaysProps) {
  if (days === undefined) return <Skeleton inline tone={tone} className="h-[1em] w-16 align-[-0.15em]" />
  if (days === null) return <Pending what="días" />
  return <>{days === 1 ? '1 día' : `${days} días`}</>
}
