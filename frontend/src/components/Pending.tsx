type PendingProps = {
  /** Qué dato falta, en minúscula salvo al inicio de la línea: "Dirección", "número", "días". */
  what: string
}

/**
 * Marcador de un dato del negocio que todavía no existe (regla 1 de AGENTS.md): se lee igual con o sin
 * color, entre corchetes como en el mockup. El texto es parte de la frase, así que un lector de pantalla lo dice.
 */
export default function Pending({ what }: PendingProps) {
  return <span data-pendiente="">[{what} por confirmar]</span>
}
