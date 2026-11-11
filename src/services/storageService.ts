import { requireSupabase } from '../lib/supabase'

export async function getStorageFileUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
  if (/^https?:\/\//i.test(path)) return path
  const { data, error } = await requireSupabase().storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) throw new Error(`No se pudo generar el enlace del archivo en Storage: ${error.message}`)
  if (!data.signedUrl) throw new Error('Supabase Storage no devolvió un enlace para el archivo.')
  return data.signedUrl
}
