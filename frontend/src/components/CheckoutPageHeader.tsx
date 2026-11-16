import type { ReactNode } from 'react'
import CheckoutSteps from './CheckoutSteps.tsx'
import type { CheckoutStep } from './CheckoutSteps.tsx'
import Duya from './Duya.tsx'
import LineDrawing from './LineDrawing.tsx'
import type { LineDrawingName } from './LineDrawing.tsx'

type CheckoutPageHeaderProps = {
  title: string
  /** El paso de la compra; sin él no hay pasos (el carrito vacío del mockup). */
  step?: CheckoutStep
  /**
   * El dibujo de línea (libro de marca, "Dibujos de línea"): `true` es la rebanada del carrito; el apartado lleva el
   * toldo de la fachada. La entrega y el pago no llevan dibujo.
   */
  drawing?: boolean | LineDrawingName
  children?: ReactNode
}

/**
 * Encabezado de la compra sobre `fresa` (mockup de Carrito y Entrega): los pasos, el `h1` y su frase, con la guirnalda de
 * duya donde empieza el contenido. El dibujo va al 30%, detrás del contenido y fuera en móvil.
 */
export default function CheckoutPageHeader({ title, step, drawing = false, children }: CheckoutPageHeaderProps) {
  return (
    <>
      <div className="relative z-[2] bg-fresa">
        <div className="relative mx-auto max-w-[1200px] px-6 max-[600px]:px-4">
          {drawing && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-6 z-[-1] flex items-center max-[600px]:hidden">
              <LineDrawing drawing={drawing === true ? 'rebanada' : drawing} className="text-mermelada opacity-30" />
            </div>
          )}
          <div className={`flex flex-col gap-4 pb-12 pt-8 ${drawing ? 'pr-36 max-[600px]:pr-0' : ''}`}>
            {step && <CheckoutSteps current={step} />}
            <h1 className="font-display text-display max-[600px]:text-titulo-1">{title}</h1>
            {children}
          </div>
        </div>
      </div>
      <Duya color="fresa" />
    </>
  )
}
