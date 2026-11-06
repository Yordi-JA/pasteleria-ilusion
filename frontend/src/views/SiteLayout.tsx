import { useRef } from 'react'
import { Outlet } from 'react-router'
import Duya from '../components/Duya.tsx'
import SiteFooter from '../components/SiteFooter.tsx'
import SiteHeader from '../components/SiteHeader.tsx'
import TopStrip from '../components/TopStrip.tsx'
import { CartContext, useCartState } from '../viewmodels/useCart.ts'
import { useRouteFocus } from '../viewmodels/useRouteFocus.ts'
import { useSiteMenu } from '../viewmodels/useSiteMenu.ts'
import { useStoreInfo } from '../viewmodels/useStoreInfo.ts'

/**
 * Marco común de todas las rutas: franja, toldo, barra flotante, contenido, guirnalda y pie.
 * Pide los datos de la pastelería una sola vez y los pasa a la franja, el menú y el pie. Guarda el carrito y lo
 * comparte con las pantallas por `CartContext`; al encabezado le pasa solo el contador (D46).
 */
export default function SiteLayout() {
  const store = useStoreInfo()
  const menu = useSiteMenu()
  const cart = useCartState()
  const main = useRef<HTMLElement>(null)
  useRouteFocus(main)

  return (
    <CartContext value={cart}>
      {/* El fondo fresa es el campo detrás de la barra flotante, entre el toldo y la primera sección. */}
      <div className="flex min-h-screen flex-col bg-fresa font-sans text-cuerpo text-mermelada">
        <a
          href="#contenido"
          className={
            'fixed left-4 top-4 z-50 -translate-y-[200%] rounded-md bg-mermelada px-[18px] py-3 text-etiqueta text-sobre-color ' +
            'shadow-[0_0_0_3px_theme(colors.fresa)] outline-none focus:translate-y-0 motion-safe:transition-transform'
          }
        >
          Saltar al contenido
        </a>
        <TopStrip store={store} />
        <div data-testid="toldo" className="toldo" aria-hidden="true" />
        <SiteHeader store={store} menu={menu} cartCount={cart.count} />
        <main id="contenido" ref={main} tabIndex={-1} className="flex-1 scroll-mt-24 bg-nata outline-none">
          <Outlet />
        </main>
        <Duya type="guirnalda" color="nata" below="mermelada" />
        <SiteFooter store={store} />
      </div>
    </CartContext>
  )
}
