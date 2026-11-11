import { useEffect, useId, useRef } from 'react'
import { buttonClasses } from '../../components/buttonStyles.ts'
import ChoiceOption from '../../components/ChoiceOption.tsx'
import { focusRing, focusRingWithin } from '../../components/focus.ts'
import Notice from '../../components/Notice.tsx'
import { DECORATION_IMAGE_MAX_MB, DECORATION_IMAGE_TYPES } from '../../models/decorationImage.ts'
import type { DecorationColorView, DecorationGroupView } from '../../viewmodels/cakeDecorations.ts'
import type { DecorationImage } from '../../viewmodels/useDecorationImage.ts'
import { ColorGrid, Group, Options } from './ChoiceSteps.tsx'

/** Lo que el paso necesita de la imagen de "Otra decoración" (vive solo en la memoria de la pestaña, D53). */
type ImageProps = {
  image: DecorationImage | null
  /** El nombre de la imagen que había antes de recargar; `null` si no había. */
  lostName: string | null
  error: string | null
  onPick: (file: File | undefined) => Promise<void>
  onRemove: () => void
  onUnreadable: () => void
}

function ImagePicker({ image, lostName, error, onPick, onRemove, onUnreadable }: ImageProps) {
  const hintId = useId()
  const removeButton = useRef<HTMLButtonElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // WCAG 2.4.3: elegir la imagen o quitarla cambia lo que hay en pantalla y el control enfocado desaparece; el foco pasa
  // al control que ocupa su lugar ("Quitar" al elegir, "Elegir imagen" al quitar) en vez de caer al cuerpo de la página.
  const hadImage = useRef(image !== null)
  useEffect(() => {
    const had = hadImage.current
    hadImage.current = image !== null
    if (image && !had) removeButton.current?.focus()
    if (!image && had) fileInput.current?.focus()
  }, [image])
  return (
    <div className="flex flex-col gap-3">
      {/* Siempre montada, para que el lector de pantalla anuncie la imagen elegida cuando llega. */}
      <p role="status" className="sr-only">
        {image ? `Imagen elegida: ${image.name}` : ''}
      </p>
      {image ? (
        <div className="flex items-center gap-3 rounded-md border border-relieve bg-betun p-3">
          {/* La miniatura es la imagen que eligió la persona, local a su navegador; el nombre va aparte, en texto. */}
          <img src={image.url} alt="" onError={onUnreadable} className="h-14 w-14 shrink-0 rounded-sm border border-relieve object-cover" />
          <p className="min-w-0 flex-1 truncate text-cuerpo" title={image.name}>
            {image.name}
          </p>
          <button
            ref={removeButton}
            type="button"
            onClick={onRemove}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-sm px-2 text-etiqueta underline underline-offset-4 ${focusRing}`}
          >
            Quitar<span className="sr-only"> la imagen {image.name}</span>
          </button>
        </div>
      ) : (
        <>
          {lostName && (
            <Notice tone="attention" title="Tu imagen ya no está">
              <p>
                Se perdió al recargar la página. Elige otra vez {lostName}, o la que prefieras.
              </p>
            </Notice>
          )}
          <label className={`${buttonClasses('secondary')} self-start ${focusRingWithin}`}>
            <input
              ref={fileInput}
              type="file"
              accept={DECORATION_IMAGE_TYPES.join(',')}
              aria-describedby={hintId}
              className="sr-only"
              onChange={(event) => {
                onPick(event.target.files?.[0])
                // Elegir el mismo archivo otra vez (después de quitarlo) también tiene que avisar.
                event.target.value = ''
              }}
            />
            Elegir imagen
          </label>
          <p id={hintId} className="text-nota text-mermelada-suave">
            JPG, PNG o WebP, de hasta {DECORATION_IMAGE_MAX_MB} MB.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-nota font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  )
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span aria-hidden="true" className="flex gap-1">
      {colors.map((color) => (
        // Son los tonos que saldrían de la cobertura (comida), no colores de la interfaz.
        <span key={color} className="h-5 w-5 rounded-full border border-relieve" style={{ backgroundColor: color }} />
      ))}
    </span>
  )
}

type DecorationStepProps = {
  groups: DecorationGroupView[]
  color: DecorationColorView | null
  /** La decoración elegida es "Otra decoración": pide la imagen y avisa que el pedido queda en pausa. */
  quote: boolean
  imagePicker: ImageProps
  onChoose: (value: string) => void
  onAutomatic: () => void
  onOwnColor: () => void
  onColor: (value: string) => void
}

/**
 * Paso 6: la decoración (regla 6.1, D53, D54). Una sola por pedido; los diseños de duya y los tipos de chispas van
 * agrupados y se despliegan solo al elegir su grupo. Una opción sin precio se
 * ve desactivada con "Precio por confirmar". La duya y las rosas llevan color: automático (tonos de la cobertura) o uno de
 * los colores de la cobertura. "Otra decoración" pide una imagen, que por ahora solo se guarda en el navegador.
 */
export default function DecorationStep({ groups, color, quote, imagePicker, onChoose, onAutomatic, onOwnColor, onColor }: DecorationStepProps) {
  const titleId = useId()
  const open = groups.find((group) => group.title && group.checked)
  return (
    <>
      {/* Siempre montada (WCAG 4.1.3): anuncia los diseños que aparecen al elegir un grupo, sin mover el foco. */}
      <p role="status" className="sr-only">
        {open ? `Se muestran ${open.choices.length} diseños de ${open.title}` : ''}
      </p>
      <Group legend="Elige la decoración">
        {groups.map((group) =>
          group.title ? (
            <div key={group.key} className="flex flex-col gap-2">
              {/* El grupo es un radio más de la lista: sus diseños se despliegan debajo solo al elegirlo. */}
              <ChoiceOption
                name="decoracion"
                value={`grupo-${group.key}`}
                label={group.title}
                trailing={group.trailing}
                checked={group.checked}
                disabled={group.first === null}
                disabledReason={group.disabledReason}
                aria-controls={group.checked ? `${titleId}-${group.key}` : undefined}
                onChange={() => group.first && onChoose(group.first)}
              />
              {group.checked && (
                <div
                  id={`${titleId}-${group.key}`}
                  role="group"
                  aria-label={group.title}
                  aria-describedby={group.hint ? `${titleId}-${group.key}-ayuda` : undefined}
                  className="flex flex-col gap-2.5 rounded-md border border-relieve p-3 max-[600px]:p-4"
                >
                  {group.hint && (
                    <p id={`${titleId}-${group.key}-ayuda`} className="text-nota text-mermelada-suave">
                      {group.hint}
                    </p>
                  )}
                  <Options name={`decoracion-${group.key}`} choices={group.choices} onChoose={onChoose} />
                </div>
              )}
            </div>
          ) : (
            <Options key={group.key} name="decoracion" choices={group.choices} onChoose={onChoose} />
          ),
        )}
      </Group>
      {color && (
        <Group legend="Color de la decoración">
          <div className="grid grid-cols-2 gap-2 max-[600px]:grid-cols-1">
            <ChoiceOption
              name="modo-color"
              value="automatico"
              label="Automático"
              description="Tonos de tu cobertura"
              trailing={<Swatches colors={color.automatic.swatches} />}
              checked={color.automatic.checked}
              onChange={onAutomatic}
            />
            <ChoiceOption
              name="modo-color"
              value="elegir"
              label="Elegir un color"
              description="Uno de los colores de la cobertura"
              checked={color.pick.checked}
              onChange={onOwnColor}
            />
          </div>
          {color.pick.checked && <ColorGrid legend="Elige el color" name="color-decoracion" colors={color.colors} onChoose={onColor} />}
          {color.note && <p className="text-nota">{color.note}</p>}
        </Group>
      )}
      {quote && (
        <>
          <ImagePicker {...imagePicker} />
          <Notice tone="attention" title="Tu pedido quedará en pausa">
            <p>Hasta que la pastelería te diga el precio de esta decoración. Te avisamos por correo y en tu cuenta.</p>
          </Notice>
        </>
      )}
    </>
  )
}
