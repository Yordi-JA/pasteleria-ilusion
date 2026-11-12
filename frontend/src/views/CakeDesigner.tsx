import { useId } from 'react'
import { Link } from 'react-router'
import DesignerCake from '../components/DesignerCake.tsx'
import { focusRing } from '../components/focus.ts'
import LoadErrorNotice from '../components/LoadErrorNotice.tsx'
import PageHeader from '../components/PageHeader.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import { DESIGN_STEPS, LID_STEP, REVIEW_STEP, STEP_COUNT } from '../viewmodels/cakeDesignSteps.ts'
import { useCakeDesigner } from '../viewmodels/useCakeDesigner.ts'
import type { CakeDesignerView } from '../viewmodels/useCakeDesigner.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { BreadStep, CakeTypeStep, CoverageStep, FillingStep } from './cakeDesigner/ChoiceSteps.tsx'
import DecorationStep from './cakeDesigner/DecorationStep.tsx'
import { MobileBar, MobileHint, PreviewHint, PriceCard, SummaryCard, SummaryDisclosure } from './cakeDesigner/DesignerAside.tsx'
import LidStep from './cakeDesigner/LidStep.tsx'
import ReviewStep from './cakeDesigner/ReviewStep.tsx'
import SizeStep from './cakeDesigner/SizeStep.tsx'
import StepBar from './cakeDesigner/StepBar.tsx'
import StepCard from './cakeDesigner/StepCard.tsx'

const TITLE = 'Diseña tu pastel'

const crumbLink = `inline-flex min-h-11 items-center rounded-sm underline underline-offset-4 ${focusRing}`

function Breadcrumb() {
  return (
    <nav aria-label="Ruta">
      <ol className="flex flex-wrap items-center gap-x-1.5 text-nota">
        <li>
          <Link to="/" className={crumbLink}>
            Inicio
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link to="/pedido" className={crumbLink}>
            Realizar pedido
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page">{TITLE}</li>
      </ol>
    </nav>
  )
}

