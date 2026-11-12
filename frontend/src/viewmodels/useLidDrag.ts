import { useCallback, useRef } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { LAYOUT_BOUNDS } from '../models/cakeDesignLayout.ts'
import { clamp } from './lidGeometry.ts'
import type { LidStepActions, LidStepView, LidTarget } from './useLidStep.ts'

/**
 * Lo que se hace con el puntero y el teclado en el editor de vista superior (paso 7, D55): arrastrar para mover, las esquinas
 * para el tamaño, el asa de arriba para girar. Convierte el puntero a centímetros de la tapa (con la `y` hacia arriba, como
 * `lidGeometry.ts`) y se lo pasa al view-model, que ajusta todo a la hoja carta y a la tapa. La vista solo pone los eventos.
 */

type Mode = 'move' | 'resize' | 'rotate' | 'scale'
type Drag = { pointerId: number; mode: Mode; target: LidTarget; grabX: number; grabY: number }

/** Se pega a un giro redondo (cada 15°) cuando el puntero queda a menos de 3° de él, para enderezar sin esfuerzo. */
const SNAP_EVERY = 15
const SNAP_WITHIN = 3

export function useLidDrag(svg: RefObject<SVGSVGElement | null>, view: LidStepView, actions: LidStepActions) {
  const drag = useRef<Drag | null>(null)
  const { radius } = view.lid

  /** El punto del evento en cm de la tapa. */
  const toLid = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const element = svg.current
      const matrix = element?.getScreenCTM()
      if (!element || !matrix) return null
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      return { x: point.x, y: -point.y }
    },
    [svg],
  )

  const centerOf = useCallback(
    (target: LidTarget) => {
      const layout = target === 'wafer' ? view.wafer.layout : view.message.layout
      return layout ? { x: layout.x * radius, y: layout.y * radius, rotation: layout.rotation } : null
    },
    [radius, view.message.layout, view.wafer.layout],
  )

  const begin = useCallback(
    (event: PointerEvent<SVGElement>, mode: Mode, target: LidTarget) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const point = toLid(event)
      const center = centerOf(target)
      if (!point || !center) return
      // La propia oblea o el propio mensaje: tocarlos también los elige.
      actions.setTarget(target)
      event.stopPropagation()
      svg.current?.setPointerCapture(event.pointerId)
      drag.current = { pointerId: event.pointerId, mode, target, grabX: point.x - center.x, grabY: point.y - center.y }
    },
    [actions, centerOf, svg, toLid],
  )

  const move = useCallback(
    (event: PointerEvent<SVGElement>) => {
      const current = drag.current
      if (!current || current.pointerId !== event.pointerId) return
      const point = toLid(event)
      const center = centerOf(current.target)
      if (!point || !center) return
      const [dx, dy] = [point.x - center.x, point.y - center.y]
      // El puntero en el sistema de la figura (sin su giro), para medir su tamaño.
      const angle = (center.rotation * Math.PI) / 180
      const local = { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) }
      switch (current.mode) {
        case 'move':
          actions.moveTo(current.target, (point.x - current.grabX) / radius, (point.y - current.grabY) / radius)
          break
        case 'rotate': {
          const turn = (Math.atan2(dx, dy) * 180) / Math.PI
          const nearest = Math.round(turn / SNAP_EVERY) * SNAP_EVERY
          actions.rotateTo(current.target, Math.abs(turn - nearest) <= SNAP_WITHIN ? nearest : Math.round(turn))
          break
        }
        case 'resize': {
          const circle = view.wafer.shape === 'circle'
          actions.resizeWafer(circle ? Math.abs(local.x) + Math.abs(local.y) : 2 * Math.abs(local.x), 2 * Math.abs(local.y))
          break
        }
        case 'scale': {
          const layout = view.message.layout
          const geometry = view.message.geometry
          if (layout && geometry && geometry.bounds.maxX > 0) actions.scaleMessage(clamp(layout.scale * (Math.abs(local.x) / geometry.bounds.maxX), LAYOUT_BOUNDS.messageScale.min, LAYOUT_BOUNDS.messageScale.max))
          break
        }
      }
    },
    [actions, centerOf, radius, toLid, view.message.geometry, view.message.layout, view.wafer.shape],
  )

  const end = useCallback((event: PointerEvent<SVGElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }, [])

  /** Las flechas mueven lo que se acomoda; con Mayús, cuatro pasos. */
  const keyDown = useCallback(
    (event: KeyboardEvent<SVGElement>) => {
      const direction: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
      const step = direction[event.key]
      if (!step) return
      event.preventDefault()
      const times = event.shiftKey ? 4 : 1
      actions.nudge(step[0] * times, step[1] * times)
    },
    [actions],
  )

  return { begin, move, end, keyDown }
}
