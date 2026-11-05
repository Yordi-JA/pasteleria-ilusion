import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Diseña tu pastel'

/** `/pedido/disena`. Vista vacía: por ahora solo muestra su título. */
export default function CakeDesigner() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
