import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useNavigate } from 'react-router'
import { attemptKey, fingerprintOf, forgetAttempt } from '../models/attempts.ts'
import { bakeryToday, parseIsoDate } from '../models/dates.ts'
import { DECORATION_IMAGE_MAX_MB, displayFileName, imageProblem, imageProblemMessage, inspectImage } from '../models/decorationImage.ts'
import type { Occasion } from '../models/occasion.ts'
import {
  REFERENCE_DESCRIPTION_MAX_LENGTH,
  REFERENCE_MAX_PEOPLE,
  REFERENCE_MAX_PHOTOS,
  submitReferenceRequest,
  uploadReferencePhoto,
} from '../models/referenceRequests.ts'
import type { ReferenceSubmission } from '../models/referenceRequests.ts'
import { normalizeBudget, photoUploadErrorFrom, referenceErrorsFrom } from './referenceView.ts'
import type { ReferenceErrorsView, ReferenceField } from './referenceView.ts'
import { useReferenceFlavor } from './useReferenceFlavor.ts'
import { useStoreDetails } from './useStoreInfo.ts'

/** La llave del intento de envío (D70), como la del pedido (D66): un UUID y el hash de lo que se manda. */
const ATTEMPT_STORAGE = 'ilusion.reference.v1'

/** El tamaño de la foto en la frase del mockup ("Pesa más de 5 MB, el máximo"). */
export const REFERENCE_PHOTO_MAX_MB = DECORATION_IMAGE_MAX_MB

/** Una foto elegida: su archivo, su vista previa local y, si ya se subió en este intento, su id en el servidor. */
export type ReferencePhoto = {
  /** Quién es esta elección, no su nombre: dos fotos con el mismo nombre no se confunden. */
  id: string
  name: string
  file: File
  url: string | null
  status: 'ready' | 'uploading' | 'uploaded' | 'error'
  error: string | null
  serverId: string | null
}

export type ReferenceUploadStatus = 'idle' | 'uploading' | 'sending'

/** A dónde va el foco: el aviso tras un error, el selector al quitar una foto. */
export type ReferenceFocus = Record<'alert' | 'picker', RefObject<HTMLElement | null>>

const PEOPLE_DIGITS = /^\d{1,6}$/

/** "AAAA-MM-DD" más `days` días, sin la zona del navegador. */
function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function photoProblemMessage(problem: NonNullable<Awaited<ReturnType<typeof inspectImage>>>): string {
  return problem === 'size' ? `Pesa más de ${REFERENCE_PHOTO_MAX_MB} MB, el máximo. Prueba con una foto más ligera.` : imageProblemMessage(problem)
}

