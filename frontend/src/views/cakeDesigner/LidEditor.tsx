import { useId, useRef } from 'react'
import { imagePlacement } from '../../models/cakeDesignLayout.ts'
import { BASELINE_BELOW_CENTER } from '../../viewmodels/messageGeometry.ts'
import { MESSAGE_FONT_FAMILY, MESSAGE_FONT_WEIGHT } from '../../viewmodels/messageMetrics.ts'
import { useLidDrag } from '../../viewmodels/useLidDrag.ts'
import type { LidStepActions, LidStepView } from '../../viewmodels/useLidStep.ts'

/**
 * El editor de vista superior (paso 7, D55): la tapa del último piso vista desde arriba, con la oblea y el mensaje donde la
 * persona los acomoda. Se dibuja en centímetros de la tapa (1 unidad del SVG es 1 cm) con el frente del pastel abajo, igual que
 * la vista previa. Arrastrar mueve; las esquinas cambian el tamaño; el asa de arriba gira; las flechas del teclado mueven
 * (Mayús, cuatro pasos). Todo eso también está en los controles de al lado, con etiqueta, para quien no usa el puntero.
 * El SVG deja pasar el scroll vertical con el dedo (`touch-pan-y`); solo la oblea, el mensaje y las asas lo toman (`touch-none`).
 *
 * Los colores de la tapa, de las letras y de la oblea son los de la comida; lo demás (el aro, las esquinas) usa los tokens.
 */

type Props = { view: LidStepView; actions: LidStepActions; describedBy: string }

/** Una esquina o un asa: un cuadrado con un área de toque más grande invisible, del tamaño de un dedo. */
function Handle({ x, y, size, cursor, onPointerDown }: { x: number; y: number; size: number; cursor: string; onPointerDown: (event: React.PointerEvent<SVGElement>) => void }) {
  return (
    <g onPointerDown={onPointerDown} style={{ cursor }} className="touch-none">
      <rect x={x - size * 1.6} y={y - size * 1.6} width={size * 3.2} height={size * 3.2} fill="transparent" />
      <rect x={x - size / 2} y={y - size / 2} width={size} height={size} className="fill-betun stroke-mermelada" strokeWidth={size / 5} />
    </g>
  )
}

