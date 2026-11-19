import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCakeDesignOptions } from '../models/cakeDesign.ts'
import { getProduct } from '../models/catalog.ts'
import type { CaptureStill } from '../three/CakeStill.tsx'
import type { CakeShape } from '../three/cakeShape.ts'
import { sampleShape } from './sampleDesign.ts'
import { useRemoteData } from './useRemoteData.ts'

/**
 * `loading`: pide la ficha y las opciones; `error`: no hay imagen que generar (con su motivo); `drawing`: la escena dibuja;
 * `ready`: ya dibujó y `window.__captureModel()` da la imagen.
 */
export type CakeRenderStatus = 'loading' | 'error' | 'drawing' | 'ready'

declare global {
  interface Window {
    /** Solo en desarrollo, en `/muestra/modelo/:slug`: la imagen fija como `data:image/webp;base64,...` (la usa el script). */
    __captureModel?: () => string
  }
}

/**
 * View-model de la ruta que genera la imagen fija de un pastel (D86, solo en desarrollo): pide la ficha y las opciones de
 * "Diseña tu pastel", arma la forma con `sampleShape` y, cuando la escena ya dibujó, deja la captura en `window.__captureModel`.
 * Las pruebas leen lo que se armó en `probe` (el color de la cobertura, cuántos pisos van peinados y la fruta).
 */
export function useCakeRender(slug: string) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [product, options] = await Promise.all([getProduct(slug, signal), getCakeDesignOptions(signal)])
      return { product, options }
    },
    [slug],
  )
  const { state } = useRemoteData(load, 'No se pudo cargar el pastel de la imagen del modelo.')

  const built = useMemo(() => {
    if (state.status !== 'ready') return null
    const { product, options } = state.data
    if (!product) return { shape: null, error: 'No encontramos este pastel.' }
    return sampleShape(product, options)
  }, [state])

  const [drawn, setDrawn] = useState<CakeShape | null>(null)
  const capture = useRef<CaptureStill | null>(null)
  const onCapture = useCallback((take: CaptureStill | null) => {
    capture.current = take
  }, [])
  const shape = built?.shape ?? null
  const onReady = useCallback(() => setDrawn(shape), [shape])

  const ready = shape !== null && drawn === shape
  useEffect(() => {
    if (!import.meta.env.DEV || !ready) return
    window.__captureModel = () => {
      if (!capture.current) throw new Error('La escena de la imagen del modelo no está montada.')
      return capture.current()
    }
    return () => {
      delete window.__captureModel
    }
  }, [ready])

  const status: CakeRenderStatus =
    state.status === 'loading' ? 'loading' : state.status === 'error' || !shape ? 'error' : ready ? 'ready' : 'drawing'
  const error = state.status === 'error' ? 'No se pudo cargar el pastel o las opciones.' : (built?.error ?? null)

  return {
    status,
    error,
    shape,
    onReady,
    onCapture,
    probe: shape
      ? {
          coverage: typeof shape.tiers[0]?.frosting === 'string' ? shape.tiers[0].frosting : '',
          combed: shape.tiers.filter((tier) => tier.comb).length,
          fruit: shape.topping ? shape.topping.layout : 'none',
          decoration: shape.decoration?.kind ?? 'none',
          board: shape.board ? 'board' : shape.stand ? 'stand' : 'none',
          details: Object.keys(shape.details ?? {}).sort().join(' '),
          edgeSize: shape.decoration && 'size' in shape.decoration ? String(shape.decoration.size ?? 1) : '1',
          fruitDensity: String(shape.topping?.density ?? 1),
          sprinkleDensity: shape.decoration?.kind === 'sprinkles' ? String(shape.decoration.density ?? 1) : '1',
        }
      : null,
  }
}
