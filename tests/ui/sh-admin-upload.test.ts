import { describe, expect, it, vi } from 'vitest'

/**
 * Antrean unggah bukti Admin subholding (Fase 1 PWA, KONTRAK-FASE1-PWA.md bagian A.3):
 *  - runPool generik: urutan mulai, batas konkurensi 2, gagal sebagian tidak menghentikan yang lain;
 *  - uploadAll: status per bukti (menunggu → mengunggah → terkirim/gagal), Idempotency-Key
 *    `up-${key}` tetap sama saat dicoba ulang ke laporan yang sama;
 *  - validasi pilih berkas sebelum kompres.
 */

import {
  MAX_BUKTI_BYTES,
  UPLOAD_CONCURRENCY,
  anyCompressing,
  buktiStatusView,
  fileBukti,
  runPool,
  submitReport,
  uploadAll,
  validatePick,
  type BuktiState,
  type PendingBukti,
  type PoolEvent,
} from '@/components/views/sh-admin/logic'

function deferred<T = void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function fileItem(name: string): PendingBukti {
  const file = new File(['isi'], name, { type: 'image/jpeg' })
  return { key: 'k-' + name.replace(/\W/g, ''), kind: 'file', file, name, size: file.size, isImage: true }
}

describe('runPool', () => {
  it('paling banyak 2 berjalan sekaligus, dimulai sesuai urutan, hasil sesuai urutan masukan', async () => {
    const gates = [0, 1, 2, 3, 4].map(() => deferred())
    let active = 0
    let peak = 0
    const started: number[] = []
    const run = runPool([10, 11, 12, 13, 14], 2, async (v, i) => {
      started.push(i)
      active += 1
      peak = Math.max(peak, active)
      await gates[i].promise
      active -= 1
      return v * 2
    })
    await tick()
    expect(started).toEqual([0, 1])
    gates[1].resolve()
    await tick()
    expect(started).toEqual([0, 1, 2])
    gates[0].resolve()
    await tick()
    expect(started).toEqual([0, 1, 2, 3])
    gates[3].resolve()
    gates[2].resolve()
    await tick()
    gates[4].resolve()
    const res = await run
    expect(peak).toBe(2)
    expect(res).toEqual([20, 22, 24, 26, 28].map((value) => ({ ok: true, value })))
  })

  it('satu gagal (melempar) tidak menghentikan yang lain', async () => {
    const res = await runPool(['a', 'b', 'c'], 2, async (v) => {
      if (v === 'a') throw new Error('putus')
      return v.toUpperCase()
    })
    expect(res[0]).toMatchObject({ ok: false })
    expect((res[0] as { error: Error }).error.message).toBe('putus')
    expect(res.slice(1)).toEqual([
      { ok: true, value: 'B' },
      { ok: true, value: 'C' },
    ])
  })

  it('melapor mulai/selesai/gagal per indeks; galat di onStatus tidak merusak antrean', async () => {
    const events: PoolEvent<number>[] = []
    const res = await runPool(
      [1, 2],
      2,
      (v) => {
        if (v === 2) throw new Error('x')
        return v
      },
      (e) => {
        events.push(e)
        throw new Error('pemantau rusak')
      }
    )
    expect(res[0]).toEqual({ ok: true, value: 1 })
    expect(res[1].ok).toBe(false)
    // Keduanya berjalan bersamaan: urutan antarindeks bebas, tetapi tiap indeks mulai lalu selesai/gagal.
    const seq = (i: number) => events.filter((e) => e.index === i).map((e) => e.phase)
    expect(seq(0)).toEqual(['mulai', 'selesai'])
    expect(seq(1)).toEqual(['mulai', 'gagal'])
    expect(events.slice(0, 2).map((e) => e.phase)).toEqual(['mulai', 'mulai'])
  })

  it('daftar kosong & batas tidak sah', async () => {
    expect(await runPool([], 2, async () => 1)).toEqual([])
    let peak = 0
    let active = 0
    await runPool([1, 2, 3], 0, async () => {
      active += 1
      peak = Math.max(peak, active)
      await tick()
      active -= 1
    })
    expect(peak).toBe(1)
  })
})

