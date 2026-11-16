import { List, User, X } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { NavLink, useLocation } from 'react-router'
import { focusRing } from '../../components/focus.ts'
import type { SessionUser } from '../../models/session.ts'
import { useSiteMenu } from '../../viewmodels/useSiteMenu.ts'

/** Las secciones de la cuenta (mockup `Cuenta`). Las otras dos son vistas propias; aquí solo se enlazan. */
const SECTIONS = [
  { to: '/cuenta', label: 'Mis pedidos' },
  { to: '/cuenta/bases', label: 'Bases en préstamo' },
  { to: '/cuenta/datos', label: 'Datos y avisos' },
] as const

const FOCUSABLE = 'a[href], button:not([disabled])'

type AccountNavProps = { user: SessionUser; onSignOut: () => void }

/**
 * El submenú de la cuenta (D69): pestañas con "Cerrar sesión" a la derecha desde 768 px y, en móvil, un botón con la
 * sección actual que abre el menú "Tu cuenta" (mockup `CuentaMenu`), un `<dialog>` modal a la izquierda. El estado del
 * menú es el de `useSiteMenu`: se cierra al navegar o al pasar a escritorio.
 */
export default function AccountNav({ user, onSignOut }: AccountNavProps) {
  const { pathname } = useLocation()
  const menu = useSiteMenu()
  const opener = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const closingFromState = useRef(false)
  const current = SECTIONS.find((section) => section.to === pathname) ?? SECTIONS[0]

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (menu.isOpen && !el.open) el.showModal()
    else if (!menu.isOpen && el.open) {
      closingFromState.current = true
      el.close()
      if (menu.closedBy === 'user') opener.current?.focus()
    }
  }, [menu.isOpen, menu.closedBy])

  // Escape lo cierra el navegador: se sincroniza el estado y el foco vuelve al botón.
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    const onClose = () => {
      if (closingFromState.current) {
        closingFromState.current = false
        return
      }
      menu.close()
      opener.current?.focus()
    }
    el.addEventListener('close', onClose)
    return () => el.removeEventListener('close', onClose)
  }, [menu])

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) menu.close()
  }

  const tab =
    'inline-flex min-h-11 items-center border-b-2 border-transparent px-3.5 text-etiqueta font-semibold text-mermelada-suave hover:text-mermelada ' +
    `aria-[current=page]:border-mermelada aria-[current=page]:text-mermelada ${focusRing}`
  const row = `flex min-h-12 items-center rounded-md px-4 text-cuerpo font-semibold hover:bg-harina aria-[current=page]:bg-fresa ${focusRing}`

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 pt-8 max-[600px]:px-4">
      <div className="flex items-center justify-between gap-4 border-b border-relieve max-md:hidden">
        <nav aria-label="Tu cuenta">
          <ul className="flex flex-wrap">
            {SECTIONS.map((section) => (
              <li key={section.to}>
                <NavLink to={section.to} end className={tab}>
                  {section.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <button type="button" onClick={onSignOut} className={`inline-flex min-h-11 cursor-pointer items-center rounded-sm text-etiqueta underline underline-offset-4 ${focusRing}`}>
          Cerrar sesión
        </button>
      </div>
      <button
        ref={opener}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={menu.isOpen}
        aria-controls="menu-cuenta"
        onClick={menu.open}
        className={`hidden min-h-11 cursor-pointer items-center gap-2.5 rounded-md border-[1.5px] border-mermelada px-4 text-etiqueta font-semibold max-md:inline-flex ${focusRing}`}
      >
        <List size={20} weight="regular" aria-hidden="true" />
        {current.label}
      </button>
      <dialog
        ref={dialog}
        id="menu-cuenta"
        aria-labelledby="menu-cuenta-titulo"
        onKeyDown={trapFocus}
        onClick={closeOnBackdrop}
        className="m-0 mr-auto h-dvh max-h-none w-80 max-w-[86vw] rounded-r-lg bg-betun p-0 text-mermelada shadow-flotante backdrop:bg-mermelada/45"
      >
        {/* El contenido solo existe con el menú abierto: cerrado, el correo y los enlaces no se repiten en la página. */}
        {menu.isOpen && (
        <div className="flex min-h-full flex-col gap-5 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="menu-cuenta-titulo" className="font-display text-titulo-2">
              Tu cuenta
            </h2>
            <button
              type="button"
              aria-label="Cerrar menú de la cuenta"
              onClick={menu.close}
              className={`inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md hover:bg-harina ${focusRing}`}
            >
              <X size={22} weight="regular" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-fresa p-4">
            <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-betun">
              <User size={22} weight="regular" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-cuerpo font-semibold">{user.fullName}</span>
              <span className="break-all text-nota text-mermelada-suave">{user.email}</span>
            </span>
          </div>
          <nav aria-label="Secciones de tu cuenta">
            <ul className="flex flex-col gap-1">
              {SECTIONS.map((section) => (
                <li key={section.to}>
                  <NavLink to={section.to} end className={row}>
                    {section.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto border-t border-relieve pt-2">
            <button
              type="button"
              onClick={() => {
                menu.close()
                onSignOut()
              }}
              className={`${row} w-full cursor-pointer text-left`}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
        )}
      </dialog>
    </div>
  )
}
