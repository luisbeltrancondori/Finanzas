import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, BriefcaseBusiness, CarFront, CircleDollarSign, CreditCard, Ellipsis, Eye, FileSpreadsheet, FileText, Landmark, Pencil, Plus, Settings2, ShieldAlert, ShoppingBag, Sparkles, Trash2, Utensils, Wallet, X, Zap } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import FinanceModal from './components/FinanceModal'
import CalendarView from './components/CalendarView'
import Header from './components/Header'
import Login from './components/Login'
import ProfileModal from './components/ProfileModal'
import RolePermissionsView from './components/RolePermissionsView'
import Sidebar from './components/Sidebar'
import SummaryCard from './components/SummaryCard'
import TransactionsTable from './components/TransactionsTable'
import UsersView from './components/UsersView'
import type { Account, Bank, Category, Currency, ModalKind, Movement, Obligation, PageKey, PaymentType, Transfer } from './types/finance'
import type { AuthenticatedUserProfile, MovementReceipt } from './services/financeService'
import { applyCurrencyRates, convertAmount, getCurrencyRateToBase, movementRateToBase, roundExchangeRate } from './services/currencyService'
import { exportMovementsToExcel } from './services/movementExportService'
import { listObligations, updateObligationStatus } from './services/obligationService'
import { supabase } from './lib/supabase'
import { changeOwnPassword, getUserPermissions, updateOwnProfile } from './services/userService'
import './App.css'
import './currency.css'
import './calendar.css'
import './help-center.css'
import './theme.css'

const DashboardAnalytics = lazy(() => import('./components/DashboardAnalytics'))
const pageDetails: Record<PageKey, { title: string; subtitle: string }> = {
  dashboard: { title: 'Resumen financiero', subtitle: 'Aquí tienes una visión clara de tus finanzas.' },
  movements: { title: 'Movimientos', subtitle: 'Administra y revisa todos tus ingresos y gastos.' },
  transfers: { title: 'Transferencias', subtitle: 'Mueve dinero entre tus cuentas de forma sencilla.' },
  accounts: { title: 'Cuentas y bancos', subtitle: 'Todas tus cuentas, organizadas en un solo lugar.' },
  calendar: { title: 'Calendario', subtitle: 'Planifica vencimientos y controla tus obligaciones.' },
  catalogs: { title: 'Configuración', subtitle: 'Personaliza tus categorías, métodos de pago y monedas.' },
  users: { title: 'Usuarios', subtitle: 'Administra los usuarios, roles y accesos de Finora.' },
  permissions: { title: 'Roles y permisos', subtitle: 'Configura los permisos asociados a cada rol.' },
}

const CashflowChart = lazy(() => import('./components/CashflowChart'))
const loadFinanceService = () => import('./services/financeService')
const loadMovementReceipts = (movementId: Movement['id']) => loadFinanceService().then((api) => api.listMovementReceipts(movementId))
const operatingMovementType = (movement: Movement): Movement['type'] | null => {
  const type = String(movement.type).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (type === 'ingreso') return 'Ingreso'
  if (type === 'gasto') return 'Gasto'
  return null
}
const referenceDate = new Date()
const recentMonths = Array.from({ length: 6 }, (_, index) => {
  const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 5 + index, 1)
  return {
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    label: date.toLocaleDateString('es', { month: 'short' }),
  }
})
const money = (amount: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('es-US', { style: 'currency', currency: currency || 'USD' }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('es')}`
  }
}
const activeMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`
const normalizeRole = (role: string) => role.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const normalizePermission = (permission: string) => permission.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[\s_-]+/g, '.')

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const sessionUserId = useRef<string | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [profile, setProfile] = useState<AuthenticatedUserProfile | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [profileLoading, setProfileLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!supabase) return

    let active = true
    let authChangeVersion = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'TOKEN_REFRESHED') return
      authChangeVersion += 1

      const nextUserId = nextSession?.user.id ?? null
      const userChanged = sessionUserId.current !== nextUserId
      sessionUserId.current = nextUserId
      setSession(nextSession)
      if (userChanged) {
        setProfile(null)
        setPermissions([])
        setProfileLoading(Boolean(nextSession?.user.email))
      }
      setAuthError('')
      setAuthReady(true)
    })
    const initialVersion = authChangeVersion
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setAuthError(`No se pudo verificar la sesión: ${error.message}`)
      if (authChangeVersion === initialVersion) {
        sessionUserId.current = data.session?.user.id ?? null
        setSession(data.session)
        setProfile(null)
        setPermissions([])
        setProfileLoading(Boolean(data.session?.user.email))
      }
      setAuthReady(true)
    }).catch((error: unknown) => {
      if (!active) return
      setAuthError(error instanceof Error ? error.message : 'No se pudo verificar la sesión.')
      setProfileLoading(false)
      setAuthReady(true)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user.email) return

    let active = true
    void import('./services/financeService')
      .then(async (financeApi) => {
        const nextProfile = await financeApi.getAuthenticatedUserProfile(session.user.email!)
        if (active) setProfile(nextProfile)
        try {
          const nextPermissions = await getUserPermissions(nextProfile.id)
          if (active) setPermissions(nextPermissions)
        } catch (error) {
          if (active) {
            setPermissions([])
            setAuthError(error instanceof Error ? error.message : 'No se pudieron cargar los permisos del usuario.')
          }
        }
      })
      .catch((error: unknown) => {
        if (active) setAuthError(error instanceof Error ? error.message : 'No se pudo cargar el perfil del usuario.')
      })
      .finally(() => {
        if (active) setProfileLoading(false)
      })

    return () => { active = false }
  }, [session?.user.id, session?.user.email])

  const signOut = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(`No se pudo cerrar la sesión: ${error.message}`)
  }

  if (!authReady) {
    return <div className="connection-state"><span className="loading-spinner" /><strong>Verificando sesión…</strong></div>
  }
  if (!session) return <Login initialError={authError} />
  if (profileLoading) {
    return <div className="connection-state"><span className="loading-spinner" /><strong>Validando tu perfil…</strong><small>Consultando tus datos y rol en Finora.</small></div>
  }
  if (!profile) {
    return (
      <div className="connection-state connection-error">
        <div className="connection-error-icon">!</div>
        <strong>No se pudo cargar tu perfil</strong>
        <small>{authError || 'La sesión está activa, pero no se encontró el perfil correspondiente en usuario.'}</small>
        <button className="button-primary" onClick={() => void signOut()}>Cerrar sesión</button>
      </div>
    )
  }

  return <FinanceDashboard key={profile.id} profile={profile} onProfileUpdated={setProfile} permissions={permissions} onSignOut={() => void signOut()} authError={authError} />
}

