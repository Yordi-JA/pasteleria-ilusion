import type { ReactNode } from 'react'
import Card from '../../components/Card.tsx'
import FactTable from '../../components/FactTable.tsx'
import { buttonClasses } from '../../components/buttonStyles.ts'
import { inlineLink } from '../../components/focus.ts'
import Pending from '../../components/Pending.tsx'
import Skeleton from '../../components/Skeleton.tsx'
import type { ReferenceFact } from '../../viewmodels/referenceView.ts'
import { whatsappLink } from '../../viewmodels/referenceView.ts'
import type { PhotoView } from '../../viewmodels/useReferenceRequest.ts'
import type { StoreDetails } from '../../viewmodels/useStoreInfo.ts'

export const column = 'mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4'
export const twoColumns = `${column} grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-12 py-12 max-[900px]:grid-cols-1`
export const sectionTitle = 'font-display text-titulo-2'

type WhatsAppProps = {
  store: StoreDetails
  /** El mensaje ya escrito, por ejemplo "Hola, quiero pedir un cambio a mi cotización #7." */
  message: string
  children: ReactNode
  /** `button`: con forma de botón secundario ("Pedir un cambio"); por omisión, enlace de texto. */
  variant?: 'text' | 'button'
}

/**
 * Un enlace a WhatsApp con el número de la pastelería (`GET store/info/`) y el mensaje escrito. Sin número, el marcador
 * PENDIENTE en su lugar: nunca un número supuesto.
 */
export function WhatsAppLink({ store, message, children, variant = 'text' }: WhatsAppProps) {
  if (store.status === 'loading') return <Skeleton inline className="h-5 w-40 align-middle" />
  const href = whatsappLink(store.whatsapp?.url ?? null, message)
  if (!href) {
    return (
      <span className="text-cuerpo">
        WhatsApp <Pending what="número" />
      </span>
    )
  }
  const style =
    variant === 'button'
      ? buttonClasses('secondary')
      : `${inlineLink} inline-flex min-h-11 items-center text-etiqueta font-semibold`
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={style}>
      {children}
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  )
}

/** "Qué sigue" de `/pedido/referencia` (mockup `Referencia`): cómo funciona y WhatsApp para platicarlo. */
export function HowItWorks({ store }: { store: StoreDetails }) {
  return (
    <section aria-labelledby="referencia-sigue" className="flex flex-col gap-4">
      <h2 id="referencia-sigue" className={sectionTitle}>
        Qué sigue
      </h2>
      <Card large className="flex flex-col gap-4">
        <h3 className="font-display text-titulo-3">Cómo funciona</h3>
        <p className="text-cuerpo text-mermelada-suave">
          Nos mandas tus fotos y lo que quieres que tomemos de ellas. En máximo 1 hora te enviamos la cotización por correo y también
          la ves en tu cuenta. Solo si la aceptas, pagas y empezamos tu pastel.
        </p>
        <div className="flex flex-col items-start gap-1 border-t border-relieve pt-4">
          <p className="text-cuerpo text-mermelada-suave">¿Prefieres platicarlo?</p>
          <WhatsAppLink store={store} message="Hola, quiero cotizar un pastel con una foto de referencia.">
            Escribir por WhatsApp
          </WhatsAppLink>
        </div>
      </Card>
    </section>
  )
}

type SummaryProps = {
  title: string
  headingId: string
  photos: PhotoView[]
  description: string
  facts: ReferenceFact[]
}

/** Las fotos, la descripción y los datos de la solicitud (mockups `SolicitudEnviada` y `Cotizacion`). */
export function ReferenceSummary({ title, headingId, photos, description, facts }: SummaryProps) {
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4">
      <h2 id={headingId} className={sectionTitle}>
        {title}
      </h2>
      <Card large className="flex flex-col gap-4">
        <ul className="grid grid-cols-2 gap-3" aria-label="Tus fotos">
          {photos.map((photo) => (
            <li key={photo.id} className="flex aspect-[4/3] min-w-0 items-center justify-center overflow-hidden rounded-md bg-harina">
              {photo.url ? (
                <img src={photo.url} alt={`Foto de referencia: ${photo.name}`} className="h-full w-full object-cover" />
              ) : photo.failed ? (
                <span className="break-all px-3 text-center text-nota text-mermelada-suave">No pudimos mostrar {photo.name}</span>
              ) : (
                <Skeleton radius="md" className="h-full w-full" />
              )}
            </li>
          ))}
        </ul>
        <p className="whitespace-pre-line break-words text-cuerpo">“{description}”</p>
        <FactTable facts={facts} caption={`Datos de ${title.toLocaleLowerCase('es-MX')}`} />
      </Card>
    </section>
  )
}
