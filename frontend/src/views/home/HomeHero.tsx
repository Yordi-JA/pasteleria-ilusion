import { ArrowsLeftRight } from '@phosphor-icons/react'
import { useRef } from 'react'
import logo from '../../../../assets/logos/ilusion-logo.svg'
import ButtonLink from '../../components/ButtonLink.tsx'
import HeroCake from '../../components/HeroCake.tsx'
import { ORDER_LINK } from '../../components/navigation.ts'
import { HOME_CAKE, HOME_CAKE_LABEL, HOME_CAKE_STILL } from '../../viewmodels/homeCake.ts'
import { useHeroLogoRef } from '../../viewmodels/useBarLogo.ts'
import { useHeroCake } from '../../viewmodels/useHeroCake.ts'
import { useHeroEntrance } from '../../viewmodels/useHeroEntrance.ts'
import { Field } from './sectionLayout.tsx'

const HINT_ID = 'pastel-pista'

/*
 * En una pantalla de escritorio baja (más de 960 px de ancho y hasta 860 px de alto, como una laptop de 1366-1536 × 720-800), el
 * hero completo, con sus dos botones y la pista, cabe bajo la barra (correcciones del 21 de noviembre): 16 px de aire arriba en
 * vez de 32, 16 px entre las piezas en vez de 24, el logotipo hasta 500 px de ancho en vez de 640 y el pastel a lo que queda de
 * alto (`HeroCake`, `BOX_HEIGHT.hero`). Las clases van completas para que Tailwind las encuentre; en pantallas más altas y en el
 * teléfono nada cambia.
 */

/**
 * La entrada del hero (tanda 7, D90): 450 ms cada pieza, 60 ms de escalón, con la curva `entrada` (`tailwind.config.cjs`). El
 * pastel entra con la frase, a la par del texto. Solo con `motion-safe:`: con "reducir movimiento" no hay ninguna.
 */
const ENTRANCE = {
  logo: 'motion-safe:animate-home-entrada',
  motto: 'motion-safe:animate-home-entrada [--entrada-retraso:60ms]',
  text: 'motion-safe:animate-home-entrada [--entrada-retraso:120ms]',
  cake: 'motion-safe:animate-home-entrada [--entrada-retraso:120ms]',
  order: 'motion-safe:animate-home-entrada [--entrada-retraso:180ms]',
  showcase: 'motion-safe:animate-home-entrada [--entrada-retraso:240ms]',
} as const

/**
 * Hero de la portada sobre `fresa` (Main.dc.html): el logotipo grande como `h1`, el lema, la frase y las dos
 * acciones, con el pastel a la derecha (abajo en móvil). En móvil el logotipo grande se oculta, como en el
 * mockup: el de la barra ya está a la vista y el `h1` sigue para el lector de pantalla. La pista "Arrastra el
 * pastel para girarlo." guarda su lugar invisible hasta que la escena 3D se dibuja, para no mover la columna ni
 * prometer un gesto que el pastel fijo no tiene; en móvil se oculta, como en el mockup. Describe la escena
 * (`aria-describedby`) con sus dos frases; con el foco del teclado en la escena, la visible es la de las flechas.
 *
 * El pastel es el de dos pisos de `homeCake.ts` (tanda 6): cobertura peinada y una decoración del diseñador; su dibujo fijo lleva
 * los mismos colores. El logotipo grande se registra en el marco (`useHeroLogoRef`): mientras se ve, la barra no muestra el suyo,
 * y en escritorio es el que viaja a la barra al bajar (D90). Al cargar la página, el hero entra en escalón una sola vez.
 */
export default function HomeHero() {
  const cake = useHeroCake({ shape: HOME_CAKE })
  const heroLogo = useHeroLogoRef()
  const entering = useHeroEntrance()
  const enter = (piece: keyof typeof ENTRANCE) => (entering ? ENTRANCE[piece] : '')
  const actions = useRef<HTMLDivElement>(null)
  // Si la escena con foco desaparece (se perdió el contexto), el foco pasa a "Ver la vitrina", no a `<body>`.
  const focusLastAction = () => actions.current?.querySelector<HTMLElement>('a:last-of-type')?.focus()
  return (
    <Field field="fresa" labelledBy="portada-titulo" className="bg-fresa">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-6 px-6 pb-6 pt-8 max-[960px]:grid-cols-1 max-[600px]:px-4 [@media(min-width:961px)_and_(max-height:860px)]:pt-4">
        <div className="flex flex-col gap-6 [@media(min-width:961px)_and_(max-height:860px)]:gap-4">
          <h1 id="portada-titulo" className="-ml-2 leading-none max-[600px]:sr-only">
            <img ref={heroLogo} src={logo} alt="" width={565} height={247} className={`block h-auto w-full max-w-[640px] max-[600px]:hidden [@media(min-width:961px)_and_(max-height:860px)]:max-w-[500px] ${enter('logo')}`} />
            <span className="sr-only">Pastelería Ilusión</span>
          </h1>
          <p className={`font-display text-titulo-1 text-mermelada ${enter('motto')}`}>Pide un deseo. Del pastel nos encargamos.</p>
          <p className={`max-w-[520px] text-cuerpo text-mermelada-suave ${enter('text')}`}>
            Pasteles artesanales para bodas, XV años y cumpleaños, y postres del día, hechos por una pastelería familiar.
          </p>
          <div ref={actions} className="flex flex-wrap items-center gap-4">
            <ButtonLink to={ORDER_LINK.to} className={enter('order')}>
              {ORDER_LINK.label}
            </ButtonLink>
            <ButtonLink to="/vitrina" variant="secondary" className={enter('showcase')}>
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
        <div data-testid="pastel-portada-entrada" className={enter('cake')}>
          <HeroCake
            cake={cake}
            hintId={HINT_ID}
            onFocusEscape={focusLastAction}
            label={HOME_CAKE_LABEL}
            stillTiers={HOME_CAKE_STILL}
          />
        </div>
      </div>
    </Field>
  )
}
