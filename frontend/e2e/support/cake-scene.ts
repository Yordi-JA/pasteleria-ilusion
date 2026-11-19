import type { Page } from '@playwright/test'

/**
 * Monta la escena del pastel (`src/three/CakeScene.tsx`) con una forma cualquiera en una caja fija de la página, para las pruebas
 * de lo que solo existe en la forma (la fruta de la tapa, que no se pide en "Diseña tu pastel"). Usa la misma copia de React
 * que la app: la URL optimizada de Vite sale del `main.tsx` que sirve el servidor de desarrollo.
 */
export type SceneView = { width: number; height: number; elevation: number; angle: number }

export async function mountCakeScene(page: Page, shape: unknown, view: SceneView, testId = 'escena-prueba') {
  await page.evaluate(
    async ({ shape, view, testId }) => {
      const main = await (await fetch('/src/main.tsx')).text()
      const dep = (name: string) => {
        const found = main.match(new RegExp(`"(/node_modules/\\.vite/deps/${name}\\.js\\?v=[^"]+)"`))
        if (!found) throw new Error(`No encontré ${name} en main.tsx`)
        return found[1]
      }
      // Los paquetes de CommonJS que optimiza Vite exportan todo en `default`.
      const reactModule = await import(/* @vite-ignore */ dep('react'))
      const clientModule = await import(/* @vite-ignore */ dep('react-dom_client'))
      const React = reactModule.createElement ? reactModule : reactModule.default
      const createRoot = clientModule.createRoot ?? clientModule.default.createRoot
      const sceneUrl = '/src/three/CakeScene.tsx'
      const { default: CakeScene } = await import(/* @vite-ignore */ sceneUrl)
      document.getElementById(testId)?.remove()
      const host = document.createElement('div')
      host.id = testId
      host.dataset.testid = testId
      Object.assign(host.style, { position: 'fixed', left: '0', top: '0', width: `${view.width}px`, height: `${view.height}px`, zIndex: '9999', background: '#ffffff' })
      document.body.append(host)
      createRoot(host).render(
        React.createElement(CakeScene, {
          shape,
          label: 'Pastel de prueba',
          reducedMotion: true,
          running: true,
          separateOnScroll: false,
          onReady: () => host.setAttribute('data-ready', 'true'),
          onContextLost: () => host.setAttribute('data-lost', 'true'),
          freeLook: true,
          viewpoint: { key: 'prueba', elevation: view.elevation, angle: view.angle, autoSpin: false },
        }),
      )
    },
    { shape, view, testId },
  )
  await page.waitForFunction((id) => document.getElementById(id)?.getAttribute('data-ready') === 'true', testId, { timeout: 20_000 })
  // La cámara de la vista libre se acomoda en unos cuadros (sin movimiento reducido no hay transición, pero el encuadre sí corre).
  await page.waitForFunction((id) => Number(document.querySelector(`#${id} [role="img"]`)?.getAttribute('data-frames') ?? 0) >= 2, testId, { timeout: 20_000 })
  await page.waitForTimeout(300)
  return page.getByTestId(testId)
}
