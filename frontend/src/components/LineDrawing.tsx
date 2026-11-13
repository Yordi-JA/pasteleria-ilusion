/** Los dibujos de línea de `assets/motivos/` que usan la vitrina y las rebanadas (libro de marca, "Dibujos de línea"). */
export type LineDrawingName = 'toldo' | 'rebanada'

const paths: Record<LineDrawingName, string[]> = {
  // `dibujo-toldo.svg`: el toldo de la fachada.
  toldo: ['M10 12h44v4H10zM10 16v16M54 16v16M21 16v16M32 16v16M43 16v16', 'M10 32q5.5 6 11 0t11 0 11 0 11 0', 'M14 40v16M50 40v16M12 56h40M28 56V44h8v12'],
  // `dibujo-rebanada.svg`: una rebanada con su vela.
  rebanada: ['M8 30l40-12 8 8z', 'M8 30v18l48-4V26M8 39l48-4', 'M50 12q2-4 5-5'],
}

type LineDrawingProps = {
  drawing: LineDrawingName
  /** El color del trazo (`text-*`) y su opacidad: van según el campo, por eso los pone quien lo usa. */
  className?: string
  size?: number
}

/** Dibujo decorativo (`aria-hidden`): el texto de al lado dice lo que hace falta. */
export default function LineDrawing({ drawing, className = '', size = 112 }: LineDrawingProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className={className} fill="none" strokeWidth={2}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {paths[drawing].map((d) => (
          <path key={d} d={d} />
        ))}
        {drawing === 'rebanada' && <circle cx="49" cy="15" r="3" />}
      </g>
    </svg>
  )
}
