import { describe, expect, it, vi } from 'vitest'

/**
 * Logika layar Admin subholding (kontrak 16 Okt 2026, docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md):
 *  - validasi form Tambah laporan (semua isian * wajib, bukti minimal 1, batas panjang);
 *  - alur simpan → unggah bukti: sukses, gagal sebagian (laporan tetap tersimpan), gagal simpan, mode ubah (PATCH);
 *  - saringan riwayat & periode WIB;
 *  - CSV (kutip, BOM, penjaga injeksi rumus);
 *  - gabungan kotak masuk + saran pelapor + rincian laporan cadangan.
 * fetch disuntikkan — tidak ada jaringan/DB.
 */

import {
  EMPTY_FORM,
  csvCell,
  csvFileName,
  filterReports,
  formPayload,
  historyCsv,
  inboxEntries,
  lastSupervisorComment,
  loadReportDetail,
  periodRange,
  reportedPtCount,
  reporterSuggestions,
  submitReport,
  titleLabel,
  uploadAll,
  validateFile,
  validateForm,
  validateLink,
  wibDateKey,
  type PendingBukti,
  type ShForm,
} from '@/components/views/sh-admin/logic'
import type { ShReport } from '@/components/views/sh-admin/types'

const FULL: ShForm = {
  kegiatan: 'Pemasangan panel surya',
  deskripsi: 'Pemasangan 24 dari 40 panel.',
  ptId: 'pt-1',
  reporterName: 'Rudi Hartono',
  titleKind: 'MANAJER',
  titleField: 'Proyek',
}

