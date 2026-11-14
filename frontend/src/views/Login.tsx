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
 * "Mis pedidos"); quien ya tiene sesión pasa directo. "¿Olvidaste tu contraseña?" no aparece mientras la recuperación
 * no exista (D61: solo si sobra tiempo), para no llevar a una página vacía.
 */
export default function Login() {
  usePageTitle(TITLE)
  const session = useSession()
  const access = useAccessReturn()
  const { refs: { email: emailRef, password: passwordRef }, ...form } = useLogin(access.goToReturn)
  const google = useGoogleSignIn('signin', access.goToReturn)

  // Quien ya tenía sesión pasa directo. Mientras un envío termina, el salto lo da el envío (o el aviso de cuenta ligada).
  if (session.status === 'authenticated' && !google.linked && !form.submitting && !google.submitting) {
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
          {form.notice && (
            <Notice tone="error" title={form.notice.title}>
              {form.notice.detail}
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
          <Button type="submit" disabled={form.submitting} className="mt-1 w-full">
            {form.submitting ? 'Entrando…' : 'Iniciar sesión'}
          </Button>
        </form>
      </AccessCard>
    </AccessLayout>
  )
}
