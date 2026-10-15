import { describe, expect, it, vi } from 'vitest'

/**
 * Pop-up rincian laporan (kontrak Opsi A, 15 Okt 2026): pemilihan foto,
 * teks alternatif, dan pengambil URL bertanda tangan yang mengelompokkan
 * permintaan satu tick ke POST /api/evidence/signed (≤60 id, cadangan GET).
 */

import {
  SIGNED_BATCH_MAX, SIGNED_TTL_MS, approvedLabel, batchUnsupported, buktiLabel, chunkIds, clampIndex, createSignedFetcher,
  docActionLabel, mergeSigned, photoAlt, signedFromSingle, timeLabel,
} from '@/components/views/sh-overview/detail-logic'

describe('clampIndex', () => {
  it('menjaga indeks di dalam rentang foto', () => {
    expect(clampIndex(0, 3)).toBe(0)
    expect(clampIndex(2, 3)).toBe(2)
    expect(clampIndex(5, 3)).toBe(2)
    expect(clampIndex(-1, 3)).toBe(0)
    expect(clampIndex(1.7, 3)).toBe(1)
    expect(clampIndex(Number.NaN, 3)).toBe(0)
    expect(clampIndex(2, 0)).toBe(0)
  })

})

describe('teks', () => {
  it('alt foto bermakna', () => {
    expect(photoAlt(0, 3, 'Pengecoran lantai 2')).toBe('Foto bukti 1 dari 3: Pengecoran lantai 2')
    expect(photoAlt(7, 3, '  ')).toBe('Foto bukti 3 dari 3')
    expect(photoAlt(0, 0, 'X')).toBe('Foto bukti 1 dari 1: X')
  })

  it('label tombol dokumen', () => {
    expect(docActionLabel('link')).toBe('Buka tautan')
    expect(docActionLabel('file')).toBe('Buka berkas')
    expect(docActionLabel(null)).toBe('Buka berkas')
  })
})

describe('label waktu WIB', () => {
  it('jam WIB dua digit dengan titik', () => {
    expect(timeLabel('2026-10-15T03:24:00.000Z')).toBe('10.24')
    expect(timeLabel('2026-10-15T02:05:00Z')).toBe('09.05')
    expect(timeLabel('2026-10-15T10:24:00+07:00')).toBe('10.24')
  })

  it('waktu persetujuan lengkap dengan hari dan tanggal', () => {
    expect(approvedLabel('2026-10-15T03:24:00.000Z')).toBe('10.24 · Kamis, 15 Okt 2026')
    expect(approvedLabel('2026-08-03T02:05:00Z')).toBe('09.05 · Senin, 3 Agu 2026')
  })

  it('lintas tengah malam UTC/WIB memakai hari WIB', () => {
    // 17.30 UTC tgl 14 = 00.30 WIB tgl 15
    expect(approvedLabel('2026-10-14T17:30:00Z')).toBe('00.30 · Kamis, 15 Okt 2026')
    expect(approvedLabel('2026-10-15T16:59:00Z')).toBe('23.59 · Kamis, 15 Okt 2026')
    expect(approvedLabel('2026-10-15T17:00:00Z')).toBe('00.00 · Jumat, 16 Okt 2026')
    // 00.30 UTC masih hari yang sama di WIB (07.30)
    expect(approvedLabel('2026-10-15T00:30:00Z')).toBe('07.30 · Kamis, 15 Okt 2026')
    // pergantian tahun
    expect(approvedLabel('2025-12-31T17:05:00Z')).toBe('00.05 · Kamis, 1 Jan 2026')
  })

  it('sama di mesin berzona waktu mana pun', () => {
    const prev = process.env.TZ
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
        process.env.TZ = tz
        expect(timeLabel('2026-10-14T17:30:00Z')).toBe('00.30')
        expect(approvedLabel('2026-10-14T17:30:00Z')).toBe('00.30 · Kamis, 15 Okt 2026')
      }
    } finally {
      if (prev === undefined) delete process.env.TZ
      else process.env.TZ = prev
    }
  })

  it('kosong atau tidak sah → teks kosong', () => {
    for (const v of [null, undefined, '', '   ', 'bukan tanggal']) {
      expect(timeLabel(v)).toBe('')
      expect(approvedLabel(v)).toBe('')
    }
  })
})