function FinanceDashboard({ profile, onProfileUpdated, permissions, onSignOut, authError }: {
  profile: AuthenticatedUserProfile
  onProfileUpdated: (profile: AuthenticatedUserProfile) => void
  permissions: string[]
  onSignOut: () => void
  authError: string
}) {
  const [page, setPage] = useState<PageKey>('dashboard')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('finora-theme') === 'dark' ? 'dark' : 'light')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [obligationError, setObligationError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [modal, setModal] = useState<ModalKind | null>(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null)
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('Todos')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [catalogTab, setCatalogTab] = useState<'Categorías' | 'Tipos de pago' | 'Monedas'>('Categorías')
  const [toast, setToast] = useState('')
  const loadRequest = useRef<Promise<boolean> | null>(null)
  useEffect(() => {
    localStorage.setItem('finora-theme', theme)
  }, [theme])
  const currentRole = normalizeRole(profile.role)
  const isAdministrator = currentRole.includes('admin')
  const hasPermission = (...requested: string[]) => isAdministrator
    || permissions.some((item) => {
      const normalized = normalizePermission(item)
      return requested.some((permission) => {
        const target = normalizePermission(permission)
        return normalized === target || normalized.endsWith(`.${target}`)
      })
    })
  const canManageUsers = !currentRole.includes('operador') && hasPermission('usuario.gestionar')
  const canManageRoles = canManageUsers || hasPermission('rol.gestionar', 'permiso.gestionar', 'rol_permiso.gestionar')
  const canViewMovements = hasPermission('movimiento.ver', 'movimiento.consultar', 'movimiento.leer', 'movimiento.listar')
  const canViewCalendar = hasPermission('obligacion.ver', 'obligacion.gestionar', 'calendario.ver', 'recordatorio.ver')
  const canCreateMovement = hasPermission('movimiento.crear', 'movimiento.registrar', 'movimiento.nuevo')
  const canEditMovement = hasPermission('movimiento.editar', 'movimiento.actualizar')
  const canDeleteMovement = hasPermission('movimiento.eliminar', 'movimiento.borrar')
  const canCreateTransfer = hasPermission('transferencia.crear', 'transferencia.registrar', 'transferencia.nuevo', 'transferencia.gestionar')
  const canEditTransfer = hasPermission('transferencia.editar', 'transferencia.actualizar', 'transferencia.gestionar')
  const canDeleteTransfer = hasPermission('transferencia.eliminar', 'transferencia.borrar', 'transferencia.gestionar')

  const loadData = useCallback((): Promise<boolean> => {
    if (loadRequest.current) return loadRequest.current
    const request = (async () => {
      setLoading(true)
      setLoadError('')
      try {
        const api = await loadFinanceService()
        const [nextAccounts, nextCategories, nextBanks, nextCurrencies, nextPayments, nextMovements, nextTransfers, nextObligations] = await Promise.all([
          api.listAccounts(), api.listCategories(), api.listBanks(), api.listCurrencies(), api.listPaymentTypes(), api.listMovements(), api.listTransfers(),
          listObligations(profile.id).catch((error: unknown) => {
            setObligationError(error instanceof Error ? error.message : 'No se pudieron cargar las obligaciones.')
            return null
          }),
        ])
        const accountNames = new Map(nextAccounts.map((account) => [account.id, account.name]))
        setAccounts(nextAccounts)
        setCategories(nextCategories)
        setBanks(nextBanks)
        setCurrencies(await applyCurrencyRates(nextCurrencies))
        setPaymentTypes(nextPayments)
        setMovements(nextMovements)
        if (nextObligations) {
          setObligations(nextObligations)
          setObligationError('')
        }
        setTransfers(nextTransfers.map((transfer) => ({
          ...transfer,
          from: accountNames.get(transfer.fromId) ?? 'Cuenta de origen',
          to: accountNames.get(transfer.toId) ?? 'Cuenta de destino',
          currency: nextAccounts.find((account) => account.id === transfer.fromId)?.currency ?? '',
        })))
        return true
      } catch (error) {
        const message = error instanceof TypeError || (error instanceof Error && /failed to fetch|networkerror|name_not_resolved/i.test(error.message))
          ? 'No se pudo resolver el servidor de Supabase. Confirma la URL del proyecto en Supabase → Settings → API, verifica la conexión a internet/DNS y reinicia Vite después de cambiar .env.'
          : error instanceof Error ? error.message : 'No se pudieron cargar los datos de Supabase.'
        console.error('Error al consultar datos financieros de Supabase:', error)
        setLoadError(message)
        return false
      } finally {
        setLoading(false)
        loadRequest.current = null
      }
    })()
    loadRequest.current = request
    return request
  }, [profile.id])

  // The initial effect loads the remote database state on app mount.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadData() }, [loadData])

  useEffect(() => {
    const realtimeClient = supabase
    if (!realtimeClient) return
    let refreshTimer: number | undefined
    const refreshFromRealtime = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => { void loadData() }, 250)
    }
    const channel = realtimeClient.channel(`financial-data-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimiento' }, refreshFromRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencia' }, refreshFromRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuenta' }, refreshFromRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moneda' }, refreshFromRealtime)
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('No se pudo mantener la sincronización financiera en tiempo real:', error ?? status)
        }
      })
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      void realtimeClient.removeChannel(channel)
    }
  }, [loadData, profile.id])

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3500)
  }

  const refreshObligations = async () => {
    try {
      const next = await listObligations(profile.id)
      setObligations(next)
      setObligationError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar las obligaciones.'
      setObligationError(message)
      throw error
    }
  }

  const markObligationPaid = async (obligation: Obligation) => {
    try {
      await updateObligationStatus(obligation.id, 'Pagado')
      await refreshObligations()
      notify(`"${obligation.title}" marcada como pagada.`)
    } catch (error) {
      console.error('Error al marcar la obligación como pagada:', error)
      notify(error instanceof Error ? error.message : 'No se pudo actualizar la obligación.')
    }
  }

  const saveProfile = async (values: { name: string; photo?: File; currentPassword?: string; newPassword?: string }) => {
    if (values.currentPassword && values.newPassword) {
      await changeOwnPassword(values.currentPassword, values.newPassword)
    }
    const updated = await updateOwnProfile(profile.id, { name: values.name, photo: values.photo })
    onProfileUpdated({ ...profile, name: updated.name, avatarUrl: updated.avatarUrl })
    setProfileModalOpen(false)
    if (updated.warning) notify(updated.warning)
    else notify(values.newPassword ? 'Perfil y contraseña actualizados.' : 'Perfil actualizado.')
  }

  const filteredMovements = useMemo(() => movements.filter((movement) => {
    const text = `${movement.description} ${movement.category} ${movement.account}`.toLowerCase()
    return (!search || text.includes(search.toLowerCase()))
      && (filterType === 'Todos' || movement.type === filterType)
      && (!filterCategory || movement.categoryId === filterCategory)
      && (!filterAccount || movement.accountId === filterAccount)
      && (!dateFrom || movement.date >= dateFrom)
      && (!dateTo || movement.date <= dateTo)
  }), [movements, search, filterType, filterCategory, filterAccount, dateFrom, dateTo])

  const currentPage = pageDetails[page]
  const pageAction: Record<PageKey, ModalKind | null> = { dashboard: canCreateMovement ? 'movement' : null, movements: canCreateMovement ? 'movement' : null, transfers: canCreateTransfer ? 'transfer' : null, accounts: 'account', calendar: null, catalogs: 'category', users: null, permissions: null }
  const actionLabel: Record<PageKey, string> = { dashboard: 'Nuevo movimiento', movements: 'Nuevo movimiento', transfers: 'Nueva transferencia', accounts: 'Agregar cuenta', calendar: 'Nueva obligación', catalogs: 'Nueva categoría', users: 'Nuevo usuario', permissions: 'Configurar permisos' }

  const handleSave = async (kind: ModalKind, values: Record<string, string | number | File | undefined>) => {
    const api = await loadFinanceService()
    let receiptUploadError = ''
    if (kind === 'movement') {
      if (editingMovement && !canEditMovement) throw new Error('No tienes permiso para editar movimientos.')
      if (!editingMovement && !canCreateMovement) throw new Error('No tienes permiso para crear movimientos.')
      const account = accounts.find((item) => item.id === String(values.account))
      const category = categories.find((item) => item.id === String(values.category))
      if (!account || !category) throw new Error('Selecciona una cuenta y categoría válidas.')
      if (category.type !== values.type) throw new Error('La categoría no coincide con el tipo de movimiento.')
      if (values.type === 'Gasto') {
        const previousContribution = editingMovement?.accountId === account.id
          ? editingMovement.type === 'Ingreso' ? editingMovement.amount : -editingMovement.amount
          : 0
        const availableBeforeUpdate = account.balance - previousContribution
        if (Number(values.amount) > availableBeforeUpdate) throw new Error('El saldo de la cuenta seleccionada es insuficiente.')
      }
      const movementValues = {
        tipo: values.type as Movement['type'],
        fecha: String(values.date),
        monto: Number(values.amount),
        descripcion: String(values.description),
        cuenta_id: account.id,
        moneda_id: account.currencyId,
        categoria_id: category.id,
        tipo_pago_id: String(values.payment),
        tipo_cambio: roundExchangeRate(Number(values.exchangeRate)),
      }
      let movement: { id: string }
      if (editingMovement) {
        await api.updateMovement(editingMovement.id, movementValues)
        movement = { id: editingMovement.id }
      } else {
        const userId = await api.getAuthenticatedUserId()
        movement = await api.createMovement({ ...movementValues, user_id: userId })
      }
      if (values.receipt instanceof File && movement) {
        try {
          await api.uploadMovementReceipt(values.receipt, String(movement.id))
        } catch (error) {
          console.error('El movimiento se guardó, pero el comprobante no pudo subirse:', error)
          receiptUploadError = error instanceof Error ? error.message : 'Error desconocido al subir el comprobante.'
        }
      }
    } else if (kind === 'transfer') {
      if (editingTransfer ? !canEditTransfer : !canCreateTransfer) throw new Error('No tienes permiso para gestionar transferencias.')
      const origin = accounts.find((item) => item.id === String(values.from))
      const destination = accounts.find((item) => item.id === String(values.to))
      const amount = Number(values.amount)
      if (!origin || !destination) throw new Error('Selecciona cuentas válidas.')
      if (origin.id === destination.id) throw new Error('El origen y el destino deben ser cuentas distintas.')
      if (origin.currencyId !== destination.currencyId) throw new Error('Las cuentas deben usar la misma moneda para transferir.')
      const availableBalance = origin.balance
        + (editingTransfer?.fromId === origin.id ? editingTransfer.amount : 0)
        - (editingTransfer?.toId === origin.id ? editingTransfer.amount : 0)
      if (amount > availableBalance) throw new Error('El saldo de la cuenta de origen es insuficiente.')
      const transferValues = {
        cuenta_origen_id: origin.id,
        cuenta_destino_id: destination.id,
        monto: roundExchangeRate(amount),
        fecha: String(values.date),
        descripcion: String(values.description),
      }
      if (editingTransfer) {
        await api.updateTransfer(editingTransfer.id, transferValues)
      } else {
        const userId = await api.getAuthenticatedUserId()
        await api.createTransfer({ ...transferValues, user_id: userId })
      }
    } else if (kind === 'account') {
      await api.createAccount({
        nombre: String(values.name),
        banco_id: String(values.bankId),
        numero_cuenta: String(values.number),
        saldo: Number(values.balance),
        moneda_id: String(values.currencyId),
        estado: true,
      })
    } else if (kind === 'category') {
      await api.createCategory({
        nombre: String(values.name),
        tipo: values.type as Category['type'],
        descripcion: String(values.description ?? ''),
        estado: true,
      })
    } else if (kind === 'bank') {
      await api.createBank(String(values.name))
    } else if (kind === 'payment') {
      await api.createPaymentType(String(values.name))
    } else if (kind === 'currency') {
      await api.createCurrency({
        nombre: String(values.name),
        sigla: String(values.code).trim().toUpperCase(),
        simbolo: String(values.symbol),
        es_base: false,
        tipo_cambio_base: roundExchangeRate(Number(values.rateToBase)),
      })
    }
    const refreshed = await loadData()
    setModal(null)
    setEditingMovement(null)
    setEditingTransfer(null)
    notify(receiptUploadError
      ? `Movimiento guardado, pero no se pudo subir el comprobante: ${receiptUploadError}`
      : refreshed ? 'Cambios guardados correctamente.' : 'Registro guardado, pero la vista no pudo actualizarse. Reintenta la carga.')
  }

  const handleDelete = async (label: string, operation: () => Promise<unknown>) => {
    if (!window.confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return
    try {
      await operation()
      const refreshed = await loadData()
      notify(refreshed ? `${label} eliminado correctamente.` : `${label} eliminado; no se pudo actualizar la vista.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar el registro.'
      console.error(`Error al eliminar ${label}:`, error)
      notify(message)
    }
  }

  const toggleCategory = async (category: Category) => {
    try {
      await (await loadFinanceService()).updateCategory(category.id, { estado: !category.active })
      const refreshed = await loadData()
      notify(refreshed ? category.active ? 'Categoría desactivada.' : 'Categoría activada.' : 'Categoría actualizada; la vista no pudo refrescarse.')
    } catch (error) {
      console.error('Error al actualizar categoría:', error)
      notify(error instanceof Error ? error.message : 'No se pudo actualizar la categoría.')
    }
  }

  const updateCurrencyRate = async (currency: Currency, rateToBase: number) => {
    try {
      await (await loadFinanceService()).updateCurrency(currency.id, {
        tipo_cambio_base: roundExchangeRate(rateToBase),
        tipo_cambio_fuente: 'Manual (administrador)',
        tipo_cambio_actualizado_en: new Date().toISOString(),
      })
      const refreshed = await loadData()
      notify(refreshed ? `Tipo de cambio de ${currency.code} actualizado.` : 'Tasa guardada; no se pudo actualizar la vista.')
    } catch (error) {
      console.error('Error al actualizar el tipo de cambio:', error)
      notify(error instanceof Error ? error.message : 'No se pudo actualizar el tipo de cambio.')
    }
  }

  const toggleAccount = async (account: Account, active: boolean) => {
    try {
      await (await loadFinanceService()).updateAccount(account.id, { estado: active })
      const refreshed = await loadData()
      notify(refreshed ? active ? 'Cuenta activada.' : 'Cuenta desactivada.' : 'Cuenta actualizada; la vista no pudo refrescarse.')
    } catch (error) {
      console.error('Error al actualizar cuenta:', error)
      notify(error instanceof Error ? error.message : 'No se pudo actualizar la cuenta.')
    }
  }

  const handleNew = () => {
    const action = pageAction[page]
    if (action) {
      setEditingMovement(null)
      setEditingTransfer(null)
      setModal(action)
    }
  }
  const handleEditMovement = (movement: Movement) => {
    if (!canEditMovement) return
    setEditingMovement(movement)
    setModal('movement')
  }
  const handleEditTransfer = (transfer: Transfer) => {
    if (!canEditTransfer) return
    setEditingMovement(null)
    setEditingTransfer(transfer)
    setModal('transfer')
  }
  const canAccessPage = (nextPage: PageKey) => {
    if (nextPage === 'dashboard') return true
    if (nextPage === 'movements') return canViewMovements
    if (nextPage === 'transfers') return hasPermission('transferencia.ver', 'transferencia.consultar', 'transferencia.listar')
    if (nextPage === 'accounts') return hasPermission('cuenta.ver', 'cuenta.consultar', 'banco.ver', 'banco.consultar')
    if (nextPage === 'calendar') return canViewCalendar
    if (nextPage === 'catalogs') return hasPermission('categoria.ver', 'tipo_pago.ver', 'moneda.ver', 'catalogo.ver')
    if (nextPage === 'users') return canManageUsers
    return canManageRoles
  }
  const handleNavigate = (nextPage: PageKey) => {
    if (canAccessPage(nextPage)) setPage(nextPage)
  }
  const baseCurrency = currencies.find((currency) => currency.isBase) ?? currencies[0]

  if (loading && accounts.length === 0 && movements.length === 0 && categories.length === 0) {
    return <div className="connection-state"><span className="loading-spinner" /><strong>Conectando con Supabase…</strong><small>Cargando cuentas, movimientos y catálogos.</small></div>
  }
  if (loadError && accounts.length === 0 && movements.length === 0 && categories.length === 0) {
    return <div className="connection-state connection-error"><div className="connection-error-icon">!</div><strong>No se pudieron cargar tus datos</strong><small>{loadError}</small><button className="button-primary" onClick={() => void loadData()}>Reintentar</button></div>
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <Sidebar page={page} profile={profile} canAccessPage={canAccessPage} onOpenProfile={() => setProfileModalOpen(true)} onNavigate={handleNavigate} onSignOut={onSignOut} connectionStatus={loadError ? 'Conexión pendiente' : loading ? 'Sincronizando con Supabase' : 'Conectado a Supabase'} />
      <main className="main-area">
        <Header title={currentPage.title} subtitle={currentPage.subtitle} search={search} profile={profile} obligations={obligations} categories={categories} onMarkObligationPaid={(obligation) => void markObligationPaid(obligation)} onSearch={setSearch} onOpenProfile={() => setProfileModalOpen(true)} theme={theme} onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} currencies={currencies} baseCurrency={baseCurrency} showCurrencyTicker onCurrencyRatesUpdated={setCurrencies} />
        {authError && <div className="data-error-banner" role="alert"><span>{authError}</span></div>}
        {loadError && <div className="data-error-banner" role="alert"><span>{loadError}</span><button onClick={() => void loadData()}>Reintentar</button></div>}
        <div className="content-area">
          {loading && <div className="refresh-indicator"><span className="loading-spinner" /> Actualizando datos…</div>}
          {page === 'dashboard' && <Dashboard accounts={accounts} currencies={currencies} movements={canViewMovements ? movements : []} baseCurrency={baseCurrency} onNavigate={handleNavigate} onNew={handleNew} onLoadReceipts={loadMovementReceipts} canCreateMovement={canCreateMovement} canViewMovements={canViewMovements} onEditMovement={canEditMovement ? handleEditMovement : undefined} onDeleteMovement={canDeleteMovement ? (movement) => void handleDelete('el movimiento', async () => (await loadFinanceService()).deleteMovement(movement.id)) : undefined} />}
          {page === 'movements' && <MovementsPage movements={filteredMovements} onExport={() => {
            void exportMovementsToExcel(filteredMovements, currencies, accounts)
              .then(() => notify('Reporte de movimientos exportado.'))
              .catch((error: unknown) => {
              console.error('Error al exportar movimientos a Excel:', error)
              notify(error instanceof Error ? `No se pudo exportar el reporte: ${error.message}` : 'No se pudo exportar el reporte.')
              })
          }} categories={categories} accounts={accounts} filterType={filterType} setFilterType={setFilterType} filterCategory={filterCategory} setFilterCategory={setFilterCategory} filterAccount={filterAccount} setFilterAccount={setFilterAccount} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} onNew={handleNew} onLoadReceipts={loadMovementReceipts} canCreateMovement={canCreateMovement} canViewMovements={canViewMovements} onEdit={canEditMovement ? handleEditMovement : undefined} onDelete={canDeleteMovement ? (movement) => void handleDelete('el movimiento', async () => (await loadFinanceService()).deleteMovement(movement.id)) : undefined} />}
          {page === 'transfers' && <TransfersPage transfers={transfers} accounts={accounts} onNew={canCreateTransfer ? handleNew : undefined} onEdit={canEditTransfer ? handleEditTransfer : undefined} onDelete={canDeleteTransfer ? (transfer) => void handleDelete('la transferencia', async () => (await loadFinanceService()).deleteTransfer(transfer.id)) : undefined} />}
          {page === 'accounts' && <AccountsPage accounts={accounts} baseCurrency={baseCurrency} onNew={handleNew} onBank={() => setModal('bank')} onDelete={(account) => void handleDelete('la cuenta', async () => (await loadFinanceService()).deleteAccount(account.id))} onToggle={toggleAccount} />}
          {page === 'calendar' && canViewCalendar && <CalendarView userId={profile.id} obligations={obligations} categories={categories} onRefresh={refreshObligations} loadError={obligationError} />}
          {page === 'calendar' && !canViewCalendar && <section className="panel access-denied"><ShieldAlert size={27} /><h2>Acceso restringido</h2><p>No tienes permiso para gestionar obligaciones.</p><button className="button-secondary" onClick={() => setPage('dashboard')}>Volver al resumen</button></section>}
          {page === 'catalogs' && <CatalogsPage categories={categories} paymentTypes={paymentTypes} currencies={currencies} baseCurrency={baseCurrency} tab={catalogTab} setTab={setCatalogTab} onNew={() => setModal(catalogTab === 'Categorías' ? 'category' : catalogTab === 'Tipos de pago' ? 'payment' : 'currency')} onDeleteCategory={(category) => void handleDelete('la categoría', async () => (await loadFinanceService()).deleteCategory(category.id))} onDeletePayment={(payment) => void handleDelete('el tipo de pago', async () => (await loadFinanceService()).deletePaymentType(payment.id))} onDeleteCurrency={(currency) => void handleDelete('la moneda', async () => (await loadFinanceService()).deleteCurrency(currency.id))} onUpdateCurrencyRate={updateCurrencyRate} onToggleCategory={toggleCategory} />}
          {page === 'users' && canManageUsers && <UsersView currentUserId={profile.id} />}
          {page === 'users' && !canManageUsers && <section className="panel access-denied"><ShieldAlert size={27} /><h2>Acceso restringido</h2><p>No tienes permiso para gestionar usuarios.</p><button className="button-secondary" onClick={() => setPage('dashboard')}>Volver al resumen</button></section>}
          {page === 'permissions' && canManageUsers && <RolePermissionsView />}
          {page === 'permissions' && !canManageUsers && <section className="panel access-denied"><ShieldAlert size={27} /><h2>Acceso restringido</h2><p>No tienes permiso para gestionar los permisos de los roles.</p><button className="button-secondary" onClick={() => setPage('dashboard')}>Volver al resumen</button></section>}
        </div>
        <footer className="app-footer"><span>© 2026 Finora · Tus finanzas, más claras.</span><span><a href="#privacy">Privacidad</a><a href="#help">Ayuda</a><span className="system-status"><i />{loadError ? 'Conexión pendiente' : 'Sincronizado con Supabase'}</span></span></footer>
      </main>
      {modal && <FinanceModal key={`${modal}-${editingMovement?.id ?? editingTransfer?.id ?? 'new'}`} kind={modal} movementToEdit={editingMovement ?? undefined} transferToEdit={editingTransfer ?? undefined} accounts={accounts} categories={categories} banks={banks} currencies={currencies} baseCurrencyCode={baseCurrency?.code ?? 'BOB'} paymentTypes={paymentTypes} onClose={() => { setModal(null); setEditingMovement(null); setEditingTransfer(null) }} onSave={handleSave} />}
      {profileModalOpen && <ProfileModal profile={profile} onClose={() => setProfileModalOpen(false)} onSave={saveProfile} />}
      {toast && <div className="toast-message"><span>✓</span>{toast}</div>}
      {!['users', 'permissions'].includes(page) && pageAction[page] && <button className="global-add" onClick={handleNew} aria-label={actionLabel[page]}><Plus size={21} /></button>}
      <div className="visually-hidden" aria-live="polite">{toast}</div>
    </div>
  )
}

