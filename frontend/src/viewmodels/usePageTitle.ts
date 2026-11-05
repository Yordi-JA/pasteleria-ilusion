import { useEffect } from 'react'

const SITE_NAME = 'Pastelería Ilusión'

/** Título de la pestaña: "Vista · Pastelería Ilusión"; sin vista, solo el nombre (la portada). */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME
  }, [title])
}
