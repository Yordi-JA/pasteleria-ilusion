import { useCallback, useEffect, useState } from 'react'

/**
 * Estado de un mensaje flotante que explica un control (el candado del relleno incluido, tanda 1). Se abre con el foco, con
 * el puntero encima y con un toque; se cierra al salir, al perder el foco o con Esc (WCAG 1.4.13: se puede descartar sin
 * mover el puntero ni el foco).
 */
export function useToggletip() {
  const [open, setOpen] = useState(false)
  const show = useCallback(() => setOpen(true), [])
  const hide = useCallback(() => setOpen(false), [])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  return { open, show, hide }
}
