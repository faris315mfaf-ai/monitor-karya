import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { s3Configured, uploadS3Evidence, signedS3EvidenceUrl, removeS3Evidence } from './storage-s3'

/**
 * Evidence file storage, on Supabase Storage by default or optional S3/MinIO.
 *
 * The bucket is private. Nothing is ever served from a permanent public URL —
 * reads go through a short-lived signed URL minted per request, after the API
 * has checked that the caller may see that report. Storage is reached only from
 * the server with private credentials, mirroring how Postgres is reached only
 * through Prisma; no browser ever holds a Storage credential.
 */

export const EVIDENCE_BUCKET = 'evidence'
export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024 // keep in step with the bucket limit
export const SIGNED_URL_TTL_SECONDS = 300 // five minutes is enough to open or download

export const ALLOWED_EVIDENCE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
])

let client: SupabaseClient | null = null

function storageDriver(): 'supabase' | 's3' {
  const driver = process.env.STORAGE_DRIVER ?? 'supabase'
  if (driver !== 'supabase' && driver !== 's3') {
    throw new Error('STORAGE_DRIVER tidak valid. Gunakan supabase atau s3.')
  }
  return driver
}

/** True when the selected driver has a valid server configuration. */
export function storageConfigured(): boolean {
  try {
    if (storageDriver() === 's3') return s3Configured()
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  } catch {
    return false
  }
}

function storageClient(): SupabaseClient {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Penyimpanan berkas belum dikonfigurasi. Isi SUPABASE_SERVICE_ROLE_KEY di .env (Supabase Dashboard → Project Settings → API Keys → service_role).'
    )
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

/** Strips anything that would make a storage key awkward or unsafe. */
function safeName(fileName: string): string {
  const cleaned = fileName
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80)
  return cleaned || 'berkas'
}

export function buildStorageKey(targetType: string, targetId: string, fileName: string): string {
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${targetType}/${targetId}/${stamp}-${rand}-${safeName(fileName)}`
}

export async function uploadEvidence(
  key: string,
  body: ArrayBuffer | Buffer,
  contentType: string
): Promise<void> {
  if (storageDriver() === 's3') return uploadS3Evidence(key, body, contentType)
  const { error } = await storageClient()
    .storage.from(EVIDENCE_BUCKET)
    .upload(key, body, { contentType, upsert: false })

  if (error) throw new Error(`Gagal mengunggah berkas: ${error.message}`)
}

/** A time-limited URL for reading one object. Never store or cache this. */
export async function signedEvidenceUrl(key: string, download?: string): Promise<string> {
  if (storageDriver() === 's3') return signedS3EvidenceUrl(key, SIGNED_URL_TTL_SECONDS, download)
  const { data, error } = await storageClient()
    .storage.from(EVIDENCE_BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL_SECONDS, download ? { download } : undefined)

  if (error || !data) throw new Error(`Gagal membuat tautan berkas: ${error?.message ?? 'tidak diketahui'}`)
  return data.signedUrl
}

export async function removeEvidence(key: string): Promise<void> {
  if (storageDriver() === 's3') return removeS3Evidence(key)
  const { error } = await storageClient().storage.from(EVIDENCE_BUCKET).remove([key])
  // A missing object should not block deleting the database row.
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`Gagal menghapus berkas: ${error.message}`)
  }
}
