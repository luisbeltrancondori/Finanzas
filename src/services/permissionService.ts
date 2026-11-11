import { requireSupabase } from '../lib/supabase'
import type { DatabaseId } from '../types/finance'

export type Permission = {
  id: DatabaseId
  name: string
  code: string
  description: string
  module: string
}

const client = () => requireSupabase()
const text = (value: unknown) => value == null ? '' : String(value)

const moduleFrom = (name: string, code: string) => {
  const source = code || name
  const prefix = source.match(/^([^.:\s/]+)/)?.[1] ?? 'general'
  return prefix.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export async function getAllPermissions(): Promise<Permission[]> {
  const { data, error } = await client().from('permiso').select('*').order('id')
  if (error) throw new Error(`No se pudieron cargar los permisos: ${error.message}`)
  return (data ?? []).map((row: Record<string, unknown>) => {
    const name = text(row.nombre ?? row.name ?? row.descripcion ?? row.description ?? row.codigo ?? row.code)
    const code = text(row.codigo ?? row.code ?? row.clave ?? row.slug)
    return {
      id: text(row.id),
      name: name || `Permiso ${text(row.id)}`,
      code,
      description: text(row.descripcion ?? row.description),
      module: moduleFrom(name, code),
    }
  })
}

export async function getPermissionsByRole(rolId: DatabaseId): Promise<DatabaseId[]> {
  const { data, error } = await client().from('rol_permiso')
    .select('permiso_id')
    .eq('rol_id', rolId)
  if (error) throw new Error(`No se pudieron cargar los permisos del rol: ${error.message}`)
  return (data ?? []).map((row: Record<string, unknown>) => text(row.permiso_id)).filter(Boolean)
}

export async function updateRolePermissions(rolId: DatabaseId, permisoIds: DatabaseId[]): Promise<void> {
  const currentIds = await getPermissionsByRole(rolId)
  const nextIds = [...new Set(permisoIds)]
  const nextSet = new Set(nextIds)
  const currentSet = new Set(currentIds)
  const toRemove = currentIds.filter((id) => !nextSet.has(id))
  const toAdd = nextIds.filter((id) => !currentSet.has(id))

  if (toAdd.length) {
    const { error } = await client().from('rol_permiso')
      .insert(toAdd.map((permisoId) => ({ rol_id: rolId, permiso_id: permisoId })))
    if (error) throw new Error(`No se pudieron asignar los permisos nuevos: ${error.message}`)
  }
  if (toRemove.length) {
    const { error } = await client().from('rol_permiso')
      .delete()
      .eq('rol_id', rolId)
      .in('permiso_id', toRemove)
    if (error) throw new Error(`No se pudieron quitar los permisos desmarcados: ${error.message}`)
  }
}
