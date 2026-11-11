import { requireSupabase } from '../lib/supabase'
import { getStorageFileUrl } from './storageService'
import type { Account, Bank, Category, Currency, DatabaseId, Movement, MovementType, PaymentType, Transfer } from '../types/finance'

export type MovementInsert = {
  tipo: MovementType
  fecha: string
  monto: number
  descripcion: string
  cuenta_id: DatabaseId
  moneda_id: DatabaseId
  tipo_cambio: number
  categoria_id: DatabaseId
  tipo_pago_id: DatabaseId
  user_id: DatabaseId
}

export type AccountInsert = {
  nombre: string
  banco_id: DatabaseId
  numero_cuenta: string
  saldo: number
  moneda_id: DatabaseId
  estado: boolean
}

export type CategoryInsert = {
  nombre: string
  tipo: MovementType
  descripcion: string
  estado: boolean
}

export type TransferInsert = {
  cuenta_origen_id: DatabaseId
  cuenta_destino_id: DatabaseId
  monto: number
  fecha: string
  descripcion: string
  user_id: DatabaseId
}

export type CurrencyInsert = {
  nombre: string
  sigla: string
  simbolo: string
  es_base: boolean
  tipo_cambio_base: number | null
  tipo_cambio_fuente?: string | null
  tipo_cambio_actualizado_en?: string | null
}

export type AuthenticatedUserProfile = {
  id: DatabaseId
  roleId: DatabaseId
  name: string
  role: string
  email: string
  avatarUrl?: string
}

export type MovementReceipt = {
  id: DatabaseId
  url: string
  isImage: boolean
}

const client = () => requireSupabase()
const idValue = (id: DatabaseId) => id
const asObject = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, unknown>
  return (value ?? {}) as Record<string, unknown>
}
const text = (value: unknown, fallback = '') => value == null ? fallback : String(value)
const number = (value: unknown) => Number(value ?? 0)
const active = (value: unknown) => value === undefined || value === null
  ? true
  : value === true || value === 1 || ['activo', 'active', 'true', '1'].includes(String(value).toLowerCase())
const iconFor = (name: string) => {
  const icons: Record<string, string> = { Alimentación: 'utensils', Transporte: 'car', Servicios: 'zap', Ventas: 'briefcase', Nómina: 'users', Suscripciones: 'sparkles' }
  return icons[name] ?? 'circle'
}

async function dataOrThrow<T>(request: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('Supabase devolvió una respuesta vacía.')
  return data
}

async function getUsuarioByEmail(email: string): Promise<Record<string, unknown>> {
  const { data, error } = await client().from('usuario')
    .select('*')
    .eq('correo', email)
    .maybeSingle()
  if (error) throw new Error(`No se encontró un usuario asociado a esta sesión: ${error.message}`)
  if (!data) throw new Error('No existe un usuario registrado con el correo de esta sesión.')
  const user = asObject(data)
  if (!active(user.estado)) throw new Error('El usuario está desactivado en la base de datos.')
  return user
}

