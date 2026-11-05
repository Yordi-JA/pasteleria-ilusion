import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Inicia sesión'

/** `/entrar`. Vista vacía: por ahora solo muestra su título. */
export default function Login() {
  usePageTitle(TITLE)
  return <PageHeader title={TITLE} />
}
