import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Recibimos tu solicitud'

/** `/pedido/referencia/enviada`. Vista vacía: por ahora solo muestra su título. */
export default function ReferenceSent() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
