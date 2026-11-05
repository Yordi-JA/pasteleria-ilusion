import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Vitrina'

/** `/vitrina`. Vista vacía: por ahora solo muestra su título. */
export default function Showcase() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
