import PageHeader from '../components/PageHeader.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

export default function Home() {
  usePageTitle()
  return <PageHeader title="Pastelería Ilusión" />
}
