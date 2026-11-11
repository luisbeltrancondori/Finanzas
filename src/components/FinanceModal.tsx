import { zodResolver } from '@hookform/resolvers/zod'
import { FileImage, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ReactNode } from 'react'
import { fetchCurrentExchangeRate } from '../services/currencyService'
import type { Account, Bank, Category, Currency, ModalKind, Movement, PaymentType } from '../types/finance'

type Values = Record<string, string | number | File | undefined>
type Props = {
  kind: ModalKind
  movementToEdit?: Movement
  accounts: Account[]
  categories: Category[]
  banks: Bank[]
  currencies: Currency[]
  baseCurrencyCode: string
  paymentTypes: PaymentType[]
  onClose: () => void
  onSave: (kind: ModalKind, values: Values) => Promise<void>
}

const movementSchema = z.object({
  type: z.enum(['Ingreso', 'Gasto']),
  description: z.string().min(2, 'Escribe una descripción'),
  amount: z.number().positive('El monto debe ser mayor a cero'),
  date: z.string().min(1, 'Selecciona una fecha'),
  account: z.string().min(1, 'Selecciona una cuenta'),
  category: z.string().min(1, 'Selecciona una categoría'),
  payment: z.string().min(1, 'Selecciona un método de pago'),
  exchangeRate: z.number().positive('La tasa debe ser mayor que cero').optional(),
})
const transferSchema = z.object({
  from: z.string().min(1, 'Selecciona la cuenta de origen'),
  to: z.string().min(1, 'Selecciona la cuenta de destino'),
  amount: z.number().positive('El monto debe ser mayor a cero'),
  date: z.string().min(1, 'Selecciona una fecha'),
  description: z.string().min(2, 'Escribe una descripción'),
})
const accountSchema = z.object({
  name: z.string().min(2, 'El nombre es obligatorio'),
  bankId: z.string().min(1, 'Selecciona un banco'),
  number: z.string().min(4, 'Ingresa al menos 4 caracteres'),
  balance: z.number().min(0, 'El saldo no puede ser negativo'),
  currencyId: z.string().min(1, 'Selecciona una moneda'),
})
const catalogSchema = z.object({
  name: z.string().min(2, 'El nombre es obligatorio'),
  type: z.enum(['Ingreso', 'Gasto']).optional(),
  description: z.string().optional(),
  code: z.string().optional(),
  symbol: z.string().optional(),
  rateToBase: z.number().positive('La tasa debe ser mayor que cero').optional(),
})

type MovementValues = z.infer<typeof movementSchema>
type TransferValues = z.infer<typeof transferSchema>
type AccountValues = z.infer<typeof accountSchema>
type CatalogValues = z.infer<typeof catalogSchema>

const now = new Date()
const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
const modalTitles: Record<ModalKind, string> = {
  movement: 'Registrar movimiento',
  transfer: 'Nueva transferencia',
  account: 'Agregar cuenta',
  bank: 'Agregar banco',
  category: 'Nueva categoría',
  payment: 'Nuevo tipo de pago',
  currency: 'Agregar moneda',
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>
}

