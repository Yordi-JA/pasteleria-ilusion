import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { HOME_CAKE_LABEL, HOME_CAKE_STILL } from '../viewmodels/homeCake.ts'
import type { SceneFraming } from '../three/CakeScene.tsx'
import type { HeroCakeView } from '../viewmodels/useHeroCake.ts'
import SceneBoundary from './SceneBoundary.tsx'
import Skeleton from './Skeleton.tsx'

// La escena 3D va en su propio chunk: three y react-three-fiber no frenan el primer render de la portada.
const CakeScene = lazy(() => import('../three/CakeScene.tsx'))

/** El color de cada piso del dibujo fijo, como clase de Tailwind (los tokens que usan los pasteles). */
const TIER_FILL = { betun: 'fill-betun', 'fresa-claro': 'fill-fresa-claro' } as const
export type StillTierColor = keyof typeof TIER_FILL

/**
 * El pastel fijo: el dibujo de pisos de la marca (`assets/motivos/dibujo-pisos.svg`) con los colores del pastel 3D (por
 * omisión, los dos pisos en la crema `betun` del pastel de `homeCake.ts`) y su sombra de contacto. Se ve cuando no hay WebGL 2, el
 * chunk de la escena falla o se pierde el contexto (mientras llega la escena, `HeroCake` muestra un esqueleto), y siempre en las
 * vistas de acceso sin 3D (`StaticCakeBox`). Es decorativo: el `h1` y el lema ya dicen de qué es la página.
 */
export function StaticCake({
  hidden = false,
  testId = 'pastel-portada-fijo',
  tiers = HOME_CAKE_STILL,
  bottom = false,
}: {
  hidden?: boolean
  testId?: string
  /** El color del piso de abajo y el de arriba: por omisión, los del pastel de la marca (`HOME_CAKE_STILL`). */
  tiers?: readonly [StillTierColor, StillTierColor]
  /** Apoyado en el borde de abajo de la caja, como el pastel 3D de la escena chica, en vez de al centro. */
  bottom?: boolean
}) {
  return (
    <div
      data-testid={testId}
      aria-hidden="true"
      className={`absolute inset-0 flex flex-col items-center ${bottom ? 'justify-end' : 'justify-center'} transition-[opacity,visibility] duration-150 ease-entrada motion-reduce:transition-none ${hidden ? 'invisible opacity-0' : ''}`}
    >
      <svg
        viewBox="8 4 48 52"
        className="block h-auto w-full max-w-[360px] max-[960px]:max-w-[300px] max-[600px]:max-w-[240px]"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* El trazo no escala con el dibujo: queda en 3 px a cualquier tamaño. */}
        <g className="stroke-mermelada" strokeWidth={3} vectorEffect="non-scaling-stroke">
          <rect x="16" y="34" width="32" height="18" rx="2" className={TIER_FILL[tiers[0]]} vectorEffect="non-scaling-stroke" />
          <rect x="22" y="22" width="20" height="12" rx="2" className={TIER_FILL[tiers[1]]} vectorEffect="non-scaling-stroke" />
          <path d="M16 36q4 4 8 0t8 0 8 0 8 0M22 24q2.5 3 5 0t5 0 5 0 5 0M10 54h44" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      {/* Sombra de contacto del libro de marca: 70% del ancho del pastel, `mermelada` al 16% con desenfoque de 12 px. */}
      <div className="-mt-2 h-6 w-[252px] rounded-[50%] bg-mermelada/[.16] blur-[12px] max-[960px]:w-[210px] max-[600px]:w-[168px]" />
    </div>
  )
}

/**
 * Alto de la caja: el de la portada, el de la escena chica de `/entrar` y `/registro` o, en la ficha (D95), una caja
 * del ancho de la foto del producto y un poco más baja (460/340 en vez de 360/300): un pastel o una tarta son más anchos que altos y,
 * en la caja de la foto, quedaban con una franja de aire encima. La foto de respaldo cabe adentro por su alto.
 */
