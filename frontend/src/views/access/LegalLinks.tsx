import { Link } from 'react-router'
import { inlineLink } from '../../components/focus.ts'

/** "los Términos y condiciones y el Aviso de privacidad", con sus anclas de `/legal`. */
export default function LegalLinks() {
  return (
    <>
      los{' '}
      <Link to="/legal#terminos" className={inlineLink}>
        Términos y condiciones
      </Link>{' '}
      y el{' '}
      <Link to="/legal#privacidad" className={inlineLink}>
        Aviso de privacidad
      </Link>
    </>
  )
}
