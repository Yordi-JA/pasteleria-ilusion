import { expect } from '@playwright/test'
import type { Locator } from '@playwright/test'

/** El selector libre de color (`ColorPicker`) dentro de un contenedor; con varios, el que se ve. */
export const colorPicker = (scope: Locator) => scope.getByTestId('selector-de-color')

/** El código que tiene la muestra del selector (`data-color`): la interfaz ya no lo escribe en pantalla (tanda 1). */
export const swatchColor = (scope: Locator) => colorPicker(scope).getByTestId('muestra-de-color')

/** El tono, la intensidad y la claridad enteros más cercanos a un código: las barras se mueven de uno en uno. */
function barsFor(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

/** Lleva una barra a `value`: un clic donde queda el valor (la perilla mide 32 px) y las flechas para el último ajuste. */
async function setBar(slider: Locator, value: number) {
  const max = Number(await slider.getAttribute('aria-valuemax'))
  const box = (await slider.boundingBox())!
  await slider.click({ position: { x: 16 + ((box.width - 32) * value) / max, y: box.height / 2 } })
  let now = Number(await slider.getAttribute('aria-valuenow'))
  while (now !== value) {
    await slider.press(now < value ? 'ArrowRight' : 'ArrowLeft')
    now += now < value ? 1 : -1
  }
  await expect(slider).toHaveAttribute('aria-valuenow', String(value))
}

/**
 * Elige con las barras el color más cercano a `hex` (ya no hay campo para escribir el código, tanda 1) y devuelve el código
 * que quedó, en minúsculas: puede diferir del pedido en un dígito, porque las barras van de uno en uno.
 */
export async function pickColor(scope: Locator, hex: string): Promise<string> {
  const picker = colorPicker(scope)
  const { h, s, l } = barsFor(hex.toLowerCase())
  await setBar(picker.getByRole('slider', { name: 'Tono' }), h)
  await setBar(picker.getByRole('slider', { name: 'Intensidad' }), s)
  await setBar(picker.getByRole('slider', { name: 'Claridad' }), l)
  const chosen = await swatchColor(scope).getAttribute('data-color')
  if (!chosen) throw new Error('La muestra no dice su color.')
  return chosen
}
