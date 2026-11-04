import Button from '../components/Button.tsx'
import Card from '../components/Card.tsx'
import ChoiceOption from '../components/ChoiceOption.tsx'
import Notice from '../components/Notice.tsx'
import TextField from '../components/TextField.tsx'
import { useComponentSample } from '../viewmodels/useComponentSample.ts'

/** Página de muestra de los componentes base. Solo existe en desarrollo (ver `App.tsx`). */
export default function ComponentSample() {
  const vm = useComponentSample()

  return (
    <main id="contenido" className="min-h-screen bg-nata font-sans text-cuerpo text-mermelada">
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
      </div>
    </main>
  )
}
