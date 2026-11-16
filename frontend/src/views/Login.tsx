import { Link, Navigate } from 'react-router'
import Button from '../components/Button.tsx'
import { inlineLink } from '../components/focus.ts'
import Notice from '../components/Notice.tsx'
import PasswordField from '../components/PasswordField.tsx'
import TextField from '../components/TextField.tsx'
import { useAccessReturn } from '../viewmodels/useAccessReturn.ts'
import { useGoogleSignIn } from '../viewmodels/useGoogleSignIn.ts'
import { useLogin } from '../viewmodels/useLogin.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useSession } from '../viewmodels/useSession.ts'
import AccessCard from './access/AccessCard.tsx'
import AccessLayout from './access/AccessLayout.tsx'
import LegalLinks from './access/LegalLinks.tsx'

const TITLE = 'Inicia sesión'

/**
 * `/entrar` (Login.dc.html y LoginError.dc.html): Google y correo con contraseña. Al entrar vuelve a `?volver=` (o a
 * "Mis pedidos"); quien ya tiene sesión pasa directo. "¿Olvidaste tu contraseña?" lleva a `/recuperar` (D76). Una
 * cuenta sin confirmar ve "Confirma tu correo" con "Reenviar enlace", que lleva a `/verificar`.
 */
export default function Login() {
  usePageTitle(TITLE)
  const session = useSession()
  const access = useAccessReturn()
  const { refs: { email: emailRef, password: passwordRef }, ...form } = useLogin(access.goToReturn)
  const google = useGoogleSignIn('signin', access.goToReturn)

  // Quien ya tenía sesión pasa directo. Mientras un envío termina, el salto lo da el envío (o el aviso de cuenta ligada).
  // Después de confirmar otra cuenta (D76) se queda: la sesión abierta no cambia y el aviso pide entrar.
  if (session.status === 'authenticated' && !google.linked && !form.submitting && !google.submitting && !form.accountConfirmed) {
    return <Navigate to={access.returnTo} replace />
  }

  return (
    <AccessLayout slogan="Qué gusto verte de nuevo.">
      <AccessCard
        title={TITLE}
        subtitle={{ withGoogle: 'Entra con Google o con tu correo.', emailOnly: 'Entra con tu correo.' }}
        google={google}
        footer={
          <>
            <p className="text-center">
              ¿No tienes cuenta?{' '}
              <Link to={access.registerLink} className={`font-semibold ${inlineLink}`}>
                Crear cuenta
              </Link>
            </p>
            <p className="text-nota text-mermelada-suave">
              Al continuar aceptas <LegalLinks />.
            </p>
          </>
        }
      >
        <form noValidate onSubmit={form.submit} aria-label="Iniciar sesión con correo" className="flex flex-col gap-4">
          {form.accountConfirmed && <Notice tone="success" title="Tu cuenta quedó confirmada. Entra con tu contraseña." />}
          {form.notice && (
            <Notice tone="error" title={form.notice.title}>
              {form.notice.detail}
            </Notice>
          )}
          {form.unverified.email && (
            <Notice tone="attention" title="Confirma tu correo.">
              <div className="flex flex-col items-start gap-3">
                <span>Te enviamos un enlace al crear tu cuenta. Ábrelo para entrar o pide otro.</span>
                {form.unverified.notice && (
                  <span className="font-semibold text-error">
                    {form.unverified.notice.title} {form.unverified.notice.detail}
                  </span>
                )}
                <Button variant="secondary" disabled={form.unverified.sending} onClick={form.unverified.resend}>
                  {form.unverified.sending ? 'Reenviando…' : 'Reenviar enlace'}
                </Button>
              </div>
            </Notice>
          )}
          <TextField
            ref={emailRef}
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nombre@correo.com"
            value={form.email.value}
            onChange={(event) => form.email.onChange(event.target.value)}
            error={form.email.error}
          />
          <PasswordField
            ref={passwordRef}
            label="Contraseña"
            autoComplete="current-password"
            placeholder="Escribe tu contraseña"
            value={form.password.value}
            onChange={(event) => form.password.onChange(event.target.value)}
            error={form.password.error}
          />
          <Link to="/recuperar" className={`-mt-1.5 self-end text-nota font-semibold ${inlineLink}`}>
            ¿Olvidaste tu contraseña?
          </Link>
          <Button type="submit" disabled={form.submitting} className="mt-1 w-full">
            {form.submitting ? 'Entrando…' : 'Iniciar sesión'}
          </Button>
        </form>
      </AccessCard>
    </AccessLayout>
  )
}
