import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'
import { useCakeRender } from '../viewmodels/useCakeRender.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

// La escena va en su propio chunk, como en el resto del sitio (D48).
const CakeStill = lazy(() => import('../three/CakeStill.tsx'))

/**
 * La imagen fija del modelo de un pastel (D86), para `frontend/scripts/render-models.mjs`. Solo existe en desarrollo (ver
 * `App.tsx`), fuera del marco del sitio, sin enlaces que lleven a ella y con `noindex`: es una herramienta, no una pantalla. El
 * lienzo mide 1200 px por lado y es transparente, como las fotos de `public/fotos/`.
 */
export default function CakeRender() {
  const { slug = '' } = useParams()
  const view = useCakeRender(slug)
  usePageTitle('Imagen del modelo')
  return (
    <main
      data-testid="render-modelo"
      data-state={view.status}
      data-coverage={view.probe?.coverage}
      data-combed={view.probe?.combed}
      data-fruit={view.probe?.fruit}
      data-decoration={view.probe?.decoration}
      data-board={view.probe?.board}
      data-details={view.probe?.details}
      data-edge-size={view.probe?.edgeSize}
      data-fruit-density={view.probe?.fruitDensity}
      data-sprinkle-density={view.probe?.sprinkleDensity}
      className="font-sans text-cuerpo text-mermelada"
    >
      <meta name="robots" content="noindex, nofollow" />
      <h1 className="sr-only">Imagen del modelo de {slug}</h1>
      {view.error && (
        <p role="alert" className="p-6">
          {view.error}
        </p>
      )}
      <div className="h-[1200px] w-[1200px]">
        {view.shape && (
          <Suspense fallback={null}>
            <CakeStill shape={view.shape} onReady={view.onReady} onCapture={view.onCapture} />
          </Suspense>
        )}
      </div>
    </main>
  )
}
