import type { ReactNode } from 'react'

export type Fact = {
  label: string
  value: ReactNode
  /** Segunda línea más chica bajo el valor (por ejemplo, dónde se recoge). */
  note?: string
}

type FactTableProps = {
  facts: Fact[]
  /** Qué describe la tabla, para el lector de pantalla. */
  caption: string
}

/**
 * Datos en renglones de etiqueta y valor, con una línea entre renglones (mockups `CuentaBases` y `NotaVerificada`). Es
 * una tabla de verdad: el lector de pantalla dice cada etiqueta con su valor.
 */
export default function FactTable({ facts, caption }: FactTableProps) {
  return (
    <table className="w-full border-collapse text-cuerpo">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {facts.map((fact) => (
          <tr key={fact.label} className="border-t border-relieve first:border-t-0">
            <th scope="row" className="py-3 pr-4 text-left align-top font-normal text-mermelada-suave">
              {fact.label}
            </th>
            <td className="py-3 text-right align-top font-semibold text-mermelada">
              {fact.value}
              {fact.note && <span className="block text-nota font-normal text-mermelada-suave">{fact.note}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
