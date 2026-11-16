import type { ReactNode } from 'react'

/**
 * La tarjeta de `/recuperar` y `/verificar` (Recuperar.dc.html, Verificar.dc.html, D76): la misma de `/entrar`
 * (`betun`, borde `relieve`, `h1` y su línea de abajo), sin Google. `intro` es la línea bajo el título.
 */
export default function AccessPanel({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-lg border border-relieve bg-betun p-10 text-mermelada max-[600px]:px-5 max-[600px]:py-7">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-titulo-1">{title}</h1>
        {intro}
      </div>
      {children}
    </div>
  )
}

/** El recuadro `nata` de la tarjeta ("¿No te llegó?", la nota de Google), como el mockup. */
export function AccessAside({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-2.5 rounded-md bg-nata p-4 text-[15px] leading-[1.5] ${className}`}>{children}</div>
}
