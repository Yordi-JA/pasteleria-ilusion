import { Link, Navigate } from 'react-router'
import Button from '../components/Button.tsx'
import { buttonClasses } from '../components/buttonStyles.ts'
import { inlineLink } from '../components/focus.ts'
import Notice from '../components/Notice.tsx'
import TextField from '../components/TextField.tsx'
import { hoursText } from '../viewmodels/accountLinks.ts'
import { useEmailVerification } from '../viewmodels/useEmailVerification.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useResendVerification } from '../viewmodels/useResendVerification.ts'
import { useSession } from '../viewmodels/useSession.ts'
import AccessLayout from './access/AccessLayout.tsx'
import AccessPanel, { AccessAside } from './access/AccessPanel.tsx'

const TITLES = {
  idle: 'Revisa tu correo',
  verifying: 'Confirmando tu cuenta',
  invalid: 'Este enlace ya no sirve',
  failed: 'Revisa tu correo',
} as const

/**
 * "¿No te llegó?" (Verificar.dc.html): reenviar el enlace, con el correo si no se conoce, y la espera de 60 s. La
 * cuenta regresiva no es región viva (se leería cada segundo): el botón la nombra con `aria-describedby` y lo que se
 * anuncia una vez es el envío, en `role="status"`.
 */
function ResendLink({ knownEmail, justSent }: { knownEmail: string | null; justSent: boolean }) {
  const {
    refs: { email: emailRef },
    ...resend
  } = useResendVerification({ knownEmail, justSent })
  return (
    <AccessAside>
      <strong className="font-semibold">¿No te llegó?</strong>
      <span className="text-mermelada-suave">Revisa la carpeta de correo no deseado o pide otro enlace.</span>
      <form noValidate onSubmit={resend.resend} aria-label="Reenviar el enlace" className="flex flex-col gap-3">
        {resend.email && (
          <TextField
            ref={emailRef}
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nombre@correo.com"
            value={resend.email.value}
            onChange={(event) => resend.email?.onChange(event.target.value)}
            error={resend.email.error}
          />
        )}
        {resend.notice && (
          <Notice tone="error" title={resend.notice.title}>
            {resend.notice.detail}
          </Notice>
        )}
        <button
          type="submit"
          aria-disabled={resend.waiting || resend.sending || undefined}
          aria-describedby={resend.waiting ? 'espera-reenvio' : undefined}
          className={`self-start ${buttonClasses('secondary', resend.waiting || resend.sending)}`}
        >
          {resend.sending ? 'Reenviando…' : 'Reenviar enlace'}
        </button>
      </form>
      <div className="flex flex-col gap-1 text-nota">
        {/* Siempre montada, para que el envío se anuncie al llegar. */}
        <p role="status" className="text-mermelada">
          {resend.sentText}
        </p>
        {resend.waitText && (
          <span id="espera-reenvio" data-testid="espera-reenvio" className="text-mermelada-suave">
            {resend.waitText}
          </span>
        )}
      </div>
    </AccessAside>
  )
}

/**
 * `/verificar` (Verificar.dc.html, D76): "Revisa tu correo" después de registrarse, con a qué correo fue el enlace y en
 * cuántas horas vence (las horas las dice el backend). Con `#<token>`, abre el enlace: confirma la cuenta y lleva a
 * `/cuenta`; si el enlace ya no sirve, lo dice y deja pedir otro.
 */
export default function EmailVerification() {
  const session = useSession()
  const verification = useEmailVerification()
  const { phase, sent } = verification
  const title = TITLES[phase]
  usePageTitle(title)

  // Quien ya tiene sesión y no trae un enlace no tiene nada que confirmar.
  if (session.status === 'authenticated' && phase === 'idle') return <Navigate to="/cuenta" replace />

  const intro =
    phase === 'verifying' ? (
      <p role="status" className="text-mermelada-suave">
        Confirmando tu cuenta…
      </p>
    ) : phase === 'invalid' ? (
      <p className="text-mermelada-suave">Escribe tu correo y te mandamos otro enlace para confirmar tu cuenta.</p>
    ) : (
      <p data-testid="verificacion-intro" className="text-mermelada-suave">
        Te enviamos un enlace a {sent ? <strong className="font-semibold text-mermelada">{sent.email}</strong> : 'tu correo'} para confirmar tu
        cuenta.{sent && ` Vence en ${hoursText(sent.expiresInHours)}.`}
      </p>
    )

  return (
    <AccessLayout slogan="Ya casi está lista tu cuenta." cake="static">
      <AccessPanel title={title} intro={intro}>
        {phase === 'failed' && verification.failure && (
          <div className="flex flex-col gap-3">
            <Notice tone="error" title="No pudimos confirmar tu cuenta.">
              {verification.failure.detail}
            </Notice>
            <Button variant="primary" onClick={verification.retry} className="self-start">
              Volver a intentar
            </Button>
          </div>
        )}
        {phase === 'invalid' && (
          <Notice tone="error" title="No pudimos confirmar tu cuenta con este enlace.">
            Venció, ya se usó o está incompleto. Pide otro con tu correo.
          </Notice>
        )}
        {phase !== 'verifying' && (
          // Con el enlace que ya no sirve no se sabe el correo: se pide.
          <ResendLink knownEmail={phase === 'invalid' ? null : (sent?.email ?? null)} justSent={phase === 'idle' && sent !== null} />
        )}
        {phase === 'invalid' ? (
          <p className="text-center">
            ¿Ya la confirmaste?{' '}
            <Link to="/entrar" className={`font-semibold ${inlineLink}`}>
              Iniciar sesión
            </Link>
          </p>
        ) : (
          phase !== 'verifying' && (
            <p className="text-center">
              ¿Escribiste mal tu correo?{' '}
              <Link to="/registro" className={`font-semibold ${inlineLink}`}>
                Cámbialo
              </Link>
            </p>
          )
        )}
      </AccessPanel>
    </AccessLayout>
  )
}
