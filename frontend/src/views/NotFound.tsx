import { Link } from 'react-router'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-nata font-sans text-cuerpo text-mermelada">
      <h1 className="font-display text-titulo-1">No encontramos esta página</h1>
      <Link to="/" className="font-semibold underline">
        Ir a inicio
      </Link>
    </main>
  )
}
