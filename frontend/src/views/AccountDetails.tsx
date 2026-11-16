import Card from '../components/Card.tsx'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import { useAccountDetails } from '../viewmodels/useAccountDetails.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import AccountDetailsForm from './account/AccountDetailsForm.tsx'
import AccountHeader from './account/AccountHeader.tsx'

const TITLE = 'Datos y avisos'

const column = 'mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-6 py-10 max-[600px]:px-4'

/** El esqueleto con la estructura de la vista: el título, las dos tarjetas y el botón. */
function DetailsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-56 max-w-full" />
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-10 max-[960px]:grid-cols-1 max-[960px]:gap-6">
        <Card large className="flex flex-col gap-5">
          <Skeleton className="h-7 w-48 max-w-full" />
          <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
            <Skeleton radius="md" className="h-[74px] w-full" />
            <Skeleton radius="md" className="h-[74px] w-full" />
          </div>
          <Skeleton radius="md" className="h-[74px] w-full" />
        </Card>
        <Card large className="flex flex-col gap-5">
          <Skeleton className="h-7 w-48 max-w-full" />
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </Card>
      </div>
      <Skeleton radius="md" className="h-12 w-44" />
    </div>
  )
}

/**
 * `/cuenta/datos` (D72, mockup `CuentaDatos`). Pide sesión (`RequireSession`). Las pestañas de la cuenta y su menú en
 * móvil vienen con `AccountHeader`; el formulario se monta con la cuenta ya cargada.
 */
export default function AccountDetails() {
  usePageTitle(TITLE)
  const { state, retry } = useAccountDetails()
  return (
    <>
      <AccountHeader />
      <div className={column}>
        <LoadingRegion loading={state.status === 'loading'} label="Cargando tus datos" skeleton={<DetailsSkeleton />}>
          {state.status === 'error' && (
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-titulo-2">{TITLE}</h2>
              <LoadErrorNotice title="No se pudieron cargar tus datos" onRetry={retry} />
            </div>
          )}
          {state.status === 'ready' && <AccountDetailsForm account={state.data} />}
        </LoadingRegion>
      </div>
    </>
  )
}