describe('buktiLabel', () => {
  it('menggabungkan foto dan dokumen, bagian nol dihilangkan', () => {
    expect(buktiLabel(3, 1)).toBe('3 foto · 1 dokumen')
    expect(buktiLabel(2, 0)).toBe('2 foto')
    expect(buktiLabel(0, 4)).toBe('4 dokumen')
    expect(buktiLabel(0, 0)).toBe('')
  })

  it('nilai tidak sah dianggap nol', () => {
    expect(buktiLabel(-1, Number.NaN)).toBe('')
    expect(buktiLabel(2.9, Number.POSITIVE_INFINITY)).toBe('2 foto')
  })
})

describe('chunkIds', () => {
  it('membuang ganda & kosong, urutan pertama dipertahankan', () => {
    expect(chunkIds(['b', 'a', 'b', '', 'c', 'a'])).toEqual([['b', 'a', 'c']])
  })

  it('memotong per 60 id', () => {
    const ids = Array.from({ length: 130 }, (_, i) => `e${i}`)
    const out = chunkIds(ids)
    expect(SIGNED_BATCH_MAX).toBe(60)
    expect(out.map((c) => c.length)).toEqual([60, 60, 10])
    expect(out.flat()).toEqual(ids)
  })

  it('batas tidak sah dianggap 1; daftar kosong → tanpa kiriman', () => {
    expect(chunkIds(['a', 'b'], 0)).toEqual([['a'], ['b']])
    expect(chunkIds([])).toEqual([])
  })
})

describe('mergeSigned', () => {
  it('memasangkan hasil, menandai yang hilang, mengabaikan id asing/tanpa URL', () => {
    const { found, missing } = mergeSigned(
      ['a', 'b', 'c', 'd'],
      {
        items: [
          { id: 'a', url: 'https://s/a', kind: 'file' },
          { id: 'b', url: 'https://luar/b', kind: 'link' },
          { id: 'x', url: 'https://s/x', kind: 'file' },
          { id: 'c', url: '' },
          null,
          { id: 'a', url: 'https://s/a-ganda' },
        ],
      },
      1000,
      50
    )
    expect([...found.keys()]).toEqual(['a', 'b'])
    expect(found.get('a')).toEqual({ url: 'https://s/a', kind: 'file', until: 1050 })
    expect(found.get('b')?.kind).toBe('link')
    expect(missing).toEqual(['c', 'd'])
  })

  it('balasan rusak → semua hilang', () => {
    expect(mergeSigned(['a'], null, 0).missing).toEqual(['a'])
    expect(mergeSigned(['a'], { items: 'x' }, 0).missing).toEqual(['a'])
  })

  it('GET tunggal & status cadangan', () => {
    expect(signedFromSingle(true, { url: 'u', kind: 'link' }, 10, 5)).toEqual({ url: 'u', kind: 'link', until: 15 })
    expect(signedFromSingle(false, { url: 'u' }, 0)).toBeNull()
    expect(signedFromSingle(true, {}, 0)).toBeNull()
    expect(batchUnsupported(404)).toBe(true)
    expect(batchUnsupported(405)).toBe(true)
    expect(batchUnsupported(503)).toBe(false)
  })
})

/* ---------- Pengambil berkelompok ---------- */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function harness(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const queue: Array<() => void> = []
  const fetch = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  let clock = 1_000
  const f = createSignedFetcher({ fetch, schedule: (run) => queue.push(run), now: () => clock })
  const tick = async () => {
    while (queue.length) queue.shift()!()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
  }
  return { f, fetch, tick, advance: (ms: number) => (clock += ms) }
}

const signedReply = (init?: RequestInit) => {
  const { ids } = JSON.parse(String(init?.body)) as { ids: string[] }
  return json(200, { items: ids.filter((id) => !id.startsWith('tolak')).map((id) => ({ id, url: `https://s/${id}`, kind: 'file' })) })
}

