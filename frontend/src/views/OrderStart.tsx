import { Cake } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import Breadcrumb from '../components/Breadcrumb.tsx'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import LeadDays from '../components/LeadDays.tsx'
import LineDrawing from '../components/LineDrawing.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { useOrderStart } from '../viewmodels/useOrderStart.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Realizar pedido'

type ChoiceProps = {
  id: string
  drawing: ReactNode
  title: string
  text: ReactNode
  note: string
  action: string
  to: string
}

/** Una de las dos formas de encargar (`PedidoElegir.dc.html`): región con su encabezado y un enlace con forma de botón. */
function Choice({ id, drawing, title, text, note, action, to }: ChoiceProps) {
  return (
    <Card as="section" large aria-labelledby={id} className="flex flex-col items-start gap-4 p-8 max-[600px]:p-6">
      {drawing}
      <h2 id={id} className="font-display text-titulo-2">
        {title}
      </h2>
      <p className="text-cuerpo text-mermelada-suave">{text}</p>
      <p className="text-nota font-semibold text-mermelada-suave">{note}</p>
      <ButtonLink to={to} variant="secondary">
        {action}
      </ButtonLink>
    </Card>
  )
}

/** `/pedido`: elegir entre "Diseña tu pastel" y el envío de una foto de referencia. Sin pastel 3D (regla del proyecto). */
export default function OrderStart() {
  usePageTitle(TITLE)
  const { leadDays } = useOrderStart()
  return (
    <>
      <PageHeader title={TITLE} before={<Breadcrumb items={[{ label: 'Inicio', to: '/' }, { label: TITLE }]} />}>
        <p className="max-w-[620px] text-cuerpo text-mermelada-suave">Elige cómo quieres encargar tu pastel.</p>
      </PageHeader>
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-8 px-6 pb-20 pt-14 max-[960px]:grid-cols-1 max-[600px]:px-4 max-[600px]:pb-12 max-[600px]:pt-8">
        <Choice
          id="elegir-disena"
          drawing={<Cake size={72} weight="regular" aria-hidden="true" className="text-mermelada opacity-45" />}
          title="Diseña tu pastel"
          text={
            <>
              Eliges tamaño, pan, relleno, cobertura y decoración, y ves el pastel y el precio al momento. Se pide con{' '}
              <LeadDays days={leadDays} /> de anticipación.
            </>
          }
          note="Precio al momento"
          action="Empezar a diseñar"
          to="/pedido/disena"
        />
        <Choice
          id="elegir-referencia"
          drawing={<LineDrawing drawing="toldo" size={72} className="text-mermelada opacity-45" />}
          title="Envía una foto de referencia"
          text="¿Ya tienes una idea o una foto de otro pastel? Mándanosla y te cotizamos. No se cobra nada hasta que aceptes."
          note="Cotización en máximo 1 hora"
          action="Enviar referencia"
          to="/pedido/referencia"
        />
      </div>
    </>
  )
}
