import { useCallback, useEffect, useRef, useState } from 'react'
import { compareMoney, getCakeDesignQuote } from '../models/cakeDesign.ts'
import type { BreadOption, CakeDesignOptions, CakeDesignPriceRequest, CakeDesignQuote, FillingBaseOption } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'

/** Espera tras el último cambio antes de pedir el precio: escribir "120" no pide tres precios. */
export const PRICE_DEBOUNCE_MS = 250

/** Lo que se pide al precio y, si es un estimado, con qué pan y relleno se calculó (para decirlo en pantalla). */
export type PricePlan = {
  request: CakeDesignPriceRequest
  /** Pan y base supuestos mientras no se eligen; `null` si ya se eligieron. */
  assumedBread: BreadOption | null
  assumedBase: FillingBaseOption | null
}

function cheapest<T>(items: T[], price: (item: T) => string | undefined): T | null {
  // Compara montos de la API para elegir el "Desde"; nunca calcula uno. En empate gana el primero (orden del admin).
  return items.reduce<T | null>((best, item) => {
    const amount = price(item)
    if (amount === undefined) return best
    const bestAmount = best === null ? undefined : price(best)
    return bestAmount === undefined || compareMoney(amount, bestAmount) < 0 ? item : best
  }, null)
}

/**
 * Qué precio pedir para lo elegido hasta ahora. El tamaño va en personas: la API calcula los kilos. Mientras falta el
 * tipo, el pan o el relleno, la API calcula un estimado "Desde": con el tipo y el pan más baratos que ofrece y el
 * precio general de la base más barata (`estimate`). `null` solo si las opciones no tienen con qué armar uno.
 */
export function planPrice(draft: CakeDesignDraft, design: DesignDerived, options: CakeDesignOptions): PricePlan | null {
  const fromPrice = (type: string) => (bread: BreadOption) => bread.pricePerKgFrom[type]
  const cakeType =
    design.cakeType?.value ??
    cheapest(options.cakeTypes, (type) => cheapest(options.breads, fromPrice(type.value))?.pricePerKgFrom[type.value])?.value
  if (!cakeType) return null
  const chosenBread = design.bread && !design.breadIssue ? design.bread : null
  const bread = chosenBread ?? cheapest(options.breads, fromPrice(cakeType))
  if (!bread) return null
  const base = { people: draft.people, cakeType, bread: bread.slug }
  const assumedBread = chosenBread ? null : bread
  if (bread.pricingMode === 'full_price_per_kg') {
    return { request: { ...base, fillingBase: null, fillingFlavors: [], estimate: false }, assumedBread, assumedBase: null }
  }
  if (chosenBread && design.valid[3] && design.base) {
    const request = { ...base, fillingBase: design.base.slug, fillingFlavors: design.flavors.map((f) => f.slug), estimate: false }
    return { request, assumedBread: null, assumedBase: null }
  }
  const chosenBase = design.base && !design.fillingIssue && design.base.pricePerKgByCakeType[cakeType] ? design.base : null
  const fillingBase = chosenBase ?? cheapest(options.fillingBases, (option) => option.pricePerKgByCakeType[cakeType])
  if (!fillingBase) return null
  return {
    request: { ...base, fillingBase: fillingBase.slug, fillingFlavors: [], estimate: true },
    assumedBread,
    assumedBase: chosenBase ? null : fillingBase,
  }
}

export type PriceState = {
  /**
   * El precio a la vista: el de la petición actual o, mientras llega, el anterior (`updating`). Nunca uno de una
   * petición que falló ni de cuando ya no hay nada que pedir.
   */
  quote: CakeDesignQuote | null
  /** Si el precio a la vista es un estimado ("Desde"). */
  estimate: boolean
  /** Hay una petición en curso o esperando el fin de los cambios; el precio a la vista es el anterior. */
  updating: boolean
  /** La petición actual falló: no hay precio vigente. */
  failed: boolean
}

/** Lo último que respondió la API y para qué petición e intento. */
export type Settled = { key: string | null; attempt: number; quote: CakeDesignQuote | null; estimate: boolean; failed: boolean }

const NOTHING: Settled = { key: null, attempt: 0, quote: null, estimate: false, failed: false }

/** La petición de ahora: `run` la lanza ya (sin esperar el fin de los cambios) y `done` se cumple al responder. */
type Pending = { key: string; run: () => void; done: Promise<Settled | null> }

/**
 * Precio de lo elegido, siempre del backend. Pide de nuevo cuando cambia la petición, después de
 * `PRICE_DEBOUNCE_MS` sin cambios; una petición vieja se cancela y su respuesta se ignora. Mientras llega el
 * nuevo, se ve el anterior con `updating`. Si falla, no queda ningún precio vigente (`failed`). `flush` lanza la
 * petición de ahora sin esperar y da su respuesta, para quien la necesita ya (por ejemplo, "Continuar" en el paso 1).
 */
export function useCakeDesignPrice(request: CakeDesignPriceRequest | null): PriceState & {
  retry: () => void
  flush: () => Promise<Settled | null>
} {
  const [settled, setSettled] = useState<Settled>(NOTHING)
  const [attempt, setAttempt] = useState(0)
  const pending = useRef<Pending | null>(null)
  // La petición se compara por valor (su JSON): el view-model la arma de nuevo en cada render.
  const key = request === null ? null : JSON.stringify(request)

  useEffect(() => {
    if (key === null) {
      pending.current = null
      return
    }
    const current = JSON.parse(key) as CakeDesignPriceRequest
    const controller = new AbortController()
    let finish: (result: Settled | null) => void = () => {}
    const done = new Promise<Settled | null>((resolve) => {
      finish = resolve
    })
    let started = false
    const run = () => {
      if (started) return
      started = true
      window.clearTimeout(timer)
      getCakeDesignQuote(current, controller.signal).then(
        (quote) => {
          const result = { key, attempt, quote, estimate: current.estimate, failed: false }
          if (!controller.signal.aborted) setSettled(result)
          finish(controller.signal.aborted ? null : result)
        },
        (error: unknown) => {
          if (controller.signal.aborted) return finish(null)
          console.warn('No se pudo calcular el precio de "Diseña tu pastel".', error)
          const result = { key, attempt, quote: null, estimate: false, failed: true }
          setSettled(result)
          finish(result)
        },
      )
    }
    const timer = window.setTimeout(run, PRICE_DEBOUNCE_MS)
    pending.current = { key, run, done }
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      // Quien esperaba esta petición sabe que ya no cuenta.
      finish(null)
    }
  }, [key, attempt])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  const flush = useCallback(async () => {
    const now = pending.current
    if (!now) return null
    now.run()
    return now.done
  }, [])
  if (key === null) return { ...NOTHING, updating: false, retry, flush }
  const updating = settled.key !== key || settled.attempt !== attempt
  const failed = !updating && settled.failed
  return { quote: failed ? null : settled.quote, estimate: settled.estimate, updating, failed, retry, flush }
}