/** "a.png", "a.png ni b.png", "a.png, b.png ni c.png". */
function joinNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ni ${names[names.length - 1]}`
}

/**
 * View-model de `/pedido/referencia` (D70): las fotos (revisadas en el navegador al elegirlas y subidas al enviar, con
 * `purpose=reference`), los datos de la solicitud y "Enviar solicitud" con su llave de idempotencia. Una foto ya subida
 * en este intento no se vuelve a subir en un reintento; las que se quitan antes de enviar nunca se suben.
 */
export function useReferenceUpload(focus: ReferenceFocus) {
  const navigate = useNavigate()
  const store = useStoreDetails()
  const [photos, setPhotos] = useState<ReferencePhoto[]>([])
  const [overflow, setOverflow] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [occasion, setOccasion] = useState<Occasion | ''>('')
  const [people, setPeople] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [budget, setBudget] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ReferenceField, string>>>({})
  const [errors, setErrors] = useState<ReferenceErrorsView | null>(null)
  const [status, setStatus] = useState<ReferenceUploadStatus>('idle')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const running = useRef(false)

  // Las vistas previas se liberan al quitar cada foto y al salir de la pantalla.
  const live = useRef<ReferencePhoto[]>([])
  useEffect(() => {
    live.current = photos
  }, [photos])
  useEffect(
    () => () => {
      for (const photo of live.current) if (photo.url) URL.revokeObjectURL(photo.url)
    },
    [],
  )

  const focusTarget = useRef<keyof ReferenceFocus | null>(null)
  useEffect(() => {
    const target = focusTarget.current
    if (!target) return
    focusTarget.current = null
    focus[target].current?.focus()
  })

  const clearField = useCallback((field: ReferenceField) => setFieldErrors((current) => ({ ...current, [field]: undefined })), [])
  const flavor = useReferenceFlavor({
    onEdit: clearField,
    onConflict: (field, message) => setFieldErrors((current) => ({ ...current, [field]: message })),
  })

  const pick = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || running.current) return
      const room = Math.max(0, REFERENCE_MAX_PHOTOS - live.current.length)
      const taken = files.slice(0, room)
      const left = files.slice(room).map((file) => displayFileName(file.name) ?? 'foto')
      setOverflow(left.length > 0 ? `Caben ${REFERENCE_MAX_PHOTOS} fotos. No agregamos ${joinNames(left)}.` : null)
      const rows = await Promise.all(
        taken.map(async (file): Promise<ReferencePhoto> => {
          const problem = imageProblem(file) ?? (await inspectImage(file))
          return {
            id: crypto.randomUUID(),
            name: displayFileName(file.name) ?? 'foto',
            file,
            url: problem ? null : URL.createObjectURL(file),
            status: problem ? 'error' : 'ready',
            error: problem ? photoProblemMessage(problem) : null,
            serverId: null,
          }
        }),
      )
      setPhotos((current) => {
        const next = [...current, ...rows]
        // Dos elecciones seguidas no pasan del tope: lo que sobra se descarta y libera su vista previa.
        for (const extra of next.slice(REFERENCE_MAX_PHOTOS)) if (extra.url) URL.revokeObjectURL(extra.url)
        return next.slice(0, REFERENCE_MAX_PHOTOS)
      })
      clearField('photos')
    },
    [clearField],
  )

  const remove = useCallback((id: string) => {
    if (running.current) return
    setPhotos((current) => {
      const photo = current.find((candidate) => candidate.id === id)
      if (photo?.url) URL.revokeObjectURL(photo.url)
      return current.filter((candidate) => candidate.id !== id)
    })
    setOverflow(null)
    focusTarget.current = 'picker'
  }, [])

  /** La vista previa no se pudo abrir (un archivo dañado que decía ser imagen): la foto queda con su error. */
  const unreadable = useCallback((id: string) => {
    setPhotos((current) =>
      current.map((photo) => {
        if (photo.id !== id) return photo
        if (photo.url) URL.revokeObjectURL(photo.url)
        return { ...photo, url: null, status: 'error', error: 'No pudimos abrir esa foto. Elige otra.' }
      }),
    )
  }, [])

  const edit = {
    description: (value: string) => {
      setDescription(value)
      clearField('description')
    },
    occasion: (value: string) => {
      setOccasion(value as Occasion | '')
      clearField('occasion')
    },
    people: (value: string) => {
      setPeople(value)
      clearField('people')
    },
    eventDate: (value: string) => {
      setEventDate(value)
      clearField('eventDate')
    },
    budget: (value: string) => {
      setBudget(value)
      clearField('budget')
    },
  }

  /** Lo que el navegador puede revisar antes de mandar; la anticipación y los topes del admin los dice el servidor. */
  function validate(): Partial<Record<ReferenceField, string>> {
    const found: Partial<Record<ReferenceField, string>> = {}
    if (photos.length === 0) found.photos = 'Elige al menos una foto de referencia.'
    else if (photos.some((photo) => photo.status === 'error')) found.photos = 'Quita las fotos con error para enviar tu solicitud.'
    const text = description.trim()
    if (text === '') found.description = 'Cuéntanos qué quieres que tomemos de la foto.'
    else if (text.length > REFERENCE_DESCRIPTION_MAX_LENGTH) found.description = `Escribe la descripción en ${REFERENCE_DESCRIPTION_MAX_LENGTH} caracteres o menos.`
    const count = people.trim()
    if (!PEOPLE_DIGITS.test(count) || Number(count) < 1) found.people = 'Indica para cuántas personas es.'
    else if (Number(count) > REFERENCE_MAX_PEOPLE) found.people = 'Para tantas personas, escríbenos por WhatsApp.'
    if (!parseIsoDate(eventDate)) found.eventDate = 'Elige la fecha del evento.'
    if (normalizeBudget(budget) === 'invalid') found.budget = 'Escribe el presupuesto con número, por ejemplo 1500.'
    return { ...found, ...flavor.missing() }
  }

  const patchPhoto = (id: string, patch: Partial<ReferencePhoto>) =>
    setPhotos((current) => current.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)))

  /** Sube las fotos que faltan, en orden. Devuelve sus ids o `null` si una falló (ya con su error). */
  async function uploadPending(): Promise<string[] | null> {
    const ids: string[] = []
    const total = photos.length
    for (const [index, photo] of photos.entries()) {
      setProgress({ done: index, total })
      if (photo.serverId) {
        ids.push(photo.serverId)
        continue
      }
      patchPhoto(photo.id, { status: 'uploading' })
      try {
        const serverId = await uploadReferencePhoto(photo.file, photo.name)
        // Se recuerda en la foto: un reintento no la vuelve a subir.
        patchPhoto(photo.id, { status: 'uploaded', serverId })
        ids.push(serverId)
      } catch (error) {
        console.warn('No se pudo subir una foto de referencia.', error)
        const { view, photoMessage } = photoUploadErrorFrom(error, photo.name)
        patchPhoto(photo.id, photoMessage ? { status: 'error', error: photoMessage } : { status: 'ready' })
        setErrors(view)
        if (photoMessage) setFieldErrors((current) => ({ ...current, photos: 'Quita las fotos con error para enviar tu solicitud.' }))
        return null
      }
    }
    return ids
  }

  const submit = async () => {
    if (running.current) return
    const found = validate()
    setFieldErrors(found)
    if (Object.values(found).some(Boolean)) {
      setErrors({ title: 'Revisa tu solicitud', messages: Object.values(found).filter((message): message is string => Boolean(message)), fields: found })
      focusTarget.current = 'alert'
      return
    }
    running.current = true
    setErrors(null)
    try {
      const chosenFlavor = flavor.submission()
      if (!chosenFlavor) return
      setStatus('uploading')
      const imageIds = await uploadPending()
      if (!imageIds) {
        focusTarget.current = 'alert'
        return
      }
      setStatus('sending')
      const budgetValue = normalizeBudget(budget)
      const submission: ReferenceSubmission = {
        image_ids: imageIds,
        description: description.trim(),
        occasion,
        people: Number(people.trim()),
        event_date: eventDate,
        budget: budgetValue === 'invalid' ? null : budgetValue,
        ...chosenFlavor,
      }
      const key = attemptKey(ATTEMPT_STORAGE, await fingerprintOf(JSON.stringify(submission)))
      try {
        const request = await submitReferenceRequest(submission, key)
        forgetAttempt(ATTEMPT_STORAGE)
        navigate(`/pedido/referencia/enviada?solicitud=${request.id}`)
      } catch (error) {
        console.warn('No se pudo enviar la solicitud de referencia.', error)
        const view = referenceErrorsFrom(error)
        setErrors(view)
        setFieldErrors(view.fields)
        focusTarget.current = 'alert'
      }
    } finally {
      running.current = false
      setStatus('idle')
      setProgress(null)
    }
  }

  return {
    /** El primer día que el calendario del navegador ofrece; la anticipación la revisa el servidor al enviar. */
    minEventDate: addDays(bakeryToday(), store.leadDays ?? 0),
    leadDays: store.leadDays,
    store,
    photos,
    full: photos.length >= REFERENCE_MAX_PHOTOS,
    overflow,
    pick,
    remove,
    unreadable,
    description,
    occasion,
    people,
    eventDate,
    budget,
    flavor,
    edit,
    fieldErrors,
    errors,
    status,
    progress,
    submit,
  }
}
