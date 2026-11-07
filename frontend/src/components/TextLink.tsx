import { Link } from 'react-router'
import type { LinkProps } from 'react-router'
import { focusRing, focusRingOnColor } from './focus.ts'

type TextLinkProps = LinkProps & {
  /** Sobre un campo `mermelada`: el anillo de foco va en `betun`. El color del texto lo hereda del campo. */
  onColor?: boolean
}

/** Enlace de texto subrayado fuera de un párrafo ("Ver el catálogo completo"), con 44 px de alto para tocarlo. */
export default function TextLink({ onColor = false, className = '', ...rest }: TextLinkProps) {
  return (
    <Link
      className={`inline-flex min-h-11 items-center self-start rounded-sm text-etiqueta underline underline-offset-4 ${onColor ? focusRingOnColor : focusRing} ${className}`}
      {...rest}
    />
  )
}
