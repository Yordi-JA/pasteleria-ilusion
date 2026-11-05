import { User, X } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, RefObject } from 'react'
import { Link, NavLink } from 'react-router'
import type { StoreDetails } from '../viewmodels/useStoreInfo.ts'
import { focusRing } from './focus.ts'
import { BROWSE_LINKS, ORDER_LINK } from './navigation.ts'
import { LeadDaysText, StoreLoadingLabel, StoreSkeleton, WhatsAppWritePending } from './StoreText.tsx'

type SiteMenuProps = {
  store: StoreDetails
  isOpen: boolean
  /** Por qué está cerrado: solo un cierre del usuario devuelve el foco al botón (ver `useSiteMenu`). */
  closedBy: 'user' | 'navigation'
  onClose: () => void
  /** Control que abrió el menú; recibe el foco al cerrarlo. */
  returnFocusTo: RefObject<HTMLElement | null>
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

function focusMain() {
  document.getElementById('contenido')?.focus({ preventScroll: true })
}

/**
 * Devuelve el foco al botón que abrió el menú. Si ese botón ya no se ve (la ventana pasó a escritorio y
 * está oculto), lo lleva a <main> para que no se pierda en el documento.
 */
function restoreFocus(button: HTMLElement | null) {
  button?.focus()
  if (!button || document.activeElement !== button) focusMain()
}

/**
 * Menú del sitio en móvil (mockup MenuSitio): panel a la derecha sobre un velo `mermelada`. Es un `<dialog>`
 * modal, así que el fondo queda inerte; además el foco gira dentro del panel con Tab y Mayús+Tab.
 */
export default function SiteMenu({ store, isOpen, closedBy, onClose, returnFocusTo }: SiteMenuProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  // Marca los cierres que pide el estado, para que su evento `close` no se tome como un cierre del navegador.
  const closingFromState = useRef(false)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (isOpen && !el.open) {
      // Al cerrarse, el navegador devuelve el foco al control que lo tenía antes de `showModal()`, aunque se
      // cierre por una navegación. Se suelta antes de abrir para que el foco al cerrar lo decida solo este
      // componente: al botón en un cierre del usuario, a <main> al navegar.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      el.showModal()
    } else if (!isOpen && el.open) {
      const hadFocus = el.contains(document.activeElement)
      closingFromState.current = true
      el.close()
      if (closedBy === 'user') restoreFocus(returnFocusTo.current)
      else if (hadFocus) focusMain()
    }
  }, [isOpen, closedBy, returnFocusTo])

  // Escape lo cierra el navegador y termina en `close`: es un cierre del usuario, así que el estado se
  // sincroniza (cerrar dos veces no tiene efecto) y el foco vuelve al botón.
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    const onDialogClose = () => {
      if (closingFromState.current) {
        closingFromState.current = false
        return
      }
      onClose()
      restoreFocus(returnFocusTo.current)
    }
    el.addEventListener('close', onDialogClose)
    return () => el.removeEventListener('close', onDialogClose)
  }, [onClose, returnFocusTo])

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (controls.length === 0) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Un clic en el velo llega al <dialog> mismo; dentro del panel, el destino es uno de sus hijos.
  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  const loading = store.status === 'loading'

  return (
    <dialog
      ref={dialog}
      id="menu-sitio"
      aria-labelledby="menu-sitio-titulo"
      onKeyDown={trapFocus}
      onClick={closeOnBackdrop}
      className="m-0 ml-auto h-dvh max-h-none w-80 max-w-[86vw] rounded-l-lg bg-betun p-0 text-mermelada shadow-flotante backdrop:bg-mermelada/45"
    >
      <div className="flex min-h-full flex-col gap-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="menu-sitio-titulo" className="font-display text-titulo-2">
            Menú
          </h2>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onClose}
            className={`inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md hover:bg-harina ${focusRing}`}
          >
            <X size={22} weight="regular" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Principal">
          <ul className="flex flex-col gap-0.5">
            {BROWSE_LINKS.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={
                    'flex min-h-[52px] items-center rounded-md px-4 font-display text-titulo-2 ' +
                    `hover:bg-harina aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-[6px] ${focusRing}`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <Link
          to={ORDER_LINK.to}
          className={`flex min-h-[52px] items-center justify-center rounded-md bg-mermelada text-cuerpo font-semibold text-sobre-color hover:bg-mermelada-profunda hover:underline hover:underline-offset-4 ${focusRing}`}
        >
          {ORDER_LINK.label}
        </Link>
        <Link
          to="/entrar"
          className={`flex min-h-12 items-center gap-2.5 border-t border-relieve px-4 text-cuerpo font-semibold hover:underline hover:underline-offset-4 ${focusRing}`}
        >
          <User size={20} weight="regular" aria-hidden="true" />
          Iniciar sesión o crear cuenta
        </Link>
        <div aria-busy={loading || undefined} className="mt-auto flex flex-col gap-1.5 rounded-md bg-fresa p-4">
          {loading && <StoreLoadingLabel />}
          <p className="text-nota text-mermelada-suave">
            {loading ? <StoreSkeleton width="w-52" on="fresa" /> : <LeadDaysText days={store.leadDays} />}
          </p>
          {loading ? (
            <p className="flex min-h-11 items-center">
              <StoreSkeleton width="w-60" on="fresa" />
            </p>
          ) : store.whatsapp ? (
            <a
              href={store.whatsapp.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-11 items-center rounded-sm font-semibold underline underline-offset-4 ${focusRing}`}
            >
              Escribir por WhatsApp {store.whatsapp.display}
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          ) : (
            <p className="flex min-h-11 items-center font-semibold">
              <WhatsAppWritePending />
            </p>
          )}
        </div>
      </div>
    </dialog>
  )
}
