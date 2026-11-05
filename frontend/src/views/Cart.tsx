import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Tu carrito'

/** `/carrito`. Vista vacía: por ahora solo muestra su título. */
export default function Cart() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
