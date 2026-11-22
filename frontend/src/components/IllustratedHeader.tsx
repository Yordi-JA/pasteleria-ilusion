import type { ReactNode, RefObject } from 'react'
import Breadcrumb from './Breadcrumb.tsx'
import type { Crumb } from './Breadcrumb.tsx'
import Duya from './Duya.tsx'
import { focusRing } from './focus.ts'
import LineDrawing from './LineDrawing.tsx'
import type { LineDrawingName } from './LineDrawing.tsx'

type IllustratedHeaderProps = {
  /** El `h1`. */
  title: string
  titleId: string
  /** El dibujo de línea a la derecha (`Vitrina.dc.html`: el toldo; `Rebanadas.dc.html`: la rebanada; el catálogo: los pisos). */
  drawing: LineDrawingName
  /** El `h1` recibe el foco al reintentar una carga que falló, así el foco no se pierde con el botón. */
  headingRef?: RefObject<HTMLHeadingElement | null>
  /** La frase bajo el título. */
  children?: ReactNode
  /**
   * Las migas, solo en una página que cuelga de otra (el envío de referencia, bajo "Realizar pedido"). Por omisión no hay: en el
   * catálogo, la vitrina, las rebanadas o las bases, la barra ya dice dónde estás (correcciones del 21 de noviembre).
   */
  crumbs?: Crumb[]
}

/**
 * Encabezado sobre `fresa` de la vitrina, las rebanadas y el catálogo: migas si las hay, `h1`, su frase y el dibujo de línea a la derecha al
 * 30%, detrás del contenido (libro de marca, "Dibujos de línea"); en móvil el dibujo no va. Cierra con la guirnalda.
 */
export default function IllustratedHeader({ title, titleId, drawing, headingRef, children, crumbs }: IllustratedHeaderProps) {
  return (
    <>
      <section aria-labelledby={titleId} className="relative z-[2] bg-fresa">
        <div className="relative mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4">
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-6 z-[-1] flex items-center max-[600px]:hidden">
            <LineDrawing drawing={drawing} className="text-mermelada opacity-30" />
          </div>
          <div className="flex flex-col gap-4 pb-12 pr-36 pt-8 max-[600px]:pr-0">
            {crumbs && crumbs.length > 0 && <Breadcrumb items={crumbs} />}
            <h1 id={titleId} ref={headingRef} tabIndex={-1} className={`self-start rounded-sm font-display text-display max-[600px]:text-titulo-1 ${focusRing}`}>
              {title}
            </h1>
            {children}
          </div>
        </div>
      </section>
      <Duya color="fresa" />
    </>
  )
}
