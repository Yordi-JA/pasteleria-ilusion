import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from '@phosphor-icons/react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import ChoiceOption from '../../components/ChoiceOption.tsx'
import ColorPicker from '../../components/ColorPicker.tsx'
import { focusRing, focusRingWithin } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import { LAYOUT_BOUNDS } from '../../models/cakeDesignLayout.ts'
import TextField from '../../components/TextField.tsx'
import type { LidStepActions, LidStepView } from '../../viewmodels/useLidStep.ts'
import { ColorGrid, Group } from './ChoiceSteps.tsx'
import { ImagePicker } from './DecorationStep.tsx'
import LidEditor from './LidEditor.tsx'
import RangeField from './RangeField.tsx'

/** Una opción que se agrega (el mensaje, la oblea) con lo que se configura dentro, como `CotizadorDecoracionEditor`. */
function AddOn({ id, label, description, trailing, checked, disabled, disabledReason, onChange, children }: {
  id: string
  label: string
  description: string
  trailing: string | null
  checked: boolean
  disabled?: boolean
  disabledReason?: string | null
  onChange: (checked: boolean) => void
  children?: ReactNode
}) {
  const reasonId = disabled && disabledReason ? `${id}-motivo` : undefined
  const state = disabled
    ? 'cursor-not-allowed border-dashed border-relieve bg-nata text-mermelada-suave'
    : checked
      ? 'border-2 border-mermelada bg-betun'
      : 'border border-mermelada-suave bg-betun'
  return (
    <div className={`rounded-md ${state}`}>
      <label htmlFor={id} className={`flex min-h-11 cursor-pointer items-center gap-3.5 rounded-md px-4 py-3.5 ${disabled ? 'cursor-not-allowed' : ''} ${focusRingWithin}`}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={reasonId}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 shrink-0 cursor-pointer accent-mermelada outline-none disabled:cursor-not-allowed"
        />
        <span className="flex flex-1 flex-col">
          <span className="text-cuerpo font-semibold">{label}</span>
          <span className="text-nota text-mermelada-suave">{description}</span>
        </span>
        {trailing && <span className="whitespace-nowrap text-cuerpo font-semibold tabular-nums">{trailing}</span>}
      </label>
      {reasonId && (
        <p id={reasonId} className="px-4 pb-3 text-nota text-mermelada-suave">
          {disabledReason}
        </p>
      )}
      {/* Sangría en escritorio para alinear con el texto junto a la casilla; en móvil, el mismo margen de 16 px (libro de marca). */}
      {checked && !disabled && children && <div className="flex flex-col gap-4 px-4 pb-4 pl-[54px] max-[600px]:pl-4">{children}</div>}
    </div>
  )
}

const iconButton = `inline-flex h-11 w-11 items-center justify-center rounded-sm border-2 border-mermelada bg-betun text-mermelada hover:bg-harina ${focusRing}`

function PositionPad({ actions }: { actions: LidStepActions }) {
  const buttons: { label: string; dx: number; dy: number; icon: ReactNode; area: string }[] = [
    { label: 'Mover hacia arriba', dx: 0, dy: 1, icon: <ArrowUp size={18} aria-hidden="true" />, area: 'col-start-2 row-start-1' },
    { label: 'Mover a la izquierda', dx: -1, dy: 0, icon: <ArrowLeft size={18} aria-hidden="true" />, area: 'col-start-1 row-start-2' },
    { label: 'Mover a la derecha', dx: 1, dy: 0, icon: <ArrowRight size={18} aria-hidden="true" />, area: 'col-start-3 row-start-2' },
    { label: 'Mover hacia abajo', dx: 0, dy: -1, icon: <ArrowDown size={18} aria-hidden="true" />, area: 'col-start-2 row-start-3' },
  ]
  return (
    <div role="group" aria-label="Posición" className="flex flex-col gap-2">
      <p className="text-etiqueta">Posición</p>
      <div className="grid w-fit grid-cols-[44px_auto_44px] grid-rows-3 items-center justify-items-center gap-1">
        {buttons.map((button) => (
          <button key={button.label} type="button" aria-label={button.label} onClick={() => actions.nudge(button.dx, button.dy)} className={`${iconButton} ${button.area}`}>
            {button.icon}
          </button>
        ))}
        <button type="button" onClick={actions.center} className={`col-start-2 row-start-2 inline-flex min-h-11 items-center rounded-sm px-2 text-etiqueta underline underline-offset-4 ${focusRing}`}>
          Centrar
        </button>
      </div>
    </div>
  )
}

