// Comprime con brotli y gzip lo que `vite build` dejó en dist/, junto a cada original (`app.js.br`, `app.js.gz`).
// WhiteNoise detecta esas variantes al arrancar y responde la que acepta el navegador (Accept-Encoding), con
// `Vary: Accept-Encoding`. Usa solo node:zlib, sin dependencias de npm. Se puede correr suelto sobre un dist/ ya
// comprimido: una variante que ya no sirve se borra.
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompress, constants, gzip } from 'node:zlib'

const brotli = promisify(brotliCompress)
const gz = promisify(gzip)

const DIST = fileURLToPath(new URL('../dist', import.meta.url))
// Solo formatos de texto que WhiteNoise sirve: las fuentes woff2 y los PNG ya vienen comprimidos, y `index.html`
// lo entrega siempre `spa_index` sin comprimir.
const COMPRESSIBLE = new Set(['.js', '.css', '.svg', '.ico', '.txt', '.json', '.webmanifest', '.xml'])
// Debajo de este tamaño el ahorro no compensa el encabezado extra.
const MIN_BYTES = 1024

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

let variants = 0
let originalBytes = 0
let compressedBytes = 0
for await (const path of walk(DIST)) {
  if (!COMPRESSIBLE.has(extname(path)) || (await stat(path)).size < MIN_BYTES) continue
  const source = await readFile(path)
  const results = [
    ['.br', await brotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY } })],
    ['.gz', await gz(source, { level: 9 })],
  ]
  for (const [suffix, data] of results) {
    if (data.length < source.length) {
      await writeFile(path + suffix, data)
      variants += 1
      originalBytes += source.length
      compressedBytes += data.length
    } else {
      // Una variante que no es más chica no sirve (WhiteNoise la descartaría); no deja una vieja desfasada.
      await rm(path + suffix, { force: true })
    }
  }
}
console.log(`compress-dist: ${variants} variantes escritas (${originalBytes} bytes de originales a ${compressedBytes})`)
