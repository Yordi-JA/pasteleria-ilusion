import { useMemo } from 'react'
import { bakeMoment, dayDifference, longDate } from './standDates.ts'
import { formatPrice } from '../models/money.ts'
import { getStandLoans } from '../models/standLoans.ts'
import type { StandLoan } from '../models/standLoans.ts'
import { bakeryToday } from '../models/dates.ts'
import { useRemoteData } from './useRemoteData.ts'

export type LoanedBaseView = {
  id: number
  title: string
  statusLabel: string
  orderId: number
  orderPath: string
  deposit: string
  /** "Devuélvela antes del" o "Venció el", según la fecha límite. */
  dueLabel: string
  due: string
  /** "Faltan 17 días", "Vence hoy" o "Ya pasó la fecha límite". */
  dueNote: string
  overdue: boolean
}

export type ReturnedBaseView = {
  id: number
  title: string
  returnedOn: string
  refund: string | null
}

const kgTitle = (kg: number) => `Base para ${kg} kg`

function dueNote(days: number): string {
  if (days < 0) return 'Ya pasó la fecha límite.'
  if (days === 0) return 'Vence hoy.'
  return days === 1 ? 'Falta 1 día.' : `Faltan ${days} días.`
}

function toLoaned(loan: StandLoan, today: string): LoanedBaseView {
  const days = dayDifference(today, loan.dueDate)
  const overdue = days < 0
  return {
    id: loan.id,
    title: kgTitle(loan.kg),
    statusLabel: loan.statusLabel,
    orderId: loan.orderId,
    orderPath: `/cuenta/pedidos/${loan.orderId}`,
    deposit: formatPrice(loan.deposit) ?? '',
    dueLabel: overdue ? 'Venció el' : 'Devuélvela antes del',
    due: longDate(loan.dueDate),
    dueNote: dueNote(days),
    overdue,
  }
}

function toReturned(loan: StandLoan): ReturnedBaseView {
  const moment = bakeMoment(loan.returnedAt)
  return {
    id: loan.id,
    title: kgTitle(loan.kg),
    returnedOn: moment ? `Devuelta el ${longDate(moment.date)}` : loan.statusLabel,
    refund: loan.depositRefunded ? 'Depósito liberado' : null,
  }
}

/**
 * View-model de `/cuenta/bases` (D69, mockup `CuentaBases`): las bases prestadas, con los días que faltan o el aviso de
 * que la fecha límite ya pasó (el día es el de la pastelería), y las devueltas. El orden es el de la API.
 */
export function useStandLoans() {
  const { state, retry } = useRemoteData(getStandLoans, 'No se pudieron cargar las bases en préstamo.')
  const loans = state.status === 'ready' ? state.data : null
  const view = useMemo(() => {
    if (!loans) return null
    const today = bakeryToday()
    return {
      loaned: loans.filter((loan) => loan.status === 'on_loan').map((loan) => toLoaned(loan, today)),
      returned: loans.filter((loan) => loan.status === 'returned').map(toReturned),
    }
  }, [loans])
  return { status: state.status, view, retry }
}
