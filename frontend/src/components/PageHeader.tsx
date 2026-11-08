import type { ReactNode } from 'react'
import Duya from './Duya.tsx'

type PageHeaderProps = {
  /** El h1. Puede llevar un marcador `Pending` cuando el título es un dato que todavía no existe. */
  title: ReactNode
  children?: ReactNode
  /** Lo que va antes del h1 dentro del campo `fresa`, como las migas de pan. */
  before?: ReactNode
}

/** Encabezado de página: campo `fresa` con el h1 (cada página abre con fresa) y conchas de duya donde empieza el contenido. */
export default function PageHeader({ title, children, before }: PageHeaderProps) {
  return (
    <>
      <div className="bg-fresa">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 pb-12 pt-8 max-[600px]:px-4">
          {before}
          <h1 className="font-display text-titulo-1">{title}</h1>
          {children}
        </div>
      </div>
      <Duya type="concha" color="fresa" />
    </>
  )
}
