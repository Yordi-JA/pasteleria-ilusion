import type { ComponentPropsWithRef } from 'react'
import { buttonClasses } from './buttonStyles.ts'
import type { ButtonVariant } from './buttonStyles.ts'

// En React 19 `ref` llega al botón como una prop más, dentro de `rest` (por ejemplo, para devolverle el foco).
type ButtonProps = ComponentPropsWithRef<'button'> & {
  /** `primary` es el principal (uno por pantalla); `onColor` va sobre campos `mermelada`. */
  variant?: ButtonVariant
}

export default function Button({ variant = 'primary', type = 'button', className = '', disabled, ...rest }: ButtonProps) {
  return <button type={type} disabled={disabled} className={`${buttonClasses(variant, disabled)} ${className}`} {...rest} />
}
