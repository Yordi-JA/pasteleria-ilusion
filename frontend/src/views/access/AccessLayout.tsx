import { useId, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import HeroCake, { StaticCakeBox } from '../../components/HeroCake.tsx'
import { useClosingField } from '../../viewmodels/useClosingField.ts'
import { useHeroCake } from '../../viewmodels/useHeroCake.ts'

/**
 * El pastel de tres pisos de la portada en la escena chica (libro de marca, "Presencia de marca": también va en el
 * inicio de sesión y el registro), con las reglas de D48: gira solo, se arrastra, gira con las flechas, se pausa fuera
 * de pantalla y respeta "reducir movimiento". No se separa con el scroll. Si tenía el foco y desaparece, el foco pasa
 * al primer campo de la tarjeta.
 */
function AccessCake({ card }: { card: RefObject<HTMLDivElement | null> }) {
  const cake = useHeroCake()
  const hintId = useId()
  return (
    <>
      <p id={hintId} className="sr-only">
        Arrastra el pastel para girarlo. Usa las flechas izquierda y derecha para girarlo.
      </p>
      <HeroCake cake={cake} hintId={hintId} size="compact" testId="pastel-acceso" onFocusEscape={() => card.current?.querySelector<HTMLElement>('input')?.focus()} />
    </>
  )
}

/**
 * El armado de `/entrar` y `/registro` (Login.dc.html, Registro.dc.html): todo sobre `fresa`. En escritorio, a la
 * izquierda el lema, lo que ofrece la cuenta (`aside`) y el pastel abajo; a la derecha, la tarjeta. Hasta 960 px, una
 * columna: lema, tarjeta y el pastel debajo; `aside` no se muestra. Un solo pastel cambia de lugar con la cuadrícula,
 * para no abrir dos escenas 3D. `/recuperar` y `/verificar` (D76) usan el mismo armado con `cake="static"`: el pastel
 * fijo, porque el 3D solo va en las vistas que enumera el libro de marca.
 */
export default function AccessLayout({
  slogan,
  aside,
  cake = 'scene',
  children,
}: {
  slogan: string
  aside?: ReactNode
  cake?: 'scene' | 'static'
  children: ReactNode
}) {
  useClosingField('fresa')
  const card = useRef<HTMLDivElement>(null)
  return (
    <section className="bg-fresa">
      <div
        className={
          'mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,1fr)_minmax(0,480px)] grid-rows-[auto_auto_1fr] gap-x-16 gap-y-8 px-6 pb-14 pt-14 ' +
          "[grid-template-areas:'lema_tarjeta'_'cuenta_tarjeta'_'pastel_tarjeta'] " +
          "max-[960px]:grid-cols-1 max-[960px]:grid-rows-none max-[960px]:gap-y-6 max-[960px]:[grid-template-areas:'lema'_'tarjeta'_'pastel'] " +
          'max-[600px]:px-4 max-[600px]:pt-10'
        }
      >
        <p className="font-display text-[48px] font-medium leading-[1.08] tracking-[-0.01em] [grid-area:lema] max-[960px]:text-[32px] max-[600px]:text-[28px]">
          {slogan}
        </p>
        {aside && <div className="[grid-area:cuenta] max-[960px]:hidden">{aside}</div>}
        <div className="w-full max-w-[400px] self-end [grid-area:pastel] max-[960px]:mx-auto max-[960px]:max-w-[320px]">
          {cake === 'scene' ? <AccessCake card={card} /> : <StaticCakeBox testId="pastel-acceso-fijo" />}
        </div>
        <div ref={card} className="[grid-area:tarjeta]">
          {children}
        </div>
      </div>
    </section>
  )
}