export async function getAuthenticatedUserProfile(email: string): Promise<AuthenticatedUserProfile> {
  const user = await getUsuarioByEmail(email)
  const { data: { user: authUser }, error: authError } = await client().auth.getUser()
  if (authError) throw new Error(`No se pudieron leer los metadatos del perfil: ${authError.message}`)
  const metadata = authUser?.user_metadata ?? {}
  const id = text(user.id)
  if (!id) throw new Error('El usuario asociado a esta sesión no tiene un identificador válido.')

  const firstName = text(user.nombre ?? user.nombres ?? user.name)
  const lastName = text(user.apellido ?? user.apellidos ?? user.last_name)
  const name = text(metadata.full_name ?? metadata.name, text(user.nombre_completo ?? user.name_full, `${firstName} ${lastName}`.trim() || email))
  const roleValue = user.rol && typeof user.rol === 'object' ? asObject(user.rol) : {}
  const roleId = user.rol_id ?? user.id_rol ?? user.role_id ?? user.id_role
  if (roleId == null) throw new Error('El usuario no tiene un rol asignado en la base de datos.')
  let role = text(roleValue.nombre ?? roleValue.name ?? user.rol_nombre ?? user.role_name)

  if (!role && roleId != null) {
    const { data, error } = await client().from('rol').select('*').eq('id', roleId).maybeSingle()
    if (error) throw new Error(`No se pudo consultar el rol del usuario: ${error.message}`)
    if (!data) throw new Error('El rol asignado al usuario no existe en la tabla rol.')
    const roleRow = asObject(data)
    role = text(roleRow.nombre ?? roleRow.name ?? roleRow.descripcion, 'Usuario')
  } else if (!role && typeof user.rol === 'string') {
    role = user.rol
  }

  const photoPath = text(metadata.avatar_url)
  const avatarUrl = photoPath ? await getStorageFileUrl('perfiles', photoPath) : undefined
  return { id, roleId: text(roleId), name, role: role || 'Usuario', email, avatarUrl }
}

export async function getAuthenticatedUserId(): Promise<DatabaseId> {
  const { data, error } = await client().auth.getUser()
  if (error) throw new Error(`No se pudo validar la sesión: ${error.message}`)
  if (!data.user) throw new Error('Inicia sesión con Supabase antes de registrar información.')
  if (!data.user.email) throw new Error('La sesión de Supabase no tiene un correo asociado para buscar el usuario.')
  const user = await getUsuarioByEmail(data.user.email)
  const id = text(user.id)
  if (!id) throw new Error('El usuario asociado a esta sesión no tiene un identificador válido.')
  return id
}

export async function listMovements(): Promise<Movement[]> {
  const rows = await dataOrThrow(client().from('movimiento')
    .select('id,tipo,fecha,monto,descripcion,user_id,cuenta_id,moneda_id,categoria_id,tipo_pago_id,tipo_cambio,cuenta(nombre),categoria(nombre),moneda(sigla,simbolo),tipo_pago(nombre)')
    .order('fecha', { ascending: false }))
  const userIds = [...new Set(rows.map((row) => text(row.user_id)).filter(Boolean))]
  const usersById = new Map<string, { name: string; email: string }>()
  if (userIds.length > 0) {
    const users = await dataOrThrow(client().from('usuario').select('id,nombre,correo').in('id', userIds))
    users.forEach((user) => {
      usersById.set(text(user.id), {
        name: text(user.nombre),
        email: text(user.correo),
      })
    })
  }
  return rows.map((row) => {
    const category = asObject(row.categoria)
    const account = asObject(row.cuenta)
    const currency = asObject(row.moneda)
    const payment = asObject(row.tipo_pago)
    const userId = text(row.user_id)
    const user = usersById.get(userId)
    const categoryName = text(category.nombre, 'Sin categoría')
    return {
      id: text(row.id),
      userId,
      userName: user?.name || 'Usuario no disponible',
      userEmail: user?.email || '',
      description: text(row.descripcion, 'Movimiento'),
      categoryId: text(row.categoria_id),
      category: categoryName,
      categoryIcon: iconFor(categoryName),
      accountId: text(row.cuenta_id),
      account: text(account.nombre, 'Cuenta'),
      currencyId: text(row.moneda_id),
      currency: text(currency.sigla),
      exchangeRate: row.tipo_cambio == null ? null : number(row.tipo_cambio),
      symbol: text(currency.simbolo, `${text(currency.sigla)} `),
      date: text(row.fecha).slice(0, 10),
      amount: number(row.monto),
      type: text(row.tipo) as MovementType,
      payment: text(payment.nombre, 'Sin método de pago'),
      paymentId: text(row.tipo_pago_id),
    }
  })
}