/** Mientras llegan las opciones: la misma estructura (barra, vista previa, total y tarjeta), como `CotizadorCargando`. */
function DesignerSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-8 gap-2 max-[600px]:hidden">
        {DESIGN_STEPS.map((step) => (
          <div key={step.short} className="flex flex-col items-center gap-2">
            <Skeleton className="h-[30px] w-[30px] !rounded-full" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="hidden h-5 w-48 max-[600px]:block" />
      <div className="grid grid-cols-2 gap-9 max-[900px]:grid-cols-1">
        <div className="flex flex-col gap-4">
          <Skeleton radius="md" className="h-[350px] max-[600px]:h-[220px]" />
          <Skeleton radius="md" className="h-[148px] max-[900px]:hidden" />
        </div>
        <div className="flex flex-col gap-5 rounded-lg border border-relieve bg-betun p-6 max-[600px]:p-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton radius="md" className="h-12 w-44" />
          <Skeleton radius="md" className="h-20" />
          <Skeleton radius="md" className="h-16" />
          <Skeleton radius="md" className="h-11 w-32" />
        </div>
      </div>
    </div>
  )
}

function CurrentStep({ designer }: { designer: CakeDesignerView }) {
  const { current, draft, view, actions } = designer
  if (!view) return null
  switch (current) {
    case 1:
      return (
        <SizeStep
          view={view.sizeStep}
          people={draft.people}
          form={draft.form}
          peopleText={designer.peopleText}
          whatsapp={designer.whatsapp}
          onPeople={actions.setPeople}
          onTypePeople={actions.typePeople}
          onSettlePeople={actions.settlePeople}
          onForm={actions.setForm}
          onTiers={actions.setTiers}
          onSubmit={actions.proceed}
        />
      )
    case 2:
      return <CakeTypeStep choices={view.choices.cakeTypes} conflict={view.conflict} onChoose={actions.setCakeType} />
    case 3:
      return <BreadStep groups={view.choices.breads} onChoose={actions.setBread} />
    case 4:
      return (
        <FillingStep
          view={view.choices.filling}
          onBase={actions.setFillingBase}
          onCount={actions.setFlavorCount}
          onFlavor={actions.chooseFlavor}
        />
      )
    case 5:
      return <CoverageStep colors={view.choices.colors} includedFilling={view.choices.includedFilling} onChoose={actions.setCoverage} />
    case 6:
      return (
        <DecorationStep
          groups={view.choices.decorations}
          color={view.choices.decorationColor}
          quote={view.choices.decorationQuote}
          imagePicker={{
            image: designer.decorationImage.image,
            // Tras recargar queda el nombre, pero no la imagen.
            lostName: designer.decorationImage.image ? null : draft.decorationImageName,
            error: designer.decorationImage.error,
            onPick: actions.chooseImage,
            onRemove: actions.removeImage,
            onUnreadable: actions.imageUnreadable,
          }}
          onChoose={actions.setDecoration}
          onAutomatic={() => actions.setDecorationColor(null)}
          onOwnColor={actions.chooseOwnColor}
          onColor={actions.setDecorationColor}
        />
      )
    case LID_STEP:
      return designer.lidStep.view && <LidStep view={designer.lidStep.view} actions={designer.lidStep.actions} />
    default:
      return (
        view.review && (
          <ReviewStep review={view.review} onOccasion={actions.setOccasion} feedback={designer.order.feedback} added={designer.order.added} onStartOver={actions.startOver} onRetry={designer.retryPrice} />
        )
      )
  }
}

function Designer({ designer, hintId }: { designer: CakeDesignerView; hintId: string }) {
  const { view, current, actions } = designer
  if (!view) return null
  const step = DESIGN_STEPS[current - 1]
  // La revisión no confirma nada: su botón agrega el pastel al pedido. Y ya trae el desglose con "Cambiar" en cada renglón:
  // no repite el total, "Tu pastel" ni la barra de abajo en móvil.
  const review = current === REVIEW_STEP
  const onContinue = review ? actions.addToOrder : actions.proceed
  return (
    <>
      <div className="flex flex-col gap-8 max-[600px]:gap-6">
        <StepBar steps={view.steps} current={current} />
        <div className="grid grid-cols-2 items-start gap-9 max-[900px]:grid-cols-1 max-[900px]:gap-5">
          {/* La columna izquierda queda fija al hacer scroll en escritorio (libro de marca, "Cotizador 3D"). */}
          <div className="sticky top-28 flex flex-col gap-4 max-[900px]:static">
            {!review && <SummaryDisclosure rows={view.summary} />}
            <div className="h-[350px] overflow-hidden rounded-lg border border-relieve bg-betun max-[600px]:h-[220px]">
              <DesignerCake scene={designer.scene} hintId={hintId} />
            </div>
            {review ? (
              <p className="text-nota text-mermelada-suave">
                <PreviewHint hintId={hintId} sceneReady={designer.scene.status === 'ready'} keyboardFocus={designer.scene.keyboardFocus} />
              </p>
            ) : (
              <>
                <MobileHint visible={designer.scene.status === 'ready'} keyboardFocus={designer.scene.keyboardFocus} />
                <PriceCard
                  price={view.price}
                  sizeLine={view.sizeLine}
                  hintId={hintId}
                  sceneReady={designer.scene.status === 'ready'}
                  keyboardFocus={designer.scene.keyboardFocus}
                  onRetry={designer.retryPrice}
                />
                <SummaryCard rows={view.summary} />
              </>
            )}
          </div>
          <StepCard
            key={current}
            number={current}
            title={step.title}
            total={STEP_COUNT}
            titleRef={designer.stepTitle}
            direction={designer.direction}
            error={designer.stepError}
            continueLabel={view.continueLabel}
            continueDisabled={view.continueDisabled}
            busy={view.proceeding || (review && designer.order.busy)}
            onContinue={onContinue}
            onBack={actions.back}
          >
            <CurrentStep designer={designer} />
          </StepCard>
        </div>
      </div>
      {!review && (
        <MobileBar
          price={view.price}
          continueLabel={view.continueShort}
          onContinue={onContinue}
          disabled={view.continueDisabled}
          busy={view.proceeding}
          onRetry={designer.retryPrice}
        />
      )}
    </>
  )
}

/** `/pedido/disena`: "Diseña tu pastel", los 8 pasos. */
export default function CakeDesigner() {
  usePageTitle(TITLE)
  const designer = useCakeDesigner()
  const hintId = useId()
  return (
    <>
      <PageHeader title={TITLE} before={<Breadcrumb />}>
        <p className="text-cuerpo text-mermelada-suave">
          {designer.view?.changedType
            ? 'Cambiaste el tipo de pastel. Revisa cómo afecta a lo que ya elegiste.'
            : designer.current === REVIEW_STEP && designer.view
              ? 'Revisa tu pastel antes de agregarlo. Puedes cambiar cualquier paso.'
              : 'Elige paso a paso.'}
        </p>
      </PageHeader>
      <div className="mx-auto max-w-[1200px] px-6 pb-16 pt-10 max-[600px]:px-4 max-[600px]:pt-8">
        {designer.status === 'error' ? (
          <LoadErrorNotice title="No se pudieron cargar las opciones de tu pastel" onRetry={designer.retryOptions} />
        ) : (
          <LoadingRegion loading={designer.status === 'loading'} label="Cargando las opciones de tu pastel…" skeleton={<DesignerSkeleton />}>
            <Designer designer={designer} hintId={hintId} />
          </LoadingRegion>
        )}
      </div>
    </>
  )
}
