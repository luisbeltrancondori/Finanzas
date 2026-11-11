export type DatabaseId = string
export type MovementType = 'Ingreso' | 'Gasto'

export type Bank = {
  id: DatabaseId
  name: string
  active: boolean
}

export type Currency = {
  id: DatabaseId
  name: string
  code: string
  symbol: string
  isBase: boolean
  rateToBase: number | null
  rateSource?: string
  rateUpdatedAt?: string | null
}

export type PaymentType = {
  id: DatabaseId
  name: string
}

export type Account = {
  id: DatabaseId
  name: string
  bankId: DatabaseId
  bank: string
  number: string
  balance: number
  currencyId: DatabaseId
  currency: string
  symbol: string
  color: string
  icon: string
  active: boolean
}

export type Category = {
  id: DatabaseId
  name: string
  type: MovementType
  description: string
  active: boolean
  color: string
  icon: string
}

export type Movement = {
  id: DatabaseId
  userId?: DatabaseId
  userName?: string
  userEmail?: string
  description: string
  categoryId: DatabaseId
  category: string
  categoryIcon: string
  accountId: DatabaseId
  account: string
  currencyId: DatabaseId
  currency: string
  exchangeRate: number | null
  symbol: string
  date: string
  amount: number
  type: MovementType
  payment: string
  paymentId: DatabaseId
  receiptUrl?: string
  receiptIsImage?: boolean
}

export type Transfer = {
  id: DatabaseId
  fromId: DatabaseId
  toId: DatabaseId
  from: string
  to: string
  amount: number
  currency: string
  date: string
  description: string
}

export type ObligationStatus = 'Pendiente' | 'Pagado'

export type Obligation = {
  id: DatabaseId
  userId: DatabaseId
  title: string
  dueDate: string
  estimatedAmount: number
  categoryId: DatabaseId | null
  status: ObligationStatus
}

export type PageKey = 'dashboard' | 'movements' | 'transfers' | 'accounts' | 'calendar' | 'catalogs' | 'users' | 'permissions'
export type ModalKind = 'movement' | 'transfer' | 'account' | 'bank' | 'category' | 'payment' | 'currency'
