import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Verificación de nota'

/** `/nota/:token`. Vista vacía: por ahora solo muestra su título. */
export default function NoteVerification() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
