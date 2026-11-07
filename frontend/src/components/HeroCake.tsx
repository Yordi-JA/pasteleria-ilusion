/**
 * Lugar del pastel de la portada, con la altura de la escena del mockup (600 px, 460 px hasta 960 px de ancho y
 * 380 px en móvil). Por ahora muestra un pastel fijo: el dibujo de pisos de la marca (`assets/motivos/dibujo-pisos.svg`)
 * con los colores del pastel 3D (pisos `betun` y `fresa-claro`, flama `frambuesa`) y su sombra de contacto. El
 * pastel 3D (react-three-fiber, `src/three/`) reemplaza el contenido de esta caja sin mover el diseño: la caja y
 * sus medidas se quedan. Es decorativo: el `h1` y el lema ya dicen de qué es la página, y el texto "Arrastra el
 * pastel para girarlo" llega con el 3D, que es lo que se puede arrastrar.
 */
export default function HeroCake() {
  return (
    <div
      data-testid="pastel-portada"
      aria-hidden="true"
      className="flex h-[600px] flex-col items-center justify-center max-[960px]:h-[460px] max-[600px]:h-[380px]"
    >
      <svg
        viewBox="8 4 48 52"
        className="block h-auto w-full max-w-[360px] max-[960px]:max-w-[300px] max-[600px]:max-w-[240px]"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* El trazo no escala con el dibujo: queda en 3 px a cualquier tamaño. */}
        <g className="stroke-mermelada" strokeWidth={3} vectorEffect="non-scaling-stroke">
          <rect x="16" y="34" width="32" height="18" rx="2" className="fill-betun" vectorEffect="non-scaling-stroke" />
          <rect x="22" y="22" width="20" height="12" rx="2" className="fill-fresa-claro" vectorEffect="non-scaling-stroke" />
          <path d="M16 36q4 4 8 0t8 0 8 0 8 0M22 24q2.5 3 5 0t5 0 5 0 5 0M32 22v-8M10 54h44" vectorEffect="non-scaling-stroke" />
          <path
            d="M32 6c2 2.5 3 4 2 6-.5 1-1.5 1.5-2 1.5s-1.5-.5-2-1.5c-1-2 0-3.5 2-6z"
            className="fill-frambuesa"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      {/* Sombra de contacto del libro de marca: 70% del ancho del pastel, `mermelada` al 16% con desenfoque de 12 px. */}
      <div className="-mt-2 h-6 w-[252px] rounded-[50%] bg-mermelada/[.16] blur-[12px] max-[960px]:w-[210px] max-[600px]:w-[168px]" />
    </div>
  )
}
