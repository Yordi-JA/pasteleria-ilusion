import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../models/apiClient.ts'
import { getReferencePhoto, getReferenceRequest } from '../models/referenceRequests.ts'
import type { ReferenceImage, ReferenceRequest } from '../models/referenceRequests.ts'

export type ReferenceLoad = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; request: ReferenceRequest }

/**
 * Pide una solicitud de referencia de la cuenta (D70). Sin id válido, o con un 404 (ajena, no existe), `missing`: no se
 * muestra nada de ella. Otra falla es `error`, con `retry`. `replace` pone la respuesta de una acción (cancelar) sin
 * volver a pedir.
 */
export function useReferenceRequest(id: number | null) {
  const [fetched, setFetched] = useState<ReferenceLoad>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (id === null) return
    const controller = new AbortController()
    getReferenceRequest(id, controller.signal).then(
      (request) => {
        if (!controller.signal.aborted) setFetched({ status: 'ready', request })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('No se pudo cargar la solicitud.', error)
        setFetched(error instanceof ApiError && error.status === 404 ? { status: 'missing' } : { status: 'error' })
      },
    )
    return () => controller.abort()
  }, [id, attempt])

  const retry = useCallback(() => {
    setFetched({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])
  /** Vuelve a pedir sin mostrar el esqueleto (por ejemplo, tras un 409 que dice que cambió). */
  const refresh = useCallback(() => setAttempt((count) => count + 1), [])
  const replace = useCallback((request: ReferenceRequest) => setFetched({ status: 'ready', request }), [])

  return { load: id === null ? ({ status: 'missing' } as const) : fetched, retry, refresh, replace }
}

/** Una foto lista para el `<img>` (dirección local), todavía cargando o que no se pudo abrir. */
export type PhotoView = { id: string; name: string; url: string | null; failed: boolean }

/**
 * Las fotos de la solicitud. Se piden con la sesión (`GET customer-images/<id>/`, solo el dueño) y se muestran con una
 * dirección local que se libera al cambiar las fotos o al salir de la pantalla.
 */
export function useReferencePhotos(images: ReferenceImage[]): PhotoView[] {
  const key = images.map((image) => image.id).join(',')
  const [urls, setUrls] = useState<{ key: string; byId: Record<string, string | 'failed'> }>({ key: '', byId: {} })

  useEffect(() => {
    if (key === '') return
    const controller = new AbortController()
    const created: string[] = []
    for (const id of key.split(',')) {
      getReferencePhoto(id, controller.signal).then(
        (blob) => {
          if (controller.signal.aborted) return
          const url = URL.createObjectURL(blob)
          created.push(url)
          setUrls((current) => ({ key, byId: { ...(current.key === key ? current.byId : {}), [id]: url } }))
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          console.warn('No se pudo cargar una foto de la solicitud.', error)
          setUrls((current) => ({ key, byId: { ...(current.key === key ? current.byId : {}), [id]: 'failed' } }))
        },
      )
    }
    return () => {
      controller.abort()
      for (const url of created) URL.revokeObjectURL(url)
    }
  }, [key])

  return images.map((image) => {
    const value = urls.key === key ? urls.byId[image.id] : undefined
    return { id: image.id, name: image.originalName || 'Foto', url: value && value !== 'failed' ? value : null, failed: value === 'failed' }
  })
}