export async function listMovementReceipts(movementId: DatabaseId): Promise<MovementReceipt[]> {
  const rows = await dataOrThrow(client().from('imagen')
    .select('url')
    .eq('movimiento_id', idValue(movementId)))
  return Promise.all(rows.map(async (row) => {
    const path = text(row.url)
    if (!path) throw new Error('Se encontró un comprobante sin ruta de Storage.')
    return {
      id: path,
      url: await getStorageFileUrl('comprobantes', path),
      isImage: /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(path),
    }
  }))
}

export async function createMovement(values: MovementInsert) {
  return dataOrThrow<{ id: DatabaseId }>(client().from('movimiento').insert({
    ...values,
    cuenta_id: idValue(values.cuenta_id),
    moneda_id: idValue(values.moneda_id),
    categoria_id: idValue(values.categoria_id),
    tipo_pago_id: idValue(values.tipo_pago_id),
    user_id: idValue(values.user_id),
  }).select('id').single())
}

export async function updateMovement(id: DatabaseId, values: Partial<MovementInsert>) {
  const updates = { ...values }
  for (const key of ['cuenta_id', 'moneda_id', 'categoria_id', 'tipo_pago_id', 'user_id'] as const) {
    if (updates[key] !== undefined) updates[key] = idValue(updates[key]!)
  }
  return dataOrThrow(client().from('movimiento').update(updates).eq('id', idValue(id)).select('id').single())
}

export async function deleteMovement(id: DatabaseId) {
  return dataOrThrow(client().from('movimiento').delete().eq('id', idValue(id)).select('id'))
}

export async function listAccounts(): Promise<Account[]> {
  const supabase = client()
  const [rows, movementRows, transferRows] = await Promise.all([
    dataOrThrow(supabase.from('cuenta')
    .select('id,nombre,banco_id,numero_cuenta,saldo,moneda_id,estado,banco(nombre),moneda(nombre,sigla,simbolo,es_base,tipo_cambio_base)')
    .order('nombre')),
    dataOrThrow(supabase.from('movimiento').select('cuenta_id,tipo,monto')),
    dataOrThrow(supabase.from('transferencia').select('cuenta_origen_id,cuenta_destino_id,monto')),
  ])
  const movementTotals = new Map<string, number>()
  for (const movement of movementRows) {
    const accountId = text(movement.cuenta_id)
    if (!accountId) throw new Error('Se encontró un movimiento sin cuenta_id y no se pudo calcular el saldo de las cuentas.')
    const amount = number(movement.monto)
    if (!Number.isFinite(amount)) throw new Error(`El movimiento asociado a la cuenta ${accountId} tiene un monto inválido.`)
    const type = text(movement.tipo).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    if (type === 'transfer' || type === 'transferencia') continue
    if (type !== 'ingreso' && type !== 'gasto') {
      throw new Error(`El movimiento asociado a la cuenta ${accountId} tiene un tipo no reconocido: ${text(movement.tipo)}.`)
    }
    const signedAmount = type === 'ingreso' ? amount : -amount
    movementTotals.set(accountId, (movementTotals.get(accountId) ?? 0) + signedAmount)
  }
  const transferTotals = new Map<string, number>()
  for (const transfer of transferRows) {
    const originId = text(transfer.cuenta_origen_id)
    const destinationId = text(transfer.cuenta_destino_id)
    const amount = number(transfer.monto)
    if (!originId || !destinationId) throw new Error('Se encontró una transferencia con una cuenta incompleta; no se pudo calcular el saldo.')
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`La transferencia de la cuenta ${originId} tiene un monto inválido.`)
    transferTotals.set(originId, (transferTotals.get(originId) ?? 0) - amount)
    transferTotals.set(destinationId, (transferTotals.get(destinationId) ?? 0) + amount)
  }

  return rows.map((row, index) => {
    const bank = asObject(row.banco)
    const currency = asObject(row.moneda)
    const code = text(currency.sigla)
    const id = text(row.id)
    return {
      id,
      name: text(row.nombre),
      bankId: text(row.banco_id),
      bank: text(bank.nombre, 'Banco'),
      number: text(row.numero_cuenta),
      balance: number(row.saldo) + (movementTotals.get(id) ?? 0) + (transferTotals.get(id) ?? 0),
      currencyId: text(row.moneda_id),
      currency: code,
      symbol: text(currency.simbolo, `${code} `),
      color: ['mint', 'lavender', 'peach', 'blue'][index % 4],
      icon: 'building',
      active: active(row.estado),
    }
  })
}

