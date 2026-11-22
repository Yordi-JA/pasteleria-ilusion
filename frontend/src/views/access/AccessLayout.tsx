import { useId, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import HeroCake, { StaticCakeBox } from '../../components/HeroCake.tsx'
import { useClosingField } from '../../viewmodels/useClosingField.ts'
import { useHeroCake } from '../../viewmodels/useHeroCake.ts'

/**
 * El pastel de dos pisos de la portada (`homeCake.ts`, desde la tanda 8) en la escena chica (libro de marca, "Presencia de
 * marca": también va en el inicio de sesión y el registro), con las reglas de D48: gira solo, se arrastra, gira con las flechas, se pausa fuera
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
 * Las filas de escritorio. Sin `aside` (`/entrar`, `/recuperar`, `/verificar`) no hay fila vacía: con ella, la cuadrícula sumaba otro
 * espacio de 32 px y el pastel quedaba más abajo del lema (tanda 10). Clases completas para que Tailwind las encuentre. La fila del
 * pastel (`1fr`) mide lo que la tarjeta deja libre bajo el texto.
 */
const WITH_ASIDE = "grid-rows-[auto_auto_1fr] [grid-template-areas:'lema_tarjeta'_'cuenta_tarjeta'_'pastel_tarjeta'] "
const WITHOUT_ASIDE = "grid-rows-[auto_1fr] [grid-template-areas:'lema_tarjeta'_'pastel_tarjeta'] "

/**
 * El armado de `/entrar` y `/registro` (Login.dc.html, Registro.dc.html): todo sobre `fresa`. En escritorio, a la
 * izquierda el lema, lo que ofrece la cuenta (`aside`) y el pastel debajo; a la derecha, la tarjeta. Hasta 960 px, una
 * columna: lema, tarjeta y el pastel debajo; `aside` no se muestra. Un solo pastel cambia de lugar con la cuadrícula,
 * para no abrir dos escenas 3D. `/recuperar` y `/verificar` (D76) usan el mismo armado con `cake="static"`: el pastel
 * fijo, porque el 3D solo va en las vistas que enumera el libro de marca.
 *
 * El lugar del pastel (correcciones del 21 de noviembre) es un contenedor de tamaño: no empuja la cuadrícula, mide lo que la
 * tarjeta deja libre bajo el texto (al menos 360 px) y el pastel, tan grande como cabe, va apoyado en su borde de abajo, a la
 * altura del final de la tarjeta. Antes iba arriba de su celda (tandas 10 y 11) y dejaba hasta 190 px vacíos debajo. En una
 * columna, el lugar mide 360 px de alto (316 px en móvil, lo que mide el pastel a todo lo ancho) y el pastel cierra la sección, a
 * 24 px de la guirnalda en vez de 56.
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
          'mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,1fr)_minmax(0,480px)] gap-x-16 gap-y-8 px-6 pb-14 pt-14 ' +
          (aside ? WITH_ASIDE : WITHOUT_ASIDE) +
          "max-[960px]:grid-cols-1 max-[960px]:grid-rows-none max-[960px]:gap-y-6 max-[960px]:pb-6 max-[960px]:[grid-template-areas:'lema'_'tarjeta'_'pastel'] " +
          'max-[600px]:px-4 max-[600px]:pt-10'
        }
      >
        <p className="font-display text-[48px] font-medium leading-[1.08] tracking-[-0.01em] [grid-area:lema] max-[960px]:text-[32px] max-[600px]:text-[28px]">
          {slogan}
        </p>
        {aside && <div className="[grid-area:cuenta] max-[960px]:hidden">{aside}</div>}
        <div
          data-testid="lugar-pastel-acceso"
          className="flex min-h-[360px] items-end justify-center [container-type:size] [grid-area:pastel] max-[960px]:h-[360px] max-[960px]:min-h-0 max-[600px]:h-[316px]"
        >
          {cake === 'scene' ? <AccessCake card={card} /> : <StaticCakeBox testId="pastel-acceso-fijo" />}
        </div>
        <div ref={card} className="[grid-area:tarjeta]">
          {children}
        </div>
      </div>
    </section>
  )
}
