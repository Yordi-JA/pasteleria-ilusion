/**
 * Muestras de color redondas, solo para mirar: el código y el nombre van siempre en texto junto a ellas. Los colores que pinta son
 * los que eligió la persona para su pastel (comida), no colores de la interfaz; el borde es el token `relieve`.
 */
export default function ColorSwatches({ colors, className = '' }: { colors: readonly string[]; className?: string }) {
  return (
    <span aria-hidden="true" className={`flex gap-1 ${className}`}>
      {colors.map((color, index) => (
        <span key={`${color}-${index}`} className="h-5 w-5 shrink-0 rounded-full border border-relieve" style={{ backgroundColor: color }} />
      ))}
    </span>
  )
}
