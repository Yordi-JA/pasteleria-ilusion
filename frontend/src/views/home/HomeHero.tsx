import { ArrowsLeftRight } from '@phosphor-icons/react'
import { useRef } from 'react'
import logo from '../../../../assets/logos/ilusion-logo.svg'
import ButtonLink from '../../components/ButtonLink.tsx'
import HeroCake from '../../components/HeroCake.tsx'
import { ORDER_LINK } from '../../components/navigation.ts'
import { useHeroCake } from '../../viewmodels/useHeroCake.ts'
import { Field } from './sectionLayout.tsx'

const HINT_ID = 'pastel-pista'

/**
 * Hero de la portada sobre `fresa` (Main.dc.html): el logotipo grande como `h1`, el lema, la frase y las dos
 * acciones, con el pastel a la derecha (abajo en móvil). En móvil el logotipo grande se oculta, como en el
 * mockup: el de la barra ya está a la vista y el `h1` sigue para el lector de pantalla. La pista "Arrastra el
 * pastel para girarlo." guarda su lugar invisible hasta que la escena 3D se dibuja, para no mover la columna ni
 * prometer un gesto que el pastel fijo no tiene; en móvil se oculta, como en el mockup. Describe la escena
 * (`aria-describedby`) con sus dos frases; con el foco del teclado en la escena, la visible es la de las flechas.
 */
export default function HomeHero() {
  const cake = useHeroCake()
  const actions = useRef<HTMLDivElement>(null)
  // Si la escena con foco desaparece (se perdió el contexto), el foco pasa a "Ver la vitrina", no a `<body>`.
  const focusLastAction = () => actions.current?.querySelector<HTMLElement>('a:last-of-type')?.focus()
  return (
    <Field field="fresa" labelledBy="portada-titulo" className="bg-fresa">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-6 px-6 pb-6 pt-8 max-[960px]:grid-cols-1 max-[600px]:px-4">
        <div className="flex flex-col gap-6">
          <h1 id="portada-titulo" className="-ml-2 leading-none max-[600px]:sr-only">
            <img src={logo} alt="" width={565} height={247} className="block h-auto w-full max-w-[640px] max-[600px]:hidden" />
            <span className="sr-only">Pastelería Ilusión</span>
          </h1>
          <p className="font-display text-titulo-1 text-mermelada">Pide un deseo. Del pastel nos encargamos.</p>
          <p className="max-w-[520px] text-cuerpo text-mermelada-suave">
            Pasteles artesanales para bodas, XV años y cumpleaños, y postres del día, hechos por una pastelería familiar.
          </p>
          <div ref={actions} className="flex flex-wrap items-center gap-4">
            <ButtonLink to={ORDER_LINK.to}>{ORDER_LINK.label}</ButtonLink>
            <ButtonLink to="/vitrina" variant="secondary">
              Ver la vitrina
            </ButtonLink>
          </div>
          <p
            id={HINT_ID}
            className={`inline-flex items-center gap-2 text-nota text-mermelada-suave max-[600px]:hidden ${cake.status === 'ready' ? '' : 'invisible'}`}
          >
            {/* La mano del mockup acompaña la pista del arrastre; con el foco del teclado, las flechas. */}
            {cake.keyboardFocus ? (
              <ArrowsLeftRight size={18} aria-hidden="true" />
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V11M16 11V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.5 15a1.5 1.5 0 0 1 2.4-1.8L7 14.5" />
              </svg>
            )}
            <span className={cake.keyboardFocus ? 'sr-only' : ''}>Arrastra el pastel para girarlo.</span>
            <span className={cake.keyboardFocus ? '' : 'sr-only'}>Usa las flechas izquierda y derecha para girarlo.</span>
          </p>
        </div>
        <HeroCake cake={cake} hintId={HINT_ID} onFocusEscape={focusLastAction} />
      </div>
    </Field>
  )
}
