// Genera las imágenes fijas del modelo de los pasteles del catálogo (D86): abre `/muestra/modelo/<slug>` en Chromium (el de
// Playwright, que ya es dependencia), espera a que la escena dibuje y guarda `public/fotos/<archivo>` (WebP de 1200 px,
// transparente, con el encuadre de las fotos).
//
// Necesita el servidor de desarrollo (`npm run dev`, la ruta solo existe ahí) y Django con la base local (la muestra sale de la
// API). Uso, desde `frontend/`:
//
//   npm run render:modelos                      # los pasteles que muestran la imagen del modelo en el catálogo
//   npm run render:modelos -- tres-leches-de-fresa tres-leches-de-cajeta   # solo esos, aunque aún no se muestren
//   RENDER_BASE_URL=http://127.0.0.1:5191 npm run render:modelos           # otro servidor de desarrollo
//
// WebGL va por software (SwiftShader), como en las pruebas: la misma imagen en cualquier equipo.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const BASE_URL = (process.env.RENDER_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '')
const PHOTOS = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fotos')
// El mismo validador que `photo_file_validator` del backend: un nombre de archivo, nunca una ruta.
const FILE_NAME = /^[a-z0-9][a-z0-9-]*\.webp$/
const SLUG = /^[-a-zA-Z0-9_]+$/
const READY_TIMEOUT_MS = 120_000

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`)
  if (!response.ok) throw new Error(`${path} respondió ${response.status}.`)
  return response.json()
}

/** Los pasteles que se generan: los del catálogo con imagen del modelo o, si se nombran, esos. */
async function targets(slugs) {
  if (slugs.length === 0) {
    const cards = await getJson('/api/v1/products/')
    return cards.filter((card) => card.model_image).map((card) => ({ slug: card.slug, file: card.model_image }))
  }
  return Promise.all(
    slugs.map(async (slug) => {
      if (!SLUG.test(slug)) throw new Error(`«${slug}» no es el identificador de un producto.`)
      const detail = await getJson(`/api/v1/products/${slug}/`)
      return { slug, file: detail.sample_design?.model_image ?? `${slug}-modelo.webp` }
    }),
  )
}

async function render(page, { slug, file }) {
  if (!FILE_NAME.test(file)) throw new Error(`«${file}» no es un nombre de archivo WebP válido.`)
  await page.goto(`${BASE_URL}/muestra/modelo/${encodeURIComponent(slug)}`)
  const root = page.getByTestId('render-modelo')
  await root.and(page.locator('[data-state="ready"], [data-state="error"]')).waitFor({ timeout: READY_TIMEOUT_MS })
  if ((await root.getAttribute('data-state')) === 'error') {
    throw new Error(await page.getByRole('alert').innerText())
  }
  const url = await page.evaluate(() => window.__captureModel())
  const base64 = url.slice(url.indexOf(',') + 1)
  await writeFile(join(PHOTOS, file), Buffer.from(base64, 'base64'))
  return file
}

async function main() {
  const list = await targets(process.argv.slice(2))
  if (list.length === 0) {
    console.log('Ningún pastel muestra la imagen del modelo en el catálogo: no hay nada que generar.')
    return
  }
  await mkdir(PHOTOS, { recursive: true })
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } })
  let failed = 0
  try {
    for (const target of list) {
      try {
        const file = await render(page, target)
        console.log(`${target.slug}: public/fotos/${file}`)
      } catch (error) {
        failed += 1
        console.error(`${target.slug}: no se generó. ${error instanceof Error ? error.message : error}`)
      }
    }
  } finally {
    await browser.close()
  }
  console.log(`${list.length - failed} de ${list.length} imágenes generadas.`)
  if (failed > 0) process.exitCode = 1
}

await main()