describe('createSignedFetcher', () => {
  it('menggabungkan permintaan satu tick menjadi satu POST berheader JSON', async () => {
    const h = harness((url, init) => signedReply(init))
    const pa = h.f.get('a')
    const pb = h.f.get('b')
    const pa2 = h.f.get('a')
    const pt = h.f.get('tolak-1')
    expect(pa2).toBe(pa)
    expect(h.fetch).not.toHaveBeenCalled()
    await h.tick()
    expect(h.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = h.fetch.mock.calls[0]
    expect(url).toBe('/api/evidence/signed')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({ ids: ['a', 'b', 'tolak-1'] })
    expect((await pa)?.url).toBe('https://s/a')
    expect((await pb)?.url).toBe('https://s/b')
    expect(await pt).toBeNull()
  })

  it('memakai cache sampai TTL habis; id gagal diminta ulang', async () => {
    const h = harness((url, init) => signedReply(init))
    h.f.get('a')
    h.f.get('tolak-1')
    await h.tick()
    expect(h.f.peek('a')?.until).toBe(1_000 + SIGNED_TTL_MS)
    expect((await h.f.get('a'))?.url).toBe('https://s/a')
    h.f.get('tolak-1')
    await h.tick()
    expect(h.fetch).toHaveBeenCalledTimes(2)
    h.advance(SIGNED_TTL_MS + 1)
    expect(h.f.peek('a')).toBeNull()
    h.f.get('a')
    await h.tick()
    expect(h.fetch).toHaveBeenCalledTimes(3)
  })

  it('memecah lebih dari 60 id menjadi beberapa POST', async () => {
    const h = harness((url, init) => signedReply(init))
    const ps = Array.from({ length: 125 }, (_, i) => h.f.get(`e${i}`))
    await h.tick()
    expect(h.fetch).toHaveBeenCalledTimes(3)
    const sizes = h.fetch.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { ids: string[] }).ids.length)
    expect(sizes).toEqual([60, 60, 5])
    const out = await Promise.all(ps)
    expect(out.every((s) => s?.url.startsWith('https://s/e'))).toBe(true)
  })

  it('endpoint 404/405 → GET per id, dan kiriman berikutnya langsung GET', async () => {
    const h = harness((url) => {
      if (url === '/api/evidence/signed') return json(405, { error: 'Metode tidak didukung' })
      const id = decodeURIComponent(url.split('/').pop()!)
      return id === 'hilang' ? json(404, { error: 'Bukti tidak ditemukan' }) : json(200, { url: `https://g/${id}`, kind: 'link' })
    })
    const pa = h.f.get('a')
    const ph = h.f.get('hilang')
    await h.tick()
    expect(h.fetch.mock.calls.map(([u]) => u)).toEqual(['/api/evidence/signed', '/api/evidence/a', '/api/evidence/hilang'])
    expect(await pa).toMatchObject({ url: 'https://g/a', kind: 'link' })
    expect(await ph).toBeNull()
    h.f.get('b')
    await h.tick()
    expect(h.fetch.mock.calls.at(-1)?.[0]).toBe('/api/evidence/b')
    expect(h.fetch.mock.calls.filter(([u]) => u === '/api/evidence/signed')).toHaveLength(1)
  })

  it('jaringan gagal → GET per id, POST dicoba lagi di kiriman berikutnya', async () => {
    let first = true
    const h = harness((url, init) => {
      if (url === '/api/evidence/signed') {
        if (first) {
          first = false
          throw new TypeError('Failed to fetch')
        }
        return signedReply(init)
      }
      return json(200, { url: 'https://g/a' })
    })
    const pa = h.f.get('a')
    await h.tick()
    expect((await pa)?.url).toBe('https://g/a')
    h.f.get('b')
    await h.tick()
    expect(h.fetch.mock.calls.at(-1)?.[0]).toBe('/api/evidence/signed')
  })

  it('galat lain (503) → semua id di kiriman gagal tanpa GET', async () => {
    const h = harness(() => json(503, { error: 'Penyimpanan belum aktif' }))
    const pa = h.f.get('a')
    const pb = h.f.get('b')
    await h.tick()
    expect(await pa).toBeNull()
    expect(await pb).toBeNull()
    expect(h.fetch).toHaveBeenCalledTimes(1)
  })

  it('balasan bukan JSON → gagal, janji tetap selesai', async () => {
    const h = harness(() => new Response('<html>', { status: 200 }))
    const pa = h.f.get('a')
    await h.tick()
    expect(await pa).toBeNull()
  })
})
