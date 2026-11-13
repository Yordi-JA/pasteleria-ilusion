import { useEffect, useRef } from 'react'
import Button from '../../components/Button.tsx'
import { focusRing } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import type { PrefillNotice as PrefillNoticeState } from '../../viewmodels/useDesignPrefill.ts'

type PrefillNoticeProps = {
  notice: PrefillNoticeState
  onStartWithProduct: () => void
  onKeepDesign: () => void
  onRetry: () => void
  /** La pregunta ya tomó el foco una vez: no lo vuelve a tomar al regresar al paso 1. */
  onAskFocused: () => void
  /** A dónde va el foco cuando la pregunta se responde y su botón desaparece: el título del paso. */
  onAnswered: () => void
}

/**
 * La pregunta cuando ya había un diseño a medias (D59): una región con nombre que recibe el foco la primera vez que
 * aparece, para que quien usa teclado o lector sepa que hay que decidir antes de seguir. Ninguna de las dos salidas es
 * la principal: el botón principal de la pantalla sigue siendo "Continuar".
 */
function AskNotice({
  productName,
  autoFocus,
  onStartWithProduct,
  onKeepDesign,
  onAskFocused,
  onAnswered,
}: { productName: string; autoFocus: boolean } & Omit<PrefillNoticeProps, 'notice' | 'onRetry'>) {
  const region = useRef<HTMLElement>(null)
  // Solo al montar: si ya tomó el foco antes (y se volvió al paso 1), no se lo quita al título del paso.
  const focusOnMount = useRef(autoFocus)
  useEffect(() => {
    if (!focusOnMount.current) return
    region.current?.focus()
    onAskFocused()
  }, [onAskFocused])
  return (
    <section ref={region} tabIndex={-1} aria-label="Ya tienes un diseño a medias" data-testid="aviso-prellenado" className={`rounded-md ${focusRing}`}>
      <Notice tone="attention" title="Ya tienes un diseño a medias" live={false}>
        <div className="flex flex-col gap-3">
          <p>
            ¿Sigues con tu diseño o empiezas con {productName}? Si empiezas con {productName}, se borra lo que llevas.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                onKeepDesign()
                onAnswered()
              }}
            >
              Seguir con mi diseño
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                onStartWithProduct()
                onAnswered()
              }}
            >
              Empezar con {productName}
            </Button>
          </div>
        </div>
      </Notice>
    </section>
  )
}

function Content({ notice, onRetry, ...rest }: Omit<PrefillNoticeProps, 'onRetry'> & { onRetry: () => void }) {
  switch (notice.kind) {
    case 'ask':
      return <AskNotice productName={notice.productName} autoFocus={notice.autoFocus} {...rest} />
    case 'applied':
      return (
        <Notice tone="info" title={`Empezaste con ${notice.productName}`}>
          {notice.detail}
        </Notice>
      )
    case 'unavailable':
      return (
        <Notice tone="info" title={`No pudimos empezar con ${notice.productName}`}>
          {notice.detail}
        </Notice>
      )
    case 'notFound':
      return (
        <Notice tone="info" title="Ese pastel ya no está en el catálogo">
          Diseña el tuyo desde aquí.
        </Notice>
      )
    case 'retrying':
      return <Notice tone="info" title="Buscando el pastel…" />
    default:
      return (
        <Notice tone="attention" title="No pudimos traer el pastel que elegiste">
          <div className="flex flex-col items-start gap-3">
            <p>Puedes diseñar el tuyo desde aquí o volver a intentarlo.</p>
            <Button variant="secondary" onClick={onRetry}>
              Volver a intentar
            </Button>
          </div>
        </Notice>
      )
  }
}

/**
 * Avisos de "Personalizar este pastel" sobre la barra de pasos de "Diseña tu pastel". El contenedor se queda montado
 * mientras haya aviso: al pulsar "Volver a intentar", el foco pasa a él antes de que el botón desaparezca, y ahí sigue
 * mientras el aviso cambia a "Buscando el pastel…" y luego al resultado.
 */
export default function PrefillNotice({ onRetry, ...props }: PrefillNoticeProps) {
  const box = useRef<HTMLDivElement>(null)
  return (
    <div ref={box} tabIndex={-1} role="group" aria-label="Aviso de tu pastel" className={`rounded-md ${focusRing}`}>
      <Content
        {...props}
        onRetry={() => {
          box.current?.focus()
          onRetry()
        }}
      />
    </div>
  )
}
