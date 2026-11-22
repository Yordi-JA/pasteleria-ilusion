/**
 * La franja `mermelada` del pago (mockup de Pago): quién procesa los pagos. Solo en escritorio; en el teléfono no lleva franja.
 * Ya no lleva "¿Dudas con tu pedido?" con el WhatsApp, y la entrega no lleva franja: el usuario la volvió a pedir quitar
 * (correcciones del 21 de noviembre), como la del resto del sitio en D77. La entrega y el pago llevan el pie corto, sin el
 * WhatsApp; en la compra solo queda el enlace de la entrega a domicilio (`DeliveryParts`), y el pie completo del resto del sitio
 * lo sigue mostrando.
 */
export default function CheckoutStrip() {
  return (
    <div data-testid="franja" className="bg-mermelada text-nota text-betun max-[600px]:hidden">
      <div className="mx-auto flex max-w-[1200px] px-6 py-2.5">
        <p>Pagos procesados por Stripe y Mercado Pago</p>
      </div>
    </div>
  )
}