export default function FinanceModal({ kind, movementToEdit, accounts, categories, banks, currencies, baseCurrencyCode, paymentTypes, onClose, onSave }: Props) {
  const [receipt, setReceipt] = useState<File>()
  const [receiptError, setReceiptError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const submit = async (values: Values) => {
    setSaving(true)
    setSaveError('')
    try {
      await onSave(kind, values)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const selectReceipt = (file?: File) => {
    if (!file) {
      setReceipt(undefined)
      setReceiptError('')
    } else if (file.size > 10 * 1024 * 1024) {
      setReceipt(undefined)
      setReceiptError('El archivo no puede superar los 10 MB.')
    } else if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setReceipt(undefined)
      setReceiptError('Adjunta una imagen o un archivo PDF.')
    } else {
      setReceipt(file)
      setReceiptError('')
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading">
          <div><div className="eyebrow">FINORA · GESTIÓN</div><h2 id="modal-title">{kind === 'movement' && movementToEdit ? 'Editar movimiento' : modalTitles[kind]}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar" disabled={saving}><X size={20} /></button>
        </div>
        {kind === 'movement' && <MovementForm movement={movementToEdit} accounts={accounts} categories={categories} currencies={currencies} paymentTypes={paymentTypes} receipt={receipt} receiptError={receiptError} saving={saving} onReceipt={selectReceipt} onCancel={onClose} onSubmit={(values) => submit({ ...values, receipt })} />}
        {kind === 'transfer' && <TransferForm accounts={accounts} saving={saving} onCancel={onClose} onSubmit={(values) => submit(values)} />}
        {kind === 'account' && <AccountForm banks={banks} currencies={currencies} saving={saving} onCancel={onClose} onSubmit={(values) => submit(values)} />}
        {['bank', 'category', 'payment', 'currency'].includes(kind) && <CatalogForm kind={kind} baseCurrencyCode={baseCurrencyCode} saving={saving} onCancel={onClose} onSubmit={(values) => submit(values)} />}
        {saveError && <p className="form-submit-error" role="alert">{saveError}</p>}
      </section>
    </div>
  )
}

function MovementForm({ movement, accounts, categories, currencies, paymentTypes, receipt, receiptError, saving, onReceipt, onSubmit, onCancel }: {
  movement?: Movement
  accounts: Account[]
  categories: Category[]
  currencies: Currency[]
  paymentTypes: PaymentType[]
  receipt?: File
  receiptError: string
  saving: boolean
  onReceipt: (file?: File) => void
  onSubmit: (values: MovementValues) => void
  onCancel: () => void
}) {
  const exchangeRateRequest = useRef(0)
  const exchangeRateEdited = useRef(false)
  const [exchangeRateStatus, setExchangeRateStatus] = useState('')
  const [exchangeRateStatusType, setExchangeRateStatusType] = useState<'loading' | 'success' | 'warning' | ''>('')
  const form = useForm<MovementValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: movement
      ? {
          type: movement.type,
          description: movement.description,
          amount: movement.amount,
          date: movement.date,
          account: movement.accountId,
          category: movement.categoryId,
          payment: movement.paymentId,
          exchangeRate: movement.exchangeRate ?? (currencies.find((currency) => currency.id === movement.currencyId)?.isBase ? 1 : currencies.find((currency) => currency.id === movement.currencyId)?.rateToBase) ?? undefined,
        }
      : { type: 'Gasto', date: today },
  })
  const type = form.watch('type')
  const selectedAccountId = form.watch('account')
  const amount = form.watch('amount')
  const exchangeRate = form.watch('exchangeRate')
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId)
  const selectedCurrency = currencies.find((currency) => currency.id === selectedAccount?.currencyId)
  const baseCurrency = currencies.find((currency) => currency.isBase)
  const baseCurrencyCode = baseCurrency?.code ?? 'BOB'
  const baseAmount = Number.isFinite(amount) && Number.isFinite(exchangeRate) && amount > 0 && exchangeRate! > 0
    ? new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount * exchangeRate!)
    : null
  const accountField = form.register('account')
  const exchangeRateField = form.register('exchangeRate', { setValueAs: (value) => value === '' ? undefined : Number(value) })
  const filteredCategories = categories.filter((category) => category.type === type && category.active)
  const selectAccount = async (accountId: string) => {
    const requestId = ++exchangeRateRequest.current
    exchangeRateEdited.current = false
    const account = accounts.find((item) => item.id === accountId)
    const currency = currencies.find((item) => item.id === account?.currencyId)
    const fallbackRate = currency?.isBase ? 1 : currency?.rateToBase ?? undefined
    form.setValue('exchangeRate', fallbackRate, { shouldValidate: true })

    if (!currency || currency.isBase) {
      setExchangeRateStatus(currency ? 'La moneda seleccionada es la moneda base; se aplica una tasa de 1.' : '')
      setExchangeRateStatusType(currency ? 'success' : '')
      return
    }

    setExchangeRateStatus('Consultando la tasa actual…')
    setExchangeRateStatusType('loading')
    try {
      const liveRate = await fetchCurrentExchangeRate(currency.code, baseCurrencyCode)
      if (exchangeRateRequest.current !== requestId || exchangeRateEdited.current) return
      form.setValue('exchangeRate', liveRate, { shouldValidate: true })
      setExchangeRateStatus(`Tasa actual sugerida por la API: 1 ${currency.code} = ${liveRate.toLocaleString('es')} ${baseCurrencyCode}. Puedes modificarla manualmente.`)
      setExchangeRateStatusType('success')
    } catch (error) {
      if (exchangeRateRequest.current !== requestId || exchangeRateEdited.current) return
      const reason = error instanceof Error ? error.message : 'Error desconocido.'
      setExchangeRateStatus(fallbackRate
        ? `No se pudo consultar la API (${reason}). Se conserva la tasa configurada; puedes editarla manualmente.`
        : `No se pudo consultar la API (${reason}). Ingresa manualmente la tasa para continuar.`)
      setExchangeRateStatusType('warning')
    }
  }
  const submitMovement = form.handleSubmit((values) => {
    if (values.exchangeRate === undefined || !Number.isFinite(values.exchangeRate) || values.exchangeRate <= 0) {
      form.setError('exchangeRate', { message: 'Configura una tasa válida para esta moneda.' })
      return
    }
    onSubmit(values)
  })
  return (
    <form onSubmit={submitMovement}>
      <div className="form-content">
        <div className="type-toggle">
          <button type="button" className={type === 'Gasto' ? 'selected expense' : ''} onClick={() => { form.setValue('type', 'Gasto'); form.setValue('category', '') }}>− Registrar gasto</button>
          <button type="button" className={type === 'Ingreso' ? 'selected income' : ''} onClick={() => { form.setValue('type', 'Ingreso'); form.setValue('category', '') }}>+ Registrar ingreso</button>
        </div>
        <div className="form-grid">
          <Field label="Descripción" error={form.formState.errors.description?.message}><input placeholder="Ej. Compra de suministros" {...form.register('description')} /></Field>
          <Field label="Monto (moneda de cuenta)" error={form.formState.errors.amount?.message}><input type="number" step="0.01" min="0.01" placeholder="0.00" {...form.register('amount', { valueAsNumber: true })} /></Field>
          <Field label="Cuenta" error={form.formState.errors.account?.message}><select {...accountField} onChange={(event) => {
            accountField.onChange(event)
            void selectAccount(event.target.value)
          }}><option value="">Selecciona una cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></Field>
          <Field label={`Tipo de cambio (1 ${selectedAccount?.currency ?? 'moneda'} = ? ${baseCurrencyCode})`} error={form.formState.errors.exchangeRate?.message}>
            <input type="number" step="0.000001" min="0.000001" placeholder="Ej. 6.96" readOnly={selectedCurrency?.isBase} {...exchangeRateField} onChange={(event) => {
              exchangeRateEdited.current = true
              exchangeRateField.onChange(event)
              setExchangeRateStatus('Tasa ingresada manualmente.')
              setExchangeRateStatusType('success')
            }} />
            <small className="field-hint">{selectedCurrency?.isBase ? 'La moneda base usa una tasa de 1.' : `Tasa en unidades de ${baseCurrencyCode} por cada unidad de la moneda del movimiento.`}</small>
            {exchangeRateStatus && <small className={`currency-rate-status ${exchangeRateStatusType}`} role="status">{exchangeRateStatus}</small>}
            {baseAmount !== null && <small className="currency-equivalent-preview" aria-live="polite">Equivalente a: {baseCurrency?.symbol || 'BS'} {baseAmount} {baseCurrencyCode}</small>}
          </Field>
          <Field label="Categoría" error={form.formState.errors.category?.message}><select {...form.register('category')}><option value="">Selecciona una categoría</option>{filteredCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
          <Field label="Fecha" error={form.formState.errors.date?.message}><input type="date" {...form.register('date')} /></Field>
          <Field label="Método de pago" error={form.formState.errors.payment?.message}><select {...form.register('payment')}><option value="">Selecciona un método</option>{paymentTypes.map((payment) => <option key={payment.id} value={payment.id}>{payment.name}</option>)}</select></Field>
          <Field label="Descripción adicional"><textarea rows={2} placeholder="Añade un detalle opcional" /></Field>
          <label className="upload-field">
            <span>Comprobante</span>
            <input type="file" accept="image/*,.pdf" onChange={(event) => onReceipt(event.target.files?.[0])} />
            <span className="upload-drop"><FileImage size={20} /><b>{receipt ? receipt.name : 'Adjunta una imagen o PDF'}</b><small>PNG, JPG o PDF · Máx. 10 MB</small></span>
            {receiptError && <small className="field-error">{receiptError}</small>}
          </label>
        </div>
      </div>
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={onCancel} disabled={saving}>Cancelar</button><button className="button-primary" disabled={saving}>{saving ? 'Guardando…' : type === 'Gasto' ? 'Guardar gasto' : 'Guardar ingreso'} <span>→</span></button></div>
    </form>
  )
}

