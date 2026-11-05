import { Link } from 'react-router'
import symbol from '../../../assets/logos/ilusion-simbolo.svg'
import type { StoreDetails } from '../viewmodels/useStoreInfo.ts'
import { focusRingOnColor } from './focus.ts'
import { FOOTER_LINKS } from './navigation.ts'
import Pending from './Pending.tsx'
import { StoreLoadingLabel, StoreSkeleton, WhatsAppNumber, WhatsAppWritePending } from './StoreText.tsx'

type SiteFooterProps = { store: StoreDetails }

const heading = 'mb-1 text-etiqueta text-sobre-color'
// Todo enlace del pie mide al menos 44 px de alto (libro de marca, "Accesibilidad").
const link = `inline-flex min-h-11 items-center self-start rounded-sm ${focusRingOnColor}`

/** Pie sobre campo `mermelada`, con el símbolo como estampa. La guirnalda que lo antecede la pone el layout. */
export default function SiteFooter({ store }: SiteFooterProps) {
  const loading = store.status === 'loading'
  return (
    <footer className="bg-mermelada pb-8 pt-[72px] text-cuerpo text-sobre-color">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-6 max-[600px]:px-4">
        <div className="flex flex-wrap items-center gap-6">
          <img src={symbol} alt="" width={96} height={96} className="h-24 w-24 shrink-0" />
          <p className="flex-[1_1_320px] font-display text-titulo-1 max-[600px]:text-titulo-2">
            Pide un deseo. Del pastel nos encargamos.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-8 border-t border-mermelada-suave pt-8 max-[600px]:grid-cols-1">
          <div aria-busy={loading || undefined} className="flex flex-col gap-2">
            <h2 className={heading}>Visítanos</h2>
            {loading && <StoreLoadingLabel />}
            <p className="text-sobre-color-suave">
              {loading ? <StoreSkeleton width="w-56" on="mermelada" /> : (store.address ?? <Pending what="Dirección" />)}
            </p>
            <p className="text-sobre-color-suave">
              {loading ? (
                <StoreSkeleton width="w-52" on="mermelada" />
              ) : store.hours ? (
                `Todos los días, de ${store.hours.opensAt} a ${store.hours.closesAt}`
              ) : (
                <Pending what="Horario" />
              )}
            </p>
          </div>

          <div aria-busy={loading || undefined} className="flex flex-col gap-2">
            <h2 className={heading}>Pedidos</h2>
            {loading && <StoreLoadingLabel />}
            {loading ? (
              <p className="text-sobre-color-suave">
                <StoreSkeleton width="w-52" on="mermelada" />
              </p>
            ) : store.whatsapp ? (
              // Con número, las dos líneas del mockup: el número y el enlace.
              <>
                <p className="text-sobre-color-suave">
                  <WhatsAppNumber display={store.whatsapp.display} />
                </p>
                <a
                  href={store.whatsapp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${link} font-semibold underline underline-offset-4`}
                >
                  Escribir por WhatsApp
                  <span className="sr-only"> (se abre en otra pestaña)</span>
                </a>
              </>
            ) : (
              // Sin número, una sola línea con un solo marcador, y sin enlace.
              <p className="flex min-h-11 items-center font-semibold">
                <WhatsAppWritePending />
              </p>
            )}
          </div>

          <nav aria-label="Pie de página" className="flex flex-col gap-2">
            <h2 className={heading}>La pastelería</h2>
            {FOOTER_LINKS.map(({ to, label }) => (
              <Link key={to} to={to} className={`${link} text-sobre-color-suave hover:underline hover:underline-offset-4`}>
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-mermelada-suave pt-6 text-nota text-sobre-color-suave">
          <p>© 2026 Pastelería Ilusión</p>
          <div className="flex flex-wrap gap-x-6">
            <Link to="/legal#privacidad" className={`${link} underline underline-offset-4`}>
              Aviso de privacidad
            </Link>
            <Link to="/legal#terminos" className={`${link} underline underline-offset-4`}>
              Términos y condiciones
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
