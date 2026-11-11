import { lazy, Suspense } from 'react'
import type { CakeSceneView } from '../viewmodels/useCakeScene.ts'
import SceneBoundary from './SceneBoundary.tsx'

// La misma escena de la portada, en su propio chunk (D48): three no frena el primer render de la pantalla.
const CakeScene = lazy(() => import('../three/CakeScene.tsx'))

/** Nombre de la escena para el lector de pantalla. No anuncia el 3D (libro de marca, "Redacción"). */
const SCENE_LABEL = 'Vista previa de tu pastel'

/** El dibujo de pisos de la marca (`assets/motivos/dibujo-pisos.svg`), en línea `mermelada-suave`. */
function PreviewDrawing() {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="h-20 w-20 stroke-mermelada-suave"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="16" y="34" width="32" height="18" rx="2" />
      <rect x="22" y="22" width="20" height="12" rx="2" />
      <path d="M16 36q4 4 8 0t8 0 8 0 8 0M22 24q2.5 3 5 0t5 0 5 0 5 0M32 22v-8M10 54h44" />
      <path d="M32 6c2 2.5 3 4 2 6-.5 1-1.5 1.5-2 1.5s-1.5-.5-2-1.5c-1-2 0-3.5 2-6z" />
    </svg>
  )
}

/**
 * Lugar de la vista previa en "Diseña tu pastel": mientras llega la escena, el dibujo con "Preparando la vista
 * previa…" (`CotizadorCargando`); sin WebGL o si la escena falla, solo el dibujo, sin prometer un pastel que no
 * llegará. La escena aparece en cuanto dibuja su primer cuadro, como en la portada.
 */
export default function DesignerCake({ scene, hintId }: { scene: CakeSceneView; hintId: string }) {
  const { observeBox, ...view } = scene
  const ready = view.status === 'ready'
  return (
    <div ref={observeBox} data-testid="vista-previa" data-state={view.status} className="relative h-full w-full">
      <div
        aria-hidden={ready}
        className={`absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center transition-opacity duration-150 motion-reduce:transition-none ${ready ? 'invisible opacity-0' : ''}`}
      >
        <PreviewDrawing />
        {view.status === 'loading' && (
          <>
            <p className="text-cuerpo font-semibold">Preparando la vista previa…</p>
            <p className="text-nota text-mermelada-suave">Puede tardar unos segundos.</p>
          </>
        )}
      </div>
      {view.status !== 'fallback' && view.shape.tiers.length > 0 && (
        <SceneBoundary onError={view.onChunkError}>
          <Suspense fallback={null}>
            <div
              inert={!ready}
              className={`absolute inset-0 transition-[opacity,transform,visibility] duration-[250ms] ease-entrada motion-reduce:transition-none ${ready ? '' : 'invisible scale-[0.97] opacity-0 motion-reduce:scale-100'}`}
            >
              <CakeScene
                shape={view.shape}
                label={SCENE_LABEL}
                describedBy={hintId}
                reducedMotion={view.reducedMotion}
                running={view.running}
                separateOnScroll={false}
                onReady={view.onReady}
                onContextLost={view.onContextLost}
                onKeyboardFocusChange={view.onKeyboardFocusChange}
                freeLook
              />
            </div>
          </Suspense>
        </SceneBoundary>
      )}
    </div>
  )
}
