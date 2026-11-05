import { Link } from 'react-router'
import PageHeader from '../components/PageHeader.tsx'
import { focusRing } from '../components/focus.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'No encontramos esta página'

export default function NotFound() {
  usePageTitle(TITLE)
  return (
    <PageHeader title={TITLE}>
      <Link to="/" className={`inline-flex min-h-11 items-center self-start rounded-sm font-semibold underline underline-offset-4 ${focusRing}`}>
        Ir a inicio
      </Link>
    </PageHeader>
  )
}