function report(over: Partial<ShReport> = {}): ShReport {
  return {
    id: 'r1',
    subholdingId: 's1',
    subholdingName: 'Subholding A',
    ptId: 'pt-1',
    ptName: 'PT Satu',
    reportDate: '2026-10-15',
    kegiatan: 'Pemasangan panel surya',
    deskripsi: 'Pemasangan 24 panel',
    reporterName: 'Rudi Hartono',
    reporterTitleKind: 'MANAJER',
    reporterTitleField: 'Proyek',
    reporterTitle: 'Manajer Proyek',
    status: 'MENUNGGU',
    submittedAt: '2026-10-15T02:12:00.000Z',
    decidedAt: null,
    decidedByName: null,
    evidenceCount: 0,
    evidence: [],
    comments: [],
    canEdit: true,
    canWithdraw: true,
    ...over,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function fileItem(name: string, key = name): PendingBukti {
  const file = new File(['isi'], name, { type: 'image/jpeg' })
  return { key: 'k-' + key, kind: 'file', file, name, size: file.size, isImage: true }
}
function linkItem(name: string): PendingBukti {
  return { key: 'k-' + name, kind: 'link', name, url: 'https://contoh.id/' + name }
}

describe('validasi form Tambah laporan', () => {
  it('semua isian wajib dan bukti minimal 1', () => {
    const e = validateForm(EMPTY_FORM, 0)
    expect(Object.keys(e).sort()).toEqual(['bukti', 'deskripsi', 'kegiatan', 'ptId', 'reporterName', 'titleField'])
  })

  it('lolos bila lengkap dan ada satu bukti (baru atau sudah melekat)', () => {
    expect(validateForm(FULL, 1)).toEqual({})
    expect(validateForm(FULL, 0).bukti).toMatch(/minimal satu bukti/)
  })

  it('isian hanya spasi dianggap kosong; batas panjang ditegakkan', () => {
    expect(validateForm({ ...FULL, kegiatan: '   ' }, 1).kegiatan).toBeTruthy()
    expect(validateForm({ ...FULL, kegiatan: 'a'.repeat(201) }, 1).kegiatan).toMatch(/200/)
    expect(validateForm({ ...FULL, deskripsi: 'a'.repeat(4001) }, 1).deskripsi).toMatch(/4000/)
    expect(validateForm({ ...FULL, reporterName: 'a'.repeat(121) }, 1).reporterName).toMatch(/120/)
    expect(validateForm({ ...FULL, titleField: 'a'.repeat(81) }, 1).titleField).toMatch(/80/)
  })

  it('pratinjau jabatan "Manajer Proyek" dan payload dirapikan', () => {
    expect(titleLabel('MANAJER', ' Proyek ')).toBe('Manajer Proyek')
    expect(titleLabel('KEPALA', 'Keuangan  Cabang')).toBe('Kepala Keuangan Cabang')
    expect(titleLabel('KEPALA', '')).toBe('Kepala')
    expect(formPayload({ ...FULL, reporterName: '  Rudi   Hartono ' })).toEqual({
      kegiatan: 'Pemasangan panel surya',
      deskripsi: 'Pemasangan 24 dari 40 panel.',
      ptId: 'pt-1',
      reporterName: 'Rudi Hartono',
      reporterTitleKind: 'MANAJER',
      reporterTitleField: 'Proyek',
    })
  })

  it('berkas: kosong, >20 MB, dan jenis tak didukung ditolak', () => {
    expect(validateFile({ name: 'a.jpg', size: 10, type: 'image/jpeg' })).toBeNull()
    expect(validateFile({ name: 'a.pdf', size: 20 * 1024 * 1024, type: 'application/pdf' })).toBeNull()
    expect(validateFile({ name: 'b.jpg', size: 20 * 1024 * 1024 + 1, type: 'image/jpeg' })).toMatch(/20 MB/)
    expect(validateFile({ name: 'c.jpg', size: 0, type: 'image/jpeg' })).toMatch(/kosong/)
    expect(validateFile({ name: 'd.exe', size: 5, type: 'application/x-msdownload' })).toMatch(/tidak didukung/)
  })

  it('tautan harus http(s)', () => {
    expect(validateLink('', 'https://drive.contoh.id/x')).toBeNull()
    expect(validateLink('Foto', 'ftp://x')).toMatch(/http/)
    expect(validateLink('Foto', '')).toMatch(/Isi alamat/)
  })
})

describe('alur simpan → unggah bukti', () => {
  it('sukses: POST laporan dengan Idempotency-Key lalu unggah berkas & tautan ke laporan itu', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url === '/api/sh/reports') return json({ report: report() }, 201)
      return json({ evidence: { id: 'e' } }, 201)
    })
    const progress: number[] = []
    const res = await submitReport({
      fetchImpl,
      form: FULL,
      bukti: [fileItem('a.jpg'), linkItem('drive')],
      idempotencyKey: 'shr-abcdef123456',
      onProgress: (d) => progress.push(d),
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.uploaded).toHaveLength(2)
    expect(res.failed).toHaveLength(0)
    expect(progress).toEqual([1, 2])
    expect(calls.map((c) => c.url)).toEqual(['/api/sh/reports', '/api/evidence/upload', '/api/evidence'])
    expect(calls[0].init?.method).toBe('POST')
    expect((calls[0].init?.headers as Record<string, string>)['Idempotency-Key']).toBe('shr-abcdef123456')
    const fd = calls[1].init?.body as FormData
    expect(fd.get('targetType')).toBe('SUBHOLDING_REPORT')
    expect(fd.get('targetId')).toBe('r1')
    expect(JSON.parse(String(calls[2].init?.body))).toMatchObject({ targetType: 'SUBHOLDING_REPORT', targetId: 'r1', fileName: 'drive' })
  })

  it('gagal sebagian: laporan tetap tersimpan, bukti yang gagal dilaporkan beserta alasannya', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/sh/reports') return json({ report: report() }, 201)
      const name = (init?.body as FormData).get('file') as File
      if (name.name === 'besar.jpg') return json({ error: 'Ukuran berkas melebihi 20 MB' }, 413)
      return json({ evidence: { id: 'e' } }, 201)
    })
    const res = await submitReport({ fetchImpl, form: FULL, bukti: [fileItem('a.jpg'), fileItem('besar.jpg'), fileItem('c.jpg')] })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.report.id).toBe('r1')
    expect(res.uploaded.map((u) => u.name)).toEqual(['a.jpg', 'c.jpg'])
    expect(res.failed).toEqual([{ item: expect.objectContaining({ name: 'besar.jpg' }), error: 'Ukuran berkas melebihi 20 MB' }])
  })

  it('jaringan putus saat unggah tidak menghentikan bukti berikutnya; unggah ulang memakai laporan yang sama', async () => {
    let n = 0
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
      n += 1
      if (n === 1) throw new TypeError('Failed to fetch')
      return json({ evidence: { id: 'e' + n } }, 201)
    })
    const out = await uploadAll(fetchImpl, 'r9', [fileItem('a.jpg'), fileItem('b.jpg')])
    expect(out.failed.map((f) => f.item.name)).toEqual(['a.jpg'])
    expect(out.failed[0].error).toMatch(/Tidak dapat menghubungi server/)
    const again = await uploadAll(fetchImpl, 'r9', out.failed.map((f) => f.item))
    expect(again.failed).toHaveLength(0)
    expect(((fetchImpl.mock.calls.at(-1)?.[1] as RequestInit).body as FormData).get('targetId')).toBe('r9')
  })

  it('laporan gagal disimpan: tidak ada unggahan, galat server diteruskan', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 'PT pelaksana harus PT aktif di subholding Anda', field: 'ptId' }, 422))
    const res = await submitReport({ fetchImpl, form: FULL, bukti: [fileItem('a.jpg')] })
    expect(res).toEqual({ ok: false, error: 'PT pelaksana harus PT aktif di subholding Anda' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('mode ubah: PATCH /api/sh/reports/:id tanpa Idempotency-Key, bukti baru diunggah ke laporan itu', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.startsWith('/api/sh/reports/')) return json({ report: report({ id: 'r7', status: 'MENUNGGU' }) })
      return json({ evidence: { id: 'e' } }, 201)
    })
    const res = await submitReport({ fetchImpl, form: FULL, bukti: [fileItem('baru.jpg')], editId: 'r7', idempotencyKey: 'shr-abcdef123456' })
    expect(res.ok).toBe(true)
    expect(calls[0].url).toBe('/api/sh/reports/r7')
    expect(calls[0].init?.method).toBe('PATCH')
    expect((calls[0].init?.headers as Record<string, string>)['Idempotency-Key']).toBeUndefined()
    expect((calls[1].init?.body as FormData).get('targetId')).toBe('r7')
  })

  it('balasan tanpa laporan dianggap gagal', async () => {
    const res = await submitReport({ fetchImpl: async () => json({}, 201), form: FULL, bukti: [] })
    expect(res.ok).toBe(false)
  })
})

