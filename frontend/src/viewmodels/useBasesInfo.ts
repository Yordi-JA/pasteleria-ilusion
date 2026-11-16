import { useMemo } from 'react'
import { formatPrice } from '../models/money.ts'
import { getStandInfo } from '../models/stands.ts'
import type { DepositsBeyond, Stand, StandInfo } from '../models/stands.ts'
import { useRemoteData } from './useRemoteData.ts'

/** Un renglón de "Depósito según los kilos": "Base para 4 a 5 kg", "Depósito $70" y su nota, si lleva. */
export type StandRowView = {
  key: string
  title: string
  deposit: string
  note: string | null
}

/** Lo que la pantalla pinta con los datos de la API. `null` en `returnPeriod`, `damagedPolicy` o `fromKg` es pendiente. */
export type BasesInfoView = {
  /** "15 días" o "1 día": el plazo de `PolicySettings.stand_return_days`; `null` si no llegó uno válido. */
  returnPeriod: string | null
  /**
   * Las bases de la pastelería y, al final, el renglón de lo que se cobra arriba de la más grande
   * ("Más de 25 kg (hasta 50 kg)"), con el mismo estilo. Vacía si no hay bases que prestar.
   */
  rows: StandRowView[]
  damagedPolicy: string | null
  /** "Desde 4 kg."; `null` sin bases activas. */
  fromKg: string | null
}

function daysLabel(days: number): string {
  return days === 1 ? '1 día' : `${days} días`
}

/** "Base para 4 a 5 kg" o, con un solo peso, "Base para 15 kg" (como `CakeStand.__str__`). */
function standTitle(stand: Pick<Stand, 'minKg' | 'maxKg'>): string {
  return stand.minKg === stand.maxKg ? `Base para ${stand.maxKg} kg` : `Base para ${stand.minKg} a ${stand.maxKg} kg`
}

function toStandRow(stand: Stand): StandRowView | null {
  const deposit = formatPrice(stand.deposit)
  if (deposit === null) return null
  return { key: `${stand.minKg}-${stand.maxKg}`, title: standTitle(stand), deposit: `Depósito ${deposit}`, note: stand.description || null }
}

/** "Más de 25 kg (hasta 50 kg)" con "Depósito de $300 a $500", o "Depósito $300" si el rango tiene un solo depósito. */
function toBeyondRow(beyond: DepositsBeyond): StandRowView | null {
  const min = formatPrice(beyond.minDeposit)
  const max = formatPrice(beyond.maxDeposit)
  if (min === null || max === null) return null
  return {
    key: `mas-de-${beyond.fromKg}`,
    title: `Más de ${beyond.fromKg - 1} kg (hasta ${beyond.toKg} kg)`,
    deposit: min === max ? `Depósito ${min}` : `Depósito de ${min} a ${max}`,
    note: null,
  }
}

function basesInfoView(info: StandInfo): BasesInfoView {
  const rows = [...info.stands.map(toStandRow), info.beyond && toBeyondRow(info.beyond)]
  return {
    returnPeriod: info.returnDays === null ? null : daysLabel(info.returnDays),
    rows: rows.filter((row): row is StandRowView => row !== null),
    damagedPolicy: info.damagedPolicy,
    fromKg: info.fromKg === null ? null : `Desde ${info.fromKg} kg.`,
  }
}

/**
 * View-model de `/bases` (BasesInfo.dc.html): las bases de la pastelería y las condiciones del préstamo, desde la API
 * (regla 7, D75). Se pide al montar y se reintenta con `retry`.
 */
export function useBasesInfo() {
  const { state, retry } = useRemoteData(getStandInfo, 'No se pudieron cargar las bases.')
  const info = state.status === 'ready' ? state.data : null
  const view = useMemo(() => (info ? basesInfoView(info) : null), [info])
  return { status: state.status, retry, view }
}

export type BasesInfoState = ReturnType<typeof useBasesInfo>
