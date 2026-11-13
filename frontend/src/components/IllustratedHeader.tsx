import type { ReactNode, RefObject } from 'react'
import Breadcrumb from './Breadcrumb.tsx'
import Duya from './Duya.tsx'
import { focusRing } from './focus.ts'
import LineDrawing from './LineDrawing.tsx'
import type { LineDrawingName } from './LineDrawing.tsx'

type IllustratedHeaderProps = {
  /** El `h1`, que también va en las migas como la página actual. */
  title: string
  titleId: string
  /** El dibujo de línea a la derecha (`Vitrina.dc.html`: el toldo; `Rebanadas.dc.html`: la rebanada). */
  drawing: LineDrawingName
  /** El `h1` recibe el foco al reintentar una carga que falló, así el foco no se pierde con el botón. */
  headingRef?: RefObject<HTMLHeadingElement | null>
  /** La frase bajo el título. */
  children?: ReactNode
}

/**
 * Encabezado sobre `fresa` de la vitrina y las rebanadas: migas, `h1`, su frase y el dibujo de línea a la derecha al
 * 30%, detrás del contenido (libro de marca, "Dibujos de línea"); en móvil el dibujo no va. Cierra con las conchas.
 */
export default function IllustratedHeader({ title, titleId, drawing, headingRef, children }: IllustratedHeaderProps) {
  return (
    <>
      <section aria-labelledby={titleId} className="relative z-[2] bg-fresa">
        <div className="relative mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4">
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-6 z-[-1] flex items-center max-[600px]:hidden">
            <LineDrawing drawing={drawing} className="text-mermelada opacity-30" />
          </div>
          <div className="flex flex-col gap-4 pb-12 pr-36 pt-8 max-[600px]:pr-0">
            <Breadcrumb items={[{ label: 'Inicio', to: '/' }, { label: title }]} />
            <h1 id={titleId} ref={headingRef} tabIndex={-1} className={`self-start rounded-sm font-display text-display max-[600px]:text-titulo-1 ${focusRing}`}>
              {title}
            </h1>
            {children}
          </div>
        </div>
      </section>
      <Duya type="concha" color="fresa" />
    </>
  )
}