export default function LidEditor({ view, actions, describedBy }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const clipId = useId().replace(/:/g, '')
  const drag = useLidDrag(svg, view, actions)
  const { lid } = view
  const pad = lid.radius * 0.14
  const handle = (2 * lid.halfX + 2 * pad) * 0.035
  const { wafer, message } = view
  const waferLayout = wafer.layout
  const messageLayout = message.layout
  const geometry = message.geometry
  const selectedWafer = view.target === 'wafer' && waferLayout !== null
  const selectedMessage = view.target === 'message' && messageLayout !== null && geometry !== null
  const place =
    waferLayout && wafer.loaded
      ? imagePlacement(wafer.loaded, { width: waferLayout.widthCm, height: waferLayout.heightCm }, waferLayout.imageZoom, waferLayout.imageX, waferLayout.imageY)
      : null

  return (
    <svg
      ref={svg}
      role="group"
      aria-label="Vista de arriba de tu pastel: acomoda la oblea y el mensaje"
      aria-describedby={describedBy}
      tabIndex={0}
      viewBox={`${-lid.halfX - pad} ${-lid.halfY - pad} ${2 * lid.halfX + 2 * pad} ${2 * lid.halfY + 2 * pad}`}
      className="block h-auto w-full touch-pan-y overflow-visible select-none rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mermelada"
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
      onKeyDown={drag.keyDown}
      data-testid="editor-tapa"
    >
      {/* La tapa: la cobertura vista desde arriba, con su aro. */}
      {lid.form === 'round' ? (
        <>
          <circle r={lid.radius} fill={view.coverageColor} className="stroke-relieve" strokeWidth={handle / 6} />
          <circle r={lid.radius * 0.94} fill="none" className="stroke-mermelada-suave" strokeWidth={handle / 8} strokeDasharray={`${handle / 8} ${handle / 3}`} strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x={-lid.halfX} y={-lid.halfY} width={2 * lid.halfX} height={2 * lid.halfY} rx={lid.radius * 0.08} fill={view.coverageColor} className="stroke-relieve" strokeWidth={handle / 6} />
          <rect x={-lid.halfX * 0.95} y={-lid.halfY * 0.94} width={1.9 * lid.halfX} height={1.88 * lid.halfY} rx={lid.radius * 0.06} fill="none" className="stroke-mermelada-suave" strokeWidth={handle / 8} strokeDasharray={`${handle / 8} ${handle / 3}`} strokeLinecap="round" />
        </>
      )}

      {waferLayout && (
        <g transform={`translate(${waferLayout.x * lid.radius} ${-waferLayout.y * lid.radius}) rotate(${waferLayout.rotation})`} data-testid="oblea-editor">
          <defs>
            <clipPath id={clipId}>
              {waferLayout.shape === 'circle' ? <circle r={waferLayout.widthCm / 2} /> : <rect x={-waferLayout.widthCm / 2} y={-waferLayout.heightCm / 2} width={waferLayout.widthCm} height={waferLayout.heightCm} />}
            </clipPath>
          </defs>
          <g onPointerDown={(event) => drag.begin(event, 'move', 'wafer')} style={{ cursor: 'move' }} className="touch-none">
            {waferLayout.shape === 'circle' ? (
              <circle r={waferLayout.widthCm / 2} className="fill-betun" />
            ) : (
              <rect x={-waferLayout.widthCm / 2} y={-waferLayout.heightCm / 2} width={waferLayout.widthCm} height={waferLayout.heightCm} className="fill-betun" />
            )}
            {place && wafer.image && <image href={wafer.image.url} x={place.x} y={place.y} width={place.width} height={place.height} preserveAspectRatio="none" clipPath={`url(#${clipId})`} />}
            {waferLayout.shape === 'circle' ? (
              <circle r={waferLayout.widthCm / 2} fill="none" className="stroke-mermelada-suave" strokeWidth={handle / 8} />
            ) : (
              <rect x={-waferLayout.widthCm / 2} y={-waferLayout.heightCm / 2} width={waferLayout.widthCm} height={waferLayout.heightCm} fill="none" className="stroke-mermelada-suave" strokeWidth={handle / 8} />
            )}
          </g>
          {selectedWafer && (
            <g data-testid="asas-oblea">
              <rect
                x={-waferLayout.widthCm / 2}
                y={-waferLayout.heightCm / 2}
                width={waferLayout.widthCm}
                height={waferLayout.heightCm}
                fill="none"
                className="stroke-mermelada"
                strokeWidth={handle / 8}
                strokeDasharray={`${handle / 2} ${handle / 3}`}
                pointerEvents="none"
              />
              {[
                [-1, -1],
                [1, -1],
                [1, 1],
                [-1, 1],
              ].map(([sx, sy]) => (
                <Handle key={`${sx}${sy}`} x={(sx * waferLayout.widthCm) / 2} y={(sy * waferLayout.heightCm) / 2} size={handle} cursor="nwse-resize" onPointerDown={(event) => drag.begin(event, 'resize', 'wafer')} />
              ))}
              <line x1={0} y1={-waferLayout.heightCm / 2} x2={0} y2={-waferLayout.heightCm / 2 - handle * 1.8} className="stroke-mermelada" strokeWidth={handle / 8} pointerEvents="none" />
              <Handle x={0} y={-waferLayout.heightCm / 2 - handle * 2.4} size={handle} cursor="grab" onPointerDown={(event) => drag.begin(event, 'rotate', 'wafer')} />
            </g>
          )}
        </g>
      )}

      {messageLayout && geometry && (
        <g transform={`translate(${messageLayout.x * lid.radius} ${-messageLayout.y * lid.radius}) rotate(${messageLayout.rotation})`} data-testid="mensaje-editor">
          <g
            onPointerDown={(event) => drag.begin(event, 'move', 'message')}
            style={{ cursor: 'move' }}
            className="touch-none"
            fill={message.color.ink}
            fontFamily={MESSAGE_FONT_FAMILY}
            fontWeight={MESSAGE_FONT_WEIGHT}
            fontSize={geometry.fontSizeCm}
            textAnchor="middle"
          >
            {/* Un área de toque que cubre el texto: las letras solas son muy delgadas para atinarles. */}
            <rect x={geometry.bounds.minX} y={-geometry.bounds.maxY} width={geometry.bounds.maxX - geometry.bounds.minX} height={geometry.bounds.maxY - geometry.bounds.minY} fill="transparent" />
            {geometry.glyphs.map((glyph, index) => (
              <text key={index} transform={`translate(${glyph.x} ${-glyph.y}) rotate(${glyph.rotation})`} y={BASELINE_BELOW_CENTER * geometry.fontSizeCm} pointerEvents="none">
                {glyph.text}
              </text>
            ))}
          </g>
          {selectedMessage && (
            <g data-testid="asas-mensaje">
              <rect
                x={geometry.bounds.minX}
                y={-geometry.bounds.maxY}
                width={geometry.bounds.maxX - geometry.bounds.minX}
                height={geometry.bounds.maxY - geometry.bounds.minY}
                fill="none"
                className="stroke-mermelada"
                strokeWidth={handle / 8}
                strokeDasharray={`${handle / 2} ${handle / 3}`}
                pointerEvents="none"
              />
              <Handle x={geometry.bounds.maxX} y={-geometry.bounds.minY} size={handle} cursor="nwse-resize" onPointerDown={(event) => drag.begin(event, 'scale', 'message')} />
              <line x1={0} y1={-geometry.bounds.maxY} x2={0} y2={-geometry.bounds.maxY - handle * 1.8} className="stroke-mermelada" strokeWidth={handle / 8} pointerEvents="none" />
              <Handle x={0} y={-geometry.bounds.maxY - handle * 2.4} size={handle} cursor="grab" onPointerDown={(event) => drag.begin(event, 'rotate', 'message')} />
            </g>
          )}
        </g>
      )}
    </svg>
  )
}
