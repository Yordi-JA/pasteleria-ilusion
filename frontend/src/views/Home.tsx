import Duya from '../components/Duya.tsx'
import { useHome } from '../viewmodels/useHome.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import FeaturedSection from './home/FeaturedSection.tsx'
import HomeHero from './home/HomeHero.tsx'
import ShowcaseSection from './home/ShowcaseSection.tsx'
import SlicesSection from './home/SlicesSection.tsx'

/**
 * `/`, la portada (Main.dc.html): pisos `fresa` (hero), `nata` (pasteles de la casa), `mermelada` (vitrina) y
 * `nata` (rebanadas), con conchas bajo el hero y perlas alrededor de la vitrina; la guirnalda y el pie los pone el
 * marco. Una sección sin nada cargado hoy no aparece y se lleva sus bordes: entre dos `nata` no va borde, y la
 * vitrina nunca queda pegada al pie, que también es `mermelada`.
 */
export default function Home() {
  usePageTitle()
  const { featured, showcase, slices, afterHero, closingField } = useHome()
  return (
    <>
      <HomeHero />
      <Duya type="concha" color="fresa" below={afterHero} />
      {featured.visible && <FeaturedSection section={featured} />}
      {showcase.visible && (
        <>
          {featured.visible && <Duya type="perlas" color="nata" below="mermelada" />}
          <ShowcaseSection section={showcase} />
          <Duya type="perlas" color="mermelada" below="nata" />
        </>
      )}
      {slices.visible && <SlicesSection section={slices} />}
      {/* Campo `nata` de cierre: sin rebanadas, la vitrina (o el hero solo) no llega a la guirnalda ni al pie. */}
      {closingField && <div data-campo="nata" aria-hidden="true" className="h-12 bg-nata" />}
    </>
  )
}