describe('riwayat: periode WIB & saringan', () => {
  it('tanggal WIB: 17.30 UTC = hari berikutnya di WIB', () => {
    expect(wibDateKey(new Date('2026-10-15T17:30:00Z'))).toBe('2026-10-16')
    expect(wibDateKey('2026-10-15T16:59:00Z')).toBe('2026-10-15')
  })

  it('rentang inklusif hari ini / 7 / 30 hari', () => {
    const now = new Date('2026-10-15T03:00:00Z')
    expect(periodRange('today', now)).toEqual({ from: '2026-10-15', to: '2026-10-15' })
    expect(periodRange('7', now)).toEqual({ from: '2026-10-09', to: '2026-10-15' })
    expect(periodRange('30', now)).toEqual({ from: '2026-09-16', to: '2026-10-15' })
  })

  it('saring PT, status, kata kunci (kegiatan/deskripsi/pelapor), terbaru di atas', () => {
    const items = [
      report({ id: 'a', ptId: 'pt-1', status: 'DISETUJUI', kegiatan: 'Audit stok', submittedAt: '2026-10-14T01:00:00Z' }),
      report({ id: 'b', ptId: 'pt-2', status: 'MENUNGGU', kegiatan: 'Rapat vendor', submittedAt: '2026-10-15T01:00:00Z' }),
      report({ id: 'c', ptId: 'pt-1', status: 'MENUNGGU', kegiatan: 'Inspeksi K3', reporterName: 'Dedi Saputra', submittedAt: '2026-10-15T05:00:00Z' }),
    ]
    expect(filterReports(items, {}).map((r) => r.id)).toEqual(['c', 'b', 'a'])
    expect(filterReports(items, { ptId: 'pt-1' }).map((r) => r.id)).toEqual(['c', 'a'])
    expect(filterReports(items, { status: 'MENUNGGU' }).map((r) => r.id)).toEqual(['c', 'b'])
    expect(filterReports(items, { q: 'dedi' }).map((r) => r.id)).toEqual(['c'])
    expect(filterReports(items, { q: '  VENDOR ' }).map((r) => r.id)).toEqual(['b'])
    expect(filterReports(items, { ptId: 'pt-2', status: 'DISETUJUI' })).toEqual([])
  })
})

