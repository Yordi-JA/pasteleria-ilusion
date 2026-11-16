import symbol from '../../../../assets/logos/ilusion-simbolo.svg'
import Card from '../../components/Card.tsx'
import type { PaidSummaryView } from '../../viewmodels/orderView.ts'

type PaidSummaryProps = {
  summary: PaidSummaryView
  /** "Resumen" en la confirmación, "Productos" en el detalle. */
  title: string
  headingId: string
  /** La confirmación lleva el aviso del depósito al pie (mockup `Confirmacion`); el detalle tiene su sección de la base. */
  depositNote?: boolean
}

/**
 * Las partidas y el desglose de un pedido ya hecho (libro de marca, "Pago y entrega"): "Total del pedido" (sin la base),
 * el anticipo, el depósito, el envío si cuesta algo y el resto. Los montos vienen del servidor.
 */
export default function PaidSummary({ summary, title, headingId, depositNote = false }: PaidSummaryProps) {
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4">
      <h2 id={headingId} className="font-display text-titulo-2">
        {title}
      </h2>
      <Card large className="flex flex-col gap-4 max-[600px]:p-4">
        <ul className="flex flex-col">
          {summary.items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 border-b border-relieve py-3 first:pt-0">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-harina text-nota text-mermelada-suave">
                Foto
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-cuerpo font-semibold">{item.name}</span>
                <span className="text-nota text-mermelada-suave">{item.brief}</span>
                {item.detail && <span className="text-nota text-mermelada-suave">{item.detail}</span>}
              </span>
              <span className="text-cuerpo font-semibold tabular-nums">{item.total}</span>
            </li>
          ))}
        </ul>
        <table className="w-full border-collapse text-cuerpo">
          <tbody>
            <tr className="text-titulo-3">
              <th scope="row" className="py-1 text-left font-display font-semibold">
                Total del pedido
              </th>
              <td className="whitespace-nowrap py-1 pl-4 text-right font-display font-semibold tabular-nums">{summary.total}</td>
            </tr>
            {summary.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="py-1 text-left font-normal text-mermelada-suave">
                  {row.label}
                </th>
                <td className="py-1 pl-4 text-right font-semibold tabular-nums">{row.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {depositNote && summary.depositNote && (
          <div className="flex items-start gap-3 rounded-md bg-harina px-4 py-3.5 text-nota">
            <img src={symbol} alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
            <p>
              <strong className="block font-semibold">Depósito por base retenido</strong>
              {summary.depositNote}
            </p>
          </div>
        )}
      </Card>
    </section>
  )
}
