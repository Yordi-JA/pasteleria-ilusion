type DirectionsLinkProps = {
  /** `StoreDetails.directionsUrl`: la búsqueda de Google Maps con la dirección ya codificada. */
  url: string
  className: string
}

/**
 * "Cómo llegar" (D71): abre Google Maps con la dirección de la pastelería en otra pestaña. Sin API ni mapa embebido;
 * quien lo usa decide si hay dirección (sin ella no se pinta).
 */
export default function DirectionsLink({ url, className }: DirectionsLinkProps) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      Cómo llegar
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  )
}
