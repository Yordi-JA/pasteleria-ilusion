/**
 * Los dibujos de línea de `assets/motivos/` que usan la vitrina, las rebanadas, las bases y el catálogo (libro de marca,
 * "Dibujos de línea").
 */
export type LineDrawingName = 'toldo' | 'rebanada' | 'base' | 'pisos'

const paths: Record<LineDrawingName, string[]> = {
  // `dibujo-toldo.svg`: el toldo de la fachada.
  toldo: ['M10 12h44v4H10zM10 16v16M54 16v16M21 16v16M32 16v16M43 16v16', 'M10 32q5.5 6 11 0t11 0 11 0 11 0', 'M14 40v16M50 40v16M12 56h40M28 56V44h8v12'],
  // `dibujo-rebanada.svg`: una rebanada con su vela.
  rebanada: ['M8 30l40-12 8 8z', 'M8 30v18l48-4V26M8 39l48-4', 'M50 12q2-4 5-5'],
  // `dibujo-base.svg`: el pastel sobre la base de pie. El rectángulo y las dos elipses del SVG van como trazos.
  base: [
    'M22 16h20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H22a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
    'M20 18q3 3 6 0t6 0 6 0 6 0',
    'M10 31a22 4 0 1 0 44 0a22 4 0 1 0-44 0',
    'M29 35l-2 15h10l-2-15',
    'M22 52a10 3 0 1 0 20 0a10 3 0 1 0-20 0',
  ],
  // `dibujo-pisos.svg`: el pastel de dos pisos con su vela. Los dos rectángulos del SVG van como trazos.
  pisos: [
    'M18 34h28a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V36a2 2 0 0 1 2-2z',
    'M24 22h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H24a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
    'M16 36q4 4 8 0t8 0 8 0 8 0M22 24q2.5 3 5 0t5 0 5 0 5 0M32 22v-8M10 54h44',
    'M32 6c2 2.5 3 4 2 6-.5 1-1.5 1.5-2 1.5s-1.5-.5-2-1.5c-1-2 0-3.5 2-6z',
  ],
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
