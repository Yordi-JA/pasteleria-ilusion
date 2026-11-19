import { WarningCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

/**
 * El mensaje de error de un campo: ícono en `error` y el texto en `mermelada`, que dice qué pasó y cómo seguir. El
 * campo ya marca la falla con su borde; el mensaje no repite el rojo, así una forma con varios errores no grita.
 */
export default function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-nota font-medium text-mermelada">
      <WarningCircle size={16} weight="regular" aria-hidden="true" className="mt-0.5 shrink-0 text-error" />
      <span>{children}</span>
    </p>
  )
}
