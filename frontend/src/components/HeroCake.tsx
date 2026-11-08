import { lazy, Suspense } from 'react'
import type { HeroCakeView } from '../viewmodels/useHeroCake.ts'
import SceneBoundary from './SceneBoundary.tsx'

// La escena 3D va en su propio chunk: three y react-three-fiber no frenan el primer render de la portada.
const CakeScene = lazy(() => import('../three/CakeScene.tsx'))

const SCENE_LABEL = 'Pastel de tres pisos'

/**
 * El pastel fijo: el dibujo de pisos de la marca (`assets/motivos/dibujo-pisos.svg`) con los colores del pastel 3D
 * (pisos `betun` y `fresa-claro`, flama `frambuesa`) y su sombra de contacto. Se ve mientras llega la escena y
 * cuando no hay WebGL o se pierde el contexto. Es decorativo: el `h1` y el lema ya dicen de qué es la página.
 */
function StaticCake({ hidden }: { hidden: boolean }) {
  return (
    <div
      data-testid="pastel-portada-fijo"
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
          <rect x="16" y="34" width="32" height="18" rx="2" className="fill-betun" vectorEffect="non-scaling-stroke" />
          <rect x="22" y="22" width="20" height="12" rx="2" className="fill-fresa-claro" vectorEffect="non-scaling-stroke" />
          <path d="M16 36q4 4 8 0t8 0 8 0 8 0M22 24q2.5 3 5 0t5 0 5 0 5 0M32 22v-8M10 54h44" vectorEffect="non-scaling-stroke" />
          <path
            d="M32 6c2 2.5 3 4 2 6-.5 1-1.5 1.5-2 1.5s-1.5-.5-2-1.5c-1-2 0-3.5 2-6z"
            className="fill-frambuesa"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      {/* Sombra de contacto del libro de marca: 70% del ancho del pastel, `mermelada` al 16% con desenfoque de 12 px. */}
      <div className="-mt-2 h-6 w-[252px] rounded-[50%] bg-mermelada/[.16] blur-[12px] max-[960px]:w-[210px] max-[600px]:w-[168px]" />
    </div>
  )
}

/**
 * Lugar del pastel de la portada, con la altura de la escena del mockup (600 px, 460 px hasta 960 px de ancho y
 * 380 px en móvil). La caja no cambia de tamaño: adentro, el pastel fijo cede su lugar a la escena 3D
 * (`src/three/CakeScene.tsx`, D48) en cuanto dibuja su primer cuadro. La escena entra en 250 ms (opacidad y escala
 * de 0.97 a 1, con la curva `ease-entrada`) y el pastel fijo sale en 150 ms; con "reducir movimiento", sin transición.
 */
export default function HeroCake({
  cake,
  hintId,
  onFocusEscape,
}: {
  cake: HeroCakeView
  /** `id` de la pista de cómo girarlo, que describe la escena. */
  hintId: string
  /** A dónde va el foco si la escena lo tenía y desaparece. */
  onFocusEscape: () => void
}) {
  const { observeBox, ...scene } = cake
  const ready = scene.status === 'ready'
  return (
    <div
      ref={observeBox}
      data-testid="pastel-portada"
      data-state={scene.status}
      className="relative h-[600px] max-[960px]:h-[460px] max-[600px]:h-[380px]"
    >
      <StaticCake hidden={ready} />
      {scene.status !== 'fallback' && (
        <SceneBoundary onError={scene.onChunkError}>
          <Suspense fallback={null}>
            <div
              inert={!ready}
              className={`absolute inset-0 transition-[opacity,transform,visibility] duration-[250ms] ease-entrada motion-reduce:transition-none ${ready ? '' : 'invisible scale-[0.97] opacity-0 motion-reduce:scale-100'}`}
            >
              <CakeScene
                shape={scene.shape}
                label={SCENE_LABEL}
                describedBy={hintId}
                reducedMotion={scene.reducedMotion}
                running={scene.running}
                separateOnScroll
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
