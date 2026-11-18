import { expect, test } from '@playwright/test'
import { mockStoreInfo } from './support/store-info.ts'

// La mermelada, la cajeta y el relieve del mensaje de la vista previa (tanda 4), sin dibujar la escena: no hay corredor de
// pruebas unitarias, así que los módulos se importan en el navegador desde el servidor de desarrollo, como en `spin-model.spec.ts`.
const FINISH = '/src/three/finish.ts'
const RELIEF = '/src/three/messageRelief.ts'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  // Una vista sin pastel 3D: solo cuenta lo que importan las pruebas.
  await page.goto('/legal')
})

type Stats = { mean: number; min: number; darkShare: number; spread: number; same: boolean }

/** Luminosidad de la textura de un acabado (0 a 1): promedio, mínimo, qué parte es oscura y cuánto varía. */
async function finishStats(page: import('@playwright/test').Page, finish: string): Promise<Stats> {
  return page.evaluate(
    async ({ url, finish }) => {
      const { drawFinish } = await import(url)
      const read = () => {
        const canvas: HTMLCanvasElement = drawFinish(finish)
        return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      }
      const data = read()
      const again = read()
      let [sum, min, dark, squares] = [0, 1, 0, 0]
      const count = data.length / 4
      for (let i = 0; i < data.length; i += 4) {
        const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
        sum += lum
        squares += lum * lum
        min = Math.min(min, lum)
        if (lum < 0.55) dark++
      }
      const mean = sum / count
      return { mean, min, darkShare: dark / count, spread: Math.sqrt(squares / count - mean * mean), same: data.every((v, i) => v === again[i]) }
    },
    { url: FINISH, finish },
  )
}

test('jam and cajeta are glossy, far shinier than a plain filling', async ({ page }) => {
  const looks = await page.evaluate(async (url) => (await import(url)).FINISH_LOOKS, FINISH)
  for (const finish of ['jam', 'caramel']) {
    expect(looks[finish].roughness, finish).toBeLessThan(0.4)
    expect(looks[finish].bumpScale, finish).toBeGreaterThan(0)
  }
  // La cajeta es más lisa que la mermelada: su relieve es más suave.
  expect(looks.caramel.bumpScale).toBeLessThan(looks.jam.bumpScale)
})

test('the gloss comes from a gray environment with one small bright window toward the light of the scene, made once', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { environmentLevel, finishEnvironment, GLOSS_WINDOW } = await import(url)
    const [x, y, z] = GLOSS_WINDOW
    const first = finishEnvironment()
    const data: Uint16Array = first.image.data
    const gray = Array.from({ length: data.length / 4 }, (_, i) => i * 4).every((i) => data[i] === data[i + 1] && data[i] === data[i + 2])
    return {
      window: [x, y, z],
      light: environmentLevel(x, y, z),
      opposite: environmentLevel(-x, -y, -z),
      back: environmentLevel(0, 0, -1),
      cached: finishEnvironment() === first,
      gray,
    }
  }, FINISH)
  // La ventana está a la izquierda y al frente, como la luz de la escena, y es mucho más clara que el resto.
  expect(result.window[0]).toBeLessThan(0)
  expect(result.window[1]).toBeGreaterThan(0)
  expect(result.window[2]).toBeGreaterThan(0)
  expect(result.light).toBeGreaterThan(3)
  expect(result.opposite).toBeLessThan(0.1)
  expect(result.back).toBeLessThan(0.1)
  expect(result.cached).toBe(true)
  // Luz gris, no un color: el color sigue siendo el del relleno.
  expect(result.gray).toBe(true)
})

test('the jam texture keeps the color from the admin and adds small dark seeds; the same every time', async ({ page }) => {
  const jam = await finishStats(page, 'jam')
  // Casi blanca: el color del relleno (que la multiplica) manda.
  expect(jam.mean).toBeGreaterThan(0.8)
  // Semillas y trocitos más oscuros, pocos.
  expect(jam.darkShare).toBeGreaterThan(0.004)
  expect(jam.darkShare).toBeLessThan(0.12)
  expect(jam.same).toBe(true)
})

test('the cajeta texture is smooth: soft variation of color, no seeds or chunks', async ({ page }) => {
  const caramel = await finishStats(page, 'caramel')
  expect(caramel.mean).toBeGreaterThan(0.85)
  expect(caramel.min).toBeGreaterThan(0.7)
  expect(caramel.darkShare).toBe(0)
  expect(caramel.spread).toBeGreaterThan(0.01)
  expect(caramel.same).toBe(true)
})

type Relief = {
  center: number[]
  lit: number[]
  shaded: number[]
  shadow: number[]
  far: number[]
  alphaKept: boolean
}

/**
 * Una barra horizontal de tinta, de 24 px de grueso, con el relieve aplicado: el color al centro, el canto del lado de la luz
 * (abajo a la izquierda, como la luz de la escena vista desde arriba), el del otro lado y la sombra que cae fuera de la tinta.
 */
async function bar(page: import('@playwright/test').Page, color: string): Promise<Relief> {
  return page.evaluate(
    async ({ url, color }) => {
      const { pipeRelief } = await import(url)
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 80
      const context = canvas.getContext('2d')!
      context.fillStyle = color
      context.fillRect(30, 28, 100, 24)
      const before = context.getImageData(0, 0, 160, 80)
      const alphas = Array.from(before.data.filter((_, i) => i % 4 === 3))
      const image = context.getImageData(0, 0, 160, 80)
      pipeRelief(image, 4)
      const at = (x: number, y: number) => Array.from(image.data.slice((y * 160 + x) * 4, (y * 160 + x) * 4 + 4))
      const inkAlphaKept = alphas.every((alpha, i) => alpha < 255 || image.data[i * 4 + 3] === 255)
      return { center: at(80, 40), lit: at(80, 50), shaded: at(80, 29), shadow: at(84, 25), far: at(5, 5), alphaKept: inkAlphaKept }
    },
    { url: RELIEF, color },
  )
}

const distance = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
const brightness = (p: number[]) => p[0] + p[1] + p[2]

test('the message reads as piped icing: the top keeps its color, one edge catches the light and the other falls in shade', async ({ page }) => {
  const RED = [0xd4, 0x4c, 0x48]
  const red = await bar(page, '#d44c48')
  // Lo plano de arriba conserva el color elegido (las pruebas de la tinta en la vista previa miden a menos de 60).
  expect(distance(red.center, RED)).toBeLessThan(25)
  expect(brightness(red.lit)).toBeGreaterThan(brightness(red.center) + 20)
  expect(brightness(red.shaded)).toBeLessThan(brightness(red.center) - 20)
  // La tinta no cambia de forma: donde es llena, el alfa se queda.
  expect(red.alphaKept).toBe(true)
  // Una sombra suave cae junto a las letras, del lado contrario a la luz, y no llega lejos.
  expect(red.shadow[3]).toBeGreaterThan(20)
  expect(red.shadow[3]).toBeLessThan(140)
  expect(brightness(red.shadow)).toBeLessThan(120)
  expect(red.far[3]).toBe(0)
})

test('black ink still shows its relief with a highlight', async ({ page }) => {
  const black = await bar(page, '#000000')
  expect(brightness(black.center)).toBeLessThan(40)
  expect(brightness(black.lit)).toBeGreaterThan(brightness(black.center) + 20)
})
