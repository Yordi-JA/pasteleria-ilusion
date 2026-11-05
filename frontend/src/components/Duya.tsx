/** Campos de color de la página entre los que puede ir un borde de duya. */
export type DuyaField = 'fresa' | 'nata' | 'betun' | 'mermelada'

type DuyaProps = {
  /** `concha` bajo el encabezado, `perlas` en cambios fuertes de color, `guirnalda` siempre antes del pie. */
  type: 'concha' | 'perlas' | 'guirnalda'
  /** Color exacto del campo de arriba, del que cuelga el borde. */
  color: DuyaField
  /**
   * Color del campo de abajo. Pinta los 21 px que el borde ocupa en el flujo, para que la forma se lea
   * sobre ese campo sin márgenes negativos. Sin él, se ve el fondo del contenedor.
   */
  below?: DuyaField
}

// Clases completas y estáticas para que Tailwind las genere; el color sale del preset con theme().
const fieldColor: Record<DuyaField, string> = {
  fresa: '[--c:theme(colors.fresa)]',
  nata: '[--c:theme(colors.nata)]',
  betun: '[--c:theme(colors.betun)]',
  mermelada: '[--c:theme(colors.mermelada)]',
}

const fieldBackground: Record<DuyaField, string> = {
  fresa: 'bg-fresa',
  nata: 'bg-nata',
  betun: 'bg-betun',
  mermelada: 'bg-mermelada',
}

/** Borde de duya (libro de marca, "La duya"). La forma está en `index.css`, traducida de `design/referencia/duya.css`. */
export default function Duya({ type, color, below }: DuyaProps) {
  return (
    <div
      className={`duya ${fieldColor[color]} ${below ? fieldBackground[below] : ''}`}
      data-tipo={type}
      aria-hidden="true"
    />
  )
}
