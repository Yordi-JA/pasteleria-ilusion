import Card from './Card.tsx'
import { compactGrid, featureGrid } from './ProductCard.tsx'
import Skeleton from './Skeleton.tsx'

/**
 * Esqueleto de una cuadrícula de `ProductCard` (CatalogoCargando): las mismas tarjetas con la foto, dos líneas de
 * texto, el precio y el botón. Va dentro de un `LoadingRegion`, que dice qué se carga.
 */
export default function ProductGridSkeleton({ count = 6, variant = 'feature' }: { count?: number; variant?: 'feature' | 'compact' }) {
  const compact = variant === 'compact'
  return (
    <div className={compact ? compactGrid : featureGrid}>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} large={!compact} className={`flex flex-col gap-3 ${compact ? '!p-4' : ''}`}>
          <Skeleton radius="md" className={compact ? 'aspect-[200/130] w-full' : 'aspect-[360/220] w-full'} />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton radius="md" className="mt-1 h-11 w-full" />
        </Card>
      ))}
    </div>
  )
}
