import { useRef } from 'react'
import Button from '../../components/Button.tsx'
import { useBarClearance } from '../../viewmodels/useBarClearance.ts'

type DeliveryBarProps = {
  /** La línea chica de la izquierda: "Recoges el lunes 16 nov.", "Total estimado". */
  label: string
  /** La línea en negritas: la hora elegida o el total. */
  value: string
  /** El botón principal de la parte: "Continuar", "Continuar al pago" o "Enviar pedido". */
  action: string
  /** El `id` del formulario que manda el botón: la barra va fuera de él, al final del contenido. */
  form: string
  busy?: boolean
}

/**
 * La barra de abajo de la entrega en móvil (hasta 900 px, tanda 3), con el patrón de la de "Diseña tu pastel": lo elegido o el
 * total a la izquierda y el botón principal a la derecha. Es `sticky` dentro del contenido, no `fixed`: al abrir el teclado
 * del teléfono no tapa los campos, y al final de la página se queda en su lugar. En escritorio no se muestra y el botón va en
 * el formulario.
 */
export default function DeliveryBar({ label, value, action, form, busy = false }: DeliveryBarProps) {
  const bar = useRef<HTMLDivElement>(null)
  useBarClearance(bar)
  return (
    <div ref={bar} data-testid="barra-entrega" className="sticky bottom-0 z-20 hidden border-t border-relieve bg-betun max-[900px]:block">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 max-[600px]:px-4">
        <div className="flex min-w-0 flex-col">
          <p className="text-nota text-mermelada-suave">{label}</p>
          <p className="text-cuerpo font-semibold tabular-nums">{value}</p>
        </div>
        <Button type="submit" form={form} disabled={busy} aria-busy={busy || undefined} className="shrink-0">
          {action}
        </Button>
      </div>
    </div>
  )
}
