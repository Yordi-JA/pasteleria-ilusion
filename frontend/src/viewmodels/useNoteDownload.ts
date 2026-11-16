import { useEffect, useRef, useState } from 'react'
import { getOrderNote, noteFileName } from '../models/accountOrders.ts'

export type NoteDownloadState = 'idle' | 'downloading' | 'error'

/** Entrega el archivo al navegador con un `<a download>` temporal y libera la URL del `Blob` después del clic. */
function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  // El clic empieza la descarga en otra tarea: se libera un momento después, no en el mismo tick.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/**
 * La descarga de la nota en PDF (regla 11, D69) desde la confirmación y el detalle. El endpoint pide el
 * `Authorization` de la sesión, así que no basta un enlace: se pide con `fetch`, se convierte en `Blob` y se guarda.
 * Mientras llega, `downloading` (el botón dice "Descargando nota…" y no se puede volver a pulsar); si falla, `error`.
 */
export function useNoteDownload(orderId: number | null) {
  const [state, setState] = useState<NoteDownloadState>('idle')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const download = async () => {
    if (orderId === null || state === 'downloading') return
    setState('downloading')
    try {
      const blob = await getOrderNote(orderId)
      if (!mounted.current) return
      saveFile(blob, noteFileName(orderId))
      setState('idle')
    } catch (error) {
      console.warn('No se pudo descargar la nota.', error)
      if (mounted.current) setState('error')
    }
  }

  return { state, download: () => void download() }
}
