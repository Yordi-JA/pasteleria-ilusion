import { Check } from '@phosphor-icons/react'
import { Fragment } from 'react'

const STEPS = ['Carrito', 'Entrega', 'Pago', 'Confirmación'] as const

export type CheckoutStep = (typeof STEPS)[number]

/**
 * Los pasos de la compra sobre el campo `fresa` (mockup de Carrito, Entrega y Pago): círculos con número, el actual con
 * borde grueso y el nombre en negritas, los ya hechos llenos en `mermelada` con palomita. En móvil (hasta 600 px) solo
 * el actual dice su nombre; el lector de pantalla oye siempre el nombre y el estado de cada paso.
 */
export default function CheckoutSteps({ current }: { current: CheckoutStep }) {
  const currentIndex = STEPS.indexOf(current)
  return (
    <nav aria-label="Pasos de tu compra">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {STEPS.map((step, index) => {
          const done = index < currentIndex
          const now = index === currentIndex
          return (
            <Fragment key={step}>
              {index > 0 && (
                <li aria-hidden="true" className={`h-0.5 w-6 rounded-full ${done || now ? 'bg-mermelada' : 'bg-mermelada-suave'}`} />
              )}
              <li aria-current={now ? 'step' : undefined} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-nota font-semibold ${
                    done
                      ? 'bg-mermelada text-sobre-color'
                      : now
                        ? 'border-2 border-mermelada bg-betun text-mermelada'
                        : 'border-[1.5px] border-mermelada-suave text-mermelada-suave'
                  }`}
                >
                  {done ? <Check size={14} weight="bold" /> : index + 1}
                </span>
                <span
                  className={`text-nota ${now ? 'font-semibold text-mermelada' : done ? 'font-semibold text-mermelada max-[600px]:sr-only' : 'text-mermelada-suave max-[600px]:sr-only'}`}
                >
                  {step}
                  <span className="sr-only">{done ? ', hecho' : now ? ', paso actual' : ', pendiente'}</span>
                </span>
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