const BOX_HEIGHT = {
  hero: 'h-[600px] max-[960px]:h-[460px] max-[600px]:h-[380px] [@media(min-width:961px)_and_(max-height:860px)]:h-[clamp(440px,calc(100svh-230px),600px)]',
  compact: 'aspect-[500/440] w-[min(100cqw,calc(100cqh*500/440))]',
  product: 'aspect-[460/340] w-full',
} as const

/*
 * En una pantalla de escritorio baja (hasta 860 px de alto), la caja de la portada mide lo que queda bajo la barra, entre 440 y
 * 600 px, para que el hero completo quepa a la vista (`HomeHero`).
 *
 * La escena chica (correcciones del 21 de noviembre) ya no tiene un alto fijo: es la caja de 500 × 440 más grande que cabe en
 * su lugar, que debe ser un contenedor de tamaño (`container-type: size`, ver `AccessLayout`). Así llena el espacio que la
 * tarjeta deja libre en la columna y queda apoyada en su borde de abajo, sin aire.
 */

/**
 * Encuadre de la escena en cada caja. La portada usa el de `CakeScene` (sin encuadre propio). La escena chica de `/entrar` y
 * `/registro` (tanda 9) llena su caja: el pastel cabe en una caja del mockup de 500 × 440 px. Desde las correcciones del 21 de
 * noviembre la charola va al 83 % del alto y la escala sube a 0.96: la sombra de contacto termina en el borde de abajo de la caja
 * y la rosa más alta casi toca el de arriba (con la charola al 76 % quedaban unos 40 px vacíos abajo).
 */
const SCENE_FRAMING: Record<keyof typeof BOX_HEIGHT, SceneFraming | undefined> = {
  hero: undefined,
  compact: { plate: 0.82, width: 500, height: 440, scale: 0.96 },
  product: undefined,
}

/**
 * En la ficha (D95) cada producto mide otra cosa (un pastel de 25 cm, un vaso de 9 cm de alto, un flan sobre su charola): la escena
 * lo encuadra a lo que dibuja (`fitPlate`), tan grande como cabe, y lo apoya al 88 % del alto de la caja (20 de noviembre: al 94 % el
 * pastel se veía bajo, casi sobre la guirnalda), con su sombra de contacto debajo, dentro de la caja. Los vasos llevan su propio
 * encuadre (`dessertView`).
 */
const SCENE_FIT: Record<keyof typeof BOX_HEIGHT, number | undefined> = { hero: undefined, compact: undefined, product: 0.88 }

/**
 * El pastel fijo en la caja de la escena chica, sin 3D: para las vistas de acceso que el libro de marca no enumera en
 * "Presencia de marca" (recuperar y verificar, D76), con el mismo lugar, tamaño y colores que el pastel de `/entrar`.
 */
export function StaticCakeBox({ testId }: { testId: string }) {
  return (
    <div className={`relative ${BOX_HEIGHT.compact}`}>
      <StaticCake testId={testId} bottom />
    </div>
  )
}

/**
 * Lugar del pastel de la marca: en la portada, con la altura de la escena del mockup (600 px, 460 px hasta 960 px de
 * ancho y 380 px en móvil); en `/entrar` y `/registro`, la de la escena chica (`size="compact"`, D59). La caja no cambia de tamaño.
 *
 * Mientras llega la escena 3D (`src/three/CakeScene.tsx`, D48), la caja muestra un esqueleto de carga de su tamaño, con `aria-busy`
 * (22 de noviembre; antes, el pastel fijo o la foto, que parecían la escena sin moverse). En cuanto la escena dibuja su primer
 * cuadro, entra en 250 ms (opacidad y escala de 0.97 a 1, con la curva `ease-entrada`) y el esqueleto sale en 150 ms. El respaldo
 * (el pastel fijo o `fallback`) solo aparece cuando la escena no puede dibujarse: sin WebGL 2 (desde el principio, sin esqueleto),
 * si el chunk falla o si se pierde el contexto, y también si la escena tarda más de `SLOW_SCENE_MS` (un chunk que no resuelve ni
 * falla), así que el esqueleto nunca se queda. En ese último caso la escena sigue montada: si llega tarde, entra con su transición
 * encima del respaldo. Con "reducir movimiento", sin transición y el esqueleto sin brillo.
 */
