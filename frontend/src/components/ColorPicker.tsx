import { useId, useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { displayHex } from '../models/color.ts'
import { COLOR_BARS, useColorPicker } from '../viewmodels/useColorPicker.ts'
import type { ColorBarKey } from '../viewmodels/useColorPicker.ts'
import type { Hsl } from '../viewmodels/colors.ts'
import { hslToHex } from '../viewmodels/colors.ts'
import { focusRing } from './focus.ts'
import TextField from './TextField.tsx'

/** Alto del control y ancho de la perilla: la barra mide 44 px para el dedo y la perilla se queda dentro de ella. */
const THUMB = 32
/** Cuánto se mueve un dedo (px) para que un gesto cuente como arrastre y no como toque. */
const TOUCH_SLOP = 8

const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`

/** El fondo de cada barra: lo que se vería al mover solo ese valor. Son colores de comida (los que elige la persona), no de la interfaz. */
function barBackground(key: ColorBarKey, { h, s, l }: Hsl): string {
  if (key === 'h') return `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((hue) => hsl(hue, 100, 50)).join(', ')})`
  if (key === 's') return `linear-gradient(to right, ${hsl(h, 0, l)}, ${hsl(h, 100, l)})`
  return `linear-gradient(to right, ${hsl(h, s, 0)}, ${hsl(h, s, 50)}, ${hsl(h, s, 100)})`
}

type ColorBarProps = {
  barKey: ColorBarKey
  color: Hsl
  hex: string
  onChange: (key: ColorBarKey, value: number) => void
}

/**
 * Una barra deslizable (`role="slider"`) con su etiqueta, su valor dicho en texto y su perilla. Con el puntero o el dedo se
 * arrastra desde cualquier punto (en pantalla táctil, un gesto vertical sigue siendo el scroll); con el teclado, las flechas
 * mueven 1 y Shift mueve 10; Re Pág y Av Pág, 10; Inicio y Fin, los extremos. Sin animaciones: respeta `prefers-reduced-motion`.
 */
function ColorBar({ barKey, color, hex, onChange }: ColorBarProps) {
  const labelId = useId()
  const bar = COLOR_BARS[barKey]
  const value = Math.round(color[barKey])
  const text = `${value}${bar.unit}`

  // Con el dedo, un gesto que empieza en vertical es el scroll de la página: el valor no cambia hasta que el gesto se ve horizontal
  // (o termina sin moverse, que es un toque). Con el mouse, cambia desde que se pulsa.
  const touch = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const usable = Math.max(box.width - THUMB, 1)
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left - THUMB / 2) / usable))
    onChange(barKey, Math.round(fraction * bar.max))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    if (event.pointerType === 'touch') touch.current = { x: event.clientX, y: event.clientY, moved: false }
    else move(event)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const gesture = touch.current
    if (!gesture) return move(event)
    const dx = Math.abs(event.clientX - gesture.x)
    if (!gesture.moved && dx > TOUCH_SLOP && dx > Math.abs(event.clientY - gesture.y)) gesture.moved = true
    if (gesture.moved) move(event)
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = touch.current
    touch.current = null
    // Un toque sin movimiento pone el valor donde se tocó.
    if (gesture && !gesture.moved && Math.abs(event.clientX - gesture.x) <= TOUCH_SLOP && Math.abs(event.clientY - gesture.y) <= TOUCH_SLOP) move(event)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? bar.coarse : bar.fine
    const delta: Record<string, number | undefined> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: bar.coarse, PageDown: -bar.coarse }
    const change = delta[event.key]
    if (change !== undefined) onChange(barKey, value + change)
    else if (event.key === 'Home') onChange(barKey, 0)
    else if (event.key === 'End') onChange(barKey, bar.max)
    else return
    event.preventDefault()
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-etiqueta">
          {bar.label}
        </span>
        <span aria-hidden="true" className="text-nota tabular-nums text-mermelada-suave">
          {text}
        </span>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={bar.max}
        aria-valuenow={value}
        aria-valuetext={text}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          touch.current = null
        }}
        className={`relative h-11 w-full cursor-pointer touch-pan-y select-none rounded-full border border-relieve ${focusRing}`}
        style={{ background: barBackground(barKey, color) }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-betun ring-2 ring-mermelada"
          style={{ left: `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${color[barKey] / bar.max})`, width: THUMB, height: THUMB, backgroundColor: hex }}
        />
      </div>
    </div>
  )
}

type ColorPickerProps = {
  /** Qué color se elige: "Color de la cobertura", "Color de la decoración", "Color del texto". */
  legend: string
  /** El color de ahora, `#rrggbb`; `null` si todavía no se elige (el selector arranca en blanco y no cuenta como elegido hasta que se toca). */
  value: string | null
  onChange: (hex: string) => void
}

/**
 * Selector libre de color, el mismo para la cobertura, la decoración y el texto del mensaje: una muestra grande del color,
 * tres barras (tono, intensidad y claridad) y el campo del código hexadecimal. No usa `<input type="color">`, que no sigue la
 * marca y se ve distinto en cada sistema. Los colores que muestra son los que elige la persona para su pastel (comida), no de la
 * interfaz; todo lo demás sale de los tokens.
 */
export default function ColorPicker({ legend, value, onChange }: ColorPickerProps) {
  const picker = useColorPicker(value, onChange)
  const color = picker.hsl
  const hex = hslToHex(color)
  return (
    <fieldset className="flex flex-col gap-4 rounded-md border border-relieve p-4" data-testid="selector-de-color">
      <legend className="float-left text-etiqueta">{legend}</legend>
      <div className="clear-both flex items-center gap-4">
        <span aria-hidden="true" className="h-20 w-20 shrink-0 rounded-md border-2 border-relieve" style={{ backgroundColor: hex }} data-testid="muestra-de-color" />
        <p className="flex min-w-0 flex-col">
          <span className="text-nota text-mermelada-suave">Color elegido</span>
          <span className="text-cuerpo font-semibold tabular-nums" data-testid="codigo-de-color">
            {displayHex(hex)}
          </span>
        </p>
      </div>
      {(Object.keys(COLOR_BARS) as ColorBarKey[]).map((key) => (
        <ColorBar key={key} barKey={key} color={color} hex={hex} onChange={picker.setBar} />
      ))}
      <TextField
        label="Código del color"
        help="Seis dígitos, con o sin #. Por ejemplo #A1B2C3."
        value={picker.text}
        error={picker.error ?? undefined}
        maxLength={9}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(event) => picker.typeText(event.target.value)}
        onBlur={picker.settleText}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          picker.settleText()
        }}
      />
    </fieldset>
  )
}
