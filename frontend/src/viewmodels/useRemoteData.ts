import { useCallback, useEffect, useState } from 'react'

/** Estado de un recurso de la API en una pantalla: cargando, con datos o con error. */
export type RemoteData<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error' }

/**
 * Pide un recurso al montar la pantalla y lo vuelve a pedir con `retry`. Cada pantalla (o sección) lleva el suyo,
 * así una falla no tumba las demás. Al desmontar se cancela la petición (`signal`), y una respuesta que llega
 * después ya no cambia nada. Nada se guarda entre visitas: cada carga pide lo vigente. `load` debe ser estable
 * (una función del modelo, no una creada en cada render). `hadError` queda en `true` desde la primera falla: la
 * pantalla puede seguir mostrando la sección (y su título, que tiene el foco) aunque el reintento llegue vacío.
 */
export function useRemoteData<T>(load: (signal: AbortSignal) => Promise<T>, failureMessage: string) {
  const [state, setState] = useState<RemoteData<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [hadError, setHadError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        // La sección muestra el error con su reintento; se registra para diagnosticarlo.
        console.warn(failureMessage, error)
        setState({ status: 'error' })
        setHadError(true)
      },
    )
    return () => controller.abort()
  }, [load, attempt, failureMessage])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])

  return { state, retry, hadError }
}
