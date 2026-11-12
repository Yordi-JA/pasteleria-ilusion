import type { BreadOption, CakeDesignOptions } from '../models/cakeDesign.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import { formatPrice } from '../models/money.ts'
import type { DesignDerived } from './cakeDesignSteps.ts'

/**
 * Las opciones de los pasos 2 a 5 listas para pintar: etiqueta, descripción, precio con formato y, si no se pueden
 * elegir, su motivo (regla 4.7: nunca desaparecen). Los precios son los de la API; aquí solo se les da formato.
 */

export type Choice = {
  value: string
  label: string
  description?: string
  /** Precio a la derecha ("Desde $180 por kg"). */
  trailing?: string
  checked: boolean
  /** `undefined` si se puede elegir; con texto, el motivo; vacío, desactivada sin motivo propio (lo dice el contador). */
  disabledReason?: string
}

export function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/** Descripción de cada tipo de pastel, del mockup (`Cotizador.dc.html`). Un tipo nuevo sale sin descripción. */
const CAKE_TYPE_DESCRIPTIONS: Record<string, string> = {
  tres_leches: 'Pan bañado en tres leches',
  seco: 'Pan sin baño',
  envinado: 'Pan bañado en almíbar con vino',
}

function perKg(amount: string | undefined, from: boolean) {
  const price = amount ? formatPrice(amount) : null
  return price ? `${from ? 'Desde ' : ''}${price} por kg` : undefined
}

/** Panes que la API dice que no se combinan con este tipo: "No se combina con Choco-pingüino". */
function clashingBreads(type: string, breads: BreadOption[]) {
  return breads.filter((bread) => bread.unavailableCodes[type] === 'not_combinable')
}

