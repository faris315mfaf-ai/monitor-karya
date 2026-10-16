import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Penyimpanan thumbnail bukti (kontrak Fase 1 PWA bagian B):
 * - removeEvidence(key, thumbKey?) menghapus thumbnail juga — kunci diturunkan
 *   dari berkas gambar bila pemanggil lama tidak mengirim thumbKey; gagal hapus
 *   thumbnail tidak menggagalkan hapus berkas asli.
 * - URL bertanda tangan S3 memuat `response-cache-control: private, max-age=300`.
 * Tanpa jaringan: Supabase dan fetch di-mock.
 */

const supabase = vi.hoisted(() => ({ remove: vi.fn(), from: vi.fn(), createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }))

import { SIGNED_URL_CACHE_CONTROL, removeEvidence, signedEvidenceUrl } from '@/lib/storage'
import { signedS3EvidenceUrl } from '@/lib/storage-s3'

function s3Env() {
  vi.stubEnv('STORAGE_DRIVER', 's3')
  vi.stubEnv('S3_ENDPOINT', 'http://127.0.0.1:9000')
  vi.stubEnv('S3_REGION', 'us-east-1')
  vi.stubEnv('S3_BUCKET', 'evidence')
  vi.stubEnv('S3_ACCESS_KEY_ID', 'offline-key')
  vi.stubEnv('S3_SECRET_ACCESS_KEY', 'offline-secret')
  vi.stubEnv('S3_FORCE_PATH_STYLE', 'true')
}
function supabaseEnv() {
  vi.stubEnv('STORAGE_DRIVER', 'supabase')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://offline.invalid')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'offline-supabase-key')
}
const deleted = () => vi.mocked(fetch).mock.calls.map(([u, init]) => [(init as RequestInit).method, new URL(String(u)).pathname])

beforeEach(() => {
  vi.clearAllMocks()
  supabase.from.mockReturnValue(supabase)
  supabase.createClient.mockReturnValue({ storage: { from: supabase.from } })
  supabase.remove.mockResolvedValue({ error: null })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('removeEvidence — Supabase', () => {
  beforeEach(supabaseEnv)

  it('gambar: berkas asli + thumbnail turunan dalam satu permintaan', async () => {
    await removeEvidence('TASK/t/a-foto.jpg')
    expect(supabase.remove).toHaveBeenCalledWith(['TASK/t/a-foto.jpg', 'TASK/t/a-foto.jpg.thumb.webp'])
  })

  it('dokumen atau thumbKey null: hanya berkas asli; thumbKey eksplisit dipakai apa adanya', async () => {
    await removeEvidence('TASK/t/laporan.pdf')
    expect(supabase.remove).toHaveBeenLastCalledWith(['TASK/t/laporan.pdf'])
    await removeEvidence('TASK/t/a.jpg', null)
    expect(supabase.remove).toHaveBeenLastCalledWith(['TASK/t/a.jpg'])
    await removeEvidence('TASK/t/a.jpg', 'TASK/t/a.jpg.thumb.webp')
    expect(supabase.remove).toHaveBeenLastCalledWith(['TASK/t/a.jpg', 'TASK/t/a.jpg.thumb.webp'])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('objek hilang tetap lolos; galat lain dilempar', async () => {
    supabase.remove.mockResolvedValue({ error: { message: 'Object not found' } })
    await expect(removeEvidence('TASK/t/a.jpg')).resolves.toBeUndefined()
    supabase.remove.mockResolvedValue({ error: { message: 'denied' } })
    await expect(removeEvidence('TASK/t/a.jpg')).rejects.toThrow('denied')
  })
})

describe('removeEvidence — S3', () => {
  beforeEach(s3Env)

  it('gambar: DELETE berkas asli lalu thumbnail', async () => {
    await removeEvidence('TASK/t/a-foto.png')
    expect(deleted()).toEqual([
      ['DELETE', '/evidence/TASK/t/a-foto.png'],
      ['DELETE', '/evidence/TASK/t/a-foto.png.thumb.webp'],
    ])
  })

  it('dokumen atau thumbKey null: satu DELETE', async () => {
    await removeEvidence('TASK/t/laporan.pdf')
    await removeEvidence('TASK/t/a.jpg', null)
    expect(deleted()).toEqual([
      ['DELETE', '/evidence/TASK/t/laporan.pdf'],
      ['DELETE', '/evidence/TASK/t/a.jpg'],
    ])
  })

  it('gagal hapus thumbnail hanya dicatat; gagal hapus asli dilempar tanpa menyentuh thumbnail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
    await expect(removeEvidence('TASK/t/a.jpg')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()

    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }))
    await expect(removeEvidence('TASK/t/b.jpg')).rejects.toThrow('HTTP 403')
    expect(fetch).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('URL bertanda tangan — cache privat', () => {
  it('S3 menandatangani response-cache-control sesuai umur URL', async () => {
    s3Env()
    expect(SIGNED_URL_CACHE_CONTROL).toBe('private, max-age=300')
    const url = new URL(await signedEvidenceUrl('TASK/t/a.jpg.thumb.webp'))
    expect(url.searchParams.get('response-cache-control')).toBe('private, max-age=300')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    // Parameter ikut ditandatangani: mengubahnya mengubah tanda tangan.
    const plain = new URL(signedS3EvidenceUrl('TASK/t/a.jpg.thumb.webp', 300))
    expect(plain.searchParams.get('response-cache-control')).toBeNull()
    expect(plain.searchParams.get('X-Amz-Signature')).not.toBe(url.searchParams.get('X-Amz-Signature'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('nilai Cache-Control berkarakter kendali ditolak', () => {
    s3Env()
    expect(() => signedS3EvidenceUrl('k', 300, undefined, 'private\r\nx: y')).toThrow('Cache-Control')
  })
})
