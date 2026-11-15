import Button from '../../components/Button.tsx'
import ButtonLink from '../../components/ButtonLink.tsx'
import Card from '../../components/Card.tsx'
import Notice from '../../components/Notice.tsx'
import type { CartConflict, CartSummaryView } from '../../viewmodels/cartLines.ts'
import { productsLabel } from '../../viewmodels/cartLines.ts'

const CONFLICTS: Record<CartConflict, { title: string; detail: string }> = {
  showcase_and_design: {
    title: 'La vitrina de hoy y tu pastel diseñado van en pedidos separados',
    detail:
      'Lo de la vitrina se recoge hoy y un pastel de Diseña tu pastel se encarga con días de anticipación. Quita uno de los dos para continuar; el otro lo pides después.',
  },
  two_quotes: {
    title: 'Un pedido lleva una sola decoración por cotizar',
    detail: 'La pastelería cotiza una imagen a la vez. Quita uno de los pasteles con "Otra decoración" para continuar; el otro lo pides después.',
  },
}

const CONFLICT_ID = 'carrito-conflicto'

type CartSummaryProps = {
  summary: CartSummaryView
  paymentNote: string
  canContinue: boolean
}

/**
 * El resumen del carrito (mockup de Carrito): piezas, entrega, "Total estimado del pedido", el depósito de la base aparte
 * y lo que se paga hoy en una frase. Los montos son estimados: el servidor los vuelve a calcular al crear el pedido.
 * Con un carrito que no cabe en un pedido, el aviso dice por qué y "Continuar a entrega" queda desactivado.
 */
export default function CartSummary({ summary, paymentNote, canContinue }: CartSummaryProps) {
  const conflict = summary.conflict ? CONFLICTS[summary.conflict] : null
  return (
    <Card large className="flex flex-col gap-4">
      <dl className="flex flex-col gap-2 border-b border-relieve pb-4 text-cuerpo">
        <div className="flex justify-between gap-4">
          <dt className="text-mermelada-suave">{productsLabel(summary.count)}</dt>
          <dd className="font-semibold tabular-nums">{summary.total ?? 'Por confirmar'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-mermelada-suave">Entrega</dt>
          <dd className="text-right font-semibold">Se elige en el siguiente paso</dd>
        </div>
      </dl>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-titulo-3">
        <span>Total estimado del pedido</span>
        <span className="tabular-nums">{summary.total ? `${summary.total} MXN` : 'Por confirmar'}</span>
      </p>
      <div className="flex flex-col gap-2 rounded-md bg-harina px-4 py-3.5 text-nota">
        {summary.deposit && (
          <p className="flex justify-between gap-4 text-cuerpo">
            <span>Depósito de la base, se devuelve</span>
            <span className="font-semibold tabular-nums">{summary.deposit}</span>
          </p>
        )}
        <p className="text-mermelada-suave">{paymentNote}</p>
        {summary.requiresQuote && (
          <p className="text-mermelada-suave">La decoración por cotizar no está en el total: la pastelería te dice su precio y hasta entonces no pagas nada.</p>
        )}
      </div>
      {conflict && (
        <div id={CONFLICT_ID}>
          <Notice tone="attention" title={conflict.title} live={false}>
            {conflict.detail}
          </Notice>
        </div>
      )}
      {canContinue ? (
        <ButtonLink to="/pedido/entrega" className="w-full">
          Continuar a entrega
        </ButtonLink>
      ) : (
        <Button disabled className="w-full" aria-describedby={conflict ? CONFLICT_ID : undefined}>
          Continuar a entrega
        </Button>
      )}
    </Card>
  )
}
