import { useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import ButtonLink from '../components/ButtonLink.tsx'
import Card from '../components/Card.tsx'
import CheckoutPageHeader from '../components/CheckoutPageHeader.tsx'
import { focusRing } from '../components/focus.ts'
import LineDrawing from '../components/LineDrawing.tsx'
import TextLink from '../components/TextLink.tsx'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'
import { useCartPage } from '../viewmodels/useCartPage.ts'
import { useListShift } from '../viewmodels/useListShift.ts'
import CartLineItem from './cart/CartLineItem.tsx'
import CartSummary from './cart/CartSummary.tsx'

const TITLE = 'Tu carrito'

const column = 'mx-auto w-full max-w-[1200px] px-6 max-[600px]:px-4'

/**
 * El carrito vacío (mockup de CarritoVacio): la rebanada, la frase y las dos salidas. Con `arriving` (se acaba de quitar la última
 * línea, 22 de noviembre) la tarjeta sube 8 px y aparece en 250 ms; al abrir `/carrito` ya vacío se pinta tal cual.
 */
function EmptyCart({ headingRef, arriving }: { headingRef: RefObject<HTMLHeadingElement | null>; arriving: boolean }) {
  return (
    <div className={`${column} py-12`}>
      <Card
        large
        className={`mx-auto flex max-w-[532px] flex-col items-center gap-4 px-10 py-12 text-center max-[600px]:px-6 ${arriving ? 'motion-safe:animate-aparece' : ''}`}
      >
        <LineDrawing drawing="rebanada" size={96} className="text-mermelada opacity-50" />
        <h2 ref={headingRef} tabIndex={-1} className={`rounded-sm font-display text-titulo-2 ${focusRing}`}>
          Tu carrito está vacío
        </h2>
        <p className="text-nota text-mermelada-suave">Agrega algo de la vitrina para llevar hoy, o encarga un pastel del catálogo.</p>
        <div className="flex flex-wrap justify-center gap-3 max-[600px]:flex-col">
          <ButtonLink to="/vitrina">Ver la vitrina</ButtonLink>
          <ButtonLink to="/catalogo" variant="secondary">
            Ver el catálogo
          </ButtonLink>
        </div>
      </Card>
    </div>
  )
}

/**
 * `/carrito` (D66): las líneas de D46 con su cantidad, "Quitar" y "Editar pedido", y el resumen con el total estimado
 * y "Continuar a entrega". Sin líneas, el estado vacío del mockup.
 */
export default function Cart() {
  usePageTitle(TITLE)
  const productsHeading = useRef<HTMLHeadingElement>(null)
  const emptyHeading = useRef<HTMLHeadingElement>(null)
  const headings = useMemo(() => ({ products: productsHeading, empty: emptyHeading }), [])
  const cart = useCartPage(headings)
  // Si la página se abrió ya vacía: entonces el carrito vacío no entra, porque nada se quitó.
  const [openedEmpty] = useState(cart.empty)
  const linesList = useListShift<HTMLUListElement>(cart.lines.map((line) => line.id))
  // El símbolo va una vez: junto a la primera base.
  const stampLine = cart.lines.find((line) => line.base)?.id

  return (
    <>
      {cart.empty ? (
        <CheckoutPageHeader title={TITLE} />
      ) : (
        <CheckoutPageHeader title={TITLE} step="Carrito" drawing>
          <p className="text-cuerpo text-mermelada-suave">La fecha y la entrega las eliges en el siguiente paso.</p>
        </CheckoutPageHeader>
      )}
      {/* Siempre montada: anuncia lo que se quitó (el botón desaparece con su línea). */}
      <p role="status" className="sr-only">
        {cart.announcement}
      </p>
      {cart.empty ? (
        <EmptyCart headingRef={emptyHeading} arriving={!openedEmpty} />
      ) : (
        <div className={`${column} grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start gap-8 py-12 max-[900px]:grid-cols-1`}>
          <section aria-labelledby="carrito-productos" className="flex flex-col gap-4">
            <h2 id="carrito-productos" ref={productsHeading} tabIndex={-1} className={`self-start rounded-sm font-display text-titulo-2 ${focusRing}`}>
              Productos
            </h2>
            {/* `overflow-clip`: mientras las líneas que quedan suben a su lugar, la última todavía está abajo; se recorta en la
                orilla de la tarjeta en lugar de pasar sobre "Seguir comprando" y el pie. */}
            <Card large className="overflow-clip">
              <ul ref={linesList}>
                {cart.lines.map((line) => (
                  <CartLineItem
                    key={line.id}
                    line={line}
                    stamp={line.id === stampLine}
                    askingEdit={line.key.kind === 'design' && cart.pendingEdit === line.key.designId}
                    onQuantity={(quantity) => cart.setQuantity(line, quantity)}
                    onRemove={() => cart.remove(line)}
                    onEdit={() => line.key.kind === 'design' && cart.editDesign(line.key.designId)}
                    onConfirmEdit={cart.confirmEdit}
                    onCancelEdit={cart.cancelEdit}
                  />
                ))}
              </ul>
            </Card>
            <TextLink to="/catalogo">Seguir comprando</TextLink>
          </section>
          <section aria-labelledby="carrito-resumen" className="flex flex-col gap-4">
            <h2 id="carrito-resumen" className="font-display text-titulo-2">
              Resumen
            </h2>
            <CartSummary summary={cart.summary} paymentNote={cart.paymentNote} canContinue={cart.canContinue} />
          </section>
        </div>
      )}
    </>
  )
}
