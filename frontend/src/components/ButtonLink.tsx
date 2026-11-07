import { Link } from 'react-router'
import type { LinkProps } from 'react-router'
import { buttonClasses } from './buttonStyles.ts'
import type { ButtonVariant } from './buttonStyles.ts'

type ButtonLinkProps = LinkProps & {
  /** `primary` es el principal (uno por pantalla); `onColor` va sobre campos `mermelada`. */
  variant?: ButtonVariant
}

/**
 * Enlace con forma de botón, para acciones que llevan a otra pantalla ("Realizar pedido", "Ver la vitrina"): es un
 * `<a>` de verdad, así se abre en otra pestaña y el lector lo anuncia como enlace.
 */
export default function ButtonLink({ variant = 'primary', className = '', ...rest }: ButtonLinkProps) {
  return <Link className={`${buttonClasses(variant)} ${className}`} {...rest} />
}
