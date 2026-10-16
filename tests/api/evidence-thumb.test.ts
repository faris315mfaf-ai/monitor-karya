import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import sharp from 'sharp'

/**
 * Thumbnail bukti (kontrak Fase 1 PWA bagian B, 16 Okt 2026):
 * - renderThumbnail: WebP sisi terpanjang 320px, orientasi EXIF dibakar,
 *   tidak diperbesar, tanpa metadata, ≤30 KB untuk foto biasa.
 * - POST /api/evidence/upload: gambar → thumbnail tersimpan di
 *   `${storageKey}.thumb.webp` dan `thumbKey` terisi; dokumen tanpa thumbnail;
 *   gagal render/unggah thumbnail TIDAK menggagalkan unggahan; transaksi gagal
 *   membuang berkas asli beserta thumbnail-nya.
 * Penyimpanan di-mock (tanpa jaringan); basis data tiruan tests/api/admin-fake-db.ts.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
const h = vi.hoisted(() => ({
  uploads: [] as Array<{ key: string; contentType: string; body: Buffer }>,
  removed: [] as Array<[string, string | null | undefined]>,
  failUpload: null as null | ((key: string) => boolean),
  syncFails: false,
}))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => ({ id: 'u-pic', name: 'PIC', email: 'pic@contoh.test', role: 'PIC_PROYEK', scopeEntityId: 'pt-a' })),
}))
vi.mock('@/lib/evidence-access', () => ({ canWriteEvidence: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/daily-rollup', () => ({
  syncEvidenceCount: vi.fn(async () => {
    if (h.syncFails) throw new Error('DB putus')
    return 1
  }),
}))
vi.mock('@/lib/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage')>()),
  storageConfigured: () => true,
  uploadEvidence: async (key: string, body: ArrayBuffer | Buffer, contentType: string) => {
    if (h.failUpload?.(key)) throw new Error('storage menolak')
    h.uploads.push({ key, contentType, body: Buffer.from(body instanceof ArrayBuffer ? new Uint8Array(body) : body) })
  },
  removeEvidence: async (key: string, thumbKey?: string | null) => {
    h.removed.push([key, thumbKey])
  },
}))

import { resetDb, rows } from './admin-fake-db'
import {
  THUMB_MAX_SIDE, THUMB_MIME, THUMB_TARGET_BYTES, canThumbnail, evidenceThumbKey, possibleThumbKey, renderThumbnail,
  startThumbnail, storeEvidenceThumb,
} from '@/lib/evidence-thumb'
import { POST as upload } from '@/app/api/evidence/upload/route'

/** Foto contoh: gradien + derau ringan (mirip foto, bukan warna rata) dengan EXIF orientasi opsional. */
async function photo(width: number, height: number, opts: { orientation?: number; format?: 'jpeg' | 'png' | 'gif' } = {}) {
  const channels = 3
  const raw = Buffer.alloc(width * height * channels)
  let seed = 7
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const n = (seed % 24) - 12
      const i = (y * width + x) * channels
      raw[i] = Math.max(0, Math.min(255, Math.round((x / width) * 255) + n))
      raw[i + 1] = Math.max(0, Math.min(255, Math.round((y / height) * 255) + n))
      raw[i + 2] = Math.max(0, Math.min(255, 128 + n))
    }
  }
  let img = sharp(raw, { raw: { width, height, channels } })
  const format = opts.format ?? 'jpeg'
  img = format === 'png' ? img.png() : format === 'gif' ? img.gif() : img.jpeg({ quality: 90 })
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation })
  return img.toBuffer()
}

function form(file: File) {
  const f = new FormData()
  f.set('targetType', 'TASK')
  f.set('targetId', 'task-1')
  f.set('file', file)
  return upload(new NextRequest('http://localhost/api/evidence/upload', { method: 'POST', body: f }))
}
const jpegFile = (bytes: Buffer, name = 'lapangan.jpg') => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' })

beforeEach(() => {
  resetDb()
  h.uploads.length = 0
  h.removed.length = 0
  h.failUpload = null
  h.syncFails = false
})
afterEach(() => {
  vi.restoreAllMocks()
})

// ------------------------------------------------------------------
describe('kunci & jenis thumbnail', () => {
  it('hanya jpeg/png/webp/heic/gif yang dibuatkan thumbnail', () => {
    for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']) expect(canThumbnail(m), m).toBe(true)
    for (const m of ['application/pdf', 'text/plain', 'image/svg+xml', '', null, undefined]) expect(canThumbnail(m), String(m)).toBe(false)
  })

  it('kunci thumbnail = storageKey + .thumb.webp; turunan hanya untuk kunci gambar', () => {
    expect(evidenceThumbKey('TASK/t/abc-foto.jpg')).toBe('TASK/t/abc-foto.jpg.thumb.webp')
    expect(possibleThumbKey('TASK/t/abc-foto.JPG')).toBe('TASK/t/abc-foto.JPG.thumb.webp')
    expect(possibleThumbKey('TASK/t/a.jpeg')).toBe('TASK/t/a.jpeg.thumb.webp')
    for (const ext of ['png', 'webp', 'heic', 'gif']) expect(possibleThumbKey(`k/a.${ext}`)).toBe(`k/a.${ext}.thumb.webp`)
    expect(possibleThumbKey('TASK/t/laporan.pdf')).toBeNull()
    expect(possibleThumbKey('TASK/t/catatan.txt')).toBeNull()
    expect(possibleThumbKey('TASK/t/a.jpg.thumb.webp')).toBeNull()
    expect(possibleThumbKey('')).toBeNull()
  })
})

