import Button from './Button.tsx'
import Notice from './Notice.tsx'

type LoadErrorNoticeProps = {
  /** Qué no se pudo cargar, como título del aviso: "No se pudo cargar la vitrina". */
  title: string
  onRetry: () => void
}

/**
 * Error al cargar los datos de una sección: aviso de falla (`role="alert"`, libro de marca, "Estados") que dice qué
 * pasó y cómo seguir, con un botón para volver a pedir. Cada sección lleva el suyo, así una falla no tumba las demás.
 */
export default function LoadErrorNotice({ title, onRetry }: LoadErrorNoticeProps) {
  return (
    <Notice tone="error" title={title} className="self-start">
      <div className="flex flex-col items-start gap-3">
        <p>Vuelve a intentarlo en un momento.</p>
        <Button variant="secondary" onClick={onRetry}>
          Volver a intentar
        </Button>
      </div>
    </Notice>
  )
}
