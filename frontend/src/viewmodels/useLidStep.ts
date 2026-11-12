import { useCallback, useMemo, useRef, useState } from 'react'
import type { CakeDesignOptions } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import { boundMessage, boundWafer, cleanMessageText, LAYOUT_BOUNDS } from '../models/cakeDesignLayout.ts'
import type { MessageColorMode, MessageLayout, WaferLayout, WaferShape } from '../models/cakeDesignLayout.ts'
import { formatPrice } from '../models/money.ts'
import { coverageColor } from './cakeDesignSteps.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'
import { effectiveMessage, effectiveWafer, lidFor } from './cakeLid.ts'
import type { LoadedImage } from './cakeLid.ts'
import { fitWafer, initialWafer, maxWaferCm, withShape } from './lidGeometry.ts'
import type { Lid } from './lidGeometry.ts'
import { INK_BLACK, lowContrast, MESSAGE_COLOR_MODES, messageInk, messageTones, TONE_LABELS } from './messageColors.ts'
import { fitMessage, maxMessageScale, messageGeometry, wordCount } from './messageGeometry.ts'
import type { MessageMetrics } from './messageGeometry.ts'
import type { useDecorationImage } from './useDecorationImage.ts'

/** Qué se acomoda en el editor de vista superior: la oblea o el mensaje. */
export type LidTarget = 'wafer' | 'message'

/** Un paso de las flechas de posición, respecto al radio de la parte plana de la tapa. */
const NUDGE = 0.05
/** El tamaño más chico de una oblea en la interfaz, en cm (el servidor acepta desde 2). */
const MIN_WAFER_UI_CM = 3
const MIN_SCALE_UI = 0.08

type Inputs = {
  draft: CakeDesignDraft
  update: (change: (draft: CakeDesignDraft) => CakeDesignDraft) => void
  options: CakeDesignOptions | null
  design: DesignDerived | null
  metrics: MessageMetrics
  waferImage: ReturnType<typeof useDecorationImage>
  loadedWafer: LoadedImage | null
}

const percent = (value: number, max: number) => `${Math.round((value / Math.max(max, 1e-9)) * 100)} %`

/** Cómo se dice un movimiento: "a la derecha", "hacia arriba". */
function directionWords(dx: number, dy: number): string {
  if (dx !== 0) return dx > 0 ? 'a la derecha' : 'a la izquierda'
  return dy > 0 ? 'hacia arriba' : 'hacia abajo'
}

/** Dónde quedó algo, en palabras: "La oblea quedó 3 cm a la derecha del centro y 1 cm arriba." */
function describePosition(name: string, xCm: number, yCm: number): string {
  const parts = [
    Math.abs(xCm) >= 0.5 ? `${Math.round(Math.abs(xCm))} cm a la ${xCm > 0 ? 'derecha' : 'izquierda'} del centro` : null,
    Math.abs(yCm) >= 0.5 ? `${Math.round(Math.abs(yCm))} cm ${yCm > 0 ? 'arriba' : 'abajo'}${Math.abs(xCm) >= 0.5 ? '' : ' del centro'}` : null,
  ].filter(Boolean)
  return `${name} quedó ${parts.length ? parts.join(' y ') : 'en el centro'}.`
}

/**
 * View-model del paso 7, "Mensaje y oblea" (reglas 6.2 y 6.3, D55): el mensaje con su color y su disposición, la oblea con su
 * imagen, su forma y su encuadre, y el editor de vista superior donde se acomodan. El borrador guarda lo que la persona pidió
 * (dentro de las cotas técnicas); el ajuste a la hoja carta y a la tapa (`lidGeometry.ts`, `messageGeometry.ts`) se hace al
 * dibujar, así un tamaño que dejó de caber (más texto, otro giro) vuelve solo cuando vuelve a caber. Lo que va al carrito y,
 * después, al servidor, es lo ya ajustado. Los precios son los de la API; la imagen solo vive en el navegador.
 */