export function joinOr(names: string[]) {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} o ${names[names.length - 1]}`
}

export function cakeTypeChoices(draft: CakeDesignDraft, options: CakeDesignOptions): Choice[] {
  return options.cakeTypes.map((type) => {
    const clashes = clashingBreads(type.value, options.breads).map((bread) => bread.name)
    const base = CAKE_TYPE_DESCRIPTIONS[type.value]
    const clash = clashes.length ? `No se combina con ${joinOr(clashes)}.` : ''
    // Como el mockup: "Pan sin baño", o con el aviso, "Pan bañado en almíbar con vino. No se combina con Choco-pingüino."
    const description = base && clash ? `${base}. ${clash}` : base || clash || undefined
    return { value: type.value, label: type.label, description, checked: draft.cakeType === type.value }
  })
}

export type BreadGroups = {
  withFilling: Choice[]
  /** Panes de precio completo: traen su relleno y se saltan el paso 4. */
  fillingIncluded: Choice[]
  /** "Para usar Choco-pingüino, cambia el tipo de pastel a Tres leches o Seco."; `null` si no hace falta. */
  hint: string | null
}

export function breadChoices(draft: CakeDesignDraft, design: DesignDerived, options: CakeDesignOptions): BreadGroups {
  const type = design.cakeType?.value ?? ''
  const toChoice = (bread: BreadOption): Choice => {
    const reason = bread.unavailableReasons[type]
    const included = bread.pricingMode === 'full_price_per_kg'
    return {
      value: bread.slug,
      label: bread.name,
      description: bread.description || (included && bread.includedFilling ? `Relleno de ${lowerFirst(bread.includedFilling)}` : undefined),
      trailing: reason ? undefined : perKg(bread.pricePerKgFrom[type], !included),
      checked: draft.bread === bread.slug,
      disabledReason: reason,
    }
  }
  const labels = new Map(options.cakeTypes.map((option) => [option.value, option.label]))
  const hints = clashingBreads(type, options.breads).map((bread) => {
    const types = bread.allowedCakeTypes.map((value) => labels.get(value) ?? value)
    return `Para usar ${bread.name}, cambia el tipo de pastel a ${joinOr(types)}.`
  })
  return {
    withFilling: options.breads.filter((bread) => bread.pricingMode === 'extra_per_kg').map(toChoice),
    fillingIncluded: options.breads.filter((bread) => bread.pricingMode === 'full_price_per_kg').map(toChoice),
    hint: hints.length ? hints.join(' ') : null,
  }
}

export type FillingView = {
  bases: Choice[]
  /** "Ahora, el sabor con queso" o "Elige el sabor" / "Elige 2 sabores". */
  flavorsHeading: string
  /** El modo "Un sabor" / "Dos sabores", si la base elegida admite más de uno. */
  countChoice: { one: Choice; two: Choice } | null
  /** Con dos sabores, casillas; con uno, radios. */
  multiple: boolean
  /** Si ya hay una base elegida: los sabores aparecen después. */
  showFlavors: boolean
  flavors: Choice[]
  /** "2 de 2 sabores elegidos", con dos sabores. */
  counter: string | null
  /** Nota al pie: "Dos sabores solo con la base Normal." o "Fresa con yogurt no se combina.". */
  note: string | null
}

export function fillingChoices(draft: CakeDesignDraft, design: DesignDerived, options: CakeDesignOptions): FillingView {
  const type = design.cakeType?.value ?? ''
  const base = design.base
  const multiple = design.flavorsNeeded === 2
  const chosen = new Set(draft.flavors)
  // Solo cuentan los sabores elegidos que se pueden elegir en esta base y este tipo: uno guardado que ya no aplica no llena el cupo.
  const choosableChosen = design.flavors.filter((flavor) => !flavor.unavailableReasons[type])
  const full = multiple && choosableChosen.length >= 2
  const flavors: Choice[] = (base?.flavors ?? []).map((flavor) => {
    const reason = flavor.unavailableReasons[type] ?? (multiple && !flavor.isCombinable ? 'No se combina' : undefined)
    return {
      value: flavor.slug,
      label: flavor.name,
      trailing: reason ? undefined : perKg(flavor.pricePerKgByCakeType[type], false),
      checked: chosen.has(flavor.slug),
      // Con los dos sabores elegidos, los demás esperan a que se quite uno; el contador lo dice.
      disabledReason: reason ?? (full && !chosen.has(flavor.slug) ? '' : undefined),
    }
  })
  const extra = base ? formatPrice(base.combinedExtraPerKg) : null
  const multiBases = options.fillingBases.filter((option) => option.maxFlavors >= 2).map((option) => option.name)
  const notCombinable = (base?.flavors ?? []).filter((flavor) => !flavor.isCombinable && !flavor.unavailableReasons[type]).map((f) => f.name)
  // Regla 4.7: con un sabor que no se combina ya elegido, "Dos sabores" se desactiva y el sabor se queda.
  const blocking = !multiple ? design.flavors.find((flavor) => !flavor.isCombinable) : undefined
  return {
    bases: options.fillingBases.map((option) => ({
      value: option.slug,
      label: option.name,
      description: perKg(option.pricePerKgByCakeType[type], false),
      checked: draft.fillingBase === option.slug,
      disabledReason: option.unavailableReasons[type],
    })),
    flavorsHeading: base && base.maxFlavors < 2 ? `Ahora, el sabor ${lowerFirst(base.name)}` : multiple ? 'Elige 2 sabores' : 'Elige el sabor',
    countChoice:
      base && base.maxFlavors >= 2
        ? {
            one: { value: '1', label: 'Un sabor', description: 'Todo el relleno igual', checked: !multiple },
            two: {
              value: '2',
              label: 'Dos sabores',
              description: extra && extra !== '$0' ? `Mitad y mitad, +${extra} por kg` : 'Mitad y mitad',
              checked: multiple,
              disabledReason: blocking ? `${blocking.name} no se combina` : undefined,
            },
          }
        : null,
    multiple,
    showFlavors: Boolean(base),
    flavors,
    counter: multiple ? `${design.flavors.length} de 2 sabores elegidos` : null,
    note:
      base && base.maxFlavors < 2 && multiBases.length
        ? `Dos sabores solo con la base ${joinOr(multiBases)}.`
        : multiple && notCombinable.length
          ? `${joinOr(notCombinable)} no se combina.`
          : null,
  }
}