export default function HeroCake({
  cake,
  hintId,
  onFocusEscape,
  size = 'hero',
  testId = 'pastel-portada',
  onColor = false,
  label = HOME_CAKE_LABEL,
  stillTiers = HOME_CAKE_STILL,
  fallback,
}: {
  cake: HeroCakeView
  /** `id` de la pista de cómo girarlo, que describe la escena. */
  hintId: string
  /** A dónde va el foco si la escena lo tenía y desaparece. */
  onFocusEscape: () => void
  size?: keyof typeof BOX_HEIGHT
  /** Para las pruebas; el pastel fijo lleva el mismo con `-fijo`. */
  testId?: string
  /** Sobre un campo `mermelada`: el anillo de foco de la escena va en `betun`. */
  onColor?: boolean
  /** Nombre accesible de la escena: por omisión, el del pastel de la marca ("Pastel de dos pisos"). */
  label?: string
  /** Los colores de los pisos del dibujo fijo, para que coincida con el pastel 3D: por omisión, los del pastel de la marca. */
  stillTiers?: readonly [StillTierColor, StillTierColor]
  /** El respaldo cuando no hay 3D, en lugar del dibujo fijo: en la ficha, la foto recortada del producto o su hueco (D95). */
  fallback?: ReactNode
}) {
  const { observeBox, ...scene } = cake
  const ready = scene.status === 'ready'
  // Tras `SLOW_SCENE_MS` cargando (un chunk colgado), el esqueleto cede al respaldo; la escena sigue montada por si llega.
  const loading = scene.status === 'loading' && !scene.slow
  const still = scene.status === 'fallback' || scene.slow
  return (
    <div ref={observeBox} data-testid={testId} data-state={scene.status} aria-busy={loading || undefined} className={`relative ${BOX_HEIGHT[size]}`}>
      <div
        data-testid={`${testId}-cargando`}
        aria-hidden="true"
        className={`absolute inset-0 transition-[opacity,visibility] duration-150 ease-entrada motion-reduce:transition-none ${loading ? '' : 'invisible opacity-0'}`}
      >
        <Skeleton tone={onColor ? 'mermelada' : 'fresa'} radius="md" className="h-full w-full" />
      </div>
      {fallback ? (
        <div
          data-testid={`${testId}-fijo`}
          className={`absolute inset-0 transition-[opacity,visibility] duration-150 ease-entrada motion-reduce:transition-none ${still ? '' : 'invisible opacity-0'}`}
        >
          {fallback}
        </div>
      ) : (
        <StaticCake hidden={!still} testId={`${testId}-fijo`} tiers={stillTiers} bottom={size === 'compact'} />
      )}
      {scene.status !== 'fallback' && (
        <SceneBoundary onError={scene.onChunkError}>
          <Suspense fallback={null}>
            <div
              inert={!ready}
              className={`absolute inset-0 transition-[opacity,transform,visibility] duration-[250ms] ease-entrada motion-reduce:transition-none ${ready ? '' : 'invisible scale-[0.97] opacity-0 motion-reduce:scale-100'}`}
            >
              <CakeScene
                shape={scene.shape}
                framing={SCENE_FRAMING[size]}
                fitPlate={SCENE_FIT[size]}
                label={label}
                describedBy={hintId}
                reducedMotion={scene.reducedMotion}
                running={scene.running}
                onColor={onColor}
                onReady={scene.onReady}
                onContextLost={scene.onContextLost}
                onKeyboardFocusChange={scene.onKeyboardFocusChange}
                onFocusEscape={onFocusEscape}
              />
            </div>
          </Suspense>
        </SceneBoundary>
      )}
    </div>
  )
}
