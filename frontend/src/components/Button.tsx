import type { ButtonHTMLAttributes } from 'react'
import { buttonClasses } from './buttonStyles.ts'
import type { ButtonVariant } from './buttonStyles.ts'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `primary` es el principal (uno por pantalla); `onColor` va sobre campos `mermelada`. */
  variant?: ButtonVariant
}

export default function Button({ variant = 'primary', type = 'button', className = '', disabled, ...rest }: ButtonProps) {
  return <button type={type} disabled={disabled} className={`${buttonClasses(variant, disabled)} ${className}`} {...rest} />
}
