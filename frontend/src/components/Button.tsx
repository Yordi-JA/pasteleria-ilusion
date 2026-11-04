import type { ButtonHTMLAttributes } from 'react'
import { focusRing, focusRingOnColor } from './focus.ts'

type ButtonVariant = 'primary' | 'secondary' | 'onColor'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `primary` es el principal (uno por pantalla); `onColor` va sobre campos `mermelada`. */
  variant?: ButtonVariant
}

// Todas las variantes llevan borde de 2px siempre, para que deshabilitar no cambie el tamaño.
const base =
  'inline-flex min-h-11 items-center justify-center rounded-md border-2 px-6 font-sans text-etiqueta ' +
  'motion-safe:transition-colors'

const enabled =
  'cursor-pointer hover:underline hover:underline-offset-4 motion-safe:active:translate-y-px'

const disabledStyle = 'cursor-not-allowed border-dashed border-relieve bg-harina text-mermelada-suave'

const variants: Record<ButtonVariant, string> = {
  primary: `border-transparent bg-mermelada text-sobre-color hover:bg-mermelada-profunda active:bg-mermelada-profunda ${focusRing}`,
  secondary: `border-mermelada bg-betun text-mermelada hover:bg-harina active:bg-harina ${focusRing}`,
  onColor: `border-transparent bg-betun text-mermelada hover:bg-harina active:bg-harina ${focusRingOnColor}`,
}

export default function Button({ variant = 'primary', type = 'button', className = '', disabled, ...rest }: ButtonProps) {
  const style = disabled ? disabledStyle : `${enabled} ${variants[variant]}`
  return <button type={type} disabled={disabled} className={`${base} ${style} ${className}`} {...rest} />
}
