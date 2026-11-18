import { Check } from '@phosphor-icons/react'

const PARTS = ['Fecha y hora', '¿Quién recoge?'] as const

/**
 * Las dos partes de la entrega (tanda 3): dos segmentos con su nombre y sin número, para no confundirse con "2 Entrega" de
 * los pasos de la compra. La parte actual lleva `aria-current="step"` y su segmento lleno; la terminada, palomita. El lector
 * de pantalla oye "parte 1 de 2" y, en la terminada, "hecho": cada estado lleva palabra.
 */
export default function DeliveryProgress({ current }: { current: 1 | 2 }) {
  return (
    <ol aria-label="Partes de la entrega" className="grid grid-cols-2 gap-2">
      {PARTS.map((name, index) => {
        const number = index + 1
        const done = number < current
        const now = number === current
        return (
          <li key={name} aria-current={now ? 'step' : undefined} className="flex flex-col gap-2">
            <span aria-hidden="true" className={`h-1.5 rounded-full ${done || now ? 'bg-mermelada' : 'bg-relieve'}`} />
            <span className={`flex items-center gap-1.5 text-nota ${now ? 'font-semibold text-mermelada' : done ? 'text-mermelada' : 'text-mermelada-suave'}`}>
              {done && <Check size={14} weight="bold" aria-hidden="true" className="shrink-0" />}
              {name}
              <span className="sr-only">
                , parte {number} de {PARTS.length}
                {done && ', hecho'}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
