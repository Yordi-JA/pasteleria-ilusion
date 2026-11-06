type ProgressPearlsProps = {
  /** Etiqueta de cada paso, en orden. Hay una perla por paso (el libro de marca usa cuatro). */
  steps: string[]
  /** Paso actual, contado desde 1. Un valor fuera de rango se ajusta al primero o al último paso. */
  current: number
  className?: string
}

/**
 * Perlas de avance (libro de marca, "Color"): una perla por paso, llena en `mermelada` hasta el paso
 * actual y un anillo hueco de 1.5 px con borde `mermelada-suave` después (D43), con el estado escrito
 * al lado. Las perlas son decorativas; el lector de pantalla oye "Paso n de m: estado". No hay pastilla de color ni animación.
 *
 * El componente no sabe qué pedido es ni cómo se llaman sus estados: quien lo usa elige `steps`.
 * `current` se ajusta (clamp) en vez de fallar, para que un dato inesperado nunca rompa la pantalla.
 */
export default function ProgressPearls({ steps, current, className = '' }: ProgressPearlsProps) {
  if (steps.length === 0) return null
  const step = Math.min(Math.max(Math.floor(current) || 1, 1), steps.length)

  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap text-etiqueta text-mermelada ${className}`}>
      <span aria-hidden="true" className="inline-flex gap-[3px]">
        {steps.map((_, index) => (
          <span
            key={index}
            className={`h-2 w-2 rounded-full ${index < step ? 'bg-mermelada' : 'border-[1.5px] border-mermelada-suave'}`}
          />
        ))}
      </span>
      <span className="sr-only">
        Paso {step} de {steps.length}:{' '}
      </span>
      {steps[step - 1]}
    </span>
  )
}
