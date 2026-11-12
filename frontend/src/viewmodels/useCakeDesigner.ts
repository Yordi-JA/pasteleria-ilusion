import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { getCakeDesignOptions } from '../models/cakeDesign.ts'
import type { CakeDesignOptions, CakeDesignQuote } from '../models/cakeDesign.ts'
import { emptyDraft, MAX_PEOPLE_INPUT, readDraft, writeDraft } from '../models/cakeDesignDraft.ts'
import type { CakeDesignDraft, CakeForm } from '../models/cakeDesignDraft.ts'
import type { Occasion } from '../models/occasion.ts'
import type { CakeShape, Viewpoint } from '../three/cakeShape.ts'
import { defaultPickedColor } from './cakeDecorations.ts'
import { designPreview } from './cakeDesignPreview.ts'
import {
  choosableFlavors,
  confirmStep,
  deriveDesign,
  firstIncompleteStep,
  isSkipped,
  LID_STEP,
  missingChoice,
  nextStep,
  previousStep,
  REVIEW_STEP,
  STEP_COUNT,
  stepAfter,
  tierLimitSentence,
} from './cakeDesignSteps.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'
import { designLine } from './cakeDesignOrder.ts'
import { designerView } from './cakeDesignSummary.ts'
import { planPrice, useCakeDesignPrice } from './useCakeDesignPrice.ts'
import { measureMessage, useMessageFont } from './messageMetrics.ts'
import { useAddDesignToCart } from './useAddDesignToCart.ts'
import { useCakeScene } from './useCakeScene.ts'
import { useDecorationImage } from './useDecorationImage.ts'
import { useLidStep } from './useLidStep.ts'
import { useLoadedImage } from './useLoadedImage.ts'
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

/**
 * Desde dónde se ve el pastel en cada paso (libro de marca, "Cotizador 3D"): de frente hasta la decoración; en el paso 7, desde
 * arriba y sin girar, para que el editor de vista superior y la vista previa coincidan; en la revisión, desde una elevación
 * intermedia, y vuelve a girar solo.
 */
const VIEWPOINTS: Record<'front' | 'top' | 'review', Viewpoint> = {
  front: { key: 'front', elevation: 15, angle: null, autoSpin: true },
  top: { key: 'top', elevation: 78, angle: 0, autoSpin: false },
  review: { key: 'review', elevation: 32, angle: null, autoSpin: true },
}

function viewpointFor(step: number): Viewpoint {
  return step === LID_STEP ? VIEWPOINTS.top : step === REVIEW_STEP ? VIEWPOINTS.review : VIEWPOINTS.front
}

