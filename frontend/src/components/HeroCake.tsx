import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { HOME_CAKE_LABEL, HOME_CAKE_STILL } from '../viewmodels/homeCake.ts'
import type { SceneFraming } from '../three/CakeScene.tsx'
import type { HeroCakeView } from '../viewmodels/useHeroCake.ts'
import SceneBoundary from './SceneBoundary.tsx'

// La escena 3D va en su propio chunk: three y react-three-fiber no frenan el primer render de la portada.
const CakeScene = lazy(() => import('../three/CakeScene.tsx'))

/** El color de cada piso del dibujo fijo, como clase de Tailwind (los tokens que usan los pasteles). */
const TIER_FILL = { betun: 'fill-betun', 'fresa-claro': 'fill-fresa-claro' } as const
export type StillTierColor = keyof typeof TIER_FILL

/**
 * El pastel fijo: el dibujo de pisos de la marca (`assets/motivos/dibujo-pisos.svg`) con los colores del pastel 3D (por
 * omisión, los dos pisos en la crema `betun` del pastel de `homeCake.ts`) y su sombra de contacto. Se ve mientras llega la escena y
 * cuando no hay WebGL o se pierde el contexto. Es decorativo: el `h1` y el lema ya dicen de qué es la página.
 */
export function StaticCake({
  hidden = false,
  testId = 'pastel-portada-fijo',
  tiers = HOME_CAKE_STILL,
}: {
  hidden?: boolean
  testId?: string
  /** El color del piso de abajo y el de arriba: por omisión, los del pastel de la marca (`HOME_CAKE_STILL`). */
  tiers?: readonly [StillTierColor, StillTierColor]
}) {
  return (
    <div
      data-testid={testId}
      aria-hidden="true"
      className={`absolute inset-0 flex flex-col items-center justify-center transition-[opacity,visibility] duration-150 ease-entrada motion-reduce:transition-none ${hidden ? 'invisible opacity-0' : ''}`}
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
 * Alto de la caja: el de la portada, el de la escena chica del catálogo (`.escena.chica` del mockup) o, en la ficha (D95), una caja
 * del ancho de la foto del producto y un poco más baja (460/340 en vez de 360/300): un pastel o una tarta son más anchos que altos y,
 * en la caja de la foto, quedaban con una franja de aire encima. La foto de respaldo cabe adentro por su alto.
 */
const BOX_HEIGHT = {
  hero: 'h-[600px] max-[960px]:h-[460px] max-[600px]:h-[380px]',
  compact: 'h-[420px] max-[960px]:h-[360px] max-[600px]:h-[320px]',
  product: 'aspect-[460/340] w-full',
} as const

/**
 * Encuadre de la escena en cada caja. La portada usa el de `CakeScene` (sin encuadre propio). La escena chica de `/entrar` y
 * `/registro` (tanda 9) llena su caja: el pastel cabe en una caja del mockup de 500 × 440 px, a la escala de la portada, y la
 * charola queda al 76 % del alto (tanda 10), con lugar debajo para la sombra; la caja va arriba en su columna, así el pastel empieza justo bajo el texto. En una caja angosta (móvil, 320 px) manda el ancho y deja margen a los lados. Con el de la portada se veía chico y bajo, con aire arriba.
 */
const SCENE_FRAMING: Record<keyof typeof BOX_HEIGHT, SceneFraming | undefined> = {
  hero: undefined,
  compact: { plate: 0.76, width: 500, height: 440, scale: 0.88 },
  product: undefined,
}

/**
 * En la ficha (D95) cada producto mide otra cosa (un pastel de 25 cm, un vaso de 9 cm de alto, un flan sobre su charola): la escena
 * lo encuadra a lo que dibuja (`fitPlate`), tan grande como cabe, y lo apoya al 94 % del alto de la caja, sobre la sombra de la foto,
 * que cruza la guirnalda.
 */
const SCENE_FIT: Record<keyof typeof BOX_HEIGHT, number | undefined> = { hero: undefined, compact: undefined, product: 0.94 }

/**
 * El pastel fijo en la caja de la escena chica, sin 3D: para las vistas de acceso que el libro de marca no enumera en
 * "Presencia de marca" (recuperar y verificar, D76), con el mismo lugar, tamaño y colores que el pastel de `/entrar`.
 */
export function StaticCakeBox({ testId }: { testId: string }) {
  return (
    <div className={`relative ${BOX_HEIGHT.compact}`}>
      <StaticCake testId={testId} />
    </div>
  )
}

/**
 * Lugar del pastel de la marca: en la portada, con la altura de la escena del mockup (600 px, 460 px hasta 960 px de
 * ancho y 380 px en móvil); en `/entrar` y `/registro`, la de la escena chica (`size="compact"`, D59). La caja no cambia de tamaño: adentro, el pastel fijo cede su lugar a la escena 3D
 * (`src/three/CakeScene.tsx`, D48) en cuanto dibuja su primer cuadro. La escena entra en 250 ms (opacidad y escala
 * de 0.97 a 1, con la curva `ease-entrada`) y el pastel fijo sale en 150 ms; con "reducir movimiento", sin transición.
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
  /**
   * Lo que se ve mientras llega la escena y cuando no hay 3D, en lugar del dibujo fijo: en la ficha, la foto real del producto o su
   * hueco (D95). Sale como el dibujo fijo cuando la escena dibuja.
   */
  fallback?: ReactNode
}) {
  const { observeBox, ...scene } = cake
  const ready = scene.status === 'ready'
  return (
    <div ref={observeBox} data-testid={testId} data-state={scene.status} className={`relative ${BOX_HEIGHT[size]}`}>
      {fallback ? (
        <div
          data-testid={`${testId}-fijo`}
          className={`absolute inset-0 transition-[opacity,visibility] duration-150 ease-entrada motion-reduce:transition-none ${ready ? 'invisible opacity-0' : ''}`}
        >
          {fallback}
        </div>
      ) : (
        <StaticCake hidden={ready} testId={`${testId}-fijo`} tiers={stillTiers} />
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
