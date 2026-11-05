/** Enlaces para recorrer lo que ofrece la pastelería, en el orden del mockup. */
export const BROWSE_LINKS = [
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/vitrina', label: 'Vitrina' },
  { to: '/rebanadas', label: 'Rebanadas de hoy' },
] as const

/** La acción para encargar. El menú móvil la muestra como botón aparte. */
export const ORDER_LINK = { to: '/pedido', label: 'Realizar pedido' } as const

/** Enlaces de la barra. */
export const MAIN_LINKS = [...BROWSE_LINKS, ORDER_LINK] as const

/** Enlaces del pie, columna "La pastelería". */
export const FOOTER_LINKS = [...BROWSE_LINKS, { to: '/bases', label: 'Bases en préstamo' }, ORDER_LINK] as const