export function useLidStep({ draft, update, options, design, metrics, waferImage, loadedWafer }: Inputs) {
  const [chosenTarget, setTarget] = useState<LidTarget>('wafer')
  const lid: Lid | null = useMemo(() => (options && design ? lidFor(draft, design, options) : null), [design, draft, options])
  const limits = options?.limits ?? null
  const wafer = lid && options ? effectiveWafer(draft, lid, options) : null
  const message = lid ? effectiveMessage(draft, lid, metrics) : null
  // Lo que se acomoda: lo elegido si existe; si no, lo que haya.
  const target: LidTarget = chosenTarget === 'wafer' ? (wafer || !message ? 'wafer' : 'message') : message || !wafer ? 'message' : 'wafer'

  const commitWafer = useCallback(
    (change: (current: WaferLayout) => WaferLayout) => {
      if (!lid || !limits) return
      update((d) => ({ ...d, wafer: boundWafer(change(d.wafer ?? initialWafer(lid, limits))) }))
    },
    [lid, limits, update],
  )
  const commitMessage = useCallback((change: Partial<MessageLayout>) => update((d) => ({ ...d, message: boundMessage({ ...d.message, ...change }) })), [update])

  // --- Mensaje ---
  const setMessageEnabled = useCallback((enabled: boolean) => update((d) => ({ ...d, messageEnabled: enabled })), [update])
  const setMessageText = useCallback((text: string) => commitMessage({ text: cleanMessageText(text) }), [commitMessage])
  const setColorMode = useCallback(
    (mode: MessageColorMode) => {
      if (!options) return
      update((d) => {
        // "Elegir un color" arranca en el tono más oscuro de la cobertura, que es como ya se veía el texto en "Colores que combinan".
        const cover = coverageColor(d, options)
        const value = mode === 'tones' ? 'deep' : mode === 'custom' ? (cover ? messageTones(cover)[0].color : INK_BLACK) : null
        return { ...d, message: { ...d.message, color: { mode, value } } }
      })
    },
    [options, update],
  )
  const setColorValue = useCallback(
    (value: string) => update((d) => ({ ...d, message: { ...d.message, color: { mode: d.message.color.mode, value } } })),
    [update],
  )
  const setArrangement = useCallback((arrangement: MessageLayout['arrangement']) => commitMessage({ arrangement }), [commitMessage])
  const setCurve = useCallback(
    (curve: number) => commitMessage({ curve: Math.abs(curve) < LAYOUT_BOUNDS.minArcCurve ? LAYOUT_BOUNDS.minArcCurve * (curve < 0 ? -1 : 1) : curve }),
    [commitMessage],
  )
  const setMessageScale = useCallback((scale: number) => commitMessage({ scale }), [commitMessage])
  const setMessageRotation = useCallback((rotation: number) => commitMessage({ rotation }), [commitMessage])

  // --- Oblea ---
  const { clear: clearWaferImage, pick: pickWaferImage, onUnreadable: waferUnreadable } = waferImage
  const setWaferEnabled = useCallback(
    (enabled: boolean) => {
      // Como la imagen de "Otra decoración", la de la oblea solo vive mientras la oblea está elegida.
      if (!enabled) clearWaferImage()
      update((d) => ({
        ...d,
        waferEnabled: enabled,
        waferImageName: enabled ? d.waferImageName : null,
        wafer: enabled && !d.wafer && lid && limits ? initialWafer(lid, limits) : d.wafer,
      }))
    },
    [clearWaferImage, lid, limits, update],
  )
  const chooseWaferImage = useCallback(
    async (file: File | undefined) => {
      const name = await pickWaferImage(file)
      if (name) update((d) => ({ ...d, waferImageName: name, wafer: d.wafer && { ...d.wafer, imageZoom: 1, imageX: 0, imageY: 0 } }))
    },
    [pickWaferImage, update],
  )
  const removeWaferImage = useCallback(() => {
    clearWaferImage()
    update((d) => ({ ...d, waferImageName: null }))
  }, [clearWaferImage, update])
  const unreadableWaferImage = useCallback(() => {
    waferUnreadable()
    update((d) => ({ ...d, waferImageName: null }))
  }, [update, waferUnreadable])
  const setShape = useCallback(
    (shape: WaferShape) => {
      commitWafer((current) => withShape(current, shape))
    },
    [commitWafer],
  )
  /** El lado más largo, con la misma proporción (en un círculo, el diámetro). */
  const setWaferSize = useCallback(
    (size: number) =>
      commitWafer((current) => {
        const longSide = Math.max(current.widthCm, current.heightCm)
        const factor = size / longSide
        return { ...current, widthCm: current.shape === 'circle' ? size : current.widthCm * factor, heightCm: current.shape === 'circle' ? size : current.heightCm * factor }
      }),
    [commitWafer],
  )
  const setWaferWidth = useCallback((widthCm: number) => commitWafer((current) => ({ ...current, widthCm })), [commitWafer])
  const setWaferHeight = useCallback((heightCm: number) => commitWafer((current) => ({ ...current, heightCm })), [commitWafer])
  const setWaferRotation = useCallback((rotation: number) => commitWafer((current) => ({ ...current, rotation })), [commitWafer])
  const setImageZoom = useCallback((imageZoom: number) => commitWafer((current) => ({ ...current, imageZoom })), [commitWafer])
  const setImagePan = useCallback((axis: 'imageX' | 'imageY', value: number) => commitWafer((current) => ({ ...current, [axis]: value })), [commitWafer])

  // --- El editor: posición, tamaño y giro de lo que se está acomodando ---
  const moveTo = useCallback(
    (which: LidTarget, x: number, y: number) => {
      if (which === 'wafer') commitWafer((current) => ({ ...current, x, y }))
      else commitMessage({ x, y })
    },
    [commitMessage, commitWafer],
  )
  // Lo que dijeron las flechas y los botones, para el lector de pantalla; cada aviso lleva un número nuevo para que se lea aunque se repita.
  const [announcement, setAnnouncement] = useState<{ id: number; text: string }>({ id: 0, text: '' })
  const announcements = useRef(0)
  const announce = useCallback((text: string) => setAnnouncement({ id: ++announcements.current, text }), [])
  /** Un paso hacia `dx`, `dy` desde donde está ahora (ya ajustado); dice dónde quedó o que ya no cabe más. */
  const nudge = useCallback(
    (dx: number, dy: number) => {
      const layout = target === 'wafer' ? wafer : message
      if (!layout || !lid || !limits) return
      const wanted = { x: layout.x + dx * NUDGE, y: layout.y + dy * NUDGE }
      moveTo(target, wanted.x, wanted.y)
      // Donde va a quedar: el mismo ajuste con que se dibuja.
      const landed = wafer && target === 'wafer' ? fitWafer({ ...wafer, ...wanted }, lid, limits) : message ? fitMessage({ ...message, ...wanted }, metrics, lid) : null
      if (!landed) return
      const moved = Math.hypot(landed.x - layout.x, landed.y - layout.y) > 1e-6
      announce(moved ? describePosition(target === 'wafer' ? 'La oblea' : 'El mensaje', landed.x * lid.radius, landed.y * lid.radius) : `Ya no cabe más ${directionWords(dx, dy)}.`)
    },
    [announce, limits, lid, message, metrics, moveTo, target, wafer],
  )
  const center = useCallback(() => {
    moveTo(target, 0, 0)
    announce(`${target === 'wafer' ? 'La oblea' : 'El mensaje'} quedó en el centro.`)
  }, [announce, moveTo, target])
  const rotateTo = useCallback(
    (which: LidTarget, rotation: number) => (which === 'wafer' ? setWaferRotation(rotation) : setMessageRotation(rotation)),
    [setMessageRotation, setWaferRotation],
  )
  const resizeWafer = useCallback(
    (widthCm: number, heightCm: number) => commitWafer((current) => ({ ...current, widthCm, heightCm: current.shape === 'circle' ? widthCm : heightCm })),
    [commitWafer],
  )

  const view = useMemo(() => {
    if (!options || !design || !lid || !limits) return null
    const coverage = design.coverage
    const ink = message ? messageInk(message.color, coverage) : messageInk(draft.message.color, coverage)
    const draftWafer = wafer ?? initialWafer(lid, limits)
    const waferSizeMax = Math.max(MIN_WAFER_UI_CM, maxWaferCm(draftWafer, lid, limits, 'size'))
    // Girar la oblea puede bajar lo más grande que cabe: se dice en el texto del valor, no solo se mueve el tope.
    const waferSizeStraight = Math.max(MIN_WAFER_UI_CM, maxWaferCm({ ...draftWafer, rotation: 0 }, lid, limits, 'size'))
    const waferSizeValue = Math.max(draftWafer.widthCm, draftWafer.heightCm)
    const waferSizeText = `${waferSizeValue.toFixed(1)} cm${waferSizeMax < waferSizeStraight - 0.05 ? `; con este giro el máximo es ${waferSizeMax.toFixed(1)} cm` : ''}`
    const draftMessage = message ?? fitMessage(draft.message, metrics, lid)
    const scaleMax = Math.max(MIN_SCALE_UI, maxMessageScale(draftMessage, metrics, lid))
    const words = wordCount(draft.message.text)
    const waferPrice = formatPrice(limits.waferPrice)
    return {
      lid,
      target,
      announcement,
      coverageColor: coverage ?? INK_BLACK,
      message: {
        enabled: draft.messageEnabled,
        text: draft.message.text,
        maxLength: LAYOUT_BOUNDS.messageMaxLength,
        wordsLine: `${words} de ${limits.messageSuggestedMaxWords} palabras`,
        overSuggestion: words > limits.messageSuggestedMaxWords,
        hint: `Las frases cortas se leen mejor: hasta ${limits.messageSuggestedMaxWords} palabras.`,
        color: {
          mode: draft.message.color.mode,
          modes: MESSAGE_COLOR_MODES.map((entry) => ({ ...entry, checked: entry.mode === draft.message.color.mode })),
          tones: coverage
            ? messageTones(coverage).map((tone) => ({ value: tone.value, label: TONE_LABELS[tone.value], color: tone.color, checked: draft.message.color.value === tone.value }))
            : [],
          ink,
          lowContrast: lowContrast(ink, coverage),
        },
        arrangement: draftMessage.arrangement,
        curve: draftMessage.curve,
        curveText: `${draftMessage.curve > 0 ? 'Hacia arriba' : 'Hacia abajo'} ${Math.round(Math.abs(draftMessage.curve) * 100)} %`,
        scale: { value: Math.min(draftMessage.scale, scaleMax), min: MIN_SCALE_UI, max: scaleMax, text: percent(draftMessage.scale, scaleMax) },
        rotation: Math.round(draftMessage.rotation),
        // Lo que se dibuja: las letras ya colocadas.
        geometry: message ? messageGeometry(message, metrics, lid.radius) : null,
        layout: message,
      },
      wafer: {
        enabled: draft.waferEnabled,
        price: waferPrice,
        unavailableReason: limits.waferPrice === null ? 'Precio por confirmar' : null,
        shape: draftWafer.shape,
        size: { value: waferSizeValue, min: MIN_WAFER_UI_CM, max: waferSizeMax, text: waferSizeText },
        width: { value: draftWafer.widthCm, min: MIN_WAFER_UI_CM, max: Math.max(MIN_WAFER_UI_CM, maxWaferCm(draftWafer, lid, limits, 'width')) },
        height: { value: draftWafer.heightCm, min: MIN_WAFER_UI_CM, max: Math.max(MIN_WAFER_UI_CM, maxWaferCm(draftWafer, lid, limits, 'height')) },
        rotation: Math.round(draftWafer.rotation),
        zoom: draftWafer.imageZoom,
        panX: draftWafer.imageX,
        panY: draftWafer.imageY,
        image: waferImage.image,
        loaded: loadedWafer,
        // Tras recargar queda el nombre, pero no la imagen.
        lostName: waferImage.image ? null : draft.waferImageName,
        error: waferImage.error,
        layout: wafer,
        letter: `${limits.waferMaxWidthCm} × ${limits.waferMaxHeightCm} cm`,
      },
    }
  }, [announcement, design, draft, limits, lid, loadedWafer, message, metrics, options, target, wafer, waferImage.error, waferImage.image])

  return {
    view,
    actions: {
      setTarget,
      setMessageEnabled,
      setMessageText,
      setColorMode,
      setColorValue,
      setArrangement,
      setCurve,
      setMessageScale,
      setMessageRotation,
      setWaferEnabled,
      chooseWaferImage,
      removeWaferImage,
      unreadableWaferImage,
      setShape,
      setWaferSize,
      setWaferWidth,
      setWaferHeight,
      setWaferRotation,
      setImageZoom,
      setImagePan,
      moveTo,
      nudge,
      center,
      rotateTo,
      resizeWafer,
      scaleMessage: setMessageScale,
    },
  }
}

export type LidStepView = NonNullable<ReturnType<typeof useLidStep>['view']>
export type LidStepActions = ReturnType<typeof useLidStep>['actions']