function TransferForm({ accounts, saving, onSubmit, onCancel }: {
  accounts: Account[]
  saving: boolean
  onSubmit: (values: TransferValues) => void
  onCancel: () => void
}) {
  const form = useForm<TransferValues>({ resolver: zodResolver(transferSchema), defaultValues: { date: today } })
  return (
    <form onSubmit={form.handleSubmit((values) => {
      if (values.from === values.to) {
        form.setError('to', { message: 'Elige una cuenta distinta a la de origen' })
        return
      }
      onSubmit(values)
    })}>
      <div className="form-content">
        <div className="transfer-note">Mueve dinero entre tus cuentas sin alterar tu balance total.</div>
        <div className="form-grid">
          <Field label="Cuenta de origen" error={form.formState.errors.from?.message}><select {...form.register('from')}><option value="">Selecciona cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.symbol}{account.balance.toLocaleString()}</option>)}</select></Field>
          <Field label="Cuenta de destino" error={form.formState.errors.to?.message}><select {...form.register('to')}><option value="">Selecciona cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.symbol}{account.balance.toLocaleString()}</option>)}</select></Field>
          <Field label="Monto (moneda de cuenta)" error={form.formState.errors.amount?.message}><input type="number" step="0.01" min="0.01" placeholder="0.00" {...form.register('amount', { valueAsNumber: true })} /></Field>
          <Field label="Fecha" error={form.formState.errors.date?.message}><input type="date" {...form.register('date')} /></Field>
          <Field label="Descripción" error={form.formState.errors.description?.message}><input placeholder="Ej. Ahorro mensual" {...form.register('description')} /></Field>
        </div>
      </div>
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={onCancel} disabled={saving}>Cancelar</button><button className="button-primary" disabled={saving}>{saving ? 'Guardando…' : 'Confirmar transferencia'} <span>→</span></button></div>
    </form>
  )
}

