import { Cake } from '@phosphor-icons/react'
import { Link } from 'react-router'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import FactTable from '../components/FactTable.tsx'
import { inlineLink } from '../components/focus.ts'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useStandLoans } from '../viewmodels/useStandLoans.ts'
import type { LoanedBaseView, ReturnedBaseView } from '../viewmodels/useStandLoans.ts'
import AccountHeader from './account/AccountHeader.tsx'

const TITLE = 'Bases en préstamo'

const column = 'mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-6 py-10 max-[600px]:px-4'

/** Una base prestada (CuentaBases.dc.html): su tamaño, su estado con palabra, el pedido, el depósito y la fecha límite. */
function LoanedBase({ base }: { base: LoanedBaseView }) {
  return (
    <li>
      <Card as="article" large className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-fresa" aria-hidden="true">
            <Cake size={28} weight="regular" />
          </span>
          <div className="flex flex-col">
            <h3 className="font-display text-titulo-3">{base.title}</h3>
            <p className="text-etiqueta">{base.statusLabel}, depósito retenido</p>
          </div>
        </div>
        <FactTable
          caption={`${base.title}: datos del préstamo`}
          facts={[
            {
              label: 'Prestada con el pedido',
              value: (
                <Link to={base.orderPath} className={inlineLink}>
                  #{base.orderId}
                </Link>
              ),
            },
            { label: 'Depósito', value: base.deposit },
            { label: base.dueLabel, value: base.due, note: base.dueNote },
          ]}
        />
        <ButtonLink to="/bases" variant="secondary" className="self-start">
          Cómo devolver una base
        </ButtonLink>
      </Card>
    </li>
  )
}

function ReturnedBase({ base }: { base: ReturnedBaseView }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-relieve py-4">
      <div className="flex flex-col">
        <h3 className="text-etiqueta">{base.title}</h3>
        <p className="text-nota text-mermelada-suave">{base.returnedOn}</p>
      </div>
      {base.refund && <p className="text-right text-nota font-semibold">{base.refund}</p>}
    </li>
  )
}

function HowItWorks() {
  return (
    <Card as="section" large className="flex flex-col gap-3 max-[960px]:order-last">
      <h2 className="font-display text-titulo-3">Cómo funciona el depósito</h2>
      <p className="text-cuerpo text-mermelada-suave">
        El depósito se cobra junto con tu pedido y queda retenido mientras tienes la base. Regrésala antes de la fecha límite de tu pedido, con tu
        nota, y te devolvemos el importe.{' '}
        <Link to="/bases" className={`font-semibold text-mermelada ${inlineLink}`}>
          Ver las condiciones del préstamo
        </Link>
        .
      </p>
    </Card>
  )
}

/** El esqueleto con la estructura de la lista: el título, una tarjeta y la columna de al lado. */
function ListSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-10 max-[960px]:grid-cols-1">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton radius="md" className="h-72 w-full" />
      </div>
      <Skeleton radius="md" className="h-40 w-full" />
    </div>
  )
}

/**
 * `/cuenta/bases` (D69, mockup `CuentaBases`). Pide sesión (`RequireSession`). Las pestañas de la cuenta (Mis pedidos,
 * Bases en préstamo, Datos y avisos) y su menú en móvil vienen con `AccountHeader`.
 */
export default function AccountBases() {
  usePageTitle(TITLE)
  const loans = useStandLoans()
  const { view } = loans
  return (
    <>
      <AccountHeader />
      <div className={column}>
        <LoadingRegion loading={loans.status === 'loading'} label="Cargando tus bases" skeleton={<ListSkeleton />}>
          {loans.status === 'error' && (
            <>
              <h2 className="font-display text-titulo-2">{TITLE}</h2>
              <LoadErrorNotice title="No se pudieron cargar tus bases" onRetry={loans.retry} />
            </>
          )}
          {view && (
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-10 max-[960px]:grid-cols-1">
              <div className="flex min-w-0 flex-col gap-10">
                <section aria-labelledby="bases-prestadas" className="flex flex-col gap-4">
                  <h2 id="bases-prestadas" className="font-display text-titulo-2">
                    {TITLE}
                  </h2>
                  {view.loaned.length > 0 ? (
                    <ul aria-label="Bases prestadas" className="flex flex-col gap-4">
                      {view.loaned.map((base) => (
                        <LoanedBase key={base.id} base={base} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-cuerpo text-mermelada-suave">
                      {view.returned.length > 0 ? 'No tienes bases prestadas ahora.' : 'Todavía no tienes bases en préstamo.'}
                    </p>
                  )}
                </section>
                {view.returned.length > 0 && (
                  <section aria-labelledby="bases-devueltas" className="flex flex-col gap-2">
                    <h2 id="bases-devueltas" className="font-display text-titulo-2">
                      Bases devueltas
                    </h2>
                    <ul aria-label="Bases devueltas" className="border-t border-relieve">
                      {view.returned.map((base) => (
                        <ReturnedBase key={base.id} base={base} />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
              <HowItWorks />
            </div>
          )}
        </LoadingRegion>
      </div>
    </>
  )
}