describe('uploadAll: konkurensi & status per bukti', () => {
  it('bawaan konkurensi 2; dua permintaan pertama berjalan bersamaan, ketiga menunggu', async () => {
    expect(UPLOAD_CONCURRENCY).toBe(2)
    const gates: ReturnType<typeof deferred<Response>>[] = []
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) => {
      const d = deferred<Response>()
      gates.push(d)
      return d.promise
    })
    const items = [fileItem('a.jpg'), fileItem('b.jpg'), fileItem('c.jpg')]
    const log: string[] = []
    const run = uploadAll(fetchImpl, 'r1', items, { onStatus: (k, s) => log.push(`${k}:${s.status}`) })
    await tick()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(log).toEqual(['k-ajpg:menunggu', 'k-bjpg:menunggu', 'k-cjpg:menunggu', 'k-ajpg:mengunggah', 'k-bjpg:mengunggah'])
    gates[1].resolve(json({ error: 'Penyimpanan penuh' }, 507))
    await tick()
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    gates[0].resolve(json({ evidence: { id: 'e1' } }, 201))
    gates[2].resolve(json({ evidence: { id: 'e3' } }, 201))
    const out = await run
    expect(out.uploaded.map((i) => i.name)).toEqual(['a.jpg', 'c.jpg'])
    expect(out.failed).toEqual([{ item: items[1], error: 'Penyimpanan penuh' }])
    expect(log).toContain('k-bjpg:gagal')
    expect(log.filter((l) => l.endsWith(':terkirim')).sort()).toEqual(['k-ajpg:terkirim', 'k-cjpg:terkirim'])
  })

  it('coba lagi ke laporan yang sama memakai Idempotency-Key yang sama (tanpa bukti ganda)', async () => {
    const keys: string[] = []
    let n = 0
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      n += 1
      keys.push((init?.headers as Record<string, string>)['Idempotency-Key'])
      if (n === 1) throw new TypeError('Failed to fetch')
      return json({ evidence: { id: 'e' } }, 201)
    })
    const item = fileItem('a.jpg')
    const first = await uploadAll(fetchImpl, 'r1', [item])
    expect(first.failed).toHaveLength(1)
    const states: BuktiState[] = []
    const again = await uploadAll(fetchImpl, 'r1', first.failed.map((f) => f.item), { onStatus: (_k, s) => states.push(s) })
    expect(again.uploaded).toHaveLength(1)
    expect(keys).toEqual(['up-k-ajpg', 'up-k-ajpg'])
    expect(states.map((s) => s.status)).toEqual(['menunggu', 'mengunggah', 'terkirim'])
  })

  it('submitReport meneruskan status per bukti setelah laporan tersimpan (sekali POST)', async () => {
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      if (url === '/api/sh/reports') return json({ report: { id: 'r5' } }, 201)
      return json({ evidence: { id: 'e' } }, 201)
    })
    const seen: string[] = []
    const res = await submitReport({
      fetchImpl,
      form: { kegiatan: 'A', deskripsi: 'B', ptId: 'p', reporterName: 'R', titleKind: 'MANAJER', titleField: 'Proyek' },
      bukti: [fileItem('a.jpg'), fileItem('b.jpg'), fileItem('c.jpg')],
      idempotencyKey: 'shr-abcdef123456',
      onStatus: (k, s) => seen.push(`${k}:${s.status}`),
    })
    expect(res.ok).toBe(true)
    expect(urls.filter((u) => u === '/api/sh/reports')).toHaveLength(1)
    expect(seen.filter((s) => s.endsWith(':terkirim'))).toHaveLength(3)
  })
})

describe('pilih berkas & tampilan status', () => {
  it('foto yang akan dikompres boleh > 20 MB (≤ 60 MB); dokumen tidak', () => {
    const big = { name: 'besar.jpg', size: 30 * 1024 * 1024, type: 'image/jpeg' }
    expect(validatePick(big, true)).toBeNull()
    expect(validatePick(big, false)).toMatch(/melebihi 20 MB/)
    expect(validatePick({ ...big, size: 61 * 1024 * 1024 }, true)).toMatch(/melebihi 20 MB/)
    expect(validatePick({ name: 'x.pdf', size: MAX_BUKTI_BYTES + 1, type: 'application/pdf' }, false)).toMatch(/melebihi/)
    expect(validatePick({ name: 'x.exe', size: 30 * 1024 * 1024, type: 'application/x-msdownload' }, true)).toMatch(/tidak didukung/)
    expect(validatePick({ name: 'k.jpg', size: 0, type: 'image/jpeg' }, true)).toMatch(/kosong/)
  })

  it('fileBukti mempertahankan kunci saat berkas diganti hasil kompres', () => {
    const a = fileBukti(new File(['x'], 'IMG.heic', { type: 'image/heic' }))
    const b = fileBukti(new File(['yy'], 'IMG.jpg', { type: 'image/jpeg' }), a.key)
    expect(b.key).toBe(a.key)
    expect(b).toMatchObject({ name: 'IMG.jpg', size: 2, isImage: true })
    expect(b.compressing).toBeUndefined()
  })

  it('anyCompressing', () => {
    const a = fileItem('a.jpg')
    expect(anyCompressing([a, { key: 'l', kind: 'link', name: 'n', url: 'https://a.b' }])).toBe(false)
    expect(anyCompressing([{ ...(a as Extract<PendingBukti, { kind: 'file' }>), compressing: true }])).toBe(true)
  })

  it('teks & nada status', () => {
    expect(buktiStatusView({ status: 'menunggu' })).toEqual({ tone: 'neutral', text: 'Menunggu…' })
    expect(buktiStatusView({ status: 'mengompres' })).toEqual({ tone: 'info', text: 'Mengompres…' })
    expect(buktiStatusView({ status: 'mengunggah' })).toEqual({ tone: 'info', text: 'Mengunggah…' })
    expect(buktiStatusView({ status: 'terkirim' })).toEqual({ tone: 'done', text: 'Terkirim' })
    expect(buktiStatusView({ status: 'gagal', error: 'Koneksi putus' })).toEqual({ tone: 'late', text: 'Gagal: Koneksi putus' })
    expect(buktiStatusView({ status: 'gagal' }).text).toBe('Gagal')
  })
})
