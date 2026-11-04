import type { HTMLAttributes } from 'react'

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article'
  /** Radio grande, para tarjetas principales y el lienzo del cotizador. */
  large?: boolean
}

export default function Card({ as: Tag = 'div', large = false, className = '', ...rest }: CardProps) {
  return (
    <Tag
      className={`border border-relieve bg-betun p-6 text-mermelada max-[600px]:p-4 ${large ? 'rounded-lg' : 'rounded-md'} ${className}`}
      {...rest}
    />
  )
}
