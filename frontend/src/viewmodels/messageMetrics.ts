import { useEffect, useState } from 'react'
import { estimatedMetrics } from './messageGeometry.ts'
import type { MessageMetrics } from './messageGeometry.ts'

/**
 * La letra del mensaje sobre el pastel (D55): siempre cursiva a mano alzada, Dancing Script (OFL, `assets/fuentes/`). Solo
 * se usa para el texto sobre el pastel (el editor de vista superior y la vista previa), no para la interfaz.
 */
export const MESSAGE_FONT_FAMILY = '"Dancing Script", cursive'
export const MESSAGE_FONT_WEIGHT = 600

/** Tamaño con el que se mide: mientras más grande, menos error de redondeo; el resultado va en em. */
const MEASURE_PX = 100

let measuring: CanvasRenderingContext2D | null | undefined

function context(): CanvasRenderingContext2D | null {
  if (measuring === undefined) measuring = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  // Se vuelve a poner en cada medida: si la letra llegó después de la primera, el lienzo debe usarla.
  if (measuring) measuring.font = `${MESSAGE_FONT_WEIGHT} ${MEASURE_PX}px ${MESSAGE_FONT_FAMILY}`
  return measuring
}

/**
 * Lo que mide el texto con la letra del mensaje: el ancho de cada letra y el total, en em. Es el único lugar donde se mide.
 * Sin lienzo (un navegador sin canvas 2D), media letra por carácter. Con la letra sin cargar (`fontReady` falso) mide con la de
 * respaldo y no recuerda nada: una medida de la letra de respaldo nunca se guarda como si fuera la de la letra del mensaje.
 */
export function measureMessage(text: string, fontReady: boolean): MessageMetrics {
  if (!fontReady) return measure(text)
  const cached = measured.get(text)
  if (cached) return cached
  const result = measure(text)
  // Medir cuesta un lienzo y una llamada por letra: se recuerda lo medido con la letra ya cargada.
  if (measured.size >= MAX_MEASURED) measured.clear()
  measured.set(text, result)
  return result
}

const measured = new Map<string, MessageMetrics>()
const MAX_MEASURED = 200

function measure(text: string): MessageMetrics {
  const canvas = context()
  if (!canvas) return estimatedMetrics(text)
  const widths = [...text].map((char) => canvas.measureText(char).width / MEASURE_PX)
  const total = canvas.measureText(text).width / MEASURE_PX
  const sum = widths.reduce((accumulated, width) => accumulated + width, 0)
  // Las letras en arco se reparten el mismo largo que el texto recto: se les quita lo que el ajuste entre letras (kerning) restó.
  return { widths: sum > 0 ? widths.map((width) => (width * total) / sum) : widths, total }
}

/**
 * Si la letra del mensaje ya cargó. `@font-face` solo la pide al usarla, así que aquí se pide aparte: el editor y la
 * textura 3D se dibujan con ella, no con la de respaldo. Si no llega, se sigue con la de respaldo (`cursive`).
 */
export function useMessageFont(): boolean {
  const [ready, setReady] = useState(() => typeof document === 'undefined' || !('fonts' in document))
  useEffect(() => {
    if (ready) return
    let alive = true
    document.fonts.load(`${MESSAGE_FONT_WEIGHT} 40px ${MESSAGE_FONT_FAMILY}`).then(
      () => alive && setReady(true),
      () => alive && setReady(true),
    )
    return () => {
      alive = false
    }
  }, [ready])
  return ready
}
