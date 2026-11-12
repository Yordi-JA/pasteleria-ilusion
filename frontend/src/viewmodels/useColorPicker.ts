import { useCallback, useState } from 'react'
import { displayHex, normalizeHex, parseTypedHex } from '../models/color.ts'
import { hexToHsl, hslToHex, PICKER_START } from './colors.ts'
import type { Hsl } from './colors.ts'

/** Cada barra del selector: su etiqueta, hasta dónde llega y cuánto se mueve con las flechas (fino) y con Shift (grueso). */
export const COLOR_BARS = {
  h: { label: 'Tono', max: 360, fine: 1, coarse: 10, unit: '°' },
  s: { label: 'Intensidad', max: 100, fine: 1, coarse: 10, unit: ' %' },
  l: { label: 'Claridad', max: 100, fine: 1, coarse: 10, unit: ' %' },
} as const

export type ColorBarKey = keyof typeof COLOR_BARS

export const HEX_ERROR = 'Escribe el código con 6 dígitos (del 0 al 9 y de la A a la F), por ejemplo #A1B2C3.'

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))

/**
 * View-model del selector libre de color. El tono, la intensidad y la claridad se guardan con decimales aparte del código: así
 * el negro, el blanco y los grises conservan el tono de antes (la barra no salta) y un código escrito no se redondea al
 * volver. El código escrito se acepta al completar 6 dígitos; la forma corta (`#abc`) y los errores se resuelven al salir del
 * campo o con Enter. El color que manda es el de afuera (`value`): si cambia por otro lado, el selector lo sigue. `value` `null`
 * es "todavía no se elige": el selector arranca en `PICKER_START` y cualquier código que se escriba se avisa, aunque sea el mismo.
 */
export function useColorPicker(chosen: string | null, onChange: (hex: string) => void) {
  const value = chosen ?? PICKER_START
  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(value))
  const [text, setText] = useState(() => displayHex(value))
  const [error, setError] = useState<string | null>(null)
  const [synced, setSynced] = useState(value)

  const current = hslToHex(hsl)
  // El color cambió por otro lado (la vista previa, otro paso): se sigue, a menos que sea el que este mismo selector acaba de dar.
  if (value !== synced) {
    setSynced(value)
    // Lo que se escribió y ya es este color se deja como está: reescribirlo (mayúsculas, `#`) movería el cursor al final.
    if (parseTypedHex(text, true) !== normalizeHex(value)) setText(displayHex(value))
    setError(null)
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

  /** Adopta un código completo: mueve las barras y avisa el color nuevo. */
  const commit = useCallback(
    (hex: string) => {
      setHsl(hexToHsl(hex, hsl))
      setError(null)
      if (chosen === null || hex !== normalizeHex(value)) onChange(hex)
    },
    [chosen, hsl, onChange, value],
  )

  const typeText = useCallback(
    (typed: string) => {
      setText(typed)
      const hex = parseTypedHex(typed, false)
      if (hex) commit(hex)
      else setError(null)
    },
    [commit],
  )

  /** Al salir del campo o con Enter: acepta la forma corta o dice qué falta. */
  const settleText = useCallback(() => {
    // Pasar por el campo sin escribir nada no elige el color de arranque.
    if (chosen === null && text === displayHex(value)) return
    const hex = parseTypedHex(text, true)
    if (hex) {
      commit(hex)
      setText(displayHex(hex))
    } else {
      setError(HEX_ERROR)
    }
  }, [chosen, commit, text, value])

  return { hsl, text, error, setBar, typeText, settleText }
}
