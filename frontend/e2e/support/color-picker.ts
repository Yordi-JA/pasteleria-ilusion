import { expect } from '@playwright/test'
import type { Locator } from '@playwright/test'

/** El selector libre de color (`ColorPicker`) dentro de un contenedor; con varios, el que se ve. */
export const colorPicker = (scope: Locator) => scope.getByTestId('selector-de-color')

/** Escribe un código en el campo del selector y espera a que la muestra lo tenga. */
export async function pickColor(scope: Locator, hex: string) {
  const picker = colorPicker(scope)
  await picker.getByLabel('Código del color').fill(hex)
  await expect(picker.getByTestId('codigo-de-color')).toHaveText(hex.toUpperCase())
}
