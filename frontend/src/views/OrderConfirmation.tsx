import ButtonLink from '../components/ButtonLink.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { useOrderConfirmation } from '../viewmodels/useOrderConfirmation.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Recibimos tu pedido'

/**
 * `/pedido/confirmacion`. El pago lleva aquí con `?pedido=<id>` cuando el servidor dice `received` (D68). La
 * confirmación completa (la línea de tiempo, el resumen y la nota en PDF) es de la tanda 3: por ahora, el número de
 * pedido y las salidas.
 */
export default function OrderConfirmation() {
  usePageTitle(TITLE)
  const { orderId } = useOrderConfirmation()
  return (
    <>
      <PageHeader title={TITLE} />
      {orderId !== null && (
        <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-4 px-6 py-12 max-[600px]:px-4">
          <h2 className="font-display text-titulo-2">Pedido #{orderId}</h2>
          <p className="text-cuerpo text-mermelada-suave">Sigue tu pedido en Mis pedidos.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/cuenta">Ver mis pedidos</ButtonLink>
            <ButtonLink to="/" variant="secondary">
              Ir a inicio
            </ButtonLink>
          </div>
        </div>
      )}
    </>
  )
}
