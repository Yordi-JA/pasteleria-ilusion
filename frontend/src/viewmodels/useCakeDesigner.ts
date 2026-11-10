import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { getCakeDesignOptions } from '../models/cakeDesign.ts'
import type { CakeDesignOptions, CakeDesignQuote } from '../models/cakeDesign.ts'
import { MAX_PEOPLE_INPUT, readDraft, writeDraft } from '../models/cakeDesignDraft.ts'
import type { CakeDesignDraft, CakeForm } from '../models/cakeDesignDraft.ts'
import type { CakeShape } from '../three/cakeShape.ts'
import { designPreview } from './cakeDesignPreview.ts'
import {
  choosableFlavors,
  confirmStep,
  deriveDesign,
  firstIncompleteStep,
  isSkipped,
  LAST_BUILT_STEP,
  missingChoice,
  nextStep,
  previousStep,
  STEP_COUNT,
  stepAfter,
  tierLimitSentence,
} from './cakeDesignSteps.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'
import { designerView } from './cakeDesignSummary.ts'
import { planPrice, useCakeDesignPrice } from './useCakeDesignPrice.ts'
import { useCakeScene } from './useCakeScene.ts'
import { useRemoteData } from './useRemoteData.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** El paso pedido en `?paso=N`; sin número válido, el 1. */
function requestedStep(value: string | null): number {
  const step = Number(value)
  return Number.isInteger(step) && step >= 1 && step <= STEP_COUNT ? step : 1
}

/** El paso que de verdad se muestra: nunca uno al que todavía no se llega ni el relleno incluido. */
function allowedStep(requested: number, design: DesignDerived, draft: CakeDesignDraft): number {
  const step = Math.min(requested, firstIncompleteStep(design, draft))
  return isSkipped(step, design) ? nextStep(step, design) : step
}

const OPTIONS_FAILURE = 'No se pudieron cargar las opciones de "Diseña tu pastel".'

/** Los campos que `confirmStep` cambió, para aplicarlos sobre el borrador más reciente. */
function diffOf(before: CakeDesignDraft, after: CakeDesignDraft): Partial<CakeDesignDraft> {
  return Object.fromEntries(
    (Object.keys(after) as (keyof CakeDesignDraft)[])
      .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      .map((field) => [field, after[field]]),
  ) as Partial<CakeDesignDraft>
}

/** Mientras llegan las opciones no hay pastel que dibujar; la escena no se monta hasta tenerlas. */
const EMPTY_SHAPE: CakeShape = { tiers: [], festoons: false, stand: true, candle: false }

/**
 * View-model de "Diseña tu pastel" (`/pedido/disena`). El paso actual va en la URL (`?paso=N`), así atrás y adelante
 * del navegador recorren los pasos; el borrador va en `sessionStorage`, así recargar no borra el avance. Un paso al
 * que todavía no se llega lleva al primero sin completar. Los kilos y el precio vienen de la API. El estado es de esta
 * pantalla: no hay un almacén global. La lógica pura vive en `cakeDesignSteps.ts` y `cakeDesignSummary.ts`.
 */
