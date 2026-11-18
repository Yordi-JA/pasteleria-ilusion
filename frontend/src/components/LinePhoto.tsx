type LinePhotoProps = {
  /** La miniatura del pastel diseñado (`data:` en WebP o JPEG); `null` deja el hueco. */
  thumbnail: string | null
  /** Lo que dice el hueco: "Foto del pastel" en el carrito, "Foto" en los resúmenes. */
  placeholder: string
  /** El tamaño de la caja, igual para la miniatura y el hueco. */
  className: string
}

/**
 * La foto de una línea del carrito o de un resumen (tanda 4): la miniatura del pastel diseñado o, sin ella, el hueco de
 * siempre. Las dos son decorativas (`alt=""` y `aria-hidden`): el nombre de la línea, junto a ellas, ya dice qué es, y la
 * lista de lo elegido describe el pastel mejor que una imagen chica. El pastel queda centrado y entero sobre `harina`.
 */
export default function LinePhoto({ thumbnail, placeholder, className }: LinePhotoProps) {
  if (thumbnail) {
    return <img src={thumbnail} alt="" decoding="async" className={`shrink-0 rounded-md bg-harina object-contain ${className}`} />
  }
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-md bg-harina text-center text-nota text-mermelada-suave ${className}`}>
      {placeholder}
    </span>
  )
}
