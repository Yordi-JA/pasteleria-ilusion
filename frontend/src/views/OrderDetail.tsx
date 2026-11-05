import PageHeader from '../components/PageHeader.tsx'
import Pending from '../components/Pending.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

/**
 * `/cuenta/pedidos/:id`. Vista vacía: por ahora solo muestra su título. El h1 del mockup es un dato que todavía no
 * existe, así que lleva el marcador de pendiente; la pestaña usa el nombre de la vista, sin corchetes.
 */
export default function OrderDetail() {
  usePageTitle('Detalle de pedido')
  return <PageHeader title={<>Pedido #<Pending what="número" /></>} />
}
