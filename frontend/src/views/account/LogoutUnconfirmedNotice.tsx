import Button from '../../components/Button.tsx'
import Notice from '../../components/Notice.tsx'

/**
 * Salir sin conexión (D62): este navegador ya no tiene la sesión, pero el servidor no recibió el aviso y la cookie del
 * refresh puede seguir viva. Importa en un equipo compartido, así que se dice y se ofrece repetirlo.
 */
export default function LogoutUnconfirmedNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 pb-4 max-[600px]:px-4">
      <Notice tone="attention" title="No pudimos avisar que saliste.">
        <span className="flex flex-col items-start gap-2">
          Aquí ya no hay sesión, pero sin conexión el aviso no llegó. Si este equipo lo usan otras personas, vuelve a
          intentarlo cuando tengas conexión.
          <Button variant="secondary" onClick={onRetry}>
            Volver a intentar
          </Button>
        </span>
      </Notice>
    </div>
  )
}
