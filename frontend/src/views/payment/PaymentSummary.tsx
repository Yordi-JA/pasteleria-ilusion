import symbol from '../../../../assets/logos/ilusion-simbolo.svg'
import Card from '../../components/Card.tsx'
import type { OrderSummaryView } from '../../viewmodels/paymentView.ts'

type PaymentSummaryProps = {
  summary: OrderSummaryView
  /** `payment`: "Resumen de tu pedido" con la entrega y "Pagas hoy" (mockup de Pago). `reserved`: el del apartado. */
  variant?: 'payment' | 'reserved'
  className?: string
}

/**
 * El resumen del pedido con el desglose de la API (libro de marca, "Pago y entrega"): las líneas, la entrega, el total
 * sin la base, el anticipo con el porcentaje del servidor, el depósito, "Pagas hoy" y el resto. El envío solo aparece
 * si cuesta algo (la entrega a domicilio no existe, D66). Los montos se muestran, nunca se calculan aquí.
 */
export default function PaymentSummary({ summary, variant = 'payment', className = '' }: PaymentSummaryProps) {
  const reserved = variant === 'reserved'
  const headingId = reserved ? 'apartado-resumen' : 'pago-resumen'
  const total = (
    <tr className="text-titulo-3">
      <th scope="row" className="py-1 text-left font-display font-semibold">
        Total del pedido
      </th>
      <td className="whitespace-nowrap py-1 pl-4 text-right font-display font-semibold tabular-nums">{summary.total}</td>
    </tr>
  )
  return (
    <section aria-labelledby={headingId} className={`flex flex-col gap-4 ${className}`}>
      <h2 id={headingId} className="font-display text-titulo-2">
        {reserved ? 'Resumen' : 'Resumen de tu pedido'}
      </h2>
      <Card large className="flex flex-col gap-4">
        <ul className="flex flex-col border-t border-relieve">
          {summary.items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 border-b border-relieve py-3">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-harina text-nota text-mermelada-suave">
                Foto
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-cuerpo font-semibold">{item.name}</span>
                <span className="text-nota text-mermelada-suave">{item.brief}</span>
              </span>
              <span className="text-cuerpo font-semibold tabular-nums">{item.total}</span>
            </li>
          ))}
        </ul>
        {!reserved && (
          <p className="flex flex-col border-b border-relieve pb-4">
            <span className="text-cuerpo font-semibold">Entrega</span>
            <span className="text-nota text-mermelada-suave">{summary.delivery}</span>
          </p>
        )}
        {!reserved && summary.hasDeposit && <DepositNote title="Incluye depósito por base" />}
        <table className="w-full border-collapse text-cuerpo">
          <tbody>
            {!reserved && total}
            {summary.rows.map((row) => (
              <tr key={row.label} className={row.strong ? 'border-t border-relieve' : undefined}>
                <th scope="row" className={`py-1 text-left font-normal ${row.strong ? 'pt-3 font-semibold' : 'text-mermelada-suave'}`}>
                  {row.label}
                </th>
                <td className={`py-1 pl-4 text-right font-semibold tabular-nums ${row.strong ? 'pt-3' : ''}`}>{row.amount}</td>
              </tr>
            ))}
          </tbody>
          {reserved && <tfoot className="border-t border-relieve">{total}</tfoot>}
        </table>
        {reserved && summary.hasDeposit && <DepositNote title="Depósito por base retenido" />}
      </Card>
    </section>
  )
}

/** La estampa del símbolo junto al depósito de la base (libro de marca, "Presencia de marca": una por pantalla). */
function DepositNote({ title }: { title: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md bg-harina px-4 py-3.5 text-nota">
      <img src={symbol} alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
      <p>
        <strong className="block font-semibold">{title}</strong>
        Te lo devolvemos al regresar la base con tu nota.
      </p>
    </div>
  )
}
