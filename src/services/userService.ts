import { createIsolatedAuthClient, requireSupabase } from '../lib/supabase'
import type { DatabaseId } from '../types/finance'
import { getStorageFileUrl } from './storageService'

export type UserRole = { id: DatabaseId; name: string }
export type ManagedUser = {
  id: DatabaseId
  name: string
  email: string
  roleId: DatabaseId
  role: string
  active: boolean
}
export type UserInsert = {
  nombre: string
  correo: string
  password: string
  rol_id: DatabaseId
  estado: boolean
}
export type UserUpdate = Partial<Omit<UserInsert, 'password'>>
export type ProfileUpdate = { name: string; photo?: File }

const client = () => requireSupabase()
const objectValue = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value)) return objectValue(value[0])
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}
const text = (value: unknown) => value == null ? '' : String(value)
const isActive = (value: unknown) => value === true || value === 1 || ['activo', 'active', 'true', '1'].includes(String(value).toLowerCase())

export async function listUsers(): Promise<ManagedUser[]> {
  const { data, error } = await client().from('usuario')
    .select('id,nombre,correo,rol_id,estado,rol(nombre)')
    .order('nombre')
  if (error) throw new Error(`No se pudieron cargar los usuarios: ${error.message}`)
  return (data ?? []).map((row: Record<string, unknown>) => {
    const role = objectValue(row.rol)
    return {
      id: text(row.id),
      name: text(row.nombre),
      email: text(row.correo),
      roleId: text(row.rol_id),
      role: text(role.nombre) || 'Sin rol',
      active: isActive(row.estado),
    }
  })
}

export async function listRoles(): Promise<UserRole[]> {
  const { data, error } = await client().from('rol').select('id,nombre').order('nombre')
  if (error) throw new Error(`No se pudieron cargar los roles: ${error.message}`)
  return (data ?? []).map((row: Record<string, unknown>) => ({ id: text(row.id), name: text(row.nombre) }))
}

export async function createUser(values: UserInsert): Promise<void> {
  const correo = values.correo.trim().toLowerCase()
  const { data: existingUser, error: lookupError } = await client().from('usuario')
    .select('id')
    .eq('correo', correo)
    .maybeSingle()
  if (lookupError) throw new Error(`No se pudo verificar el correo en la tabla usuario: ${lookupError.message}`)
  if (existingUser) throw new Error('Ya existe un perfil con ese correo en Finora.')

  const authClient = createIsolatedAuthClient()
  const { data: authData, error: authError } = await authClient.auth.signUp({
    email: correo,
    password: values.password,
  })
  if (authError) {
    const message = /already registered|already exists|user exists/i.test(authError.message)
      ? 'Ya existe una cuenta de autenticación con ese correo.'
      : authError.message
    throw new Error(`No se pudo crear la cuenta de acceso: ${message}`)
  }
  if (!authData.user) throw new Error('Supabase Auth no devolvió el usuario recién creado.')
  if (authData.user.identities?.length === 0) {
    throw new Error('Ya existe una cuenta de autenticación con ese correo.')
  }

  const { error: profileError } = await client().from('usuario').insert({
    nombre: values.nombre.trim(),
    correo,
    rol_id: values.rol_id,
    estado: values.estado,
  })
  if (profileError) {
    throw new Error(`La cuenta de acceso se creó, pero no se pudo guardar el perfil en usuario: ${profileError.message}. Revisa la tabla y las políticas RLS antes de volver a intentarlo.`)
  }
}

export async function updateUser(id: DatabaseId, values: UserUpdate): Promise<void> {
  const updates = { ...values }
  if (updates.nombre !== undefined) updates.nombre = updates.nombre.trim()
  if (updates.correo !== undefined) updates.correo = updates.correo.trim().toLowerCase()
  const { error } = await client().from('usuario').update(updates).eq('id', id)
  if (error) throw new Error(`No se pudo actualizar el usuario: ${error.message}`)
}

export async function deleteUser(id: DatabaseId): Promise<void> {
  const { error } = await client().from('usuario').update({ estado: false }).eq('id', id)
  if (error) throw new Error(`No se pudo inactivar el usuario: ${error.message}`)
}

