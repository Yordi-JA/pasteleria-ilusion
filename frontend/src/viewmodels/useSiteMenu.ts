import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router'

// El botón del menú solo se ve por debajo de 768 px (`max-md` en la barra); a partir de ahí el menú se cierra.
const DESKTOP = '(min-width: 768px)'

/**
 * Estado del menú móvil: se cierra al navegar o al pasar a escritorio, y mientras está abierto bloquea el
 * scroll del fondo. `closedBy` dice por qué se cerró: `user` (Escape, el botón cerrar, el velo o el cambio a
 * escritorio) devuelve el foco al botón; `navigation` lo deja a la vista nueva, que lo lleva a `<main>`.
 */
export function useSiteMenu() {
  const { key } = useLocation()
  // Se guarda la entrada del historial en la que se abrió: cualquier navegación (un enlace, aunque sea a la
  // misma ruta, atrás o adelante) crea otra entrada y lo cierra sola. `null` es un cierre del usuario.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const isOpen = openedAt === key
  const closedBy: 'user' | 'navigation' = openedAt === null ? 'user' : 'navigation'

  const open = useCallback(() => setOpenedAt(key), [key])
  const close = useCallback(() => setOpenedAt(null), [])

  useEffect(() => {
    if (!isOpen) return
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    const desktop = window.matchMedia(DESKTOP)
    const onChange = () => {
      if (desktop.matches) setOpenedAt(null)
    }
    desktop.addEventListener('change', onChange)
    return () => {
      root.style.overflow = previous
      desktop.removeEventListener('change', onChange)
    }
  }, [isOpen])

  return { isOpen, closedBy, open, close }
}