export async function createAccount(values: AccountInsert) {
  return dataOrThrow(client().from('cuenta').insert({
    ...values,
    banco_id: idValue(values.banco_id),
    moneda_id: idValue(values.moneda_id),
  }).select('id').single())
}

export async function updateAccount(id: DatabaseId, values: Partial<AccountInsert>) {
  const updates = { ...values }
  if (updates.banco_id !== undefined) updates.banco_id = idValue(updates.banco_id)
  if (updates.moneda_id !== undefined) updates.moneda_id = idValue(updates.moneda_id)
  return dataOrThrow(client().from('cuenta').update(updates).eq('id', idValue(id)).select('id').single())
}

export async function deleteAccount(id: DatabaseId) {
  return dataOrThrow(client().from('cuenta').delete().eq('id', idValue(id)).select('id'))
}

export async function listCategories(): Promise<Category[]> {
  const rows = await dataOrThrow(client().from('categoria').select('*').order('nombre'))
  return rows.map((row, index) => ({
    id: text(row.id),
    name: text(row.nombre),
    type: text(row.tipo) as MovementType,
    description: text(row.descripcion),
    active: active(row.estado),
    color: ['peach', 'blue', 'lavender', 'mint', 'pink'][index % 5],
    icon: iconFor(text(row.nombre)),
  }))
}

export async function createCategory(values: CategoryInsert) {
  return dataOrThrow(client().from('categoria').insert(values).select('id').single())
}

export async function updateCategory(id: DatabaseId, values: Partial<CategoryInsert>) {
  return dataOrThrow(client().from('categoria').update(values).eq('id', idValue(id)).select('id').single())
}

export async function deleteCategory(id: DatabaseId) {
  return dataOrThrow(client().from('categoria').delete().eq('id', idValue(id)).select('id'))
}

export async function listBanks(): Promise<Bank[]> {
  const rows = await dataOrThrow(client().from('banco').select('id,nombre,estado').order('nombre'))
  return rows.map((row) => ({ id: text(row.id), name: text(row.nombre), active: active(row.estado) }))
}

export async function createBank(name: string) {
  return dataOrThrow(client().from('banco').insert({ nombre: name, estado: true }).select('id').single())
}

export async function updateBank(id: DatabaseId, values: { nombre?: string; estado?: boolean }) {
  return dataOrThrow(client().from('banco').update(values).eq('id', idValue(id)).select('id').single())
}

export async function deleteBank(id: DatabaseId) {
  return dataOrThrow(client().from('banco').delete().eq('id', idValue(id)).select('id'))
}

export async function listCurrencies(): Promise<Currency[]> {
  const rows = await dataOrThrow(client().from('moneda').select('id,nombre,sigla,simbolo,es_base,tipo_cambio_base,tipo_cambio_fuente,tipo_cambio_actualizado_en').order('nombre'))
  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.nombre),
    code: text(row.sigla),
    symbol: text(row.simbolo),
    isBase: row.es_base === true,
    rateToBase: row.tipo_cambio_base == null ? null : number(row.tipo_cambio_base),
    rateSource: text(row.tipo_cambio_fuente) || (row.tipo_cambio_base == null ? undefined : 'Catálogo'),
    rateUpdatedAt: row.tipo_cambio_actualizado_en == null ? null : text(row.tipo_cambio_actualizado_en),
  }))
}

export async function createCurrency(values: CurrencyInsert) {
  return dataOrThrow(client().from('moneda').insert(values).select('id').single())
}

export async function updateCurrency(id: DatabaseId, values: Partial<CurrencyInsert>) {
  return dataOrThrow(client().from('moneda').update(values).eq('id', idValue(id)).select('id').single())
}