function AccountForm({ banks, currencies, saving, onSubmit, onCancel }: {
  banks: Bank[]
  currencies: Currency[]
  saving: boolean
  onSubmit: (values: AccountValues) => void
  onCancel: () => void
}) {
  const form = useForm<AccountValues>({ resolver: zodResolver(accountSchema), defaultValues: { balance: 0 } })
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div className="form-content"><div className="form-grid">
        <Field label="Nombre de la cuenta" error={form.formState.errors.name?.message}><input placeholder="Ej. Cuenta de ahorros" {...form.register('name')} /></Field>
        <Field label="Banco" error={form.formState.errors.bankId?.message}><select {...form.register('bankId')}><option value="">Selecciona un banco</option>{banks.filter((bank) => bank.active).map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></Field>
        <Field label="Número de cuenta" error={form.formState.errors.number?.message}><input placeholder="Número de cuenta" {...form.register('number')} /></Field>
        <Field label="Saldo inicial" error={form.formState.errors.balance?.message}><input type="number" min="0" step="0.01" {...form.register('balance', { valueAsNumber: true })} /></Field>
        <Field label="Moneda" error={form.formState.errors.currencyId?.message}><select {...form.register('currencyId')}><option value="">Selecciona una moneda</option>{currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.code} · {currency.name}</option>)}</select></Field>
      </div></div>
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={onCancel} disabled={saving}>Cancelar</button><button className="button-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cuenta'} <span>→</span></button></div>
    </form>
  )
}

