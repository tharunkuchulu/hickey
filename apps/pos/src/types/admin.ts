/** Admin DTOs (users, cash movements). Pure types only. */

export interface UserDto {
  id: string
  name: string
  role: 'admin' | 'cashier'
  isActive: boolean
  createdAt: string
}

export interface UserInput {
  id?: string
  name: string
  role: 'admin' | 'cashier'
  /** 4–6 digits; required for a new user, optional (= keep) when editing. */
  pin?: string | null
  isActive?: boolean
}

export type CashMovementKind = 'expense' | 'withdrawal' | 'top_up'

export interface CashMovementInput {
  kind: CashMovementKind
  amount: number // paise
  reason?: string | null
}

export interface CashMovementDto {
  id: string
  businessDate: string
  kind: CashMovementKind
  amount: number
  reason: string | null
  by: string | null
  createdAt: string
}

export interface CashFlowSummaryDto {
  businessDate: string
  opening: number
  cashSales: number
  topUp: number
  expense: number
  withdrawal: number
  expected: number
  movements: CashMovementDto[]
}