export async function deleteCurrency(id: DatabaseId) {
  return dataOrThrow(client().from('moneda').delete().eq('id', idValue(id)).select('id'))
}

export async function listPaymentTypes(): Promise<PaymentType[]> {
  const rows = await dataOrThrow(client().from('tipo_pago').select('id,nombre').order('nombre'))
  return rows.map((row) => ({ id: text(row.id), name: text(row.nombre) }))
}

export async function createPaymentType(name: string) {
  return dataOrThrow(client().from('tipo_pago').insert({ nombre: name }).select('id').single())
}

export async function updatePaymentType(id: DatabaseId, name: string) {
  return dataOrThrow(client().from('tipo_pago').update({ nombre: name }).eq('id', idValue(id)).select('id').single())
}

export async function deletePaymentType(id: DatabaseId) {
  return dataOrThrow(client().from('tipo_pago').delete().eq('id', idValue(id)).select('id'))
}

export async function listTransfers(): Promise<Transfer[]> {
  const rows = await dataOrThrow(client().from('transferencia')
    .select('id,cuenta_origen_id,cuenta_destino_id,monto,fecha,descripcion')
    .order('fecha', { ascending: false }))
  return rows.map((row) => ({
    id: text(row.id),
    fromId: text(row.cuenta_origen_id),
    toId: text(row.cuenta_destino_id),
    from: '',
    to: '',
    amount: number(row.monto),
    currency: '',
    date: text(row.fecha).slice(0, 10),
    description: text(row.descripcion, 'Transferencia'),
  }))
}

export async function createTransfer(values: TransferInsert) {
  return dataOrThrow(client().from('transferencia').insert({
    ...values,
    cuenta_origen_id: idValue(values.cuenta_origen_id),
    cuenta_destino_id: idValue(values.cuenta_destino_id),
    user_id: idValue(values.user_id),
  }).select('id').single())
}

export async function updateTransfer(id: DatabaseId, values: Partial<TransferInsert>) {
  const updates = { ...values }
  if (updates.cuenta_origen_id !== undefined) updates.cuenta_origen_id = idValue(updates.cuenta_origen_id)
  if (updates.cuenta_destino_id !== undefined) updates.cuenta_destino_id = idValue(updates.cuenta_destino_id)
  if (updates.user_id !== undefined) updates.user_id = idValue(updates.user_id)
  return dataOrThrow(client().from('transferencia').update(updates).eq('id', idValue(id)).select('id').single())
}

export async function deleteTransfer(id: DatabaseId) {
  return dataOrThrow(client().from('transferencia').delete().eq('id', idValue(id)).select('id'))
}

export async function uploadMovementReceipt(file: File, movementId: DatabaseId) {
  const supabase = client()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error(`No se pudo validar la sesión para subir el comprobante: ${authError.message}`)
  if (!user?.id) throw new Error('Inicia sesión antes de subir un comprobante.')

  const storage = supabase.storage.from('comprobantes')
  const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'file'
  const path = `${user.id}/${movementId}/${crypto.randomUUID()}.${extension}`
  const { data, error } = await storage.upload(path, file, { upsert: false })
  if (error) {
    const policyHint = /row.level security|rls/i.test(error.message)
      ? ' Comprueba que la política INSERT del bucket permita el primer directorio auth.uid() y la ruta de comprobantes.'
      : ''
    throw new Error(`No se pudo subir el comprobante a Storage: ${error.message}.${policyHint}`)
  }
  const { error: insertError } = await supabase.from('imagen')
    .insert({ url: data.path, movimiento_id: idValue(movementId) })
  if (insertError) {
    const { error: cleanupError } = await storage.remove([path])
    if (cleanupError) throw new Error(`${insertError.message}; tampoco se pudo limpiar el archivo subido: ${cleanupError.message}`)
    throw new Error(`El archivo se subió, pero no se pudo guardar su referencia en imagen: ${insertError.message}`)
  }
  return { path: data.path }
}