describe('renderThumbnail', () => {
  it('foto 1200×800 berorientasi EXIF 6 → WebP tegak 213×320, tanpa metadata, ≤30 KB', async () => {
    const out = await renderThumbnail(await photo(1200, 800, { orientation: 6 }))
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.height).toBe(THUMB_MAX_SIDE)
    expect(meta.width).toBe(213)
    expect(meta.orientation).toBeUndefined()
    expect(meta.exif).toBeUndefined()
    expect(out.byteLength).toBeLessThanOrEqual(THUMB_TARGET_BYTES)
  })

  it('menerima ArrayBuffer maupun Uint8Array; tidak memperbesar gambar kecil', async () => {
    const small = await photo(100, 50, { format: 'png' })
    const ab = new Uint8Array(small).buffer
    for (const input of [ab, new Uint8Array(small)]) {
      const meta = await sharp(await renderThumbnail(input)).metadata()
      expect([meta.width, meta.height]).toEqual([100, 50])
    }
  })

  it('GIF → frame pertama sebagai WebP', async () => {
    const meta = await sharp(await renderThumbnail(await photo(640, 480, { format: 'gif' }))).metadata()
    expect(meta.format).toBe('webp')
    expect([meta.width, meta.height]).toEqual([320, 240])
    expect(meta.pages ?? 1).toBe(1)
  })

  it('byte rusak → ditolak (pemanggil yang menangkap)', async () => {
    await expect(renderThumbnail(Buffer.from([0xff, 0xd8, 0xff, 0x00, 1, 2, 3]))).rejects.toThrow()
  })

  it('startThumbnail/storeEvidenceThumb: bukan gambar → null tanpa unggah; gagal → null & dicatat', async () => {
    expect(startThumbnail(Buffer.from('%PDF-1.4'), 'application/pdf')).toBeNull()
    const up = vi.fn(async () => {})
    expect(await storeEvidenceThumb('k/a.pdf', 'application/pdf', up, null)).toBeNull()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad = startThumbnail(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')
    expect(await storeEvidenceThumb('k/a.jpg', 'image/jpeg', up, bad)).toBeNull()
    expect(up).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })
})

// ------------------------------------------------------------------
describe('POST /api/evidence/upload — thumbnail', () => {
  it('foto → berkas asli + thumbnail WebP tersimpan, thumbKey terisi', async () => {
    const res = await form(jpegFile(await photo(1600, 1200)))
    expect(res.status).toBe(200)
    const body = await res.json()
    const [row] = rows('evidence')
    expect(row.storageKey).toBe(body.evidence.storageKey)
    expect(row.thumbKey).toBe(`${row.storageKey}.thumb.webp`)
    expect(h.uploads.map((u) => [u.key, u.contentType])).toEqual([
      [row.storageKey, 'image/jpeg'],
      [row.thumbKey, THUMB_MIME],
    ])
    const thumb = h.uploads[1].body
    expect(thumb.byteLength).toBeLessThanOrEqual(THUMB_TARGET_BYTES)
    const meta = await sharp(thumb).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 320, 240])
    // Kunci penyimpanan tidak bocor lewat kolom baru di balasan.
    expect(body.evidence.thumbKey).toBeUndefined()
  })

  it('dokumen → tanpa thumbnail, satu unggahan, thumbKey null', async () => {
    const res = await form(new File(['%PDF-1.4\n%contoh'], 'laporan.pdf', { type: 'application/pdf' }))
    expect(res.status).toBe(200)
    expect(rows('evidence')[0].thumbKey).toBeNull()
    expect(h.uploads).toHaveLength(1)
  })

  it('gambar tak terbaca (lolos tanda tangan byte) → unggahan tetap 200, thumbKey null, dicatat', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await form(jpegFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6])))
    expect(res.status).toBe(200)
    expect(rows('evidence')).toHaveLength(1)
    expect(rows('evidence')[0].thumbKey).toBeNull()
    expect(h.uploads).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
  })

  it('unggah thumbnail gagal → unggahan tetap 200 dengan thumbKey null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.failUpload = (key) => key.endsWith('.thumb.webp')
    const res = await form(jpegFile(await photo(800, 600)))
    expect(res.status).toBe(200)
    expect(rows('evidence')[0].thumbKey).toBeNull()
    expect(h.uploads.map((u) => u.contentType)).toEqual(['image/jpeg'])
  })

  it('unggah berkas asli gagal → 502, thumbnail tidak diunggah, tanpa baris', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.failUpload = () => true
    const res = await form(jpegFile(await photo(800, 600)))
    expect(res.status).toBe(502)
    // Beri waktu render yang terlanjur dimulai untuk selesai: tetap tidak diunggah.
    await new Promise((r) => setTimeout(r, 50))
    expect(h.uploads).toHaveLength(0)
    expect(rows('evidence')).toHaveLength(0)
  })

  it('transaksi DB gagal → berkas asli dan thumbnail-nya dibuang', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.syncFails = true
    const res = await form(jpegFile(await photo(800, 600)))
    expect(res.status).toBe(500)
    expect(rows('evidence')).toHaveLength(0)
    const [main, thumb] = h.uploads.map((u) => u.key)
    expect(thumb).toBe(`${main}.thumb.webp`)
    expect(h.removed).toEqual([[main, thumb]])
  })

  it('transaksi DB gagal untuk dokumen → removeEvidence(key, null)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.syncFails = true
    const res = await form(new File(['catatan'], 'catatan.txt', { type: 'text/plain' }))
    expect(res.status).toBe(500)
    expect(h.removed).toEqual([[h.uploads[0].key, null]])
  })
})
