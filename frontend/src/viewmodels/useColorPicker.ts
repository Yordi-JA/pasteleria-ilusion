import { useCallback, useState } from 'react'
import { normalizeHex } from '../models/color.ts'
import { hexToHsl, hslToHex, PICKER_START } from './colors.ts'
import type { Hsl } from './colors.ts'

/** Cada barra del selector: su etiqueta, hasta dónde llega y cuánto se mueve con las flechas (fino) y con Shift (grueso). */
export const COLOR_BARS = {
  h: { label: 'Tono', max: 360, fine: 1, coarse: 10, unit: '°' },
  s: { label: 'Intensidad', max: 100, fine: 1, coarse: 10, unit: ' %' },
  l: { label: 'Claridad', max: 100, fine: 1, coarse: 10, unit: ' %' },
} as const

export type ColorBarKey = keyof typeof COLOR_BARS

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))

/**
 * View-model del selector libre de color: las tres barras (ya no hay campo para escribir el código, tanda 1). El tono, la
 * intensidad y la claridad se guardan con decimales aparte del código: así el negro, el blanco y los grises conservan el tono de
 * antes (la barra no salta) y un color guardado no se redondea al volver. El color que manda es el de afuera (`value`): si cambia
 * por otro lado, el selector lo sigue. `value` `null` es "todavía no se elige": el selector arranca en `PICKER_START` y cualquier
 * movimiento de una barra lo elige, aunque quede en el mismo color.
 */
export function useColorPicker(chosen: string | null, onChange: (hex: string) => void) {
  const value = chosen ?? PICKER_START
  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(value))
  const [synced, setSynced] = useState(value)

  const current = hslToHex(hsl)
  // El color cambió por otro lado (la vista previa, otro paso): se sigue, a menos que sea el que este mismo selector acaba de dar.
  if (value !== synced) {
    setSynced(value)
    if (normalizeHex(value) && normalizeHex(value) !== current) setHsl(hexToHsl(value, hsl))
  }

  const setBar = useCallback(
    (key: ColorBarKey, amount: number) => {
      const next = { ...hsl, [key]: clamp(amount, COLOR_BARS[key].max) }
      setHsl(next)
      onChange(hslToHex(next))
    },
    [hsl, onChange],
  )

  return { hsl, setBar }
}
