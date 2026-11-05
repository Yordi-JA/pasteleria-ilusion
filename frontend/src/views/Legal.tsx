import Card from '../components/Card.tsx'
import PageHeader from '../components/PageHeader.tsx'
import Pending from '../components/Pending.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

const TITLE = 'Aviso de privacidad y términos'

const SECTIONS = [
  { id: 'privacidad', heading: 'Aviso de privacidad' },
  { id: 'terminos', heading: 'Términos y condiciones' },
] as const

/**
 * `/legal`, con anclas `#privacidad` y `#terminos` (libro de marca, "Páginas legales"). Los textos los
 * redacta la pastelería y siguen PENDIENTES: nunca se inventan. Cada sección recibe el foco al llegar por
 * su ancla (`useRouteFocus`) y deja espacio arriba para la barra fija.
 */
export default function Legal() {
  usePageTitle(TITLE)
  return (
    <>
      <PageHeader title={TITLE} />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-6 py-12 max-[600px]:px-4">
        {SECTIONS.map(({ id, heading }) => (
          <section
            key={id}
            id={id}
            tabIndex={-1}
            aria-labelledby={`${id}-titulo`}
            className="flex scroll-mt-28 flex-col gap-4 outline-none"
          >
            <h2 id={`${id}-titulo`} className="font-display text-titulo-2">
              {heading}
            </h2>
            <Card>
              <p>
                <Pending what="Texto" />
              </p>
            </Card>
          </section>
        ))}
      </div>
    </>
  )
}
