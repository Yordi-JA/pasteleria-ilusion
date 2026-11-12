import type { CakeDesignOptions, CoverageColorOption } from '../models/cakeDesign.ts'
import type { MessageColor, MessageColorMode } from '../models/cakeDesignLayout.ts'
import { deepTone, lightTone } from './decorationTones.ts'

/**
 * El color del texto del mensaje (D55), con los tres modos de la decoración (D53): "Automático" es negro; "Colores que
 * combinan" son los dos tonos de la cobertura (uno más oscuro y uno más claro, `decorationTones.ts`); "Lista completa" son
 * los 11 colores de la cobertura (regla 5). Son colores de la vista previa (tinta comestible), no de la interfaz.
 *
 * Aviso de contraste: el color del texto contra el de la cobertura, con la razón de luminancias de WCAG. Sale solo cuando el
 * texto no se lee: debajo de 2:1, en los tres modos (decisión del usuario, D55). Es más bajo que el 3:1 que WCAG 2.1 pide a un
 * gráfico o a un texto grande (1.4.11 y 1.4.3) porque los tonos que combinan, que son los de la decoración (D53), miden entre
 * 2 y 2.5 contra su cobertura y avisar siempre sería ruido. Informa; no bloquea nada.
 */

export const INK_BLACK = '#000000'
export const MIN_MESSAGE_CONTRAST = 2

export const MESSAGE_COLOR_MODES: readonly { mode: MessageColorMode; label: string; description: string }[] = [
  { mode: 'auto', label: 'Automático', description: 'Negro' },
  { mode: 'tones', label: 'Colores que combinan', description: 'Tonos de tu cobertura' },
  { mode: 'list', label: 'Lista completa', description: 'Uno de los colores de la cobertura' },
]

export const TONE_LABELS = { deep: 'Más oscuro', light: 'Más claro' } as const

const channelValue = (channel: number) => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** La luminancia relativa de WCAG de un color `#rrggbb`. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channelValue(parseInt(hex.slice(i, i + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** La razón de contraste de WCAG entre dos colores `#rrggbb`, de 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Los dos tonos de la cobertura para el texto: uno más oscuro y uno más claro. */
export function messageTones(coverageHex: string): { value: 'deep' | 'light'; color: string }[] {
  return [
    { value: 'deep', color: deepTone(coverageHex) },
    { value: 'light', color: lightTone(coverageHex) },
  ]
}

/**
 * El color con que se dibuja el texto. Un color guardado que ya no existe (se quitó de la cobertura o la pastelería lo
 * cambió) vuelve al negro: nunca queda un texto sin color.
 */
export function messageInk(color: MessageColor, coverage: CoverageColorOption | null, options: CakeDesignOptions): string {
  if (color.mode === 'tones' && coverage) return messageTones(coverage.previewColor).find((tone) => tone.value === color.value)?.color ?? INK_BLACK
  if (color.mode === 'list') return options.coverageColors.find((option) => option.slug === color.value)?.previewColor ?? INK_BLACK
  return INK_BLACK
}

/** Si el texto no se lee sobre la cobertura (menos de 2:1). Sin cobertura no hay contra qué comparar. */
export function lowContrast(ink: string, coverage: CoverageColorOption | null): boolean {
  return coverage !== null && contrastRatio(ink, coverage.previewColor) < MIN_MESSAGE_CONTRAST
}