function CatalogForm({ kind, baseCurrencyCode, saving, onSubmit, onCancel }: {
  kind: ModalKind
  baseCurrencyCode: string
  saving: boolean
  onSubmit: (values: CatalogValues) => void
  onCancel: () => void
}) {
  const form = useForm<CatalogValues>({ resolver: zodResolver(catalogSchema), defaultValues: { type: 'Gasto' } })
  const needsType = kind === 'category'
  const fieldLabel = kind === 'bank' ? 'Nombre del banco' : kind === 'payment' ? 'Tipo de pago' : kind === 'currency' ? 'Nombre de moneda' : 'Nombre de categoría'
  const handleSubmit = form.handleSubmit((values) => {
    if (kind === 'currency' && (!values.code?.trim() || !values.symbol?.trim())) {
      if (!values.code?.trim()) form.setError('code', { message: 'Ingresa la sigla de la moneda' })
      if (!values.symbol?.trim()) form.setError('symbol', { message: 'Ingresa el símbolo de la moneda' })
      return
    }
    if (kind === 'currency' && (!values.rateToBase || !Number.isFinite(values.rateToBase))) {
      form.setError('rateToBase', { message: 'Ingresa una tasa válida respecto a la moneda base' })
      return
    }
    onSubmit(values)
  })
  return (
    <form onSubmit={handleSubmit}>
      <div className="form-content"><div className="form-grid">
        <Field label={fieldLabel} error={form.formState.errors.name?.message}><input placeholder={kind === 'currency' ? 'Ej. Euro' : 'Escribe un nombre'} {...form.register('name')} /></Field>
        {needsType && <Field label="Tipo"><select {...form.register('type')}><option value="Gasto">Gasto</option><option value="Ingreso">Ingreso</option></select></Field>}
        {needsType && <Field label="Descripción"><input placeholder="Breve descripción (opcional)" {...form.register('description')} /></Field>}
        {kind === 'currency' && <Field label="Sigla" error={form.formState.errors.code?.message}><input maxLength={5} placeholder="Ej. EUR" {...form.register('code')} /></Field>}
        {kind === 'currency' && <Field label="Símbolo" error={form.formState.errors.symbol?.message}><input maxLength={5} placeholder="Ej. €" {...form.register('symbol')} /></Field>}
        {kind === 'currency' && <Field label={`Tipo de cambio a ${baseCurrencyCode} (1 unidad de esta moneda)`} error={form.formState.errors.rateToBase?.message}><input type="number" min="0.000001" step="0.000001" placeholder="Ej. 6.96" {...form.register('rateToBase', { valueAsNumber: true })} /></Field>}
      </div></div>
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={onCancel} disabled={saving}>Cancelar</button><button className="button-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'} <span>→</span></button></div>
    </form>
  )
}