describe('CSV riwayat', () => {
  it('sel dikutip, kutip digandakan, rumus dinetralkan', () => {
    expect(csvCell('biasa')).toBe('"biasa"')
    expect(csvCell('kata "kutip"')).toBe('"kata ""kutip"""')
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`)
    expect(csvCell('-5')).toBe(`"'-5"`)
    expect(csvCell(null)).toBe('""')
    expect(csvCell(3)).toBe('"3"')
  })

  it('BOM + kepala + satu baris per laporan, CRLF, waktu WIB, label status', () => {
    const csv = historyCsv([
      report({
        status: 'DISETUJUI',
        evidenceCount: 3,
        deskripsi: 'Baris 1, dengan koma\nbaris 2',
        decidedByName: 'Bu Direksi',
        decidedAt: '2026-10-15T02:40:00Z',
      }),
    ])
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines[0]).toContain('"Kegiatan / proyek"')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('"2026-10-15","2026-10-15 09:12","Pemasangan panel surya"')
    expect(lines[1]).toContain('"Baris 1, dengan koma\nbaris 2"')
    expect(lines[1]).toContain('"Manajer Proyek","3","Disetujui","Bu Direksi","2026-10-15 09:40"')
  })

  it('nama berkas mengikuti rentang', () => {
    expect(csvFileName('2026-10-15', '2026-10-15')).toBe('riwayat-laporan-2026-10-15.csv')
    expect(csvFileName('2026-10-09', '2026-10-15')).toBe('riwayat-laporan-2026-10-09_2026-10-15.csv')
  })
})

describe('kotak masuk, saran pelapor, rincian laporan', () => {
  it('pesan + pengingat digabung, terbaru di atas', () => {
    const rep = { id: 'r1', kegiatan: 'K', ptName: 'PT', status: 'PERLU_PERBAIKAN' as const, reporterName: 'A', reporterTitle: 'Manajer X', submittedAt: null, evidenceCount: 1 }
    const list = inboxEntries({
      items: [
        { id: 'm1', kind: 'PERBAIKAN', body: 'Tambah foto', createdAt: '2026-10-15T04:00:00Z', unread: true, authorName: 'Sup', report: rep },
        { id: 'm2', kind: 'SETUJU', body: 'Bagus', createdAt: '2026-10-15T02:00:00Z', unread: false, authorName: 'Sup', report: rep },
      ],
      reminders: [{ id: 'p1', text: 'PT A5 belum melapor', createdAt: '2026-10-15T03:00:00Z' }],
    })
    expect(list.map((e) => e.key)).toEqual(['m:m1', 'r:p1', 'm:m2'])
    expect(list[0].unread).toBe(true)
    expect(list[1].type).toBe('pengingat')
  })

  it('komentar supervisor terakhir mengabaikan balasan admin', () => {
    const c = (id: string, at: string, mine: boolean, kind: any = 'KOMENTAR') => ({ id, kind, body: id, authorName: 'x', authorRole: 'x', createdAt: at, mine })
    expect(lastSupervisorComment({ comments: [c('a', '2026-10-15T01:00:00Z', false, 'PERBAIKAN'), c('b', '2026-10-15T02:00:00Z', true, 'BALASAN')] })?.id).toBe('a')
    expect(lastSupervisorComment({ comments: [] })).toBeNull()
  })

  it('saran pelapor: yang diingat lebih dulu, unik, paling banyak 8', () => {
    const server = Array.from({ length: 10 }, (_, i) => ({ name: 'Orang ' + i, titleKind: 'KEPALA' as const, titleField: 'Bidang' }))
    const out = reporterSuggestions([{ name: 'orang 0', titleKind: 'KEPALA', titleField: 'bidang' }, ...server], { name: 'Rudi', titleKind: 'MANAJER', titleField: 'Proyek' })
    expect(out).toHaveLength(8)
    expect(out[0].name).toBe('Rudi')
    expect(out.filter((r) => r.name.toLowerCase() === 'orang 0')).toHaveLength(1)
  })

  it('rincian: pakai GET per id bila ada, bila tidak cari lewat daftar', async () => {
    const direct = vi.fn(async () => json({ report: report({ id: 'r1' }) }))
    expect((await loadReportDetail(direct, 'r1'))?.id).toBe('r1')

    const urls: string[] = []
    const fallback = vi.fn(async (url: string) => {
      urls.push(url)
      if (url === '/api/sh/reports/r2') return json({ error: 'Tidak ditemukan' }, 404)
      return json({ items: [report({ id: 'r1' }), report({ id: 'r2' })], total: 2 })
    })
    const r = await loadReportDetail(fallback, 'r2', { kegiatan: 'Panel', submittedAt: '2026-10-10T02:00:00Z' }, new Date('2026-10-15T03:00:00Z'))
    expect(r?.id).toBe('r2')
    expect(urls[1]).toContain('from=2026-09-10')
    expect(urls[1]).toContain('to=2026-10-15')
    expect(urls[1]).toContain('q=Panel')
  })
})

describe('dashboard: PT yang sudah melapor', () => {
  it('menghitung PT unik milik subholding, bukan jumlah laporan', () => {
    const pts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(reportedPtCount([{ ptId: 'a' }, { ptId: 'a' }, { ptId: 'b' }], pts)).toBe(2)
    expect(reportedPtCount([], pts)).toBe(0)
    // PT yang sudah dipindah keluar subholding tidak ikut dihitung.
    expect(reportedPtCount([{ ptId: 'x' }, { ptId: 'c' }], pts)).toBe(1)
  })
})