/** Mientras llegan las opciones no hay pastel que dibujar; la escena no se monta hasta tenerlas. */
const EMPTY_SHAPE: CakeShape = { tiers: [], festoons: false, stand: true }

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
  const decorationImage = useDecorationImage()
  const imageReady = decorationImage.image !== null
  const waferImage = useDecorationImage()
  const waferReady = waferImage.image !== null
  // La letra del mensaje y lo que mide el texto con ella; la imagen de la oblea, ya decodificada, para el editor y el 3D.
  const fontReady = useMessageFont()
  // `fontReady` cambia lo que mide el mismo texto: la medida se vuelve a tomar cuando llega la letra.
  const metrics = useMemo(() => measureMessage(draft.message.text, fontReady), [draft.message.text, fontReady])
  const loadedWafer = useLoadedImage(waferImage.image?.url ?? null)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const store = useStoreDetails()

  useEffect(() => {
    writeDraft(draft)
  }, [draft])

  // El precio (y los kilos) se piden con lo elegido; el tamaño que responde la API alimenta el diseño. El plan solo
  // lee lo que no depende del tamaño, así que se arma con un diseño sin él.
  const sizeless = useMemo(() => (options ? deriveDesign(draft, options, null, imageReady, waferReady) : null), [draft, imageReady, options, waferReady])
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
  const design = useMemo(() => (options ? deriveDesign(draft, options, apiSize, imageReady, waferReady) : null), [apiSize, draft, imageReady, options, waferReady])

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

  // --- Paso 6 ---
  const clearImage = decorationImage.clear
  /** Elegir otra decoración descarta la imagen de "Otra decoración": solo vive mientras esa opción está elegida. */
  const setDecoration = useCallback(
    (slug: string) => {
      const keepsImage = options?.decorations.find((option) => option.slug === slug)?.requiresQuote ?? false
      if (!keepsImage) clearImage()
      update((d) => ({ ...d, decoration: slug, decorationImageName: keepsImage ? d.decorationImageName : null }))
    },
    [clearImage, options, update],
  )
  /** `null` es "Automático"; un identificador, ese color de la cobertura. */
  const setDecorationColor = useCallback((decorationColor: string | null) => update((d) => ({ ...d, decorationColor })), [update])
  const chooseOwnColor = useCallback(() => {
    if (options) update((d) => ({ ...d, decorationColor: d.decorationColor ?? defaultPickedColor(options, d.coverageColor) }))
  }, [options, update])
  const { pick: pickImage } = decorationImage
  const chooseImage = useCallback(
    async (file: File | undefined) => {
      // El nombre llega ya limpio (sin caracteres de control ni de formato): es el que se guarda y se muestra.
      const name = await pickImage(file)
      if (name) update((d) => ({ ...d, decorationImageName: name }))
    },
    [pickImage, update],
  )
  const removeImage = useCallback(() => {
    clearImage()
    update((d) => ({ ...d, decorationImageName: null }))
  }, [clearImage, update])
  const { onUnreadable } = decorationImage
  const imageUnreadable = useCallback(() => {
    onUnreadable()
    update((d) => ({ ...d, decorationImageName: null }))
  }, [onUnreadable, update])

  // --- Avance ---
  const { flush } = price
  // Un solo "Continuar" a la vez: un doble clic o Enter sostenido mientras se esperan los kilos no navega dos veces.
  const proceedingRef = useRef(false)
  const [proceeding, setProceeding] = useState(false)
  const proceed = useCallback(async () => {
    // La revisión no confirma nada: su botón agrega el pastel al pedido (`addToOrder`).
    if (!design || !options || current >= REVIEW_STEP || proceedingRef.current) return
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
        stepDesign = deriveDesign(base, options, size, imageReady, waferReady)
      }
      const missing = missingChoice(current, stepDesign, base, imageReady)
      if (missing) {
        setStepError(missing)
        return
      }
      const next = confirmStep(current, stepDesign, base)
      if (next.people !== base.people) setPeopleText(String(next.people))
      // Funcional: lo que este paso confirma se aplica sobre el borrador más reciente, sin pisar otros cambios.
      const changes = diffOf(latestDraft.current, next)
      setDraft((latest) => ({ ...latest, ...changes }))
      const after = deriveDesign(next, options, next.people === base.people ? size : null, imageReady, waferReady)
      navigate({ search: `?paso=${stepAfter(current, stepDesign, after, next)}` })
    } finally {
      proceedingRef.current = false
      setProceeding(false)
    }
  }, [apiSize, current, design, draft, flush, imageReady, navigate, options, waferReady])

  const back = useCallback(() => {
    if (current === 1 || !design) navigate('/pedido')
    else navigate({ search: `?paso=${previousStep(current, design)}` })
  }, [current, design, navigate])

  // --- Paso 7: mensaje y oblea ---
  const lidStep = useLidStep({ draft, update, options, design, metrics, waferImage, loadedWafer })

  // --- Paso 8: revisión ---
  const setOccasion = useCallback((occasion: Occasion | null) => update((d) => ({ ...d, occasion })), [update])
  const order = useAddDesignToCart()
  const orderLine = useMemo(
    () => (design && options && price.quote && !price.estimate && !price.updating ? designLine({ draft, design, options, quote: price.quote, metrics, imageIds: { decoration: decorationImage.image?.id ?? null, wafer: waferImage.image?.id ?? null } }) : null),
    [decorationImage.image?.id, design, draft, metrics, options, price.estimate, price.quote, price.updating, waferImage.image?.id],
  )
  const decorationLocal = decorationImage.image && design?.decoration?.requiresQuote ? decorationImage.image : null
  const waferLocal = waferImage.image && draft.waferEnabled ? waferImage.image : null
  const addToOrder = useCallback(async () => {
    if (!orderLine) return
    await order.add(orderLine, { decoration: decorationLocal, wafer: waferLocal })
  }, [decorationLocal, order, orderLine, waferLocal])
  const { clear: clearDecorationImage } = decorationImage
  const { clear: clearWaferImage } = waferImage
  /** "Diseñar otro pastel": empieza de cero, sin las imágenes de este. */
  const startOver = useCallback(() => {
    clearDecorationImage()
    clearWaferImage()
    const fresh = emptyDraft()
    setPeopleText(String(fresh.people))
    setTierNotice(null)
    setStepError(null)
    setDraft(fresh)
    navigate({ search: '?paso=1' })
  }, [clearDecorationImage, clearWaferImage, navigate])

  // --- Vista previa ---
  const defaultBread = plan?.assumedBread ?? null
  const shape = useMemo(
    () => (design && options ? designPreview({ draft, design, options, current, defaultBread, metrics, waferImage: loadedWafer }) : EMPTY_SHAPE),
    [current, defaultBread, design, draft, loadedWafer, metrics, options],
  )
  const scene = useCakeScene(shape, '0px', viewpointFor(current))

  return {
    status: optionsState.status,
    retryOptions,
    retryPrice: price.retry,
    draft,
    view: design && options ? designerView({ draft, design, options, current, price, plan, tierNotice, proceeding, leadDays: store.status === 'loading' ? null : store.leadDays }) : null,
    current,
    stepTitle,
    direction,
    stepError,
    peopleText,
    whatsapp: store.status === 'loading' ? undefined : store.whatsapp,
    scene,
    decorationImage: { image: decorationImage.image, error: decorationImage.error },
    lidStep,
    order: { feedback: order.feedback, busy: order.busy, added: orderLine ? order.inCart(orderLine.designId) : false },
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
      setDecoration,
      setDecorationColor,
      chooseOwnColor,
      chooseImage,
      removeImage,
      imageUnreadable,
      setOccasion,
      addToOrder,
      startOver,
      proceed,
      back,
    },
  }
}

export type CakeDesignerView = ReturnType<typeof useCakeDesigner>
