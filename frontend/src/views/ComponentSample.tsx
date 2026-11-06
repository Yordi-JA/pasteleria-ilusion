import AddToCartNotice from '../components/AddToCartNotice.tsx'
import Button from '../components/Button.tsx'
import Card from '../components/Card.tsx'
import ChoiceOption from '../components/ChoiceOption.tsx'
import Duya from '../components/Duya.tsx'
import { focusRing } from '../components/focus.ts'
import Notice from '../components/Notice.tsx'
import ProgressPearls from '../components/ProgressPearls.tsx'
import Skeleton, { LoadingRegion } from '../components/Skeleton.tsx'
import TextField from '../components/TextField.tsx'
import { useComponentSample } from '../viewmodels/useComponentSample.ts'
import { usePageTitle } from '../viewmodels/usePageTitle.ts'

/** Página de muestra de los componentes base. Solo existe en desarrollo (ver `App.tsx`). */
export default function ComponentSample() {
  const vm = useComponentSample()
  usePageTitle('Muestra de componentes')

  // El marco del sitio (SiteLayout) ya pone el <main id="contenido">.
  return (
    <div className="bg-nata font-sans text-cuerpo text-mermelada">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 py-12">
        <h1 className="font-display text-titulo-1">Muestra de componentes</h1>

        <section aria-labelledby="m-boton" className="flex flex-col gap-4">
          <h2 id="m-boton" className="font-display text-titulo-2">Botón</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Button>Realizar pedido</Button>
            <Button variant="secondary">Ver la vitrina</Button>
            <Button disabled>Calculando…</Button>
            <Button variant="secondary" disabled>Ver tamaños y sabores</Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-md bg-mermelada p-6">
            <Button variant="onColor">Ver la vitrina</Button>
            <Button variant="onColor" disabled>Procesando pago…</Button>
          </div>
        </section>

        <section aria-labelledby="m-campo" className="flex flex-col gap-4">
          <h2 id="m-campo" className="font-display text-titulo-2">Campo</h2>
          <div className="grid max-w-[480px] gap-4">
            <TextField
              label="Correo electrónico"
              type="email"
              placeholder="nombre@correo.com"
              autoComplete="email"
              value={vm.email}
              onChange={(e) => vm.setEmail(e.target.value)}
              error={vm.emailError}
            />
            <TextField label="Teléfono" placeholder="Ej. 55 1234 5678" help="10 dígitos" inputMode="tel" />
            <TextField label="Nombre" placeholder="Ej. Ana López García" error="Escribe tu nombre completo." />
            <TextField label="Colonia" placeholder="Ej. Roma Norte" disabled />
          </div>
        </section>

        <section aria-labelledby="m-tarjeta" className="flex flex-col gap-4">
          <h2 id="m-tarjeta" className="font-display text-titulo-2">Tarjeta</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card as="article">
              <h3 className="font-display text-titulo-3">Tarjeta</h3>
              <p>Borde relieve y radio mediano.</p>
            </Card>
            <Card as="article" large>
              <h3 className="font-display text-titulo-3">Tarjeta grande</h3>
              <p>Borde relieve y radio grande.</p>
            </Card>
          </div>
        </section>

        <section aria-labelledby="m-opcion" className="flex flex-col gap-4">
          <h2 id="m-opcion" className="font-display text-titulo-2">Opción elegible</h2>
          <Card as="div">
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 font-display text-titulo-3">Pan</legend>
              <ChoiceOption name="pan" value="vainilla" label="Vainilla" description="El sabor base de la casa" checked={vm.bread === 'vainilla'} onChange={() => vm.setBread('vainilla')} />
              <ChoiceOption name="pan" value="chocolate" label="Chocolate" description="Pan de chocolate" checked={vm.bread === 'chocolate'} onChange={() => vm.setBread('chocolate')} />
              <ChoiceOption name="pan" value="red-velvet" label="Red velvet" description="Solo en pastel seco" disabled disabledReason="No se combina con pastel envinado" />
            </fieldset>
          </Card>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 font-display text-titulo-3">Pisos</legend>
            <div className="flex flex-wrap gap-2">
              {['1', '2', '3'].map((n) => (
                <ChoiceOption key={n} variant="chip" name="pisos" value={n} label={`${n} ${n === '1' ? 'piso' : 'pisos'}`} checked={vm.tiers === n} onChange={() => vm.setTiers(n)} />
              ))}
              <ChoiceOption variant="chip" name="pisos" value="4" label="4 pisos" disabled disabledReason="Solo con más kilos" />
            </div>
          </fieldset>
        </section>

        <section aria-labelledby="m-aviso" className="flex flex-col gap-4">
          <h2 id="m-aviso" className="font-display text-titulo-2">Aviso</h2>
          <div className="grid max-w-[640px] gap-4">
            <Notice title="Para 4 pisos la pastelería recomienda al menos 25 kg">
              Con 19 kg los pisos quedarían bajos. Puedes seguir así o elegir 3 pisos.
            </Notice>
            <Notice tone="attention" title="Apartado, falta tu pago">
              El pedido se cancela si no se paga ese día.
            </Notice>
            <Notice tone="error" title="Mercado Pago rechazó el pago.">
              Revisa los datos de la tarjeta o usa otra.
            </Notice>
            <div className="flex flex-col gap-4">
              <Button onClick={vm.add}>Agregar al pedido</Button>
              {vm.added && <Notice tone="success" title="Agregado al pedido" />}
            </div>
          </div>
        </section>

        <section aria-labelledby="m-carrito" className="flex flex-col gap-4">
          <h2 id="m-carrito" className="font-display text-titulo-2">Carrito</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {vm.cartExamples.map((example) => (
              <Card key={example.offering.offeringId} as="article" className="flex flex-col gap-2">
                <h3 className="font-display text-titulo-3">{example.offering.name}</h3>
                <p className="text-nota text-mermelada-suave">
                  {example.presentationLabel}, {example.price}
                </p>
                {example.stock !== undefined && <p className="text-nota text-mermelada-suave">Quedan {example.stock}</p>}
                {/* El nombre empieza con el texto visible (WCAG 2.5.3) y dice qué producto agrega. */}
                <Button
                  variant="secondary"
                  className="mt-2"
                  aria-label={`Agregar al pedido: ${example.offering.name}`}
                  onClick={() => vm.addToCart(example)}
                >
                  Agregar al pedido
                </Button>
              </Card>
            ))}
          </div>
          <AddToCartNotice feedback={vm.cartFeedback} className="max-w-[640px]" />
          <h3 className="font-display text-titulo-3">En el carrito</h3>
          {vm.cartItems.length === 0 ? (
            <p>El carrito está vacío.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {vm.cartItems.map((item) => (
                <li key={item.offeringId} className="flex flex-wrap items-center gap-x-4">
                  <span>
                    {item.name}: {item.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar: ${item.name}`}
                    onClick={() => vm.removeFromCart(item.offeringId)}
                    className={`inline-flex min-h-11 cursor-pointer items-center rounded-sm font-semibold underline underline-offset-4 ${focusRing}`}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button variant="secondary" onClick={vm.clearCart}>
              Vaciar el carrito
            </Button>
          </div>
        </section>

        <section aria-labelledby="m-perlas" className="flex flex-col gap-4">
          <h2 id="m-perlas" className="font-display text-titulo-2">Perlas de avance</h2>
          <ul className="flex flex-col gap-3">
            {vm.pearlExamples.map((example) => (
              <li key={example.id} data-testid={example.id}>
                <ProgressPearls steps={vm.pearlSteps} current={example.current} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="m-esqueleto" className="flex flex-col gap-6">
          <h2 id="m-esqueleto" className="font-display text-titulo-2">Esqueleto de carga</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div data-testid="esqueleto-nata" className="flex flex-col gap-3 rounded-md bg-nata p-6 outline outline-1 -outline-offset-1 outline-relieve">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3.5 w-2/5" />
            </div>
            <div data-testid="esqueleto-fresa" className="flex flex-col gap-3 rounded-md bg-fresa p-6">
              <Skeleton tone="fresa" className="h-5 w-2/3" />
              <Skeleton tone="fresa" className="h-3.5 w-2/5" />
            </div>
            <div data-testid="esqueleto-mermelada" className="flex flex-col gap-3 rounded-md bg-mermelada p-6">
              <Skeleton tone="mermelada" className="h-5 w-2/3" />
              <Skeleton tone="mermelada" className="h-3.5 w-2/5" />
            </div>
          </div>
          <div>
            <Button variant="secondary" onClick={vm.toggleCatalogLoading}>
              {vm.catalogLoading ? 'Mostrar el catálogo cargado' : 'Volver a cargar'}
            </Button>
          </div>
          <LoadingRegion
            loading={vm.catalogLoading}
            label="Cargando el catálogo…"
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            skeleton={vm.catalogCards.map((n) => (
              <Card key={n} large className="flex flex-col gap-3">
                <Skeleton radius="md" className="h-[200px] w-full" />
                <Skeleton className="h-5 w-[70%]" />
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3.5 w-[30%]" />
                <Skeleton radius="md" className="h-11 w-full" />
              </Card>
            ))}
          >
            {vm.catalogCards.map((n) => (
              <Card key={n} as="article" large>
                <h3 className="font-display text-titulo-3">Pastel de ejemplo</h3>
                <p>Descripción de ejemplo.</p>
              </Card>
            ))}
          </LoadingRegion>
        </section>

        <section aria-labelledby="m-duya" className="flex flex-col gap-4">
          <h2 id="m-duya" className="font-display text-titulo-2">Borde de duya</h2>
          <div className="overflow-hidden rounded-md border border-relieve">
            <div className="bg-fresa px-6 py-8 font-display text-titulo-3">Conchas, bajo el encabezado</div>
            <Duya type="concha" color="fresa" below="betun" />
            <div className="bg-betun px-6 pb-8 pt-10">Contenido sobre betún</div>
            <div className="bg-mermelada px-6 py-8 font-display text-titulo-3 text-sobre-color">Perlas, en un cambio fuerte de color</div>
            <Duya type="perlas" color="mermelada" below="nata" />
            <div className="bg-nata px-6 pb-8 pt-10 font-display text-titulo-3">Guirnalda, siempre antes del pie</div>
            <Duya type="guirnalda" color="nata" below="mermelada" />
            <div className="bg-mermelada px-6 pb-8 pt-12 text-sobre-color">Pie</div>
          </div>
        </section>
      </div>
    </div>
  )
}