export function useCakeDesigner() {
  const { state: optionsState, retry: retryOptions } = useRemoteData(getCakeDesignOptions, OPTIONS_FAILURE)
  const options: CakeDesignOptions | null = optionsState.status === 'ready' ? optionsState.data : null
  const [draft, setDraft] = useState<CakeDesignDraft>(readDraft)
  const [peopleText, setPeopleText] = useState(() => String(draft.people))
  const [stepError, setStepError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const store = useStoreDetails()

  useEffect(() => {
    writeDraft(draft)
  }, [draft])

  // El precio (y los kilos) se piden con lo elegido; el tamaño que responde la API alimenta el diseño. El plan solo
  // lee lo que no depende del tamaño, así que se arma con un diseño sin él.
  const sizeless = useMemo(() => (options ? deriveDesign(draft, options, null) : null), [draft, options])
  const plan = useMemo(() => (sizeless && options ? planPrice(draft, sizeless, options) : null), [draft, options, sizeless])

  // Regla 3.3 (D50): si los kilos que llegan ya no permiten los pisos elegidos, bajan solos al máximo permitido y se
  // avisa ("Con 10 kg el pastel va de 1 piso."). Se decide con el borrador más reciente, no con el del render.
  const latestDraft = useRef(draft)
  useEffect(() => {
    latestDraft.current = draft
  }, [draft])
  const [tierNotice, setTierNotice] = useState<string | null>(null)
  const onQuote = useCallback((quote: CakeDesignQuote) => {
    const size = quote.size
    const now = latestDraft.current
    if (!size || size.people !== now.people || now.tiers <= size.maxTiers) return
    setDraft((d) => (d.people === size.people && d.tiers > size.maxTiers ? { ...d, tiers: size.maxTiers } : d))
    setTierNotice(tierLimitSentence(size.kg, size.maxTiers))
  }, [])
  const price = useCakeDesignPrice(plan?.request ?? null, onQuote)
  const apiSize = price.quote?.size ?? null
  const design = useMemo(() => (options ? deriveDesign(draft, options, apiSize) : null), [apiSize, draft, options])

  const requested = requestedStep(searchParams.get('paso'))
  const current = design ? allowedStep(requested, design, draft) : requested

  // Una URL con un paso al que no se llega (o el relleno incluido) se corrige sin agregar otra entrada al historial.
  useEffect(() => {
    if (design && String(current) !== searchParams.get('paso')) {
      setSearchParams({ paso: String(current) }, { replace: true })
    }
  }, [current, design, searchParams, setSearchParams])

  // Al cambiar de paso, el foco va al título del paso nuevo (libro de marca); la tarjeta entra desde la derecha al
  // avanzar y desde la izquierda al regresar.
  const stepTitle = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef<number | null>(null)
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null)
  useLayoutEffect(() => {
    if (!design) return
    const previous = shownStep.current
    shownStep.current = current
    if (previous === null || previous === current) return
    setDirection(current > previous ? 'forward' : 'back')
    setStepError(null)
    stepTitle.current?.focus({ preventScroll: true })
    stepTitle.current?.scrollIntoView?.({ block: 'nearest' })
  }, [current, design])

  const update = useCallback((change: (draft: CakeDesignDraft) => CakeDesignDraft) => {
    setStepError(null)
    setDraft(change)
  }, [])

  // --- Paso 1 ---
  const setPeople = useCallback(
    (people: number) => {
      const value = Math.min(Math.max(Math.round(people), 1), MAX_PEOPLE_INPUT)
      setPeopleText(String(value))
      // El aviso de pisos habla de las personas de antes: con otras personas, ya no vale.
      setTierNotice(null)
      update((d) => ({ ...d, people: value }))
    },
    [update],
  )
  const typePeople = useCallback(
    (text: string) => {
      const digits = text.replace(/\D/g, '').slice(0, String(MAX_PEOPLE_INPUT).length)
      setPeopleText(digits)
      const value = Number(digits)
      if (digits && value >= 1) {
        setTierNotice(null)
        update((d) => ({ ...d, people: Math.min(value, MAX_PEOPLE_INPUT) }))
      }
    },
    [update],
  )
  const settlePeople = useCallback(() => setPeopleText(String(draft.people)), [draft.people])
  const setForm = useCallback((form: CakeForm) => update((d) => ({ ...d, form })), [update])
  const setTiers = useCallback(
    (tiers: number) => {
      setTierNotice(null)
      update((d) => ({ ...d, tiers }))
    },
    [update],
  )

  // --- Pasos 2 a 5 ---
  const setCakeType = useCallback((cakeType: string) => update((d) => ({ ...d, cakeType })), [update])
  const setBread = useCallback((bread: string) => update((d) => ({ ...d, bread })), [update])
  const baseOf = useCallback((d: CakeDesignDraft) => options?.fillingBases.find((option) => option.slug === d.fillingBase) ?? null, [options])
  const setFillingBase = useCallback(
    (slug: string) => {
      const base = options?.fillingBases.find((option) => option.slug === slug)
      if (!base) return
      update((d) => {
        const offered = d.flavors.filter((flavor) => base.flavors.some((option) => option.slug === flavor))
        const flavorCount = base.maxFlavors >= 2 ? d.flavorCount : 1
        return { ...d, fillingBase: slug, flavorCount, flavors: offered.slice(0, flavorCount) }
      })
    },
    [options, update],
  )
  const setFlavorCount = useCallback(
    (flavorCount: 1 | 2) =>
      update((d) => {
        const base = baseOf(d)
        const chosen = base?.flavors.filter((flavor) => d.flavors.includes(flavor.slug)) ?? []
        // Regla 4.7: con un sabor que no se combina, "Dos sabores" no aplica y el sabor elegido se queda.
        if (flavorCount === 2 && chosen.some((flavor) => !flavor.isCombinable)) return d
        return { ...d, flavorCount, flavors: flavorCount === 2 ? d.flavors : d.flavors.slice(0, 1) }
      }),
    [baseOf, update],
  )
  /**
   * Elegir un sabor: con uno, lo reemplaza; con dos, lo agrega o lo quita (hasta dos). Antes descarta lo que ya no se
   * puede elegir (un sabor de otra base, retirado o que el tipo no admite), para que nada guardado bloquee la lista.
   */
  const chooseFlavor = useCallback(
    (slug: string) =>
      update((d) => {
        const base = baseOf(d)
        const allowed = new Set(choosableFlavors(base, d.cakeType).map((flavor) => flavor.slug))
        if (!allowed.has(slug)) return d
        const kept = d.flavors.filter((flavor) => allowed.has(flavor))
        const two = d.flavorCount === 2 && (base?.maxFlavors ?? 1) >= 2
        if (!two) return { ...d, flavors: [slug] }
        return { ...d, flavors: kept.includes(slug) ? kept.filter((flavor) => flavor !== slug) : [...kept, slug].slice(0, 2) }
      }),
    [baseOf, update],
  )
  const setCoverage = useCallback((coverageColor: string) => update((d) => ({ ...d, coverageColor })), [update])

  // --- Avance ---
  const { flush } = price
  // Un solo "Continuar" a la vez: un doble clic o Enter sostenido mientras se esperan los kilos no navega dos veces.
  const proceedingRef = useRef(false)
  const [proceeding, setProceeding] = useState(false)
  const proceed = useCallback(async () => {
    if (!design || !options || current > LAST_BUILT_STEP || proceedingRef.current) return
    proceedingRef.current = true
    setProceeding(true)
    try {
      let stepDesign = design
      let size = apiSize
      let base = draft
      if (current === 1 && !design.size?.current) {
        // Los kilos de estas personas todavía no llegan: se pide ya (sin esperar el fin de los cambios) y se espera la
        // respuesta, así basta una pulsación. Solo una falla de red deja el error con reintento.
        const settled = await flush()
        if (!settled || settled.failed) {
          setStepError(settled?.failed ? 'No pudimos calcular los kilos. Vuelve a intentarlo.' : missingChoice(1, design, draft))
          return
        }
        size = settled.quote?.size ?? null
        // Lo que cambió durante la espera (por ejemplo, la forma) cuenta: se parte del borrador más reciente.
        base = latestDraft.current
        if (!size || size.people !== base.people) {
          setStepError(missingChoice(1, design, base))
          return
        }
        // Si los kilos no permiten los pisos, bajan aquí también (la respuesta pudo llegar en esta misma espera).
        if (base.tiers > size.maxTiers) base = { ...base, tiers: size.maxTiers }
        stepDesign = deriveDesign(base, options, size)
      }
      const missing = missingChoice(current, stepDesign, base)
      if (missing) {
        setStepError(missing)
        return
      }
      const next = confirmStep(current, stepDesign, base)
      if (next.people !== base.people) setPeopleText(String(next.people))
      // Funcional: lo que este paso confirma se aplica sobre el borrador más reciente, sin pisar otros cambios.
      const changes = diffOf(latestDraft.current, next)
      setDraft((latest) => ({ ...latest, ...changes }))
      const after = deriveDesign(next, options, next.people === base.people ? size : null)
      navigate({ search: `?paso=${stepAfter(current, stepDesign, after, next)}` })
    } finally {
      proceedingRef.current = false
      setProceeding(false)
    }
  }, [apiSize, current, design, draft, flush, navigate, options])

  const back = useCallback(() => {
    if (current === 1 || !design) navigate('/pedido')
    else navigate({ search: `?paso=${previousStep(current, design)}` })
  }, [current, design, navigate])

  // --- Vista previa ---
  const defaultBread = plan?.assumedBread ?? null
  const shape = useMemo(
    () => (design && options ? designPreview({ draft, design, options, current, defaultBread }) : EMPTY_SHAPE),
    [current, defaultBread, design, draft, options],
  )
  const scene = useCakeScene(shape)

  return {
    status: optionsState.status,
    retryOptions,
    retryPrice: price.retry,
    draft,
    view: design && options ? designerView({ draft, design, options, current, price, plan, tierNotice, proceeding }) : null,
    current,
    stepTitle,
    direction,
    stepError,
    peopleText,
    whatsapp: store.status === 'loading' ? undefined : store.whatsapp,
    scene,
    actions: {
      setPeople,
      typePeople,
      settlePeople,
      setForm,
      setTiers,
      setCakeType,
      setBread,
      setFillingBase,
      setFlavorCount,
      chooseFlavor,
      setCoverage,
      proceed,
      back,
    },
  }
}

export type CakeDesignerView = ReturnType<typeof useCakeDesigner>
