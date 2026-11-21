import Duya from '../components/Duya.tsx'
import { useHome } from '../viewmodels/useHome.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import FeaturedSection from './home/FeaturedSection.tsx'
import GallerySection from './home/GallerySection.tsx'
import HomeHero from './home/HomeHero.tsx'
import ShowcaseSection from './home/ShowcaseSection.tsx'
import SlicesSection from './home/SlicesSection.tsx'

/**
 * `/`, la portada (Main.dc.html): pisos `fresa` (hero), `nata` (pasteles de la casa), `mermelada` (vitrina), `fresa`
 * ("Hechos en la casa", sin datos de la API, siempre presente) y `nata` (rebanadas), con una guirnalda bajo el hero y otra
 * en cada cambio de color; la guirnalda de cierre y el pie los pone el marco. Una sección sin nada cargado hoy no aparece y se
 * lleva sus bordes: entre dos campos del mismo color no va borde. Las fotos van entre la vitrina y las rebanadas para que
 * `mermelada` no toque otro campo oscuro ni el pie; sin rebanadas, las fotos cierran la página (`useHome`).
 */
export default function Home() {
  usePageTitle()
  const { featured, showcase, slices, afterHero } = useHome()
  return (
    <>
      <HomeHero />
      {afterHero !== 'fresa' && <Duya color="fresa" below={afterHero} />}
      {featured.visible && <FeaturedSection section={featured} />}
      {showcase.visible && (
        <>
          {featured.visible && <Duya color="nata" below="mermelada" />}
          <ShowcaseSection section={showcase} />
          <Duya color="mermelada" below="fresa" />
        </>
      )}
      {!showcase.visible && featured.visible && <Duya color="nata" below="fresa" />}
      <GallerySection />
      {slices.visible && (
        <>
          <Duya color="fresa" below="nata" />
          <SlicesSection section={slices} />
        </>
      )}
    </>
  )
}
