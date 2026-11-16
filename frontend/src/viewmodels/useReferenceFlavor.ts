import { useMemo, useState } from 'react'
import { getCakeDesignOptions } from '../models/cakeDesign.ts'
import { emptyDraft } from '../models/cakeDesignDraft.ts'
import type { CakeDesignDraft } from '../models/cakeDesignDraft.ts'
import { breadChoices, cakeTypeChoices, fillingChoices, lowerFirst, withFillingBase, withFlavor, withFlavorCount } from './cakeDesignChoices.ts'
import { confirmStep, conflictSentence, conflictTarget, deriveDesign, fillingProblem } from './cakeDesignSteps.ts'
import { useRemoteData } from './useRemoteData.ts'

/** Los campos del sabor en el formulario de referencia, con su error bajo cada uno. */
export type FlavorField = 'cakeType' | 'bread' | 'filling'

/** Lo que el sabor suma a `POST reference-requests/` (segunda ronda de D70). */
export type FlavorSubmission = { cake_type: string; bread: string; filling_base: string | null; filling_flavors: string[] }

type Callbacks = {
  /** La persona cambió ese campo: su error se borra. */
  onEdit: (field: FlavorField) => void
  /** Un tipo nuevo quitó el pan o el relleno: el porqué va bajo ese campo. */
  onConflict: (field: FlavorField, message: string) => void
}

const OPTIONS_FAILURE = 'No se pudieron cargar los sabores del envío de referencia.'

/**
 * El sabor del envío de referencia (D70): el tipo de pastel, el pan y el relleno con las opciones y las reglas de los
 * pasos 2 a 4 de "Diseña tu pastel" (`GET cake-designs/options/`, regla 4.7). Reutiliza su lógica sobre un borrador mínimo
 * que solo lleva esas elecciones: las opciones que no aplican se ven desactivadas con su motivo, y un pan de relleno
 * incluido no deja elegir relleno. El servidor vuelve a revisar todo al enviar.
 */
export function useReferenceFlavor({ onEdit, onConflict }: Callbacks) {
  const { state, retry } = useRemoteData(getCakeDesignOptions, OPTIONS_FAILURE)
  const options = state.status === 'ready' ? state.data : null
  const [draft, setDraft] = useState<CakeDesignDraft>(emptyDraft)
  const design = useMemo(() => (options ? deriveDesign(draft, options, null) : null), [draft, options])

  const chooseType = (cakeType: string) => {
    if (!options) return
    const next = { ...draft, cakeType }
    const nextDesign = deriveDesign(next, options, null)
    const conflict = conflictTarget(nextDesign)
    // Como "Continuar" en el paso 2: quita solo lo que el tipo nuevo ya no admite.
    setDraft({ ...confirmStep(2, nextDesign, next), confirmed: [] })
    onEdit('cakeType')
    if (conflict && nextDesign.cakeType) {
      const sentence = conflictSentence(conflict.target, conflict.issue, nextDesign.cakeType, options)
      onConflict(conflict.target === 'pan' ? 'bread' : 'filling', `${sentence} Elige otro ${conflict.target}.`)
    }
  }
  const chooseBread = (bread: string) => {
    setDraft((current) => ({ ...current, bread }))
    onEdit('bread')
  }
  const chooseBase = (slug: string) => {
    if (options) setDraft((current) => withFillingBase(current, options, slug))
    onEdit('filling')
  }
  const chooseCount = (count: 1 | 2) => {
    if (options) setDraft((current) => withFlavorCount(current, options, count))
    onEdit('filling')
  }
  const chooseFlavor = (slug: string) => {
    if (options) setDraft((current) => withFlavor(current, options, slug))
    onEdit('filling')
  }

  /** Lo que falta para enviar, campo por campo, con las frases de "Diseña tu pastel". */
  const missing = (): Partial<Record<FlavorField, string>> => {
    const found: Partial<Record<FlavorField, string>> = {}
    if (!design?.cakeType) found.cakeType = 'Elige el tipo de pastel.'
    if (!design?.bread || design.breadIssue) found.bread = 'Elige el pan.'
    else if (design.cakeType) {
      const filling = fillingProblem(design, draft)
      if (filling) found.filling = filling
    }
    return found
  }

  /** Lo que se manda; `null` si falta algo (ver `missing`). */
  const submission = (): FlavorSubmission | null => {
    if (!design?.cakeType || !design.bread || Object.keys(missing()).length > 0) return null
    const included = design.fillingIncluded
    return {
      cake_type: design.cakeType.value,
      bread: design.bread.slug,
      filling_base: included ? null : (design.base?.slug ?? null),
      filling_flavors: included ? [] : design.flavors.map((flavor) => flavor.slug),
    }
  }

  const bread = design?.bread
  return {
    status: state.status,
    retry,
    view:
      design && options
        ? {
            cakeTypes: cakeTypeChoices(draft, options),
            breads: breadChoices(draft, design, options),
            filling: fillingChoices(draft, design, options),
            /** Con un pan de relleno incluido, el relleno no se elige: la frase dice cuál trae. */
            includedFilling:
              design.fillingIncluded && bread ? { bread: bread.name, filling: bread.includedFilling ? lowerFirst(bread.includedFilling) : null } : null,
          }
        : null,
    chooseType,
    chooseBread,
    chooseBase,
    chooseCount,
    chooseFlavor,
    missing,
    submission,
  }
}
