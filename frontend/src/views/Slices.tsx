import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Rebanadas de hoy'

/** `/rebanadas`. Vista vacía: por ahora solo muestra su título. */
export default function Slices() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
