import { focusRing, focusRingOnColor } from './focus.ts'

/** `primary` es el principal (uno por pantalla); `onColor` va sobre campos `mermelada`. */
export type ButtonVariant = 'primary' | 'secondary' | 'onColor'

// Todas las variantes llevan borde de 2px siempre, para que deshabilitar no cambie el tamaño. El color cambia suave en 150 ms
// con la curva de entrada y, al presionar, el botón se hunde a 0.97 en 100 ms y vuelve en 150 ms (D90); nada con "reducir
// movimiento". Un botón con `aria-disabled` (espera sin perder el foco) no se hunde: no va a hacer nada.
const base =
  'inline-flex min-h-11 items-center justify-center rounded-md border-2 px-6 font-sans text-etiqueta ' +
  'motion-safe:transition-[color,background-color,border-color,text-decoration-color,transform] motion-safe:duration-150 motion-safe:ease-entrada'

const enabled =
  'cursor-pointer hover:underline hover:underline-offset-4 ' +
  'motion-safe:active:scale-[0.97] motion-safe:active:duration-100 aria-disabled:active:transform-none'

const disabledStyle = 'cursor-not-allowed border-dashed border-relieve bg-harina text-mermelada-suave'

const variants: Record<ButtonVariant, string> = {
  primary: `border-transparent bg-mermelada text-sobre-color hover:bg-mermelada-profunda active:bg-mermelada-profunda ${focusRing}`,
  secondary: `border-mermelada bg-betun text-mermelada hover:bg-harina active:bg-harina ${focusRing}`,
  onColor: `border-transparent bg-betun text-mermelada hover:bg-harina active:bg-harina ${focusRingOnColor}`,
}

/**
 * Clases del botón del libro de marca. Las comparten `Button` y `ButtonLink`, para que un enlace con forma de
 * botón se vea igual que un botón.
 */
export function buttonClasses(variant: ButtonVariant, disabled = false): string {
  return disabled ? `${base} ${disabledStyle}` : `${base} ${enabled} ${variants[variant]}`
}