function Chips({ legend, name, options, onChoose }: { legend: string; name: string; options: { value: string; label: string; checked: boolean; disabledReason?: string }[]; onChoose: (value: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="float-left mb-2 text-etiqueta">{legend}</legend>
      <div className="clear-both flex flex-wrap items-start gap-2">
        {options.map((option) => (
          <ChoiceOption
            key={option.value}
            variant="chip"
            name={name}
            value={option.value}
            label={option.label}
            checked={option.checked}
            disabled={option.disabledReason !== undefined}
            disabledReason={option.disabledReason}
            onChange={() => onChoose(option.value)}
          />
        ))}
      </div>
    </fieldset>
  )
}

function MessageColor({ view, actions }: { view: LidStepView; actions: LidStepActions }) {
  const { color } = view.message
  return (
    <div className="flex flex-col gap-3">
      <Group legend="Color del texto">
        <div className="grid grid-cols-1 gap-2">
          {color.modes.map((entry) => (
            <ChoiceOption
              key={entry.mode}
              name="color-texto"
              value={entry.mode}
              label={entry.label}
              description={entry.description}
              checked={entry.checked}
              onChange={() => actions.setColorMode(entry.mode)}
            />
          ))}
        </div>
      </Group>
      {color.mode === 'tones' && <ColorGrid legend="Elige el tono" name="tono-texto" colors={color.tones} onChoose={actions.setColorValue} />}
      {color.mode === 'custom' && <ColorPicker legend="Elige el color del texto" value={color.ink} onChange={actions.setColorValue} />}
      {color.lowContrast && (
        <Notice tone="info" title="Se lee poco sobre tu cobertura">
          <p>Este color tiene poco contraste con el de la cobertura. Con el negro se lee mejor, pero puedes dejarlo así.</p>
        </Notice>
      )}
    </div>
  )
}

type LidStepProps = { view: LidStepView; actions: LidStepActions }

/**
 * Paso 7: mensaje y oblea (reglas 6.2 y 6.3, D55). El mensaje es opcional y no cuesta: la pastelería sugiere pocas palabras y el
 * contador no bloquea. La oblea cuesta lo que fije la pastelería, lleva una imagen que solo vive en el navegador y cabe en la hoja
 * carta. Los dos se acomodan en el editor de vista superior, con controles que hacen lo mismo que el puntero.
 */
export default function LidStep({ view, actions }: LidStepProps) {
  const id = useId()
  const { message, wafer } = view
  const editing = message.enabled || wafer.enabled
  const hintId = `${id}-ayuda`
  const countId = `${id}-contador`
  const waferShape = wafer.shape
  const circle = waferShape === 'circle'
  const imagePicker = { image: wafer.image, lostName: wafer.lostName, error: wafer.error, onPick: actions.chooseWaferImage, onRemove: actions.removeWaferImage, onUnreadable: actions.unreadableWaferImage }
  return (
    <>
      <Group legend="Mensaje">
        <AddOn
          id={`${id}-mensaje`}
          label="Agregar un mensaje"
          description="Se escribe sobre el pastel"
          trailing="Incluido"
          checked={message.enabled}
          onChange={actions.setMessageEnabled}
        >
          <div className="flex flex-col gap-1.5">
            <TextField
              label="Tu mensaje"
              placeholder="Ej. Feliz cumpleaños Ana"
              value={message.text}
              maxLength={message.maxLength}
              autoComplete="off"
              help={message.hint}
              aria-describedby={countId}
              onChange={(event) => actions.setMessageText(event.target.value)}
            />
            <p id={countId} className={`text-nota font-semibold tabular-nums ${message.overSuggestion ? '' : 'text-mermelada-suave'}`}>
              {message.wordsLine}
              {message.overSuggestion && <span className="font-normal"> Es más largo de lo que recomendamos; puedes dejarlo así.</span>}
            </p>
          </div>
          <MessageColor view={view} actions={actions} />
        </AddOn>
      </Group>

      <Group legend="Oblea">
        <AddOn
          id={`${id}-oblea`}
          label="Agregar una oblea con tu imagen"
          description="Se imprime hasta tamaño carta"
          trailing={wafer.price ? `+${wafer.price}` : null}
          checked={wafer.enabled}
          disabled={wafer.unavailableReason !== null}
          disabledReason={wafer.unavailableReason}
          onChange={actions.setWaferEnabled}
        >
          <ImagePicker {...imagePicker} />
          {wafer.image && wafer.loaded && (
            <div className="flex flex-col gap-1">
              <RangeField label="Acercar la imagen dentro de la oblea" value={wafer.zoom} min={LAYOUT_BOUNDS.imageZoom.min} max={LAYOUT_BOUNDS.imageZoom.max} step={0.05} text={`${Math.round(wafer.zoom * 100)} %`} onChange={actions.setImageZoom} />
              <RangeField label="Mover la imagen a los lados" value={wafer.panX} min={-1} max={1} step={0.05} text={wafer.panX === 0 ? 'Centrada' : `${Math.round(Math.abs(wafer.panX) * 100)} % a la ${wafer.panX < 0 ? 'izquierda' : 'derecha'}`} onChange={(value) => actions.setImagePan('imageX', value)} ends={['Izquierda', 'Derecha']} />
              <RangeField label="Mover la imagen arriba o abajo" value={wafer.panY} min={-1} max={1} step={0.05} text={wafer.panY === 0 ? 'Centrada' : `${Math.round(Math.abs(wafer.panY) * 100)} % hacia ${wafer.panY < 0 ? 'arriba' : 'abajo'}`} onChange={(value) => actions.setImagePan('imageY', value)} ends={['Arriba', 'Abajo']} />
            </div>
          )}
          <p className="text-nota text-mermelada-suave">
            Se imprime hasta tamaño carta ({wafer.letter}). Su forma, tamaño y lugar los acomodas abajo.
          </p>
        </AddOn>
      </Group>

      {editing && (
        <section aria-labelledby={`${id}-acomodar`} className="flex flex-col gap-4 border-t border-relieve pt-5">
          <h3 id={`${id}-acomodar`} className="text-etiqueta">
            Acomódalos en tu pastel
          </h3>
          {/* Dónde quedó lo que se movió con las flechas o los botones, o que ya no cabe más hacia ahí. */}
          <p role="status" className="sr-only">
            <span key={view.announcement.id}>{view.announcement.text}</span>
          </p>
          <div className="grid grid-cols-[minmax(0,260px)_1fr] items-start gap-5 max-[900px]:grid-cols-1">
            <div className="w-full max-w-[300px] justify-self-center">
              <LidEditor view={view} actions={actions} describedBy={hintId} />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <Chips
                legend="Qué quieres acomodar"
                name="acomodar"
                options={[
                  { value: 'wafer', label: 'Oblea', checked: view.target === 'wafer', disabledReason: wafer.enabled ? undefined : 'Agrégala arriba para acomodarla.' },
                  { value: 'message', label: 'Mensaje', checked: view.target === 'message', disabledReason: message.layout ? undefined : 'Escribe tu mensaje arriba para acomodarlo.' },
                ]}
                onChoose={(value) => actions.setTarget(value === 'message' ? 'message' : 'wafer')}
              />
              {view.target === 'wafer' && wafer.enabled && (
                <>
                  <Chips
                    legend="Forma de la oblea"
                    name="forma-oblea"
                    options={[
                      { value: 'sheet', label: 'Hoja', checked: !circle },
                      { value: 'circle', label: 'Círculo', checked: circle },
                    ]}
                    onChoose={(value) => actions.setShape(value === 'circle' ? 'circle' : 'sheet')}
                  />
                  <RangeField label="Tamaño" value={wafer.size.value} min={wafer.size.min} max={wafer.size.max} step={0.1} text={wafer.size.text} onChange={actions.setWaferSize} />
                  {!circle && (
                    <>
                      <RangeField label="Ancho" value={wafer.width.value} min={wafer.width.min} max={wafer.width.max} step={0.1} text={`${wafer.width.value.toFixed(1)} cm`} onChange={actions.setWaferWidth} />
                      <RangeField label="Alto" value={wafer.height.value} min={wafer.height.min} max={wafer.height.max} step={0.1} text={`${wafer.height.value.toFixed(1)} cm`} onChange={actions.setWaferHeight} />
                    </>
                  )}
                  <RangeField label="Giro" value={wafer.rotation} min={-180} max={180} step={1} text={`${wafer.rotation}°`} onChange={actions.setWaferRotation} />
                </>
              )}
              {view.target === 'message' && message.layout && (
                <>
                  <Chips
                    legend="Disposición del mensaje"
                    name="disposicion"
                    options={[
                      { value: 'straight', label: 'Recto', checked: message.arrangement === 'straight' },
                      { value: 'arc', label: 'En arco', checked: message.arrangement === 'arc' },
                    ]}
                    onChoose={(value) => actions.setArrangement(value === 'arc' ? 'arc' : 'straight')}
                  />
                  {message.arrangement === 'arc' && (
                    <RangeField label="Curva" value={message.curve * 100} min={-100} max={100} step={5} text={message.curveText} onChange={(value) => actions.setCurve(value / 100)} ends={['Hacia abajo', 'Hacia arriba']} />
                  )}
                  <RangeField label="Tamaño" value={message.scale.value} min={message.scale.min} max={message.scale.max} step={0.005} text={message.scale.text} onChange={actions.setMessageScale} />
                  <RangeField label="Giro" value={message.rotation} min={-180} max={180} step={1} text={`${message.rotation}°`} onChange={actions.setMessageRotation} />
                </>
              )}
              <PositionPad actions={actions} />
            </div>
          </div>
          <p id={hintId} className="text-nota text-mermelada-suave">
            Arrastra para mover; usa las esquinas para cambiar el tamaño y el círculo de arriba para girar. Con el teclado, las flechas mueven lo que elegiste.
          </p>
        </section>
      )}
    </>
  )
}