export async function updateOwnProfile(userId: DatabaseId, values: ProfileUpdate): Promise<{ name: string; avatarUrl?: string; warning?: string }> {
  const supabase = client()
  const [{ data: { user }, error: readError }, { data: { session }, error: sessionError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ])
  if (readError) throw new Error(`No se pudo leer el perfil de autenticación: ${readError.message}`)
  if (sessionError) throw new Error(`No se pudo validar la sesión para subir la foto: ${sessionError.message}`)
  if (!user?.id || !user.email) throw new Error('No se pudo identificar al usuario de la sesión activa.')
  if (!session?.access_token || session.user.id !== user.id) {
    throw new Error('La sesión autenticada no está disponible para subir la foto. Vuelve a iniciar sesión e inténtalo de nuevo.')
  }

  const { data: profile, error: profileError } = await supabase.from('usuario')
    .select('id')
    .eq('correo', user.email)
    .maybeSingle()
  if (profileError) throw new Error(`No se pudo verificar el perfil asociado al correo autenticado: ${profileError.message}`)
  if (!profile || text(profile.id) !== userId) {
    throw new Error('El perfil seleccionado no corresponde al correo de la sesión autenticada.')
  }

  const metadata = user.user_metadata ?? {}
  const oldPhotoPath = text(metadata.avatar_url)
  let newPhotoPath: string | undefined
  if (values.photo) {
    const extension = values.photo.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'jpg'
    const authUserId = session.user.id
    newPhotoPath = `${authUserId}/avatar-${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('perfiles').upload(newPhotoPath, values.photo, {
      upsert: false,
      contentType: values.photo.type,
    })
    if (uploadError) {
      const policyHint = /row.level security|rls/i.test(uploadError.message)
        ? ' Comprueba que el bucket perfiles tenga una política INSERT que permita al usuario autenticado cargar objetos cuyo primer directorio sea su auth.uid().'
        : ''
      throw new Error(`No se pudo subir la foto de perfil: ${uploadError.message}.${policyHint}`)
    }
  }

  const avatarPath = newPhotoPath ?? oldPhotoPath
  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      ...metadata,
      full_name: values.name.trim(),
      avatar_url: avatarPath || null,
    },
  })
  if (updateError) {
    if (newPhotoPath) {
      const { error: cleanupError } = await supabase.storage.from('perfiles').remove([newPhotoPath])
      if (cleanupError) {
        throw new Error(`No se pudieron actualizar los metadatos de Auth: ${updateError.message}. Tampoco se pudo limpiar la nueva foto: ${cleanupError.message}`)
      }
    }
    throw new Error(`No se pudieron actualizar los metadatos del perfil en Auth: ${updateError.message}`)
  }

  let warning: string | undefined
  if (newPhotoPath && oldPhotoPath && oldPhotoPath !== newPhotoPath && !/^https?:\/\//i.test(oldPhotoPath)) {
    const { error: removeError } = await supabase.storage.from('perfiles').remove([oldPhotoPath])
    if (removeError) warning = `El perfil se actualizó, pero no se pudo retirar la foto anterior: ${removeError.message}`
  }

  return {
    name: values.name.trim(),
    avatarUrl: avatarPath ? await getStorageFileUrl('perfiles', avatarPath) : undefined,
    warning,
  }
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres.')
  const supabase = client()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw new Error(`No se pudo validar la sesión actual: ${userError.message}`)
  if (!user?.email) throw new Error('No se encontró el correo de la sesión para verificar la contraseña actual.')

  const authClient = createIsolatedAuthClient()
  const { error: verifyError } = await authClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (verifyError) throw new Error('La contraseña actual es incorrecta.')

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
  if (updateError) throw new Error(`No se pudo actualizar la contraseña: ${updateError.message}`)
}

export async function getUserPermissions(userId: DatabaseId): Promise<string[]> {
  const { data: user, error: userError } = await client().from('usuario')
    .select('rol_id')
    .eq('id', userId)
    .maybeSingle()
  if (userError) throw new Error(`No se pudo consultar el rol del usuario: ${userError.message}`)
  if (!user?.rol_id) throw new Error('El usuario no tiene un rol asignado.')

  const { data, error } = await client().from('rol_permiso')
    .select('permiso(*)')
    .eq('rol_id', user.rol_id)
  if (error) throw new Error(`No se pudieron cargar los permisos del usuario: ${error.message}`)
  return (data ?? []).flatMap((row: Record<string, unknown>) => {
    const permission = objectValue(row.permiso)
    const values = [permission.nombre, permission.codigo, permission.clave, permission.slug]
    return values.filter((value): value is string => typeof value === 'string' && value.length > 0)
  })
}
