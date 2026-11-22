import type { DrizzleKind } from './cakeShape.ts'

/**
 * Los hilos que no son hilos sino un dibujo de toda la tapa (fotos nuevas del 22 de noviembre): la telaraña plumeada de fresa, las
 * plumas en espiral de cajeta y el jaspeado en espiral de zarzamora. Se dibujan en una textura sobre un disco (`topPattern.ts`), no
 * con tubos: así no cuestan triángulos. Sin React ni three, para que `sampleDetails.ts` sepa cuáles son.
 */
export type TopPatternKind = Extract<DrizzleKind, 'web' | 'feathers' | 'marble'>

const TOP_PATTERNS: Record<TopPatternKind, true> = { web: true, feathers: true, marble: true }

export function isTopPattern(kind: DrizzleKind): kind is TopPatternKind {
  return Object.hasOwn(TOP_PATTERNS, kind)
}
