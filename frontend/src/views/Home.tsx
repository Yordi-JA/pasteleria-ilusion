import Duya from '../components/Duya.tsx'
import { useHome } from '../viewmodels/useHome.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import FeaturedSection from './home/FeaturedSection.tsx'
import GallerySection from './home/GallerySection.tsx'
import HomeHero from './home/HomeHero.tsx'
import ShowcaseSection from './home/ShowcaseSection.tsx'

/**
 * `/`, la portada (Main.dc.html): pisos `fresa` (hero), `nata` (pasteles de la casa), `fresa` (vitrina) y `nata`
 * ("Hechos en la casa", sin datos de la API, siempre presente y último), con una guirnalda bajo el hero y otra en cada cambio
 * de color; la guirnalda de cierre y el pie los pone el marco, y cuelga de `nata`. Una sección sin nada cargado hoy no aparece y
 * se lleva sus bordes: entre dos campos del mismo color no va borde (sin pasteles de la casa, el hero y la vitrina son `fresa`;
 * sin vitrina, los pasteles de la casa y las fotos son `nata`). Las rebanadas de hoy ya no van en la portada: viven en `/rebanadas`.
 */
export default function Home() {
  usePageTitle()
  const { featured, showcase, afterHero } = useHome()
  return (
    <>
      <HomeHero />
      {afterHero !== 'fresa' && <Duya color="fresa" below={afterHero} />}
      {featured.visible && <FeaturedSection section={featured} />}
      {showcase.visible && (
        <>
          {featured.visible && <Duya color="nata" below="fresa" />}
          <ShowcaseSection section={showcase} />
          <Duya color="fresa" below="nata" />
        </>
      )}
      <GallerySection />
    </>
  )
}
