import { Link } from 'react-router'
import { focusRing } from './focus.ts'

/** Un paso de las migas de pan: con `to` es un enlace; sin él, la página actual. */
export type Crumb = { label: string; to?: string }

const crumbLink = `inline-flex min-h-11 items-center rounded-sm underline underline-offset-4 ${focusRing}`

/**
 * Migas de pan del encabezado (`nav` "Ruta", como el mockup): enlaces subrayados de 44 px de alto y la página actual
 * con `aria-current`. La barra que separa los pasos es decorativa.
 */
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Ruta">
      <ol className="flex flex-wrap items-center gap-x-1.5 text-nota">
        {items.flatMap((item, index) => [
          ...(index > 0 ? [<li key={`separador-${index}`} aria-hidden="true">/</li>] : []),
          <li key={`${index}-${item.label}`}>
            {item.to ? (
              <Link to={item.to} className={crumbLink}>
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>,
        ])}
      </ol>
    </nav>
  )
}
