import { CircleNotch } from '@phosphor-icons/react'
import type { ReactNode, Ref } from 'react'
import Button from '../../components/Button.tsx'
import Skeleton from '../../components/Skeleton.tsx'

const REASON_ID = 'tarjeta-motivo'

type CardShellProps = {
  /** "$2,287.50", para "Pagar $2,287.50 con tarjeta". */
  amount: string
  /** Los campos de Stripe, o nada mientras cargan o si la tarjeta no se ofrece. */
  children?: ReactNode
  /** Por qué no se puede pagar con tarjeta ahora; el botón queda desactivado. */
  reason?: string | null
  /** Mientras Stripe.js llega: esqueleto con la forma de los campos. */
  loading?: boolean
  disabled?: boolean
  /** Stripe confirma o el servidor todavía no responde: "Procesando pago…". */
  processing?: boolean
  /** Ya se confirmó con el banco y se espera al servidor: la nota del mockup bajo el botón. */
  waiting?: boolean
  waitingRef?: Ref<HTMLParagraphElement>
  onPay?: () => void
}

/**
 * La tarjeta de crédito o débito (mockup de Pago): el título con "Procesado por Stripe", los campos y "Pagar $X con
 * tarjeta". Vive en el chunk principal para que la tarjeta se vea igual mientras Stripe.js carga, si no está disponible o
 * si no cargó; los campos de verdad llegan con el chunk diferido (`CardPayment`).
 */
export default function CardShell({ amount, children, reason = null, loading = false, disabled = false, processing = false, waiting = false, waitingRef, onPay }: CardShellProps) {
  const unavailable = reason !== null || loading
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="text-cuerpo font-semibold">Tarjeta de crédito o débito</h3>
        {/* El logo oficial de Stripe está pendiente: va el nombre (docs/pendientes.md, "Pagos (D68)"). */}
        <p className="text-nota text-mermelada-suave">
          Procesado por <span className="font-semibold text-mermelada">Stripe</span>
        </p>
      </div>
      {loading && (
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {reason && (
        <p id={REASON_ID} className="text-nota text-mermelada-suave">
          {reason}
        </p>
      )}
      {children}
      <Button
        type="button"
        className="w-full gap-2"
        disabled={disabled || unavailable || processing}
        aria-describedby={reason ? REASON_ID : undefined}
        onClick={onPay}
      >
        {processing ? (
          <>
            <CircleNotch size={20} aria-hidden="true" className="motion-safe:animate-spin" />
            Procesando pago…
          </>
        ) : (
          `Pagar ${amount} con tarjeta`
        )}
      </Button>
      {waiting && (
        <p ref={waitingRef} tabIndex={-1} className="rounded-sm text-nota outline-none">
          No cierres esta ventana. En cuanto el banco responda te mostramos la confirmación.
        </p>
      )}
    </div>
  )
}
