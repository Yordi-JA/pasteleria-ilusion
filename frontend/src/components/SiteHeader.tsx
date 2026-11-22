import { Handbag, List, User, UserCheck } from '@phosphor-icons/react'
import { useRef } from 'react'
import type { Ref } from 'react'
import { Link, NavLink } from 'react-router'
import logo from '../../../assets/logos/ilusion-logo.svg'
import type { SessionState } from '../models/session.ts'
import type { useSiteMenu } from '../viewmodels/useSiteMenu.ts'
import type { StoreDetails } from '../viewmodels/useStoreInfo.ts'
import { focusRing } from './focus.ts'
import { MAIN_LINKS } from './navigation.ts'
import SiteMenu from './SiteMenu.tsx'

type SiteHeaderProps = {
  store: StoreDetails
  menu: ReturnType<typeof useSiteMenu>
  /** Si hay cuenta: el ícono lleva a "Mis pedidos" en lugar de `/entrar`, y el menú móvil ofrece salir. */
  session: SessionState
  onSignOut: () => void
  /** Piezas en el carrito (suma de cantidades). */
  cartCount: number
  /** Lo que dice el contador: va detrás de `cartCount` mientras una perla viaja al carrito. */
  shownCount: number
  /** El enlace del carrito, a donde llegan las perlas. */
  cartIconRef: Ref<HTMLAnchorElement>
  /**
   * En la portada, mientras se ve el logotipo grande, el logo de la barra no se ve (tanda 6): guarda su lugar, invisible y fuera del
   * orden del teclado (`visibility: hidden`), y aparece en 200 ms cuando el grande sale. En móvil se ve siempre.
   */
  logoHidden?: boolean
  /** Si el cambio del logo se anima: no en el primer cuadro de la portada, para que no se desvanezca al cargar. */
  logoAnimated?: boolean
  /**
   * En la portada, en escritorio y sin "reducir movimiento" (tanda 7, D90), `useHeaderMorph` lleva el logotipo grande a la barra y
   * recorre los enlaces. Con `morphing`, la barra lleva además la copia del logotipo que viaja (`travelingLogoRef`).
   */
  morphing?: boolean
  logoRef?: Ref<HTMLAnchorElement>
  navRef?: Ref<HTMLElement>
  travelingLogoRef?: Ref<HTMLImageElement>
  /** Cuántas perlas llegaron al carrito: cada llegada hace que el contador dé un salto corto (tanda 7). */
  cartLandings?: number
}

/** Nombre del enlace del carrito, como en el mockup: "Carrito, vacío" o "Carrito, 4 productos". */
function cartLabel(count: number): string {
  if (count === 0) return 'Carrito, vacío'
  return count === 1 ? 'Carrito, 1 producto' : `Carrito, ${count} productos`
}

const iconControl = `h-11 w-11 shrink-0 items-center justify-center rounded-md text-mermelada hover:bg-harina motion-safe:transition-colors ${focusRing}`

/**
 * El ancho de la barra flotante (correcciones del 21 de noviembre): sobresale 40 px a cada lado de la columna de 1200 px del
 * contenido, para que al hacer scroll sus orillas no coincidan con las de las tarjetas que pasan debajo. Nunca llega al borde
 * de la pantalla: deja 8 px a cada lado (en móvil sobresale 8 px de la columna, que ahí tiene 16 px de margen).
 */
const barColumn = 'mx-auto w-[min(1232px,calc(100%-16px))]'

/**
 * El relleno de la barra. Con la barra a su ancho completo, el logo empieza en la orilla de la columna del contenido y el
 * último ícono termina en la otra: 40 px menos el borde de 1 px, y del lado derecho, además, los 11 px que rodean al ícono en su
 * área de 44 px.
 */
const barPadding = 'py-2 pl-6 pr-3 min-[1248px]:pl-[39px] min-[1248px]:pr-[28px] max-[600px]:pl-4'

const navLink =
  'inline-flex min-h-11 items-center rounded-sm text-etiqueta text-mermelada underline-offset-[6px] hover:underline ' +
  `aria-[current=page]:underline aria-[current=page]:decoration-2 ${focusRing}`

/**
 * La barra de la compra (mockup de Entrega y Pago): el logo y "Volver al carrito", sin la navegación ni el menú, para
 * que la persona termine su pedido. Misma barra flotante y fija que la del sitio.
 */
