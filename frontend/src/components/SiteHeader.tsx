import { Handbag, List, User } from '@phosphor-icons/react'
import { useRef } from 'react'
import type { Ref } from 'react'
import { Link, NavLink } from 'react-router'
import logo from '../../../assets/logos/ilusion-logo.svg'
import type { useSiteMenu } from '../viewmodels/useSiteMenu.ts'
import type { StoreDetails } from '../viewmodels/useStoreInfo.ts'
import { focusRing } from './focus.ts'
import { MAIN_LINKS } from './navigation.ts'
import SiteMenu from './SiteMenu.tsx'

type SiteHeaderProps = {
  store: StoreDetails
  menu: ReturnType<typeof useSiteMenu>
  /** Piezas en el carrito (suma de cantidades). */
  cartCount: number
  /** Lo que dice el contador: va detrás de `cartCount` mientras una perla viaja al carrito. */
  shownCount: number
  /** El enlace del carrito, a donde llegan las perlas y el que rebota. */
  cartIconRef: Ref<HTMLAnchorElement>
}

/** Nombre del enlace del carrito, como en el mockup: "Carrito, vacío" o "Carrito, 4 productos". */
function cartLabel(count: number): string {
  if (count === 0) return 'Carrito, vacío'
  return count === 1 ? 'Carrito, 1 producto' : `Carrito, ${count} productos`
}

const iconControl = `h-11 w-11 shrink-0 items-center justify-center rounded-md text-mermelada hover:bg-harina motion-safe:transition-colors ${focusRing}`

const navLink =
  'inline-flex min-h-11 items-center rounded-sm text-etiqueta text-mermelada underline-offset-[6px] hover:underline ' +
  `aria-[current=page]:underline aria-[current=page]:decoration-2 ${focusRing}`

/**
 * Barra flotante del encabezado (libro de marca, "Presencia de marca"): queda 20 px bajo el remate del
 * toldo (12 px en móvil) y se fija a 16 px del borde superior al hacer scroll. Los cuatro enlaces pasan
 * al menú por debajo de 768 px, porque entre 601 y 767 px ya no caben en una línea junto al logo y los íconos.
 */
export default function SiteHeader({ store, menu, cartCount, shownCount, cartIconRef }: SiteHeaderProps) {
  const menuButton = useRef<HTMLButtonElement>(null)

  return (
    <header className="sticky top-4 z-30 mt-5 max-[600px]:mt-3">
      <div className="mx-auto max-w-[1200px] px-6 max-[600px]:px-4">
        <div
          data-testid="barra"
          className="flex min-h-16 items-center gap-8 rounded-lg border border-relieve bg-betun py-2 pl-6 pr-3 max-[960px]:gap-5 max-[600px]:gap-1 max-[600px]:pl-4"
        >
          <Link to="/" className={`block shrink-0 rounded-sm ${focusRing}`}>
            <img src={logo} alt="Pastelería Ilusión, inicio" width={150} height={66} className="h-auto w-[150px] max-[600px]:w-[120px]" />
          </Link>
          <nav aria-label="Principal" className="flex flex-1 flex-wrap gap-x-7 max-[960px]:gap-x-4 max-md:hidden">
            {MAIN_LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to} className={navLink}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex gap-2 max-[600px]:gap-0.5">
            <Link to="/entrar" aria-label="Cuenta" className={`inline-flex ${iconControl}`}>
              <User size={22} weight="regular" aria-hidden="true" />
            </Link>
            <Link ref={cartIconRef} to="/carrito" aria-label={cartLabel(cartCount)} className={`relative inline-flex ${iconControl}`}>
              <Handbag size={22} weight="regular" aria-hidden="true" />
              {/* Contador del mockup (Carrito): el número exacto va en el nombre del enlace; aquí, 99+ para que quepa. */}
              {shownCount > 0 && (
                <span
                  aria-hidden="true"
                  data-testid="contador-carrito"
                  className="absolute right-0 top-0.5 h-5 min-w-5 rounded-full bg-mermelada px-[5px] text-center text-[12px] font-bold leading-5 tabular-nums text-sobre-color"
                >
                  {shownCount > 99 ? '99+' : shownCount}
                </span>
              )}
            </Link>
            <button
              ref={menuButton}
              type="button"
              aria-label="Abrir menú"
              aria-expanded={menu.isOpen}
              aria-controls="menu-sitio"
              onClick={menu.open}
              className={`hidden cursor-pointer max-md:inline-flex ${iconControl}`}
            >
              <List size={22} weight="regular" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <SiteMenu store={store} isOpen={menu.isOpen} closedBy={menu.closedBy} onClose={menu.close} returnFocusTo={menuButton} />
    </header>
  )
}
