import logo from '../../../../assets/logos/ilusion-logo.svg'
import ButtonLink from '../../components/ButtonLink.tsx'
import HeroCake from '../../components/HeroCake.tsx'
import { ORDER_LINK } from '../../components/navigation.ts'
import { Field } from './sectionLayout.tsx'

/**
 * Hero de la portada sobre `fresa` (Main.dc.html): el logotipo grande como `h1`, el lema, la frase y las dos
 * acciones, con el pastel a la derecha (abajo en móvil). En móvil el logotipo grande se oculta, como en el
 * mockup: el de la barra ya está a la vista y el `h1` sigue para el lector de pantalla.
 */
export default function HomeHero() {
  return (
    <Field field="fresa" labelledBy="portada-titulo" className="bg-fresa">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-6 px-6 pb-6 pt-8 max-[960px]:grid-cols-1 max-[600px]:px-4">
        <div className="flex flex-col gap-6">
          <h1 id="portada-titulo" className="-ml-2 leading-none max-[600px]:sr-only">
            <img src={logo} alt="" width={565} height={247} className="block h-auto w-full max-w-[640px] max-[600px]:hidden" />
            <span className="sr-only">Pastelería Ilusión</span>
          </h1>
          <p className="font-display text-titulo-1 text-mermelada">Pide un deseo. Del pastel nos encargamos.</p>
          <p className="max-w-[520px] text-cuerpo text-mermelada-suave">
            Pasteles artesanales para bodas, XV años y cumpleaños, y postres del día, hechos por una pastelería familiar.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <ButtonLink to={ORDER_LINK.to}>{ORDER_LINK.label}</ButtonLink>
            <ButtonLink to="/vitrina" variant="secondary">
              Ver la vitrina
            </ButtonLink>
          </div>
        </div>
        <HeroCake />
      </div>
    </Field>
  )
}