/** La barra de la compra. `back` es a dónde regresa: por omisión, al carrito; aceptando una cotización, a ella (D70). */
export function CheckoutHeader({ back = { to: '/carrito', label: 'Volver al carrito' } }: { back?: { to: string; label: string } }) {
  return (
    <header className="sticky top-4 z-30 mt-5 max-[600px]:mt-3">
      <div className={barColumn}>
        <div data-testid="barra" className={`flex min-h-16 items-center justify-between gap-4 rounded-lg border border-relieve bg-betun ${barPadding}`}>
          <Link to="/" className={`block shrink-0 rounded-sm ${focusRing}`}>
            <img src={logo} alt="Pastelería Ilusión, inicio" width={150} height={66} className="h-auto w-[150px] max-[600px]:w-[120px]" />
          </Link>
          <Link to={back.to} className={`inline-flex min-h-11 items-center rounded-sm px-2 text-etiqueta text-mermelada underline underline-offset-4 ${focusRing}`}>
            {back.label}
          </Link>
        </div>
      </div>
    </header>
  )
}

/**
 * Barra flotante del encabezado (libro de marca, "Presencia de marca"): queda 20 px bajo el remate del
 * toldo (12 px en móvil) y se fija a 16 px del borde superior al hacer scroll. Los cuatro enlaces pasan
 * al menú por debajo de 768 px, porque entre 601 y 767 px ya no caben en una línea junto al logo y los íconos.
 */
export default function SiteHeader({
  store,
  menu,
  session,
  onSignOut,
  cartCount,
  shownCount,
  cartIconRef,
  logoHidden = false,
  logoAnimated = false,
  morphing = false,
  logoRef,
  navRef,
  travelingLogoRef,
  cartLandings = 0,
}: SiteHeaderProps) {
  const menuButton = useRef<HTMLButtonElement>(null)
  const signedIn = session.status === 'authenticated'

  return (
    <header className="sticky top-4 z-30 mt-5 max-[600px]:mt-3">
      <div className={barColumn}>
        <div
          data-testid="barra"
          className={`flex min-h-16 items-center gap-8 rounded-lg border border-relieve bg-betun ${barPadding} max-[960px]:gap-5 max-[600px]:gap-1`}
        >
          <Link
            ref={logoRef}
            to="/"
            data-testid="logo-barra"
            className={`block shrink-0 rounded-sm ${logoAnimated ? 'transition-[opacity,visibility] duration-200 ease-entrada motion-reduce:transition-none' : ''} ${focusRing} ${logoHidden ? 'invisible opacity-0 focus:visible focus:opacity-100 max-[600px]:visible max-[600px]:opacity-100' : ''}`}
          >
            <img src={logo} alt="Pastelería Ilusión, inicio" width={150} height={66} className="h-auto w-[150px] max-[600px]:w-[120px]" />
          </Link>
          <nav ref={navRef} aria-label="Principal" className="flex flex-1 flex-wrap gap-x-7 max-[960px]:gap-x-4 max-md:hidden">
            {MAIN_LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to} className={navLink}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex gap-2 max-[600px]:gap-0.5">
            {/* Con sesión, el ícono cambia (no solo el color) y el nombre dice a dónde lleva. */}
            <Link to={signedIn ? '/cuenta' : '/entrar'} aria-label={signedIn ? 'Mi cuenta' : 'Cuenta'} className={`inline-flex ${iconControl}`}>
              {signedIn ? <UserCheck size={22} weight="regular" aria-hidden="true" /> : <User size={22} weight="regular" aria-hidden="true" />}
            </Link>
            <Link ref={cartIconRef} to="/carrito" aria-label={cartLabel(cartCount)} className={`relative inline-flex ${iconControl}`}>
              <Handbag size={22} weight="regular" aria-hidden="true" />
              {/* Contador del mockup (Carrito): el número exacto va en el nombre del enlace; aquí, 99+ para que quepa. */}
              {/* Con cada perla que llega, el contador se vuelve a montar (`key`) y da un salto de 300 ms; nunca con "reducir movimiento". */}
              {shownCount > 0 && (
                <span
                  key={cartLandings}
                  aria-hidden="true"
                  data-testid="contador-carrito"
                  className={`absolute right-0 top-0.5 h-5 min-w-5 rounded-full bg-mermelada px-[5px] text-center text-[12px] font-bold leading-5 tabular-nums text-sobre-color ${cartLandings > 0 ? 'motion-safe:animate-header-contador' : ''}`}
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
      {morphing && (
        // La copia del logotipo grande que viaja a la barra (D90): decorativa, sin foco ni clics; el `h1` y el enlace de la barra
        // son los de verdad. Va por encima de la barra, dentro del encabezado; `useHeaderMorph` la muestra solo mientras viaja.
        <img
          ref={travelingLogoRef}
          src={logo}
          alt=""
          aria-hidden="true"
          data-testid="logo-viaje"
          width={565}
          height={247}
          className="pointer-events-none invisible fixed left-0 top-0 z-10 h-auto max-w-none origin-top-left select-none will-change-transform max-[600px]:hidden"
        />
      )}
      <SiteMenu
        store={store}
        signedIn={signedIn}
        onSignOut={onSignOut}
        isOpen={menu.isOpen}
        closedBy={menu.closedBy}
        onClose={menu.close}
        returnFocusTo={menuButton}
      />
    </header>
  )
}
