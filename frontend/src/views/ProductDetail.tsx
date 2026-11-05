import PageHeader from '../components/PageHeader.tsx'
import Pending from '../components/Pending.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

/**
 * `/pasteles/:slug`. Vista vacía: por ahora solo muestra su título. El h1 del mockup es un dato que todavía no
 * existe, así que lleva el marcador de pendiente; la pestaña usa el nombre de la vista, sin corchetes.
 */
export default function ProductDetail() {
  usePageTitle('Ficha de producto')
  return <PageHeader title={<Pending what="Nombre del pastel" />} />
}