function Dashboard({ accounts, currencies, movements, baseCurrency, onNavigate, onNew, onLoadReceipts, canCreateMovement, canViewMovements, onEditMovement, onDeleteMovement }: {
  accounts: Account[]
  currencies: Currency[]
  movements: Movement[]
  baseCurrency?: Currency
  onNavigate: (page: PageKey) => void
  onNew: () => void
  onLoadReceipts: (movementId: Movement['id']) => Promise<MovementReceipt[]>
  canCreateMovement: boolean
  canViewMovements: boolean
  onEditMovement?: (movement: Movement) => void
  onDeleteMovement?: (movement: Movement) => void
}) {
  const [bankFilter, setBankFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [currencyFilter, setCurrencyFilter] = useState('all')
  const reportCurrency = currencies.find((currency) => currency.code.toUpperCase() === 'BOB') ?? baseCurrency
  const currencyCode = reportCurrency?.code ?? 'BOB'
  const targetRate = reportCurrency ? getCurrencyRateToBase(reportCurrency.id, currencies) : 1
  const activeAccounts = accounts.filter((account) => account.active)
  const filteredAccounts = activeAccounts.filter((account) =>
    (bankFilter === 'all' || account.bankId === bankFilter)
    && (accountFilter === 'all' || account.id === accountFilter)
    && (currencyFilter === 'all' || account.currencyId === currencyFilter))
  const filteredAccountIds = new Set(filteredAccounts.map((account) => account.id))
  const chartStartDate = `${recentMonths[0].key}-01`
  const reportMovements = movements.filter((movement) => operatingMovementType(movement) !== null
    && filteredAccountIds.has(movement.accountId)
    && (currencyFilter === 'all' || movement.currencyId === currencyFilter)
    && movement.date >= chartStartDate
    && movement.date.slice(0, 7) <= activeMonth)
  const legacyRateCount = reportMovements.filter((movement) => movement.exchangeRate === null
    && currencies.find((currency) => currency.id === movement.currencyId)?.isBase !== true).length
  const missingReportRates = new Set<string>()
  if (!targetRate) missingReportRates.add(currencyCode)
  filteredAccounts.forEach((account) => {
    if (!getCurrencyRateToBase(account.currencyId, currencies)) missingReportRates.add(account.currency)
  })
  reportMovements.forEach((movement) => {
    if (!movementRateToBase(movement, currencies)) missingReportRates.add(movement.currency)
  })
  const missingConsolidatedRates = new Set<string>()
  if (!targetRate) missingConsolidatedRates.add(currencyCode)
  activeAccounts.forEach((account) => {
    if (!getCurrencyRateToBase(account.currencyId, currencies)) missingConsolidatedRates.add(account.currency)
  })
  const conversionReady = missingReportRates.size === 0 && targetRate !== null
  const consolidatedReady = missingConsolidatedRates.size === 0 && targetRate !== null
  const filteredAccountsReady = targetRate !== null
    && filteredAccounts.every((account) => getCurrencyRateToBase(account.currencyId, currencies) !== null)
  const convertedSum = (items: Movement[], type: Movement['type']) => items
    .filter((movement) => operatingMovementType(movement) === type)
    .reduce((sum, movement) => sum + convertAmount(movement.amount, movementRateToBase(movement, currencies)!, targetRate!), 0)
  const thisMonth = reportMovements.filter((movement) => movement.date.slice(0, 7) === activeMonth)
  const income = conversionReady ? convertedSum(thisMonth, 'Ingreso') : 0
  const expenses = conversionReady ? convertedSum(thisMonth, 'Gasto') : 0
  const balanceInBase = (account: Account) => convertAmount(account.balance, getCurrencyRateToBase(account.currencyId, currencies)!, targetRate!)
  const totalBalance = consolidatedReady ? activeAccounts.reduce((sum, account) => sum + balanceInBase(account), 0) : 0
  const filteredTotalBalance = conversionReady ? filteredAccounts.reduce((sum, account) => sum + balanceInBase(account), 0) : 0
  const chartData = conversionReady ? recentMonths.map(({ key, label }) => {
    const monthMovements = reportMovements.filter((movement) => movement.date.slice(0, 7) === key)
    return {
      month: label,
      income: convertedSum(monthMovements, 'Ingreso'),
      expenses: convertedSum(monthMovements, 'Gasto'),
    }
  }) : []
  const chartIncome = chartData.reduce((sum, item) => sum + item.income, 0)
  const chartExpenses = chartData.reduce((sum, item) => sum + item.expenses, 0)
  const expenseCategories = conversionReady
    ? Array.from(reportMovements.filter((movement) => operatingMovementType(movement) === 'Gasto').reduce((totals, movement) => {
      const current = totals.get(movement.category) ?? 0
      totals.set(movement.category, current + convertAmount(movement.amount, movementRateToBase(movement, currencies)!, targetRate!))
      return totals
    }, new Map<string, number>()), ([name, value]) => ({
      name,
      value,
    })).sort((a, b) => b.value - a.value)
    : []
  const currencyColors = ['#256c4c', '#a99ee9', '#e2a56d', '#5e9ad6', '#d97575', '#83c9a4']
  const currencyBalances = conversionReady
    ? Array.from(filteredAccounts.reduce((balances, account) => {
      balances.set(account.currency, (balances.get(account.currency) ?? 0) + balanceInBase(account))
      return balances
    }, new Map<string, number>()), ([name, value], index) => ({
      name,
      value,
      color: currencyColors[index % currencyColors.length],
    }))
    : []
  const paymentMethods = reportMovements.reduce((methods, movement) => {
    const name = movement.payment.trim() || 'Sin método'
    methods.set(name, (methods.get(name) ?? 0) + 1)
    return methods
  }, new Map<string, number>())
  const paymentMethodData = Array.from(paymentMethods, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const userSummaryMap = new Map<string, { id: string; name: string; email: string; income: number; expenses: number }>()
  if (conversionReady) {
    reportMovements.forEach((movement) => {
      const id = movement.userId || 'unassigned'
      const user = userSummaryMap.get(id) ?? {
        id,
        name: movement.userName || 'Sin usuario asignado',
        email: movement.userEmail || '',
        income: 0,
        expenses: 0,
      }
      const convertedAmount = convertAmount(movement.amount, movementRateToBase(movement, currencies)!, targetRate!)
      if (operatingMovementType(movement) === 'Ingreso') user.income += convertedAmount
      else if (operatingMovementType(movement) === 'Gasto') user.expenses += convertedAmount
      userSummaryMap.set(id, user)
    })
  }
  const userSummaries = Array.from(userSummaryMap.values(), (user) => ({ ...user, net: user.income - user.expenses }))
    .sort((left, right) => (right.income + right.expenses) - (left.income + left.expenses))
  const quickMovements = movements.filter((movement) => operatingMovementType(movement) !== null
    && filteredAccountIds.has(movement.accountId)
    && (currencyFilter === 'all' || movement.currencyId === currencyFilter)).slice(0, 5)
  const accountTotal = filteredAccounts.reduce((sum, account) => sum + Math.max(account.balance, 0), 0)

  return <div className="dashboard-page">
    <div className="dashboard-toolbar dashboard-filters">
      <label className="dashboard-filter"><span>Banco</span><select value={bankFilter} onChange={(event) => { setBankFilter(event.target.value); setAccountFilter('all') }}><option value="all">Todos</option>{Array.from(new Map(activeAccounts.map((account) => [account.bankId, account.bank])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="dashboard-filter"><span>Cuenta</span><select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">Todas</option>{activeAccounts.filter((account) => (bankFilter === 'all' || account.bankId === bankFilter) && (currencyFilter === 'all' || account.currencyId === currencyFilter)).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label className="dashboard-filter"><span>Moneda</span><select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}><option value="all">Todas</option>{currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.code}</option>)}</select></label>
      {canCreateMovement && <button className="button-primary dashboard-new-button" onClick={onNew}><Plus size={17} /> Nuevo movimiento</button>}
    </div>
    {!conversionReady && <p className="currency-warning" role="status">Configura tipos de cambio válidos para convertir el filtro actual a {currencyCode}: {Array.from(missingReportRates).join(', ') || currencyCode}.</p>}
    {!consolidatedReady && <p className="currency-warning" role="status">Falta configurar la tasa de {Array.from(missingConsolidatedRates).join(', ')} para calcular el total consolidado general.</p>}
    {conversionReady && legacyRateCount > 0 && <p className="currency-warning" role="status">{legacyRateCount} movimiento(s) histórico(s) no tienen una tasa registrada; para ellos se usa la tasa actual de Catálogos.</p>}
    <div className="summary-grid">
      <SummaryCard label={`Total consolidado general · ${currencyCode}`} value={consolidatedReady ? money(totalBalance, currencyCode) : 'Configura tasas'} change="" caption={`Todas las cuentas activas, convertidas a ${currencyCode} con tasas actuales de Catálogos`} icon={<Wallet size={19} />} tone="green" />
      <SummaryCard label={`Ingresos del mes · ${currencyCode}`} value={conversionReady ? money(income, currencyCode) : 'Configura tasas'} change="" caption="Según filtros, convertido a la moneda base" icon={<ArrowDownLeft size={20} />} tone="purple" />
      <SummaryCard label={`Gastos del mes · ${currencyCode}`} value={conversionReady ? money(expenses, currencyCode) : 'Configura tasas'} change="" caption="Según filtros, convertido a la moneda base" positive={false} icon={<ArrowUpRight size={20} />} tone="orange" />
      <SummaryCard label={`Balance neto · ${currencyCode}`} value={filteredAccountsReady ? money(filteredTotalBalance, currencyCode) : 'Configura tasas'} change="" caption="Saldo actual de cuentas según filtros; incluye transferencias internas" icon={<CircleDollarSign size={19} />} tone="blue" />
    </div>
    <div className="dashboard-grid">
      <section className="panel chart-panel">
        <div className="panel-heading chart-heading"><div><h2>Flujo de caja</h2><p>Ingresos y gastos operativos de los últimos seis meses ({currencyCode}) · sin transferencias</p></div><span className="filter-button">Últimos 6 meses</span></div>
        <div className="chart-legend"><span><i className="legend-income" /> Ingresos <b>{conversionReady ? money(chartIncome, currencyCode) : '—'}</b></span><span><i className="legend-expense" /> Gastos <b>{conversionReady ? money(chartExpenses, currencyCode) : '—'}</b></span></div>
        <div className="cashflow-chart">{conversionReady ? <Suspense fallback={<div className="chart-placeholder" />}><CashflowChart data={chartData} currency={currencyCode} /></Suspense> : <p className="currency-warning">El gráfico estará disponible cuando configures las tasas necesarias.</p>}</div>
        <div className="chart-footnote"><span><i />Ingresos <i className="lavender-dot" />Gastos</span><button className="text-button" onClick={() => onNavigate('movements')}>Ver reporte detallado <span>→</span></button></div>
      </section>
      <section className="panel account-overview">
        <div className="panel-heading"><div><h2>Mis cuentas</h2><p>Saldos en moneda original · equivalencia BOB al pasar el cursor</p></div><button className="icon-button" onClick={() => onNavigate('accounts')} aria-label="Ver cuentas"><Ellipsis size={20} /></button></div>
        <div className="account-total"><strong>{conversionReady ? money(filteredTotalBalance, currencyCode) : 'Configura tasas'}</strong><span>Saldo de cuentas filtradas convertido a {currencyCode}</span></div>
        <div className="account-bars">{filteredAccounts.slice(0, 4).map((account) => {
          const accountRate = getCurrencyRateToBase(account.currencyId, currencies)
          const conversionRate = accountRate !== null && targetRate !== null ? roundExchangeRate(accountRate / targetRate) : null
          const equivalent = conversionRate !== null ? convertAmount(account.balance, accountRate ?? 1, targetRate ?? 1) : null
          const originalAmount = money(account.balance, account.currency)
          const tooltip = equivalent === null
            ? `Falta configurar la tasa de ${account.currency} o ${currencyCode} en Catálogos.`
            : `${originalAmount} = ${money(equivalent, currencyCode)} ${currencyCode}; tasa actual: 1 ${account.currency} = ${conversionRate} ${currencyCode}.`
          return <div className="account-bar-item" key={account.id}>
            <div className="account-bar-head"><span><i className={`account-color ${account.color}`} />{account.name}</span><b title={tooltip} aria-label={`${account.name}: ${originalAmount}. ${tooltip}`}>{originalAmount}<small className="account-bob-equivalent">{equivalent === null ? `${currencyCode} —` : `≈ ${money(equivalent, currencyCode)} ${currencyCode}`}</small></b></div>
            <div className="bar-track"><i className={account.color} style={{ width: `${accountTotal ? Math.min(100, Math.max(5, account.balance / accountTotal * 100)) : 0}%` }} /></div>
          </div>
        })}</div>
        {filteredAccounts.length === 0 && <p className="empty-table">No hay cuentas que coincidan con los filtros.</p>}
        <small className="account-base-rate-note">Equivalencias calculadas con las tasas actuales de Catálogos.</small>
        <button className="all-accounts-button" onClick={() => onNavigate('accounts')}>Ver todas las cuentas <span>→</span></button>
      </section>
    </div>
    <Suspense fallback={<div className="analytics-grid"><div className="panel analytics-loading" /><div className="panel analytics-loading" /><div className="panel analytics-loading" /><div className="panel analytics-loading" /></div>}>
      <DashboardAnalytics expenseCategories={expenseCategories} cashflow={chartData} currencyBalances={currencyBalances} paymentMethods={paymentMethodData} currencyCode={currencyCode} userSummaries={userSummaries} />
    </Suspense>
    {canViewMovements && <div className="recent-section"><div className="section-title-row"><div><h2>Actividad reciente</h2><p>{quickMovements.length} movimientos según los filtros seleccionados</p></div>{canCreateMovement && <button className="button-secondary" onClick={onNew}><Plus size={16} /> Añadir movimiento</button>}</div><TransactionsTable movements={quickMovements} compact onNew={() => onNavigate('movements')} canView onLoadReceipts={onLoadReceipts} onEdit={onEditMovement} onDelete={onDeleteMovement} /></div>}
  </div>
}

function MovementsPage({ movements, categories, accounts, filterType, setFilterType, filterCategory, setFilterCategory, filterAccount, setFilterAccount, dateFrom, setDateFrom, dateTo, setDateTo, onNew, onExport, onLoadReceipts, canCreateMovement, canViewMovements, onEdit, onDelete }: {
  movements: Movement[]
  categories: Category[]
  accounts: Account[]
  filterType: string
  setFilterType: (value: string) => void
  filterCategory: string
  setFilterCategory: (value: string) => void
  filterAccount: string
  setFilterAccount: (value: string) => void
  dateFrom: string
  setDateFrom: (value: string) => void
  dateTo: string
  setDateTo: (value: string) => void
  onNew: () => void
  onExport: () => void
  onLoadReceipts: (movementId: Movement['id']) => Promise<MovementReceipt[]>
  canCreateMovement: boolean
  canViewMovements: boolean
  onEdit?: (movement: Movement) => void
  onDelete?: (movement: Movement) => void
}) {
  return <div className="inner-page">
    <div className="inner-toolbar"><div><div className="subtle-count"><span className="status-dot" />{movements.length} movimientos encontrados</div></div><div className="movement-toolbar-actions"><button className="button-secondary export-excel-button" onClick={onExport} disabled={movements.length === 0}><FileSpreadsheet size={16} /> Exportar Excel</button>{canCreateMovement && <button className="button-primary" onClick={onNew}><Plus size={17} /> Nuevo movimiento</button>}</div></div>
    <section className="panel filter-panel">
      <div className="filter-title"><Settings2 size={17} /><strong>Filtros</strong><span>Encuentra movimientos específicos</span></div>
      <div className="filter-grid">
        <label><span>Desde</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label><span>Hasta</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label><span>Cuenta</span><select value={filterAccount} onChange={(event) => setFilterAccount(event.target.value)}><option value="">Todas las cuentas</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label><span>Categoría</span><select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      </div>
      <div className="filter-bottom"><div className="segmented-control">{['Todos', 'Ingreso', 'Gasto'].map((type) => <button key={type} className={filterType === type ? 'selected' : ''} onClick={() => setFilterType(type)}>{type === 'Ingreso' ? '+' : type === 'Gasto' ? '−' : ''} {type}</button>)}</div><button className="reset-filters" onClick={() => { setFilterType('Todos'); setFilterCategory(''); setFilterAccount(''); setDateFrom(''); setDateTo('') }}>Limpiar filtros</button></div>
    </section>
    <TransactionsTable movements={movements} canView={canViewMovements} onLoadReceipts={onLoadReceipts} onEdit={onEdit} onDelete={onDelete} />
  </div>
}

function TransfersPage({ transfers, accounts, onNew, onEdit, onDelete }: {
  transfers: Transfer[]
  accounts: Account[]
  onNew?: () => void
  onEdit?: (transfer: Transfer) => void
  onDelete?: (transfer: Transfer) => void
}) {
  const [detail, setDetail] = useState<Transfer | null>(null)
  return <div className="inner-page">
    <div className="transfer-hero panel"><div className="transfer-hero-copy"><div className="summary-icon blue"><ArrowLeftRight size={21} /></div><div><h2>Transfiere entre tus cuentas</h2><p>Registra transferencias entre cuentas existentes.</p></div></div>{onNew && <button className="button-primary" onClick={onNew}><Plus size={17} /> Nueva transferencia</button>}</div>
    <section className="panel transfer-steps"><div className="panel-heading"><div><h2>Cómo funciona</h2><p>Las transferencias se guardan en la tabla de transferencia.</p></div></div><div className="steps-row"><div><span>01</span><b>Elige el origen</b><small>Selecciona desde qué cuenta transferir.</small></div><i>→</i><div><span>02</span><b>Selecciona el destino</b><small>Elige una cuenta en la misma moneda.</small></div><i>→</i><div><span>03</span><b>Confirma el monto</b><small>Revisa los detalles antes de guardar.</small></div></div></section>
    <section className="panel transactions-panel"><div className="panel-heading"><div><h2>Historial de transferencias</h2><p>{transfers.length} transferencias registradas</p></div></div><div className="transfer-list">{transfers.length ? transfers.map((item) => <div className="transfer-item" key={item.id}><span className="transfer-icon"><ArrowLeftRight size={18} /></span><div className="transfer-description"><strong>{item.description}</strong><small>{item.from} <span>→</span> {item.to}</small></div><time>{new Date(`${item.date}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}</time><b>{money(item.amount, item.currency)}</b><span className="completed-pill">Registrada</span><div className="movement-actions"><button className="icon-button" aria-label={`Ver transferencia: ${item.description}`} title="Ver detalle" onClick={() => setDetail(item)}><Eye size={16} /></button>{onEdit && <button className="icon-button" aria-label={`Editar transferencia: ${item.description}`} title="Editar" onClick={() => onEdit(item)}><Pencil size={15} /></button>}{onDelete && <button className="icon-button" aria-label={`Eliminar transferencia: ${item.description}`} title="Eliminar" onClick={() => onDelete(item)}><Trash2 size={16} /></button>}</div></div>) : <div className="empty-state"><div><ArrowLeftRight size={22} /></div><strong>Aún no hay transferencias</strong><span>Los registros de Supabase aparecerán aquí.</span>{onNew && <button className="text-button" onClick={onNew}>Crear primera transferencia →</button>}</div>}</div></section>
    {detail && <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null) }}>
      <section className="modal-card movement-detail-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-detail-title">
        <div className="modal-heading"><div><div className="eyebrow">FINORA · TRANSFERENCIA</div><h2 id="transfer-detail-title">Detalle de la transferencia</h2></div><button className="icon-button" onClick={() => setDetail(null)} aria-label="Cerrar detalle"><X size={20} /></button></div>
        <dl className="movement-detail-list">
          <div><dt>Descripción</dt><dd>{detail.description}</dd></div>
          <div><dt>Importe</dt><dd>{money(detail.amount, detail.currency)}</dd></div>
          <div><dt>Fecha</dt><dd>{new Date(`${detail.date}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })}</dd></div>
          <div><dt>Cuenta de origen</dt><dd>{accounts.find((account) => account.id === detail.fromId)?.name ?? detail.from}</dd></div>
          <div><dt>Cuenta de destino</dt><dd>{accounts.find((account) => account.id === detail.toId)?.name ?? detail.to}</dd></div>
        </dl>
        <div className="modal-actions"><button className="button-secondary" onClick={() => setDetail(null)}>Cerrar</button></div>
      </section>
    </div>}
  </div>
}

function AccountsPage({ accounts, baseCurrency, onNew, onBank, onDelete, onToggle }: {
  accounts: Account[]
  baseCurrency?: Currency
  onNew: () => void
  onBank: () => void
  onDelete: (account: Account) => void
  onToggle: (account: Account, active: boolean) => void
}) {
  const balance = accounts.filter((account) => account.active && account.currencyId === baseCurrency?.id).reduce((sum, account) => sum + account.balance, 0)
  return <div className="inner-page">
    <div className="accounts-summary-strip panel"><div><span>Saldo total · {baseCurrency?.code ?? 'Moneda base'}</span><strong>{money(balance, baseCurrency?.code)}</strong><small>Solo cuentas en moneda base</small></div><div><span>Cuentas</span><strong>{accounts.length.toString().padStart(2, '0')}</strong><small>En {new Set(accounts.map((account) => account.bankId)).size} bancos</small></div><div className="accounts-actions"><button className="button-secondary" onClick={onBank}><Landmark size={16} /> Agregar banco</button><button className="button-primary" onClick={onNew}><Plus size={17} /> Agregar cuenta</button></div></div>
    <div className="section-title-row accounts-title"><div><h2>Tus cuentas</h2><p>Datos leídos de la tabla cuenta.</p></div><span className="filter-button">Todas las cuentas</span></div>
    <div className="accounts-grid">{accounts.map((account) => <article className={`bank-card ${account.color}`} key={account.id}>
      <div className="bank-card-top"><div className="bank-logo"><Landmark size={19} /></div><div><button className="icon-button" aria-label={account.active ? 'Desactivar cuenta' : 'Activar cuenta'} title={account.active ? 'Desactivar cuenta' : 'Activar cuenta'} onClick={() => onToggle(account, !account.active)}>{account.active ? <Ellipsis size={20} /> : <span>○</span>}</button><button className="icon-button" aria-label="Eliminar cuenta" onClick={() => onDelete(account)}><Trash2 size={16} /></button></div></div>
      <div className="bank-name">{account.bank}</div><div className="bank-account-name">{account.name}</div><div className="bank-number">{account.number}</div>
      <div className="bank-card-bottom"><div><span>Saldo disponible</span><strong>{money(account.balance, account.currency)}</strong></div><span className="currency-badge">{account.currency}</span></div>
    </article>)}<button className="add-account-card" onClick={onNew}><span><Plus size={21} /></span><strong>Agregar una cuenta</strong><small>Vincula una nueva cuenta bancaria</small></button></div>
    <div className="accounts-tip"><Sparkles size={17} /><span><b>Monedas:</b> Cada cuenta conserva su saldo original. Los reportes del Dashboard convierten saldos y movimientos con los tipos de cambio configurados.</span><button onClick={onBank}>Agregar banco <span>→</span></button></div>
  </div>
}

function CatalogsPage({ categories, paymentTypes, currencies, baseCurrency, tab, setTab, onNew, onDeleteCategory, onDeletePayment, onDeleteCurrency, onUpdateCurrencyRate, onToggleCategory }: {
  categories: Category[]
  paymentTypes: PaymentType[]
  currencies: Currency[]
  baseCurrency?: Currency
  tab: 'Categorías' | 'Tipos de pago' | 'Monedas'
  setTab: (tab: 'Categorías' | 'Tipos de pago' | 'Monedas') => void
  onNew: () => void
  onDeleteCategory: (category: Category) => void
  onDeletePayment: (payment: PaymentType) => void
  onDeleteCurrency: (currency: Currency) => void
  onUpdateCurrencyRate: (currency: Currency, rateToBase: number) => void
  onToggleCategory: (category: Category) => void
}) {
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({})
  const icon = (name: string) => {
    if (name === 'utensils') return <Utensils size={18} />
    if (name === 'car') return <CarFront size={18} />
    if (name === 'zap') return <Zap size={18} />
    if (name === 'briefcase' || name === 'users') return <BriefcaseBusiness size={18} />
    if (name === 'sparkles') return <Sparkles size={18} />
    if (name === 'credit') return <CreditCard size={18} />
    if (name === 'currency') return <CircleDollarSign size={18} />
    return <Banknote size={18} />
  }
  const addLabel = tab === 'Categorías' ? 'categoría' : tab === 'Monedas' ? 'moneda' : 'tipo'
  return <div className="inner-page">
    <div className="catalog-intro panel"><div className="catalog-intro-icon"><Settings2 size={21} /></div><div><h2>Adapta Finora a tu manera</h2><p>Catálogos cargados directamente desde Supabase.</p></div></div>
    <div className="catalog-layout">
      <nav className="catalog-tabs panel" aria-label="Catálogos">{(['Categorías', 'Tipos de pago', 'Monedas'] as const).map((name) => <button key={name} onClick={() => setTab(name)} className={tab === name ? 'selected' : ''}>{name === 'Categorías' ? <ShoppingBag size={17} /> : name === 'Tipos de pago' ? <CreditCard size={17} /> : <CircleDollarSign size={17} />}{name}<span>→</span></button>)}</nav>
      <section className="panel catalog-content"><div className="panel-heading"><div><h2>{tab}</h2><p>{tab === 'Categorías' ? 'Clasifica tus ingresos y gastos.' : tab === 'Tipos de pago' ? 'Métodos vinculados a los movimientos.' : 'Monedas disponibles para las cuentas.'}</p></div><button className="button-primary" onClick={onNew}><Plus size={16} /> Agregar {addLabel}</button></div>
        <div className="catalog-list">
          {tab === 'Categorías' && categories.map((item) => <div className="catalog-row" key={item.id}><span className={`catalog-row-icon ${item.color}`}>{icon(item.icon)}</span><div className="catalog-name"><strong>{item.name}</strong><small>{item.description || 'Categoría'}</small></div><span className={`type-pill ${item.type === 'Ingreso' ? 'income' : 'expense'}`}>{item.type}</span><button className="icon-button" aria-label={item.active ? 'Desactivar categoría' : 'Activar categoría'} title={item.active ? 'Desactivar categoría' : 'Activar categoría'} onClick={() => onToggleCategory(item)}>{item.active ? <span>●</span> : <span>○</span>}</button><button className="icon-button" aria-label="Eliminar categoría" onClick={() => onDeleteCategory(item)}><Trash2 size={16} /></button></div>)}
          {tab === 'Tipos de pago' && paymentTypes.map((item) => <div className="catalog-row" key={item.id}><span className="catalog-row-icon blue">{icon('credit')}</span><div className="catalog-name"><strong>{item.name}</strong><small>Tipo de pago</small></div><button className="icon-button" aria-label="Eliminar tipo de pago" onClick={() => onDeletePayment(item)}><Trash2 size={16} /></button></div>)}
          {tab === 'Monedas' && currencies.map((item) => {
            const usdBobRate = item.code.toUpperCase() === 'USD' && currencies.some((currency) => currency.code.toUpperCase() === 'BOB') && !item.isBase
            const effectiveRate = getCurrencyRateToBase(item.id, currencies)
            const rateValue = rateDrafts[item.id] ?? (item.isBase ? '1.00' : effectiveRate?.toFixed(2) ?? '')
            const rate = Number(rateValue)
            return <div className="catalog-row currency-catalog-row" key={item.id}>
              <span className="catalog-row-icon mint">{icon('currency')}</span>
              <div className="catalog-name"><strong>{item.code} · {item.name}</strong><small>1 {item.code} = {item.isBase ? '1.00' : effectiveRate?.toFixed(2) ?? '—'} {baseCurrency?.code ?? 'BOB'}</small></div>
              {item.isBase ? <span className="base-pill">Moneda base · 1:1</span> : <>
                <label className="currency-rate-editor"><span>{usdBobRate ? 'USD/BOB · editable' : `Tasa a ${baseCurrency?.code ?? 'BOB'}`}</span><input type="number" min="0.01" step="0.01" value={rateValue} aria-label={`Tipo de cambio de ${item.code} a ${baseCurrency?.code ?? 'BOB'}`} onChange={(event) => setRateDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))} /></label>
                <button className="button-secondary currency-rate-save" disabled={!Number.isFinite(rate) || rate <= 0} onClick={() => onUpdateCurrencyRate(item, rate)}>Guardar tasa</button>
              </>}
              <button className="icon-button" aria-label="Eliminar moneda" onClick={() => onDeleteCurrency(item)}><Trash2 size={16} /></button>
            </div>
          })}
          {((tab === 'Categorías' && categories.length === 0) || (tab === 'Tipos de pago' && paymentTypes.length === 0) || (tab === 'Monedas' && currencies.length === 0)) && <p className="empty-table">No hay registros en este catálogo.</p>}
        </div>
        <div className="catalog-footer"><span>{tab === 'Categorías' ? categories.length : tab === 'Tipos de pago' ? paymentTypes.length : currencies.length} registros</span><button className="text-button" onClick={onNew}>Agregar {addLabel} <span>→</span></button></div>
      </section>
    </div>
    <section className="security-note panel"><div><FileText size={17} /><span>Los cambios se guardan en la base de datos.</span></div><span className="system-status"><i />Sincronizado con Supabase</span></section>
  </div>
}

export default App
