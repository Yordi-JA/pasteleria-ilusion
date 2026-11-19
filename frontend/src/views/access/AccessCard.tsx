import type { ReactNode } from 'react'
import Button from '../../components/Button.tsx'
import Notice from '../../components/Notice.tsx'
import type { GoogleSignInView } from '../../viewmodels/useGoogleSignIn.ts'

/**
 * El botón oficial de Google, dibujado por su librería dentro de `container` (conserva sus colores, libro de marca,
 * "Inicio de sesión y pagos"). Su lugar mide siempre 44 px y recorta lo que se salga, así no brinca al cargar; si la
 * librería no carga, lo dice y deja el correo.
 */
function GoogleButton({ google: { container, ...google } }: { google: GoogleSignInView }) {
  return (
    <div className="flex flex-col gap-3">
      <div
        ref={container}
        data-testid="boton-google"
        data-state={google.status}
        aria-busy={google.status === 'loading' || undefined}
        // Alto fijo y recortado: el lugar del botón mide lo mismo antes y después de que Google lo dibuje (tanda 1).
        className={`flex h-11 items-center justify-center overflow-hidden ${google.status === 'failed' ? 'hidden' : ''}`}
      />
      {google.status === 'failed' && (
        <Notice title="No pudimos cargar el acceso con Google." live={false}>
          Revisa tu conexión o entra con tu correo.
        </Notice>
      )}
      <p role="status" className="sr-only">
        {google.submitting ? 'Entrando con Google…' : ''}
      </p>
      {google.notice && (
        <Notice tone="error" title={google.notice.title}>
          {google.notice.detail}
        </Notice>
      )}
    </div>
  )
}

/** "o con tu correo" seguido de una línea `relieve` que corre hasta el borde, como un renglón de libreta. */
function Divider() {
  return (
    <div className="flex items-center gap-3 text-nota text-mermelada-suave">
      o con tu correo
      <span aria-hidden="true" className="h-px flex-1 bg-relieve" />
    </div>
  )
}

/**
 * La tarjeta principal de `/entrar` y `/registro`: `h1`, la línea de abajo, Google (si hay client ID), el correo y el
 * pie. Si la cuenta quedó ligada a Google y su contraseña dejó de servir, la tarjeta lo avisa antes de seguir.
 */
export default function AccessCard({
  title,
  subtitle,
  google,
  children,
  footer,
}: {
  title: string
  subtitle: { withGoogle: string; emailOnly: string }
  google: GoogleSignInView
  children: ReactNode
  footer: ReactNode
}) {
  const withGoogle = google.status !== 'hidden'
  return (
    <div className="flex flex-col gap-5 rounded-lg border border-relieve bg-betun p-10 text-mermelada max-[600px]:px-5 max-[600px]:py-7">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-titulo-1">{title}</h1>
        <p className="text-mermelada-suave">{withGoogle ? subtitle.withGoogle : subtitle.emailOnly}</p>
      </div>
      {google.linked ? (
        <div className="flex flex-col gap-4">
          <Notice tone="success" title="Tu cuenta ya entra con Google.">
            La contraseña que tenías para este correo dejó de servir. Desde ahora entra con el botón de Google.
          </Notice>
          <Button variant="primary" onClick={google.continueAfterLink}>
            Continuar
          </Button>
        </div>
      ) : (
        <>
          {withGoogle && (
            <>
              <GoogleButton google={google} />
              <Divider />
            </>
          )}
          {children}
          {footer}
        </>
      )}
    </div>
  )
}
