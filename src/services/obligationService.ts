import { requireSupabase } from '../lib/supabase'
import type { DatabaseId, Obligation, ObligationStatus } from '../types/finance'

export type ObligationInput = Pick<Obligation, 'title' | 'dueDate' | 'estimatedAmount' | 'categoryId' | 'status'>

const client = () => requireSupabase()
const text = (value: unknown) => value == null ? '' : String(value)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function nullableDatabaseId(value: DatabaseId | null): string | null {
  const normalized = value?.trim()
  if (!normalized) return null
  if (/^\d+$/.test(normalized) || UUID_PATTERN.test(normalized)) return normalized
  throw new Error('El identificador de la categoría no es un UUID ni un número entero válido.')
}

async function dataOrThrow<T>(request: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('Supabase devolvió una respuesta vacía.')
  return data
}

function mapObligation(row: Record<string, unknown>): Obligation {
  return {
    id: text(row.id),
    userId: text(row.usuario_id),
    title: text(row.titulo),
    dueDate: text(row.fecha_vencimiento).slice(0, 10),
    estimatedAmount: Number(row.monto_estimado ?? 0),
    categoryId: row.categoria_id == null ? null : text(row.categoria_id),
    status: text(row.estado) as ObligationStatus,
  }
}

export async function listObligations(userId: DatabaseId): Promise<Obligation[]> {
  const rows = await dataOrThrow(client().from('obligacion')
    .select('id,usuario_id,titulo,fecha_vencimiento,monto_estimado,categoria_id,estado')
    .eq('usuario_id', userId)
    .order('fecha_vencimiento', { ascending: true }))
  return rows.map((row) => mapObligation(row as Record<string, unknown>))
}

export async function createObligation(userId: DatabaseId, values: ObligationInput): Promise<Obligation> {
  const ownerId = nullableDatabaseId(userId)
  if (!ownerId) throw new Error('No se pudo identificar al usuario que registra la obligación.')
  if (!Number.isFinite(values.estimatedAmount) || values.estimatedAmount < 0) {
    throw new Error('El monto estimado debe ser un número válido igual o mayor que cero.')
  }
  const row = await dataOrThrow<{ id: string | number; usuario_id: string; titulo: string; fecha_vencimiento: string; monto_estimado: number; categoria_id: string | null; estado: string }>(client().from('obligacion').insert({
    usuario_id: ownerId,
    titulo: values.title.trim(),
    fecha_vencimiento: values.dueDate,
    monto_estimado: values.estimatedAmount,
    categoria_id: nullableDatabaseId(values.categoryId),
    estado: values.status,
  }).select('id,usuario_id,titulo,fecha_vencimiento,monto_estimado,categoria_id,estado').single())
  return mapObligation(row as Record<string, unknown>)
}

export async function updateObligationStatus(id: DatabaseId, status: ObligationStatus): Promise<void> {
  await dataOrThrow(client().from('obligacion').update({ estado: status }).eq('id', id).select('id').single())
}

export async function deleteObligation(id: DatabaseId): Promise<void> {
  await dataOrThrow(client().from('obligacion').delete().eq('id', id).select('id').single())
}
