import { useLayoutEffect, useRef } from 'react'
import { prefersReducedMotion } from './reducedMotion.ts'

const SHIFT = { duration: 250, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' } as const

/** El desplazamiento vertical que una animación en curso le pone al elemento (0 si no tiene). */
function currentShift(element: HTMLElement): number {
  const transform = getComputedStyle(element).transform
  return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42
}

/**
 * Cuando una lista pierde un renglón (quitar una línea del carrito, 22 de noviembre), los que quedan se recorren a su lugar en
 * 250 ms en lugar de saltar. El renglón que se va desaparece en el acto: el carrito, el aviso para el lector de pantalla y el
 * foco no esperan a nadie. Cada hijo de la lista lleva su llave en `data-linea`. Se mide `offsetTop`, que no cuenta el
 * `transform`, después de cada render; si el conjunto de llaves cambió, cada renglón que se movió arranca desde donde se veía
 * (su lugar de antes más lo que le faltaba de una animación anterior, que se cancela) y llega a `none`. Cambiar una cantidad
 * no cambia las llaves y no anima nada. Con "reducir movimiento", nada.
 */
export function useListShift<List extends HTMLElement>(keys: readonly string[]) {
  const list = useRef<List>(null)
  const tops = useRef(new Map<string, number>())
  const signature = useRef(keys.join('\n'))
  // Sin dependencias a propósito: se mide después de cada render, porque un renglón puede cambiar de alto sin cambiar las
  // llaves (el aviso de "Editar pedido") y la medida de antes debe ser la de justo antes de quitar.
  useLayoutEffect(() => {
    const element = list.current
    const next = keys.join('\n')
    const changed = next !== signature.current
    signature.current = next
    const previous = tops.current
    const measured = new Map<string, number>()
    if (!element) {
      tops.current = measured
      return
    }
    const animate = changed && !prefersReducedMotion()
    // Primero se lee todo y después se escribe, para no forzar el acomodo entre una línea y otra.
    const moves: { item: HTMLElement; offset: number }[] = []
    for (const item of Array.from(element.children)) {
      if (!(item instanceof HTMLElement) || !item.dataset.linea) continue
      const top = item.offsetTop
      measured.set(item.dataset.linea, top)
      const before = previous.get(item.dataset.linea)
      if (!animate || before === undefined) continue
      const offset = before - top + currentShift(item)
      if (Math.abs(offset) >= 1) moves.push({ item, offset })
    }
    tops.current = measured
    for (const { item, offset } of moves) {
      for (const running of item.getAnimations()) running.cancel()
      item.animate([{ transform: `translateY(${offset}px)` }, { transform: 'none' }], SHIFT)
    }
  })
  return list
}
